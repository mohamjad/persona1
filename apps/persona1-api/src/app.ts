import crypto from "node:crypto";
import {
  applyDeterministicPersonaUpdate,
  createBootstrapPersonaProfile,
  deriveMirrorInsights,
  mergePersonaProfiles,
  type MirrorInsight,
  type PersonaInteraction,
  type PersonaProfile
} from "../../../packages/persona-engine/src/index.js";
import type { Persona1RuntimeConfig } from "./config.js";
import type { InteractionRecord, MirrorInsightRecord, UserRecord } from "../../../packages/db/src/index.js";

export interface Persona1AppContext {
  config: Persona1RuntimeConfig;
  analyzerEnabled: boolean;
  now(): string;
}

export function createPersona1AppContext(config: Persona1RuntimeConfig): Persona1AppContext {
  return {
    config,
    analyzerEnabled: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    now: () => new Date().toISOString()
  };
}

export async function ensureUser(input: {
  context: Persona1AppContext;
  userId: string;
  email?: string | null;
}) {
  const existing = await input.context.config.repository.getUser(input.userId);
  if (existing) {
    return existing;
  }

  const now = input.context.now();
  const user: UserRecord = {
    userId: input.userId,
    email: input.email?.trim() || `${input.userId}@persona1.local`,
    plan: "free",
    authMode: input.context.config.authMode,
    usageCount: 0,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: now,
    updatedAt: now
  };
  await input.context.config.repository.saveUser(user);
  return user;
}

export async function getOrCreatePersona(input: {
  context: Persona1AppContext;
  userId: string;
  coldStartContext?: "dating" | "professional" | "general";
}) {
  const existing = await input.context.config.repository.getPersona(input.userId);
  if (existing) {
    return existing.profile;
  }

  const profile = createBootstrapPersonaProfile({
    coldStartContext: input.coldStartContext ?? "general",
    now: input.context.now()
  });
  await input.context.config.repository.savePersona({
    userId: input.userId,
    profile,
    updatedAt: profile.lastUpdated
  });
  return profile;
}

export async function createLocalAuthToken(input: {
  context: Persona1AppContext;
  userId: string;
  email: string;
}) {
  return input.context.config.authTokens.sign({
    userId: input.userId,
    email: input.email,
    issuedAt: input.context.now()
  });
}

export async function verifyBearerToken(input: {
  context: Persona1AppContext;
  authorizationHeader: string | undefined;
}) {
  const header = input.authorizationHeader?.trim();
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return input.context.config.authTokens.verify(token);
}

export function toInteractionRecord(input: {
  userId: string;
  interaction: PersonaInteraction;
  metadata?: Record<string, unknown>;
}): InteractionRecord {
  return {
    interactionId: input.interaction.interactionId,
    userId: input.userId,
    sessionId: input.interaction.sessionId,
    platform: input.interaction.platform,
    preset: input.interaction.preset,
    draftRaw: input.interaction.draftRaw,
    draftFinal: input.interaction.draftFinal,
    chosenOptionId: input.interaction.chosenOptionId,
    recipientContextHash: input.interaction.recipientContextHash,
    outcome: input.interaction.outcome,
    observedSignals: input.interaction.observedSignals,
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString()
  };
}

export function toMirrorInsightRecords(input: {
  userId: string;
  insights: MirrorInsight[];
  now: string;
}): MirrorInsightRecord[] {
  return input.insights.map((insight) => ({
    insightId: insight.insightId,
    userId: input.userId,
    observation: insight.observation,
    supportingPattern: insight.supportingPattern,
    evidenceCount: insight.evidenceCount,
    confidence: insight.confidence,
    createdAt: insight.createdAt,
    updatedAt: input.now,
    status: insight.status
  }));
}

export function createRegisteredUserId() {
  return `usr_${crypto.randomUUID()}`;
}

export function mergeServerAndLocalPersona(input: {
  localPersona: PersonaProfile;
  remotePersona: PersonaProfile | null;
}) {
  return mergePersonaProfiles({
    localProfile: input.localPersona,
    remoteProfile: input.remotePersona
  });
}

export function computeMirrorInsights(input: {
  personaProfile: PersonaProfile;
  minimumEvidenceCount: number;
}) {
  return deriveMirrorInsights({
    profile: {
      ...input.personaProfile,
      observedPatterns: input.personaProfile.observedPatterns.filter(
        (pattern) => pattern.count >= input.minimumEvidenceCount
      )
    }
  });
}

export function runLocalPersonaUpdate(input: {
  personaProfile: PersonaProfile;
  interaction: PersonaInteraction;
  now: string;
}) {
  return applyDeterministicPersonaUpdate({
    currentProfile: input.personaProfile,
    interaction: input.interaction,
    now: input.now
  });
}
