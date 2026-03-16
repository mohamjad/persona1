import test from "node:test";
import assert from "node:assert/strict";
import { createOpenRouterConversationAnalyzer } from "../../dist/packages/ai-kernel/src/index.js";
import { createBootstrapPersonaProfile } from "../../dist/packages/persona-engine/src/index.js";

test("openrouter provider can parse persona update responses", async () => {
  const analyzer = createOpenRouterConversationAnalyzer({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  updatedPersona: {
                    ...createBootstrapPersonaProfile({
                      coldStartContext: "professional",
                      now: "2026-03-16T00:00:00.000Z"
                    }),
                    version: 2,
                    interactionCount: 1
                  },
                  mirrorInsights: [],
                  provider: "openrouter"
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
  });

  const result = await analyzer.updatePersona({
    userId: "usr_1",
    currentPersona: createBootstrapPersonaProfile({
      coldStartContext: "professional",
      now: "2026-03-16T00:00:00.000Z"
    }),
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
      observedSignals: []
    }
  });

  assert.equal(result.provider, "openrouter");
  assert.equal(result.updatedPersona.version, 2);
});

test("openrouter provider can parse mirror responses", async () => {
  const analyzer = createOpenRouterConversationAnalyzer({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  shouldSurfaceMirror: true,
                  insights: [
                    {
                      insightId: "mir_1",
                      observation: "You trim the send after your first instinct.",
                      supportingPattern: "edited_before_send",
                      evidenceCount: 3,
                      confidence: 0.71,
                      createdAt: "2026-03-16T00:00:00.000Z",
                      status: "active"
                    }
                  ],
                  provider: "openrouter"
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
  });

  const result = await analyzer.checkMirror({
    userId: "usr_1",
    personaProfile: createBootstrapPersonaProfile({
      coldStartContext: "general",
      now: "2026-03-16T00:00:00.000Z"
    }),
    minimumEvidenceCount: 3
  });

  assert.equal(result.shouldSurfaceMirror, true);
  assert.equal(result.provider, "openrouter");
  assert.equal(result.insights.length, 1);
});
