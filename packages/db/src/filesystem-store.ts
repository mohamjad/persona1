import fs from "node:fs/promises";
import path from "node:path";
import type { Persona1Repository } from "./repository.js";
import type {
  InteractionRecord,
  MirrorInsightRecord,
  PersonaRecord,
  UserRecord
} from "./types.js";

interface FileState {
  users: UserRecord[];
  personas: PersonaRecord[];
  interactions: InteractionRecord[];
  mirrorInsights: MirrorInsightRecord[];
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

  async #readState(): Promise<FileState> {
    await fs.mkdir(this.#rootDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.#statePath, "utf8");
      const parsed = JSON.parse(raw) as FileState;
      return {
        users: parsed.users ?? [],
        personas: parsed.personas ?? [],
        interactions: parsed.interactions ?? [],
        mirrorInsights: parsed.mirrorInsights ?? []
      };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") {
        return {
          users: [],
          personas: [],
          interactions: [],
          mirrorInsights: []
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
