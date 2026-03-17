export {
  ColdStartContextSchema,
  LearningPhaseSchema,
  OutcomeLabelSchema,
  CommunicationDefaultsSchema,
  ObservedPatternSchema,
  ContextPerformanceEntrySchema,
  PlatformCalibrationEntrySchema,
  PerformanceRatingSchema,
  MirrorInsightSchema,
  PersonaInteractionSchema,
  PersonaProfileSchema,
  type ColdStartContext,
  type LearningPhase,
  type OutcomeLabel,
  type MirrorInsight,
  type PerformanceRating,
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
