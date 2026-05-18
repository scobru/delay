/**
 * GunDB Storage Stats Utility
 *
 * Provides unified storage statistics fetching for all GunDB backends:
 * - radisk (local filesystem)
 * - SQLite (better-sqlite3)
 * - S3/MinIO (AWS S3-compatible)
 *
 * Used by the /admin/storage-stats endpoint to report accurate GunDB storage usage.
 */

import fs from "fs";
import path from "path";
import { storageConfig } from "../config/env-config";
import { loggers } from "./logger";

const log = loggers.server;

// ============================================================================
// TYPES
// ============================================================================

export interface GunStorageStats {
  /** Storage backend type */
  backend: "sqlite" | "radisk" | "s3";
  /** Total storage in bytes */
  bytes: number;
  /** Total storage in MB */
  mb: number;
  /** Total storage in GB */
  gb: number;
  /** Number of files/records */
  files: number;
  /** Path to local storage (radisk/sqlite) */
  path?: string;
  /** S3 bucket name */
  bucket?: string;
  /** S3 endpoint URL */
  endpoint?: string;
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
  const radataDir = path.join(dataDir, "radata");
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

  // Also check the old "radata" in cwd for backward compatibility
  const cwdRadataDir = path.resolve(process.cwd(), "radata");
  if (cwdRadataDir !== radataDir) {
    const cwdExists = await fs.promises
      .access(cwdRadataDir)
      .then(() => true)
      .catch(() => false);
    if (cwdExists) {
      await walkDir(cwdRadataDir);
    }
  }

  return { bytes: totalBytes, files: fileCount };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get GunDB storage statistics based on the configured backend
 *
 * @param store - Optional store instance (SQLiteStore or S3Store) if already initialized
 * @returns GunStorageStats object with storage information
 */
export async function getGunStorageStats(store?: any): Promise<GunStorageStats> {
  const storageType = storageConfig.storageType;
  const dataDir = storageConfig.dataDir;

  try {
    // SQLite storage
    if (storageType === "sqlite") {
      const dbPath = path.join(dataDir, "gun.db");

      if (store && typeof store.getStorageStats === "function") {
        // Use existing store instance
        const stats = await store.getStorageStats();
        const formatted = formatBytes(stats.bytes);
        return {
          backend: "sqlite",
          bytes: stats.bytes,
          mb: formatted.mb,
          gb: formatted.gb,
          files: stats.files,
          path: dbPath,
          description: "GunDB SQLite storage",
        };
      }

      // Fallback: just get file size if no store instance
      let bytes = 0;
      try {
        const dbStats = await fs.promises.stat(dbPath);
        bytes = dbStats.size;
      } catch {
        // DB file doesn't exist yet
      }

      const formatted = formatBytes(bytes);
      return {
        backend: "sqlite",
        bytes,
        mb: formatted.mb,
        gb: formatted.gb,
        files: 0, // Can't count without db connection
        path: dbPath,
        description: "GunDB SQLite storage",
      };
    }

    // S3/MinIO storage
    if (storageType === "s3") {
      const s3Conf = storageConfig.s3;

      if (store && typeof store.getStorageStats === "function") {
        // Use existing store instance
        const stats = await store.getStorageStats();
        const formatted = formatBytes(stats.bytes);
        return {
          backend: "s3",
          bytes: stats.bytes,
          mb: formatted.mb,
          gb: formatted.gb,
          files: stats.files,
          bucket: s3Conf.bucket,
          endpoint: s3Conf.endpoint,
          description: "GunDB S3/MinIO storage",
        };
      }

      // No store instance - return config info with empty stats
      return {
        backend: "s3",
        bytes: 0,
        mb: 0,
        gb: 0,
        files: 0,
        bucket: s3Conf.bucket,
        endpoint: s3Conf.endpoint,
        description: "GunDB S3/MinIO storage (stats unavailable - no store instance)",
      };
    }

    // Default: radisk (filesystem) storage
    const stats = await getRadiskStats(dataDir);
    const formatted = formatBytes(stats.bytes);
    const radataPath = path.join(dataDir, "radata");
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
      path: radataExists ? radataPath : path.resolve(process.cwd(), "radata"),
      description: "GunDB radisk file storage",
    };
  } catch (err) {
    log.error({ err, storageType }, "Failed to get GunDB storage stats");

    return {
      backend: storageType as "sqlite" | "radisk" | "s3",
      bytes: 0,
      mb: 0,
      gb: 0,
      files: 0,
      description: `GunDB ${storageType} storage (error fetching stats)`,
    };
  }
}


