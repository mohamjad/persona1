import { z } from "zod";
import {
  ColdStartContextSchema,
  MirrorInsightSchema,
  PersonaInteractionSchema,
  PersonaProfileSchema
} from "../../../packages/persona-engine/src/index.js";

export const ConversationPresetSchema = z.enum([
  "date",
  "pitch",
  "negotiate",
  "apologize",
  "reconnect",
  "confront",
  "close",
  "decline"
]);

export const RecipientContextSchema = z.object({
  recipientName: z.string().nullable(),
  recipientHandle: z.string().nullable(),
  communicationStyle: z.enum(["formal", "casual", "professional", "warm", "terse", "verbose"]),
  emotionalStateSignals: z.array(z.string()),
  relationshipType: z.enum(["stranger", "acquaintance", "colleague", "romantic", "friend"]),
  platform: z.enum(["linkedin", "twitter", "gmail", "dating_app", "slack", "other"]),
  threadSummary: z.string(),
  recipientLastMessage: z.string().nullable(),
  inferredWants: z.string(),
  inferredConcerns: z.string(),
  contextConfidence: z.number().int().min(0).max(100)
});

export const MoveAnnotationSchema = z.enum(["!!", "!", "!?", "?!", "?", "??"]);

export const DraftAssessmentSchema = z.object({
  annotation: MoveAnnotationSchema,
  label: z.string().min(1),
  reason: z.string().min(1)
});

export const BranchOptionSchema = z.object({
  optionId: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  isRecommended: z.boolean(),
  annotation: MoveAnnotationSchema,
  moveLabel: z.string().min(1),
  message: z.string().min(1),
  predictedResponse: z.string().min(1),
  opponentMoveType: z.string().min(1),
  branchPath: z.string().min(1),
  strategicPayoff: z.string().min(1),
  goalAlignmentScore: z.number().int().min(0).max(100),
  whyItWorks: z.string().min(1),
  risk: z.string().nullable()
});

export const BranchTreeSchema = z.object({
  draftAssessment: DraftAssessmentSchema,
  branches: z
    .array(BranchOptionSchema)
    .length(3)
    .superRefine((branches, ctx) => {
      const optionIds = branches.map((branch) => branch.optionId);
      const uniqueOptionIds = new Set(optionIds);
      if (uniqueOptionIds.size !== 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Expected exactly one branch for option ids 1, 2, and 3."
        });
      }

      const recommendedCount = branches.filter((branch) => branch.isRecommended).length;
      if (recommendedCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Expected exactly one recommended branch."
        });
      }
    })
});

export const AnalyzeRequestSchema = z.object({
  draft: z.string().min(1),
  preset: ConversationPresetSchema,
  userId: z.string().min(1),
  context: RecipientContextSchema,
  coldStartContext: ColdStartContextSchema.optional(),
  personaProfile: PersonaProfileSchema.optional()
});

export const AnalyzeResponseSchema = z.object({
  draftAssessment: DraftAssessmentSchema,
  branches: BranchTreeSchema.shape.branches,
  personaVersionUsed: z.number().int().positive(),
  provider: z.literal("openrouter"),
  model: z.string().min(1)
});

export const PersonaUpdateRequestSchema = z.object({
  userId: z.string().min(1),
  currentPersona: PersonaProfileSchema,
  interaction: PersonaInteractionSchema
});

export const PersonaUpdateResponseSchema = z.object({
  updatedPersona: PersonaProfileSchema,
  mirrorInsights: z.array(MirrorInsightSchema),
  provider: z.enum(["deterministic", "openrouter"])
});

export const MirrorCheckRequestSchema = z.object({
  userId: z.string().min(1),
  personaProfile: PersonaProfileSchema,
  minimumEvidenceCount: z.number().int().positive().default(3)
});

export const MirrorCheckResponseSchema = z.object({
  shouldSurfaceMirror: z.boolean(),
  insights: z.array(MirrorInsightSchema),
  provider: z.enum(["deterministic", "openrouter"])
});

export type ConversationPreset = z.infer<typeof ConversationPresetSchema>;
export type RecipientContext = z.infer<typeof RecipientContextSchema>;
export type MoveAnnotation = z.infer<typeof MoveAnnotationSchema>;
export type DraftAssessment = z.infer<typeof DraftAssessmentSchema>;
export type BranchOption = z.infer<typeof BranchOptionSchema>;
export type BranchTree = z.infer<typeof BranchTreeSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;
export type PersonaUpdateRequest = z.infer<typeof PersonaUpdateRequestSchema>;
export type PersonaUpdateResponse = z.infer<typeof PersonaUpdateResponseSchema>;
export type MirrorCheckRequest = z.infer<typeof MirrorCheckRequestSchema>;
export type MirrorCheckResponse = z.infer<typeof MirrorCheckResponseSchema>;
