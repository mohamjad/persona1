import fs from "node:fs/promises";
import path from "node:path";
import { MemoryClient } from "mem0ai";
import type { RecipientContext } from "../../ai-kernel/src/contracts.js";
import type {
  FewShotExampleRecord,
  InteractionRecord,
  PersonaShardRecord
} from "../../db/src/types.js";
import type { PersonaProfile } from "../../persona-engine/src/index.js";

export interface FewShotExample {
  id: string;
  preset: string;
  archetype: string;
  tags: string[];
  scenario: string;
  message: string;
  outcome: string;
  whyItWorked: string;
}

export interface RetrievedMemoryBundle {
  relevantMemories: string[];
  relevantExamples: FewShotExample[];
}

let seededExamplesPromise: Promise<FewShotExample[]> | null = null;

export async function retrieveRelevantMemory(input: {
  rootDir?: string;
  userId?: string;
  preset: string;
  draft: string;
  context: RecipientContext;
  personaProfile: PersonaProfile;
  interactions: InteractionRecord[];
  personaShards?: PersonaShardRecord[];
  repositoryExamples?: FewShotExampleRecord[];
  mem0ApiKey?: string | null;
  mem0ProjectId?: string | null;
}): Promise<RetrievedMemoryBundle> {
  const examples =
    input.repositoryExamples && input.repositoryExamples.length > 0
      ? input.repositoryExamples.map(mapRecordToExample)
      : await loadSeedExamples(input.rootDir);
  const relevantExamples = rankExamples(examples, input).slice(0, 5);
  const interactionMemories = rankInteractions(input.interactions, input).slice(0, 3);
  const shardMemories = rankPersonaShards(input.personaShards || [], input).slice(0, 3);
  const mem0Memories = await searchMem0Memory(input).catch(() => []);

  return {
    relevantMemories: dedupeStrings([...interactionMemories, ...shardMemories, ...mem0Memories]).slice(0, 6),
    relevantExamples
  };
}

async function loadSeedExamples(rootDir = "C:/Users/moham/persona1") {
  if (!seededExamplesPromise) {
    const examplesPath = path.resolve(rootDir, "businesses/persona1/few-shot/examples.json");
    seededExamplesPromise = fs
      .readFile(examplesPath, "utf8")
      .then((raw) => JSON.parse(raw) as FewShotExample[])
      .catch(() => []);
  }
  return seededExamplesPromise;
}

function rankExamples(
  examples: FewShotExample[],
  input: {
    preset: string;
    draft: string;
    context: RecipientContext;
    personaProfile: PersonaProfile;
  }
) {
  const queryTokens = tokenize([
    input.preset,
    input.draft,
    input.context.conversationGoalHint || "",
    input.context.currentConversationSummary || input.context.threadSummary,
    input.context.relationshipType,
    input.context.platform
  ]);

  return examples
    .map((example) => ({
      example,
      score:
        (example.preset === input.preset ? 4 : 0) +
        overlapScore(queryTokens, tokenize([example.scenario, example.outcome, example.whyItWorked, example.tags.join(" ")])) +
        (example.archetype === input.context.relationshipType ? 1.5 : 0)
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.example);
}

function rankPersonaShards(
  shards: PersonaShardRecord[],
  input: {
    preset: string;
    draft: string;
    context: RecipientContext;
  }
) {
  const queryTokens = tokenize([
    input.preset,
    input.draft,
    input.context.threadSummary,
    input.context.currentConversationSummary || "",
    input.context.conversationGoalHint || ""
  ]);

  return shards
    .map((shard) => ({
      shard,
      score:
        overlapScore(queryTokens, tokenize([shard.content, shard.shardType, shard.platform || "", shard.recipientArchetype || ""])) +
        shard.confidence * 3 +
        shard.dataPointCount * 0.5
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.shard.content);
}

function rankInteractions(
  interactions: InteractionRecord[],
  input: {
    preset: string;
    draft: string;
    context: RecipientContext;
    personaProfile: PersonaProfile;
  }
) {
  const queryTokens = tokenize([
    input.preset,
    input.draft,
    input.context.conversationGoalHint || "",
    input.context.currentConversationSummary || input.context.threadSummary
  ]);

  return interactions
    .filter((interaction) => interaction.preset === input.preset || interaction.platform === input.context.platform)
    .map((interaction) => {
      const score =
        overlapScore(queryTokens, tokenize([interaction.draftRaw, interaction.draftFinal || "", interaction.outcome])) +
        (interaction.outcome === "positive" ? 2 : 0);
      return {
        score,
        summary: `${interaction.preset} on ${interaction.platform}: ${interaction.draftFinal || interaction.draftRaw} -> ${interaction.outcome}`
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.summary);
}

function tokenize(parts: string[]) {
  return parts
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function overlapScore(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.reduce((score, token) => score + (rightSet.has(token) ? 1 : 0), 0);
}

function mapRecordToExample(example: FewShotExampleRecord): FewShotExample {
  return {
    id: example.exampleId,
    preset: example.preset,
    archetype: example.recipientArchetype || "unknown",
    tags: [],
    scenario: example.situationDescription,
    message: example.exampleContent,
    outcome: example.outcomeSignal || "",
    whyItWorked: example.source || "retrieved from repository memory"
  };
}

async function searchMem0Memory(input: {
  userId?: string;
  draft: string;
  context: RecipientContext;
  mem0ApiKey?: string | null;
  mem0ProjectId?: string | null;
}) {
  if (!input.mem0ApiKey || !input.userId) {
    return [];
  }

  const client = new MemoryClient({
    apiKey: input.mem0ApiKey,
    ...(input.mem0ProjectId ? { projectId: input.mem0ProjectId } : {})
  });
  const query = [
    input.context.currentConversationSummary || input.context.threadSummary,
    input.context.conversationGoalHint || "",
    input.draft
  ]
    .filter(Boolean)
    .join(" | ");

  const memories = await client.search(query, {
    user_id: input.userId,
    top_k: 3
  });

  return memories
    .map((memory: { memory?: string; data?: { memory?: string } | null }) => memory.memory || memory.data?.memory || "")
    .map((memory: string) => String(memory).trim())
    .filter(Boolean);
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
