export function normalizeComposeValue(target) {
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

export function insertComposeValue(target, value) {
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

export function summarizeThreadText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 280);
}
