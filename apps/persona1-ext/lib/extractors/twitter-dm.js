import { normalizeComposeValue, summarizeThreadText } from "../page-snapshot.js";

export function extractTwitterDmContext(doc = document) {
  const onX = /x\.com$/i.test(window.location.hostname) || /twitter\.com$/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector('[data-testid="dmComposerTextInput"][contenteditable="true"]') ||
    doc.querySelector('[data-testid="dmComposerTextInput"]');

  if (!onX || !composeTarget) {
    return null;
  }

  const threadRoot = composeTarget.closest('[data-testid="DMDrawer"]') || doc.body;
  const recipientName =
    doc.querySelector('[data-testid="DMConversationTitle"] span')?.textContent?.trim() || null;

  return {
    platform: "twitter",
    composeDetected: true,
    composeSelector: '[data-testid="dmComposerTextInput"]',
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: recipientName ? `@${recipientName.replace(/\s+/g, "").toLowerCase()}` : null,
    relationshipType: "acquaintance",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clarity and tone control",
    inferredConcerns: "awkwardness or pressure",
    threadSummary: summarizeThreadText(threadRoot.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(threadRoot.innerText || "")) || null,
    contextConfidence: 72
  };
}

function findLastLine(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || "";
}
