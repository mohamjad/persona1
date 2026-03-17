export function deriveLocalMirrorInsights(observationQueue) {
  const counts = new Map();

  for (const entry of observationQueue) {
    for (const signal of entry.observedSignals || []) {
      counts.set(signal, (counts.get(signal) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 5)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([signal, count], index) => ({
      insightId: `local_mirror_${index}_${signal}`,
      observation: createObservation(signal),
      supportingPattern: signal,
      evidenceCount: count,
      confidence: Math.min(0.35 + count * 0.1, 0.9),
      createdAt: new Date().toISOString(),
      status: "active"
    }));
}

function createObservation(signal) {
  if (signal === "edited_before_send") {
    return "You usually know the shape of the message fast. Most of the work happens in trimming what would have diluted it.";
  }

  if (signal === "trusted_recommended_branch") {
    return "When the cleanest branch is visible, you usually take it. The bottleneck is seeing it in time.";
  }

  if (signal === "negative_outcome") {
    return "A recurring pattern is friction after the send, which usually means the message felt clearer to you than it landed to them.";
  }

  return `A recurring pattern is ${signal.replaceAll("_", " ")}. It is showing up enough to treat as a real communication habit.`;
}
