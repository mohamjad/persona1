const MSG = {
  getPageSnapshot: "persona1:get-page-snapshot",
  insertSelectedMessage: "persona1:insert-selected-message",
  toggleEmbeddedPanel: "persona1:toggle-embedded-panel",
  workspaceCommand: "persona1:workspace-command",
  getExtensionState: "persona1:get-extension-state",
  setColdStartContext: "persona1:set-cold-start-context",
  analyzeConversation: "persona1:analyze-conversation",
  recordOptionSelection: "persona1:record-option-selection",
  recordOutcome: "persona1:record-outcome",
  startCheckout: "persona1:start-checkout"
};

const CMD = {
  analyze: "analyze",
  select1: "select_option_1",
  select2: "select_option_2",
  select3: "select_option_3",
  copy: "copy_selected",
  collapse: "collapse_sidebar"
};

const PRESETS = ["date", "pitch", "negotiate", "apologize", "reconnect", "confront", "close", "decline"];

let currentContext = null;
let currentComposeTarget = null;
let shadowHost = null;
let shellRoot = null;
let chip = null;
let panel = null;
let observer = null;
let panelState = { extensionState: null, analysis: null, selectedBranch: null, lastDraft: "", manualFallback: false };

boot();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void onMessage(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Content script error." }));
  return true;
});

function boot() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  start();
}

function start() {
  refreshContext();
  window.addEventListener("focusin", refreshContext, true);
  window.addEventListener("click", refreshContext, true);
  window.addEventListener("keyup", refreshContext, true);
  window.setInterval(refreshContext, 1500);
  installObserver();
}

async function onMessage(message) {
  if (message?.type === MSG.getPageSnapshot) {
    refreshContext();
    return { ok: true, snapshot: currentContext };
  }

  if (message?.type === MSG.insertSelectedMessage) {
    refreshContext();
    if (!currentComposeTarget) {
      return { ok: false, error: "No active compose target found." };
    }
    return { ok: insertComposeValue(currentComposeTarget, message.value) };
  }

  if (message?.type === MSG.toggleEmbeddedPanel) {
    refreshContext();
    await togglePanel(true);
    return { ok: true, open: Boolean(panel) };
  }

  if (message?.type === MSG.workspaceCommand) {
    refreshContext();
    await handleWorkspaceCommand(message.command);
    return { ok: true };
  }

  return { ok: false, error: "Unknown content message." };
}

function refreshContext() {
  const detected = detectComposeContext(document);
  currentComposeTarget = detected?.composeNode || null;
  currentContext = detected ? sanitizeContext(detected) : null;
  syncChip();
  if (panel) {
    renderComposeSection();
  }
}

function sanitizeContext(detected) {
  return {
    platform: detected.platform,
    composeDetected: true,
    draft: detected.draft || "",
    recipientName: detected.recipientName || null,
    recipientHandle: detected.recipientHandle || null,
    relationshipType: detected.relationshipType || "acquaintance",
    communicationStyle: detected.communicationStyle || "casual",
    emotionalStateSignals: detected.emotionalStateSignals || [],
    inferredWants: detected.inferredWants || "clarity",
    inferredConcerns: detected.inferredConcerns || "confusion",
    threadSummary: detected.threadSummary || "",
    recipientLastMessage: detected.recipientLastMessage || null,
    contextConfidence: detected.contextConfidence || 50
  };
}

function syncChip() {
  if (!currentContext?.composeDetected) {
    chip?.remove();
    chip = null;
    if (!panel) {
      shadowHost?.remove();
      shadowHost = null;
      shellRoot = null;
    }
    return;
  }

  if (!ensureRoot()) {
    return;
  }

  if (!chip) {
    chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = "persona1";
    chip.setAttribute("aria-label", "Open persona1 workspace");
    chip.style.cssText = "all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647;pointer-events:auto;border:1px solid rgba(15,23,42,.14);background:#f8f4ec;color:#1d1a16;padding:10px 14px;border-radius:999px;box-shadow:0 18px 50px rgba(15,23,42,.14);cursor:pointer;font:600 12px/1.2 ui-sans-serif,system-ui,sans-serif;";
    chip.addEventListener("click", () => void togglePanel());
    shellRoot.appendChild(chip);
  }

  chip.textContent = currentContext.platform === "gmail" ? "persona1 gmail" : `persona1 ${currentContext.platform}`;
}

async function togglePanel(forceOpen = false) {
  if (panel) {
    closePanel();
    return;
  }
  await openPanel(forceOpen);
}

async function openPanel(forceOpen = false) {
  if (panel || !ensureRoot()) {
    return;
  }

  if (!currentContext?.composeDetected && !forceOpen) {
    return;
  }

  panel = document.createElement("section");
  panel.style.cssText = "all:initial;position:fixed;top:16px;right:16px;width:420px;height:min(88vh,920px);z-index:2147483647;pointer-events:auto;border-radius:24px;overflow:hidden;border:1px solid rgba(15,23,42,.14);box-shadow:0 28px 80px rgba(15,23,42,.22);background:#f4f1ea;color:#1d1a16;font:400 14px/1.5 ui-sans-serif,system-ui,sans-serif;";
  panel.innerHTML = getPanelMarkup();
  shellRoot.appendChild(panel);
  panelState.manualFallback = !currentContext?.composeDetected;
  bindPanelEvents();
  await bootPanel();
}

function closePanel() {
  panel?.remove();
  panel = null;
  panelState = { extensionState: null, analysis: null, selectedBranch: null, lastDraft: "", manualFallback: false };
  if (!currentContext?.composeDetected) {
    shadowHost?.remove();
    shadowHost = null;
    shellRoot = null;
  }
}

async function bootPanel() {
  const response = await chrome.runtime.sendMessage({ type: MSG.getExtensionState });
  panelState.extensionState = response?.state || null;
  setUsageBadge();
  renderMirror(panelState.extensionState?.mirrorInsights || []);
  if (!panelState.extensionState?.onboardingDone) {
    show("onboarding", true);
    renderStatus("Choose a starting context to unlock the first persona profile.");
  } else {
    renderStatus(currentContext?.composeDetected ? "Context ready. Review the draft, choose a preset, and analyze." : "No live compose box found. Manual fallback is ready.");
  }
  renderComposeSection();
}

function bindPanelEvents() {
  panel.querySelector('[data-action="close"]').addEventListener("click", closePanel);
  panel.querySelector('[data-action="refresh"]').addEventListener("click", () => {
    refreshContext();
    renderStatus(currentContext?.composeDetected ? "Context refreshed." : "No active compose box found.");
  });
  panel.querySelector('[data-action="analyze"]').addEventListener("click", () => void analyzeCurrentContext());
  panel.querySelector('[data-action="checkout"]').addEventListener("click", () => void startCheckout());
  panel.querySelectorAll("[data-cold-start]").forEach((node) => {
    node.addEventListener("click", () => void chooseColdStart(node.getAttribute("data-cold-start")));
  });
  panel.querySelectorAll("[data-outcome]").forEach((node) => {
    node.addEventListener("click", () => void recordOutcome(node.getAttribute("data-outcome")));
  });
}

function renderComposeSection() {
  if (!panel) {
    return;
  }

  const canCompose = Boolean(panelState.extensionState?.onboardingDone && (currentContext?.composeDetected || panelState.manualFallback));
  show("compose", canCompose);
  if (!canCompose) {
    return;
  }

  const activeContext = currentContext || createManualFallbackContext();
  panel.querySelector('[data-role="context"]').innerHTML = contextHtml(activeContext);
  const draftNode = panel.querySelector('[data-field="draft"]');
  if (!draftNode.matches(":focus")) {
    draftNode.value = currentContext?.draft || draftNode.value || "";
  }
}

async function chooseColdStart(coldStartContext) {
  const response = await chrome.runtime.sendMessage({ type: MSG.setColdStartContext, coldStartContext });
  if (!response?.ok) {
    renderError(response?.error || "Could not save the starting context.");
    return;
  }

  panelState.extensionState = {
    ...(panelState.extensionState || {}),
    onboardingDone: true,
    coldStartContext,
    userId: response.userId,
    persona: response.persona,
    usageCount: panelState.extensionState?.usageCount || 0,
    plan: panelState.extensionState?.plan || "free",
    mirrorInsights: panelState.extensionState?.mirrorInsights || []
  };
  show("onboarding", false);
  setUsageBadge();
  renderComposeSection();
  renderStatus("Starting context saved. Context is ready for analysis.");
}

async function analyzeCurrentContext() {
  if (!panel) {
    renderError("Workspace is not open.");
    return;
  }

  const activeContext = currentContext || createManualFallbackContext();
  const draft = String(panel.querySelector('[data-field="draft"]').value || currentContext?.draft || "").trim();
  if (!draft) {
    renderError("A draft is required before analysis.");
    return;
  }

  renderStatus("Analyzing the conversation tree.");
  const response = await chrome.runtime.sendMessage({
    type: MSG.analyzeConversation,
    payload: {
      draft,
      preset: getPreset(),
      context: toRecipientContext(activeContext)
    }
  });

  if (!response?.ok) {
    if (response?.requiresOnboarding) {
      show("onboarding", true);
    }
    if (response?.requiresCheckout) {
      show("paywall", true);
    }
    renderError(response?.error || "Analysis failed.");
    return;
  }

  panelState.analysis = response.analysis;
  panelState.lastDraft = draft;
  panelState.selectedBranch = null;
  if (panelState.extensionState) {
    panelState.extensionState.usageCount = response.usageCount;
  }
  setUsageBadge();
  show("branches", true);
  show("outcome", false);
  show("paywall", false);
  renderBranches(response.analysis?.branches || []);
  renderStatus(response.analysis?.draftWarning || "Analysis ready. Pick the line that matches your objective.");
}

function renderBranches(branches) {
  if (!panel) {
    return;
  }

  const list = panel.querySelector('[data-role="branch-list"]');
  list.innerHTML = "";
  for (const branch of branches) {
    const card = document.createElement("article");
    card.setAttribute("data-branch-card", "true");
    if (branch.isRecommended) {
      card.setAttribute("data-recommended", "true");
    }
    card.innerHTML = `
      <div data-role="meta">
        <span data-pill="true">option ${escapeHtml(branch.optionId)}</span>
        ${branch.isRecommended ? '<span data-pill="true" data-recommended-pill="true">recommended</span>' : ""}
        <span data-pill="true">alignment ${escapeHtml(branch.goalAlignmentScore)}</span>
      </div>
      <p data-role="message">${escapeHtml(branch.message)}</p>
      <p data-muted="true">Predicted response: ${escapeHtml(branch.predictedResponse)}</p>
      <p data-muted="true">Branch path: ${escapeHtml(branch.branchPath)}</p>
      <p data-muted="true">Why it works: ${escapeHtml(branch.whyItWorks)}</p>
      ${branch.risk ? `<p data-muted="true">Risk: ${escapeHtml(branch.risk)}</p>` : ""}
      <div data-role="actions">
        <button type="button" data-use="${branch.optionId}">Use this</button>
        <button type="button" data-copy="${branch.optionId}">Copy</button>
      </div>
    `;
    card.querySelector(`[data-use="${branch.optionId}"]`).addEventListener("click", () => void useBranch(branch.optionId));
    card.querySelector(`[data-copy="${branch.optionId}"]`).addEventListener("click", () => void copyBranch(branch.optionId));
    list.appendChild(card);
  }
}

async function useBranch(optionId) {
  const branch = panelState.analysis?.branches?.find((item) => item.optionId === optionId);
  if (!branch) {
    renderError("Could not find the selected branch.");
    return;
  }

  if (currentComposeTarget) {
    if (!insertComposeValue(currentComposeTarget, branch.message)) {
      renderError("Could not insert the selected branch.");
      return;
    }
  } else {
    await copyText(branch.message);
    const draftNode = panel?.querySelector('[data-field="draft"]');
    if (draftNode) {
      draftNode.value = branch.message;
    }
  }

  panelState.selectedBranch = branch;
  show("outcome", true);
  await chrome.runtime.sendMessage({
    type: MSG.recordOptionSelection,
    payload: interactionPayload(branch, "unknown", [])
  });
  renderStatus(currentComposeTarget ? `Inserted option ${optionId}. Once you see how it lands, record the outcome.` : `Copied option ${optionId} and loaded it into the manual draft field.`);
}

async function copyBranch(optionId) {
  const branch = panelState.analysis?.branches?.find((item) => item.optionId === optionId);
  if (!branch) {
    return;
  }
  await copyText(branch.message);
  panelState.selectedBranch = branch;
  renderStatus(`Copied option ${optionId}.`);
}

async function recordOutcome(outcome) {
  if (!panelState.selectedBranch) {
    renderError("Pick or copy a branch before recording the outcome.");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MSG.recordOutcome,
    payload: interactionPayload(
      panelState.selectedBranch,
      outcome,
      panelState.selectedBranch.isRecommended ? ["trusted_recommended_branch"] : []
    )
  });

  if (!response?.ok) {
    renderError(response?.error || "Could not record the outcome.");
    return;
  }

  if (panelState.extensionState) {
    panelState.extensionState.persona = response.persona;
    panelState.extensionState.mirrorInsights = response.mirrorInsights;
  }
  renderMirror(response.mirrorInsights || []);
  renderStatus("Outcome captured. Mirror insights updated.");
}

async function startCheckout() {
  if (!panel) {
    return;
  }
  const email = String(panel.querySelector('[data-field="checkout-email"]').value || "").trim();
  const response = await chrome.runtime.sendMessage({ type: MSG.startCheckout, payload: { email } });
  if (!response?.ok) {
    renderError(response?.error || response?.checkout?.reason || "Could not start checkout.");
    return;
  }
  renderStatus("Checkout opened in a new tab.");
}

async function handleWorkspaceCommand(command) {
  if (command === CMD.collapse) {
    closePanel();
    return;
  }
  if (!panel) {
    await openPanel(true);
  }
  if (command === CMD.analyze) {
    await analyzeCurrentContext();
  }
  if (command === CMD.select1) {
    await useBranch(1);
  }
  if (command === CMD.select2) {
    await useBranch(2);
  }
  if (command === CMD.select3) {
    await useBranch(3);
  }
  if (command === CMD.copy && panelState.selectedBranch) {
    await copyText(panelState.selectedBranch.message);
    renderStatus("Copied the selected branch.");
  }
}

function interactionPayload(branch, outcome, observedSignals) {
  return {
    interactionId: safeUuid(),
    sessionId: safeUuid(),
    platform: currentContext?.platform || "other",
    preset: getPreset(),
    draftRaw: panelState.lastDraft || currentContext?.draft || "",
    draftFinal: branch.message,
    chosenOptionId: branch.optionId,
    optionRejectedIds: [1, 2, 3].filter((id) => id !== branch.optionId),
    recipientContextHash: hashContext(currentContext),
    outcome,
    observedSignals
  };
}

function renderMirror(insights) {
  if (!panel) {
    return;
  }
  const list = panel.querySelector('[data-role="mirror-list"]');
  if (!insights?.length) {
    show("mirror", false);
    list.innerHTML = "";
    return;
  }
  show("mirror", true);
  list.innerHTML = insights
    .map(
      (insight) => `
        <article data-mirror-item="true">
          <p>${escapeHtml(insight.observation)}</p>
          <p data-muted="true">Evidence count: ${escapeHtml(insight.evidenceCount)} | confidence ${Math.round(Number(insight.confidence || 0) * 100)}</p>
        </article>
      `
    )
    .join("");
}

function setUsageBadge() {
  if (!panel || !panelState.extensionState) {
    return;
  }
  panel.querySelector('[data-role="usage"]').textContent = `${panelState.extensionState.plan} - ${panelState.extensionState.usageCount}/3`;
}

function renderStatus(message) {
  if (!panel) {
    return;
  }
  const node = panel.querySelector('[data-card="status"]');
  node.removeAttribute("data-error");
  panel.querySelector('[data-role="status"]').textContent = message;
}

function renderError(message) {
  if (!panel) {
    return;
  }
  const node = panel.querySelector('[data-card="status"]');
  node.setAttribute("data-error", "true");
  panel.querySelector('[data-role="status"]').textContent = message;
}

function show(name, visible) {
  if (!panel) {
    return;
  }
  const node = panel.querySelector(`[data-card="${name}"]`);
  if (!node) {
    return;
  }
  if (visible) {
    node.removeAttribute("hidden");
  } else {
    node.setAttribute("hidden", "true");
  }
}

function getPanelMarkup() {
  return `
    <style>
      [data-root="true"]{display:flex;flex-direction:column;height:100%;background:#f4f1ea;color:#1d1a16;font:400 14px/1.5 ui-sans-serif,system-ui,sans-serif}
      [data-header="true"]{display:flex;justify-content:space-between;gap:16px;padding:18px 18px 14px;background:rgba(255,255,255,.92);border-bottom:1px solid rgba(15,23,42,.08)}
      [data-eyebrow="true"]{margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#70665b}
      [data-title="true"]{margin:0;font-size:19px;line-height:1.2;font-weight:700}
      [data-body="true"]{display:flex;flex-direction:column;gap:12px;padding:16px;overflow:auto}
      [data-card]{display:flex;flex-direction:column;gap:10px;padding:14px;background:rgba(255,255,255,.85);border:1px solid rgba(15,23,42,.08);border-radius:18px}
      [data-card="status"][data-error="true"]{border-color:rgba(178,47,35,.24);background:#fff3f0;color:#7f1d1d}
      [data-head="true"],[data-role="actions"],[data-role="meta"]{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
      [data-field="wrap"]{display:flex;flex-direction:column;gap:6px}
      [data-field="wrap"]>span{font-size:12px;font-weight:600;color:#4b4238}
      input,textarea,select{box-sizing:border-box;width:100%;border:1px solid rgba(15,23,42,.12);border-radius:14px;padding:10px 12px;background:#fffdf8;color:#1d1a16;font:inherit}
      textarea{resize:vertical}
      [data-grid="true"]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      button{box-sizing:border-box;border:1px solid rgba(15,23,42,.12);border-radius:14px;padding:10px 12px;background:#fffdf8;color:#1d1a16;font:600 13px/1.2 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
      button:hover{background:#fff7ea}
      [data-action="analyze"],[data-action="checkout"],[data-use]{background:#1d1a16;color:#fffdf8;border-color:#1d1a16}
      [data-pill="true"],[data-role="usage"]{display:inline-flex;align-items:center;border:1px solid rgba(15,23,42,.12);border-radius:999px;padding:4px 8px;background:#fffdf8;font-size:11px;font-weight:600;color:#4b4238}
      [data-recommended-pill="true"]{background:#1d1a16;color:#fffdf8;border-color:#1d1a16}
      [data-muted="true"]{margin:0;color:#70665b;font-size:12px}
      [data-role="context"],[data-role="message"]{white-space:pre-wrap}
      [data-branch-card="true"],[data-mirror-item="true"]{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fffdf8}
      [data-branch-card="true"][data-recommended="true"]{border-color:rgba(29,26,22,.24);box-shadow:inset 0 0 0 1px rgba(29,26,22,.06)}
      h3,p{margin:0}
    </style>
    <div data-root="true">
      <div data-header="true">
        <div><p data-eyebrow="true">persona1</p><h2 data-title="true">See the board before you send.</h2></div>
        <div data-head="true"><span data-role="usage">free</span><button type="button" data-action="close">close</button></div>
      </div>
      <div data-body="true">
        <section data-card="status"><p data-role="status">Loading workspace.</p></section>
        <section data-card="onboarding" hidden><h3>Choose your starting context</h3><p data-muted="true">This sets the first prior. You can change it later.</p><div data-grid="true"><button type="button" data-cold-start="dating">dating</button><button type="button" data-cold-start="professional">professional</button><button type="button" data-cold-start="general">general</button></div></section>
        <section data-card="compose" hidden><div data-head="true"><h3>Current compose context</h3><button type="button" data-action="refresh">refresh</button></div><div data-role="context"></div><label data-field="wrap"><span>Preset</span><select data-field="preset">${PRESETS.map((preset) => `<option value="${preset}"${preset === "pitch" ? " selected" : ""}>${preset}</option>`).join("")}</select></label><label data-field="wrap"><span>Draft</span><textarea data-field="draft" rows="6" placeholder="Type here, or let persona1 read the current compose box."></textarea></label><button type="button" data-action="analyze">Analyze conversation</button></section>
        <section data-card="branches" hidden><div data-head="true"><h3>Three branches</h3><p data-muted="true">One recommended line. Two alternatives worth considering.</p></div><div data-role="branch-list"></div></section>
        <section data-card="outcome" hidden><h3>How did it land?</h3><p data-muted="true">This updates the local persona profile and mirror insights.</p><div data-grid="true"><button type="button" data-outcome="positive">landed</button><button type="button" data-outcome="neutral">neutral</button><button type="button" data-outcome="negative">missed</button></div></section>
        <section data-card="mirror" hidden><h3>Mirror</h3><div data-role="mirror-list"></div></section>
        <section data-card="paywall" hidden><h3>Free uses are done</h3><p data-muted="true">Launch pricing is $9/month. Checkout opens in a new tab.</p><label data-field="wrap"><span>Email</span><input data-field="checkout-email" type="email" placeholder="you@example.com" /></label><button type="button" data-action="checkout">Unlock monthly</button></section>
      </div>
    </div>
  `;
}

function contextHtml(snapshot) {
  return [snapshot.platform, snapshot.recipientName ? `Recipient: ${snapshot.recipientName}` : "", `Confidence: ${snapshot.contextConfidence}`, snapshot.threadSummary || "No thread summary available."].filter(Boolean).map(escapeHtml).join("<br />");
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

function ensureRoot() {
  if (shadowHost && shellRoot) {
    return true;
  }
  const mount = document.body || document.documentElement;
  if (!mount) {
    return false;
  }
  shadowHost = document.createElement("div");
  shadowHost.setAttribute("data-persona1-root", "true");
  shadowHost.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const shadow = shadowHost.attachShadow({ mode: "open" });
  shellRoot = document.createElement("div");
  shellRoot.style.cssText = "position:fixed;inset:0;pointer-events:none;";
  shadow.appendChild(shellRoot);
  mount.appendChild(shadowHost);
  return true;
}

function createManualFallbackContext() {
  return {
    platform: "other",
    composeDetected: false,
    draft: "",
    recipientName: null,
    recipientHandle: null,
    relationshipType: "acquaintance",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clarity",
    inferredConcerns: "confusion",
    threadSummary: summarizeThreadText(document.title + " " + (document.body?.innerText || "")),
    recipientLastMessage: null,
    contextConfidence: 30
  };
}

function installObserver() {
  if (observer || !document.documentElement) {
    return;
  }
  observer = new MutationObserver(() => refreshContext());
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label", "role", "contenteditable", "data-testid"] });
}

function detectComposeContext(doc) {
  return extractLinkedInContext(doc) || extractGmailContext(doc) || extractTwitterDmContext(doc) || extractSlackContext(doc) || extractDatingAppContext(doc) || extractFallbackContext(doc);
}

function extractLinkedInContext(doc) {
  const onLinkedIn = /(^|\.)linkedin\.com$/i.test(window.location.hostname);
  const composeNode = doc.querySelector(".msg-form__contenteditable[contenteditable='true']") || doc.querySelector("[contenteditable='true'][role='textbox']") || doc.querySelector("textarea[name='message']");
  if (!onLinkedIn || !composeNode) {
    return null;
  }
  const thread = composeNode.closest("[data-test-conversation-pane-wrapper], .msg-thread, .msg-overlay-conversation-bubble") || doc.body;
  return { platform: "linkedin", composeNode, draft: normalizeComposeValue(composeNode), recipientName: doc.querySelector(".msg-thread__link-to-profile .t-16, .msg-thread-header__participant-names, .msg-s-message-group__name")?.textContent?.trim() || null, recipientHandle: null, relationshipType: "colleague", communicationStyle: "professional", emotionalStateSignals: [], inferredWants: "a concise, competent, low-friction response", inferredConcerns: "time cost and vague asks", threadSummary: summarizeThreadText(thread.innerText || ""), recipientLastMessage: summarizeThreadText(findLastLine(thread.innerText || "")) || null, contextConfidence: 80 };
}

function extractGmailContext(doc) {
  const onGmail = /(^|\.)mail\.google\.com$/i.test(window.location.hostname);
  const composeNode = doc.querySelector('div[aria-label="Message Body"][contenteditable="true"]') || doc.querySelector('div[role="textbox"][g_editable="true"]') || doc.querySelector('div[contenteditable="true"][aria-label*="Message Body"]') || doc.querySelector('div[contenteditable="true"][role="textbox"][aria-multiline="true"]');
  if (!onGmail || !composeNode) {
    return null;
  }
  const thread = composeNode.closest(".nH, .aDh, .aoP") || doc.body;
  const recipientName = doc.querySelector("input[peoplekit-id]")?.value?.trim() || doc.querySelector("span[email]")?.getAttribute("email")?.trim() || doc.querySelector("div[data-hovercard-id]")?.getAttribute("data-hovercard-id")?.trim() || null;
  return { platform: "gmail", composeNode, draft: normalizeComposeValue(composeNode), recipientName, recipientHandle: recipientName, relationshipType: "colleague", communicationStyle: "professional", emotionalStateSignals: [], inferredWants: "clarity and competence", inferredConcerns: "friction, ambiguity, and time cost", threadSummary: summarizeThreadText(thread.innerText || ""), recipientLastMessage: summarizeThreadText(findLastLine(thread.innerText || "")) || null, contextConfidence: 84 };
}

function extractTwitterDmContext(doc) {
  const onX = /(^|\.)x\.com$/i.test(window.location.hostname) || /(^|\.)twitter\.com$/i.test(window.location.hostname);
  const composeNode = doc.querySelector('[data-testid="dmComposerTextInput"][contenteditable="true"]') || doc.querySelector('[data-testid="dmComposerTextInput"]');
  if (!onX || !composeNode) {
    return null;
  }
  const thread = composeNode.closest('[data-testid="DMDrawer"]') || doc.body;
  const recipientName = doc.querySelector('[data-testid="DMConversationTitle"] span')?.textContent?.trim() || null;
  return { platform: "twitter", composeNode, draft: normalizeComposeValue(composeNode), recipientName, recipientHandle: recipientName ? `@${recipientName.replace(/\s+/g, "").toLowerCase()}` : null, relationshipType: "acquaintance", communicationStyle: "casual", emotionalStateSignals: [], inferredWants: "clarity and tone control", inferredConcerns: "awkwardness or pressure", threadSummary: summarizeThreadText(thread.innerText || ""), recipientLastMessage: summarizeThreadText(findLastLine(thread.innerText || "")) || null, contextConfidence: 72 };
}

function extractSlackContext(doc) {
  const onSlack = /(^|\.)app\.slack\.com$/i.test(window.location.hostname);
  const composeNode = doc.querySelector('[data-qa="message_input"] [contenteditable="true"]') || doc.querySelector('[data-qa="message_input"]');
  if (!onSlack || !composeNode) {
    return null;
  }
  const recipientName = doc.querySelector('[data-qa="channel_header_title"], [data-qa="channel_name"]')?.textContent?.trim() || null;
  return { platform: "slack", composeNode, draft: normalizeComposeValue(composeNode), recipientName, recipientHandle: recipientName, relationshipType: "colleague", communicationStyle: "casual", emotionalStateSignals: [], inferredWants: "clear, low-friction coordination", inferredConcerns: "noise and ambiguity", threadSummary: summarizeThreadText(doc.body?.innerText || ""), recipientLastMessage: null, contextConfidence: 70 };
}

function extractDatingAppContext(doc) {
  const onDatingApp = /(bumble|hinge|tinder|feeld)/i.test(window.location.hostname);
  const composeNode = doc.querySelector("textarea") || doc.querySelector('[contenteditable="true"][role="textbox"]');
  if (!onDatingApp || !composeNode) {
    return null;
  }
  return { platform: "dating_app", composeNode, draft: normalizeComposeValue(composeNode), recipientName: doc.querySelector("header h1, header h2, [data-testid='profile-name']")?.textContent?.trim() || null, recipientHandle: null, relationshipType: "romantic", communicationStyle: "warm", emotionalStateSignals: [], inferredWants: "ease, confidence, and spark without pressure", inferredConcerns: "awkwardness, over-investment, and generic lines", threadSummary: summarizeThreadText(doc.body?.innerText || ""), recipientLastMessage: null, contextConfidence: 58 };
}

function extractFallbackContext(doc) {
  const active = doc.activeElement;
  const composeNode = active && (active.tagName === "TEXTAREA" || active.isContentEditable) ? active : doc.querySelector("textarea, [contenteditable='true'], div[role='textbox']");
  if (!composeNode) {
    return null;
  }
  return { platform: "other", composeNode, draft: normalizeComposeValue(composeNode), recipientName: null, recipientHandle: null, relationshipType: "acquaintance", communicationStyle: "casual", emotionalStateSignals: [], inferredWants: "clarity", inferredConcerns: "awkwardness and confusion", threadSummary: summarizeThreadText(doc.body?.innerText || ""), recipientLastMessage: null, contextConfidence: 45 };
}

function normalizeComposeValue(target) {
  if (!target) return "";
  if (typeof target.value === "string") return target.value;
  if (typeof target.innerText === "string") return target.innerText.trim();
  return "";
}

function insertComposeValue(target, value) {
  if (!target) return false;
  const next = String(value || "");
  target.focus();
  if (typeof target.value === "string") {
    target.value = next;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (target.isContentEditable) {
    target.innerHTML = "";
    next.split("\n").forEach((line, index) => {
      if (index > 0) target.appendChild(document.createElement("br"));
      target.appendChild(document.createTextNode(line));
    });
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
  } catch {
    const ghost = document.createElement("textarea");
    ghost.value = String(text || "");
    ghost.style.position = "fixed";
    ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    ghost.select();
    document.execCommand("copy");
    ghost.remove();
  }
}

function summarizeThreadText(value) {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 280);
}

function findLastLine(value) {
  return String(value).split("\n").map((line) => line.trim()).filter(Boolean).slice(-1)[0] || "";
}

function hashContext(snapshot) {
  const raw = JSON.stringify(snapshot || {});
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return `ctx_${hash.toString(16)}`;
}

function safeUuid() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function getPreset() {
  return String(panel?.querySelector('[data-field="preset"]')?.value || "pitch");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
