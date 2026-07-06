import { describe, it, expect, vi, afterEach } from 'vitest';
import v8 from 'v8';
import { checkMemoryPressure } from './memory-utils';

describe('memory-utils', () => {
  describe('checkMemoryPressure', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Fixed heap limit for deterministic tests (mocked below).
    const HEAP_LIMIT = 4096 * 1024 * 1024; // 4096 MB in bytes

    const mockHeap = (usedFraction: number) => {
      vi.spyOn(v8, 'getHeapStatistics').mockReturnValue({
        heap_size_limit: HEAP_LIMIT,
      } as ReturnType<typeof v8.getHeapStatistics>);
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: Math.floor(HEAP_LIMIT * usedFraction),
        heapTotal: HEAP_LIMIT,
        external: 0,
        rss: HEAP_LIMIT,
        arrayBuffers: 0,
      });
    };

    it('should return false when memory usage is below the default threshold (80%)', () => {
      mockHeap(0.70);
      expect(checkMemoryPressure()).toBe(false);
    });

    it('should return true when memory usage is exactly at the default threshold (80%)', () => {
      mockHeap(0.80);
      expect(checkMemoryPressure()).toBe(true);
    });

    it('should return true when memory usage is above the default threshold (80%)', () => {
      mockHeap(0.90);
      expect(checkMemoryPressure()).toBe(true);
    });

    it('should return false when memory usage is below a custom threshold', () => {
      mockHeap(0.85);
      expect(checkMemoryPressure(90)).toBe(false);
    });

    it('should return true when memory usage is at or above a custom threshold', () => {
      mockHeap(0.60);
      expect(checkMemoryPressure(50)).toBe(true);
      expect(checkMemoryPressure(60)).toBe(true);
    });
  });
});
