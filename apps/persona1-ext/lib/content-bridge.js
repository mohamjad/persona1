import { onMessage, sendMessage } from "../vendor/webext-bridge/content-script.js";
import { BRIDGE_DESTINATIONS } from "./messages.js";

let initialized = false;

export function ensureContentBridge(handlers) {
  if (initialized) {
    return;
  }

  initialized = true;
  for (const [messageType, handler] of Object.entries(handlers)) {
    onMessage(messageType, async ({ data }) => handler(data));
  }
}

export async function sendContentMessage(messageType, payload = {}) {
  return sendMessage(messageType, payload, BRIDGE_DESTINATIONS.background);
}
