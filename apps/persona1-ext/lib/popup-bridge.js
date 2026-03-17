import { sendMessage } from "../vendor/webext-bridge/popup.js";
import { BRIDGE_DESTINATIONS } from "./messages.js";

export async function sendPopupMessage(messageType, payload = {}) {
  try {
    return await Promise.race([
      sendMessage(messageType, payload, BRIDGE_DESTINATIONS.background),
      new Promise((_, reject) => setTimeout(() => reject(new Error("bridge_timeout")), 700))
    ]);
  } catch {
    return chrome.runtime.sendMessage({
      type: messageType,
      ...(payload && typeof payload === "object" ? payload : {})
    });
  }
}
