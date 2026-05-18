/**
 * Memory Utilities for Monitoring and Garbage Collection
 *
 * Provides tools for monitoring heap usage, triggering GC, and detecting memory pressure.
 * Used to prevent out-of-memory crashes during heavy operations.
 *
 * @module utils/memory-utils
 */

import { loggers } from "./logger";

const log = loggers.server;

/**
 * Memory usage statistics
 */
interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMemoryMB: number;
  heapUsagePercent: number;
}

/**
 * Default heap limit in MB (Node.js default or from --max-old-space-size)
 */
const DEFAULT_HEAP_LIMIT_MB = parseInt(
  process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] || "4096",
  10
);

/**
 * Get current memory usage statistics
 */
function getMemoryUsage(): MemoryStats {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
  const heapTotalMB = Math.round(memUsage.heapTotal / (1024 * 1024));
  const externalMB = Math.round(memUsage.external / (1024 * 1024));
  const rssMemoryMB = Math.round(memUsage.rss / (1024 * 1024));

  return {
    heapUsedMB,
    heapTotalMB,
    externalMB,
    rssMemoryMB,
    heapUsagePercent: Math.round((heapUsedMB / DEFAULT_HEAP_LIMIT_MB) * 100),
  };
}

/**
 * Log current memory usage with a label
 */
function logMemoryUsage(label: string): void {
  const stats = getMemoryUsage();
  log.info(
    {
      label,
      heapUsedMB: stats.heapUsedMB,
      heapTotalMB: stats.heapTotalMB,
      rssMemoryMB: stats.rssMemoryMB,
      heapUsagePercent: stats.heapUsagePercent,
    },
    `📊 Memory [${label}]: ${stats.heapUsedMB}MB used / ${stats.heapTotalMB}MB total (${stats.heapUsagePercent}% of limit)`
  );
}

/**
 * Trigger garbage collection if available (requires --expose-gc flag)
 * Returns true if GC was triggered, false otherwise
 */
function triggerGC(): boolean {
  if (global.gc) {
    try {
      global.gc();
      return true;
    } catch (e) {
      log.debug("Failed to trigger garbage collection");
      return false;
    }
  }
  return false;
}

/**
 * Check if memory pressure is high (>80% of heap limit)
 */
export function checkMemoryPressure(warningThreshold = 80): boolean {
  const stats = getMemoryUsage();
  return stats.heapUsagePercent >= warningThreshold;
}

/**
 * Perform memory cleanup with optional GC trigger
 * Used between batches of heavy operations
 */
function performMemoryCleanup(label?: string): void {
  const beforeStats = getMemoryUsage();
  const gcTriggered = triggerGC();

  if (gcTriggered) {
    // Give GC a moment to complete
    const afterStats = getMemoryUsage();
    const freedMB = beforeStats.heapUsedMB - afterStats.heapUsedMB;

    if (freedMB > 10) {
      // Only log if significant memory was freed
      log.debug(
        { label, freedMB, newHeapMB: afterStats.heapUsedMB },
        `🧹 GC freed ${freedMB}MB${label ? ` after ${label}` : ""}`
      );
    }
  }
}

/**
 * Log memory warning if usage is high
 */
function checkAndWarnMemory(operation: string): boolean {
  if (checkMemoryPressure(75)) {
    const stats = getMemoryUsage();
    log.warn(
      {
        operation,
        heapUsedMB: stats.heapUsedMB,
        heapUsagePercent: stats.heapUsagePercent,
      },
      `⚠️ High memory usage during ${operation}: ${stats.heapUsedMB}MB (${stats.heapUsagePercent}%)`
    );
    return true;
  }
  return false;
}
