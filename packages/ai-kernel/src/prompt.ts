import type {
  AnalyzeRequest,
  BranchTree,
  ConversationPreset,
  MirrorCheckResponse,
  PersonaUpdateResponse,
  RecipientContext
} from "./contracts.js";
import type { PersonaInteraction, PersonaProfile } from "../../../packages/persona-engine/src/index.js";

export interface PromptMessage {
  role: "system" | "user";
  content: string;
}

export interface PromptBundle {
  messages: PromptMessage[];
  expectedContract: "branch_tree_v1";
}

export function buildBranchGeneratorPrompt(input: {
  draft: string;
  preset: ConversationPreset;
  context: RecipientContext;
  personaProfile: PersonaProfile;
}): PromptBundle {
  return {
    expectedContract: "branch_tree_v1",
    messages: [
      {
        role: "system",
        content: [
          "You are the inference engine for persona1, a conversation intelligence system.",
          "You receive a sender persona model, recipient context, a situation preset, and a draft.",
          "Generate exactly 3 message options with predicted branches.",
          "Critical rules:",
          "1. Every option must sound like the sender, not generic AI.",
          "2. Predicted responses must be specific enough to be wrong.",
          "3. Branch paths must name concrete downstream consequences.",
          "4. If the draft works against the sender's goal, set draftWarning explicitly.",
          "5. Option 1 is the recommended option when it best aligns with the goal.",
          "6. Do not moralize. Do not add disclaimers. Show the board.",
          "Return JSON only.",
          "Output schema:",
          "{\"draftWarning\":string|null,\"branches\":[{\"optionId\":1|2|3,\"isRecommended\":boolean,\"message\":string,\"predictedResponse\":string,\"branchPath\":string,\"goalAlignmentScore\":0-100,\"whyItWorks\":string,\"risk\":string|null}]}",
          "There must be exactly 3 branches and exactly 1 recommended branch."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Preset: ${input.preset}`,
          `Sender persona JSON: ${JSON.stringify(input.personaProfile)}`,
          `Recipient context JSON: ${JSON.stringify(input.context)}`,
          `Draft: ${input.draft}`
        ].join("\n\n")
      }
    ]
  };
}

export function createAnalyzeResponse(input: {
  branchTree: BranchTree;
  personaVersionUsed: number;
  model: string;
}) {
  return {
    draftWarning: input.branchTree.draftWarning,
    branches: input.branchTree.branches,
    personaVersionUsed: input.personaVersionUsed,
    provider: "openrouter" as const,
    model: input.model
  };
}

export function createAnalyzeInputSummary(input: AnalyzeRequest) {
  return {
    preset: input.preset,
    platform: input.context.platform,
    relationshipType: input.context.relationshipType,
    contextConfidence: input.context.contextConfidence,
    hasPersonaProfile: Boolean(input.personaProfile)
  };
}

export function buildPersonaUpdatePrompt(input: {
  currentPersona: PersonaProfile;
  interaction: PersonaInteraction;
}) {
  return {
    expectedContract: "persona_update_v1" as const,
    messages: [
      {
        role: "system" as const,
        content: [
          "You update a versioned persona model for persona1.",
          "Be conservative. Only reflect evidence shown by the interaction.",
          "Return JSON only.",
          "Output schema:",
          "{\"updatedPersona\":PersonaProfile,\"mirrorInsights\":[{\"insightId\":string,\"observation\":string,\"supportingPattern\":string,\"evidenceCount\":number,\"confidence\":number,\"createdAt\":string,\"status\":\"active\"}],\"provider\":\"openrouter\"}"
        ].join("\n")
      },
      {
        role: "user" as const,
        content: [
          `Current persona JSON: ${JSON.stringify(input.currentPersona)}`,
          `Interaction JSON: ${JSON.stringify(input.interaction)}`
        ].join("\n\n")
      }
    ]
  };
}

export function buildMirrorTriggerPrompt(input: {
  personaProfile: PersonaProfile;
  minimumEvidenceCount: number;
}) {
  return {
    expectedContract: "mirror_trigger_v1" as const,
    messages: [
      {
        role: "system" as const,
        content: [
          "You decide whether persona1 should surface a mirror observation.",
          "Insights must be observations, not advice.",
          "Only surface when repeated evidence exists.",
          "Return JSON only.",
          "Output schema:",
          "{\"shouldSurfaceMirror\":boolean,\"insights\":[{\"insightId\":string,\"observation\":string,\"supportingPattern\":string,\"evidenceCount\":number,\"confidence\":number,\"createdAt\":string,\"status\":\"active\"}],\"provider\":\"openrouter\"}"
        ].join("\n")
      },
      {
        role: "user" as const,
        content: [
          `Minimum evidence count: ${input.minimumEvidenceCount}`,
          `Persona JSON: ${JSON.stringify(input.personaProfile)}`
        ].join("\n\n")
      }
    ]
  };
}

export function createPersonaUpdateResponse(input: {
  updatedPersona: PersonaProfile;
  mirrorInsights: PersonaUpdateResponse["mirrorInsights"];
  provider: PersonaUpdateResponse["provider"];
}) {
  return {
    updatedPersona: input.updatedPersona,
    mirrorInsights: input.mirrorInsights,
    provider: input.provider
  };
}

export function createMirrorCheckResponse(input: {
  shouldSurfaceMirror: boolean;
  insights: MirrorCheckResponse["insights"];
  provider: MirrorCheckResponse["provider"];
}) {
  return {
    shouldSurfaceMirror: input.shouldSurfaceMirror,
    insights: input.insights,
    provider: input.provider
  };
}
