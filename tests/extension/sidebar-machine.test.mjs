import test from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_STATES,
  createSidebarMachineState,
  transitionSidebarState
} from "../../apps/persona1-ext/lib/sidebar-machine.js";
import { deriveLocalMirrorInsights } from "../../apps/persona1-ext/lib/mirror.js";
import { deriveCommunicationScorecard } from "../../apps/persona1-ext/lib/scorecard.js";

test("sidebar machine allows valid transitions", () => {
  const initial = createSidebarMachineState();
  const composeDetected = transitionSidebarState(initial, SIDEBAR_STATES.composeDetected, {
    context: { platform: "linkedin" }
  });
  const ready = transitionSidebarState(composeDetected, SIDEBAR_STATES.contextReady, {
    context: { platform: "linkedin" }
  });

  assert.equal(ready.status, SIDEBAR_STATES.contextReady);
});

test("sidebar machine rejects invalid transitions", () => {
  assert.throws(
    () => transitionSidebarState(createSidebarMachineState(), SIDEBAR_STATES.branchesReady),
    /Invalid sidebar transition/
  );
});

test("local mirror insights require repeated signals", () => {
  const insights = deriveLocalMirrorInsights([
    { observedSignals: ["edited_before_send"] },
    { observedSignals: ["edited_before_send"] },
    { observedSignals: ["edited_before_send"] }
  ]);

  assert.equal(insights.length, 1);
  assert.match(insights[0].observation, /trim|pattern|work happens/i);
});

test("scorecard reflects local interaction patterns", () => {
  const scorecard = deriveCommunicationScorecard({
    persona: {
      learningPhase: "active_calibration"
    },
    interactionLog: [
      { type: "outcome", outcome: "positive", chosenOptionId: 1, draftRaw: "a", draftFinal: "b" },
      { type: "outcome", outcome: "negative", chosenOptionId: 3, draftRaw: "a", draftFinal: "a" },
      { type: "option_selected", chosenOptionId: 1, draftRaw: "a", draftFinal: "b" }
    ]
  });

  assert.equal(scorecard.learningPhase, "active_calibration");
  assert.ok(scorecard.clarity >= 20);
  assert.ok(scorecard.strategicDiscipline >= 10);
});
