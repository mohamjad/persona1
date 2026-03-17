import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPerformanceRating,
  deriveRecipientDifficulty,
  updatePerformanceRating
} from "../../dist/packages/rating-engine/src/index.js";
import { createBootstrapPersonaProfile } from "../../dist/packages/persona-engine/src/index.js";

test("deriveRecipientDifficulty weights strangers and negotiation higher", () => {
  const low = deriveRecipientDifficulty({
    platform: "dating_app",
    preset: "date",
    relationshipType: "friend",
    contextConfidence: 85
  });
  const high = deriveRecipientDifficulty({
    platform: "linkedin",
    preset: "negotiate",
    relationshipType: "stranger",
    contextConfidence: 40
  });

  assert.ok(high > low);
});

test("updatePerformanceRating increases ordinal after positive outcome", () => {
  const persona = createBootstrapPersonaProfile({ coldStartContext: "professional" });
  const before = persona.performanceRating || defaultPerformanceRating();
  const after = updatePerformanceRating({
    profile: persona,
    interaction: {
      interactionId: "int_1",
      sessionId: "sess_1",
      platform: "linkedin",
      preset: "pitch",
      draftRaw: "hello",
      draftFinal: "want the short version or the two-minute version?",
      chosenOptionId: 1,
      optionRejectedIds: [2, 3],
      recipientContextHash: "ctx_1",
      outcome: "positive",
      observedSignals: []
    },
    relationshipType: "colleague",
    contextConfidence: 80
  });

  assert.ok(after.matches === before.matches + 1);
  assert.ok(after.mu >= before.mu);
});
