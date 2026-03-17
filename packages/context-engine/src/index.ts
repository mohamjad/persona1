import {
  Culture,
  recognizeCurrency,
  recognizeDateTime,
  recognizeEmail,
  recognizeMention,
  recognizeNumber,
  recognizeURL
} from "@microsoft/recognizers-text-suite";
import type { RecipientContext } from "../../ai-kernel/src/contracts.js";

export interface StructuredContextFacts {
  dates: string[];
  amounts: string[];
  numbers: string[];
  urls: string[];
  emails: string[];
  mentions: string[];
}

export interface ContextEnrichment {
  structuredFacts: StructuredContextFacts;
  recipientSentiment: "positive" | "neutral" | "negative";
  sentimentConfidence: number;
  dialogueState:
    | "warm_open"
    | "needs_clarity"
    | "pricing_friction"
    | "schedule_alignment"
    | "soft_rejection"
    | "low_signal";
  combinedSummary: string;
}

let sentimentPipelinePromise: Promise<any> | null = null;

export async function enrichRecipientContext(context: RecipientContext): Promise<ContextEnrichment> {
  const sourceText = [context.recipientLastMessage, context.currentConversationSummary, context.threadSummary]
    .filter(Boolean)
    .join("\n");
  const structuredFacts = extractStructuredFacts(sourceText);
  const sentiment = await classifyRecipientSentiment(context.recipientLastMessage || sourceText);
  const dialogueState = deriveDialogueState({
    context,
    sentiment: sentiment.label,
    structuredFacts
  });

  return {
    structuredFacts,
    recipientSentiment: sentiment.label,
    sentimentConfidence: sentiment.confidence,
    dialogueState,
    combinedSummary: [
      context.currentConversationSummary || context.threadSummary,
      context.recipientLastMessage ? `last message: ${context.recipientLastMessage}` : null,
      structuredFacts.dates.length ? `dates: ${structuredFacts.dates.join(", ")}` : null,
      structuredFacts.amounts.length ? `amounts: ${structuredFacts.amounts.join(", ")}` : null,
      `state: ${dialogueState}`
    ]
      .filter(Boolean)
      .join(" | ")
  };
}

export function extractStructuredFacts(text: string): StructuredContextFacts {
  const safe = String(text || "");
  return {
    dates: dedupe(
      recognizeDateTime(safe, Culture.English).map((item) => item.resolution?.values?.[0]?.timex || item.text).filter(Boolean)
    ),
    amounts: dedupe(recognizeCurrency(safe, Culture.English).map((item) => item.text).filter(Boolean)),
    numbers: dedupe(recognizeNumber(safe, Culture.English).map((item) => item.text).filter(Boolean)),
    urls: dedupe(recognizeURL(safe, Culture.English).map((item) => item.text).filter(Boolean)),
    emails: dedupe(recognizeEmail(safe, Culture.English).map((item) => item.text).filter(Boolean)),
    mentions: dedupe(recognizeMention(safe, Culture.English).map((item) => item.text).filter(Boolean))
  };
}

export async function classifyRecipientSentiment(text: string): Promise<{
  label: "positive" | "neutral" | "negative";
  confidence: number;
}> {
  const safe = String(text || "").trim();
  if (!safe) {
    return { label: "neutral", confidence: 0.4 };
  }

  try {
    if (!sentimentPipelinePromise) {
      sentimentPipelinePromise = import("@xenova/transformers").then(async (module) => {
        module.env.allowLocalModels = false;
        module.env.useBrowserCache = false;
        return module.pipeline("sentiment-analysis", "Xenova/distilbert-base-uncased-finetuned-sst-2-english");
      });
    }
    const pipeline = await sentimentPipelinePromise;
    const result = await pipeline(safe, { topk: 1 });
    const top = Array.isArray(result) ? result[0] : result;
    const label = String(top?.label || "").toLowerCase();
    if (label.includes("negative")) {
      return { label: "negative", confidence: Number(top?.score || 0.7) };
    }
    if (label.includes("positive")) {
      return { label: "positive", confidence: Number(top?.score || 0.7) };
    }
  } catch {
    // fall through to heuristic classification
  }

  const lower = safe.toLowerCase();
  if (/\b(no|can't|cannot|not now|not interested|later|busy|pass|decline)\b/.test(lower)) {
    return { label: "negative", confidence: 0.72 };
  }
  if (/\b(yes|sounds good|works|great|perfect|let's do it|happy to)\b/.test(lower)) {
    return { label: "positive", confidence: 0.72 };
  }
  return { label: "neutral", confidence: 0.55 };
}

function deriveDialogueState(input: {
  context: RecipientContext;
  sentiment: "positive" | "neutral" | "negative";
  structuredFacts: StructuredContextFacts;
}): ContextEnrichment["dialogueState"] {
  const lower = `${input.context.recipientLastMessage || ""} ${input.context.threadSummary}`.toLowerCase();
  if (!lower.trim()) {
    return "low_signal";
  }
  if (input.structuredFacts.amounts.length > 0 || /\b(price|budget|cost|rate|terms)\b/.test(lower)) {
    return "pricing_friction";
  }
  if (input.structuredFacts.dates.length > 0 || /\b(calendar|schedule|time|day|week|meeting|call)\b/.test(lower)) {
    return "schedule_alignment";
  }
  if (/\b(short|brief|version|summary|clarify|unclear)\b/.test(lower)) {
    return "needs_clarity";
  }
  if (input.sentiment === "negative" || /\b(not now|not interested|later|pass)\b/.test(lower)) {
    return "soft_rejection";
  }
  return input.sentiment === "positive" ? "warm_open" : "needs_clarity";
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(0, 6);
}
