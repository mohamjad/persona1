import type {
  AnalyzeRequest,
  MirrorCheckRequest,
  MirrorCheckResponse,
  PersonaUpdateRequest,
  PersonaUpdateResponse
} from "./contracts.js";
import type { BranchTree } from "./contracts.js";
import {
  MirrorCheckResponseSchema,
  PersonaUpdateResponseSchema
} from "./contracts.js";
import {
  buildBranchGeneratorPrompt,
  buildMirrorTriggerPrompt,
  buildPersonaUpdatePrompt,
  buildScoringParameterizationPrompt,
  createAnalyzeResponse,
  createMirrorCheckResponse,
  createPersonaUpdateResponse
} from "./prompt.js";
import { parseBranchTreeOutput, parseJsonContract } from "./parser.js";
import { createBootstrapPersonaProfile } from "../../../packages/persona-engine/src/index.js";
import {
  buildScoringConfig,
  evaluateDraftWithConfig,
  ScoringConfigSchema
} from "../../scoring-engine/src/index.js";
import { runBranchIntelligence } from "../../branch-intelligence/src/index.js";

type FetchLike = typeof fetch;

export interface ConversationAnalyzer {
  analyze(input: AnalyzeRequest): Promise<ReturnType<typeof createAnalyzeResponse>>;
}

export interface PersonaEvolutionEngine {
  updatePersona(input: PersonaUpdateRequest): Promise<PersonaUpdateResponse>;
  checkMirror(input: MirrorCheckRequest): Promise<MirrorCheckResponse>;
}

export interface OpenRouterConversationAnalyzerOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
  baseUrl?: string;
  appName?: string;
  voicePackId?: string | null;
  voicePackText?: string | null;
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export function createOpenRouterConversationAnalyzer(
  options: OpenRouterConversationAnalyzerOptions
): ConversationAnalyzer & PersonaEvolutionEngine {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? "openai/gpt-4.1-mini";
  const baseUrl = options.baseUrl ?? "https://openrouter.ai/api/v1/chat/completions";

  return {
    async analyze(input: AnalyzeRequest) {
      const personaProfile =
        input.personaProfile ??
        createBootstrapPersonaProfile({
          coldStartContext: input.coldStartContext ?? "general"
        });
      const fallbackScoringConfig = buildScoringConfig({
        draft: input.draft,
        context: input.context,
        personaProfile,
        preset: input.preset
      });
      const scoringConfig = await parameterizeScoringConfig({
        apiKey: options.apiKey,
        model,
        baseUrl,
        fetchImpl,
        preset: input.preset,
        context: input.context,
        personaProfile,
        relevantExamples: input.relevantExamples || [],
        fallbackConfig: fallbackScoringConfig,
        ...(options.appName ? { appName: options.appName } : {})
      });
      const draftScore = await evaluateDraftWithConfig({
        draft: input.draft,
        config: scoringConfig
      });

      const prompt = buildBranchGeneratorPrompt({
        draft: input.draft,
        preset: input.preset,
        context: input.context,
        personaProfile,
        scoringConfig,
        draftScore,
        relevantMemories: input.relevantMemories || [],
        relevantExamples: input.relevantExamples || [],
        ...(options.voicePackId !== undefined ? { voicePackId: options.voicePackId } : {}),
        ...(options.voicePackText !== undefined ? { voicePackText: options.voicePackText } : {})
      });

      const response = await fetchImpl(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://persona1.local",
          "X-Title": options.appName ?? "persona1"
        },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          messages: prompt.messages
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          body.length > 0
            ? `OpenRouter analyze request failed with status ${response.status}: ${body}`
            : `OpenRouter analyze request failed with status ${response.status}.`
        );
      }

      const payload = (await response.json()) as OpenRouterChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content || content.trim().length === 0) {
        throw new Error("OpenRouter returned an empty response.");
      }

      const branchTree: BranchTree = parseBranchTreeOutput(content);
      const enrichedBranchTree = await runBranchIntelligence({
        branchTree,
        context: input.context,
        preset: input.preset,
        draft: input.draft,
        personaProfile,
        scoringConfig,
        draftAssessment: draftScore,
        relevantMemories: input.relevantMemories || []
      });
      return createAnalyzeResponse({
        branchTree: enrichedBranchTree,
        scoringConfig,
        draftAssessmentOverride: draftScore,
        relevantMemories: input.relevantMemories || [],
        relevantExamples: input.relevantExamples || [],
        personaVersionUsed: personaProfile.version,
        model
      });
    },

    async updatePersona(input: PersonaUpdateRequest) {
      const prompt = buildPersonaUpdatePrompt({
        currentPersona: input.currentPersona,
        interaction: input.interaction
      });
      const content = await requestOpenRouterContent(fetchImpl, {
        apiKey: options.apiKey,
        model,
        baseUrl,
        messages: prompt.messages,
        ...(options.appName ? { appName: options.appName } : {})
      });
      const parsed = parseJsonContract(content, PersonaUpdateResponseSchema, "persona update");
      return createPersonaUpdateResponse({
        updatedPersona: parsed.updatedPersona,
        mirrorInsights: parsed.mirrorInsights,
        provider: "openrouter"
      });
    },

    async checkMirror(input: MirrorCheckRequest) {
      const prompt = buildMirrorTriggerPrompt({
        personaProfile: input.personaProfile,
        minimumEvidenceCount: input.minimumEvidenceCount
      });
      const content = await requestOpenRouterContent(fetchImpl, {
        apiKey: options.apiKey,
        model,
        baseUrl,
        messages: prompt.messages,
        ...(options.appName ? { appName: options.appName } : {})
      });
      const parsed = parseJsonContract(content, MirrorCheckResponseSchema, "mirror check");
      return createMirrorCheckResponse({
        shouldSurfaceMirror: parsed.shouldSurfaceMirror,
        insights: parsed.insights,
        provider: "openrouter"
      });
    }
  };
}

async function requestOpenRouterContent(
  fetchImpl: FetchLike,
  input: {
    apiKey: string;
    model: string;
    baseUrl: string;
    appName?: string;
    messages: Array<{ role: "system" | "user"; content: string }>;
  }
) {
  const response = await fetchImpl(input.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://persona1.local",
      "X-Title": input.appName ?? "persona1"
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.4,
      messages: input.messages
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      body.length > 0
        ? `OpenRouter request failed with status ${response.status}: ${body}`
        : `OpenRouter request failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as OpenRouterChatResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return content;
}

async function parameterizeScoringConfig(input: {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl: FetchLike;
  appName?: string;
  preset: AnalyzeRequest["preset"];
  context: AnalyzeRequest["context"];
  personaProfile: NonNullable<AnalyzeRequest["personaProfile"]>;
  relevantExamples: NonNullable<AnalyzeRequest["relevantExamples"]>;
  fallbackConfig: ReturnType<typeof buildScoringConfig>;
}) {
  try {
    const prompt = buildScoringParameterizationPrompt({
      preset: input.preset,
      context: input.context,
      personaProfile: input.personaProfile,
      relevantExamples: input.relevantExamples
    });
    const content = await requestOpenRouterContent(input.fetchImpl, {
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
      messages: prompt.messages,
      ...(input.appName ? { appName: input.appName } : {})
    });
    const parsed = parseJsonContract(content, ScoringConfigSchema, "scoring configuration");
    return {
      ...parsed,
      sessionKey: parsed.sessionKey || input.fallbackConfig.sessionKey
    };
  } catch {
    return input.fallbackConfig;
  }
}
