export const SIDEBAR_STATES = {
  idle: "idle",
  composeDetected: "compose_detected",
  contextReady: "context_ready",
  analyzing: "analyzing",
  branchesReady: "branches_ready",
  optionSelected: "option_selected",
  outcomeCapture: "outcome_capture",
  mirrorReady: "mirror_ready",
  error: "error"
};

const ALLOWED_TRANSITIONS = {
  [SIDEBAR_STATES.idle]: [SIDEBAR_STATES.composeDetected, SIDEBAR_STATES.error],
  [SIDEBAR_STATES.composeDetected]: [SIDEBAR_STATES.contextReady, SIDEBAR_STATES.idle, SIDEBAR_STATES.error],
  [SIDEBAR_STATES.contextReady]: [SIDEBAR_STATES.analyzing, SIDEBAR_STATES.idle, SIDEBAR_STATES.error],
  [SIDEBAR_STATES.analyzing]: [SIDEBAR_STATES.branchesReady, SIDEBAR_STATES.error, SIDEBAR_STATES.contextReady],
  [SIDEBAR_STATES.branchesReady]: [SIDEBAR_STATES.optionSelected, SIDEBAR_STATES.outcomeCapture, SIDEBAR_STATES.error],
  [SIDEBAR_STATES.optionSelected]: [SIDEBAR_STATES.outcomeCapture, SIDEBAR_STATES.branchesReady, SIDEBAR_STATES.error],
  [SIDEBAR_STATES.outcomeCapture]: [SIDEBAR_STATES.mirrorReady, SIDEBAR_STATES.contextReady, SIDEBAR_STATES.error],
  [SIDEBAR_STATES.mirrorReady]: [SIDEBAR_STATES.contextReady, SIDEBAR_STATES.idle, SIDEBAR_STATES.error],
  [SIDEBAR_STATES.error]: [SIDEBAR_STATES.idle, SIDEBAR_STATES.composeDetected]
};

export function createSidebarMachineState() {
  return {
    status: SIDEBAR_STATES.idle,
    lastError: null,
    context: null,
    analysis: null,
    selectedOptionId: null,
    mirrorInsights: []
  };
}

export function transitionSidebarState(state, nextStatus, patch = {}) {
  const allowed = ALLOWED_TRANSITIONS[state.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid sidebar transition from ${state.status} to ${nextStatus}.`);
  }

  return {
    ...state,
    ...patch,
    status: nextStatus,
    lastError: nextStatus === SIDEBAR_STATES.error ? patch.lastError ?? "Unknown error" : null
  };
}
