/**
 * Centralized Environment Variables Configuration
 *
 * This file centralizes all environment variables used throughout the Delay application.
 * All environment variables should be imported from this file instead of directly from process.env.
 *
 * Priority: Environment variables > Default values
 *
 */

import dotenv from "dotenv";
import path from "path";
import ip from "ip";

dotenv.config();

// ============================================================================
// SERVER / RELAY CONFIGURATION
// ============================================================================

export const config = {
  // Server Configuration
  server: {
    host: process.env.RELAY_HOST || ip.address(),
    port: (() => {
      const port = parseInt(process.env.RELAY_PORT || process.env.PORT || "8420");
      if (isNaN(port) || port <= 0 || port >= 65536) {
        return 8420;
      }
      return port;
    })(),
    publicPath: process.env.RELAY_PATH || "public",
    nodeEnv: process.env.NODE_ENV || "development",
    welcomeMessage:
      process.env.WELCOME_MESSAGE ||
      `
*** WELCOME TO DELAY ***
`,
  },

  // Relay Identity
  relay: {
    name: process.env.RELAY_NAME || "delay",
    endpoint: process.env.RELAY_HOST || ip.address(),
    environment: process.env.NODE_ENV || "development",
    protected: process.env.RELAY_PROTECTED === "true",
    // Zen peers
    peers: (() => {
      const peersEnv = process.env.GUN_PEERS || process.env.RELAY_PEERS;
      if (peersEnv) {
        return peersEnv
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
      }
      // Default public Gun peers
      return [];
    })(),
  },

  // ============================================================================
  // IPFS CONFIGURATION
  // ============================================================================

  ipfs: {
    enabled: process.env.IPFS_ENABLED === "true" || false,
    apiUrl: process.env.IPFS_API_URL || "http://127.0.0.1:5001",
    apiToken: process.env.IPFS_API_TOKEN,
    gatewayUrl: process.env.IPFS_GATEWAY_URL || "http://127.0.0.1:8080",
    pinTimeoutMs: parseInt(process.env.IPFS_PIN_TIMEOUT_MS || "120000") || 120000,
    // Parsed IPFS API URL components
    apiHost: (() => {
      try {
        const url = new URL(process.env.IPFS_API_URL || "http://127.0.0.1:5001");
        return url.hostname;
      } catch {
        return "127.0.0.1";
      }
    })(),
    apiPort: (() => {
      try {
        const url = new URL(process.env.IPFS_API_URL || "http://127.0.0.1:5001");
        return parseInt(url.port) || 5001;
      } catch {
        return 5001;
      }
    })(),
  },

  // ============================================================================
  // AUTHENTICATION / SECURITY
  // ============================================================================

  auth: {
    adminPassword: process.env.ADMIN_PASSWORD,
    strictSessionIp: process.env.STRICT_SESSION_IP !== "false",
    // CORS configuration
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : ["*"],
    corsCredentials: process.env.CORS_CREDENTIALS === "true",
  },

  // ============================================================================
  // GUN DB / STORAGE CONFIGURATION
  // ============================================================================

  storage: {
    dataDir: process.env.DATA_DIR || path.join(process.cwd(), "data"),
    storageType: (process.env.STORAGE_TYPE || "sqlite").toLowerCase() as "sqlite" | "radisk" | "s3",
    disableRadisk: process.env.DISABLE_RADISK === "true",
    maxStorageGB: parseFloat(process.env.RELAY_MAX_STORAGE_GB || "0") || 0,
    storageWarningThreshold: parseFloat(process.env.RELAY_STORAGE_WARNING_THRESHOLD || "80") || 80,

    // S3/MinIO configuration for Gun storage (only used when storageType is "s3")
    s3: {
      endpoint: process.env.GUN_S3_ENDPOINT || process.env.MINIO_ENDPOINT,
      accessKeyId: process.env.GUN_S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY,
      secretAccessKey: process.env.GUN_S3_SECRET_KEY || process.env.MINIO_SECRET_KEY,
      bucket: process.env.GUN_S3_BUCKET || "shogun-gun-data",
      region: process.env.GUN_S3_REGION || process.env.MINIO_REGION || "us-east-1",
    },
  },

  // Relay SEA Keypair Configuration
  relayKeys: {
    seaKeypair: process.env.RELAY_SEA_KEYPAIR,
    seaKeypairPath: process.env.RELAY_SEA_KEYPAIR_PATH,
    privateKey: process.env.RELAY_PRIVATE_KEY || process.env.PRIVATE_KEY,
  },

  // ============================================================================
  // WORMHOLE CLEANUP CONFIGURATION
  // ============================================================================

  wormhole: {
    enabled: process.env.WORMHOLE_ENABLED === "true" || false,
    cleanupEnabled: process.env.WORMHOLE_CLEANUP_ENABLED !== "false",
    cleanupIntervalMs:
      parseInt(process.env.WORMHOLE_CLEANUP_INTERVAL_MS || "3600000") || 60 * 60 * 1000,
    maxAgeSecs: parseInt(process.env.WORMHOLE_MAX_AGE_SECS || "86400") || 24 * 60 * 60,
  },

  // ============================================================================
  // REPLICATION / NETWORK CONFIGURATION
  // ============================================================================

  replication: {
    autoReplication: process.env.AUTO_REPLICATION !== "false",
  },

  // ============================================================================
  // LOGGING CONFIGURATION
  // ============================================================================

  logging: {
    logLevel:
      (process.env.LOG_LEVEL as string) ||
      (process.env.NODE_ENV !== "production" ? "debug" : "info"),
    debug: process.env.DEBUG === "true" || !!process.env.DEBUG,
  },

  package: {
    version: process.env.npm_package_version || "1.0.0",
  },

  // ============================================================================
  // ZEN CONFIGURATION
  // ============================================================================

  zen: {
    path: process.env.ZEN_PATH || "/zen",
    dataDir: process.env.ZEN_DATA_DIR || path.join(process.env.DATA_DIR || "data", "zendata"),
    enabled: process.env.ZEN_ENABLED !== "false",
  },
};

// ============================================================================
// EXPORT INDIVIDUAL CONFIGURATION OBJECTS FOR CONVENIENCE
// ============================================================================

export const serverConfig = config.server;
export const relayConfig = config.relay;
export const ipfsConfig = config.ipfs;
export const authConfig = config.auth;
export const storageConfig = config.storage;
export const relayKeysConfig = config.relayKeys;
export const wormholeConfig = config.wormhole;
export const replicationConfig = config.replication;
export const loggingConfig = config.logging;
export const packageConfig = config.package;
export const zenConfig = config.zen;

