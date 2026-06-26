import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { secureCompare, hashToken, validateAdminToken, isAdminPasswordConfigured } from "../utils/security";
import { authConfig, serverConfig } from "../config/env-config";
import { loggers } from "../utils/logger";

const failedAuthAttempts = new Map<string, number[]>(); // Track failed attempts per IP
const AUTH_RATE_LIMIT = 5; // Max failed attempts
const AUTH_RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const activeSessions = new Map<string, { ip: string; expiresAt: number }>(); // Simple in-memory session store

/**
 * Check if IP is rate limited based on failed authentication attempts
 * @param {string} ip - The IP address to check
 * @returns {boolean} True if the IP is rate limited
 */
export function isRateLimited(ip: string): boolean {
  const attempts = failedAuthAttempts.get(ip);
  if (!attempts) return false;

  const now = Date.now();
  // Remove old attempts outside the window
  const recentAttempts = attempts.filter((timestamp: number) => now - timestamp < AUTH_RATE_WINDOW);

  if (recentAttempts.length >= AUTH_RATE_LIMIT) {
    failedAuthAttempts.set(ip, recentAttempts);
    return true;
  }

  failedAuthAttempts.set(ip, recentAttempts);
  return false;
}

/**
 * Record failed authentication attempt for an IP address
 * @param {string} ip - The IP address that failed authentication
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const attempts = failedAuthAttempts.get(ip) || [];
  attempts.push(now);
  failedAuthAttempts.set(ip, attempts);
}

/**
 * Create a new session token for an authenticated IP
 * @param {string} ip - The IP address to create a session for
 * @returns {string} The session ID
 */
export function createSession(ip: string): string {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DURATION;
  activeSessions.set(sessionId, { ip, expiresAt });
  return sessionId;
}

/**
 * Validate a session token
 * @param {string} sessionId - The session ID to validate
 * @param {string} ip - The IP address making the request
 * @returns {boolean} True if the session is valid
 */
export function isValidSession(sessionId: string, ip: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(sessionId);
    return false;
  }
  // Optional: verify IP matches (can be disabled for proxy scenarios)
  if (authConfig.strictSessionIp && session.ip !== ip) {
    return false;
  }
  return true;
}

// Cleanup expired sessions periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions.entries()) {
      if (now > session.expiresAt) {
        activeSessions.delete(sessionId);
      }
    }
  },
  60 * 60 * 1000
); // Cleanup every hour

/**
 * Enhanced authentication middleware with rate limiting and session management
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export const tokenAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  // Check if IP is rate limited
  if (isRateLimited(clientIp)) {
    loggers.server.warn(`Rate limited IP: ${clientIp}`);
    res.status(429).json({
      success: false,
      error: "Too many failed authentication attempts. Please try again later.",
    });
    return;
  }

  // Check for session token first (more efficient)
  const sessionToken = req.headers["x-session-token"] || req.cookies?.sessionToken;
  if (sessionToken && isValidSession(sessionToken as string, clientIp)) {
    return next();
  }

  // Fallback to password authentication
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader && authHeader.split(" ")[1];
  const customToken = req.headers["token"];
  const token = (bearerToken || customToken) as string;

  if (!token) {
    recordFailedAttempt(clientIp);
    res.status(401).json({ success: false, error: "Unauthorized - Token required" });
    return;
  }

  // Secure token comparison using hash and timing-safe comparison

  const isConfigured = isAdminPasswordConfigured();

  if (isConfigured && validateAdminToken(token)) {
    // Create session for future requests
    const sessionId = createSession(clientIp);
    res.setHeader("X-Session-Token", sessionId);
    // Optionally set cookie
    if (req.headers["accept"]?.includes("text/html")) {
      res.cookie("sessionToken", sessionId, {
        httpOnly: true,
        secure: serverConfig.nodeEnv === "production",
        maxAge: SESSION_DURATION,
        sameSite: "strict",
      });
    }
    next();
  } else {
    recordFailedAttempt(clientIp);
    loggers.server.warn(`Auth failed for IP: ${clientIp}`);
    res.status(401).json({ success: false, error: "Unauthorized - Invalid token" });
  }
};
