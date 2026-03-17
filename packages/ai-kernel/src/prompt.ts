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
  expectedContract: "branch_tree_v2";
}

export function buildBranchGeneratorPrompt(input: {
  draft: string;
  preset: ConversationPreset;
  context: RecipientContext;
  personaProfile: PersonaProfile;
  voicePackId?: string | null;
  voicePackText?: string | null;
}): PromptBundle {
  return {
    expectedContract: "branch_tree_v2",
    messages: [
      {
        role: "system",
        content: [
          "You are the inference engine for persona1, a conversation intelligence system.",
          "You are not a rewrite assistant. You are modeling the board state of a live conversation.",
          "You receive a sender persona model, recipient context, a situation preset, a voice pack, and a draft.",
          "Generate exactly 3 strategically distinct moves with predicted branches.",
          "Critical rules:",
          "1. Every move must sound like the sender, not generic AI.",
          "2. The three moves must differ by strategy, not just wording. Examples: low-friction reopen, clean pressure, narrower ask, controlled tension, test of intent.",
          "3. Predicted responses must be specific enough to be wrong. Name the likely move, excuse, deflection, ask, dodge, or emotional reaction.",
          "3a. Think outcome-first. The visible consequence of each move should be sharper than the wording itself.",
          "4. Branch paths must name concrete downstream consequences, not vague momentum language.",
          "5. Score the current draft with a chess-style annotation: !!, !, !?, ?!, ?, ??.",
          "6. Score each move with the same annotation system.",
          "7. The recommended move is the one with the best strategic payoff for the stated goal, not the nicest or safest line.",
          "8. Avoid generic assistant language unless the persona clearly speaks that way. Avoid filler like 'just checking in', 'hope you're well', 'I'd be happy to', 'circling back', and generic polished outreach phrasing by default.",
          "9. Do not moralize. Do not add disclaimers. Show the board.",
          "10. whyItWorks, strategicPayoff, and risk must be concrete and short.",
          "11. If the user's draft is already strong, say so. Do not invent a negative reason just to justify new options.",
          "Return JSON only.",
          "Output schema:",
          "{\"draftAssessment\":{\"annotation\":\"!!|!|!?|?!|?|??\",\"label\":string,\"reason\":string},\"branches\":[{\"optionId\":1|2|3,\"isRecommended\":boolean,\"annotation\":\"!!|!|!?|?!|?|??\",\"moveLabel\":string,\"message\":string,\"predictedResponse\":string,\"opponentMoveType\":string,\"branchPath\":string,\"strategicPayoff\":string,\"goalAlignmentScore\":0-100,\"whyItWorks\":string,\"risk\":string|null}]}",
          "There must be exactly 3 branches and exactly 1 recommended branch.",
          "A bad prediction: 'they may respond positively.'",
          "A good prediction: 'they will probably ask for the one-line summary first and avoid committing to a call.'",
          "Bad move labels: 'option 1', 'soft version', 'better rewrite'.",
          "Good move labels: 'tighten the ask', 'hold frame', 'test intent'."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Preset: ${input.preset}`,
          `Voice pack id: ${input.voicePackId || "none"}`,
          `Voice pack instructions:\n${input.voicePackText?.trim() || "No explicit voice pack. Stay close to the persona profile."}`,
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
    draftAssessment: input.branchTree.draftAssessment,
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
