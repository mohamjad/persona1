const MSG = {
  getPageSnapshot: "persona1:get-page-snapshot",
  insertSelectedMessage: "persona1:insert-selected-message",
  toggleEmbeddedPanel: "persona1:toggle-embedded-panel",
  workspaceCommand: "persona1:workspace-command",
  getExtensionState: "persona1:get-extension-state",
  setColdStartContext: "persona1:set-cold-start-context",
  analyzeConversation: "persona1:analyze-conversation",
  recordOptionSelection: "persona1:record-option-selection",
  recordOutcome: "persona1:record-outcome"
};

const CMD = {
  analyze: "analyze",
  select1: "select_option_1",
  select2: "select_option_2",
  select3: "select_option_3",
  copy: "copy_selected",
  collapse: "collapse_sidebar"
};

const ROOT_ATTR = "data-persona1-root";
const alreadyLoaded = Boolean(globalThis.__persona1ContentScriptLoaded);

globalThis.__persona1ContentScriptLoaded = true;

const state = {
  currentContext: null,
  currentComposeTarget: null,
  extensionState: null,
  shadowHost: null,
  shellRoot: null,
  hudOpen: false,
  observer: null,
  refreshTimer: null,
  analysis: null,
  selectedOptionId: null,
  activePreset: "pitch",
  lastDraft: "",
  isAnalyzing: false,
  status: "",
  error: "",
  lastAppliedBranch: null,
  launcherOffsetX: 0,
  launcherOffsetY: 0,
  launcherDismissed: false,
  launcherDragActive: false,
  launcherDragMoved: false,
  dragStartX: 0,
  dragStartY: 0,
  dragInitialOffsetX: 0,
  dragInitialOffsetY: 0,
  lastComposeSignature: null
};

if (!alreadyLoaded) {
  bootContentScript();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void onMessage(message)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Content script error."
        })
      );
    return true;
  });
} else {
  try {
    globalThis.__persona1RefreshContext?.();
  } catch {}
}

function bootContentScript() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }

  start();
}

function start() {
  refreshContext();
  installObserver();
  window.addEventListener("focusin", refreshContext, true);
  window.addEventListener("click", refreshContext, true);
  window.addEventListener("input", onInputEvent, true);
  window.addEventListener("keydown", onGlobalKeydown, true);
  window.addEventListener("pointermove", onGlobalPointerMove, true);
  window.addEventListener("pointerup", onGlobalPointerUp, true);
  window.addEventListener("resize", renderUi, true);
  window.addEventListener("scroll", renderUi, true);
  state.refreshTimer = window.setInterval(refreshContext, 1200);
}

async function onMessage(message) {
  if (message?.type === MSG.getPageSnapshot) {
    refreshContext();
    return { ok: true, snapshot: snapshotContext() };
  }

  if (message?.type === MSG.insertSelectedMessage) {
    refreshContext();
    if (!state.currentComposeTarget) {
      return { ok: false, error: "No active compose target found." };
    }

    return { ok: insertComposeValue(state.currentComposeTarget, message.value) };
  }

  if (message?.type === MSG.toggleEmbeddedPanel) {
    refreshContext();
    await openHud({
      analyzeImmediately: false,
      allowWithoutCompose: true,
      toggleIfOpen: true
    });
    return { ok: true, open: state.hudOpen };
  }

  if (message?.type === MSG.workspaceCommand) {
    refreshContext();
    await handleWorkspaceCommand(message.command);
    return { ok: true };
  }

  return { ok: false, error: "Unknown content message." };
}

async function handleWorkspaceCommand(command) {
  if (command === CMD.collapse) {
    closeHud();
    return;
  }

  if (command === CMD.analyze) {
    await openHud({
      analyzeImmediately: true,
      allowWithoutCompose: true,
      toggleIfOpen: false
    });
    return;
  }

  if (command === CMD.copy) {
    if (state.selectedOptionId) {
      await copyBranch(state.selectedOptionId);
    }
    return;
  }

  const optionId =
    command === CMD.select1 ? 1 : command === CMD.select2 ? 2 : command === CMD.select3 ? 3 : null;
  if (optionId) {
    await useBranch(optionId);
  }
}

function onInputEvent(event) {
  if (!isComposeNode(event.target)) {
    return;
  }

  refreshContext();
  if (state.hudOpen) {
    state.lastDraft = normalizeComposeValue(state.currentComposeTarget);
    renderUi();
  }
}

async function onGlobalKeydown(event) {
  const composing =
    isComposeNode(event.target) || isComposeNode(document.activeElement) || Boolean(state.currentComposeTarget);
  const openHotkey = (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "Space";
  if (openHotkey && composing) {
    event.preventDefault();
    await openHud({
      analyzeImmediately: true,
      allowWithoutCompose: false,
      toggleIfOpen: false
    });
    return;
  }

  if (!state.hudOpen) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeHud();
    return;
  }

  if (!state.analysis || state.isAnalyzing) {
    return;
  }

  if (event.key === "1" || event.key === "2" || event.key === "3") {
    event.preventDefault();
    await useBranch(Number(event.key));
    return;
  }

  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !isComposeNode(event.target)
  ) {
    event.preventDefault();
    await useBranch(state.selectedOptionId || recommendedOptionId(state.analysis.branches));
  }
}

function refreshContext() {
  const detected = detectComposeContext(document);
  state.currentComposeTarget = detected?.composeNode || null;
  state.currentContext = detected ? sanitizeContext(detected) : null;
  state.lastDraft = normalizeComposeValue(state.currentComposeTarget);
  const nextSignature = state.currentComposeTarget ? getComposeSignature(state.currentComposeTarget) : null;
  if (nextSignature !== state.lastComposeSignature) {
    state.lastComposeSignature = nextSignature;
    state.launcherOffsetX = 0;
    state.launcherOffsetY = 0;
    state.launcherDismissed = false;
    state.launcherDragActive = false;
    state.launcherDragMoved = false;
  }
  renderUi();
}

globalThis.__persona1RefreshContext = refreshContext;

function snapshotContext() {
  if (!state.currentContext) {
    return null;
  }

  return {
    ...state.currentContext,
    draft: state.lastDraft
  };
}

async function openHud(input = {}) {
  const { analyzeImmediately = false, allowWithoutCompose = false, toggleIfOpen = false } = input;
  if (toggleIfOpen && state.hudOpen) {
    closeHud();
    return;
  }

  refreshContext();
  if (!state.currentComposeTarget && !allowWithoutCompose) {
    state.error = "focus a real compose box first.";
    state.status = "";
    state.hudOpen = true;
    await loadExtensionState();
    renderUi();
    return;
  }

  state.hudOpen = true;
  state.error = "";
  state.status = analyzeImmediately ? "reading the board..." : "ready.";
  await loadExtensionState();
  renderUi();

  if (analyzeImmediately) {
    await analyzeCurrentDraft();
  }
}

function closeHud() {
  state.hudOpen = false;
  state.isAnalyzing = false;
  state.status = "";
  state.error = "";
  state.analysis = null;
  state.selectedOptionId = null;
  state.lastAppliedBranch = null;
  renderUi();
}

async function loadExtensionState() {
  if (state.extensionState) {
    return state.extensionState;
  }

  const response = await chrome.runtime.sendMessage({ type: MSG.getExtensionState });
  if (!response?.ok) {
    throw new Error(response?.error || "Could not load extension state.");
  }

  state.extensionState = response.state;
  state.activePreset = chooseDefaultPreset(response.state);
  return state.extensionState;
}

function chooseDefaultPreset(extensionState) {
  if (extensionState?.coldStartContext === "dating") {
    return "date";
  }
  if (extensionState?.coldStartContext === "professional") {
    return "pitch";
  }
  return "pitch";
}

function inferPreset(context, draft, coldStartContext) {
  const lower = String(draft || "").toLowerCase();

  if (/\b(sorry|apologize|my fault|shouldn't have)\b/.test(lower)) {
    return "apologize";
  }
  if (/\b(reconnect|been a while|long time|catch up)\b/.test(lower)) {
    return "reconnect";
  }
  if (/\b(no thanks|not interested|won't be able|can't do)\b/.test(lower)) {
    return "decline";
  }
  if (/\b(price|terms|budget|rate|comp|offer)\b/.test(lower)) {
    return "negotiate";
  }
  if (/\b(call|meeting|demo|proposal|summary|fit|idea|product)\b/.test(lower)) {
    return "pitch";
  }
  if (context?.relationshipType === "romantic" || coldStartContext === "dating") {
    return "date";
  }
  return coldStartContext === "professional" ? "pitch" : "reconnect";
}

async function analyzeCurrentDraft() {
  await loadExtensionState();
  const draft = normalizeComposeValue(state.currentComposeTarget).trim();
  state.lastDraft = draft;
  state.activePreset = inferPreset(state.currentContext, draft, state.extensionState?.coldStartContext || "general");

  if (!draft) {
    state.error = "write a draft first.";
    state.status = "";
    renderUi();
    return;
  }

  if (!state.currentContext) {
    state.error = "context is not available yet.";
    state.status = "";
    renderUi();
    return;
  }

  state.isAnalyzing = true;
  state.error = "";
  state.status = "building move tree...";
  renderUi();

  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.analyzeConversation,
      payload: {
        draft,
        preset: state.activePreset,
        context: toRecipientContext(state.currentContext)
      }
    });

    if (!response?.ok) {
      state.error = response?.error || "analysis failed.";
      state.status = "";
      state.isAnalyzing = false;
      renderUi();
      return;
    }

    state.extensionState = {
      ...(state.extensionState || {}),
      usageCount: response.usageCount,
      onboardingDone: true
    };
    state.analysis = response.analysis;
    state.selectedOptionId = recommendedOptionId(response.analysis.branches);
    state.lastAppliedBranch = null;
    state.error = "";
    state.status = response.analysis?.draftAssessment?.reason || "move tree ready.";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "analysis failed.";
    state.status = "";
  } finally {
    state.isAnalyzing = false;
    renderUi();
  }
}

async function useBranch(optionId) {
  const branch = state.analysis?.branches?.find((candidate) => candidate.optionId === optionId);
  if (!branch) {
    return;
  }

  state.selectedOptionId = optionId;
  const inserted = state.currentComposeTarget ? insertComposeValue(state.currentComposeTarget, branch.message) : false;
  state.status = inserted ? `${branch.moveLabel.toLowerCase()} inserted.` : `option ${optionId} copied.`;
  state.error = "";
  state.lastAppliedBranch = branch;

  if (!inserted) {
    await copyText(branch.message);
  }

  renderUi();

  await chrome.runtime.sendMessage({
    type: MSG.recordOptionSelection,
    payload: interactionPayload(branch, "unknown", branch.isRecommended ? ["trusted_recommended_branch"] : [])
  });
}

async function copyBranch(optionId) {
  const branch = state.analysis?.branches?.find((candidate) => candidate.optionId === optionId);
  if (!branch) {
    return;
  }

  await copyText(branch.message);
  state.selectedOptionId = optionId;
  state.status = `option ${optionId} copied.`;
  state.error = "";
  renderUi();
}

async function recordOutcome(outcome) {
  if (!state.lastAppliedBranch) {
    state.error = "pick a move first.";
    renderUi();
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MSG.recordOutcome,
    payload: interactionPayload(
      state.lastAppliedBranch,
      outcome,
      state.lastAppliedBranch.isRecommended ? ["trusted_recommended_branch"] : []
    )
  });

  if (!response?.ok) {
    state.error = response?.error || "could not record the outcome.";
    renderUi();
    return;
  }

  state.extensionState = {
    ...(state.extensionState || {}),
    persona: response.persona,
    mirrorInsights: response.mirrorInsights
  };
  state.status = "outcome captured.";
  state.error = "";
  renderUi();
}

function interactionPayload(branch, outcome, observedSignals) {
  return {
    interactionId: safeUuid(),
    sessionId: safeUuid(),
    platform: state.currentContext?.platform || "other",
    preset: state.activePreset,
    draftRaw: state.lastDraft,
    draftFinal: branch.message,
    chosenOptionId: branch.optionId,
    optionRejectedIds: [1, 2, 3].filter((candidate) => candidate !== branch.optionId),
    recipientContextHash: hashContext(state.currentContext),
    outcome,
    observedSignals
  };
}

function renderUi() {
  const shouldRender = Boolean(state.currentContext?.composeDetected || state.hudOpen);
  if (!shouldRender) {
    teardownRoot();
    return;
  }

  if (!ensureRoot()) {
    return;
  }

  state.shellRoot.innerHTML = `${buildLauncherMarkup()}${state.hudOpen ? buildHudMarkup() : ""}`;
}

function ensureRoot() {
  if (state.shadowHost && state.shellRoot) {
    return true;
  }

  const mount = document.body || document.documentElement;
  if (!mount) {
    return false;
  }

  state.shadowHost = document.createElement("div");
  state.shadowHost.setAttribute(ROOT_ATTR, "true");
  state.shadowHost.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const shadow = state.shadowHost.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host, * { box-sizing: border-box; }
    [data-p1-shell="true"] { position: fixed; inset: 0; pointer-events: none; font: 400 13px/1.45 ui-sans-serif, system-ui, sans-serif; color: #171411; }
    [data-p1-launcher-wrap="true"] { position: fixed; pointer-events: auto; width: 36px; height: 36px; }
    [data-p1-launcher="true"] { position: absolute; inset: 0; pointer-events: auto; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border: 1px solid rgba(22, 18, 13, 0.16); background: rgba(255, 251, 244, 0.98); color: #171411; box-shadow: 0 10px 28px rgba(22, 18, 13, 0.12); cursor: grab; border-radius: 999px; }
    [data-p1-launcher="true"]:active { cursor: grabbing; }
    [data-p1-launcher-dismiss="true"] { position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; border: 1px solid rgba(22, 18, 13, 0.14); border-radius: 999px; background: rgba(255, 251, 244, 0.98); color: #5f5549; box-shadow: 0 8px 20px rgba(22, 18, 13, 0.10); font: 700 10px/1 ui-sans-serif, system-ui, sans-serif; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity 120ms ease; }
    [data-p1-launcher-wrap="true"]:hover [data-p1-launcher-dismiss="true"],
    [data-p1-launcher-wrap="true"]:focus-within [data-p1-launcher-dismiss="true"] { opacity: 1; }
    [data-p1-badge="true"] { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 999px; border: 1px solid rgba(22, 18, 13, 0.12); background: #171411; color: #fffaf3; font-weight: 700; letter-spacing: 0.01em; }
    [data-p1-badge-tone="good"] { background: #163a2d; color: #effff8; }
    [data-p1-badge-tone="risky"] { background: #6a241a; color: #fff6f2; }
    [data-p1-badge-tone="neutral"] { background: #5d4a20; color: #fff8e8; }
    [data-p1-hud="true"] { position: fixed; pointer-events: auto; width: min(360px, calc(100vw - 24px)); display: flex; flex-direction: column; gap: 6px; }
    [data-p1-hud-head="true"] { display: flex; justify-content: flex-end; padding-right: 2px; }
    [data-p1-inline-note="true"] { padding: 9px 11px; border: 1px solid rgba(22, 18, 13, 0.08); background: rgba(255,255,255,0.94); border-radius: 12px; box-shadow: 0 14px 36px rgba(22, 18, 13, 0.12); font-weight: 600; }
    [data-p1-inline-note="true"][data-tone="error"] { border-color: rgba(140, 43, 27, 0.26); background: #fff2ef; color: #7e1e10; }
    [data-p1-row="true"] { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    [data-p1-branches="true"] { display: flex; flex-direction: column; gap: 6px; }
    [data-p1-branch-card="true"] { display: flex; flex-direction: column; gap: 5px; padding: 10px 11px; border-radius: 12px; border: 1px solid rgba(22, 18, 13, 0.08); background: rgba(255,255,255,0.95); box-shadow: 0 14px 36px rgba(22, 18, 13, 0.12); cursor: pointer; }
    [data-p1-branch-card="true"][data-selected="true"] { border-color: rgba(22, 18, 13, 0.3); box-shadow: 0 14px 36px rgba(22, 18, 13, 0.12), inset 0 0 0 1px rgba(22, 18, 13, 0.08); }
    [data-p1-branch-card="true"][data-recommended="true"] { background: #f7f0e5; }
    [data-p1-annotation-row="true"] { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    [data-p1-move-label="true"] { font-size: 12px; font-weight: 700; }
    [data-p1-message="true"] { margin: 0; white-space: pre-wrap; font-size: 13px; line-height: 1.36; }
    [data-p1-small="true"] { margin: 0; color: #5f5549; font-size: 11px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    [data-p1-branch-path="true"] { margin: 0; color: #746a5e; font-size: 11px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
    [data-p1-actions="true"] { display: flex; gap: 6px; flex-wrap: wrap; }
    [data-p1-button="true"] { border: 1px solid rgba(22, 18, 13, 0.12); background: #fffef9; color: #171411; border-radius: 999px; padding: 6px 9px; font: 600 10px/1.1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
    [data-p1-button="true"][data-tone="primary"] { background: #171411; color: #fffaf3; border-color: #171411; }
    [data-p1-help="true"] { font-size: 11px; color: #6a6054; }
    [data-p1-outcome="true"] { padding: 2px 0 0 2px; }
    [data-p1-outcome-row="true"] { display: flex; gap: 6px; flex-wrap: wrap; }
  `;
  state.shellRoot = document.createElement("div");
  state.shellRoot.setAttribute("data-p1-shell", "true");
  state.shellRoot.addEventListener("click", onShellClick);
  state.shellRoot.addEventListener("pointerdown", onShellPointerDown);
  shadow.append(style, state.shellRoot);
  mount.appendChild(state.shadowHost);
  return true;
}

function teardownRoot() {
  state.shadowHost?.remove();
  state.shadowHost = null;
  state.shellRoot = null;
}

async function onShellClick(event) {
  const actionNode = event.target?.closest?.("[data-p1-action]");
  if (!actionNode) {
    return;
  }

  const action = actionNode.getAttribute("data-p1-action");
  if (action === "open-analyze") {
    if (state.launcherDragMoved) {
      state.launcherDragMoved = false;
      return;
    }
    await openHud({
      analyzeImmediately: true,
      allowWithoutCompose: false,
      toggleIfOpen: true
    });
    return;
  }

  if (action === "dismiss-launcher") {
    state.launcherDismissed = true;
    renderUi();
    return;
  }

  if (action === "close-hud") {
    closeHud();
    return;
  }

  if (action === "analyze-now") {
    await analyzeCurrentDraft();
    return;
  }

  if (action === "use-branch") {
    await useBranch(Number(actionNode.getAttribute("data-option")));
    return;
  }

  if (action === "copy-branch") {
    await copyBranch(Number(actionNode.getAttribute("data-option")));
    return;
  }

  if (action === "record-outcome") {
    await recordOutcome(actionNode.getAttribute("data-outcome"));
  }
}

function onShellPointerDown(event) {
  const launcherNode = event.target?.closest?.("[data-p1-launcher='true']");
  if (!launcherNode || state.hudOpen) {
    return;
  }

  state.launcherDragActive = true;
  state.launcherDragMoved = false;
  state.dragStartX = event.clientX;
  state.dragStartY = event.clientY;
  state.dragInitialOffsetX = state.launcherOffsetX;
  state.dragInitialOffsetY = state.launcherOffsetY;
}

function onGlobalPointerMove(event) {
  if (!state.launcherDragActive) {
    return;
  }

  const deltaX = event.clientX - state.dragStartX;
  const deltaY = event.clientY - state.dragStartY;
  state.launcherOffsetX = state.dragInitialOffsetX + deltaX;
  state.launcherOffsetY = state.dragInitialOffsetY + deltaY;
  if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
    state.launcherDragMoved = true;
  }
  renderUi();
}

function onGlobalPointerUp() {
  if (!state.launcherDragActive) {
    return;
  }

  state.launcherDragActive = false;
  window.setTimeout(() => {
    state.launcherDragMoved = false;
  }, 0);
}

function buildLauncherMarkup() {
  if (!state.currentContext?.composeDetected || !state.currentComposeTarget || state.hudOpen || state.launcherDismissed) {
    return "";
  }

  const rect = clampRect(state.currentComposeTarget.getBoundingClientRect());
  const heuristic = evaluateDraftHeuristically(state.lastDraft, state.currentContext);
  const top = clampNumber(rect.top + 10 + state.launcherOffsetY, 12, window.innerHeight - 54);
  const left = clampNumber(rect.right - 46 + state.launcherOffsetX, 12, Math.max(12, window.innerWidth - 54));

  return `
    <div data-p1-launcher-wrap="true" style="top:${top}px;left:${left}px;">
      <button
        type="button"
        data-p1-launcher="true"
        data-p1-action="open-analyze"
        aria-label="Analyze current draft with persona1"
      >
        <span data-p1-badge="true" data-p1-badge-tone="${toneForAnnotation(heuristic.annotation)}">${escapeHtml(heuristic.annotation)}</span>
      </button>
      <button
        type="button"
        data-p1-launcher-dismiss="true"
        data-p1-action="dismiss-launcher"
        aria-label="Dismiss persona1 launcher"
      >
        ×
      </button>
    </div>
  `;
}

function buildHudMarkup() {
  const layout = computeHudLayout();
  const context = state.currentContext;
  const draftAssessment = state.analysis?.draftAssessment || evaluateDraftHeuristically(state.lastDraft, context);
  const content = state.error
    ? `<div data-p1-inline-note="true" data-tone="error">${escapeHtml(state.error)}</div>`
    : state.isAnalyzing
      ? `<div data-p1-inline-note="true">${escapeHtml(state.status || "reading the board...")}</div>`
      : state.analysis?.branches?.length
        ? `
          <div data-p1-branches="true">
            ${state.analysis.branches.map((branch) => buildBranchCard(branch)).join("")}
          </div>
          ${buildOutcomeMarkup()}
        `
        : `<div data-p1-inline-note="true">${escapeHtml(draftAssessment.label)}</div>`;

  return `
    <section data-p1-hud="true" style="top:${layout.top}px;left:${layout.left}px;">
      <div data-p1-hud-head="true">
        <span data-p1-badge="true" data-p1-badge-tone="${toneForAnnotation(draftAssessment.annotation)}">${escapeHtml(draftAssessment.annotation)}</span>
      </div>
      ${content}
    </section>
  `;
}

function buildBranchCard(branch) {
  const selected = branch.optionId === state.selectedOptionId;
  return `
    <article
      data-p1-branch-card="true"
      data-option="${branch.optionId}"
      data-selected="${selected ? "true" : "false"}"
      data-recommended="${branch.isRecommended ? "true" : "false"}"
      data-p1-action="use-branch"
    >
      <div data-p1-annotation-row="true">
        <div data-p1-row="true">
          <span data-p1-badge="true" data-p1-badge-tone="${toneForAnnotation(branch.annotation)}">${escapeHtml(branch.annotation)}</span>
          <p data-p1-move-label="true">${escapeHtml(branch.moveLabel)}</p>
        </div>
        <p data-p1-small="true">${branch.isRecommended ? "recommended" : `${escapeHtml(branch.goalAlignmentScore)}`}</p>
      </div>
      <p data-p1-message="true">${escapeHtml(branch.message)}</p>
      <p data-p1-small="true">${escapeHtml(branch.predictedResponse)}</p>
      <p data-p1-branch-path="true">${escapeHtml(branch.branchPath)}</p>
    </article>
  `;
}

function buildOutcomeMarkup() {
  if (!state.lastAppliedBranch) {
    return "";
  }

  return `
    <div data-p1-outcome="true">
      <div data-p1-outcome-row="true">
        <button type="button" data-p1-button="true" data-p1-action="record-outcome" data-outcome="positive">landed</button>
        <button type="button" data-p1-button="true" data-p1-action="record-outcome" data-outcome="neutral">neutral</button>
        <button type="button" data-p1-button="true" data-p1-action="record-outcome" data-outcome="negative">missed</button>
      </div>
    </div>
  `;
}

function computeHudLayout() {
  const composeRect = state.currentComposeTarget ? clampRect(state.currentComposeTarget.getBoundingClientRect()) : null;
  const width = Math.min(Math.max((composeRect?.right || 0) - (composeRect?.left || 0), 260), 360, window.innerWidth - 24);

  if (!composeRect) {
    return {
      top: clampNumber(window.innerHeight / 2 - 90, 12, Math.max(12, window.innerHeight - 220)),
      left: clampNumber(window.innerWidth / 2 - width / 2, 12, Math.max(12, window.innerWidth - width - 12))
    };
  }

  const spaceBelow = window.innerHeight - composeRect.bottom;
  const top =
    spaceBelow > 180
      ? clampNumber(composeRect.top + 42, 12, Math.max(12, window.innerHeight - 220))
      : clampNumber(composeRect.top - 188, 12, Math.max(12, window.innerHeight - 220));
  const left = clampNumber(composeRect.right - width, 12, Math.max(12, window.innerWidth - width - 12));

  return { top, left };
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

function recommendedOptionId(branches) {
  return branches.find((branch) => branch.isRecommended)?.optionId || 1;
}

function toRecipientContext(context) {
  return {
    recipientName: context.recipientName || null,
    recipientHandle: context.recipientHandle || null,
    communicationStyle: context.communicationStyle || "casual",
    emotionalStateSignals: context.emotionalStateSignals || [],
    relationshipType: context.relationshipType || "acquaintance",
    platform: context.platform || "other",
    threadSummary: context.threadSummary || "",
    recipientLastMessage: context.recipientLastMessage || null,
    inferredWants: context.inferredWants || "clarity",
    inferredConcerns: context.inferredConcerns || "confusion",
    contextConfidence: context.contextConfidence || 50
  };
}

function evaluateDraftHeuristically(draft, context) {
  const text = String(draft || "").trim();
  if (!text) {
    return {
      annotation: "??",
      label: "no move yet",
      reason: "there is no draft to evaluate."
    };
  }

  let score = 0;
  const lower = text.toLowerCase();

  if (text.length >= 14) score += 1;
  if (text.length >= 36 && text.length <= 220) score += 1;
  if (/[?]/.test(text)) score += 0.5;
  if (/\b(can|would|open to|free to|worth)\b/i.test(text)) score += 0.5;
  if (/\b(just checking in|hope you're well|circling back|following up|wanted to follow up)\b/i.test(lower)) score -= 2.5;
  if (/\bmaybe|kind of|sort of|just wanted|was wondering\b/i.test(lower)) score -= 1.2;
  if (text.length > 280) score -= 1.4;
  if (/(!!|\?\?|\.\.\.)/.test(text)) score -= 0.6;
  if (context?.platform === "linkedin" && /\b(meeting|call|demo)\b/i.test(lower)) score += 0.4;
  if (/\bbecause|so that|which means\b/i.test(lower)) score += 0.3;
  if (/\bplease let me know\b/i.test(lower)) score -= 0.8;

  if (score >= 2.5) {
    return { annotation: "!", label: "playable move", reason: "the draft is concrete enough to create a predictable reply." };
  }
  if (score >= 1.6) {
    return { annotation: "!?", label: "interesting move", reason: "there is some leverage here, but the line can still drift." };
  }
  if (score >= 0.4) {
    return { annotation: "?!", label: "soft edge", reason: "the draft may work, but it gives away too much control." };
  }
  if (score >= -0.8) {
    return { annotation: "?", label: "weak move", reason: "the draft is easy to brush off or misread." };
  }
  return { annotation: "??", label: "blunder risk", reason: "the draft is generic enough to collapse the thread." };
}

function toneForAnnotation(annotation) {
  if (annotation === "!!" || annotation === "!") {
    return "good";
  }
  if (annotation === "!?" || annotation === "?!") {
    return "neutral";
  }
  return "risky";
}

function installObserver() {
  if (state.observer || !document.documentElement) {
    return;
  }

  state.observer = new MutationObserver(() => refreshContext());
  state.observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-label", "role", "contenteditable", "data-testid"]
  });
}

function detectComposeContext(doc) {
  return (
    extractLinkedInContext(doc) ||
    extractGmailContext(doc) ||
    extractTwitterDmContext(doc) ||
    extractSlackContext(doc) ||
    extractDatingAppContext(doc) ||
    extractFallbackContext(doc)
  );
}

function extractLinkedInContext(doc) {
  const onLinkedIn = /(^|\.)linkedin\.com$/i.test(window.location.hostname);
  const composeNode =
    doc.querySelector(".msg-form__contenteditable[contenteditable='true']") ||
    doc.querySelector("[contenteditable='true'][role='textbox']") ||
    doc.querySelector("textarea[name='message']");
  if (!onLinkedIn || !composeNode) {
    return null;
  }

  const thread =
    composeNode.closest("[data-test-conversation-pane-wrapper], .msg-thread, .msg-overlay-conversation-bubble") ||
    doc.body;

  return {
    platform: "linkedin",
    composeNode,
    draft: normalizeComposeValue(composeNode),
    recipientName:
      doc.querySelector(".msg-thread__link-to-profile .t-16, .msg-thread-header__participant-names, .msg-s-message-group__name")
        ?.textContent?.trim() || null,
    recipientHandle: null,
    relationshipType: "colleague",
    communicationStyle: "professional",
    emotionalStateSignals: [],
    inferredWants: "a concise, competent, low-friction response",
    inferredConcerns: "time cost and vague asks",
    threadSummary: summarizeThreadText(thread.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(thread.innerText || "")) || null,
    contextConfidence: 80
  };
}

function extractGmailContext(doc) {
  const onGmail = /(^|\.)mail\.google\.com$/i.test(window.location.hostname);
  const composeNode =
    doc.querySelector('div[aria-label="Message Body"][contenteditable="true"]') ||
    doc.querySelector('div[role="textbox"][g_editable="true"]') ||
    doc.querySelector('div[contenteditable="true"][aria-label*="Message Body"]') ||
    doc.querySelector('div[contenteditable="true"][role="textbox"][aria-multiline="true"]');
  if (!onGmail || !composeNode) {
    return null;
  }

  const thread = composeNode.closest(".nH, .aDh, .aoP") || doc.body;
  const recipientName =
    doc.querySelector("input[peoplekit-id]")?.value?.trim() ||
    doc.querySelector("span[email]")?.getAttribute("email")?.trim() ||
    doc.querySelector("div[data-hovercard-id]")?.getAttribute("data-hovercard-id")?.trim() ||
    null;

  return {
    platform: "gmail",
    composeNode,
    draft: normalizeComposeValue(composeNode),
    recipientName,
    recipientHandle: recipientName,
    relationshipType: "colleague",
    communicationStyle: "professional",
    emotionalStateSignals: [],
    inferredWants: "clarity and competence",
    inferredConcerns: "friction, ambiguity, and time cost",
    threadSummary: summarizeThreadText(thread.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(thread.innerText || "")) || null,
    contextConfidence: 84
  };
}

function extractTwitterDmContext(doc) {
  const onX = /(^|\.)x\.com$/i.test(window.location.hostname) || /(^|\.)twitter\.com$/i.test(window.location.hostname);
  const composeNode =
    doc.querySelector('[data-testid="dmComposerTextInput"][contenteditable="true"]') ||
    doc.querySelector('[data-testid="dmComposerTextInput"]');
  if (!onX || !composeNode) {
    return null;
  }

  const thread = composeNode.closest('[data-testid="DMDrawer"]') || doc.body;
  const recipientName = doc.querySelector('[data-testid="DMConversationTitle"] span')?.textContent?.trim() || null;

  return {
    platform: "twitter",
    composeNode,
    draft: normalizeComposeValue(composeNode),
    recipientName,
    recipientHandle: recipientName ? `@${recipientName.replace(/\s+/g, "").toLowerCase()}` : null,
    relationshipType: "acquaintance",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clarity and tone control",
    inferredConcerns: "awkwardness or pressure",
    threadSummary: summarizeThreadText(thread.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(thread.innerText || "")) || null,
    contextConfidence: 72
  };
}

function extractSlackContext(doc) {
  const onSlack = /(^|\.)app\.slack\.com$/i.test(window.location.hostname);
  const composeNode =
    doc.querySelector('[data-qa="message_input"] [contenteditable="true"]') ||
    doc.querySelector('[data-qa="message_input"]');
  if (!onSlack || !composeNode) {
    return null;
  }

  const recipientName =
    doc.querySelector('[data-qa="channel_header_title"], [data-qa="channel_name"]')?.textContent?.trim() || null;

  return {
    platform: "slack",
    composeNode,
    draft: normalizeComposeValue(composeNode),
    recipientName,
    recipientHandle: recipientName,
    relationshipType: "colleague",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clear, low-friction coordination",
    inferredConcerns: "noise and ambiguity",
    threadSummary: summarizeThreadText(doc.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 70
  };
}

function extractDatingAppContext(doc) {
  const onDatingApp = /(bumble|hinge|tinder|feeld)/i.test(window.location.hostname);
  const composeNode =
    doc.querySelector("textarea") ||
    doc.querySelector('[contenteditable="true"][role="textbox"]');
  if (!onDatingApp || !composeNode) {
    return null;
  }

  return {
    platform: "dating_app",
    composeNode,
    draft: normalizeComposeValue(composeNode),
    recipientName:
      doc.querySelector("header h1, header h2, [data-testid='profile-name']")?.textContent?.trim() || null,
    recipientHandle: null,
    relationshipType: "romantic",
    communicationStyle: "warm",
    emotionalStateSignals: [],
    inferredWants: "ease, confidence, and spark without pressure",
    inferredConcerns: "awkwardness, over-investment, and generic lines",
    threadSummary: summarizeThreadText(doc.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 58
  };
}

function extractFallbackContext(doc) {
  const active = doc.activeElement;
  const composeNode =
    active && (active.tagName === "TEXTAREA" || active.isContentEditable)
      ? active
      : doc.querySelector("textarea, [contenteditable='true'], div[role='textbox']");
  if (!composeNode) {
    return null;
  }

  return {
    platform: "other",
    composeNode,
    draft: normalizeComposeValue(composeNode),
    recipientName: null,
    recipientHandle: null,
    relationshipType: "acquaintance",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clarity",
    inferredConcerns: "awkwardness and confusion",
    threadSummary: summarizeThreadText(doc.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 45
  };
}

function isComposeNode(node) {
  return Boolean(
    node &&
      typeof node === "object" &&
      ("tagName" in node || "isContentEditable" in node) &&
      ((node.tagName === "TEXTAREA") ||
        (node.tagName === "INPUT" && node.type === "text") ||
        node.isContentEditable)
  );
}

function normalizeComposeValue(target) {
  if (!target) {
    return "";
  }

  if (typeof target.value === "string") {
    return target.value;
  }

  if (typeof target.innerText === "string") {
    return target.innerText.trim();
  }

  return "";
}

function getComposeSignature(target) {
  if (!target) {
    return "none";
  }

  const tag = target.tagName?.toLowerCase?.() || "node";
  const role = target.getAttribute?.("role") || "";
  const aria = target.getAttribute?.("aria-label") || "";
  const id = target.id || "";
  const classes = typeof target.className === "string" ? target.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".") : "";
  return [tag, role, aria, id, classes].join("|");
}

function insertComposeValue(target, value) {
  if (!target) {
    return false;
  }

  const next = String(value || "");
  target.focus();

  if (typeof target.value === "string") {
    target.value = next;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (target.isContentEditable) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, next);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      target.innerHTML = "";
      next.split("\n").forEach((line, index) => {
        if (index > 0) {
          target.appendChild(document.createElement("br"));
        }
        target.appendChild(document.createTextNode(line));
      });
    }

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

function clampRect(rect) {
  return {
    top: Number.isFinite(rect.top) ? rect.top : 24,
    right: Number.isFinite(rect.right) ? rect.right : 24,
    bottom: Number.isFinite(rect.bottom) ? rect.bottom : 24,
    left: Number.isFinite(rect.left) ? rect.left : 24
  };
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function summarizeThreadText(value) {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 280);
}

function findLastLine(value) {
  return String(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || "";
}

function hashContext(snapshot) {
  const raw = JSON.stringify(snapshot || {});
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `ctx_${hash.toString(16)}`;
}

function safeUuid() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
