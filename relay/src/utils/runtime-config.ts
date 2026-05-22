/**
 * Runtime Configuration Manager
 *
 * Provides hot-reload capability for certain configuration values.
 * Some configs can be changed without restart, others require .env modification.
 */

import fs from "fs";
import path from "path";
import { loggers } from "./logger";

// ============================================================================
// HOT-RELOADABLE CONFIGURATION KEYS
// ============================================================================

/**
 * Keys that can be modified at runtime without server restart
 */
export const HOT_RELOADABLE_KEYS = [
  // Logging
  "LOG_LEVEL",
  "DEBUG",

  // Sync Intervals
  "WORMHOLE_CLEANUP_INTERVAL_MS",
  "WORMHOLE_MAX_AGE_SECS",

  // Limits
  "RELAY_MAX_STORAGE_GB",
  "RELAY_STORAGE_WARNING_THRESHOLD",
  "IPFS_PIN_TIMEOUT_MS",

  // Replication
  "AUTO_REPLICATION",
] as const;

export type HotReloadableKey = (typeof HOT_RELOADABLE_KEYS)[number];

/**
 * Keys that require server restart
 */
export const RESTART_REQUIRED_KEYS = [
  // Server
  "RELAY_HOST",
  "RELAY_PORT",
  "RELAY_NAME",
  "RELAY_PEERS",
  "RELAY_PROTECTED",

  // Authentication
  "ADMIN_PASSWORD",

  // Keys
  "RELAY_SEA_KEYPAIR",
  "RELAY_SEA_KEYPAIR_PATH",

  // Module Enable Flags
  "IPFS_ENABLED",
  "WORMHOLE_ENABLED",

  // URLs / Endpoints
  "IPFS_API_URL",
  "IPFS_GATEWAY_URL",
  "IPFS_API_TOKEN",

  // Storage
  "DATA_DIR",
  "DISABLE_RADISK",
] as const;

type RestartRequiredKey = (typeof RESTART_REQUIRED_KEYS)[number];

// ============================================================================
// RUNTIME STORE
// ============================================================================

/**
 * In-memory store for runtime configuration overrides
 */
const runtimeOverrides: Map<string, string> = new Map();

/**
 * Set a runtime override for a hot-reloadable config key
 * @returns true if successful, false if key is not hot-reloadable
 */
export function setRuntimeValue(key: HotReloadableKey, value: string): boolean {
  if (!HOT_RELOADABLE_KEYS.includes(key)) {
    loggers.server.warn({ key }, "Attempted to hot-reload non-hot-reloadable key");
    return false;
  }

  runtimeOverrides.set(key, value);
  loggers.server.info({ key, value }, "🔄 Runtime config updated (hot-reload)");
  return true;
}

/**
 * Check if a key is hot-reloadable
 */
export function isHotReloadable(key: string): boolean {
  return HOT_RELOADABLE_KEYS.includes(key as HotReloadableKey);
}

/**
 * Check if a key requires restart
 */
export function requiresRestart(key: string): boolean {
  return RESTART_REQUIRED_KEYS.includes(key as RestartRequiredKey);
}

// ============================================================================
// .ENV FILE OPERATIONS
// ============================================================================

/**
 * Read the .env file contents
 */
export async function readEnvFile(): Promise<string | null> {
  try {
    const envPath = path.join(process.cwd(), ".env");
    return await fs.promises.readFile(envPath, "utf-8");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return null;
    }
    loggers.server.error({ err: error }, "Failed to read .env file");
    return null;
  }
}

/**
 * Parse .env file into key-value pairs
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

/**
 * Update a value in the .env file
 * @returns true if successful
 */
export async function updateEnvFile(updates: Record<string, string>): Promise<boolean> {
  try {
    const envPath = path.join(process.cwd(), ".env");
    let content = "";

    try {
      content = await fs.promises.readFile(envPath, "utf-8");
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const lines = content.split("\n");
    const updatedKeys = new Set<string>();

    // Update existing keys
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        if (updates.hasOwnProperty(key)) {
          updatedKeys.add(key);
          const value = updates[key];
          // Quote values with spaces or special chars
          const needsQuotes = /[\s#]/.test(value);
          return `${key}=${needsQuotes ? `"${value}"` : value}`;
        }
      }
      return line;
    });

    // Add new keys that weren't in the file
    for (const [key, value] of Object.entries(updates)) {
      if (!updatedKeys.has(key)) {
        const needsQuotes = /[\s#]/.test(value);
        newLines.push(`${key}=${needsQuotes ? `"${value}"` : value}`);
      }
    }

    await fs.promises.writeFile(envPath, newLines.join("\n"));
    loggers.server.info({ keys: Object.keys(updates) }, "📝 .env file updated");

    return true;
  } catch (error) {
    loggers.server.error({ err: error }, "Failed to update .env file");
    return false;
  }
}

// ============================================================================
// GET ALL CONFIG
// ============================================================================

interface ConfigInfo {
  key: string;
  value: string | undefined;
  source: "runtime" | "env" | "default";
  hotReloadable: boolean;
  category: string;
}

/**
 * Get all configuration with metadata
 */
export function getAllConfig(): ConfigInfo[] {
  const allKeys = [...HOT_RELOADABLE_KEYS, ...RESTART_REQUIRED_KEYS];

  const categorize = (key: string): string => {
    if (key.startsWith("LOG") || key === "DEBUG") return "Logging";
    if (key.startsWith("RELAY_")) return "Relay";
    if (key.startsWith("IPFS_")) return "IPFS";
    if (key.startsWith("WORMHOLE_")) return "Wormhole";

    if (key.includes("STORAGE") || key === "DATA_DIR") return "Storage";
    if (key.includes("PASSWORD") || key.includes("KEY") || key.includes("TOKEN")) return "Security";
    return "Other";
  };

  return allKeys.map((key) => {
    const hasRuntimeOverride = runtimeOverrides.has(key);
    const envValue = process.env[key];

    return {
      key,
      value: hasRuntimeOverride ? runtimeOverrides.get(key) : envValue,
      source: hasRuntimeOverride ? "runtime" : envValue !== undefined ? "env" : "default",
      hotReloadable: isHotReloadable(key),
      category: categorize(key),
    };
  });
}


