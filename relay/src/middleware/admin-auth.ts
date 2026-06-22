/**
 * Admin Authentication Middleware
 *
 * Provides secure admin authentication using timing-safe comparison
 */

import { Request, Response, NextFunction } from "express";
import { isRateLimited, recordFailedAttempt } from "./token-auth";
import { secureCompare, hashToken } from "../utils/security";
import { authConfig } from "../config";
import { loggers } from "../utils/logger";

const log = loggers.server || console;

// Cache admin password hash (computed once)
let adminPasswordHash: string | null = null;

function getAdminPasswordHash(): string | null {
  if (!adminPasswordHash && authConfig.adminPassword) {
    adminPasswordHash = hashToken(authConfig.adminPassword);
  }
  return adminPasswordHash;
}

/**
 * Admin authentication middleware
 * Requires valid admin token in Authorization header or token header
 * Uses timing-safe comparison to prevent timing attacks
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "unknown";

  if (isRateLimited(clientIp)) {
    log.warn(
      { ip: clientIp, path: req.path },
      "Admin auth failed - rate limited"
    );
    res.status(429).json({
      success: false,
      error: "Too many failed authentication attempts. Please try again later.",
    });
    return;
  }
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
    recordFailedAttempt(clientIp);
    res.status(401).json({
      success: false,
      error: "Unauthorized - Admin token required",
    });
    return;
  }

  // Secure comparison using hash and timing-safe comparison
  const tokenHash = hashToken(token);
  const adminHash = getAdminPasswordHash();

  if (!adminHash) {
    log.error("Admin password not configured");
    res.status(503).json({
      success: false,
      error: "Server configuration error",
    });
    return;
  }

  if (secureCompare(tokenHash, adminHash)) {
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
    recordFailedAttempt(clientIp);
    res.status(401).json({
      success: false,
      error: "Unauthorized - Invalid admin token",
    });
  }
}
