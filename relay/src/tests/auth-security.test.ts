import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import authRouter from "../routes/auth";

// Mock logger to avoid spam
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

describe("Auth Security", () => {
  let app: express.Application;
  let mockGun: any;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    mockGun = {
      user: vi.fn().mockReturnValue({
        auth: vi.fn((username, password, cb) => {
          cb({
            err: null,
            pub: "test-pub",
            epub: "test-epub",
            sea: {
              pub: "test-pub",
              priv: "test-priv-sensitive",
              epub: "test-epub",
              epriv: "test-epriv-sensitive",
              alias: "test-user"
            }
          });
        }),
        leave: vi.fn(),
        create: vi.fn((username, password, cb) => {
            cb({ ok: 0 });
        })
      }),
      get: vi.fn().mockReturnValue({
        once: vi.fn((cb) => cb(null))
      })
    };

    app.set("zenInstance", mockGun);
    app.use("/api/v1/auth", authRouter);
  });

  it("should NOT return private keys on login", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "test-user", password: "test-password" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.pub).toBe("test-pub");
    expect(response.body.epub).toBe("test-epub");

    // The vulnerability: sea contains priv and epriv
    // In the failing state, response.body.sea will be defined
    expect(response.body.sea).toBeUndefined();
  });

  it("should NOT return private keys on register", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "test-user", password: "test-password" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.sea).toBeUndefined();
  });
});
