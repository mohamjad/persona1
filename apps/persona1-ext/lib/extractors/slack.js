import { normalizeComposeValue, summarizeThreadText } from "../page-snapshot.js";

export function extractSlackContext(doc = document) {
  const onSlack = /app\.slack\.com$/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector('[data-qa="message_input"] [contenteditable="true"]') ||
    doc.querySelector('[data-qa="message_input"]');

  if (!onSlack || !composeTarget) {
    return null;
  }

  const recipientName =
    doc.querySelector('[data-qa="channel_header_title"]')?.textContent?.trim() ||
    doc.querySelector('[data-qa="channel_name"]')?.textContent?.trim() ||
    null;

  return {
    platform: "slack",
    composeDetected: true,
    composeSelector: '[data-qa="message_input"]',
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: recipientName,
    relationshipType: "colleague",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clear, low-friction coordination",
    inferredConcerns: "noise and ambiguity",
    threadSummary: summarizeThreadText(document.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 70
  };
}
