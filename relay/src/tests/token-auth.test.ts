process.env.ADMIN_PASSWORD = "test-password";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { isRateLimited, recordFailedAttempt } from "../middleware/token-auth";

// Mock dependencies
vi.mock("../utils/logger", () => ({
  loggers: {
    server: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

vi.mock("../config/env-config", () => ({
  authConfig: { strictSessionIp: true },
  serverConfig: { nodeEnv: "test" },
}));

describe("tokenAuthMiddleware rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should return false when there are no failed attempts", () => {
    const ip = "192.168.1.1";
    expect(isRateLimited(ip)).toBe(false);
  });

  it("should return false when failed attempts are under the limit", () => {
    const ip = "192.168.1.2";
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);

    expect(isRateLimited(ip)).toBe(false);
  });

  it("should return true when failed attempts reach the limit (5)", () => {
    const ip = "192.168.1.3";
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);

    expect(isRateLimited(ip)).toBe(true);
  });

  it("should ignore attempts outside the 15-minute time window", () => {
    const ip = "192.168.1.4";

    // Add 4 failed attempts now
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);

    expect(isRateLimited(ip)).toBe(false);

    // Advance time by slightly more than 15 minutes (15 * 60 * 1000 + 1000 ms)
    vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

    // This would normally be the 5th attempt if not for the time window
    recordFailedAttempt(ip);

    // Should not be rate limited because the first 4 attempts have expired
    expect(isRateLimited(ip)).toBe(false);
  });

  it("should clean up old attempts when checking rate limit", () => {
    const ip = "192.168.1.5";

    // Add an attempt
    recordFailedAttempt(ip);

    // Advance time by 16 minutes (outside the 15m window)
    vi.advanceTimersByTime(16 * 60 * 1000);

    // Checking rate limit should remove the old attempt
    expect(isRateLimited(ip)).toBe(false);

    // Add 4 more attempts
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);

    // Should still be false, as the old one was removed
    expect(isRateLimited(ip)).toBe(false);
  });
});
