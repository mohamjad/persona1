import crypto from "node:crypto";
import {
  MirrorInsightSchema,
  PersonaInteractionSchema,
  PersonaProfileSchema,
  type MirrorInsight,
  type PersonaInteraction,
  type PersonaProfile
} from "./schema.js";
import { updatePerformanceRating } from "../../rating-engine/src/index.js";

export interface PersonaUpdateResult {
  profile: PersonaProfile;
  mirrorInsights: MirrorInsight[];
}

export function applyDeterministicPersonaUpdate(input: {
  currentProfile: PersonaProfile;
  interaction: PersonaInteraction;
  now?: string;
}): PersonaUpdateResult {
  const profile = PersonaProfileSchema.parse(input.currentProfile);
  const interaction = PersonaInteractionSchema.parse(input.interaction);
  const now = input.now ?? new Date().toISOString();

  const nextPatterns = mergeObservedPatterns(profile, interaction, now);
  const nextInteractionCount = profile.interactionCount + 1;
  const nextPhase = deriveLearningPhase(nextInteractionCount);
  const outcomeKey =
    interaction.outcome === "positive"
      ? "positiveOutcomes"
      : interaction.outcome === "negative"
        ? "negativeOutcomes"
        : "neutral";
  const contextKey = `${interaction.platform}:${interaction.preset}`;
  const currentContextEntry = profile.contextPerformance[contextKey] ?? {
    positiveOutcomes: 0,
    negativeOutcomes: 0,
    neutral: 0
  };

  const nextProfile = PersonaProfileSchema.parse({
    ...profile,
    version: profile.version + 1,
    confidence: clamp(
      profile.confidence +
        (interaction.outcome === "positive"
          ? 0.03
          : interaction.outcome === "negative"
            ? -0.02
            : 0.01),
      0.05,
      0.95
    ),
    learningPhase: nextPhase,
    observedPatterns: nextPatterns,
    performanceRating: updatePerformanceRating({
      profile,
      interaction
    }),
    knownStrengths: summarizeStrengths(nextPatterns),
    knownWeaknesses: summarizeWeaknesses(nextPatterns),
    contextPerformance: {
      ...profile.contextPerformance,
      [contextKey]: {
        ...currentContextEntry,
        [outcomeKey]: currentContextEntry[outcomeKey] + 1
      }
    },
    platformCalibration: {
      ...profile.platformCalibration,
      [interaction.platform]: {
        toneShift: describePlatformShift(interaction.platform, interaction.outcome),
        confidence: clamp(profile.confidence + 0.05, 0.1, 0.95)
      }
    },
    lastUpdated: now,
    interactionCount: nextInteractionCount,
    lastMirrorAt: nextPhase === "mirror_activation" ? now : profile.lastMirrorAt
  });

  return {
    profile: nextProfile,
    mirrorInsights: deriveMirrorInsights({
      profile: nextProfile,
      now
    })
  };
}

export function deriveMirrorInsights(input: {
  profile: PersonaProfile;
  now?: string;
}): MirrorInsight[] {
  const profile = PersonaProfileSchema.parse(input.profile);
  const now = input.now ?? new Date().toISOString();

  return profile.observedPatterns
    .filter((pattern) => pattern.count >= 5 && pattern.confidence >= 0.45)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
    .map((pattern, index) =>
      MirrorInsightSchema.parse({
        insightId: `mir_${crypto
          .createHash("sha1")
          .update(`${pattern.pattern}:${pattern.count}:${index}`)
          .digest("hex")
          .slice(0, 12)}`,
        observation: createObservation(pattern.pattern),
        supportingPattern: pattern.pattern,
        evidenceCount: pattern.count,
        confidence: clamp(pattern.confidence, 0.3, 0.95),
        createdAt: now,
        status: "active"
      })
    );
}

export function createEmptyMirrorInsights(): MirrorInsight[] {
  return [];
}

export function mergePersonaProfiles(input: {
  localProfile: PersonaProfile;
  remoteProfile: PersonaProfile | null;
}): PersonaProfile {
  const localProfile = PersonaProfileSchema.parse(input.localProfile);
  const remoteProfile = input.remoteProfile ? PersonaProfileSchema.parse(input.remoteProfile) : null;

  if (!remoteProfile) {
    return localProfile;
  }

  const dominant =
    new Date(localProfile.lastUpdated).getTime() >= new Date(remoteProfile.lastUpdated).getTime()
      ? localProfile
      : remoteProfile;
  const secondary = dominant === localProfile ? remoteProfile : localProfile;
  const mergedPatterns = dominant.observedPatterns.map((pattern) => ({ ...pattern }));

  for (const secondaryPattern of secondary.observedPatterns) {
    const existing = mergedPatterns.find((pattern) => pattern.pattern === secondaryPattern.pattern);
    if (!existing) {
      mergedPatterns.push(secondaryPattern);
      continue;
    }

    existing.count += secondaryPattern.count;
    existing.confidence = clamp(Math.max(existing.confidence, secondaryPattern.confidence), 0, 1);
    existing.firstSeenAt =
      new Date(existing.firstSeenAt).getTime() <= new Date(secondaryPattern.firstSeenAt).getTime()
        ? existing.firstSeenAt
        : secondaryPattern.firstSeenAt;
    existing.lastSeenAt =
      new Date(existing.lastSeenAt).getTime() >= new Date(secondaryPattern.lastSeenAt).getTime()
        ? existing.lastSeenAt
        : secondaryPattern.lastSeenAt;
  }

  return PersonaProfileSchema.parse({
    ...dominant,
    observedPatterns: mergedPatterns.sort((left, right) => right.count - left.count),
    confidence: clamp(Math.max(localProfile.confidence, remoteProfile.confidence), 0, 1),
    interactionCount: Math.max(localProfile.interactionCount, remoteProfile.interactionCount),
    version: Math.max(localProfile.version, remoteProfile.version) + 1,
    knownStrengths: uniqueStrings([...localProfile.knownStrengths, ...remoteProfile.knownStrengths]),
    knownWeaknesses: uniqueStrings([...localProfile.knownWeaknesses, ...remoteProfile.knownWeaknesses]),
    contextPerformance: {
      ...remoteProfile.contextPerformance,
      ...localProfile.contextPerformance
    },
    platformCalibration: {
      ...remoteProfile.platformCalibration,
      ...localProfile.platformCalibration
    },
    lastUpdated:
      new Date(localProfile.lastUpdated).getTime() >= new Date(remoteProfile.lastUpdated).getTime()
        ? localProfile.lastUpdated
        : remoteProfile.lastUpdated
  });
}

function mergeObservedPatterns(profile: PersonaProfile, interaction: PersonaInteraction, now: string) {
  const nextPatterns = profile.observedPatterns.map((pattern) => ({ ...pattern }));
  const signals = dedupeStrings([
    ...interaction.observedSignals,
    interaction.draftFinal && interaction.draftFinal !== interaction.draftRaw ? "edited_before_send" : null,
    interaction.chosenOptionId === 1 ? "trusted_recommended_branch" : null,
    interaction.chosenOptionId === 3 ? "selected_high_risk_branch" : null,
    interaction.outcome === "positive" ? "positive_outcome" : null,
    interaction.outcome === "negative" ? "negative_outcome" : null
  ]);

  for (const signal of signals) {
    const existing = nextPatterns.find((pattern) => pattern.pattern === signal);
    if (!existing) {
      nextPatterns.push({
        pattern: signal,
        count: 1,
        confidence: interaction.outcome === "positive" ? 0.65 : 0.45,
        firstSeenAt: now,
        lastSeenAt: now
      });
      continue;
    }

    existing.count += 1;
    existing.confidence = clamp(
      existing.confidence +
        (interaction.outcome === "positive" ? 0.05 : interaction.outcome === "negative" ? -0.02 : 0.01),
      0.1,
      0.98
    );
    existing.lastSeenAt = now;
  }

  return nextPatterns.sort((left, right) => right.count - left.count).slice(0, 24);
}

function deriveLearningPhase(interactionCount: number) {
  if (interactionCount >= 25) {
    return "mirror_activation" as const;
  }

  if (interactionCount >= 8) {
    return "active_calibration" as const;
  }

  return "observation" as const;
}

function summarizeStrengths(patterns: PersonaProfile["observedPatterns"]) {
  return patterns
    .filter((pattern) => pattern.pattern.includes("positive") || pattern.pattern.includes("trusted"))
    .slice(0, 4)
    .map((pattern) => humanizeSignal(pattern.pattern));
}

function summarizeWeaknesses(patterns: PersonaProfile["observedPatterns"]) {
  return patterns
    .filter((pattern) => pattern.pattern.includes("negative") || pattern.pattern.includes("high_risk"))
    .slice(0, 4)
    .map((pattern) => humanizeSignal(pattern.pattern));
}

function describePlatformShift(platform: PersonaInteraction["platform"], outcome: PersonaInteraction["outcome"]) {
  const base =
    platform === "gmail"
      ? "leave more breathing room and clearer framing"
      : platform === "linkedin"
        ? "keep credibility high and avoid oversharing"
        : "stay concise and emotionally legible";

  if (outcome === "positive") {
    return `${base}; current tone is landing`;
  }

  if (outcome === "negative") {
    return `${base}; trim pressure and ambiguity`;
  }

  return base;
}

function createObservation(pattern: string) {
  if (pattern === "edited_before_send") {
    return "You routinely tighten the message before you commit. That usually means your first instinct is close, but too loose around the edges.";
  }

  if (pattern === "trusted_recommended_branch") {
    return "When the clearest branch is available, you usually take it. The issue is less courage and more seeing the board early enough.";
  }

  if (pattern === "selected_high_risk_branch") {
    return "You sometimes pick the branch that feels bolder even when the downstream path gets thinner.";
  }

  if (pattern === "negative_outcome") {
    return "A recurring pattern is friction after the send, not before it. That usually means the tone feels clearer to you than it lands to them.";
  }

  return `One recurring pattern: ${humanizeSignal(pattern)}. It is showing up often enough to treat as a real part of how you communicate.`;
}

function humanizeSignal(signal: string) {
  return signal.replaceAll("_", " ");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function dedupeStrings(values: Array<string | null>) {
  return values
    .filter((value): value is string => Boolean(value && value.length > 0))
    .filter((value, index, list) => list.indexOf(value) === index);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
