import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import systemRouter from "../routes/system";
import fs from "fs";
import path from "path";
import os from "os";

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

vi.mock("../utils/zen-paths", () => ({
  ZEN_PATHS: {
    SHOGUN: "shogun",
    LOGS: "logs",
  },
  getZenNode: vi.fn(() => ({
    once: vi.fn(),
    put: vi.fn(),
    get: vi.fn(() => ({ put: vi.fn() })),
  })),
}));

// Mock admin-auth middleware to bypass it
vi.mock("../middleware/admin-auth", () => ({
  adminAuthMiddleware: (req: any, res: any, next: any) => {
    next();
  },
}));

const originalReadFileSync = fs.readFileSync;
const originalExistsSync = fs.existsSync;

describe("System Routes Performance", () => {
  let app: express.Application;
  let server: any;
  let baseUrl: string;
  let tempLogFile: string;
  let dummyLines = 100000;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    app.use("/system", systemRouter);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve(null);
      });
    });

    // Create a very large log file ~50MB
    const tmpDir = os.tmpdir();
    tempLogFile = path.join(tmpDir, "relay-perf-test.log");

    const stream = fs.createWriteStream(tempLogFile);
    for (let i = 0; i < dummyLines; i++) {
      stream.write(
        `2025-12-12T08:21:19.939018162Z {"level":"info","time":"2025-12-12T08:21:19.939018162Z","pid":85,"message":"Dummy log line ${i}"}\n`
      );
    }
    stream.end();

    await new Promise((resolve) => {
      stream.on("finish", () => resolve(null));
    });

    // Mock fs.existsSync to point to our test file
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (typeof p === "string" && (p.includes("relay.log") || p.includes("ipfs.log"))) return true;
      return originalExistsSync(p);
    });

    // We spy on readFileSync to intercept calls
    vi.spyOn(fs, "readFileSync").mockImplementation((p, options) => {
      if (typeof p === "string" && (p.includes("relay.log") || p.includes("ipfs.log"))) {
        return originalReadFileSync(tempLogFile, options);
      }
      return originalReadFileSync(p, options);
    });
  });

  afterEach(() => {
    server.close();
    vi.restoreAllMocks();
    if (originalExistsSync(tempLogFile)) {
      fs.unlinkSync(tempLogFile);
    }
  });

  it("should benchmark /logs endpoint performance", async () => {
    const startTime = Date.now();
    const res = await fetch(`${baseUrl}/system/logs?limit=10&tail=10`, {
      headers: { authorization: "Bearer valid-token" },
    });
    const endTime = Date.now();

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);

    console.log(`⏱️ /logs endpoint took ${endTime - startTime}ms`);
  }, 15000); // give it a longer timeout

  it("should benchmark /services/:name/logs endpoint performance", async () => {
    const startTime = Date.now();
    const res = await fetch(`${baseUrl}/system/services/ipfs/logs?limit=10&tail=10`, {
      headers: { authorization: "Bearer valid-token" },
    });
    const endTime = Date.now();

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);

    console.log(`⏱️ /services/:name/logs endpoint took ${endTime - startTime}ms`);
  }, 15000); // give it a longer timeout
});
