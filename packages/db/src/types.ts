import type { PersonaProfile } from "../../../packages/persona-engine/src/index.js";

export type UserPlan = "free" | "monthly" | "unlimited" | "world1_bundle";
export type AuthMode = "local_hmac" | "firebase_jwt";

export interface UserRecord {
  userId: string;
  email: string;
  plan: UserPlan;
  authMode: AuthMode;
  usageCount: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaRecord {
  userId: string;
  profile: PersonaProfile;
  updatedAt: string;
}

export interface InteractionRecord {
  interactionId: string;
  userId: string;
  sessionId: string;
  platform: string;
  preset: string;
  draftRaw: string;
  draftFinal: string | null;
  chosenOptionId: number | null;
  recipientContextHash: string;
  outcome: "positive" | "neutral" | "negative" | "unknown";
  observedSignals: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MirrorInsightRecord {
  insightId: string;
  userId: string;
  observation: string;
  supportingPattern: string;
  evidenceCount: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  status: "active" | "dismissed";
}
