process.env.ADMIN_PASSWORD = "super-secret-password-12345";

import { describe, it, expect, vi, beforeEach } from "vitest";

import express from "express";

import request from "supertest";

import setupRoutes from "../routes/index";

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
  authConfig: {},
  ipfsConfig: {
    enabled: false,
    gatewayUrl: "http://localhost:8080",
    apiUrl: "http://localhost:5001",
  },
  packageConfig: { version: "1.0.0" },
  relayConfig: { name: "Test Relay" },
}));

// Mock other imports that might be called during route setup
vi.mock("../utils/ipfs-client", () => ({
  ipfsRequest: vi.fn(),
}));

vi.mock("../utils/openapi-generator", () => ({
  generateOpenAPISpec: vi.fn(),
}));

vi.mock("../utils/zen-storage-stats", () => ({
  getZenStorageStats: vi.fn().mockResolvedValue({ bytes: 0, backend: "mock" }),
}));

describe("Debug Config Exposure Vulnerability", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    // We need to set up routes
    setupRoutes(app);
  });

  it("FIX VERIFICATION: should reject unauthenticated access to /api/v1/debug/admin-config", async () => {
    const response = await request(app).get("/api/v1/debug/admin-config");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Unauthorized");
  });

  it("FIX VERIFICATION: should return limited info with authentication and no sensitive details", async () => {
    // Note: tokenAuthMiddleware is mocked by setupRoutes call which uses real index.ts
    // But index.ts uses hashToken and secureCompare from ../utils/security
    // We need to provide a token that hashes to the same value as the mocked adminPassword

    const response = await request(app)
      .get("/api/v1/debug/admin-config")
      .set("Authorization", "Bearer super-secret-password-12345");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Sensitive fields must be GONE
    expect(response.body).not.toHaveProperty("adminPasswordLength");
    expect(response.body).not.toHaveProperty("adminPasswordPreview");
    expect(response.body).not.toHaveProperty("adminPassword");

    // New field should be present
    expect(response.body.adminPasswordStatus).toBe("CONFIGURED");
  });
});
