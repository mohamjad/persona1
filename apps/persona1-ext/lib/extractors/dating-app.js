import { normalizeComposeValue, summarizeThreadText } from "../page-snapshot.js";

export function extractDatingAppContext(doc = document) {
  const onDatingApp = /(bumble|hinge|tinder|feeld)/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector("textarea") ||
    doc.querySelector('[contenteditable="true"][role="textbox"]');

  if (!onDatingApp || !composeTarget) {
    return null;
  }

  const recipientName =
    doc.querySelector("header h1, header h2, [data-testid='profile-name']")?.textContent?.trim() || null;

  return {
    platform: "dating_app",
    composeDetected: true,
    composeSelector: composeTarget.tagName.toLowerCase(),
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: null,
    relationshipType: "romantic",
    communicationStyle: "warm",
    emotionalStateSignals: [],
    inferredWants: "ease, confidence, and spark without pressure",
    inferredConcerns: "awkwardness, over-investment, and generic lines",
    threadSummary: summarizeThreadText(document.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 58
  };
}
