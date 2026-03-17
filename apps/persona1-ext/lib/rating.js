export function defaultPerformanceRating() {
  return {
    mu: 25,
    sigma: 8.333333333333334,
    ordinal: 0,
    matches: 0
  };
}

export function updatePerformanceRating({ persona, interaction, relationshipType, contextConfidence }) {
  const current = persona?.performanceRating || defaultPerformanceRating();
  const difficulty = deriveRecipientDifficulty({
    platform: interaction.platform,
    preset: interaction.preset,
    relationshipType,
    contextConfidence
  });

  const outcomeDelta =
    interaction.outcome === "positive" ? 1.25 : interaction.outcome === "negative" ? -1.15 : 0.2;
  const difficultyDelta = (difficulty - 25) / 10;
  const nextMu = clamp(current.mu + outcomeDelta + difficultyDelta, 5, 50);
  const nextSigma = clamp(current.sigma * (interaction.outcome === "positive" ? 0.97 : 1.01), 2.5, 8.333333333333334);
  const nextOrdinal = Number((nextMu - nextSigma * 3).toFixed(3));

  return {
    mu: Number(nextMu.toFixed(3)),
    sigma: Number(nextSigma.toFixed(3)),
    ordinal: nextOrdinal,
    matches: current.matches + 1
  };
}

function deriveRecipientDifficulty(input) {
  let difficulty = 25;
  if (input.relationshipType === "stranger") difficulty += 5;
  if (input.relationshipType === "romantic") difficulty += 3;
  if (input.platform === "linkedin" || input.platform === "gmail") difficulty += 2;
  if (input.preset === "negotiate" || input.preset === "confront") difficulty += 3;
  if (typeof input.contextConfidence === "number") {
    difficulty += input.contextConfidence < 50 ? 2 : input.contextConfidence > 80 ? -1 : 0;
  }
  return clamp(difficulty, 18, 38);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
