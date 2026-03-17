import { MESSAGE_TYPES } from "./lib/messages.js";
import { COMMAND_TYPES } from "./lib/messages.js";
import { getExtensionState, updateSettings } from "./lib/persona-store.js";
import { sendPopupMessage } from "./lib/popup-bridge.js";
import { deriveCommunicationScorecard, formatScorecardForSharing } from "./lib/scorecard.js";

const statusNode = document.querySelector("#popup-status");
const openSidePanelButton = document.querySelector("#open-sidepanel");
const apiBaseUrlInput = document.querySelector("#api-base-url");
const saveSettingsButton = document.querySelector("#save-settings");
const scorecardHeadline = document.querySelector("#scorecard-headline");
const scorecardMetrics = document.querySelector("#scorecard-metrics");
const copyScorecardButton = document.querySelector("#copy-scorecard");

const state = await getExtensionState();
apiBaseUrlInput.value = state.settings.apiBaseUrl;
statusNode.textContent = `Plan: ${state.plan}. Usage tracked: ${state.usageCount}.`;
renderScorecard(state);

document.querySelectorAll("[data-cold-start]").forEach((button) => {
  button.addEventListener("click", async () => {
    const response = await sendPopupMessage(MESSAGE_TYPES.setColdStartContext, {
      coldStartContext: button.getAttribute("data-cold-start")
    });
    statusNode.textContent = response.ok
      ? `Cold start saved: ${button.getAttribute("data-cold-start")}.`
      : response.error;
  });
});

openSidePanelButton.addEventListener("click", async () => {
  const response = await sendPopupMessage(MESSAGE_TYPES.sidebarCommand, {
    command: COMMAND_TYPES.analyze
  });
  statusNode.textContent = response?.ok
    ? "Analyzing the active draft."
    : response?.error || "Could not analyze the active draft.";
});

saveSettingsButton.addEventListener("click", async () => {
  const next = await updateSettings({
    apiBaseUrl: apiBaseUrlInput.value.trim() || "http://127.0.0.1:8787"
  });
  statusNode.textContent = `Saved API base URL: ${next.apiBaseUrl}`;
});

copyScorecardButton.addEventListener("click", async () => {
  const latestState = await getExtensionState();
  const scorecard = deriveCommunicationScorecard(latestState);
  await navigator.clipboard.writeText(formatScorecardForSharing(scorecard));
  statusNode.textContent = "Copied the local communication scorecard.";
});

function renderScorecard(state) {
  const scorecard = deriveCommunicationScorecard(state);
  scorecardHeadline.textContent = scorecard.headline;
  scorecardMetrics.innerHTML = [
    ["clarity", scorecard.clarity],
    ["discipline", scorecard.strategicDiscipline],
    ["landing", scorecard.landingRate],
    ["volatility", scorecard.volatility]
  ]
    .map(
      ([label, value]) => `
        <div class="score-cell">
          <strong>${label}</strong><br />
          ${value}
        </div>
      `
    )
    .join("");
}
