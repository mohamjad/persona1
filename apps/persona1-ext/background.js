import { MESSAGE_TYPES, COMMAND_TYPES } from "./lib/messages.js";
import { analyzeConversation, checkout, registerUser, syncPersona, updatePersona } from "./lib/api-client.js";
import { appendInteractionLog, appendObservationQueue } from "./lib/observation-log.js";
import { buildBranchCacheKey, buildSessionFingerprint } from "./lib/analysis-cache.js";
import { getBranchCache, getScoringConfig, putBranchCache, putScoringConfig } from "./lib/db.js";
import {
  getExtensionState,
  incrementUsageCount,
  initializeDefaults,
  recordOutcomeAndUpdatePersona,
  setAuthState,
  setColdStartContext,
  storePersonaProfile
} from "./lib/persona-store.js";
import { getBridgePageSnapshot, registerBackgroundHandler, sendBridgeCommandToTab } from "./lib/background-bridge.js";

const PREFETCH_TTL_MS = 5 * 60 * 1000;
const prefetchJobs = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  await initializeDefaults();
});

chrome.action.onClicked.addListener(async (tab) => {
  await toggleEmbeddedPanel(tab?.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (command === COMMAND_TYPES.toggleSidebar) {
    await toggleEmbeddedPanel(tab?.id);
    return;
  }

  await sendWorkspaceCommand(tab?.id, command);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleLegacyMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extension error."
      })
    );
  return true;
});

registerBackgroundHandler(MESSAGE_TYPES.getExtensionState, async () => ({
  ok: true,
  state: await getExtensionState()
}));

registerBackgroundHandler(MESSAGE_TYPES.setColdStartContext, async ({ coldStartContext }) => {
  const result = await setColdStartContext(coldStartContext);
  return {
    ok: true,
    ...result
  };
});

registerBackgroundHandler(MESSAGE_TYPES.getUsageState, async () => {
  const state = await getExtensionState();
  return {
    ok: true,
    usageCount: state.usageCount,
    plan: state.plan
  };
});

registerBackgroundHandler(MESSAGE_TYPES.analyzeConversation, async (payload) => handleAnalyzeRequest(payload));
registerBackgroundHandler(MESSAGE_TYPES.prefetchConversation, async (payload) =>
  handleAnalyzeRequest(payload, { prefetch: true })
);

registerBackgroundHandler(MESSAGE_TYPES.recordOptionSelection, async (payload) => {
  await appendInteractionLog({
    ...payload,
    recordedAt: new Date().toISOString(),
    type: "option_selected"
  });
  await appendObservationQueue({
    ...payload,
    recordedAt: new Date().toISOString()
  });
  return { ok: true };
});

registerBackgroundHandler(MESSAGE_TYPES.recordOutcome, async (payload) => handleOutcomeRequest(payload));

registerBackgroundHandler(MESSAGE_TYPES.startCheckout, async (payload) => handleCheckoutRequest(payload));

registerBackgroundHandler(MESSAGE_TYPES.sidebarCommand, async (payload) => {
  const targetTabId = await getActiveTabId();
  if (payload.command === COMMAND_TYPES.toggleSidebar) {
    return toggleEmbeddedPanel(targetTabId);
  }
  return sendWorkspaceCommand(targetTabId, payload.command);
});

async function handleLegacyMessage(message, sender) {
  switch (message?.type) {
    case MESSAGE_TYPES.getExtensionState:
      return { ok: true, state: await getExtensionState() };
    case MESSAGE_TYPES.setColdStartContext:
      return {
        ok: true,
        ...(await setColdStartContext(message.coldStartContext))
      };
    case MESSAGE_TYPES.getUsageState: {
      const state = await getExtensionState();
      return { ok: true, usageCount: state.usageCount, plan: state.plan };
    }
    case MESSAGE_TYPES.analyzeConversation:
      return handleAnalyzeRequest(message.payload);
    case MESSAGE_TYPES.recordOptionSelection:
      await appendInteractionLog({
        ...message.payload,
        recordedAt: new Date().toISOString(),
        type: "option_selected"
      });
      await appendObservationQueue({
        ...message.payload,
        recordedAt: new Date().toISOString()
      });
      return { ok: true };
    case MESSAGE_TYPES.recordOutcome:
      return handleOutcomeRequest(message.payload);
    case MESSAGE_TYPES.startCheckout:
      return handleCheckoutRequest(message.payload);
    case MESSAGE_TYPES.sidebarCommand: {
      const targetTabId = sender.tab?.id ?? (await getActiveTabId());
      if (message.command === COMMAND_TYPES.toggleSidebar) {
        return toggleEmbeddedPanel(targetTabId);
      }
      return sendWorkspaceCommand(targetTabId, message.command);
    }
    default:
      return { ok: false, error: "Unknown message type." };
  }
}

async function handleAnalyzeRequest(payload, options = {}) {
  const prefetch = Boolean(options.prefetch);
  let state = await getExtensionState();
  if (!state.onboardingDone || !state.coldStartContext || !state.persona) {
    const inferredColdStart = inferColdStartContext(payload.context);
    const bootstrap = await setColdStartContext(inferredColdStart);
    state = {
      ...(await getExtensionState()),
      onboardingDone: true,
      coldStartContext: inferredColdStart,
      userId: bootstrap.userId,
      persona: bootstrap.persona
    };
  }

  const sessionFingerprint = buildSessionFingerprint({
    userId: state.userId,
    preset: payload.preset,
    coldStartContext: state.coldStartContext,
    personaVersion: state.persona?.version,
    context: payload.context
  });
  const cacheKey = buildBranchCacheKey({
    sessionFingerprint,
    draft: payload.draft
  });

  const cached = await getBranchCache(cacheKey);
  if (cached?.analysis) {
    if (!prefetch) {
      state = {
        ...state,
        usageCount: await incrementUsageCount()
      };
    }
    if (cached.analysis.scoringSessionKey && cached.scoringConfig) {
      await putScoringConfig(cached.analysis.scoringSessionKey, cached.scoringConfig);
    }
    return {
      ok: true,
      analysis: cached.analysis,
      usageCount: state.usageCount,
      cached: true
    };
  }

  if (prefetch && prefetchJobs.has(cacheKey)) {
    return prefetchJobs.get(cacheKey);
  }
  if (!prefetch && prefetchJobs.has(cacheKey)) {
    const analysis = await prefetchJobs.get(cacheKey);
    return {
      ok: true,
      analysis,
      usageCount: await incrementUsageCount(),
      cached: true,
      prefetched: true
    };
  }

  const requestPayload = {
    draft: payload.draft,
    preset: payload.preset,
    userId: state.userId,
    context: payload.context,
    prefetch,
    coldStartContext: state.coldStartContext,
    personaProfile: state.persona
  };

  const runAnalyze = async () => {
    const analysis = await analyzeConversation(requestPayload);
    const scoringConfig =
      analysis.scoringConfig ||
      (analysis.scoringSessionKey ? await getScoringConfig(analysis.scoringSessionKey) : null);
    await putBranchCache(
      cacheKey,
      {
        analysis,
        scoringConfig,
        sessionFingerprint,
        cachedAt: new Date().toISOString()
      },
      PREFETCH_TTL_MS
    );
    if (analysis.scoringSessionKey && scoringConfig) {
      await putScoringConfig(analysis.scoringSessionKey, scoringConfig);
    }
    return analysis;
  };

  const job = runAnalyze();
  if (prefetch) {
    prefetchJobs.set(cacheKey, job);
  }

  try {
    const analysis = await job;
    const usageCount = prefetch ? state.usageCount : await incrementUsageCount();
    return {
      ok: true,
      analysis,
      usageCount,
      cached: false,
      prefetched: prefetch
    };
  } finally {
    if (prefetch) {
      prefetchJobs.delete(cacheKey);
    }
  }
}

function inferColdStartContext(context) {
  if (context?.platform === "dating_app" || context?.relationshipType === "romantic") {
    return "dating";
  }

  if (["linkedin", "gmail", "slack"].includes(context?.platform)) {
    return "professional";
  }

  return "general";
}

async function handleOutcomeRequest(payload) {
  const state = await getExtensionState();
  let result = await recordOutcomeAndUpdatePersona(payload);

  await appendInteractionLog({
    ...payload,
    recordedAt: new Date().toISOString(),
    type: "outcome"
  });
  await appendObservationQueue({
    ...payload,
    recordedAt: new Date().toISOString()
  });

  if (state.authToken && state.userId) {
    const remoteUpdate = await updatePersona(
      {
        userId: state.userId,
        currentPersona: result.persona,
        interaction: payload
      },
      state.authToken
    ).catch(() => null);

    if (remoteUpdate?.updatedPersona) {
      result = {
        persona: remoteUpdate.updatedPersona,
        mirrorInsights: remoteUpdate.mirrorInsights
      };
    }

    await syncPersona(
      {
        userId: state.userId,
        localPersona: result.persona,
        localInteractions: [payload],
        localMirrorInsights: result.mirrorInsights
      },
      state.authToken
    ).catch(() => null);
  }

  await storePersonaProfile(result.persona);

  return {
    ok: true,
    persona: result.persona,
    mirrorInsights: result.mirrorInsights
  };
}

async function handleCheckoutRequest(payload) {
  const state = await getExtensionState();
  let userId = state.userId;
  let authToken = state.authToken;
  const email = payload.email;

  if (!authToken || !userId) {
    if (!email) {
      return {
        ok: false,
        error: "Email is required to start checkout."
      };
    }

    const registration = await registerUser({
      email,
      coldStartContext: state.coldStartContext || "general"
    });
    userId = registration.userId;
    authToken = registration.authToken;
    await setAuthState({
      userId,
      authToken,
      plan: "free"
    });
    await storePersonaProfile(registration.personaProfile);
  }

  const checkoutResult = await checkout(
    {
      userId,
      email
    },
    authToken
  );

  if (checkoutResult.ok && checkoutResult.url) {
    await chrome.tabs.create({ url: checkoutResult.url });
  }

  return {
    ok: checkoutResult.ok,
    checkout: checkoutResult
  };
}

async function toggleEmbeddedPanel(tabId) {
  if (!tabId) {
    return { ok: false, error: "No active tab." };
  }

  const ensured = await ensureWorkspaceRuntime(tabId);
  if (!ensured.ok) {
    return ensured;
  }

  try {
    return await sendBridgeCommandToTab(tabId, MESSAGE_TYPES.sidebarCommand, {
      command: COMMAND_TYPES.toggleSidebar
    });
  } catch (error) {
    return chrome.tabs
      .sendMessage(tabId, {
        type: MESSAGE_TYPES.sidebarCommand,
        command: COMMAND_TYPES.toggleSidebar
      })
      .catch(() => ({
        ok: false,
        error: error instanceof Error ? error.message : "Could not open the workspace on this tab."
      }));
  }
}

async function sendWorkspaceCommand(tabId, command) {
  if (!tabId) {
    return { ok: false, error: "No active tab." };
  }

  const ensured = await ensureWorkspaceRuntime(tabId);
  if (!ensured.ok) {
    return ensured;
  }

  try {
    return await sendBridgeCommandToTab(tabId, MESSAGE_TYPES.sidebarCommand, { command });
  } catch (error) {
    return chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.sidebarCommand, command }).catch(() => ({
      ok: false,
      error: error instanceof Error ? error.message : "Could not send the workspace command."
    }));
  }
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureWorkspaceRuntime(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.id) {
    return {
      ok: false,
      error: "Could not find the active tab."
    };
  }

  if (isRestrictedUrl(tab.url)) {
    return {
      ok: false,
      error: "The workspace cannot run on this Chrome page. Open Gmail, LinkedIn, or another normal web page."
    };
  }

  const existing = await getBridgePageSnapshot(tab.id)
    .then(() => ({ ok: true }))
    .catch(async () =>
      chrome.tabs
        .sendMessage(tab.id, {
          type: MESSAGE_TYPES.getPageSnapshot
        })
        .then(() => ({ ok: true }))
        .catch(() => null)
    );

  if (existing?.ok) {
    return existing;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"]
  }).catch(() => null);

  return getBridgePageSnapshot(tab.id)
    .then(() => ({ ok: true }))
    .catch(async () =>
      chrome.tabs
        .sendMessage(tab.id, {
          type: MESSAGE_TYPES.getPageSnapshot
        })
        .then(() => ({ ok: true }))
        .catch(() => ({
          ok: false,
          error: "The workspace could not attach to this tab. Refresh the page once and try again."
        }))
    );
}

function isRestrictedUrl(url) {
  if (!url) {
    return true;
  }

  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("view-source:")
  );
}
