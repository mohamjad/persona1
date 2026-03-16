import { normalizeComposeValue, summarizeThreadText } from "../page-snapshot.js";

export function extractLinkedInContext(doc = document) {
  const composeTarget =
    doc.querySelector('[contenteditable="true"][role="textbox"]') ||
    doc.querySelector("textarea[name='message']") ||
    doc.querySelector("textarea");
  const onLinkedIn = /linkedin\.com$/i.test(window.location.hostname);
  if (!onLinkedIn || !composeTarget) {
    return null;
  }

  const threadContainer = composeTarget.closest("[data-test-conversation-pane-wrapper], .msg-thread") || doc.body;
  const recipientName =
    doc.querySelector(".msg-thread__link-to-profile .t-16")?.textContent?.trim() ||
    doc.querySelector(".msg-s-message-group__name")?.textContent?.trim() ||
    null;

  return {
    platform: "linkedin",
    composeDetected: true,
    composeSelector: describeNode(composeTarget),
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: null,
    relationshipType: recipientName ? "colleague" : "acquaintance",
    communicationStyle: "professional",
    emotionalStateSignals: [],
    inferredWants: "a concise, competent, low-friction response",
    inferredConcerns: "time cost and vague asks",
    threadSummary: summarizeThreadText(threadContainer.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(threadContainer.innerText || "")) || null,
    contextConfidence: 78
  };
}

function findLastLine(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || "";
}

function describeNode(node) {
  return node.id ? `#${node.id}` : node.className ? `.${String(node.className).split(" ").filter(Boolean).join(".")}` : node.tagName.toLowerCase();
}
