import { z } from "zod";

export const ColdStartContextSchema = z.enum(["dating", "professional", "general"]);
export const LearningPhaseSchema = z.enum(["observation", "active_calibration", "mirror_activation"]);
export const OutcomeLabelSchema = z.enum(["positive", "neutral", "negative", "unknown"]);

export const CommunicationDefaultsSchema = z.object({
  formalityRange: z.string(),
  humorStyle: z.string(),
  emotionalExpression: z.string(),
  directness: z.string(),
  warmthBaseline: z.string()
});

export const PerformanceRatingSchema = z.object({
  mu: z.number(),
  sigma: z.number(),
  ordinal: z.number(),
  matches: z.number().int().nonnegative()
});

export const ObservedPatternSchema = z.object({
  pattern: z.string().min(1),
  count: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  firstSeenAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true })
});

export const ContextPerformanceEntrySchema = z.object({
  positiveOutcomes: z.number().int().nonnegative(),
  negativeOutcomes: z.number().int().nonnegative(),
  neutral: z.number().int().nonnegative()
});

export const PlatformCalibrationEntrySchema = z.object({
  toneShift: z.string(),
  confidence: z.number().min(0).max(1)
});

export const MirrorInsightSchema = z.object({
  insightId: z.string().min(1),
  observation: z.string().min(1),
  supportingPattern: z.string().min(1),
  evidenceCount: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime({ offset: true }),
  status: z.enum(["active", "dismissed"])
});

export const PersonaInteractionSchema = z.object({
  interactionId: z.string().min(1),
  sessionId: z.string().min(1),
  platform: z.enum(["linkedin", "twitter", "gmail", "dating_app", "slack", "other"]),
  preset: z.enum(["date", "pitch", "negotiate", "apologize", "reconnect", "confront", "close", "decline"]),
  draftRaw: z.string().min(1),
  draftFinal: z.string().nullable(),
  chosenOptionId: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  optionRejectedIds: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).default([]),
  recipientContextHash: z.string().min(1),
  outcome: OutcomeLabelSchema,
  observedSignals: z.array(z.string()).default([])
});

export const PersonaProfileSchema = z.object({
  version: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  learningPhase: LearningPhaseSchema,
  communicationDefaults: CommunicationDefaultsSchema,
  performanceRating: PerformanceRatingSchema,
  observedPatterns: z.array(ObservedPatternSchema),
  knownStrengths: z.array(z.string()),
  knownWeaknesses: z.array(z.string()),
  contextPerformance: z.record(ContextPerformanceEntrySchema),
  platformCalibration: z.record(PlatformCalibrationEntrySchema),
  lastUpdated: z.string().datetime({ offset: true }),
  interactionCount: z.number().int().nonnegative(),
  coldStartContext: ColdStartContextSchema,
  lastMirrorAt: z.string().datetime({ offset: true }).nullable()
});

export type ColdStartContext = z.infer<typeof ColdStartContextSchema>;
export type LearningPhase = z.infer<typeof LearningPhaseSchema>;
export type OutcomeLabel = z.infer<typeof OutcomeLabelSchema>;
export type PersonaProfile = z.infer<typeof PersonaProfileSchema>;
export type PersonaInteraction = z.infer<typeof PersonaInteractionSchema>;
export type MirrorInsight = z.infer<typeof MirrorInsightSchema>;
export type PerformanceRating = z.infer<typeof PerformanceRatingSchema>;
