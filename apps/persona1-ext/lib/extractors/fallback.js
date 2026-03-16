import { normalizeComposeValue, summarizeThreadText } from "../page-snapshot.js";

export function extractFallbackContext(doc = document) {
  const active = doc.activeElement;
  const target =
    active && (active.tagName === "TEXTAREA" || active.isContentEditable)
      ? active
      : doc.querySelector("textarea, [contenteditable='true']");

  if (!target) {
    return null;
  }

  return {
    platform: "other",
    composeDetected: true,
    composeSelector: target.tagName.toLowerCase(),
    draft: normalizeComposeValue(target),
    recipientName: null,
    recipientHandle: null,
    relationshipType: "acquaintance",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clarity",
    inferredConcerns: "awkwardness and confusion",
    threadSummary: summarizeThreadText(doc.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 45
  };
}
