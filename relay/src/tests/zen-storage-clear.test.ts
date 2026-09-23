process.env.ADMIN_PASSWORD = "test-admin-secret";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import os from "os";

const TEST_ZEN_DIR = path.join(os.tmpdir(), "zen-clear-test-dir");

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

vi.mock("../utils/ipfs-client", () => ({
  ipfsRequest: vi.fn(),
}));

vi.mock("../utils/openapi-generator", () => ({
  generateOpenAPISpec: vi.fn(),
}));

vi.mock("../utils/zen-storage-stats", () => ({
  getZenStorageStats: vi.fn().mockResolvedValue({ bytes: 0, backend: "mock" }),
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
  storageConfig: {
    dataDir: path.join(os.tmpdir(), "zen-clear-test-dir"),
  },
  zenConfig: {
    dataDir: path.join(os.tmpdir(), "zen-clear-test-dir"),
  },
}));

import setupRoutes from "../routes/index";

describe("ZEN Storage Clear Endpoint", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create temporary directory for Zen storage testing
    if (fs.existsSync(TEST_ZEN_DIR)) {
      fs.rmSync(TEST_ZEN_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_ZEN_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_ZEN_DIR, "chunk1.rad"), "chunk-data-1");
    fs.writeFileSync(path.join(TEST_ZEN_DIR, "chunk2.rad"), "chunk-data-2");
    fs.mkdirSync(path.join(TEST_ZEN_DIR, "subdir"));
    fs.writeFileSync(path.join(TEST_ZEN_DIR, "subdir", "chunk3.rad"), "chunk-data-3");

    app = express();
    app.use(express.json());

    // Mock Zen in-memory instance
    const mockZen = {
      _: {
        graph: { "node/1": { val: 1 }, "node/2": { val: 2 } },
      },
    };
    app.set("zenInstance", mockZen);

    setupRoutes(app);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(TEST_ZEN_DIR)) {
        fs.rmSync(TEST_ZEN_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  it("should reject unauthenticated request to clear zen storage", async () => {
    const response = await request(app).post("/api/v1/admin/zen-storage/clear");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("should clear files and reset graph on authenticated request", async () => {
    // Verify files exist before clear
    expect(fs.readdirSync(TEST_ZEN_DIR).length).toBeGreaterThan(0);

    const response = await request(app)
      .post("/api/v1/admin/zen-storage/clear")
      .set("Authorization", "Bearer test-admin-secret");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain("cleared successfully");
    expect(response.body.filesDeleted).toBe(3);

    // Verify files were deleted and test directory is now empty
    const remaining = fs.readdirSync(TEST_ZEN_DIR);
    expect(remaining.length).toBe(0);

    // Verify in-memory zenInstance graph was reset
    const zen = app.get("zenInstance");
    expect(zen._.graph).toEqual({});
  });
});
