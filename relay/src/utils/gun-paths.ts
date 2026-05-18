/**
 * Unified GunDB paths for the Shogun network
 *
 * These paths are shared between delay and shogun-mule
 * to ensure consistent network discovery and communication.
 */

export const GUN_PATHS = {
  // Base
  SHOGUN: "shogun",
  SHOGUN_INDEX: "shogun/index",

  // Network discovery
  RELAYS: "shogun/network/relays",
  PEERS: "shogun/network/peers",
  // TORRENTS removed

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

  // Anna's Archive (torrent preservation network) - unified under shogun/
  // ANNAS_ARCHIVE removed

  // Wormhole
  SHOGUN_WORMHOLE: "shogun/wormhole",
  WORMHOLE_TRANSFERS: "transfers", // Relative to SHOGUN_WORMHOLE
} as const;

type GunPath = (typeof GUN_PATHS)[keyof typeof GUN_PATHS];

/**
 * Helper to get a Gun node from a unified path string
 * Handles splitting path by '/' and traversing the graph hierarchically
 *
 * @param gun - Gun instance
 * @param path - Path string (e.g. 'shogun/network/relays')
 * @returns - Gun node at the end of the path
 */
export const getGunNode = (gun: any, path: string): any => {
  const parts = path.split("/");
  let node = gun;
  for (const part of parts) {
    node = node.get(part);
  }
  return node;
};
