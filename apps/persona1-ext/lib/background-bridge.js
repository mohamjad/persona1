import { onMessage, sendMessage } from "../vendor/webext-bridge/background.js";
import { BRIDGE_DESTINATIONS, MESSAGE_TYPES } from "./messages.js";

export function registerBackgroundHandler(messageType, handler) {
  return onMessage(messageType, async ({ data }) => handler(data));
}

export async function sendBridgeCommandToTab(tabId, messageType, payload) {
  return sendMessage(messageType, payload, BRIDGE_DESTINATIONS.contentScriptForTab(tabId));
}

export async function getBridgePageSnapshot(tabId) {
  return sendBridgeCommandToTab(tabId, MESSAGE_TYPES.getPageSnapshot, {});
}
