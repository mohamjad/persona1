export function deriveCommunicationScorecard(input) {
  const interactionLog = input.interactionLog || [];
  const persona = input.persona || null;
  const outcomeEvents = interactionLog.filter((entry) => entry.type === "outcome");
  const positive = outcomeEvents.filter((entry) => entry.outcome === "positive").length;
  const negative = outcomeEvents.filter((entry) => entry.outcome === "negative").length;
  const selectedRecommended = interactionLog.filter((entry) => entry.chosenOptionId === 1).length;
  const editedCount = interactionLog.filter(
    (entry) => entry.draftFinal && entry.draftRaw && entry.draftFinal !== entry.draftRaw
  ).length;

  const totalOutcomes = outcomeEvents.length || 1;
  const totalSelections = interactionLog.length || 1;

  return {
    clarity: clamp(Math.round((editedCount / totalSelections) * 100) + 45, 20, 96),
    strategicDiscipline: clamp(Math.round((selectedRecommended / totalSelections) * 100), 10, 98),
    landingRate: clamp(Math.round((positive / totalOutcomes) * 100), 0, 100),
    volatility: clamp(Math.round((negative / totalOutcomes) * 100), 0, 100),
    learningPhase: persona?.learningPhase || "observation",
    headline: buildHeadline({
      positive,
      negative,
      selectedRecommended,
      totalSelections,
      learningPhase: persona?.learningPhase || "observation"
    })
  };
}

export function formatScorecardForSharing(scorecard) {
  return [
    "persona1 communication scorecard",
    `clarity: ${scorecard.clarity}`,
    `strategic discipline: ${scorecard.strategicDiscipline}`,
    `landing rate: ${scorecard.landingRate}`,
    `volatility: ${scorecard.volatility}`,
    `phase: ${scorecard.learningPhase}`,
    scorecard.headline
  ].join("\n");
}

function buildHeadline(input) {
  if (input.learningPhase === "mirror_activation") {
    return "The system has enough evidence to reflect recurring communication patterns back to you.";
  }

  if (input.positive > input.negative && input.selectedRecommended / Math.max(input.totalSelections, 1) > 0.5) {
    return "Your best results are coming from cleaner, lower-noise branches.";
  }

  if (input.negative > input.positive) {
    return "The current pattern suggests friction after the send. Tighten clarity before adding more force.";
  }

  return "The score is still stabilizing. More sends and outcomes will sharpen the mirror.";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
