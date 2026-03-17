import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { BranchOption, BranchTree, ConversationPreset, RecipientContext } from "../../ai-kernel/src/contracts.js";
import type { PersonaProfile } from "../../persona-engine/src/index.js";
import type { DraftScoreResult, ScoringConfig } from "../../scoring-engine/src/index.js";

const BranchState = Annotation.Root({
  branchTree: Annotation<BranchTree>,
  context: Annotation<RecipientContext>,
  preset: Annotation<ConversationPreset>,
  draft: Annotation<string>,
  personaProfile: Annotation<PersonaProfile>,
  scoringConfig: Annotation<ScoringConfig>,
  draftAssessment: Annotation<DraftScoreResult | null>,
  relevantMemories: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  enrichedBranches: Annotation<BranchOption[]>({
    reducer: (_left, right) => right,
    default: () => []
  })
});

export async function runBranchIntelligence(input: {
  branchTree: BranchTree;
  context: RecipientContext;
  preset: ConversationPreset;
  draft: string;
  personaProfile: PersonaProfile;
  scoringConfig: ScoringConfig;
  draftAssessment: DraftScoreResult | null;
  relevantMemories?: string[];
}) {
  const graph = new StateGraph(BranchState)
    .addNode("simulate", async (state) => ({
      enrichedBranches: state.branchTree.branches.map((branch) =>
        enrichBranch({
          branch,
          context: state.context,
          scoringConfig: state.scoringConfig,
          draftAssessment: state.draftAssessment,
          relevantMemories: state.relevantMemories
        })
      )
    }))
    .addNode("rerank", async (state) => ({
      branchTree: {
        ...state.branchTree,
        branches: rerankBranches(state.enrichedBranches)
      }
    }))
    .addEdge(START, "simulate")
    .addEdge("simulate", "rerank")
    .addEdge("rerank", END)
    .compile();

  const result = await graph.invoke({
    ...input,
    enrichedBranches: []
  });

  return result.branchTree;
}

function enrichBranch(input: {
  branch: BranchOption;
  context: RecipientContext;
  scoringConfig: ScoringConfig;
  draftAssessment: DraftScoreResult | null;
  relevantMemories: string[];
}) {
  const message = input.branch.message.toLowerCase();
  const predicted = input.branch.predictedResponse.toLowerCase();
  let lookaheadScore = input.branch.goalAlignmentScore;

  if (/\b(which|what|would|prefer|pick|choose)\b/.test(message)) {
    lookaheadScore += 6;
  }
  if (/\bcall|meeting|time|tomorrow|week|version|summary\b/.test(message)) {
    lookaheadScore += 4;
  }
  if (/\bjust checking in|circling back|follow up\b/.test(message)) {
    lookaheadScore -= 8;
  }
  if (/\bmaybe|kind of|sort of|just\b/.test(message)) {
    lookaheadScore -= 6;
  }
  if (input.context.dialogueState === "soft_rejection" && /\bpressure|which is it|yes\/no\b/.test(message)) {
    lookaheadScore -= 7;
  }
  if (input.context.dialogueState === "needs_clarity" && /\bsummary|one-line|clarify|version\b/.test(message)) {
    lookaheadScore += 7;
  }
  if (input.context.dialogueState === "pricing_friction" && /\bprice|scope|budget|terms\b/.test(message)) {
    lookaheadScore += 5;
  }
  if (input.context.dialogueState === "schedule_alignment" && /\btime|calendar|this week|tomorrow\b/.test(message)) {
    lookaheadScore += 5;
  }
  if (predicted.includes("ignore") || predicted.includes("ghost")) {
    lookaheadScore -= 5;
  }
  if (input.relevantMemories.some((memory) => overlaps(memory, input.branch.message))) {
    lookaheadScore += 3;
  }
  if (input.draftAssessment?.annotation === "??" && input.branch.annotation === "!") {
    lookaheadScore += 2;
  }

  const boundedScore = clamp(Math.round(lookaheadScore), 0, 100);
  return {
    ...input.branch,
    lookaheadSummary: buildLookaheadSummary({
      branch: input.branch,
      dialogueState: input.context.dialogueState || "low_signal",
      score: boundedScore
    }),
    lookaheadScore: boundedScore,
    simulationConfidence: boundedScore >= 75 ? 0.78 : boundedScore >= 55 ? 0.68 : 0.58,
    simulationSource: "langgraph" as const
  };
}

function rerankBranches(branches: BranchOption[]) {
  const ranked = [...branches]
    .sort((left, right) => {
      const rightScore = (right.lookaheadScore ?? right.goalAlignmentScore) + (right.isRecommended ? 1 : 0);
      const leftScore = (left.lookaheadScore ?? left.goalAlignmentScore) + (left.isRecommended ? 1 : 0);
      return rightScore - leftScore;
    })
    .map((branch, index) => ({
      ...branch,
      isRecommended: index === 0
    }));

  return ranked
    .sort((left, right) => left.optionId - right.optionId)
    .map((branch) => ({
      ...branch,
      goalAlignmentScore: clamp(Math.round(branch.goalAlignmentScore), 0, 100)
    }));
}

function buildLookaheadSummary(input: {
  branch: BranchOption;
  dialogueState: string;
  score: number;
}) {
  const branchPressure =
    input.branch.risk && /pressure|thin|high/.test(input.branch.risk.toLowerCase()) ? "high" : "controlled";

  return [
    `state: ${input.dialogueState}`,
    `next: ${input.branch.predictedResponse}`,
    `pressure: ${branchPressure}`,
    `outlook: ${input.score >= 70 ? "likely to move the thread forward" : input.score >= 50 ? "playable with some risk" : "fragile unless the read is right"}`
  ].join(" | ");
}

function overlaps(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  return tokenize(right).some((token) => leftTokens.has(token));
}

function tokenize(value: string) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
