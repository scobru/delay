import { loggers } from "./logger";

// @ts-ignore
import { disc, hwid } from "zen/lib/discover.js";
// @ts-ignore
import { scanbg, mkpat } from "zen/lib/scan.js";

export const kprs = new Set<string>(); // Known peers
const spat = new Set<string>(); // Scanned patterns

let stmr: NodeJS.Timeout | null = null;
let pmsh: any = null;
let fic = false;
const SIV = 10 * 60 * 1000; // 10 min base interval
const MSIV = 2 * 60 * 60 * 1000; // 2 hr cap
const MUPS = 10; // max outbound peer connections from scan
let siv = SIV;

export let activeDomain: string | null = null;
export let activePort: number = 8420;
export let networkIdentity: any = null;

let onNetworkIdentityRefreshed: (() => void) | null = null;

export function setNetworkIdentityRefreshedCallback(callback: () => void) {
  onNetworkIdentityRefreshed = callback;
}

export async function discoverNetworkIdentity(configuredPort: number) {
  // disc() returns { domain, ip, port, source }
  const network = await disc({ port: configuredPort, noSave: true });
  networkIdentity = network;
  activeDomain = network.domain || network.ip;
  activePort = network.port;
  
  if (onNetworkIdentityRefreshed) {
    try {
      onNetworkIdentityRefreshed();
    } catch (e: any) {
      loggers.server.error(`Failed to trigger status refresh on network discovery: ${e.message}`);
    }
  }
  
  return network;
}

export function startNetworkIdentityRefresh(configuredPort: number) {
  setInterval(async () => {
    try {
      loggers.server.debug("🔄 Refreshing dynamic WAN network identity...");
      await discoverNetworkIdentity(configuredPort);
    } catch (e: any) {
      loggers.server.warn(`⚠️ Dynamic IP discovery refresh failed: ${e.message}`);
    }
  }, 10 * 60 * 1000).unref();
}

export function getHardwarePeerId() {
  return hwid();
}

function pkey(host: string) {
  const p = mkpat((host || "").split(":")[0]);
  return p ? p.prefix + "*" + p.tail + p.suffix : host;
}

function scnd(host: string, zenInstance: any) {
  if (!host) return;
  const key = pkey(host);
  if (spat.has(key)) return;
  spat.add(key);
  loggers.server.info(`🔍 Scanning ZEN pattern: ${key}`);
  scanbg(host, {
    port: activePort,
    onFound: (url: string) => addPeer(url, zenInstance),
  });
}

function scanNetwork(zenInstance: any) {
  if (activeDomain) scnd(activeDomain, zenInstance);
}

function scheduleNetworkScan(zenInstance: any) {
  if (stmr) clearTimeout(stmr);
  stmr = setTimeout(() => {
    fic = false;
    spat.clear();
    scanNetwork(zenInstance);
    const check = setTimeout(() => {
      if (!fic) {
        siv = Math.min(siv * 2, MSIV);
        loggers.server.debug(
          `Scan: no new peers - next scan in ${Math.round(siv / 60000)}m`,
        );
      } else {
        siv = SIV;
      }
      scheduleNetworkScan(zenInstance);
    }, 2 * 60 * 1000);
    if (check.unref) check.unref();
  }, siv);
  if (stmr.unref) stmr.unref();
}

function addPeer(url: string, zenInstance: any) {
  if (kprs.has(url)) return;
  kprs.add(url);
  fic = true;
  loggers.server.info(`🤝 Discovered new ZEN peer: ${url}`);

  const r = zenInstance && zenInstance._graph && zenInstance._graph._;
  const ups = r && r.axe ? Object.keys(r.axe.up || {}).length : 0;

  if (pmsh && ups < MUPS) {
    try {
      pmsh.hi({ id: url, url, retry: 9 });
    } catch {}
  } else if (!pmsh && r && r.opt) {
    if (!Array.isArray(r.opt.peers)) r.opt.peers = [];
    if (!r.opt.peers.includes(url)) r.opt.peers.push(url);
  }

  if (pmsh) {
    try {
      pmsh.say({ dam: "pex", peers: [url] }, r && r.opt && r.opt.peers);
    } catch {}
  }

  try {
    scnd(new URL(url).hostname, zenInstance);
  } catch {}
  
  if (onNetworkIdentityRefreshed) {
    try {
      onNetworkIdentityRefreshed();
    } catch {}
  }
}

export function setupPeerExchange(zenInstance: any, serverUrl: string | null) {
  if (serverUrl) kprs.add(serverUrl);

  const root = zenInstance._graph._;

  setImmediate(() => {
    const mesh = root.opt && root.opt.mesh;
    if (!mesh) return;
    pmsh = mesh;

    // AXE now handles PEX and hi/bye events internally.
    // We only keep the background scan triggers.
    loggers.server.info("📡 AXE taking over Peer Exchange (PEX)");
  });

  if (activeDomain) {
    scanNetwork(zenInstance);
    scheduleNetworkScan(zenInstance);
  }
}

export function latchDomain(req: any, zenInstance: any) {
  if (activeDomain) return activeDomain;
  const host = (req.headers.host || "").split(":")[0];
  if (host && host !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    activeDomain = host;
    loggers.server.info(`🌐 Domain latched from request: ${activeDomain}`);
    if (zenInstance) {
      scanNetwork(zenInstance);
      scheduleNetworkScan(zenInstance);
    }
    if (onNetworkIdentityRefreshed) {
      try {
        onNetworkIdentityRefreshed();
      } catch {}
    }
  }
  return activeDomain;
}

export function startBootPeerWatchdog(zenInstance: any, bootPeers: string[]) {
  const root = zenInstance && zenInstance._graph && zenInstance._graph._;
  if (!root) return;

  const getAxeUp = () => {
    const mesh = root.opt && root.opt.mesh;
    return (mesh && mesh.up) || {};
  };

  const isPeerAlive = (url: string) => {
    const opt = root.opt;
    if (!opt) return false;
    const norm = url;
    const p = opt.peers && opt.peers[norm];
    if (p && p.wire) return true;
    
    // Check AXE mesh.up
    const axeUp = getAxeUp();
    if (p && p.pid && axeUp[p.pid]) return true;
    
    // Check by scanning PIDs in axeUp to see if their url matches
    for (const pid of Object.keys(axeUp)) {
      const activePeer = axeUp[pid];
      if (activePeer && (activePeer.url === norm || activePeer.id === norm)) {
        return true;
      }
    }
    return false;
  };

  setInterval(() => {
    const opt = root.opt;
    const mesh = opt && opt.mesh;
    if (!mesh || !opt) return;

    for (const peerUrl of bootPeers) {
      if (isPeerAlive(peerUrl)) continue;

      // No live connection - clear tombstone and backoff counters
      const norm = peerUrl;
      if (opt._tombUrls) {
        opt._tombUrls.delete(norm);
        const alt = norm.startsWith("wss://") 
          ? norm.replace("wss://", "ws://") 
          : norm.replace("ws://", "wss://");
        opt._tombUrls.delete(alt);
      }

      const p = opt.peers && opt.peers[norm];
      if (p) {
        delete p._noReconnect;
        delete p._hiGuess;
        delete p._axeGuess;
      }

      loggers.server.info(`[BOOT-WATCHDOG] Reconnecting lost BOOT peer: ${norm}`);
      try {
        mesh.hi({ id: norm, url: norm, retry: 9 });
      } catch (e: any) {
        loggers.server.error(`[BOOT-WATCHDOG] Failed to reconnect peer: ${e.message}`);
      }
    }
  }, 30 * 1000).unref();
}
