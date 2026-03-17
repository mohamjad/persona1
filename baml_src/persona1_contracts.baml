class CommunicationDefaults {
  formalityRange string
  humorStyle string
  emotionalExpression string
  directness string
  warmthBaseline string
}

class ObservedPattern {
  pattern string
  count int
  confidence float
  firstSeenAt string
  lastSeenAt string
}

class PersonaProfile {
  version int
  confidence float
  learningPhase string
  communicationDefaults CommunicationDefaults
  performanceRating PerformanceRating
  observedPatterns ObservedPattern[]
  knownStrengths string[]
  knownWeaknesses string[]
  interactionCount int
  coldStartContext "dating" | "professional" | "general"
  lastUpdated string
  lastMirrorAt string?
}

class PerformanceRating {
  mu float
  sigma float
  ordinal float
  matches int
}

class StructuredContextFacts {
  dates string[]
  amounts string[]
  numbers string[]
  urls string[]
  emails string[]
  mentions string[]
}

class ContextOutput {
  recipientName string?
  recipientHandle string?
  communicationStyle "formal" | "casual" | "professional" | "warm" | "terse" | "verbose"
  emotionalStateSignals string[]
  relationshipType "stranger" | "acquaintance" | "colleague" | "romantic" | "friend"
  platform "linkedin" | "twitter" | "gmail" | "dating_app" | "slack" | "other"
  threadSummary string
  recipientLastMessage string?
  inferredWants string
  inferredConcerns string
  contextConfidence int
  currentConversationSummary string
  recentMessages string[]
  conversationGoalHint string
  structuredFacts StructuredContextFacts?
  recipientSentiment "positive" | "neutral" | "negative"?
  sentimentConfidence float?
  dialogueState "warm_open" | "needs_clarity" | "pricing_friction" | "schedule_alignment" | "soft_rejection" | "low_signal"?
  combinedSummary string?
}

class ScoringWeights {
  genericFollowUpPenalty float
  hedgePenalty float
  ambiguityPenalty float
  clarityQuestionBonus float
  concreteChoiceBonus float
  nextStepBonus float
  overlongPenalty float
  warmthBonus float
  pressurePenalty float
}

class ScoringThresholds {
  brilliant float
  good float
  interesting float
  dubious float
  weak float
}

class ScoringConfig {
  sessionKey string
  primaryGoal string
  toneTarget string
  platform string
  relationshipType string
  recipientSensitivity float
  weights ScoringWeights
  thresholds ScoringThresholds
}

class AnnotationOutput {
  annotation "-" | "!!" | "!" | "!?" | "?!" | "?" | "??"
  label string
  reason string
  confidence float
  matchedRules string[]
  sessionKey string
  score float
}

class BranchOption {
  optionId 1 | 2 | 3
  isRecommended bool
  annotation "-" | "!!" | "!" | "!?" | "?!" | "?" | "??"
  outcomeLabel string
  moveLabel string
  message string
  predictedResponse string
  opponentMoveType string
  branchPath string
  strategicPayoff string
  goalAlignmentScore int
  whyItWorks string
  risk string?
  lookaheadSummary string?
  lookaheadScore float?
  simulationConfidence float?
  simulationSource "deterministic" | "openrouter" | "langgraph"?
}

class BranchTree {
  situationRead string
  contextEvidence string[]
  toneTarget string
  primaryGoal string
  draftAssessment AnnotationOutput
  branches BranchOption[]
}

class RelevantExample {
  id string
  preset string
  archetype string?
  scenario string
  message string
  outcome string?
  whyItWorked string
}

class PersonaInteraction {
  interactionId string
  sessionId string
  platform string
  preset string
  draftRaw string
  draftFinal string
  chosenOptionId int
  optionRejectedIds int[]
  recipientContextHash string
  outcome string
  observedSignals string[]
}

class MirrorInsight {
  insightId string
  observation string
  supportingPattern string
  evidenceCount int
  confidence float
  createdAt string
  status "active" | "dismissed"
}

class PersonaUpdateOutput {
  updatedPersona PersonaProfile
  mirrorInsights MirrorInsight[]
}

class MirrorOutput {
  shouldSurfaceMirror bool
  insights MirrorInsight[]
}

function ContextExtractor(rawPage: string) -> ContextOutput {
  client Persona1Router
  prompt #"
    Read the active compose environment and return only the structured conversation context.

    Raw page text:
    {{ rawPage }}

    {{ ctx.output_format }}
  "#
}

function Parameterize(persona: PersonaProfile, context: ContextOutput, preset: string, examples: RelevantExample[]) -> ScoringConfig {
  client Persona1Router
  prompt #"
    Build the scoring configuration for this live conversation session.

    Persona:
    {{ persona }}

    Context:
    {{ context }}

    Preset:
    {{ preset }}

    Relevant examples:
    {{ examples }}

    {{ ctx.output_format }}
  "#
}

function GenerateBranches(persona: PersonaProfile, context: ContextOutput, draft: string, preset: string, examples: RelevantExample[], memories: string[]) -> BranchTree {
  client Persona1Router
  prompt #"
    Model the board state of this conversation and return exactly three strategic branches.

    Persona:
    {{ persona }}

    Context:
    {{ context }}

    Preset:
    {{ preset }}

    Relevant examples:
    {{ examples }}

    Relevant memories:
    {{ memories }}

    Draft:
    {{ draft }}

    {{ ctx.output_format }}
  "#
}

function AnnotateDraft(config: ScoringConfig, draft: string) -> AnnotationOutput {
  client Persona1Router
  prompt #"
    Score the current draft for this session.

    Config:
    {{ config }}

    Draft:
    {{ draft }}

    {{ ctx.output_format }}
  "#
}

function PersonaUpdater(persona: PersonaProfile, interaction: PersonaInteraction) -> PersonaUpdateOutput {
  client Persona1Router
  prompt #"
    Update the persona conservatively from the observed interaction.

    Persona:
    {{ persona }}

    Interaction:
    {{ interaction }}

    {{ ctx.output_format }}
  "#
}

function MirrorTrigger(persona: PersonaProfile, interactionLog: PersonaInteraction[]) -> MirrorOutput {
  client Persona1Router
  prompt #"
    Decide whether repeated interaction evidence is strong enough to surface mirror insights.

    Persona:
    {{ persona }}

    Interaction log:
    {{ interactionLog }}

    {{ ctx.output_format }}
  "#
}
