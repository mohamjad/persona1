import { normalizeComposeValue, summarizeThreadText } from "../page-snapshot.js";

export function extractGmailContext(doc = document) {
  const onGmail = /mail\.google\.com$/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector('div[aria-label="Message Body"][contenteditable="true"]') ||
    doc.querySelector('div[role="textbox"][g_editable="true"]');

  if (!onGmail || !composeTarget) {
    return null;
  }

  const recipients = [...doc.querySelectorAll("span[email], input[aria-label='To recipients']")]
    .map((node) => node.getAttribute("email") || node.value || node.textContent || "")
    .map((value) => value.trim())
    .filter(Boolean);
  const threadRoot = composeTarget.closest(".nH") || doc.body;

  return {
    platform: "gmail",
    composeDetected: true,
    composeSelector: "div[aria-label='Message Body']",
    draft: normalizeComposeValue(composeTarget),
    recipientName: recipients[0] || null,
    recipientHandle: recipients[0] || null,
    relationshipType: "colleague",
    communicationStyle: "professional",
    emotionalStateSignals: [],
    inferredWants: "clarity and competence",
    inferredConcerns: "friction, ambiguity, and time cost",
    threadSummary: summarizeThreadText(threadRoot.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(threadRoot.innerText || "")) || null,
    contextConfidence: 84
  };
}

function findLastLine(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || "";
}
