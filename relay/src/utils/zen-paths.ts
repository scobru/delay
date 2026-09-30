/**
 * Unified Zen Database paths for the Delay network
 *
 * These paths are shared across delay services
 * to ensure consistent network discovery and communication.
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

  // Wormhole
  DELAY_WORMHOLE: "delay/wormhole",
  SHOGUN_WORMHOLE: "delay/wormhole",
  WORMHOLE_TRANSFERS: "transfers", // Relative to DELAY_WORMHOLE
} as const;

type ZenPath = (typeof ZEN_PATHS)[keyof typeof ZEN_PATHS];

/**
 * Helper to get a Zen node from a unified path string
 * Handles splitting path by '/' and traversing the graph hierarchically
 *
 * @param zen - Zen instance
 * @param path - Path string (e.g. 'delay/network/relays')
 * @returns - Zen node at the end of the path
 */
export const getZenNode = (zen: any, path: string): any => {
  const parts = path.split("/");
  let node = zen;
  for (const part of parts) {
    node = node.get(part);
  }
  return node;
};

/**
 * Helper to clean up deprecated legacy shogun entries for a host
 */
export const cleanupLegacyShogunNode = (zen: any, host: string): void => {
  try {
    getZenNode(zen, "shogun/network/relays").get(host).put(null);
    getZenNode(zen, "shogun/network/relays").get(host).get("pulse").put(null);
  } catch {
    // Ignore cleanup errors
  }
};
