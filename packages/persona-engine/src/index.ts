export {
  ColdStartContextSchema,
  LearningPhaseSchema,
  OutcomeLabelSchema,
  CommunicationDefaultsSchema,
  ObservedPatternSchema,
  ContextPerformanceEntrySchema,
  PlatformCalibrationEntrySchema,
  MirrorInsightSchema,
  PersonaInteractionSchema,
  PersonaProfileSchema,
  type ColdStartContext,
  type LearningPhase,
  type OutcomeLabel,
  type MirrorInsight,
  type PersonaInteraction,
  type PersonaProfile
} from "./schema.js";
export { createBootstrapPersonaProfile } from "./bootstrap.js";
export {
  applyDeterministicPersonaUpdate,
  createEmptyMirrorInsights,
  deriveMirrorInsights,
  mergePersonaProfiles
} from "./update.js";
