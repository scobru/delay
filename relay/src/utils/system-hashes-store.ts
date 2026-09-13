import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loggers } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store file location (in data dir to persist)
const DATA_DIR = path.resolve(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "system-hashes.json");

export interface SystemHashMetadata {
  hash: string;
  userAddress?: string;
  timestamp: number;
  uploadedAt?: number;
  fileName: string;
  displayName?: string;
  originalName?: string;
  fileSize?: number;
  contentType?: string;
  isEncrypted?: boolean;
  isDirectory?: boolean;
  fileCount?: number;
  files?: Array<{
    name: string;
    path: string;
    size?: number;
    mimetype?: string;
    originalName?: string;
    isEncrypted?: boolean;
  }>;
  relayUrl?: string;
}

interface SystemHashStore {
  hashes: Record<string, SystemHashMetadata>;
}

// In-memory cache
let storeCache: SystemHashStore | null = null;
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

/**
 * Load store from disk into cache
 */
async function doLoadStore(): Promise<SystemHashStore> {
  await ensureDataDir();

  try {
    const data = await fs.promises.readFile(STORE_PATH, "utf-8");
    storeCache = JSON.parse(data);
    if (!storeCache || typeof storeCache !== "object" || !storeCache.hashes) {
      storeCache = { hashes: {} };
    }
    return storeCache;
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      loggers.server.error({ error }, "Failed to read system-hashes.json, initializing empty store");
    }
  }

  // Init empty store
  storeCache = { hashes: {} };
  await saveStore(storeCache);
  return storeCache;
}

/**
 * Save store to disk atomically
 */
async function saveStore(store: SystemHashStore): Promise<void> {
  if (savePromise) {
    savePending = true;
    return savePromise;
  }

  savePromise = (async () => {
    try {
      await ensureDataDir();
      const tempPath = `${STORE_PATH}.tmp.${Date.now()}`;
      await fs.promises.writeFile(tempPath, JSON.stringify(store, null, 2), "utf-8");
      await fs.promises.rename(tempPath, STORE_PATH);
    } catch (error) {
      loggers.server.error({ error }, "Failed to save system-hashes.json");
    } finally {
      savePromise = null;
      if (savePending) {
        savePending = false;
        if (storeCache) {
          await saveStore(storeCache);
        }
      }
    }
  })();

  return savePromise;
}

/**
 * Get all system hashes
 */
export async function getSystemHashesMap(): Promise<Record<string, SystemHashMetadata>> {
  if (!storeCache) {
    await doLoadStore();
  }
  return { ...storeCache!.hashes };
}

/**
 * Get metadata for a specific hash
 */
export async function getSystemHash(hash: string): Promise<SystemHashMetadata | null> {
  if (!storeCache) {
    await doLoadStore();
  }
  return storeCache!.hashes[hash] ? { ...storeCache!.hashes[hash] } : null;
}

/**
 * Save or update metadata for a hash
 */
export async function saveSystemHash(metadata: SystemHashMetadata): Promise<void> {
  if (!storeCache) {
    await doLoadStore();
  }

  const existing = storeCache!.hashes[metadata.hash];
  storeCache!.hashes[metadata.hash] = {
    ...existing,
    ...metadata,
    displayName: metadata.displayName || metadata.fileName || existing?.displayName || existing?.fileName,
    fileName: metadata.fileName || existing?.fileName || metadata.displayName || metadata.hash,
    timestamp: metadata.timestamp || existing?.timestamp || Date.now(),
  };

  await saveStore(storeCache!);
  loggers.server.info({ hash: metadata.hash, fileName: metadata.fileName }, "💾 Saved system hash metadata");
}

/**
 * Remove metadata for a specific hash
 */
export async function removeSystemHash(hash: string): Promise<boolean> {
  if (!storeCache) {
    await doLoadStore();
  }

  if (storeCache!.hashes[hash]) {
    delete storeCache!.hashes[hash];
    await saveStore(storeCache!);
    loggers.server.info({ hash }, "🗑️ Removed system hash metadata");
    return true;
  }
  return false;
}
