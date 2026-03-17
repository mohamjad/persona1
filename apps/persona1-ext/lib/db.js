import Dexie from "../vendor/dexie.mjs";
import { STORAGE_KEYS, DEFAULT_SETTINGS } from "./storage-keys.js";

const META_KEYS = {
  userId: STORAGE_KEYS.userId,
  authToken: STORAGE_KEYS.authToken,
  plan: STORAGE_KEYS.plan,
  usageCount: STORAGE_KEYS.usageCount,
  onboardingDone: STORAGE_KEYS.onboardingDone,
  coldStartContext: STORAGE_KEYS.coldStartContext,
  persona: STORAGE_KEYS.persona,
  settings: STORAGE_KEYS.settings
};

class Persona1ExtensionDb extends Dexie {
  constructor() {
    super("persona1_extension");
    this.version(1).stores({
      meta: "key, updatedAt",
      interactions: "++id, recordedAt, type, sessionId, outcome, preset, platform, recipientContextHash",
      observations: "++id, recordedAt, sessionId, platform, preset",
      mirrorInsights: "insightId, status, createdAt",
      branchCache: "cacheKey, updatedAt, expiresAt",
      scoringConfigs: "sessionKey, updatedAt, expiresAt"
    });
  }
}

export const extensionDb = new Persona1ExtensionDb();
let initializationPromise = null;

export async function ensureDbInitialized() {
  if (!initializationPromise) {
    initializationPromise = migrateLegacyStorageOnce();
  }
  await initializationPromise;
}

export async function getMetaValue(key, fallback = null) {
  await ensureDbInitialized();
  const row = await extensionDb.table("meta").get(key);
  return row ? row.value : fallback;
}

export async function setMetaValue(key, value) {
  await ensureDbInitialized();
  return writeMetaValue(key, value);
}

export async function bulkSetMeta(entries) {
  await ensureDbInitialized();
  return writeMetaEntries(entries);
}

async function writeMetaValue(key, value) {
  await extensionDb.table("meta").put({
    key,
    value,
    updatedAt: new Date().toISOString()
  });
  return value;
}

async function writeMetaEntries(entries) {
  const now = new Date().toISOString();
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value, updatedAt: now }));
  if (rows.length > 0) {
    await extensionDb.table("meta").bulkPut(rows);
  }
}

export async function readExtensionStateFromDb() {
  await ensureDbInitialized();
  const [userId, authToken, plan, usageCount, onboardingDone, coldStartContext, persona, settings] = await Promise.all([
    getMetaValue(META_KEYS.userId, null),
    getMetaValue(META_KEYS.authToken, null),
    getMetaValue(META_KEYS.plan, "free"),
    getMetaValue(META_KEYS.usageCount, 0),
    getMetaValue(META_KEYS.onboardingDone, false),
    getMetaValue(META_KEYS.coldStartContext, null),
    getMetaValue(META_KEYS.persona, null),
    getMetaValue(META_KEYS.settings, DEFAULT_SETTINGS)
  ]);

  const [interactionLog, observationQueue, mirrorInsights] = await Promise.all([
    extensionDb.table("interactions").reverse().limit(200).toArray(),
    extensionDb.table("observations").reverse().limit(200).toArray(),
    extensionDb.table("mirrorInsights").reverse().toArray()
  ]);

  return {
    userId,
    authToken,
    plan,
    usageCount: Number(usageCount || 0),
    onboardingDone: Boolean(onboardingDone),
    coldStartContext,
    persona,
    interactionLog: interactionLog.reverse(),
    observationQueue: observationQueue.reverse(),
    mirrorInsights: mirrorInsights.reverse(),
    settings: {
      ...DEFAULT_SETTINGS,
      ...(settings || {})
    }
  };
}

export async function appendInteraction(entry) {
  await ensureDbInitialized();
  await extensionDb.table("interactions").add(entry);
  const count = await extensionDb.table("interactions").count();
  if (count > 200) {
    const overflow = count - 200;
    const stale = await extensionDb.table("interactions").orderBy("recordedAt").limit(overflow).primaryKeys();
    if (stale.length > 0) {
      await extensionDb.table("interactions").bulkDelete(stale);
    }
  }
}

export async function appendObservation(entry) {
  await ensureDbInitialized();
  await extensionDb.table("observations").add(entry);
  const count = await extensionDb.table("observations").count();
  if (count > 200) {
    const overflow = count - 200;
    const stale = await extensionDb.table("observations").orderBy("recordedAt").limit(overflow).primaryKeys();
    if (stale.length > 0) {
      await extensionDb.table("observations").bulkDelete(stale);
    }
  }
}

export async function replaceMirrorInsights(insights) {
  await ensureDbInitialized();
  await extensionDb.transaction("rw", extensionDb.table("mirrorInsights"), async () => {
    await extensionDb.table("mirrorInsights").clear();
    if (insights.length > 0) {
      await extensionDb.table("mirrorInsights").bulkPut(insights);
    }
  });
}

export async function putBranchCache(cacheKey, value, ttlMs = 5 * 60 * 1000) {
  await ensureDbInitialized();
  const now = Date.now();
  await extensionDb.table("branchCache").put({
    cacheKey,
    value,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  });
}

export async function getBranchCache(cacheKey) {
  await ensureDbInitialized();
  const row = await extensionDb.table("branchCache").get(cacheKey);
  if (!row) {
    return null;
  }
  if (Date.parse(row.expiresAt) <= Date.now()) {
    await extensionDb.table("branchCache").delete(cacheKey);
    return null;
  }
  return row.value;
}

export async function putScoringConfig(sessionKey, scoringConfig, ttlMs = 30 * 60 * 1000) {
  await ensureDbInitialized();
  const now = Date.now();
  await extensionDb.table("scoringConfigs").put({
    sessionKey,
    scoringConfig,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  });
}

export async function getScoringConfig(sessionKey) {
  await ensureDbInitialized();
  const row = await extensionDb.table("scoringConfigs").get(sessionKey);
  if (!row) {
    return null;
  }
  if (Date.parse(row.expiresAt) <= Date.now()) {
    await extensionDb.table("scoringConfigs").delete(sessionKey);
    return null;
  }
  return row.scoringConfig;
}

async function migrateLegacyStorageOnce() {
  const migrated = await extensionDb.table("meta").get("__legacy_migrated__");
  if (migrated?.value) {
    return;
  }

  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const metaSeed = {
    [META_KEYS.userId]: stored[STORAGE_KEYS.userId] || null,
    [META_KEYS.authToken]: stored[STORAGE_KEYS.authToken] || null,
    [META_KEYS.plan]: stored[STORAGE_KEYS.plan] || "free",
    [META_KEYS.usageCount]: Number(stored[STORAGE_KEYS.usageCount] || 0),
    [META_KEYS.onboardingDone]: Boolean(stored[STORAGE_KEYS.onboardingDone]),
    [META_KEYS.coldStartContext]: stored[STORAGE_KEYS.coldStartContext] || null,
    [META_KEYS.persona]: stored[STORAGE_KEYS.persona] || null,
    [META_KEYS.settings]: {
      ...DEFAULT_SETTINGS,
      ...(stored[STORAGE_KEYS.settings] || {})
    }
  };

  await writeMetaEntries(metaSeed);

  const interactions = stored[STORAGE_KEYS.interactionLog] || [];
  const observations = stored[STORAGE_KEYS.observationQueue] || [];
  const mirrorInsights = stored[STORAGE_KEYS.mirrorInsights] || [];

  if (interactions.length > 0) {
    await extensionDb.table("interactions").bulkPut(
      interactions.map((entry) => ({
        ...entry,
        recordedAt: entry.recordedAt || new Date().toISOString()
      }))
    );
  }
  if (observations.length > 0) {
    await extensionDb.table("observations").bulkPut(
      observations.map((entry) => ({
        ...entry,
        recordedAt: entry.recordedAt || new Date().toISOString()
      }))
    );
  }
  if (mirrorInsights.length > 0) {
    await extensionDb.table("mirrorInsights").bulkPut(mirrorInsights);
  }

  await writeMetaValue("__legacy_migrated__", true);
}
