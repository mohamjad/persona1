import { STORAGE_KEYS, DEFAULT_SETTINGS } from "./storage-keys.js";

export async function getApiBaseUrl() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  return stored[STORAGE_KEYS.settings]?.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
}

export async function analyzeConversation(payload) {
  return sendJson("/v1/analyze", {
    method: "POST",
    body: payload
  });
}

export async function registerUser(payload) {
  return sendJson("/v1/auth/register", {
    method: "POST",
    body: payload
  });
}

export async function checkout(payload, authToken) {
  return sendJson("/v1/billing/checkout", {
    method: "POST",
    body: payload,
    authToken
  });
}

export async function syncPersona(payload, authToken) {
  return sendJson("/v1/persona/sync", {
    method: "POST",
    body: payload,
    authToken
  });
}

export async function updatePersona(payload, authToken) {
  return sendJson("/v1/persona/update", {
    method: "POST",
    body: payload,
    authToken
  });
}

export async function getUsage(userId, authToken) {
  return sendJson(`/v1/usage/${encodeURIComponent(userId)}`, {
    method: "GET",
    authToken
  });
}

async function sendJson(path, input) {
  const apiBaseUrl = await getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      ...(input.authToken ? { authorization: `Bearer ${input.authToken}` } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `API request failed with status ${response.status}.`);
  }

  return payload;
}
