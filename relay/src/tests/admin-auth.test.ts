import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { adminAuthMiddleware } from "../middleware/admin-auth";
import { isRateLimited, recordFailedAttempt } from "../middleware/token-auth";
import { Request, Response, NextFunction } from "express";

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

vi.mock("../config", () => ({
  authConfig: { adminPassword: "test-admin-password", strictSessionIp: true },
}));

vi.mock("../middleware/token-auth", () => {
  return {
    isRateLimited: vi.fn(),
    recordFailedAttempt: vi.fn(),
  };
});

describe("adminAuthMiddleware rate limiting", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.useFakeTimers();
    mockReq = {
      headers: {},
      ip: "192.168.1.100",
      path: "/api/system/stats",
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should block requests when rate limited", () => {
    vi.mocked(isRateLimited).mockReturnValueOnce(true);

    adminAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(isRateLimited).toHaveBeenCalledWith(mockReq.ip);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: "Too many failed authentication attempts. Please try again later.",
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should record failed attempt when no token is provided", () => {
    vi.mocked(isRateLimited).mockReturnValueOnce(false);

    adminAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(recordFailedAttempt).toHaveBeenCalledWith(mockReq.ip);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it("should record failed attempt when an invalid token is provided", () => {
    vi.mocked(isRateLimited).mockReturnValueOnce(false);
    mockReq.headers = { authorization: "Bearer invalid-token" };

    adminAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(recordFailedAttempt).toHaveBeenCalledWith(mockReq.ip);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });
});
