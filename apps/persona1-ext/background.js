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
  await openSidePanel(tab?.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === COMMAND_TYPES.toggleSidebar) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await openSidePanel(tab?.id);
    return;
  }

  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.sidebarCommand,
    command
  });
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
        await openSidePanel(sender.tab?.id);
        return { ok: true };
      }

      await chrome.runtime.sendMessage(message);
      return { ok: true };

    default:
      return {
        ok: false,
        error: "Unknown message type."
      };
  }
}

async function handleAnalyzeRequest(message) {
  const state = await getExtensionState();
  if (!state.onboardingDone || !state.coldStartContext || !state.persona) {
    return {
      ok: false,
      requiresOnboarding: true,
      error: "Choose a cold-start context before analyzing."
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

async function openSidePanel(tabId) {
  if (!tabId || !chrome.sidePanel?.open) {
    return;
  }

  await chrome.sidePanel.setOptions({
    tabId,
    path: "sidepanel.html",
    enabled: true
  });
  await chrome.sidePanel.open({ tabId });
}
