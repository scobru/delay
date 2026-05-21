import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  authConfig: { adminPassword: "test-password" },
}));

vi.mock("../config/env-config", () => ({
  config: {
    relay: { name: "Test Relay" },
  },
  driveConfig: {
    dataDir: "/tmp/test-data",
  },
}));

// We'll mock the middleware dynamically to test both cases
vi.mock("../middleware/admin-auth", () => ({
  adminAuthMiddleware: vi.fn((req, res, next) => {
    // If authorization header matches our test token, allow it
    if (req.headers.authorization === "Bearer valid-token") {
      return next();
    }
    // Otherwise return 401
    return res.status(401).json({ error: "Unauthorized" });
  }),
}));

// Mock fs to simulate logs endpoint
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
      },
    },
  };
});

describe("System Routes Security", () => {
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

  describe("GET /api/v1/system/logs", () => {
    it("should reject unauthenticated requests with 401 Unauthorized", async () => {
      const response = await request(app).get("/api/v1/system/logs");
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized" });
    });

    it("should reject invalid token requests with 401 Unauthorized", async () => {
      const response = await request(app)
        .get("/api/v1/system/logs")
        .set("Authorization", "Bearer invalid-token");
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized" });
    });

    it("should allow authenticated requests", async () => {
      const response = await request(app)
        .get("/api/v1/system/logs")
        .set("Authorization", "Bearer valid-token");

      // We're just testing that the route is accessed and we don't get a 401
      expect(response.status).not.toBe(401);
    });
  });

  describe("Other protected endpoints", () => {
    it("should reject unauthenticated access to /alldata", async () => {
      const response = await request(app).get("/api/v1/system/alldata");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated access to /node/*", async () => {
      const response = await request(app).get("/api/v1/system/node/test");
      expect(response.status).toBe(401);
    });

    it("should allow public access to /health", async () => {
      const response = await request(app).get("/api/v1/system/health");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
