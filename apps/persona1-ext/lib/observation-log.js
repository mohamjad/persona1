import { STORAGE_KEYS } from "./storage-keys.js";

export async function appendInteractionLog(entry) {
  const current = await chrome.storage.local.get([STORAGE_KEYS.interactionLog]);
  const next = [...(current[STORAGE_KEYS.interactionLog] || []), entry].slice(-200);
  await chrome.storage.local.set({
    [STORAGE_KEYS.interactionLog]: next
  });
  return next;
}

export async function appendObservationQueue(entry) {
  const current = await chrome.storage.local.get([STORAGE_KEYS.observationQueue]);
  const next = [...(current[STORAGE_KEYS.observationQueue] || []), entry].slice(-200);
  await chrome.storage.local.set({
    [STORAGE_KEYS.observationQueue]: next
  });
  return next;
}
