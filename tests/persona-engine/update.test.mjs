import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDeterministicPersonaUpdate,
  createBootstrapPersonaProfile,
  deriveMirrorInsights
} from "../../dist/packages/persona-engine/src/index.js";

test("persona update increments version and interaction counters", () => {
  const persona = createBootstrapPersonaProfile({
    coldStartContext: "professional",
    now: "2026-03-16T00:00:00.000Z"
  });
  const result = applyDeterministicPersonaUpdate({
    currentProfile: persona,
    interaction: {
      interactionId: "int_1",
      sessionId: "sess_1",
      platform: "linkedin",
      preset: "pitch",
      draftRaw: "hello",
      draftFinal: "hello there",
      chosenOptionId: 1,
      optionRejectedIds: [2, 3],
      recipientContextHash: "ctx_1",
      outcome: "positive",
      observedSignals: ["follow_up_question"]
    },
    now: "2026-03-16T00:10:00.000Z"
  });

  assert.equal(result.profile.version, 2);
  assert.equal(result.profile.interactionCount, 1);
  assert.equal(result.profile.learningPhase, "observation");
  assert.match(result.profile.platformCalibration.linkedin.toneShift, /landing|credibility/);
});

test("mirror insights only surface after stronger repeated evidence", () => {
  let persona = createBootstrapPersonaProfile({
    coldStartContext: "general",
    now: "2026-03-16T00:00:00.000Z"
  });

  for (let index = 0; index < 5; index += 1) {
    persona = applyDeterministicPersonaUpdate({
      currentProfile: persona,
      interaction: {
        interactionId: `int_${index}`,
        sessionId: "sess_1",
        platform: "gmail",
        preset: "negotiate",
        draftRaw: "draft",
        draftFinal: "draft refined",
        chosenOptionId: 1,
        optionRejectedIds: [2, 3],
        recipientContextHash: "ctx_repeat",
        outcome: "positive",
        observedSignals: ["edited_before_send"]
      },
      now: `2026-03-16T00:0${index}:00.000Z`
    }).profile;
  }

  const insights = deriveMirrorInsights({
    profile: persona,
    now: "2026-03-16T01:00:00.000Z"
  });

  assert.ok(insights.length >= 1);
  assert.match(insights[0].observation, /tighten|pattern|issue/i);
});
