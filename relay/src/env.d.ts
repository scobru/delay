/**
 * Type declarations for environment variables
 * This file helps TypeScript understand the types of process.env variables
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // Required Configuration
    ADMIN_PASSWORD?: string;

    // Relay Identity
    RELAY_HOST?: string;
    RELAY_PORT?: string;
    RELAY_NAME?: string;

    // IPFS Configuration
    IPFS_API_URL?: string;
    IPFS_GATEWAY_URL?: string;
    IPFS_API_TOKEN?: string;
    IPFS_PIN_TIMEOUT_MS?: string;

    // Zen Configuration
    RELAY_SEA_KEYPAIR?: string;
    RELAY_SEA_KEYPAIR_PATH?: string;
    GUN_PEERS?: string;
    RELAY_PEERS?: string;
    RELAY_PROTECTED?: string;
    DISABLE_RADISK?: string;
    CLEANUP_CORRUPTED_DATA?: string;

    // Storage Limits
    RELAY_MAX_STORAGE_GB?: string;
    RELAY_STORAGE_WARNING_THRESHOLD?: string;

    // Network Federation
    AUTO_REPLICATION?: string;

    // Advanced Options
    DATA_DIR?: string;
    RELAY_QR?: string;
    RELAY_STORE?: string;
    RELAY_PATH?: string;
    PORT?: string;
    NODE_ENV?: "development" | "production" | "test";
    STRICT_SESSION_IP?: string;
    ENABLE_METRICS?: string;
    ENABLE_HEALTH?: string;
  }
}
