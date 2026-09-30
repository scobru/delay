/**
 * Unified ZenDB paths for the Delay network
 *
 * These paths are shared between delay services
 * to ensure consistent network discovery and communication.
 *
 * NOTE: This is a copy for the dashboard frontend. Keep in sync with
 * relay/src/utils/zen-paths.ts
 */

export const ZEN_PATHS = {
  // Base
  DELAY: "delay",
  DELAY_INDEX: "delay/index",

  // Legacy/Compatibility aliases
  SHOGUN: "delay",
  SHOGUN_INDEX: "delay/index",

  // Network discovery
  RELAYS: "delay/network/relays",
  PEERS: "delay/network/peers",

  // Search index
  SEARCH: "delay/network/search",

  // User data
  USERS: "delay/users",
  UPLOADS: "delay/uploads",
  LOGS: "delay/logs",
  MB_USAGE: "delay/mbUsage",
  TEST: "delay/test",

  // System
  SYSTEM_HASH: "delay/systemhash",

  // Indexes (unified under delay/index)
  DEALS_BY_CID: "delay/index/deals-by-cid",
  DEALS_BY_CLIENT: "delay/index/deals-by-client",

  // Anna's Archive (torrent preservation network) - unified under delay/
  ANNAS_ARCHIVE: "delay/annas-archive",

  // Wormhole
  DELAY_WORMHOLE: "delay/wormhole",
  SHOGUN_WORMHOLE: "delay/wormhole",
  WORMHOLE_TRANSFERS: "transfers", // Relative to DELAY_WORMHOLE
} as const;


