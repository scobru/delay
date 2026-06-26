process.env.ADMIN_PASSWORD = "test-password";

import { describe, it, expect, vi, beforeEach } from "vitest";

import express from "express";

import request from "supertest";

import systemRouter from "../routes/system";

import fs from "fs";

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
  packageConfig: { version: "1.0.0" },
  authConfig: {},
}));

vi.mock("../config/env-config", () => ({
  config: {
    relay: { name: "Test Relay" },
  },
  driveConfig: {
    dataDir: "/tmp/test-data",
  },
}));

vi.mock("../middleware/admin-auth", () => ({
  adminAuthMiddleware: vi.fn((req, res, next) => {
    if (req.headers.authorization === "Bearer valid-token") {
      return next();
    }
    return res.status(401).json({ error: "Unauthorized" });
  }),
}));

vi.mock("fs", () => {
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      promises: {
        stat: vi.fn().mockResolvedValue({ size: 100 }),
        open: vi.fn().mockResolvedValue({
          read: vi.fn().mockResolvedValue({ bytesRead: 15 }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        access: vi.fn().mockResolvedValue(undefined),
      },
      constants: {
        R_OK: 4,
      },
    },
    constants: {
      R_OK: 4,
    },
  };
});

describe("Service Logs Path Traversal Security", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    // Mock gun instance for the router
    app.set("zenInstance", {
      _: { opt: { peers: {} } },
      get: vi.fn().mockReturnThis(),
      put: vi.fn().mockImplementation((val, cb) => cb({ err: null })),
      once: vi.fn().mockImplementation((cb) => cb({ test: "data" })),
    });

    app.use("/api/v1/system", systemRouter);
  });

  it("should allow safe service names", async () => {
    const response = await request(app)
      .get("/api/v1/system/services/ipfs/logs")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should reject path traversal with '..'", async () => {
    const response = await request(app)
      .get("/api/v1/system/services/..%2f..%2fetc%2fpasswd/logs")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid service name");
  });

  it("should reject path traversal with '/'", async () => {
    const response = await request(app)
      .get("/api/v1/system/services/%2fetc%2fpasswd/logs")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid service name");
  });

  it("should reject path traversal with '\\'", async () => {
    const response = await request(app)
      .get("/api/v1/system/services/..%5c..%5cwindows/logs")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid service name");
  });

  it("should reject potentially dangerous characters like null bytes", async () => {
    const response = await request(app)
      .get("/api/v1/system/services/ipfs%00/logs")
      .set("Authorization", "Bearer valid-token");

    // Currently this might not be rejected by the simple string inclusion checks
    // We want our fix to reject this.
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid service name");
  });

  it("should reject other shell metacharacters", async () => {
    const response = await request(app)
      .get("/api/v1/system/services/ipfs;ls/logs")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid service name");
  });
});
