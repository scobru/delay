import express, { Request, Response } from "express";
import { loggers } from "../utils/logger";

const router: express.Router = express.Router();

// Helper to get gun instance safely
const getGun = (req: Request) => {
  return req.app.get("zenInstance") || req.app.get("zenInstance");
};

/**
 * POST /api/v1/auth/register
 * Create a new Zen user on the Relay
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
      });
    }

    const gun = getGun(req);
    if (!gun) {
      return res.status(503).json({ success: false, error: "Zen not initialized" });
    }

    // Check if username is already taken
    const existingAlias = await new Promise((resolve) => {
      gun.get("~@" + username).once((data: any) => {
        resolve(data);
      });
      // Safety timeout
      setTimeout(() => resolve(null), 5000);
    });

    if (existingAlias) {
      return res.status(400).json({
        success: false,
        error: "Username already in use",
      });
    }

    // Attempt to create user
    // Note: Gun.user().create() is asynchronous but uses callbacks
    const user = gun.user();

    await new Promise((resolve, reject) => {
      user.create(username, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(ack.err));
        } else {
          resolve(ack);
        }
      });
    });

    loggers.server.info({ username }, "User registered via Relay API");

    // Authenticate immediately to get the pub key and alias
    await new Promise((resolve, reject) => {
      user.auth(username, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(ack.err));
        } else {
          res.status(201).json({
            success: true,
            username: username,
            pub: ack.pub,
            epub: ack.epub,
            alias: ack.sea.alias, // Typically same as username
            message: "User registered successfully",
          });
          user.leave(); // Don't keep session open on server
          resolve(ack);
        }
      });
    });
  } catch (error: any) {
    loggers.server.error({ err: error }, "Registration failed");
    res.status(400).json({
      // 400 because usually it's "User already created!"
      success: false,
      error: error.message || "Registration failed",
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Authenticate a Zen user on the Relay
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
      });
    }

    const gun = getGun(req);
    if (!gun) {
      return res.status(503).json({ success: false, error: "Zen not initialized" });
    }

    const user = gun.user();

    await new Promise((resolve, reject) => {
      user.auth(username, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(ack.err));
        } else {
          // Success!
          res.json({
            success: true,
            username: username,
            pub: ack.pub,
            epub: ack.epub,
            alias: ack.sea.alias,
          });
          user.leave(); // Don't leave session open on server
          resolve(ack);
        }
      });
    });
  } catch (error: any) {
    loggers.server.warn({ err: error }, "Login failed");
    res.status(401).json({
      success: false,
      error: error.message || "Authentication failed",
    });
  }
});

/**
 * GET /api/v1/auth/check-username/:username
 * Check if a username is already taken
 */
router.get("/check-username/:username", async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const gun = getGun(req);
    
    if (!gun) {
      return res.status(503).json({ success: false, error: "Zen not initialized" });
    }

    const existing = await new Promise((resolve) => {
      gun.get("~@" + username).once((data: any) => {
        resolve(data);
      });
      setTimeout(() => resolve(null), 3000);
    });

    if (existing) {
      // Check if it's an empty node (nullified)
      const pubs = Object.keys(existing).filter(k => k !== '_' && k !== '#');
      if (pubs.length > 0) {
        return res.json({
          available: false,
          message: "Username already taken",
        });
      }
    }

    res.json({
      available: true,
      message: "Username is available",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
