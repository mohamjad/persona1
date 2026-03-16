import { z } from "zod";
import { RecipientContextSchema } from "./contracts.js";

export const RawConversationSnapshotSchema = z.object({
  platform: z.string().min(1),
  pageTitle: z.string().nullable(),
  visibleText: z.string().min(1),
  draft: z.string().nullable(),
  hints: z.array(z.string()).default([])
});

export const ContextExtractorRequestSchema = z.object({
  snapshot: RawConversationSnapshotSchema
});

export const ContextExtractorResponseSchema = RecipientContextSchema;

export type RawConversationSnapshot = z.infer<typeof RawConversationSnapshotSchema>;
export type ContextExtractorRequest = z.infer<typeof ContextExtractorRequestSchema>;
export type ContextExtractorResponse = z.infer<typeof ContextExtractorResponseSchema>;

export function buildContextExtractorPrompt(input: z.infer<typeof ContextExtractorRequestSchema>) {
  return {
    expectedContract: "context_extractor_v1" as const,
    messages: [
      {
        role: "system" as const,
        content: [
          "You normalize a raw conversation snapshot into persona1 recipient context JSON.",
          "Do not invent details not supported by the snapshot.",
          "Return JSON only.",
          "Output schema:",
          "{\"recipientName\":string|null,\"recipientHandle\":string|null,\"communicationStyle\":\"formal\"|\"casual\"|\"professional\"|\"warm\"|\"terse\"|\"verbose\",\"emotionalStateSignals\":string[],\"relationshipType\":\"stranger\"|\"acquaintance\"|\"colleague\"|\"romantic\"|\"friend\",\"platform\":\"linkedin\"|\"twitter\"|\"gmail\"|\"dating_app\"|\"slack\"|\"other\",\"threadSummary\":string,\"recipientLastMessage\":string|null,\"inferredWants\":string,\"inferredConcerns\":string,\"contextConfidence\":0-100}"
        ].join("\n")
      },
      {
        role: "user" as const,
        content: JSON.stringify(input.snapshot)
      }
    ]
  };
}
