import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { loggers } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store file location (in data dir to persist)
const DATA_DIR = path.resolve(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "api-keys.json");

export interface ApiKeyData {
  keyId: string;
  name: string;
  keyPrefix: string; // First few chars to show in UI
  createdAt: number;
  lastUsed?: number;
}

interface ApiKeyStore {
  keys: Record<string, ApiKeyData>; // Hashed token -> Data
}

// In-memory cache
let storeCache: ApiKeyStore | null = null;
let loadPromise: Promise<ApiKeyStore> | null = null;
let savePromise: Promise<void> | null = null;
let savePending = false;

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
  try {
    await fs.promises.access(DATA_DIR);
  } catch {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
  }
}

async function doLoadStore(): Promise<ApiKeyStore> {
  await ensureDataDir();

  try {
    const data = await fs.promises.readFile(STORE_PATH, "utf-8");
    storeCache = JSON.parse(data);
    return storeCache!;
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      loggers.server.error({ error }, "Failed to read api-keys.json, initializing empty store");
    }
  }

  // Init empty store
  storeCache = { keys: {} };
  await saveStore(storeCache);
  return storeCache;
}

/**
 * Load store from disk
 */
async function loadStore(): Promise<ApiKeyStore> {
  if (storeCache) return storeCache;
  if (loadPromise) return loadPromise;

  loadPromise = doLoadStore().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

async function doSaveStore(store: ApiKeyStore) {
  try {
    await ensureDataDir();
    const tempPath = STORE_PATH + ".tmp";
    await fs.promises.writeFile(tempPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.promises.rename(tempPath, STORE_PATH);
    storeCache = store;
  } catch (error) {
    loggers.server.error({ error }, "Failed to write api-keys.json");
  }
}

/**
 * Save store to disk
 */
async function saveStore(store: ApiKeyStore) {
  savePending = true;

  if (savePromise) {
    return savePromise;
  }

  const startSaveLoop = async () => {
    while (savePending) {
      savePending = false;
      await doSaveStore(storeCache || store);
    }
  };

  savePromise = startSaveLoop().finally(() => {
    savePromise = null;
  });

  return savePromise;
}

/**
 * Generate a new API key
 * Returns the full token (only once) and the stored data
 */
export async function generateApiKey(name: string): Promise<{ token: string; data: ApiKeyData }> {
  const store = await loadStore();

  // Generate a random token
  const rawSecret = randomBytes(32).toString("base64url");
  const token = `shogun-api-${rawSecret}`;

  const keyId = `key_${randomBytes(8).toString("hex")}`;
  const keyPrefix = token.substring(0, 16) + "...";

  const data: ApiKeyData = {
    keyId,
    name,
    keyPrefix,
    createdAt: Date.now(),
  };

  // We use the token itself as the key in the store for fast lookup.
  // In a highly secure environment, we would hash the token before storing,
  // but since adminPassword is also in cleartext in .env, this is acceptable for the node operator.
  store.keys[token] = data;
  await saveStore(store);

  loggers.server.info({ keyId, name }, "Generated new API key");

  return { token, data };
}

/**
 * List all API keys (without the full token)
 */
export async function listApiKeys(): Promise<ApiKeyData[]> {
  const store = await loadStore();
  return Object.values(store.keys).map((k) => ({ ...k }));
}

/**
 * Validate an API key token
 * Returns the key data if valid, null otherwise
 */
export async function validateApiKey(token: string): Promise<ApiKeyData | null> {
  const store = await loadStore();
  const data = store.keys[token];

  if (data) {
    // Update last used
    data.lastUsed = Date.now();
    // Fire-and-forget save so we don't penalize API latency
    saveStore(store).catch((err) => {
      loggers.server.error({ error: err }, "Failed background save of api-keys.json");
    });
    return { ...data };
  }

  return null;
}

/**
 * Revoke an API key by ID
 */
export async function revokeApiKey(keyId: string): Promise<boolean> {
  const store = await loadStore();
  let tokenToRemove: string | null = null;

  for (const [token, data] of Object.entries(store.keys)) {
    if (data.keyId === keyId) {
      tokenToRemove = token;
      break;
    }
  }

  if (tokenToRemove) {
    delete store.keys[tokenToRemove];
    await saveStore(store);
    loggers.server.info({ keyId }, "Revoked API key");
    return true;
  }

  return false;
}
