import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScoringConfig,
  evaluateDraftWithConfig,
  ScoringConfigSchema
} from "../../dist/packages/scoring-engine/src/index.js";
import { createBootstrapPersonaProfile } from "../../dist/packages/persona-engine/src/index.js";

test("buildScoringConfig produces a valid session config", () => {
  const config = buildScoringConfig({
    draft: "want the one-line version or the two-minute version?",
    preset: "pitch",
    personaProfile: createBootstrapPersonaProfile({ coldStartContext: "professional" }),
    context: {
      recipientName: "Avery",
      recipientHandle: null,
      communicationStyle: "professional",
      emotionalStateSignals: [],
      relationshipType: "colleague",
      platform: "linkedin",
      threadSummary: "They asked for the short version before committing to a meeting.",
      recipientLastMessage: "Can you send the short version first?",
      inferredWants: "clarity",
      inferredConcerns: "time cost",
      contextConfidence: 82,
      currentConversationSummary: "They asked for the short version first.",
      recentMessages: ["Can you send the short version first?"],
      conversationGoalHint: "earn the next step by making the ask simpler and lower-friction"
    }
  });

  const parsed = ScoringConfigSchema.parse(config);
  assert.match(parsed.primaryGoal, /next step|lower-friction/i);
  assert.equal(parsed.platform, "linkedin");
});

test("low-information drafts return a neutral dash state", async () => {
  const persona = createBootstrapPersonaProfile({ coldStartContext: "professional" });
  const config = buildScoringConfig({
    draft: "ok",
    preset: "pitch",
    personaProfile: persona,
    context: {
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
      recentMessages: ["Can you send the short version first?"],
      conversationGoalHint: "earn the next step by making the ask simpler and lower-friction"
    }
  });

  const result = await evaluateDraftWithConfig({
    draft: "ok",
    config
  });

  assert.equal(result.annotation, "-");
  assert.match(result.reason, /not enough signal|not enough draft/i);
});

test("same draft scores differently when the context changes", async () => {
  const persona = createBootstrapPersonaProfile({ coldStartContext: "general" });
  const draft = "just checking in to see if you had any thoughts on this";

  const professionalScore = await evaluateDraftWithConfig({
    draft,
    config: buildScoringConfig({
      draft,
      preset: "pitch",
      personaProfile: persona,
      context: {
        recipientName: "Avery",
        recipientHandle: null,
        communicationStyle: "professional",
        emotionalStateSignals: [],
        relationshipType: "colleague",
        platform: "gmail",
        threadSummary: "They asked for the short version first.",
        recipientLastMessage: "Send me the short version.",
        inferredWants: "clarity",
        inferredConcerns: "time cost and ambiguity",
        contextConfidence: 80,
        currentConversationSummary: "They asked for the short version first.",
        recentMessages: ["Send me the short version."],
        conversationGoalHint: "earn the next step by making the ask simpler and lower-friction"
      }
    })
  });

  const romanticScore = await evaluateDraftWithConfig({
    draft,
    config: buildScoringConfig({
      draft,
      preset: "date",
      personaProfile: persona,
      context: {
        recipientName: "Sam",
        recipientHandle: null,
        communicationStyle: "warm",
        emotionalStateSignals: [],
        relationshipType: "romantic",
        platform: "dating_app",
        threadSummary: "The thread is still light and not yet specific.",
        recipientLastMessage: "haha fair",
        inferredWants: "ease and spark",
        inferredConcerns: "pressure",
        contextConfidence: 65,
        currentConversationSummary: "The thread is still light and not yet specific.",
        recentMessages: ["haha fair"],
        conversationGoalHint: "create momentum without sounding over-invested"
      }
    })
  });

  assert.notEqual(professionalScore.score, romanticScore.score);
  assert.match(professionalScore.reason, /generic follow-up|initiative|vague/i);
});

test("bounded-choice drafts score better when the context is asking for clarity", async () => {
  const persona = createBootstrapPersonaProfile({ coldStartContext: "professional" });
  const config = buildScoringConfig({
    draft: "want the one-line version or the two-minute version?",
    preset: "pitch",
    personaProfile: persona,
    context: {
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
      recentMessages: ["Can you send the short version first?"],
      conversationGoalHint: "earn the next step by making the ask simpler and lower-friction"
    }
  });

  const result = await evaluateDraftWithConfig({
    draft: "want the one-line version or the two-minute version?",
    config
  });

  assert.ok(result.score > 1);
  assert.ok(result.matchedRules.includes("clarity_question"));
  assert.ok(result.matchedRules.includes("concrete_choice"));
});
