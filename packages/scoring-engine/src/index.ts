import { Engine } from "json-rules-engine";
import { z } from "zod";
import type { ConversationPreset, RecipientContext } from "../../ai-kernel/src/contracts.js";
import type { PersonaProfile } from "../../persona-engine/src/index.js";

export const ScoringConfigSchema = z.object({
  sessionKey: z.string().min(1),
  primaryGoal: z.string().min(1),
  toneTarget: z.string().min(1),
  platform: z.string().min(1),
  relationshipType: z.string().min(1),
  recipientSensitivity: z.number().min(0).max(1),
  weights: z.object({
    genericFollowUpPenalty: z.number(),
    hedgePenalty: z.number(),
    ambiguityPenalty: z.number(),
    clarityQuestionBonus: z.number(),
    concreteChoiceBonus: z.number(),
    nextStepBonus: z.number(),
    overlongPenalty: z.number(),
    warmthBonus: z.number(),
    pressurePenalty: z.number()
  }),
  thresholds: z.object({
    brilliant: z.number(),
    good: z.number(),
    interesting: z.number(),
    dubious: z.number(),
    weak: z.number()
  })
});

export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

export interface DraftScoreResult {
  annotation: "-" | "!!" | "!" | "!?" | "?!" | "?" | "??";
  label: string;
  reason: string;
  score: number;
  confidence: number;
  matchedRules: string[];
  sessionKey: string;
}

interface ScoringInput {
  draft: string;
  context: RecipientContext;
  personaProfile: PersonaProfile;
  preset: ConversationPreset;
}

export function buildScoringConfig(input: ScoringInput): ScoringConfig {
  const lowerGoalHint = `${input.context.conversationGoalHint || ""} ${input.context.inferredConcerns || ""}`.toLowerCase();
  const professional = ["linkedin", "gmail", "slack"].includes(input.context.platform);
  const romantic = input.context.relationshipType === "romantic";
  const asksForBrevity = /\bshort|brief|summary|one-line|one line\b/.test(lowerGoalHint);
  const highSensitivity = /\bawkward|pressure|time|friction|ambiguity\b/.test(lowerGoalHint);

  const directness = input.personaProfile.communicationDefaults?.directness || "medium";
  const warmthBaseline = input.personaProfile.communicationDefaults?.warmthBaseline || "medium";

  return {
    sessionKey: buildSessionKey(input),
    primaryGoal: input.context.conversationGoalHint || defaultGoalForPreset(input.preset),
    toneTarget: romantic
      ? "warm and calibrated"
      : professional
        ? "direct and competent"
        : "clear and grounded",
    platform: input.context.platform,
    relationshipType: input.context.relationshipType,
    recipientSensitivity: highSensitivity ? 0.8 : romantic ? 0.7 : 0.45,
    weights: {
      genericFollowUpPenalty: professional ? -2.9 : -2.2,
      hedgePenalty: directness === "medium-high" ? -1.4 : -1.0,
      ambiguityPenalty: asksForBrevity ? -1.8 : -1.2,
      clarityQuestionBonus: asksForBrevity ? 1.9 : 1.2,
      concreteChoiceBonus: 1.8,
      nextStepBonus: professional ? 1.5 : 1.1,
      overlongPenalty: professional ? -1.5 : -1.1,
      warmthBonus: warmthBaseline.includes("high") ? 0.8 : 0.3,
      pressurePenalty: highSensitivity ? -1.6 : -0.7
    },
    thresholds: {
      brilliant: 3.8,
      good: 2.2,
      interesting: 0.9,
      dubious: -0.3,
      weak: -1.3
    }
  };
}

export async function evaluateDraftWithConfig(input: {
  draft: string;
  config: ScoringConfig;
}): Promise<DraftScoreResult> {
  const draft = String(input.draft || "").trim();
  if (!draft) {
    return {
      annotation: "-",
      label: "not enough board yet",
      reason: "there is not enough draft text to justify a rational move.",
      score: -3,
      confidence: 0.95,
      matchedRules: ["empty_draft"],
      sessionKey: input.config.sessionKey
    };
  }

  const wordCount = draft.split(/\s+/).filter(Boolean).length;
  if (draft.length < 8 || wordCount < 2) {
    return {
      annotation: "-",
      label: "too early to score",
      reason: "there is not enough signal in the draft to score the move cleanly.",
      score: -1.5,
      confidence: 0.82,
      matchedRules: ["insufficient_signal"],
      sessionKey: input.config.sessionKey
    };
  }

  const facts = deriveFacts(draft);
  const engine = new Engine();
  const matchedRules: string[] = [];
  let score = 0;
  let strongestReason = "the line is readable but not yet strategically sharp.";

  for (const rule of buildRules(input.config)) {
    engine.addRule(rule);
  }

  engine.on("success", async (event) => {
    const delta = Number(event.params?.delta || 0);
    const reason = String(event.params?.reason || "");
    score += delta;
    matchedRules.push(String(event.type));
    if (Math.abs(delta) >= 1.4 || strongestReason === "the line is readable but not yet strategically sharp.") {
      strongestReason = reason;
    }
  });

  await engine.run(facts);

  score += draft.length >= 18 && draft.length <= 180 ? 0.45 : 0;
  score += facts.hasQuestion ? 0.25 : 0;
  score += facts.hasConcreteTime ? 0.25 : 0;
  if (facts.isAllLowercase && facts.exclamationCount === 0) {
    score += 0.1;
  }

  const absoluteScore = Math.min(Math.abs(score) / 4.5, 1);
  const confidence = Math.min(0.45 + absoluteScore * 0.4 + matchedRules.length * 0.05, 0.96);
  const { annotation, label } = mapScoreToAnnotation(score, input.config);

  return {
    annotation,
    label,
    reason: strongestReason,
    score: Number(score.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    matchedRules,
    sessionKey: input.config.sessionKey
  };
}

function buildRules(config: ScoringConfig) {
  return [
    createBooleanRule("generic_follow_up", "genericFollowUp", config.weights.genericFollowUpPenalty, "the draft sounds like a generic follow-up and gives away initiative."),
    createBooleanRule("hedge_language", "hedgeLanguage", config.weights.hedgePenalty, "the draft hedges instead of making a clean move."),
    createBooleanRule("ambiguous_ask", "ambiguousAsk", config.weights.ambiguityPenalty, "the ask is vague enough that the other person can slide past it."),
    createBooleanRule("clarity_question", "clarityQuestion", config.weights.clarityQuestionBonus, "the line narrows the next move and makes the reply easier to predict."),
    createBooleanRule("concrete_choice", "concreteChoice", config.weights.concreteChoiceBonus, "the draft gives a bounded choice instead of a mushy reopen."),
    createBooleanRule("explicit_next_step", "explicitNextStep", config.weights.nextStepBonus, "the line makes the next step concrete without overexplaining."),
    createBooleanRule("overlong", "overlong", config.weights.overlongPenalty, "the draft is longer than the current context can support."),
    createBooleanRule("warm_but_clear", "warmButClear", config.weights.warmthBonus, "the line stays human without losing shape."),
    createBooleanRule("pressure_without_frame", "pressureWithoutFrame", config.weights.pressurePenalty, "the draft adds pressure before it has earned control.")
  ];
}

function createBooleanRule(type: string, fact: string, delta: number, reason: string) {
  return {
    conditions: {
      all: [{ fact, operator: "equal", value: true }]
    },
    event: {
      type,
      params: { delta, reason }
    }
  };
}

function deriveFacts(draft: string) {
  const lower = draft.toLowerCase();
  return {
    genericFollowUp: /\b(just checking in|circling back|wanted to follow up|following up|hope you are well)\b/.test(lower),
    hedgeLanguage: /\b(maybe|kind of|sort of|just wanted|was wondering|if that makes sense)\b/.test(lower),
    ambiguousAsk: !/[?]/.test(draft) && !/\b(call|meeting|summary|version|pick|choose|send|reply)\b/.test(lower),
    clarityQuestion: /[?]/.test(draft) && /\b(what|which|want|prefer|would)\b/.test(lower),
    concreteChoice: /\b(or|either)\b/.test(lower) && /[?]/.test(draft),
    explicitNextStep: /\b(call|meeting|demo|summary|version|send)\b/.test(lower),
    overlong: draft.length > 220,
    warmButClear: /\bthanks|appreciate|glad\b/.test(lower) && /[?]/.test(draft),
    pressureWithoutFrame: /\bseriously|actually|need you to|asap|right away\b/.test(lower),
    hasQuestion: /[?]/.test(draft),
    hasConcreteTime: /\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|\d{1,2}(:\d{2})?\s?(am|pm))\b/.test(lower),
    isAllLowercase: draft === lower,
    exclamationCount: (draft.match(/!/g) || []).length
  };
}

function mapScoreToAnnotation(score: number, config: ScoringConfig) {
  if (score >= config.thresholds.brilliant) {
    return { annotation: "!!" as const, label: "brilliant move" };
  }
  if (score >= config.thresholds.good) {
    return { annotation: "!" as const, label: "playable move" };
  }
  if (score >= config.thresholds.interesting) {
    return { annotation: "!?" as const, label: "interesting move" };
  }
  if (score >= config.thresholds.dubious) {
    return { annotation: "?!" as const, label: "soft edge" };
  }
  if (score >= config.thresholds.weak) {
    return { annotation: "?" as const, label: "weak move" };
  }
  return { annotation: "??" as const, label: "blunder risk" };
}

function defaultGoalForPreset(preset: ConversationPreset) {
  switch (preset) {
    case "negotiate":
      return "protect leverage while clarifying terms";
    case "pitch":
      return "earn a concrete next step";
    case "date":
      return "create momentum without over-investing";
    case "decline":
      return "close the thread cleanly without extra drag";
    default:
      return "move the conversation forward without losing leverage";
  }
}

function buildSessionKey(input: ScoringInput) {
  const raw = JSON.stringify({
    preset: input.preset,
    platform: input.context.platform,
    relationshipType: input.context.relationshipType,
    recipientHandle: input.context.recipientHandle || input.context.recipientName || "",
    goal: input.context.conversationGoalHint || "",
    personaVersion: input.personaProfile.version
  });
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `score_${hash.toString(16)}`;
}
