import { MESSAGE_TYPES, COMMAND_TYPES } from "./lib/messages.js";
import { analyzeConversation, checkout, registerUser, syncPersona, updatePersona } from "./lib/api-client.js";
import { appendInteractionLog, appendObservationQueue } from "./lib/observation-log.js";
import {
  getExtensionState,
  incrementUsageCount,
  initializeDefaults,
  recordOutcomeAndUpdatePersona,
  setAuthState,
  setColdStartContext,
  storePersonaProfile
} from "./lib/persona-store.js";

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
  void handleMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown extension error." }));
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case MESSAGE_TYPES.getExtensionState:
      return {
        ok: true,
        state: await getExtensionState()
      };

    case MESSAGE_TYPES.setColdStartContext: {
      const result = await setColdStartContext(message.coldStartContext);
      return {
        ok: true,
        ...result
      };
    }

    case MESSAGE_TYPES.getUsageState: {
      const state = await getExtensionState();
      return {
        ok: true,
        usageCount: state.usageCount,
        plan: state.plan
      };
    }

    case MESSAGE_TYPES.analyzeConversation:
      return handleAnalyzeRequest(message);

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

    case MESSAGE_TYPES.sidebarCommand:
      if (message.command === COMMAND_TYPES.toggleSidebar) {
        const targetTabId = sender.tab?.id ?? (await getActiveTabId());
        await toggleEmbeddedPanel(targetTabId);
        return { ok: true };
      }

      await sendWorkspaceCommand(sender.tab?.id ?? (await getActiveTabId()), message.command);
      return { ok: true };

    default:
      return {
        ok: false,
        error: "Unknown message type."
      };
  }
}

async function handleAnalyzeRequest(message) {
  let state = await getExtensionState();
  if (!state.onboardingDone || !state.coldStartContext || !state.persona) {
    const inferredColdStart = inferColdStartContext(message.payload.context);
    const bootstrap = await setColdStartContext(inferredColdStart);
    state = {
      ...(await getExtensionState()),
      onboardingDone: true,
      coldStartContext: inferredColdStart,
      userId: bootstrap.userId,
      persona: bootstrap.persona
    };
  }

  if (state.plan === "free" && state.usageCount >= 3) {
    return {
      ok: false,
      requiresCheckout: true,
      error: "Free usage limit reached."
    };
  }

  const analysis = await analyzeConversation({
    draft: message.payload.draft,
    preset: message.payload.preset,
    userId: state.userId,
    context: message.payload.context,
    coldStartContext: state.coldStartContext,
    personaProfile: state.persona
  });
  const usageCount = await incrementUsageCount();

  return {
    ok: true,
    analysis,
    usageCount
  };
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
  let email = payload.email;

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

  const response = await chrome.tabs.sendMessage(tabId, {
    type: "persona1:toggle-embedded-panel"
  }).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "Could not open the workspace on this tab."
  }));

  return response || {
    ok: false,
    error: "The workspace did not respond."
  };
}

async function sendWorkspaceCommand(tabId, command) {
  if (!tabId) {
    return { ok: false, error: "No active tab." };
  }

  const ensured = await ensureWorkspaceRuntime(tabId);
  if (!ensured.ok) {
    return ensured;
  }

  const response = await chrome.tabs.sendMessage(tabId, {
    type: "persona1:workspace-command",
    command
  }).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "Could not send the workspace command."
  }));

  return response || { ok: true };
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

  const existing = await chrome.tabs
    .sendMessage(tab.id, {
      type: MESSAGE_TYPES.getPageSnapshot
    })
    .then(() => ({ ok: true }))
    .catch(() => null);

  if (existing?.ok) {
    return existing;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"]
  }).catch(() => null);

  const retried = await chrome.tabs
    .sendMessage(tab.id, {
      type: MESSAGE_TYPES.getPageSnapshot
    })
    .then(() => ({ ok: true }))
    .catch(() => ({
      ok: false,
      error: "The workspace could not attach to this tab. Refresh the page once and try again."
    }));

  return retried;
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
