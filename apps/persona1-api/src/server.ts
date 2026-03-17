import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

const RegisterRequestSchema = z.object({
  email: z.string().email(),
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
        const analyzed = await options.analyzer.analyze(input);
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
        await options.config.repository.savePersona({
          userId: input.userId,
          profile: updated.profile,
          updatedAt: now
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
            insights: updated.mirrorInsights,
            now
          })
        );
        sendJson(
          response,
          200,
          PersonaUpdateResponseSchema.parse({
            updatedPersona: updated.profile,
            mirrorInsights: updated.mirrorInsights,
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
