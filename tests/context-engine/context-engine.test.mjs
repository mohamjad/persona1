import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyRecipientSentiment,
  enrichRecipientContext,
  extractStructuredFacts
} from "../../dist/packages/context-engine/src/index.js";

test("extractStructuredFacts captures dates, numbers, urls, and emails", () => {
  const facts = extractStructuredFacts(
    "Let's meet next Tuesday at 3pm. Budget is $2,500. Send it to avery@example.com and review https://example.com/deck."
  );

  assert.ok(facts.dates.length >= 1);
  assert.ok(facts.amounts.includes("$2,500"));
  assert.ok(facts.emails.includes("avery@example.com"));
  assert.ok(facts.urls.some((url) => url.includes("example.com")));
});

test("classifyRecipientSentiment falls back heuristically on direct rejection", async () => {
  const result = await classifyRecipientSentiment("Not now. I'm too busy and not interested.");
  assert.equal(result.label, "negative");
  assert.ok(result.confidence >= 0.55);
});

test("enrichRecipientContext produces dialogue state and combined summary", async () => {
  const enriched = await enrichRecipientContext({
    recipientName: "Avery",
    recipientHandle: null,
    communicationStyle: "professional",
    emotionalStateSignals: [],
    relationshipType: "colleague",
    platform: "gmail",
    threadSummary: "They asked for the short version and mentioned budget.",
    recipientLastMessage: "Can you send the short version first? Budget is tight this quarter.",
    inferredWants: "clarity",
    inferredConcerns: "time and budget",
    contextConfidence: 82
  });

  assert.equal(enriched.dialogueState, "pricing_friction");
  assert.equal(typeof enriched.combinedSummary, "string");
  assert.ok(enriched.structuredFacts.amounts.length >= 0);
});
