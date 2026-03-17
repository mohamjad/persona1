import fs from "node:fs/promises";
import path from "node:path";
import type { Persona1Repository } from "./repository.js";
import type {
  FewShotExampleRecord,
  InteractionRecord,
  MirrorInsightRecord,
  PersonaRecord,
  PersonaShardRecord,
  UserRecord
} from "./types.js";

interface FileState {
  users: UserRecord[];
  personas: PersonaRecord[];
  interactions: InteractionRecord[];
  mirrorInsights: MirrorInsightRecord[];
  personaShards: PersonaShardRecord[];
  fewShotExamples: FewShotExampleRecord[];
}

export interface FilesystemPersona1RepositoryOptions {
  rootDir: string;
}

export class FilesystemPersona1Repository implements Persona1Repository {
  readonly #rootDir: string;
  readonly #statePath: string;

  constructor(options: FilesystemPersona1RepositoryOptions) {
    this.#rootDir = options.rootDir;
    this.#statePath = path.join(this.#rootDir, "persona1-state.json");
  }

  async getUser(userId: string) {
    const state = await this.#readState();
    return state.users.find((user) => user.userId === userId) ?? null;
  }

  async getUserByEmail(email: string) {
    const state = await this.#readState();
    return state.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async getUserByFirebaseUid(firebaseUid: string) {
    const state = await this.#readState();
    return state.users.find((user) => user.firebaseUid === firebaseUid) ?? null;
  }

  async saveUser(user: UserRecord) {
    const state = await this.#readState();
    const index = state.users.findIndex((record) => record.userId === user.userId);
    if (index >= 0) {
      state.users[index] = user;
    } else {
      state.users.push(user);
    }

    await this.#writeState(state);
  }

  async incrementUsage(userId: string, now: string) {
    const state = await this.#readState();
    const user = state.users.find((record) => record.userId === userId);
    if (!user) {
      throw new Error(`Cannot increment usage for unknown user ${userId}.`);
    }

    user.usageCount += 1;
    user.updatedAt = now;
    await this.#writeState(state);
    return user;
  }

  async getPersona(userId: string) {
    const state = await this.#readState();
    return state.personas.find((persona) => persona.userId === userId) ?? null;
  }

  async savePersona(persona: PersonaRecord) {
    const state = await this.#readState();
    const index = state.personas.findIndex((record) => record.userId === persona.userId);
    if (index >= 0) {
      state.personas[index] = persona;
    } else {
      state.personas.push(persona);
    }

    await this.#writeState(state);
  }

  async saveInteraction(interaction: InteractionRecord) {
    const state = await this.#readState();
    const index = state.interactions.findIndex((record) => record.interactionId === interaction.interactionId);
    if (index >= 0) {
      state.interactions[index] = interaction;
    } else {
      state.interactions.push(interaction);
    }

    await this.#writeState(state);
  }

  async listInteractions(userId: string) {
    const state = await this.#readState();
    return state.interactions
      .filter((interaction) => interaction.userId === userId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async saveMirrorInsights(userId: string, insights: MirrorInsightRecord[]) {
    const state = await this.#readState();
    state.mirrorInsights = state.mirrorInsights.filter((insight) => insight.userId !== userId);
    state.mirrorInsights.push(...insights);
    await this.#writeState(state);
  }

  async listMirrorInsights(userId: string) {
    const state = await this.#readState();
    return state.mirrorInsights.filter((insight) => insight.userId === userId);
  }

  async savePersonaShards(userId: string, shards: PersonaShardRecord[]) {
    const state = await this.#readState();
    state.personaShards = state.personaShards.filter((shard) => shard.userId !== userId);
    state.personaShards.push(...shards);
    await this.#writeState(state);
  }

  async listPersonaShards(userId: string) {
    const state = await this.#readState();
    return state.personaShards.filter((shard) => shard.userId === userId);
  }

  async saveFewShotExamples(examples: FewShotExampleRecord[]) {
    const state = await this.#readState();
    const byId = new Map(state.fewShotExamples.map((example) => [example.exampleId, example]));
    for (const example of examples) {
      byId.set(example.exampleId, example);
    }
    state.fewShotExamples = [...byId.values()];
    await this.#writeState(state);
  }

  async listFewShotExamples(filters?: { preset?: string; recipientArchetype?: string | null }) {
    const state = await this.#readState();
    return state.fewShotExamples.filter((example) => {
      if (filters?.preset && example.preset !== filters.preset) {
        return false;
      }
      if (
        filters &&
        "recipientArchetype" in filters &&
        filters.recipientArchetype !== undefined &&
        example.recipientArchetype !== filters.recipientArchetype
      ) {
        return false;
      }
      return true;
    });
  }

  async #readState(): Promise<FileState> {
    await fs.mkdir(this.#rootDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.#statePath, "utf8");
      const parsed = JSON.parse(raw) as FileState;
      return {
        users: (parsed.users ?? []).map((user) => ({
          ...user,
          firebaseUid: user.firebaseUid ?? null,
          performanceMu: user.performanceMu ?? null,
          performanceSigma: user.performanceSigma ?? null,
          performanceOrdinal: user.performanceOrdinal ?? null,
          performanceMatches: user.performanceMatches ?? null
        })),
        personas: parsed.personas ?? [],
        interactions: (parsed.interactions ?? []).map((interaction) => ({
          ...interaction,
          embedding: interaction.embedding ?? null
        })),
        mirrorInsights: parsed.mirrorInsights ?? [],
        personaShards: parsed.personaShards ?? [],
        fewShotExamples: parsed.fewShotExamples ?? []
      };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") {
        return {
          users: [],
          personas: [],
          interactions: [],
          mirrorInsights: [],
          personaShards: [],
          fewShotExamples: []
        };
      }

      throw error;
    }
  }

  async #writeState(state: FileState) {
    await fs.mkdir(this.#rootDir, { recursive: true });
    await fs.writeFile(this.#statePath, JSON.stringify(state, null, 2));
  }
}
