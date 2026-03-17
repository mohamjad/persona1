import type { PersonaProfile } from "../../../packages/persona-engine/src/index.js";

export type UserPlan = "free" | "monthly" | "unlimited" | "world1_bundle";
export type AuthMode = "local_hmac" | "firebase_jwt";

export interface UserRecord {
  userId: string;
  email: string;
  firebaseUid: string | null;
  plan: UserPlan;
  authMode: AuthMode;
  usageCount: number;
  performanceMu: number | null;
  performanceSigma: number | null;
  performanceOrdinal: number | null;
  performanceMatches: number | null;
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
  embedding: number[] | null;
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

export interface PersonaShardRecord {
  shardId: string;
  userId: string;
  shardType: string;
  content: string;
  embedding: number[] | null;
  platform: string | null;
  recipientArchetype: string | null;
  confidence: number;
  dataPointCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FewShotExampleRecord {
  exampleId: string;
  preset: string;
  recipientArchetype: string | null;
  situationDescription: string;
  exampleContent: string;
  outcomeSignal: string | null;
  source: string | null;
  embedding: number[] | null;
  createdAt: string;
}
