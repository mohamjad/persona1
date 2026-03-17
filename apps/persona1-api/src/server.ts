import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AnalyzeRequestSchema,
  AnalyzeResponseSchema,
  MirrorCheckRequestSchema,
  MirrorCheckResponseSchema,
  PersonaUpdateRequestSchema,
  PersonaUpdateResponseSchema,
  type ConversationAnalyzer,
  type PersonaEvolutionEngine
} from "../../../packages/ai-kernel/src/index.js";
import { PersonaProfileSchema, type MirrorInsight } from "../../../packages/persona-engine/src/index.js";
import {
  computeMirrorInsights,
  createLocalAuthToken,
  createRegisteredUserId,
  createPersona1AppContext,
  ensureUser,
  getOrCreatePersona,
  mergeServerAndLocalPersona,
  runLocalPersonaUpdate,
  toInteractionRecord,
  toMirrorInsightRecords,
  verifyBearerToken,
  type Persona1AppContext
} from "./app.js";
import type { Persona1RuntimeConfig } from "./config.js";
import { enrichRecipientContext } from "../../../packages/context-engine/src/index.js";
import { retrieveRelevantMemory } from "../../../packages/memory-engine/src/index.js";
import type { FewShotExampleRecord, PersonaShardRecord } from "../../../packages/db/src/index.js";

const RegisterRequestSchema = z.object({
  email: z.string().email(),
  coldStartContext: z.enum(["dating", "professional", "general"]).default("general")
});

const AuthSessionRequestSchema = z.object({
  coldStartContext: z.enum(["dating", "professional", "general"]).default("general")
});

const PersonaSyncRequestSchema = z.object({
  userId: z.string().min(1),
  localPersona: PersonaProfileSchema,
  localInteractions: z.array(PersonaUpdateRequestSchema.shape.interaction).default([]),
  localMirrorInsights: z.array(
    z.object({
      insightId: z.string(),
      observation: z.string(),
      supportingPattern: z.string(),
      evidenceCount: z.number(),
      confidence: z.number(),
      createdAt: z.string(),
      status: z.enum(["active", "dismissed"])
    })
  ).default([])
});

const BillingCheckoutRequestSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email()
});

export interface Persona1ApiServerOptions {
  config: Persona1RuntimeConfig;
  analyzer: (ConversationAnalyzer & Partial<PersonaEvolutionEngine>) | null;
}

export function createPersona1ApiServer(options: Persona1ApiServerOptions) {
  const context = createPersona1AppContext(options.config);

  return createServer(async (request, response) => {
    setCorsHeaders(response);

    try {
      if (!request.url || !request.method) {
        sendJson(response, 400, { error: "Invalid request." });
        return;
      }

      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method === "GET" && request.url === "/v1/health") {
        sendJson(response, 200, {
          ok: true,
          service: "persona1-api",
          provider: options.config.inferenceProvider,
          model: options.config.model,
          storageMode: options.config.storageMode,
          authMode: options.config.authMode,
          canIssueTokens: options.config.authTokens.canIssueTokens,
          timestamp: context.now()
        });
        return;
      }

      if (request.method === "POST" && request.url === "/v1/auth/register") {
        const input = RegisterRequestSchema.parse(await readJsonBody(request));
        const existing = await options.config.repository.getUserByEmail(input.email);
        const userId = existing?.userId ?? createRegisteredUserId();
        const user = await ensureUser({
          context,
          userId,
          email: input.email
        });
        const persona = await getOrCreatePersona({
          context,
          userId: user.userId,
          coldStartContext: input.coldStartContext
        });
        await syncUserLearningState({
          config: options.config,
          userId: user.userId,
          profile: persona,
          now: context.now()
        });
        await options.config.repository.savePersonaShards(
          user.userId,
          buildPersonaShards({
            userId: user.userId,
            profile: persona,
            now: context.now()
          })
        );

        sendJson(response, 200, {
          userId: user.userId,
          email: user.email,
          authToken: await createLocalAuthToken({
            context,
            userId: user.userId,
            email: user.email
          }),
          authMode: options.config.authMode,
          personaProfile: persona
        });
        return;
      }

      if (request.method === "POST" && request.url === "/v1/auth/session") {
        const auth = requireAuthorizedUser({
          context,
          authorizationHeader: request.headers.authorization
        });
        const authResult = await auth;
        if (!authResult.ok) {
          sendJson(response, authResult.statusCode, { error: authResult.error });
          return;
        }

        const input = AuthSessionRequestSchema.parse(await readJsonBody(request));
        const existing =
          (await options.config.repository.getUserByFirebaseUid(authResult.user.userId)) ||
          (await options.config.repository.getUserByEmail(authResult.user.email));
        const user = await ensureUser({
          context,
          userId: existing?.userId ?? createRegisteredUserId(),
          email: authResult.user.email
        });
        if (user.firebaseUid !== authResult.user.userId || user.authMode !== options.config.authMode) {
          await options.config.repository.saveUser({
            ...user,
            email: authResult.user.email,
            firebaseUid: authResult.user.userId,
            authMode: options.config.authMode,
            updatedAt: context.now()
          });
        }
        const persona = await getOrCreatePersona({
          context,
          userId: user.userId,
          coldStartContext: input.coldStartContext
        });
        await syncUserLearningState({
          config: options.config,
          userId: user.userId,
          profile: persona,
          now: context.now()
        });
        await options.config.repository.savePersonaShards(
          user.userId,
          buildPersonaShards({
            userId: user.userId,
            profile: persona,
            now: context.now()
          })
        );
        sendJson(response, 200, {
          userId: user.userId,
          email: authResult.user.email,
          authMode: options.config.authMode,
          personaProfile: persona
        });
        return;
      }

      if (request.method === "POST" && request.url === "/v1/analyze") {
        if (!options.analyzer) {
          sendJson(response, 503, {
            error: "Analyze endpoint is unavailable because OPENROUTER_API_KEY is not configured."
          });
          return;
        }

        const input = AnalyzeRequestSchema.parse(await readJsonBody(request));
        const user = await ensureUser({
          context,
          userId: input.userId
        });
        const personaProfile =
          input.personaProfile ??
          (await getOrCreatePersona({
            context,
            userId: user.userId,
            coldStartContext: input.coldStartContext ?? "general"
          }));
        await seedFewShotExamplesIfNeeded(options.config);
        const [interactions, personaShards, repositoryExamples, enrichedContext] = await Promise.all([
          options.config.repository.listInteractions(user.userId),
          options.config.repository.listPersonaShards(user.userId),
          options.config.repository.listFewShotExamples({
            preset: input.preset,
            recipientArchetype: input.context.relationshipType
          }),
          enrichRecipientContext(input.context)
        ]);
        const memoryBundle = await retrieveRelevantMemory({
          rootDir: "C:/Users/moham/persona1",
          userId: user.userId,
          preset: input.preset,
          draft: input.draft,
          context: {
            ...input.context,
            ...enrichedContext
          },
          personaProfile,
          interactions,
          personaShards,
          repositoryExamples,
          mem0ApiKey: process.env.MEM0_API_KEY?.trim() || null,
          mem0ProjectId: process.env.MEM0_PROJECT_ID?.trim() || null
        });
        const analyzed = await options.analyzer.analyze({
          ...input,
          personaProfile,
          context: {
            ...input.context,
            ...enrichedContext
          },
          relevantMemories: memoryBundle.relevantMemories,
          relevantExamples: memoryBundle.relevantExamples
        });
        const output = AnalyzeResponseSchema.parse(analyzed);
        if (!input.prefetch) {
          await options.config.repository.incrementUsage(user.userId, context.now());
        }
        sendJson(response, 200, output);
        return;
      }

      if (request.method === "POST" && request.url === "/v1/persona/update") {
        const auth = requireAuthorizedUser({
          context,
          authorizationHeader: request.headers.authorization
        });
        const authResult = await auth;
        if (!authResult.ok) {
          sendJson(response, authResult.statusCode, { error: authResult.error });
          return;
        }

        const input = PersonaUpdateRequestSchema.parse(await readJsonBody(request));
        if (authResult.user.userId !== input.userId) {
          sendJson(response, 403, { error: "Token does not match the target user." });
          return;
        }

        const now = context.now();
        let providerUpdate = null;
        if (options.analyzer && typeof options.analyzer.updatePersona === "function") {
          try {
            providerUpdate = await options.analyzer.updatePersona(input);
          } catch {
            providerUpdate = null;
          }
        }
        const updated = providerUpdate
          ? {
              profile: providerUpdate.updatedPersona,
              mirrorInsights: providerUpdate.mirrorInsights,
              provider: "openrouter" as const
            }
          : {
              ...runLocalPersonaUpdate({
                personaProfile: input.currentPersona,
                interaction: input.interaction,
                now
              }),
              provider: "deterministic" as const
            };
        const mirrorInsights = shouldSurfaceMirrorInsights(updated.profile)
          ? updated.mirrorInsights.filter((insight) => insight.evidenceCount >= 5)
          : [];
        await options.config.repository.savePersona({
          userId: input.userId,
          profile: updated.profile,
          updatedAt: now
        });
        await syncUserLearningState({
          config: options.config,
          userId: input.userId,
          profile: updated.profile,
          now
        });
        await options.config.repository.saveInteraction(
          toInteractionRecord({
            userId: input.userId,
            interaction: input.interaction,
            metadata: {
              source: "server_persona_update"
            }
          })
        );
        await options.config.repository.saveMirrorInsights(
          input.userId,
          toMirrorInsightRecords({
            userId: input.userId,
            insights: mirrorInsights,
            now
          })
        );
        await options.config.repository.savePersonaShards(
          input.userId,
          buildPersonaShards({
            userId: input.userId,
            profile: updated.profile,
            now
          })
        );
        sendJson(
          response,
          200,
          PersonaUpdateResponseSchema.parse({
            updatedPersona: updated.profile,
            mirrorInsights,
            provider: updated.provider
          })
        );
        return;
      }

      if (request.method === "POST" && request.url === "/v1/persona/sync") {
        const auth = requireAuthorizedUser({
          context,
          authorizationHeader: request.headers.authorization
        });
        const authResult = await auth;
        if (!authResult.ok) {
          sendJson(response, authResult.statusCode, { error: authResult.error });
          return;
        }

        const input = PersonaSyncRequestSchema.parse(await readJsonBody(request));
        if (authResult.user.userId !== input.userId) {
          sendJson(response, 403, { error: "Token does not match the target user." });
          return;
        }

        const remotePersona = await options.config.repository.getPersona(input.userId);
        const mergedPersona = mergeServerAndLocalPersona({
          localPersona: input.localPersona,
          remotePersona: remotePersona?.profile ?? null
        });
        const now = context.now();

        await options.config.repository.savePersona({
          userId: input.userId,
          profile: mergedPersona,
          updatedAt: now
        });
        await syncUserLearningState({
          config: options.config,
          userId: input.userId,
          profile: mergedPersona,
          now
        });
        for (const interaction of input.localInteractions) {
          await options.config.repository.saveInteraction(
            toInteractionRecord({
              userId: input.userId,
              interaction,
              metadata: {
                source: "sync"
              }
            })
          );
        }
        const mirrorInsights = normalizeMirrorInsights(input.localMirrorInsights, now);
        if (mirrorInsights.length > 0) {
          await options.config.repository.saveMirrorInsights(
            input.userId,
            mirrorInsights.map((insight) => ({
              ...insight,
              userId: input.userId
            }))
          );
        }
        await options.config.repository.savePersonaShards(
          input.userId,
          buildPersonaShards({
            userId: input.userId,
            profile: mergedPersona,
            now
          })
        );

        sendJson(response, 200, {
          userId: input.userId,
          personaProfile: mergedPersona,
          interactionsSynced: input.localInteractions.length,
          mirrorInsightsSynced: mirrorInsights.length
        });
        return;
      }

      if (request.method === "GET" && request.url.startsWith("/v1/persona/")) {
        const auth = requireAuthorizedUser({
          context,
          authorizationHeader: request.headers.authorization
        });
        const authResult = await auth;
        if (!authResult.ok) {
          sendJson(response, authResult.statusCode, { error: authResult.error });
          return;
        }

        const userId = decodeURIComponent(request.url.slice("/v1/persona/".length));
        if (authResult.user.userId !== userId) {
          sendJson(response, 403, { error: "Token does not match the requested user." });
          return;
        }

        const persona = await options.config.repository.getPersona(userId);
        const mirrorInsights = await options.config.repository.listMirrorInsights(userId);
        sendJson(response, 200, {
          userId,
          personaProfile: persona?.profile ?? null,
          mirrorInsights
        });
        return;
      }

      if (request.method === "POST" && request.url === "/v1/mirror/check") {
        const input = MirrorCheckRequestSchema.parse(await readJsonBody(request));
        let providerResult = null;
        if (options.analyzer && typeof options.analyzer.checkMirror === "function") {
          try {
            providerResult = await options.analyzer.checkMirror(input);
          } catch {
            providerResult = null;
          }
        }
        const insights =
          providerResult?.insights ??
          computeMirrorInsights({
            personaProfile: input.personaProfile,
            minimumEvidenceCount: input.minimumEvidenceCount
          });
        sendJson(
          response,
          200,
          MirrorCheckResponseSchema.parse({
            shouldSurfaceMirror: providerResult?.shouldSurfaceMirror ?? insights.length > 0,
            insights,
            provider: providerResult?.provider ?? "deterministic"
          })
        );
        return;
      }

      if (request.method === "POST" && request.url === "/v1/billing/checkout") {
        const auth = requireAuthorizedUser({
          context,
          authorizationHeader: request.headers.authorization
        });
        const authResult = await auth;
        if (!authResult.ok) {
          sendJson(response, authResult.statusCode, { error: authResult.error });
          return;
        }

        const input = BillingCheckoutRequestSchema.parse(await readJsonBody(request));
        if (authResult.user.userId !== input.userId) {
          sendJson(response, 403, { error: "Token does not match the target user." });
          return;
        }

        const result = await options.config.billing.createCheckoutSession(input);
        sendJson(response, result.ok ? 200 : 503, result);
        return;
      }

      if (request.method === "POST" && request.url === "/v1/billing/webhook") {
        const rawBody = await readTextBody(request);
        const event = options.config.billing.parseWebhook(
          rawBody,
          normalizeHeaderValue(request.headers["stripe-signature"])
        );
        if (event.kind === "subscription_active" && event.userId) {
          const user = await options.config.repository.getUser(event.userId);
          if (user) {
            await options.config.repository.saveUser({
              ...user,
              plan: "monthly",
              stripeCustomerId: event.customerId,
              stripeSubscriptionId: event.subscriptionId,
              updatedAt: context.now()
            });
          }
        }
        if (event.kind === "subscription_canceled" && event.userId) {
          const user = await options.config.repository.getUser(event.userId);
          if (user) {
            await options.config.repository.saveUser({
              ...user,
              plan: "free",
              updatedAt: context.now()
            });
          }
        }

        sendJson(response, 200, {
          ok: true,
          event
        });
        return;
      }

      if (request.method === "GET" && request.url.startsWith("/v1/usage/")) {
        const auth = requireAuthorizedUser({
          context,
          authorizationHeader: request.headers.authorization
        });
        const authResult = await auth;
        if (!authResult.ok) {
          sendJson(response, authResult.statusCode, { error: authResult.error });
          return;
        }

        const userId = decodeURIComponent(request.url.slice("/v1/usage/".length));
        if (authResult.user.userId !== userId) {
          sendJson(response, 403, { error: "Token does not match the requested user." });
          return;
        }

        const user = await options.config.repository.getUser(userId);
        sendJson(response, 200, {
          userId,
          usage: options.config.billing.createUsageSnapshot(user)
        });
        return;
      }

      sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error.";
      sendJson(response, 500, { error: message });
    }
  });
}

let seedFewShotExamplesPromise: Promise<void> | null = null;

async function seedFewShotExamplesIfNeeded(config: Persona1RuntimeConfig) {
  if (seedFewShotExamplesPromise) {
    return seedFewShotExamplesPromise;
  }

  seedFewShotExamplesPromise = (async () => {
    const existing = await config.repository.listFewShotExamples();
    if (existing.length > 0) {
      return;
    }

    const sourcePath = path.resolve("C:/Users/moham/persona1/businesses/persona1/few-shot/examples.json");
    const raw = await fs.readFile(sourcePath, "utf8").catch(() => "[]");
    const examples = JSON.parse(raw) as Array<{
      id: string;
      preset: string;
      archetype?: string;
      scenario: string;
      message: string;
      outcome?: string;
      whyItWorked: string;
    }>;

    await config.repository.saveFewShotExamples(
      examples.map((example) => ({
        exampleId: example.id,
        preset: example.preset,
        recipientArchetype: example.archetype ?? null,
        situationDescription: example.scenario,
        exampleContent: example.message,
        outcomeSignal: example.outcome ?? null,
        source: example.whyItWorked,
        embedding: null,
        createdAt: new Date().toISOString()
      }))
    );
  })();

  return seedFewShotExamplesPromise;
}

function shouldSurfaceMirrorInsights(profile: { interactionCount: number }) {
  return profile.interactionCount > 0 && profile.interactionCount % 25 === 0;
}

async function syncUserLearningState(input: {
  config: Persona1RuntimeConfig;
  userId: string;
  profile: { performanceRating?: { mu: number; sigma: number; ordinal: number; matches: number } };
  now: string;
}) {
  const user = await input.config.repository.getUser(input.userId);
  if (!user) {
    return;
  }

  await input.config.repository.saveUser({
    ...user,
    performanceMu: input.profile.performanceRating?.mu ?? user.performanceMu,
    performanceSigma: input.profile.performanceRating?.sigma ?? user.performanceSigma,
    performanceOrdinal: input.profile.performanceRating?.ordinal ?? user.performanceOrdinal,
    performanceMatches: input.profile.performanceRating?.matches ?? user.performanceMatches,
    updatedAt: input.now
  });
}

function buildPersonaShards(input: {
  userId: string;
  profile: {
    communicationDefaults: Record<string, string>;
    observedPatterns: Array<{ pattern: string; count: number; confidence: number }>;
    knownStrengths: string[];
    knownWeaknesses: string[];
    platformCalibration: Record<string, { toneShift: string; confidence: number }>;
  };
  now: string;
}): PersonaShardRecord[] {
  const shards: PersonaShardRecord[] = [];
  const pushShard = (shard: Omit<PersonaShardRecord, "userId" | "createdAt" | "updatedAt">) => {
    shards.push({
      ...shard,
      userId: input.userId,
      createdAt: input.now,
      updatedAt: input.now
    });
  };

  pushShard({
    shardId: `${input.userId}_defaults`,
    shardType: "defaults",
    content: JSON.stringify(input.profile.communicationDefaults),
    embedding: null,
    platform: null,
    recipientArchetype: null,
    confidence: 0.6,
    dataPointCount: 1
  });

  for (const pattern of input.profile.observedPatterns.slice(0, 12)) {
    pushShard({
      shardId: `${input.userId}_pattern_${slugify(pattern.pattern)}`,
      shardType: "pattern",
      content: `${pattern.pattern} (count=${pattern.count}, confidence=${pattern.confidence})`,
      embedding: null,
      platform: null,
      recipientArchetype: null,
      confidence: pattern.confidence,
      dataPointCount: pattern.count
    });
  }

  for (const strength of input.profile.knownStrengths.slice(0, 4)) {
    pushShard({
      shardId: `${input.userId}_strength_${slugify(strength)}`,
      shardType: "strength",
      content: strength,
      embedding: null,
      platform: null,
      recipientArchetype: null,
      confidence: 0.7,
      dataPointCount: 1
    });
  }

  for (const weakness of input.profile.knownWeaknesses.slice(0, 4)) {
    pushShard({
      shardId: `${input.userId}_weakness_${slugify(weakness)}`,
      shardType: "weakness",
      content: weakness,
      embedding: null,
      platform: null,
      recipientArchetype: null,
      confidence: 0.65,
      dataPointCount: 1
    });
  }

  for (const [platform, calibration] of Object.entries(input.profile.platformCalibration).slice(0, 6)) {
    pushShard({
      shardId: `${input.userId}_platform_${slugify(platform)}`,
      shardType: "platform",
      content: calibration.toneShift,
      embedding: null,
      platform,
      recipientArchetype: null,
      confidence: calibration.confidence,
      dataPointCount: 1
    });
  }

  return shards;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "entry";
}

function normalizeMirrorInsights(
  insights: Array<{
    insightId: string;
    observation: string;
    supportingPattern: string;
    evidenceCount: number;
    confidence: number;
    createdAt: string;
    status: "active" | "dismissed";
  }>,
  now: string
) {
  return insights.map((insight) => ({
    insightId: insight.insightId,
    observation: insight.observation,
    supportingPattern: insight.supportingPattern,
    evidenceCount: insight.evidenceCount,
    confidence: insight.confidence,
    createdAt: insight.createdAt,
    updatedAt: now,
    status: insight.status
  }));
}

function requireAuthorizedUser(input: {
  context: Persona1AppContext;
  authorizationHeader: string | undefined;
}) {
  return verifyBearerToken(input).then((user) => {
    if (!user) {
      return {
        ok: false as const,
        statusCode: 401,
        error: "Missing or invalid bearer token."
      };
    }

    return {
      ok: true as const,
      user
    };
  });
}

async function readJsonBody(request: IncomingMessage) {
  return JSON.parse(await readTextBody(request));
}

async function readTextBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    totalBytes += buffer.byteLength;
    if (totalBytes > 1024 * 1024) {
      throw new Error("Request body exceeded the 1MB limit.");
    }
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody.length > 0 ? rawBody : "{}";
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,authorization,stripe-signature");
}

function normalizeHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  const encoded = JSON.stringify(payload, null, 2);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(encoded);
}
