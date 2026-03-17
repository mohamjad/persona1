import { appendInteraction, appendObservation } from "./db.js";

export async function appendInteractionLog(entry) {
  await appendInteraction(entry);
  return entry;
}

export async function appendObservationQueue(entry) {
  await appendObservation(entry);
  return entry;
}
