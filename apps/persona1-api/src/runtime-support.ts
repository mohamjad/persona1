import fs from "node:fs/promises";
import path from "node:path";
import type { Persona1RuntimeConfig } from "./config.js";
import type { PersonaShardRecord } from "../../../packages/db/src/index.js";

let seedFewShotExamplesPromise: Promise<void> | null = null;

export async function seedFewShotExamplesIfNeeded(config: Persona1RuntimeConfig) {
  if (seedFewShotExamplesPromise) {
    return seedFewShotExamplesPromise;
  }

  seedFewShotExamplesPromise = (async () => {
    const existing = await config.repository.listFewShotExamples();
    if (existing.length > 0) {
      return;
    }

    const sourcePath = path.resolve("C:/Users/moham/persona1/businesses/persona1/few-shot/examples.json");
    const raw = await fs.readFile(sourcePath, "utf8").catch(() => "[]");
    const examples = JSON.parse(raw) as Array<{
      id: string;
      preset: string;
      archetype?: string;
      scenario: string;
      message: string;
      outcome?: string;
      whyItWorked: string;
    }>;

    await config.repository.saveFewShotExamples(
      examples.map((example) => ({
        exampleId: example.id,
        preset: example.preset,
        recipientArchetype: example.archetype ?? null,
        situationDescription: example.scenario,
        exampleContent: example.message,
        outcomeSignal: example.outcome ?? null,
        source: example.whyItWorked,
        embedding: null,
        createdAt: new Date().toISOString()
      }))
    );
  })();

  return seedFewShotExamplesPromise;
}

export function shouldSurfaceMirrorInsights(profile: { interactionCount: number }) {
  return profile.interactionCount > 0 && profile.interactionCount % 25 === 0;
}

export async function syncUserLearningState(input: {
  config: Persona1RuntimeConfig;
  userId: string;
  profile: { performanceRating?: { mu: number; sigma: number; ordinal: number; matches: number } };
  now: string;
}) {
  const user = await input.config.repository.getUser(input.userId);
  if (!user) {
    return;
  }

  await input.config.repository.saveUser({
    ...user,
    performanceMu: input.profile.performanceRating?.mu ?? user.performanceMu,
    performanceSigma: input.profile.performanceRating?.sigma ?? user.performanceSigma,
    performanceOrdinal: input.profile.performanceRating?.ordinal ?? user.performanceOrdinal,
    performanceMatches: input.profile.performanceRating?.matches ?? user.performanceMatches,
    updatedAt: input.now
  });
}

export function buildPersonaShards(input: {
  userId: string;
  profile: {
    communicationDefaults: Record<string, string>;
    observedPatterns: Array<{ pattern: string; count: number; confidence: number }>;
    knownStrengths: string[];
    knownWeaknesses: string[];
    platformCalibration: Record<string, { toneShift: string; confidence: number }>;
  };
  now: string;
}): PersonaShardRecord[] {
  const shards: PersonaShardRecord[] = [];
  const pushShard = (shard: Omit<PersonaShardRecord, "userId" | "createdAt" | "updatedAt">) => {
    shards.push({
      ...shard,
      userId: input.userId,
      createdAt: input.now,
      updatedAt: input.now
    });
  };

  pushShard({
    shardId: `${input.userId}_defaults`,
    shardType: "defaults",
    content: JSON.stringify(input.profile.communicationDefaults),
    embedding: null,
    platform: null,
    recipientArchetype: null,
    confidence: 0.6,
    dataPointCount: 1
  });

  for (const pattern of input.profile.observedPatterns.slice(0, 12)) {
    pushShard({
      shardId: `${input.userId}_pattern_${slugify(pattern.pattern)}`,
      shardType: "pattern",
      content: `${pattern.pattern} (count=${pattern.count}, confidence=${pattern.confidence})`,
      embedding: null,
      platform: null,
      recipientArchetype: null,
      confidence: pattern.confidence,
      dataPointCount: pattern.count
    });
  }

  for (const strength of input.profile.knownStrengths.slice(0, 4)) {
    pushShard({
      shardId: `${input.userId}_strength_${slugify(strength)}`,
      shardType: "strength",
      content: strength,
      embedding: null,
      platform: null,
      recipientArchetype: null,
      confidence: 0.7,
      dataPointCount: 1
    });
  }

  for (const weakness of input.profile.knownWeaknesses.slice(0, 4)) {
    pushShard({
      shardId: `${input.userId}_weakness_${slugify(weakness)}`,
      shardType: "weakness",
      content: weakness,
      embedding: null,
      platform: null,
      recipientArchetype: null,
      confidence: 0.65,
      dataPointCount: 1
    });
  }

  for (const [platform, calibration] of Object.entries(input.profile.platformCalibration).slice(0, 6)) {
    pushShard({
      shardId: `${input.userId}_platform_${slugify(platform)}`,
      shardType: "platform",
      content: calibration.toneShift,
      embedding: null,
      platform,
      recipientArchetype: null,
      confidence: calibration.confidence,
      dataPointCount: 1
    });
  }

  return shards;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "entry";
}
