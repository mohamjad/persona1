const SNAPSHOT_TYPE = "persona1:get-page-snapshot";
const INSERT_TYPE = "persona1:insert-selected-message";

let currentComposeTarget = null;
let currentContext = null;
let chip = null;

refreshContext();
window.addEventListener("focusin", refreshContext, true);
window.setInterval(refreshContext, 1500);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message?.type === SNAPSHOT_TYPE) {
      refreshContext();
      sendResponse({
        ok: true,
        snapshot: currentContext
      });
      return true;
    }

    if (message?.type === INSERT_TYPE) {
      refreshContext();
      if (!currentComposeTarget) {
        sendResponse({
          ok: false,
          error: "No active compose target found."
        });
        return true;
      }

      const inserted = insertComposeValue(currentComposeTarget, message.value);
      sendResponse({
        ok: inserted
      });
      return true;
    }
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Content script error."
    });
    return true;
  }

  return false;
});

function refreshContext() {
  const detected = detectComposeContext(document);
  currentContext = detected;
  currentComposeTarget = detected ? resolveComposeTarget(detected.composeSelector) : null;
  syncChip();
}

function resolveComposeTarget(selector) {
  if (!selector) {
    return document.activeElement;
  }

  try {
    return document.querySelector(selector) || document.activeElement;
  } catch {
    return document.activeElement;
  }
}

function syncChip() {
  if (!currentContext?.composeDetected) {
    chip?.remove();
    chip = null;
    return;
  }

  if (!chip) {
    chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = "persona1";
    chip.style.position = "fixed";
    chip.style.right = "24px";
    chip.style.bottom = "24px";
    chip.style.zIndex = "2147483647";
    chip.style.border = "1px solid rgba(15, 23, 42, 0.18)";
    chip.style.background = "#f8fafc";
    chip.style.color = "#0f172a";
    chip.style.padding = "10px 14px";
    chip.style.borderRadius = "999px";
    chip.style.boxShadow = "0 12px 32px rgba(15, 23, 42, 0.14)";
    chip.style.cursor = "pointer";
    chip.style.font = "600 12px/1.2 ui-sans-serif, system-ui, sans-serif";
    chip.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        type: "persona1:sidebar-command",
        command: "toggle_sidebar"
      });
    });
    document.documentElement.appendChild(chip);
  }
}

function detectComposeContext(doc = document) {
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
  const composeTarget =
    doc.querySelector('[contenteditable="true"][role="textbox"]') ||
    doc.querySelector("textarea[name='message']") ||
    doc.querySelector("textarea");
  const onLinkedIn = /linkedin\.com$/i.test(window.location.hostname);
  if (!onLinkedIn || !composeTarget) {
    return null;
  }

  const threadContainer = composeTarget.closest("[data-test-conversation-pane-wrapper], .msg-thread") || doc.body;
  const recipientName =
    doc.querySelector(".msg-thread__link-to-profile .t-16")?.textContent?.trim() ||
    doc.querySelector(".msg-s-message-group__name")?.textContent?.trim() ||
    null;

  return {
    platform: "linkedin",
    composeDetected: true,
    composeSelector: describeNode(composeTarget),
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: null,
    relationshipType: "colleague",
    communicationStyle: "professional",
    emotionalStateSignals: [],
    inferredWants: "a concise, competent, low-friction response",
    inferredConcerns: "time cost and vague asks",
    threadSummary: summarizeThreadText(threadContainer.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(threadContainer.innerText || "")) || null,
    contextConfidence: 78
  };
}

function extractGmailContext(doc) {
  const onGmail = /mail\.google\.com$/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector('div[aria-label="Message Body"][contenteditable="true"]') ||
    doc.querySelector('div[role="textbox"][g_editable="true"]');

  if (!onGmail || !composeTarget) {
    return null;
  }

  const recipients = [...doc.querySelectorAll("span[email], input[aria-label='To recipients']")]
    .map((node) => node.getAttribute?.("email") || node.value || node.textContent || "")
    .map((value) => value.trim())
    .filter(Boolean);
  const threadRoot = composeTarget.closest(".nH") || doc.body;

  return {
    platform: "gmail",
    composeDetected: true,
    composeSelector: "div[aria-label='Message Body']",
    draft: normalizeComposeValue(composeTarget),
    recipientName: recipients[0] || null,
    recipientHandle: recipients[0] || null,
    relationshipType: "colleague",
    communicationStyle: "professional",
    emotionalStateSignals: [],
    inferredWants: "clarity and competence",
    inferredConcerns: "friction, ambiguity, and time cost",
    threadSummary: summarizeThreadText(threadRoot.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(threadRoot.innerText || "")) || null,
    contextConfidence: 84
  };
}

function extractFallbackContext(doc) {
  const active = doc.activeElement;
  const target =
    active && (active.tagName === "TEXTAREA" || active.isContentEditable)
      ? active
      : doc.querySelector("textarea, [contenteditable='true']");

  if (!target) {
    return null;
  }

  return {
    platform: "other",
    composeDetected: true,
    composeSelector: target.tagName.toLowerCase(),
    draft: normalizeComposeValue(target),
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

function extractTwitterDmContext(doc) {
  const onX = /x\.com$/i.test(window.location.hostname) || /twitter\.com$/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector('[data-testid="dmComposerTextInput"][contenteditable="true"]') ||
    doc.querySelector('[data-testid="dmComposerTextInput"]');

  if (!onX || !composeTarget) {
    return null;
  }

  const threadRoot = composeTarget.closest('[data-testid="DMDrawer"]') || doc.body;
  const recipientName =
    doc.querySelector('[data-testid="DMConversationTitle"] span')?.textContent?.trim() || null;

  return {
    platform: "twitter",
    composeDetected: true,
    composeSelector: '[data-testid="dmComposerTextInput"]',
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: recipientName ? `@${recipientName.replace(/\s+/g, "").toLowerCase()}` : null,
    relationshipType: "acquaintance",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clarity and tone control",
    inferredConcerns: "awkwardness or pressure",
    threadSummary: summarizeThreadText(threadRoot.innerText || ""),
    recipientLastMessage: summarizeThreadText(findLastLine(threadRoot.innerText || "")) || null,
    contextConfidence: 72
  };
}

function extractSlackContext(doc) {
  const onSlack = /app\.slack\.com$/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector('[data-qa="message_input"] [contenteditable="true"]') ||
    doc.querySelector('[data-qa="message_input"]');

  if (!onSlack || !composeTarget) {
    return null;
  }

  const recipientName =
    doc.querySelector('[data-qa="channel_header_title"]')?.textContent?.trim() ||
    doc.querySelector('[data-qa="channel_name"]')?.textContent?.trim() ||
    null;

  return {
    platform: "slack",
    composeDetected: true,
    composeSelector: '[data-qa="message_input"]',
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: recipientName,
    relationshipType: "colleague",
    communicationStyle: "casual",
    emotionalStateSignals: [],
    inferredWants: "clear, low-friction coordination",
    inferredConcerns: "noise and ambiguity",
    threadSummary: summarizeThreadText(document.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 70
  };
}

function extractDatingAppContext(doc) {
  const onDatingApp = /(bumble|hinge|tinder|feeld)/i.test(window.location.hostname);
  const composeTarget =
    doc.querySelector("textarea") ||
    doc.querySelector('[contenteditable="true"][role="textbox"]');

  if (!onDatingApp || !composeTarget) {
    return null;
  }

  const recipientName =
    doc.querySelector("header h1, header h2, [data-testid='profile-name']")?.textContent?.trim() || null;

  return {
    platform: "dating_app",
    composeDetected: true,
    composeSelector: composeTarget.tagName.toLowerCase(),
    draft: normalizeComposeValue(composeTarget),
    recipientName,
    recipientHandle: null,
    relationshipType: "romantic",
    communicationStyle: "warm",
    emotionalStateSignals: [],
    inferredWants: "ease, confidence, and spark without pressure",
    inferredConcerns: "awkwardness, over-investment, and generic lines",
    threadSummary: summarizeThreadText(document.body?.innerText || ""),
    recipientLastMessage: null,
    contextConfidence: 58
  };
}

function normalizeComposeValue(target) {
  if (!target) {
    return "";
  }

  if ("value" in target && typeof target.value === "string") {
    return target.value;
  }

  if ("innerText" in target && typeof target.innerText === "string") {
    return target.innerText.trim();
  }

  return "";
}

function insertComposeValue(target, value) {
  if (!target) {
    return false;
  }

  if ("value" in target) {
    target.focus();
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (target.isContentEditable) {
    target.focus();
    target.textContent = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

function summarizeThreadText(text) {
  return String(text).replace(/\s+/g, " ").trim().slice(0, 280);
}

function findLastLine(value) {
  return String(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || "";
}

function describeNode(node) {
  return node.id
    ? `#${node.id}`
    : node.className
      ? `.${String(node.className).split(" ").filter(Boolean).join(".")}`
      : node.tagName.toLowerCase();
}
