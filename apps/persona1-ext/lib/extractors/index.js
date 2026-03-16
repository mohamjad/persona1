import { extractGmailContext } from "./gmail.js";
import { extractLinkedInContext } from "./linkedin.js";
import { extractSlackContext } from "./slack.js";
import { extractTwitterDmContext } from "./twitter-dm.js";
import { extractDatingAppContext } from "./dating-app.js";
import { extractFallbackContext } from "./fallback.js";

export function detectComposeContext(doc = document) {
  return (
    extractLinkedInContext(doc) ||
    extractGmailContext(doc) ||
    extractTwitterDmContext(doc) ||
    extractSlackContext(doc) ||
    extractDatingAppContext(doc) ||
    extractFallbackContext(doc)
  );
}
