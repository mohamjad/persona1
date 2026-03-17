import test from "node:test";
import assert from "node:assert/strict";
import { runBranchIntelligence } from "../../dist/packages/branch-intelligence/src/index.js";
import { createBootstrapPersonaProfile } from "../../dist/packages/persona-engine/src/index.js";
import { buildScoringConfig, evaluateDraftWithConfig } from "../../dist/packages/scoring-engine/src/index.js";

test("runBranchIntelligence enriches branches with lookahead and keeps exactly one recommendation", async () => {
  const context = {
    recipientName: "Avery",
    recipientHandle: null,
    communicationStyle: "professional",
    emotionalStateSignals: [],
    relationshipType: "colleague",
    platform: "linkedin",
    threadSummary: "They asked for the short version first.",
    recipientLastMessage: "Can you send the short version first?",
    inferredWants: "clarity",
    inferredConcerns: "time cost and ambiguity",
    contextConfidence: 84,
    currentConversationSummary: "They asked for the short version first.",
    conversationGoalHint: "earn the next step by reducing pressure",
    dialogueState: "needs_clarity"
  };
  const personaProfile = createBootstrapPersonaProfile({ coldStartContext: "professional" });
  const scoringConfig = buildScoringConfig({
    draft: "just checking in on this",
    preset: "pitch",
    personaProfile,
    context
  });
  const draftAssessment = await evaluateDraftWithConfig({
    draft: "just checking in on this",
    config: scoringConfig
  });

  const result = await runBranchIntelligence({
    branchTree: {
      situationRead: "they want a shorter version before deciding whether to keep going",
      contextEvidence: ["they asked for the short version first"],
      toneTarget: "direct and competent",
      primaryGoal: "get clarity",
      draftAssessment,
      branches: [
        {
          optionId: 1,
          isRecommended: true,
          annotation: "!",
          outcomeLabel: "get clarity",
          moveLabel: "tighten the ask",
          message: "want the one-line version or the two-minute version?",
          predictedResponse: "they will choose the format instead of dodging again",
          opponentMoveType: "bounded choice",
          branchPath: "they pick a lane and the thread stays moving",
          strategicPayoff: "turns the next reply into a concrete choice",
          goalAlignmentScore: 82,
          whyItWorks: "it makes the next move small",
          risk: null
        },
        {
          optionId: 2,
          isRecommended: false,
          annotation: "!?",
          outcomeLabel: "test intent",
          moveLabel: "qualify interest",
          message: "before i write more, are you actually evaluating this or just curious?",
          predictedResponse: "they may clarify intent, but they may also feel pressed",
          opponentMoveType: "intent test",
          branchPath: "you either get honesty or create friction",
          strategicPayoff: "surfaces whether there is real buying energy",
          goalAlignmentScore: 68,
          whyItWorks: "it forces intent into the open",
          risk: "can feel sharp if the read is wrong"
        },
        {
          optionId: 3,
          isRecommended: false,
          annotation: "?",
          outcomeLabel: "soft reopen",
          moveLabel: "generic follow-up",
          message: "just checking in to see if you had any thoughts on this",
          predictedResponse: "they will probably ignore it or send a vague maybe later",
          opponentMoveType: "generic reopen",
          branchPath: "the thread stays ambiguous",
          strategicPayoff: "keeps the thread alive with minimal risk",
          goalAlignmentScore: 42,
          whyItWorks: "it preserves politeness",
          risk: "easy to ignore"
        }
      ]
    },
    context,
    preset: "pitch",
    draft: "just checking in on this",
    personaProfile,
    scoringConfig,
    draftAssessment,
    relevantMemories: ["bounded choices tend to convert better in professional threads"]
  });

  assert.equal(result.branches.filter((branch) => branch.isRecommended).length, 1);
  assert.ok(result.branches.every((branch) => typeof branch.lookaheadSummary === "string"));
  assert.ok(result.branches.every((branch) => typeof branch.lookaheadScore === "number"));
});
