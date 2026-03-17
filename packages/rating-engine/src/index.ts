import { rate, rating, ordinal } from "openskill";
import type { PersonaInteraction, PersonaProfile, PerformanceRating } from "../../persona-engine/src/schema.js";

export interface RecipientDifficultyInput {
  platform: PersonaInteraction["platform"];
  preset: PersonaInteraction["preset"];
  relationshipType?: "stranger" | "acquaintance" | "colleague" | "romantic" | "friend";
  contextConfidence?: number;
}

export function defaultPerformanceRating(): PerformanceRating {
  const base = rating();
  return {
    mu: base.mu,
    sigma: base.sigma,
    ordinal: ordinal(base),
    matches: 0
  };
}

export function deriveRecipientDifficulty(input: RecipientDifficultyInput): number {
  return deriveRecipientDifficultyInternal(input);
}

function deriveRecipientDifficultyInternal(input: RecipientDifficultyInput): number {
  let difficulty = 25;

  if (input.relationshipType === "stranger") difficulty += 5;
  if (input.relationshipType === "romantic") difficulty += 3;
  if (input.relationshipType === "friend") difficulty -= 2;

  if (input.platform === "linkedin" || input.platform === "gmail") difficulty += 2;
  if (input.platform === "dating_app") difficulty += 1;

  if (input.preset === "negotiate" || input.preset === "confront") difficulty += 3;
  if (input.preset === "decline" || input.preset === "close") difficulty += 1;

  if (typeof input.contextConfidence === "number") {
    difficulty += input.contextConfidence < 50 ? 2 : input.contextConfidence > 80 ? -1 : 0;
  }

  return Math.max(18, Math.min(38, difficulty));
}

export function updatePerformanceRating(input: {
  profile: PersonaProfile;
  interaction: PersonaInteraction;
  relationshipType?: RecipientDifficultyInput["relationshipType"];
  contextConfidence?: number;
}): PerformanceRating {
  const current = input.profile.performanceRating || defaultPerformanceRating();
  const self = rating({ mu: current.mu, sigma: current.sigma });
  const opponent = rating({
    mu: deriveRecipientDifficultyInternal({
      platform: input.interaction.platform,
      preset: input.interaction.preset,
      ...(input.relationshipType ? { relationshipType: input.relationshipType } : {}),
      ...(typeof input.contextConfidence === "number" ? { contextConfidence: input.contextConfidence } : {})
    }),
    sigma: 6
  });

  const scores =
    input.interaction.outcome === "positive"
      ? [1, 0]
      : input.interaction.outcome === "negative"
        ? [0, 1]
        : [1, 1];

  const [nextSelf] = rate([[self], [opponent]], { score: scores });
  const next = nextSelf?.[0] || self;

  return {
    mu: Number(next.mu.toFixed(3)),
    sigma: Number(next.sigma.toFixed(3)),
    ordinal: Number(ordinal(next).toFixed(3)),
    matches: current.matches + 1
  };
}
