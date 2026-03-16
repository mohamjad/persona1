import { STORAGE_KEYS, DEFAULT_SETTINGS } from "./storage-keys.js";
import { deriveLocalMirrorInsights } from "./mirror.js";

export async function getExtensionState() {
  const state = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    userId: state[STORAGE_KEYS.userId] || null,
    authToken: state[STORAGE_KEYS.authToken] || null,
    plan: state[STORAGE_KEYS.plan] || "free",
    usageCount: Number(state[STORAGE_KEYS.usageCount] || 0),
    onboardingDone: Boolean(state[STORAGE_KEYS.onboardingDone]),
    coldStartContext: state[STORAGE_KEYS.coldStartContext] || null,
    persona: state[STORAGE_KEYS.persona] || null,
    interactionLog: state[STORAGE_KEYS.interactionLog] || [],
    observationQueue: state[STORAGE_KEYS.observationQueue] || [],
    mirrorInsights: state[STORAGE_KEYS.mirrorInsights] || [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(state[STORAGE_KEYS.settings] || {})
    }
  };
}

export async function initializeDefaults() {
  const state = await getExtensionState();
  await chrome.storage.local.set({
    [STORAGE_KEYS.plan]: state.plan,
    [STORAGE_KEYS.usageCount]: state.usageCount,
    [STORAGE_KEYS.interactionLog]: state.interactionLog,
    [STORAGE_KEYS.observationQueue]: state.observationQueue,
    [STORAGE_KEYS.mirrorInsights]: state.mirrorInsights,
    [STORAGE_KEYS.settings]: state.settings
  });
}

export async function setColdStartContext(coldStartContext) {
  const persona = createBootstrapPersona(coldStartContext);
  const userId = `local_${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`;

  await chrome.storage.local.set({
    [STORAGE_KEYS.userId]: userId,
    [STORAGE_KEYS.coldStartContext]: coldStartContext,
    [STORAGE_KEYS.persona]: persona,
    [STORAGE_KEYS.onboardingDone]: true
  });

  return {
    userId,
    persona
  };
}

export async function incrementUsageCount() {
  const state = await getExtensionState();
  const nextCount = state.usageCount + 1;
  await chrome.storage.local.set({
    [STORAGE_KEYS.usageCount]: nextCount
  });
  return nextCount;
}

export async function setAuthState(input) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.userId]: input.userId,
    [STORAGE_KEYS.authToken]: input.authToken,
    [STORAGE_KEYS.plan]: input.plan ?? "free"
  });
}

export async function updateSettings(patch) {
  const state = await getExtensionState();
  const nextSettings = {
    ...state.settings,
    ...patch
  };
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: nextSettings
  });
  return nextSettings;
}

export async function storePersonaProfile(persona) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.persona]: persona
  });
  return persona;
}

export async function recordOutcomeAndUpdatePersona(interaction) {
  const state = await getExtensionState();
  const persona = state.persona || createBootstrapPersona(state.coldStartContext || "general");
  const now = new Date().toISOString();
  const observedSignals = [
    ...(interaction.observedSignals || []),
    interaction.draftFinal && interaction.draftFinal !== interaction.draftRaw ? "edited_before_send" : null,
    interaction.chosenOptionId === 1 ? "trusted_recommended_branch" : null,
    interaction.chosenOptionId === 3 ? "selected_high_risk_branch" : null,
    interaction.outcome === "positive" ? "positive_outcome" : null,
    interaction.outcome === "negative" ? "negative_outcome" : null
  ].filter(Boolean);

  const nextObservedPatterns = [...(persona.observedPatterns || [])];
  for (const signal of observedSignals) {
    const existing = nextObservedPatterns.find((pattern) => pattern.pattern === signal);
    if (!existing) {
      nextObservedPatterns.push({
        pattern: signal,
        count: 1,
        confidence: interaction.outcome === "positive" ? 0.65 : 0.45,
        firstSeenAt: now,
        lastSeenAt: now
      });
      continue;
    }

    existing.count += 1;
    existing.lastSeenAt = now;
    existing.confidence = Math.min(existing.confidence + (interaction.outcome === "positive" ? 0.05 : 0.01), 0.95);
  }

  const nextPersona = {
    ...persona,
    version: persona.version + 1,
    interactionCount: persona.interactionCount + 1,
    learningPhase:
      persona.interactionCount + 1 >= 24
        ? "mirror_activation"
        : persona.interactionCount + 1 >= 8
          ? "active_calibration"
          : "observation",
    observedPatterns: nextObservedPatterns.sort((left, right) => right.count - left.count).slice(0, 24),
    confidence: Math.min(Math.max(persona.confidence + (interaction.outcome === "positive" ? 0.03 : 0.01), 0.05), 0.95),
    lastUpdated: now,
    lastMirrorAt: persona.interactionCount + 1 >= 24 ? now : persona.lastMirrorAt
  };

  const mirrorInsights = deriveLocalMirrorInsights([...(state.observationQueue || []), interaction]);

  await chrome.storage.local.set({
    [STORAGE_KEYS.persona]: nextPersona,
    [STORAGE_KEYS.mirrorInsights]: mirrorInsights
  });

  return {
    persona: nextPersona,
    mirrorInsights
  };
}

function createBootstrapPersona(coldStartContext) {
  const now = new Date().toISOString();
  return {
    version: 1,
    confidence: 0.2,
    learningPhase: "observation",
    communicationDefaults: buildDefaults(coldStartContext),
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

function buildDefaults(coldStartContext) {
  if (coldStartContext === "dating") {
    return {
      formalityRange: "low",
      humorStyle: "light, conversational",
      emotionalExpression: "visible",
      directness: "medium",
      warmthBaseline: "medium-high"
    };
  }

  if (coldStartContext === "professional") {
    return {
      formalityRange: "medium-high",
      humorStyle: "minimal",
      emotionalExpression: "suppressed",
      directness: "medium",
      warmthBaseline: "medium"
    };
  }

  return {
    formalityRange: "medium",
    humorStyle: "situational",
    emotionalExpression: "balanced",
    directness: "medium",
    warmthBaseline: "medium"
  };
}
