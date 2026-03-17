import type {
  FewShotExampleRecord,
  InteractionRecord,
  MirrorInsightRecord,
  PersonaRecord,
  PersonaShardRecord,
  UserRecord
} from "./types.js";

export interface Persona1Repository {
  getUser(userId: string): Promise<UserRecord | null>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserByFirebaseUid(firebaseUid: string): Promise<UserRecord | null>;
  saveUser(user: UserRecord): Promise<void>;
  incrementUsage(userId: string, now: string): Promise<UserRecord>;
  getPersona(userId: string): Promise<PersonaRecord | null>;
  savePersona(persona: PersonaRecord): Promise<void>;
  saveInteraction(interaction: InteractionRecord): Promise<void>;
  listInteractions(userId: string): Promise<InteractionRecord[]>;
  saveMirrorInsights(userId: string, insights: MirrorInsightRecord[]): Promise<void>;
  listMirrorInsights(userId: string): Promise<MirrorInsightRecord[]>;
  savePersonaShards(userId: string, shards: PersonaShardRecord[]): Promise<void>;
  listPersonaShards(userId: string): Promise<PersonaShardRecord[]>;
  saveFewShotExamples(examples: FewShotExampleRecord[]): Promise<void>;
  listFewShotExamples(filters?: {
    preset?: string;
    recipientArchetype?: string | null;
  }): Promise<FewShotExampleRecord[]>;
}
