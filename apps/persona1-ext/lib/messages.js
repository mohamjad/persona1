export const MESSAGE_TYPES = {
  getExtensionState: "persona1:get-extension-state",
  setColdStartContext: "persona1:set-cold-start-context",
  analyzeConversation: "persona1:analyze-conversation",
  prefetchConversation: "persona1:prefetch-conversation",
  recordOptionSelection: "persona1:record-option-selection",
  recordOutcome: "persona1:record-outcome",
  getUsageState: "persona1:get-usage-state",
  startCheckout: "persona1:start-checkout",
  getPageSnapshot: "persona1:get-page-snapshot",
  insertSelectedMessage: "persona1:insert-selected-message",
  sidebarCommand: "persona1:sidebar-command"
};

export const BRIDGE_DESTINATIONS = {
  background: "background",
  popup: "popup",
  contentScriptForTab(tabId) {
    return `content-script@${tabId}`;
  }
};

export const COMMAND_TYPES = {
  toggleSidebar: "toggle_sidebar",
  analyze: "analyze",
  selectOption1: "select_option_1",
  selectOption2: "select_option_2",
  selectOption3: "select_option_3",
  copySelected: "copy_selected",
  collapseSidebar: "collapse_sidebar"
};
