import { MESSAGE_TYPES, COMMAND_TYPES } from "./lib/messages.js";
import { SIDEBAR_STATES, createSidebarMachineState, transitionSidebarState } from "./lib/sidebar-machine.js";

const ui = {
  statusCard: document.querySelector("#status-card"),
  onboardingCard: document.querySelector("#onboarding-card"),
  composeCard: document.querySelector("#compose-card"),
  branchesCard: document.querySelector("#branches-card"),
  outcomeCard: document.querySelector("#outcome-card"),
  mirrorCard: document.querySelector("#mirror-card"),
  paywallCard: document.querySelector("#paywall-card"),
  usageBadge: document.querySelector("#usage-badge"),
  contextSummary: document.querySelector("#context-summary"),
  branchList: document.querySelector("#branch-list"),
  mirrorList: document.querySelector("#mirror-list"),
  presetSelect: document.querySelector("#preset-select"),
  draftInput: document.querySelector("#draft-input"),
  analyzeButton: document.querySelector("#analyze-button"),
  refreshContextButton: document.querySelector("#refresh-context"),
  checkoutEmail: document.querySelector("#checkout-email"),
  checkoutButton: document.querySelector("#checkout-button")
};

let sidebarState = createSidebarMachineState();
let extensionState = null;
let currentSnapshot = null;
let selectedBranch = null;

await boot();

ui.analyzeButton.addEventListener("click", () => void analyzeCurrentContext());
ui.refreshContextButton.addEventListener("click", () => void refreshSnapshot());
ui.checkoutButton.addEventListener("click", () => void startCheckout());
document.querySelectorAll("[data-cold-start]").forEach((button) => {
  button.addEventListener("click", () => void chooseColdStart(button.getAttribute("data-cold-start")));
});
document.querySelectorAll("[data-outcome]").forEach((button) => {
  button.addEventListener("click", () => void recordOutcome(button.getAttribute("data-outcome")));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== MESSAGE_TYPES.sidebarCommand) {
    return;
  }

  void handleCommand(message.command);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && sidebarState.status === SIDEBAR_STATES.contextReady) {
    event.preventDefault();
    void analyzeCurrentContext();
    return;
  }

  if (!selectedBranch && sidebarState.status !== SIDEBAR_STATES.branchesReady) {
    return;
  }

  if (event.key === "1") {
    void useBranch(1);
  }
  if (event.key === "2") {
    void useBranch(2);
  }
  if (event.key === "3") {
    void useBranch(3);
  }
});

async function boot() {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.getExtensionState
  });
  extensionState = response.state;
  ui.usageBadge.textContent = `${extensionState.plan} - ${extensionState.usageCount}/3`;
  renderStatus("Looking for an active compose box.");

  if (!extensionState.onboardingDone) {
    ui.onboardingCard.classList.remove("hidden");
    renderStatus("Choose a starting context to unlock the first persona profile.");
    return;
  }

  await refreshSnapshot();
  renderMirror(extensionState.mirrorInsights || []);
}

async function refreshSnapshot() {
  currentSnapshot = await requestPageSnapshot();

  if (!currentSnapshot?.composeDetected) {
    sidebarState = createSidebarMachineState();
    ui.composeCard.classList.add("hidden");
    ui.branchesCard.classList.add("hidden");
    ui.outcomeCard.classList.add("hidden");
    renderStatus("No active compose target found on this page.");
    return;
  }

  sidebarState = transitionSidebarState(
    transitionSidebarState(createSidebarMachineState(), SIDEBAR_STATES.composeDetected, {
      context: currentSnapshot
    }),
    SIDEBAR_STATES.contextReady,
    {
      context: currentSnapshot
    }
  );
  ui.composeCard.classList.remove("hidden");
  ui.contextSummary.innerHTML = renderContextSummary(currentSnapshot);
  ui.draftInput.value = currentSnapshot.draft || "";
  renderStatus("Context ready. Review the draft, choose a preset, and analyze.");
}

async function chooseColdStart(coldStartContext) {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.setColdStartContext,
    coldStartContext
  });
  if (!response.ok) {
    renderError(response.error);
    return;
  }

  extensionState = {
    ...extensionState,
    onboardingDone: true,
    coldStartContext,
    userId: response.userId,
    persona: response.persona
  };
  ui.onboardingCard.classList.add("hidden");
  await refreshSnapshot();
}

async function analyzeCurrentContext() {
  if (!currentSnapshot?.composeDetected) {
    renderError("No compose box is active.");
    return;
  }

  sidebarState = transitionSidebarState(sidebarState, SIDEBAR_STATES.analyzing);
  renderStatus("Analyzing the conversation tree.");

  const draft = ui.draftInput.value.trim() || currentSnapshot.draft || "";
  if (!draft) {
    renderError("A draft is required before analysis.");
    sidebarState = transitionSidebarState(sidebarState, SIDEBAR_STATES.contextReady);
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.analyzeConversation,
    payload: {
      draft,
      preset: ui.presetSelect.value,
      context: toRecipientContext(currentSnapshot)
    }
  });

  if (!response.ok) {
    if (response.requiresOnboarding) {
      ui.onboardingCard.classList.remove("hidden");
    }
    if (response.requiresCheckout) {
      ui.paywallCard.classList.remove("hidden");
    }
    renderError(response.error);
    sidebarState = transitionSidebarState(sidebarState, SIDEBAR_STATES.error, {
      lastError: response.error
    });
    return;
  }

  extensionState.usageCount = response.usageCount;
  ui.usageBadge.textContent = `${extensionState.plan} - ${extensionState.usageCount}/3`;
  sidebarState = transitionSidebarState(sidebarState, SIDEBAR_STATES.branchesReady, {
    analysis: response.analysis
  });
  ui.branchesCard.classList.remove("hidden");
  ui.paywallCard.classList.add("hidden");
  selectedBranch = null;
  renderBranches(response.analysis.branches);
  renderStatus(response.analysis.draftWarning || "Analysis ready. Pick the line that matches your objective.");
}

function renderBranches(branches) {
  ui.branchList.innerHTML = "";

  for (const branch of branches) {
    const card = document.createElement("article");
    card.className = `branch-card${branch.isRecommended ? " recommended" : ""}`;
    card.innerHTML = `
      <div class="branch-meta">
        <span class="pill">option ${branch.optionId}</span>
        ${branch.isRecommended ? '<span class="pill">recommended</span>' : ""}
        <span class="pill">alignment ${branch.goalAlignmentScore}</span>
      </div>
      <p>${escapeHtml(branch.message)}</p>
      <p class="muted">Predicted response: ${escapeHtml(branch.predictedResponse)}</p>
      <p class="muted">Branch path: ${escapeHtml(branch.branchPath)}</p>
      <p class="muted">Why it works: ${escapeHtml(branch.whyItWorks)}</p>
      ${branch.risk ? `<p class="muted">Risk: ${escapeHtml(branch.risk)}</p>` : ""}
      <div class="branch-actions">
        <button class="branch-button primary" data-action="use">Use this</button>
        <button class="branch-button" data-action="copy">Copy</button>
      </div>
    `;

    card.querySelector('[data-action="use"]').addEventListener("click", () => void useBranch(branch.optionId));
    card.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      await navigator.clipboard.writeText(branch.message);
      renderStatus(`Copied option ${branch.optionId}.`);
    });
    ui.branchList.appendChild(card);
  }
}

async function useBranch(optionId) {
  const branch = sidebarState.analysis?.branches?.find((candidate) => candidate.optionId === optionId);
  if (!branch) {
    return;
  }

  const activeTab = await getActiveTab();
  const response = await chrome.tabs.sendMessage(activeTab.id, {
    type: MESSAGE_TYPES.insertSelectedMessage,
    value: branch.message
  });
  if (!response?.ok) {
    renderError(response?.error || "Could not insert the selected branch.");
    return;
  }

  selectedBranch = branch;
  sidebarState = transitionSidebarState(sidebarState, SIDEBAR_STATES.optionSelected, {
    selectedOptionId: optionId
  });
  ui.outcomeCard.classList.remove("hidden");
  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.recordOptionSelection,
    payload: {
      interactionId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      platform: currentSnapshot.platform,
      preset: ui.presetSelect.value,
      draftRaw: ui.draftInput.value.trim(),
      draftFinal: branch.message,
      chosenOptionId: optionId,
      optionRejectedIds: [1, 2, 3].filter((candidate) => candidate !== optionId),
      recipientContextHash: hashContext(currentSnapshot),
      outcome: "unknown",
      observedSignals: []
    }
  });
  renderStatus(`Inserted option ${optionId}. Once you see how it lands, record the outcome.`);
}

async function recordOutcome(outcome) {
  if (!selectedBranch) {
    renderError("Pick a branch before recording the outcome.");
    return;
  }

  const payload = {
    interactionId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    platform: currentSnapshot.platform,
    preset: ui.presetSelect.value,
    draftRaw: ui.draftInput.value.trim(),
    draftFinal: selectedBranch.message,
    chosenOptionId: selectedBranch.optionId,
    optionRejectedIds: [1, 2, 3].filter((candidate) => candidate !== selectedBranch.optionId),
    recipientContextHash: hashContext(currentSnapshot),
    outcome,
    observedSignals: selectedBranch.isRecommended ? ["trusted_recommended_branch"] : []
  };

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.recordOutcome,
    payload
  });
  if (!response.ok) {
    renderError(response.error);
    return;
  }

  sidebarState = transitionSidebarState(sidebarState, SIDEBAR_STATES.outcomeCapture);
  renderMirror(response.mirrorInsights);
  sidebarState = transitionSidebarState(sidebarState, SIDEBAR_STATES.mirrorReady, {
    mirrorInsights: response.mirrorInsights
  });
  renderStatus("Outcome captured. Mirror insights updated.");
}

async function startCheckout() {
  const email = ui.checkoutEmail.value.trim();
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.startCheckout,
    payload: {
      email
    }
  });

  if (!response.ok) {
    renderError(response.error || response.checkout?.reason || "Could not start checkout.");
    return;
  }

  renderStatus("Checkout opened in a new tab.");
}

async function requestPageSnapshot() {
  const activeTab = await getActiveTab();
  const response = await chrome.tabs.sendMessage(activeTab.id, {
    type: MESSAGE_TYPES.getPageSnapshot
  });
  return response?.snapshot || null;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function handleCommand(command) {
  if (command === COMMAND_TYPES.analyze) {
    await analyzeCurrentContext();
  }
  if (command === COMMAND_TYPES.selectOption1) {
    await useBranch(1);
  }
  if (command === COMMAND_TYPES.selectOption2) {
    await useBranch(2);
  }
  if (command === COMMAND_TYPES.selectOption3) {
    await useBranch(3);
  }
  if (command === COMMAND_TYPES.copySelected && selectedBranch) {
    await navigator.clipboard.writeText(selectedBranch.message);
    renderStatus("Copied the selected branch.");
  }
}

function renderMirror(insights) {
  if (!insights?.length) {
    ui.mirrorCard.classList.add("hidden");
    ui.mirrorList.innerHTML = "";
    return;
  }

  ui.mirrorCard.classList.remove("hidden");
  ui.mirrorList.innerHTML = insights
    .map(
      (insight) => `
        <article class="mirror-item">
          <p>${escapeHtml(insight.observation)}</p>
          <p class="muted">Evidence count: ${insight.evidenceCount} - confidence ${Math.round(insight.confidence * 100)}</p>
        </article>
      `
    )
    .join("");
}

function renderStatus(message) {
  ui.statusCard.textContent = message;
}

function renderError(message) {
  ui.statusCard.textContent = message;
  ui.statusCard.classList.add("status-error");
}

function renderContextSummary(snapshot) {
  return `
    <strong>${escapeHtml(snapshot.platform)}</strong><br />
    ${snapshot.recipientName ? `Recipient: ${escapeHtml(snapshot.recipientName)}<br />` : ""}
    Confidence: ${snapshot.contextConfidence}<br />
    ${escapeHtml(snapshot.threadSummary || "No thread summary available.")}
  `;
}

function toRecipientContext(snapshot) {
  return {
    recipientName: snapshot.recipientName || null,
    recipientHandle: snapshot.recipientHandle || null,
    communicationStyle: snapshot.communicationStyle || "casual",
    emotionalStateSignals: snapshot.emotionalStateSignals || [],
    relationshipType: snapshot.relationshipType || "acquaintance",
    platform: snapshot.platform || "other",
    threadSummary: snapshot.threadSummary || "",
    recipientLastMessage: snapshot.recipientLastMessage || null,
    inferredWants: snapshot.inferredWants || "clarity",
    inferredConcerns: snapshot.inferredConcerns || "confusion",
    contextConfidence: snapshot.contextConfidence || 50
  };
}

function hashContext(snapshot) {
  const raw = JSON.stringify(snapshot);
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `ctx_${hash.toString(16)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
