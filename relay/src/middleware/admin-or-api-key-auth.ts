/**
 * Admin or API Key Authentication Middleware
 *
 * Accepts either admin token OR valid API key
 * Can be used by any service (IPFS, etc.)
 */

import { Request, Response, NextFunction } from "express";
import {
  secureCompare,
  hashToken,
  validateAdminToken,
  isAdminPasswordConfigured,
} from "../utils/security";
import { authConfig } from "../config";
import { validateApiKey } from "../utils/api-keys-store";
import { loggers } from "../utils/logger";

const log = loggers.server || console;

/**
 * Admin or API Key authentication middleware
 * Accepts either admin token OR valid API key
 */
export async function adminOrApiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader && authHeader.split(" ")[1];

  // Check custom token header (for compatibility)
  const customToken = req.headers["token"] as string | undefined;

  // Accept either format
  const token = bearerToken || customToken;

  if (!token) {
    log.warn(
      {
        ip: req.ip || req.connection.remoteAddress,
        path: req.path,
      },
      "Auth failed - no token"
    );
    res.status(401).json({
      success: false,
      error: "Unauthorized - Token or API key required",
    });
    return;
  }

  // First, try admin token authentication
  const tokenHash = hashToken(token);
  const isConfigured = isAdminPasswordConfigured();

  if (isConfigured && validateAdminToken(token)) {
    log.debug({ ip: req.ip, path: req.path }, "Auth: Admin token accepted");
    return next();
  }

  // If admin token fails, try API key authentication
  if (token.startsWith("shogun-api-")) {
    try {
      const keyData = await validateApiKey(token);
      if (keyData) {
        log.debug(
          {
            ip: req.ip || req.connection.remoteAddress,
            path: req.path,
            keyId: keyData.keyId,
          },
          "Auth: API key accepted"
        );
        // Attach key info to request for logging/auditing
        (req as any).apiKey = keyData;
        return next();
      }
    } catch (error: any) {
      log.error({ err: error }, "Error validating API key");
    }
  }

  // Both authentication methods failed
  log.warn(
    {
      ip: req.ip || req.connection.remoteAddress,
      path: req.path,
      hasToken: !!token,
    },
    "Auth failed - invalid token or API key"
  );
  res.status(401).json({
    success: false,
    error: "Unauthorized - Invalid token or API key",
  });
}
