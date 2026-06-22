/**
 * Admin Authentication Middleware
 *
 * Provides secure admin authentication using timing-safe comparison
 */

import { Request, Response, NextFunction } from "express";
import { secureCompare, hashToken, validateAdminToken, isAdminPasswordConfigured } from "../utils/security";
import { authConfig } from "../config";
import { loggers } from "../utils/logger";

const log = loggers.server || console;

/**
 * Admin authentication middleware
 * Requires valid admin token in Authorization header or token header
 * Uses timing-safe comparison to prevent timing attacks
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader && authHeader.split(" ")[1];

  // Check custom token header (for Gun/Wormhole compatibility)
  const customToken = req.headers["token"] as string | undefined;

  // Accept either format
  const token = bearerToken || customToken;

  if (!token) {
    log.warn(
      {
        ip: req.ip || req.connection.remoteAddress,
        path: req.path,
      },
      "Admin auth failed - no token"
    );
    res.status(401).json({
      success: false,
      error: "Unauthorized - Admin token required",
    });
    return;
  }

  // Secure comparison using hash and timing-safe comparison

  const isConfigured = isAdminPasswordConfigured();

  if (!isConfigured) {
    log.error("Admin password not configured");
    res.status(503).json({
      success: false,
      error: "Server configuration error",
    });
    return;
  }

  if (validateAdminToken(token)) {
    log.debug(
      {
        ip: req.ip || req.connection.remoteAddress,
        path: req.path,
      },
      "Admin authentication successful"
    );
    next();
  } else {
    log.warn(
      {
        ip: req.ip || req.connection.remoteAddress,
        path: req.path,
        hasToken: !!token,
      },
      "Admin auth failed - invalid token"
    );
    res.status(401).json({
      success: false,
      error: "Unauthorized - Invalid admin token",
    });
  }
}
