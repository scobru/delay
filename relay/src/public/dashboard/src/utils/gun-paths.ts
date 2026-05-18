/**
 * Unified GunDB paths for the Shogun network
 *
 * These paths are shared between delay and shogun-mule
 * to ensure consistent network discovery and communication.
 *
 * NOTE: This is a copy for the dashboard frontend. Keep in sync with
 * relay/src/utils/gun-paths.ts
 */

export const GUN_PATHS = {
  // Base
  SHOGUN: "shogun",
  SHOGUN_INDEX: "shogun/index",

  // Network discovery
  RELAYS: "shogun/network/relays",
  PEERS: "shogun/network/peers",

  // Search index
  SEARCH: "shogun/network/search",

  // User data
  USERS: "shogun/users",
  UPLOADS: "shogun/uploads",
  LOGS: "shogun/logs",
  MB_USAGE: "shogun/mbUsage",
  TEST: "shogun/test",

  // System
  SYSTEM_HASH: "shogun/systemhash",

  // Indexes (unified under shogun/index)
  DEALS_BY_CID: "shogun/index/deals-by-cid",
  DEALS_BY_CLIENT: "shogun/index/deals-by-client",

  // Anna's Archive (torrent preservation network) - unified under shogun/
  ANNAS_ARCHIVE: "shogun/annas-archive",

  // Wormhole
  SHOGUN_WORMHOLE: "shogun/wormhole",
  WORMHOLE_TRANSFERS: "transfers", // Relative to SHOGUN_WORMHOLE
} as const;

type GunPath = (typeof GUN_PATHS)[keyof typeof GUN_PATHS];
