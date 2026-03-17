import test from "node:test";
import assert from "node:assert/strict";
import { retrieveRelevantMemory } from "../../dist/packages/memory-engine/src/index.js";
import { createBootstrapPersonaProfile } from "../../dist/packages/persona-engine/src/index.js";

test("retrieveRelevantMemory prefers matching examples and positive prior interactions", async () => {
  const result = await retrieveRelevantMemory({
    rootDir: "C:/Users/moham/persona1",
    userId: "usr_test",
    preset: "pitch",
    draft: "want the one-line version or the two-minute version?",
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
      inferredConcerns: "time cost",
      contextConfidence: 84,
      currentConversationSummary: "They asked for the short version first.",
      conversationGoalHint: "earn the next step with a lower-friction ask"
    },
    personaProfile: createBootstrapPersonaProfile({ coldStartContext: "professional" }),
    interactions: [
      {
        interactionId: "int_1",
        userId: "usr_test",
        sessionId: "sess_1",
        platform: "linkedin",
        preset: "pitch",
        draftRaw: "send details?",
        draftFinal: "want the one-line version or the two-minute version?",
        chosenOptionId: 1,
        recipientContextHash: "ctx_1",
        outcome: "positive",
        observedSignals: ["positive_outcome"],
        metadata: {},
        embedding: null,
        createdAt: "2026-03-17T00:00:00.000Z"
      }
    ],
    personaShards: [
      {
        shardId: "shard_1",
        userId: "usr_test",
        shardType: "pattern",
        content: "The sender gets better outcomes when offering bounded choices instead of generic follow-ups.",
        embedding: null,
        platform: "linkedin",
        recipientArchetype: "colleague",
        confidence: 0.8,
        dataPointCount: 3,
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z"
      }
    ]
  });

  assert.ok(result.relevantExamples.length >= 1);
  assert.ok(result.relevantMemories.length >= 1);
  assert.match(result.relevantMemories[0], /pitch|bounded choice|linkedin/i);
});
