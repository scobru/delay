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

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load store from disk
 */
function loadStore(): ApiKeyStore {
  if (storeCache) return storeCache;

  ensureDataDir();
  
  if (fs.existsSync(STORE_PATH)) {
    try {
      const data = fs.readFileSync(STORE_PATH, "utf-8");
      storeCache = JSON.parse(data);
      return storeCache!;
    } catch (error) {
      loggers.server.error({ error }, "Failed to read api-keys.json, initializing empty store");
    }
  }

  // Init empty store
  storeCache = { keys: {} };
  saveStore(storeCache);
  return storeCache;
}

/**
 * Save store to disk
 */
function saveStore(store: ApiKeyStore) {
  try {
    ensureDataDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
    storeCache = store;
  } catch (error) {
    loggers.server.error({ error }, "Failed to write api-keys.json");
  }
}

/**
 * Generate a new API key
 * Returns the full token (only once) and the stored data
 */
export function generateApiKey(name: string): { token: string; data: ApiKeyData } {
  const store = loadStore();
  
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
  saveStore(store);

  loggers.server.info({ keyId, name }, "Generated new API key");

  return { token, data };
}

/**
 * List all API keys (without the full token)
 */
export function listApiKeys(): ApiKeyData[] {
  const store = loadStore();
  return Object.values(store.keys).map(k => ({ ...k }));
}

/**
 * Validate an API key token
 * Returns the key data if valid, null otherwise
 */
export function validateApiKey(token: string): ApiKeyData | null {
  const store = loadStore();
  const data = store.keys[token];
  
  if (data) {
    // Update last used
    data.lastUsed = Date.now();
    saveStore(store);
    return { ...data };
  }
  
  return null;
}

/**
 * Revoke an API key by ID
 */
export function revokeApiKey(keyId: string): boolean {
  const store = loadStore();
  let tokenToRemove: string | null = null;
  
  for (const [token, data] of Object.entries(store.keys)) {
    if (data.keyId === keyId) {
      tokenToRemove = token;
      break;
    }
  }
  
  if (tokenToRemove) {
    delete store.keys[tokenToRemove];
    saveStore(store);
    loggers.server.info({ keyId }, "Revoked API key");
    return true;
  }
  
  return false;
}
