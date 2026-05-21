/**
 * Zen Storage Stats Utility
 *
 * Provides storage statistics fetching for Zen's radisk backend.
 *
 * Used by the /admin/storage-stats endpoint to report accurate Zen storage usage.
 */

import fs from "fs";
import path from "path";
import { storageConfig } from "../config/env-config";
import { loggers } from "./logger";

const log = loggers.server;

// ============================================================================
// TYPES
// ============================================================================

export interface ZenStorageStats {
  /** Storage backend type */
  backend: "radisk";
  /** Total storage in bytes */
  bytes: number;
  /** Total storage in MB */
  mb: number;
  /** Total storage in GB */
  gb: number;
  /** Number of files/records */
  files: number;
  /** Path to local storage (radisk) */
  path?: string;
  /** Description of the storage */
  description: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format bytes to MB and GB
 */
function formatBytes(bytes: number): { mb: number; gb: number } {
  return {
    mb: Math.round((bytes / (1024 * 1024)) * 100) / 100,
    gb: Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100,
  };
}

/**
 * Get radisk (filesystem) storage stats by scanning the radata directory
 */
async function getRadiskStats(dataDir: string): Promise<{ bytes: number; files: number }> {
  const radataDir = path.join(dataDir, "zendata", "radata");
  let totalBytes = 0;
  let fileCount = 0;

  const walkDir = async (dir: string): Promise<void> => {
    try {
      const exists = await fs.promises
        .access(dir)
        .then(() => true)
        .catch(() => false);
      if (!exists) return;

      const items = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          await walkDir(fullPath);
        } else if (item.isFile()) {
          try {
            const stats = await fs.promises.stat(fullPath);
            totalBytes += stats.size;
            fileCount++;
          } catch {
            // Ignore unreadable files
          }
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  };

  await walkDir(radataDir);

  return { bytes: totalBytes, files: fileCount };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get Zen storage statistics
 *
 * @returns ZenStorageStats object with storage information
 */
export async function getZenStorageStats(): Promise<ZenStorageStats> {
  const dataDir = storageConfig.dataDir;

  try {
    // Default: radisk (filesystem) storage for Zen
    const stats = await getRadiskStats(dataDir);
    const formatted = formatBytes(stats.bytes);
    const radataPath = path.join(dataDir, "zendata", "radata");
    const radataExists = await fs.promises
      .access(radataPath)
      .then(() => true)
      .catch(() => false);

    return {
      backend: "radisk",
      bytes: stats.bytes,
      mb: formatted.mb,
      gb: formatted.gb,
      files: stats.files,
      path: radataExists ? radataPath : path.resolve(process.cwd(), "zendata", "radata"),
      description: "Zen Database radisk file storage",
    };
  } catch (err) {
    log.error({ err }, "Failed to get Zen storage stats");

    return {
      backend: "radisk",
      bytes: 0,
      mb: 0,
      gb: 0,
      files: 0,
      description: `Zen radisk storage (error fetching stats)`,
    };
  }
}

