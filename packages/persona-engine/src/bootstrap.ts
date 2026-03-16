import { ColdStartContextSchema, type ColdStartContext, type PersonaProfile } from "./schema.js";

export function createBootstrapPersonaProfile(input: {
  coldStartContext: ColdStartContext;
  now?: string;
}): PersonaProfile {
  const coldStartContext = ColdStartContextSchema.parse(input.coldStartContext);
  const now = input.now ?? new Date().toISOString();

  return {
    version: 1,
    confidence: 0.2,
    learningPhase: "observation",
    communicationDefaults: buildDefaultCommunicationProfile(coldStartContext),
    observedPatterns: [],
    knownStrengths: [],
    knownWeaknesses: [],
    contextPerformance: {
      [coldStartContext]: {
        positiveOutcomes: 0,
        negativeOutcomes: 0,
        neutral: 0
      }
    },
    platformCalibration: {
      default: {
        toneShift: "stay close to the user's natural rhythm",
        confidence: 0.2
      }
    },
    lastUpdated: now,
    interactionCount: 0,
    coldStartContext,
    lastMirrorAt: null
  };
}

function buildDefaultCommunicationProfile(coldStartContext: ColdStartContext) {
  switch (coldStartContext) {
    case "dating":
      return {
        formalityRange: "low",
        humorStyle: "light, conversational",
        emotionalExpression: "visible",
        directness: "medium",
        warmthBaseline: "medium-high"
      };
    case "professional":
      return {
        formalityRange: "medium-high",
        humorStyle: "minimal",
        emotionalExpression: "suppressed",
        directness: "medium",
        warmthBaseline: "medium"
      };
    case "general":
      return {
        formalityRange: "medium",
        humorStyle: "situational",
        emotionalExpression: "balanced",
        directness: "medium",
        warmthBaseline: "medium"
      };
  }
}
