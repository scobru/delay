import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";
import setSelfAdjustingInterval from "self-adjusting-interval";
import { fileURLToPath } from "url";
// @ts-ignore
import ZEN from "zen";
import "zen/lib/multicast.js";
// @ts-ignore
import { setupRelayPex } from "zen/lib/pex.js";
// @ts-ignore
import { PeerRegistry } from "zen/lib/preg.js";
// @ts-ignore
import { buildStatus, signStatus } from "zen/lib/status.js";

import multer from "multer";
import { loggers } from "./utils/logger";
import { StatsTracker } from "./utils/stats-tracker";
import {
  config,
  ipfsConfig,
  relayConfig,
  serverConfig,
  authConfig,
  storageConfig,
  relayKeysConfig,
  wormholeConfig,
  replicationConfig,
  loggingConfig,
  packageConfig,
  zenConfig,
} from "./config/env-config";

import { startWormholeCleanup } from "./utils/wormhole-cleanup";
import { tokenAuthMiddleware } from "./middleware/token-auth";
import { secureCompare, hashToken, createProductionErrorHandler, isOriginAllowed, validateAdminToken } from "./utils/security";

import { ZEN_PATHS, getZenNode } from "./utils/zen-paths";

import { gunAliasGuard } from "./middleware/gun-alias-guard";
import { latchDomain } from "./utils/zen-network";

// Route Imports

// Middleware

dotenv.config();

// -------------------------------------------------

// --- IPFS Configuration ---
const IPFS_API_URL = ipfsConfig.apiUrl;
const IPFS_API_TOKEN = ipfsConfig.apiToken;
const IPFS_GATEWAY_URL = ipfsConfig.gatewayUrl;
const IPFS_API_HOST = ipfsConfig.apiHost;
const IPFS_API_PORT = ipfsConfig.apiPort;

const isProtectedRelay = relayConfig.protected;
loggers.server.info({ isProtectedRelay }, "Relay protection enabled");

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
let host = serverConfig.host;
// Remove protocol from host if present (http:// or https://)
// Also remove trailing slashes
host = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
let port = serverConfig.port;
let path_public = serverConfig.publicPath;

/**
 * Main server initialization function
 * Sets up Express, Zen, and all routes
 * @returns {Promise<void>}
 */
async function initializeServer() {
  let relayKeyPair: any = null;
  // Welcome message with ASCII art logo
  const welcomeMessage = serverConfig.welcomeMessage;
  console.log(welcomeMessage);
  loggers.server.info("🚀 Initializing Delay Server...");
  loggers.server.info("🚀 Delay v1.0.1 - FORCE UPDATE");

  // Initialize Relay Identity early so routes and PEX can access it
  if (relayKeysConfig.seaKeypair) {
    try {
      relayKeyPair = JSON.parse(relayKeysConfig.seaKeypair);
      loggers.server.info("🔑 Relay KeyPair loaded from config (RELAY_SEA_KEYPAIR)");
    } catch (e: any) {
      loggers.server.error({ err: e.message }, "❌ Failed to parse RELAY_SEA_KEYPAIR");
    }
  } else if (relayKeysConfig.seaKeypairPath) {
    try {
      if (fs.existsSync(relayKeysConfig.seaKeypairPath)) {
        const fileContent = fs.readFileSync(relayKeysConfig.seaKeypairPath, "utf8");
        relayKeyPair = JSON.parse(fileContent);
        loggers.server.info(`🔑 Relay KeyPair loaded from path: ${relayKeysConfig.seaKeypairPath}`);
      } else {
        loggers.server.warn(`⚠️ Relay KeyPair path configured but file not found: ${relayKeysConfig.seaKeypairPath}`);
      }
    } catch (e: any) {
      loggers.server.error({ err: e.message }, `❌ Failed to load/parse KeyPair from path: ${relayKeysConfig.seaKeypairPath}`);
    }
  }

  if (!relayKeyPair) {
    loggers.server.warn("⚠️ No Relay KeyPair configured, generating ephemeral pair");
    relayKeyPair = await ZEN.pair();
  }

  // Initialize Peer Registry and load Bootstrap peers early
  const peersPath = path.join(storageConfig.dataDir, "peers.json");
  const registry = new PeerRegistry().bindSave(peersPath);
  registry.protect(relayConfig.peers);

  let cachedStatus = "";
  let discResult: any = null;

  /**
   * System logging function (console only)
   * @param {string} level - Log level (info, warn, error, etc.)
   * @param {string} message - Log message
   * @param {any} [data=null] - Optional data to log
   */
  function addSystemLog(level: string, message: string, data: any = null) {
    const timestamp = new Date().toISOString();

    // Log using logger
    const logMethod =
      level === "error"
        ? loggers.server.error
        : level === "warn"
          ? loggers.server.warn
          : loggers.server.info;

    if (data !== null && data !== undefined) {
      try {
        logMethod({ message, data: JSON.stringify(data, null, 2), timestamp });
      } catch (jsonError) {
        logMethod({ message, data: String(data), timestamp });
      }
    } else {
      logMethod({ message, timestamp });
    }
  }

  // Funzione per i dati di serie temporale
  function addTimeSeriesPoint(key: string, value: any) {
    // Log using logger
    loggers.server.debug({
      message: `📊 TimeSeries: ${key} = ${value}`,
      key,
      value,
    });
  }

  // Funzione di validazione del token
  function hasValidToken(msg: any) {
    if (isProtectedRelay === false) {
      return true;
    }

    // Se ha headers, verifica il token
    if (msg && msg.headers && msg.headers.token) {
      const hasValidAuth = validateAdminToken(msg.headers.token);
      if (hasValidAuth) {
        loggers.server.info(`🔍 PUT allowed - valid token: ${msg.headers}`);
        return true;
      }
    }

    loggers.server.warn(`❌ Operation denied - no valid auth: ${JSON.stringify(msg.headers)}`);
    return false;
  }

  // Crea l'app Express
  const app = express();
  const publicPath = path.resolve(__dirname, path_public);
  const indexPath = path.resolve(publicPath, "index.html");

  // Normalize double slashes in the path to avoid 404s (e.g. //api/v1/health)
  app.use((req, res, next) => {
    const [pathPart, queryPart] = req.url.split("?", 2);
    if (pathPart.includes("//")) {
      const normalizedPath = pathPart.replace(/\/{2,}/g, "/");
      req.url = queryPart ? `${normalizedPath}?${queryPart}` : normalizedPath;
    }
    next();
  });

  // Latch domain from first incoming request Host header if still unknown
  app.use((req, res, next) => {
    latchDomain(req, app.get("zenInstance"));
    next();
  });

  // ===== SECURITY: CORS Configuration =====
  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (isOriginAllowed(origin, authConfig.corsOrigins)) {
        callback(null, true);
      } else {
        loggers.server.warn({ origin }, "CORS blocked request from origin");
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: authConfig.corsCredentials,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "token",
      "X-Requested-With",
      "X-Session-Token",
      "X-User-Address",
    ],
    exposedHeaders: ["X-Session-Token"],
    maxAge: 86400, // 24 hours
  };
  app.use(cors(corsOptions));
  loggers.server.info(
    {
      origins: authConfig.corsOrigins.includes("*") ? "ALL" : authConfig.corsOrigins,
      credentials: authConfig.corsCredentials,
    },
    "🔒 CORS configured"
  );

  // ===== SECURITY: Security Headers =====
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");
    // XSS Protection
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Referrer Policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // --- Native Zen Route Handlers ---
  app.get(["/status", "/zen/status"], (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(cachedStatus || "");
  });

  app.get("/.well-known/peers.json", (req, res) => {
    const entries = [
      ...registry.bootEntries(),
      ...registry.confirmedNonBoot(),
    ];
    const peers = entries
      .map(e => {
        try {
          const u = new URL(e.url);
          return u.hostname + ":" + (u.port || (u.protocol === "https:" ? "443" : "8420"));
        } catch {
          return null;
        }
      })
      .filter((v, i, a) => v && a.indexOf(v) === i); // unique, non-null

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=60",
    });
    res.end(JSON.stringify({ peers }));
  });

  app.get("/peers", (req, res) => {
    const entries = [
      ...registry.bootEntries(),
      ...registry.confirmedNonBoot(),
    ];
    const peers = entries
      .map(e => {
        try {
          const u = new URL(e.url);
          return u.hostname + ":" + (u.port || (u.protocol === "https:" ? "443" : "8420"));
        } catch {
          return null;
        }
      })
      .filter((v, i, a) => v && a.indexOf(v) === i); // unique, non-null

    res.status(200).json(peers);
  });

  // ===== SECURITY: Security Headers =====
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");
    // XSS Protection
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Referrer Policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.use(express.json()); // Aggiungi supporto per il parsing del body JSON
  app.use(express.urlencoded({ extended: true })); // Aggiungi supporto per i dati del form

  // Fix per rate limiting con proxy
  app.set("trust proxy", 1);

  // Stats Tracker Initialize
  const statsTracker = new StatsTracker();
  app.set("statsTracker", statsTracker);

  // ===== ROOT HEALTH CHECK ENDPOINTS (for load balancers, k8s probes) =====
  // Note: /health endpoint with full details is registered later after initialization
  // Use /healthz for minimal health checks during startup

  // Liveness probe (minimal check)
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  // Readiness probe (checks dependencies)
  app.get("/ready", async (req, res) => {
    try {
      // Check if essential services are ready
      const checks = {
        zen: !!app.get("zenInstance"),
      };

      const allReady = Object.values(checks).every(Boolean);

      res.status(allReady ? 200 : 503).json({
        status: allReady ? "ready" : "not_ready",
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: "error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Root route - redirect to dashboard or show welcome message
  app.get("/", (req, res) => {
    // If the request accepts HTML, redirect to dashboard
    if (req.accepts("html")) {
      return res.redirect("/dashboard/");
    }
    // For other requests (like curl or simple clients), return a text message
    res.status(200).send("Delay è attivo! Connettiti tramite WebSocket a /zen o usa l'API /api/v1");
  });

  // Route specifica per /admin - redirect to new dashboard
  app.get("/admin", (req, res) => {
    res.redirect("/dashboard/");
  });

  // Serve React Dashboard SPA (built files from public/dashboard/dist)
  const dashboardPath = path.resolve(publicPath, "dashboard", "dist");
  app.use(
    "/dashboard",
    express.static(dashboardPath, {
      setHeaders: (res) => {
        res.set({
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        });
      },
    })
  );

  // SPA fallback for React Router - serve index.html for non-asset routes
  app.get("/dashboard/*", (req, res) => {
    const indexPath = path.resolve(dashboardPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({
        success: false,
        error: "Dashboard not found",
        message:
          "Dashboard has not been built yet. Run 'npm run build' in the dashboard directory.",
      });
    }
  });

  // Route specifica per /oauth-callback (DEFINITA PRIMA DEL MIDDLEWARE DI AUTENTICAZIONE)
  app.get("/oauth-callback", (req, res) => {
    const callbackPath = path.resolve(publicPath, "oauth-callback.html");
    if (fs.existsSync(callbackPath)) {
      // Aggiungi header per prevenire il caching
      res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      res.sendFile(callbackPath);
    } else {
      res.status(404).json({
        success: false,
        error: "OAuth callback page not found",
        message: "OAuth callback page not available",
      });
    }
  });

  // Middleware di protezione per le route statiche che richiedono autenticazione admin
  const protectedStaticRoutes = [
    "/services-dashboard",
    "/stats",
    "/charts",
    "/upload",
    "/pin-manager",
    "/api-keys",
  ];

  app.use((req, res, next) => {
    const path = req.path;

    // Controlla se la route richiede autenticazione admin
    if (protectedStaticRoutes.includes(path)) {
      // Verifica autenticazione admin
      const authHeader = req.headers["authorization"];
      const bearerToken = authHeader && authHeader.split(" ")[1];
      const customToken = req.headers["token"];
      const formToken = req.query["_auth_token"]; // Token inviato tramite form
      const token = bearerToken || customToken || formToken;

      if (validateAdminToken(token as string)) {
        next();
      } else {
        loggers.server.warn(`❌ Accesso negato a ${path} - Token mancante o non valido`);
        return res.status(401).json({
          success: false,
          error: "Unauthorized - Admin authentication required",
          message:
            "Questa pagina richiede autenticazione admin. Inserisci la password admin nella pagina principale.",
        });
      }
    } else {
      // Route pubblica, continua
      next();
    }
  });

  // IPFS File Upload Endpoint
  const upload = multer({ storage: multer.memoryStorage() });

  // --- Modular Routes ---
  // Registration is moved here to ensure it happens BEFORE server starts listening
  // and BEFORE any fallback middlewares.
  try {
    const { default: registerRoutes } = await import("./routes/index");
    await registerRoutes(app);
    loggers.server.info("✅ Route modulari configurate con successo");
  } catch (error) {
    loggers.server.error({ err: error }, "❌ Errore nel caricamento delle route modulari");
  }

  /**
   * Start the Express server
   * @returns {Promise<import('http').Server>} The HTTP server instance
   */
  async function startServer() {
    const server = app.listen(port, (error) => {
      if (error) {
        return loggers.server.error({ err: error }, "Error during app startup");
      }
      loggers.server.info({ port }, `Server listening on port`);
    });

    return server;
  }

  // Avvia il server
  const server = await startServer();

  // Note: Native embedded ZEN manages WebSocket upgrades on /zen automatically.

  const peers = relayConfig.peers;
  loggers.server.info({ peers }, "🔍 Peers");

  // Storage is handled out-of-process by the standalone Zen service on 8420.
  // We act as a client connecting to it.

  // Resolve domain for PEX
  let domain: string | null = null;
  if (host && host !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(":")) {
    domain = host;
  }

  // Configure ZEN options for native server embedding
  const zenOptions: any = {
    web: server,
    peers: relayConfig.peers,
    file: zenConfig.dataDir,
    localStorage: false,
    radisk: true,
    axe: true,
    ...(relayKeyPair && { pub: relayKeyPair.pub, pid: relayKeyPair.pub }),
    // Storage resilience options mapping
    ...(process.env.FMB !== undefined && { fmb: parseInt(process.env.FMB) }),
    ...(process.env.FRAT !== undefined && { frat: parseFloat(process.env.FRAT) }),
    ...(process.env.EVICT !== undefined && { evict: process.env.EVICT !== '0' })
  };

  loggers.server.info({ peers: zenOptions.peers }, "🚀 Initializing Embedded ZEN Server Instance...");

  const zen = new ZEN(zenOptions);

  // Wire up Peer Exchange (PEX)
  function rttOf(url: string) {
    const n = PeerRegistry.norm(url);
    const at = zen && zen._graph && zen._graph._;
    const axeUp = (at && at.axe && at.axe.up) || {};
    for (const [, p] of Object.entries(axeUp)) {
      // @ts-ignore
      if (p && PeerRegistry.norm(p.url) === n && p.rtt > 0) return p.rtt;
    }
    return Infinity;
  }

  function dedupeByDomain(urls: string[]) {
    const domainPorts = new Set<string>();
    urls.forEach(u => {
      try {
        const h = new URL(u).hostname;
        if (!/^\[/.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
          domainPorts.add(new URL(u).port);
        }
      } catch { }
    });
    if (!domainPorts.size) return urls;
    return urls.filter(u => {
      try {
        const parsed = new URL(u);
        if (domainPorts.has(parsed.port)) {
          if (/^\[/.test(parsed.hostname)) return false;
          if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) return false;
        }
      } catch { }
      return true;
    });
  }

  async function refreshStatus() {
    if (!relayKeyPair) return;
    try {
      const list = registry.pexList(50, rttOf).filter((u: string) => u.endsWith("/zen"));
      const dedupedList = dedupeByDomain(list).sort((a, b) => rttOf(a) - rttOf(b));

      const payload = buildStatus({
        pub: relayKeyPair.pub,
        domain: domain,
        ip4: discResult ? (discResult.ip || null) : null,
        ip6: discResult ? (discResult.ip6 || null) : null,
        port: port,
        peers: dedupedList,
        mcp: false,
      });
      cachedStatus = await signStatus(payload, relayKeyPair);
    } catch (e: any) {
      loggers.server.warn({ err: e.message }, "⚠️ Error refreshing signed status");
    }
    registry.evict();
  }

  const { adopt } = setupRelayPex(zen, {
    domain: domain,
    port: port,
    publicPort: serverConfig.publicPort,
    registry: registry,
    rttOf: rttOf,
    pexMax: 50,
    sendPeers: (list: string[], peer: any) => {
      const r = zen._graph._;
      const bpids = Object.values((r && r.opt && r.opt.peers) || {})
        .filter((p: any) => p && p.pid && !p.url && p.pid !== peer.pid)
        .map((p: any) => p.pid);
      const msg: any = { dam: "pex", peers: list };
      if (bpids.length) msg.bpids = bpids;
      try {
        const mesh = r.opt && r.opt.mesh;
        if (mesh) {
          mesh.say(msg, peer);
        }
      } catch {}
    },
    onDisc: (di: any) => {
      discResult = di;
      refreshStatus();
    },
    onAdopt: (url: string) => {
      refreshStatus();
    }
  });

  refreshStatus(); // Initialize cache on cold start (so status is not empty)

  // Re-run refreshStatus every 30 seconds to keep peers and timestamps fresh
  const statusTimer = setInterval(refreshStatus, 30000);
  if (statusTimer.unref) statusTimer.unref();

  // Single access point for axe.up (inbound relay connections keyed by PID).
  function getAxeUp() {
    const at = zen && zen._graph && zen._graph._;
    return (at && at.axe && at.axe.up) || {};
  }

  // Returns true when a registry entry has at least one live wire.
  function isPeerAlive(entry: any, opt: any) {
    const { pub: knownPub, pid: knownPid, url } = entry;
    const normUrl = PeerRegistry.norm(url);

    const isWireActive = (p: any) => {
      return !!(p && p.wire && (p.wire.readyState === undefined || p.wire.readyState === 1));
    };

    // 1. Check opt.peers (outbound connections)
    if (opt && opt.peers) {
      // Direct lookup by canonical URL
      const directP = opt.peers[normUrl];
      if (isWireActive(directP)) return true;

      // Scan all peers in opt.peers
      for (const p of Object.values(opt.peers) as any[]) {
        if (isWireActive(p)) {
          if (p.url && PeerRegistry.norm(p.url) === normUrl) return true;
          if (p.id && PeerRegistry.norm(p.id) === normUrl) return true;
          if (knownPid && p.pid === knownPid) return true;
          if (knownPub && p.pub === knownPub) return true;
        }
      }
    }

    // 2. Check axeUp (inbound connections)
    const axeUp = getAxeUp();
    if (knownPid && axeUp[knownPid] && isWireActive(axeUp[knownPid])) return true;

    for (const p of Object.values(axeUp) as any[]) {
      if (isWireActive(p)) {
        if (p.url && PeerRegistry.norm(p.url) === normUrl) return true;
        if (p.id && PeerRegistry.norm(p.id) === normUrl) return true;
        if (knownPub && p.pub === knownPub) return true;
      }
    }

    return false;
  }

  // Load previously discovered peers and initialize network events in setImmediate
  setImmediate(() => {
    // 1. Load previously discovered peers from disk
    try {
      const count = registry.load(adopt);
      loggers.server.info(`Loaded ${count} persisted peers from disk`);
    } catch (e: any) {
      loggers.server.warn({ err: e.message }, "⚠️ Failed to load persisted peers");
    }

    const root = zen._graph._;
    const mesh = root.opt && root.opt.mesh;
    if (!mesh) return;
    const route = mesh;

    // Wrap mesh.hear["?"] to store pub/pid for WATCHDOG
    const _origHearQ = mesh.hear["?"];
    mesh.hear["?"] = function (this: any, msg: any, peer: any) {
      if (typeof _origHearQ === "function") _origHearQ.call(this, msg, peer);
      if (peer && peer.url) {
        const nu = PeerRegistry.norm(peer.url);
        registry.confirm(nu, { pub: peer.pub || "", pid: peer.pid || "" });
      }
    };

    // 2. Connect to BOOT peers immediately
    const peersList = relayConfig.peers;
    const _initOpt = root.opt;
    peersList.forEach((url: string) => {
      const normUrl = PeerRegistry.norm(url);
      const existing = _initOpt && _initOpt.peers && _initOpt.peers[normUrl];
      if (existing && existing.wire) return; // already wired
      const peerObj = existing || { id: normUrl, url: normUrl, retry: 9 };
      peerObj._isBoot = true; // prevent AXE hiGuess/axeGuess tombstoning for BOOT peers
      if (existing) existing.retry = 9;
      try { route.hi(peerObj); } catch { }
      // Ensure the stored peer object is also marked
      const stored = _initOpt && _initOpt.peers && _initOpt.peers[normUrl];
      if (stored) stored._isBoot = true;
    });

    // 3. Confirm inbound BOOT/PEX peer connections when they announce their URL via dam:"opt".
    const _origHearOpt = mesh.hear["opt"];
    mesh.hear["opt"] = function (this: any, msg: any, peer: any) {
      if (typeof _origHearOpt === "function") _origHearOpt.call(this, msg, peer);
      if (!msg.ok && msg.opt && typeof msg.opt.peers === "string" && peer && !peer.url && peer.pid) {
        const ann = PeerRegistry.norm(msg.opt.peers);
        if (ann && !registry.isSelf(ann)) {
          if (peer.pub === relayKeyPair?.pub || peer.pid === root.opt.pid) {
            registry.setSelf(ann);
            registry._map.delete(ann);
            return;
          }
          registry.confirm(ann, { pub: peer.pub || "", pid: peer.pid });
        }
      }
    };

    // 4. Confirm inbound peers that self-announce their URL via dam:"pex".
    const _origHearPex = mesh.hear["pex"];
    mesh.hear["pex"] = function (this: any, msg: any, peer: any) {
      if (typeof _origHearPex === "function") _origHearPex.call(this, msg, peer);
      if (peer && peer.pid && !peer.url && Array.isArray(msg.peers)) {
        for (const u of msg.peers) {
          if (typeof u !== "string") continue;
          const ann = PeerRegistry.norm(u);
          if (ann && !registry.isSelf(ann)) {
            if (peer.pub === relayKeyPair?.pub || peer.pid === root.opt.pid) {
              registry.setSelf(ann);
              registry._map.delete(ann);
              continue;
            }
            registry.confirm(ann, { pub: peer.pub || "", pid: peer.pid });
          }
        }
      }
    };

    // 5. On new peer connection: mark URL as confirmed + announce new browser PIDs for WebRTC
    root.on("hi", function (this: any, peer: any) {
      this.to.next(peer);
      if (peer.url) {
        const nu = PeerRegistry.norm(peer.url);
        if (peer.pub === relayKeyPair?.pub || peer.pid === root.opt.pid) {
          registry.setSelf(nu);
          registry._map.delete(nu);
          return;
        }
        registry.confirm(nu, { pub: peer.pub || "", pid: peer.pid || "" });
      }
      if (peer.pid && !peer.url) {
        setTimeout(() => {
          try {
            Object.values(root.opt.peers || {}).forEach((p: any) => {
              if (p && p.wire && p !== peer) {
                try { route.say({ dam: "pex", peers: [], bpids: [peer.pid] }, p); } catch { }
              }
            });
          } catch { }
        }, 600);
      }
    });

    // 6. Reconnect watchdog for BOOT and non-BOOT PEX peers
    const MUPS = 10;
    const watchdogTimer = setInterval(() => {
      const opt = root.opt;
      if (!route || !opt) return;

      for (const entry of registry.bootEntries()) {
        const norm = entry.url;
        if (isPeerAlive(entry, opt)) continue;
        if (opt._tombUrls) {
          opt._tombUrls.delete(norm);
          opt._tombUrls.delete(PeerRegistry.alt(norm));
        }
        const p = opt.peers[norm];
        if (p) { delete p._noReconnect; delete p._hiGuess; delete p._axeGuess; p._isBoot = true; }
        loggers.server.info(`[BOOT-WATCHDOG] Reconnecting lost BOOT peer: ${norm}`);
        try { route.hi({ id: norm, url: norm, retry: 9 }); } catch { }
        const rp = opt.peers && opt.peers[norm];
        if (rp) rp._isBoot = true;
      }

      const ups = Object.keys(getAxeUp()).length;
      for (const entry of registry.confirmedNonBoot()) {
        const url = entry.url;
        if (isPeerAlive(entry, opt)) {
          registry.touch(url);
          continue;
        }
        if (ups >= MUPS) continue;
        const tombs = opt._tombUrls;
        const p = opt.peers && opt.peers[url];
        if (tombs) {
          tombs.delete(url);
          tombs.delete(PeerRegistry.alt(url));
        }
        if (p) { delete p._noReconnect; delete p._hiGuess; delete p._axeGuess; }
        try { route.hi({ id: url, url: url, retry: 3 }); } catch { }
      }
    }, 30000);
    if (watchdogTimer.unref) watchdogTimer.unref();

    // 7. Reactive rescan on bye (30s debounce)
    let tbye: NodeJS.Timeout | null = null;
    root.on("bye", function (this: any, ...args: any[]) {
      this.to.next(...args);
      if (tbye) clearTimeout(tbye);
      tbye = setTimeout(() => {
        loggers.server.info("Peer disconnected — refreshing status");
        refreshStatus();
      }, 30000);
      if (tbye.unref) tbye.unref();
    });
  });

  // Initialize Gun Alias Guard (running over Zen instance natively)
  gunAliasGuard(zen);

  // Store Zen instance in express app for access from routes
  app.set("zenInstance", zen);

  (global as any).zenInstance = zen;

  loggers.server.info("✅ Embedded ZEN Server Instance successfully initialized");

  // Initialize connection counters
  let totalConnections = 0;
  let activeWires = 0;

  // Hook Stats Tracker to ZEN's wire peers
  zen.on("hi", (peer: any) => {
    if (!peer || !peer.wire) return;
    const addr = peer.url || peer.id || "unknown";
    statsTracker.patchSocket(peer.wire, addr, "zen");

    // Synchronize local counters
    totalConnections += 1;
    activeWires = statsTracker.getStats().connectedPeers;
    app.set("totalConnections", totalConnections);
    app.set("activeWires", activeWires);

    loggers.server.debug({ activeWires, addr }, `Connection opened`);
  });

  zen.on("bye", (peer: any) => {
    // Small delay to let StatsTracker update its map
    setTimeout(() => {
      activeWires = statsTracker.getStats().connectedPeers;
      app.set("activeWires", activeWires);
      loggers.server.debug({ activeWires }, `Connection closed`);
    }, 100);
  });

  // Start wormhole cleanup scheduler for orphaned transfer cleanup
  if (wormholeConfig.enabled) {
    startWormholeCleanup(zen);
    loggers.server.info(`✅ Wormhole cleanup started`);
  } else {
    loggers.server.info(`⏭️ Wormhole cleanup disabled (WORMHOLE_ENABLED=false)`);
  }




  app.set("relayUserPub", relayKeyPair.pub);
  app.set("relayKeyPair", relayKeyPair); // Make relay keypair available to routes

  // Esponi le funzioni helper per le route
  app.set("addSystemLog", addSystemLog);
  app.set("addTimeSeriesPoint", addTimeSeriesPoint);

  // Esponi la mappatura per le route
  // app.set("originalNamesMap", originalNamesMap); // Removed as per edit hint
  // app.set("addHashMapping", addHashMapping); // Removed as per edit hint
  // app.set("calculateKeccak256Hash", calculateKeccak256Hash); // Removed as per edit hint

  // Esponi i middleware di autenticazione per le route
  app.set("tokenAuthMiddleware", tokenAuthMiddleware);

  // Esponi le configurazioni IPFS
  app.set("IPFS_API_URL", IPFS_API_URL);
  app.set("IPFS_API_TOKEN", IPFS_API_TOKEN);
  app.set("IPFS_GATEWAY_URL", IPFS_GATEWAY_URL);

  // ===== SECURITY: Production Error Handler =====
  // This must be added AFTER all routes to catch any unhandled errors
  // In production, it sanitizes error messages to prevent information disclosure
  const isProduction = serverConfig.nodeEnv === "production";
  app.use(createProductionErrorHandler(isProduction));
  if (isProduction) {
    loggers.server.info("🔒 Production error handler enabled - errors will be sanitized");
  }

  // Route statiche (DEFINITE DOPO LE API)

  app.use(express.static(publicPath));

  // Set up relay stats database
  const db = getZenNode(zen, ZEN_PATHS.RELAYS).get(host);

  // Pulse stats are now driven by StatsTracker

  // Set up pulse interval for health monitoring (extended with IPFS stats)
  setSelfAdjustingInterval(async () => {
    const pulse: any = {
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: {
        total: totalConnections,
        active: activeWires,
      },
      relay: {
        host,
        port,
        name: relayConfig.name,
        version: packageConfig.version,
      },
    };

    // Extend pulse with IPFS stats (non-blocking)
    try {
      const http = await import("http");
      const ipfsStats: any = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 3000);
        const options: any = {
          hostname: "127.0.0.1",
          port: 5001,
          path: "/api/v0/repo/stat?size-only=true&human=false",
          method: "POST",
          headers: { "Content-Length": "0" },
        };
        if (IPFS_API_TOKEN) {
          options.headers["Authorization"] = `Bearer ${IPFS_API_TOKEN}`;
        }
        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            clearTimeout(timeout);
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          });
        });
        req.on("error", () => {
          clearTimeout(timeout);
          resolve(null);
        });
        req.end();
      });

      if (ipfsStats) {
        // Try multiple field names for RepoSize
        let repoSize = 0;
        if (ipfsStats.RepoSize !== undefined) {
          repoSize =
            typeof ipfsStats.RepoSize === "string"
              ? parseInt(ipfsStats.RepoSize, 10) || 0
              : ipfsStats.RepoSize || 0;
        } else if (ipfsStats.repoSize !== undefined) {
          repoSize =
            typeof ipfsStats.repoSize === "string"
              ? parseInt(ipfsStats.repoSize, 10) || 0
              : ipfsStats.repoSize || 0;
        }

        if (repoSize !== undefined) {
          pulse.ipfs = {
            connected: true,
            repoSize: repoSize,
            repoSizeMB: Math.round(repoSize / (1024 * 1024)),
            numObjects: ipfsStats.NumObjects || ipfsStats.numberObjects || 0,
          };

          // Also get pin count (quick query) - changed to O(1) repo stat instead of recursive pins
          const pinCount = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(0), 2000);
            const options: any = {
              hostname: "127.0.0.1",
              port: 5001,
              path: "/api/v0/repo/stat",
              method: "POST",
              headers: { "Content-Length": "0" },
            };
            if (IPFS_API_TOKEN) {
              options.headers["Authorization"] = `Bearer ${IPFS_API_TOKEN}`;
            }
            const req = http.request(options, (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                clearTimeout(timeout);
                try {
                  const stats = JSON.parse(data);
                  resolve(stats.NumObjects ? parseInt(stats.NumObjects, 10) : 0);
                } catch {
                  resolve(0);
                }
              });
            });
            req.on("error", () => {
              clearTimeout(timeout);
              resolve(0);
            });
            req.end();
          });

          pulse.ipfs.numPins = pinCount;
        }
      } else {
        pulse.ipfs = { connected: false };
      }
    } catch (e: any) {
      pulse.ipfs = { connected: false, error: e.message };
    }

    // CRITICAL: Save pulse to Zen relays namespace for network discovery
    try {
      // Save pulse with timestamp for filtering
      const relayData = {
        pulse: {
          ...pulse,
          timestamp: pulse.timestamp || Date.now(), // Ensure timestamp is set
        },
        lastUpdated: Date.now(),
      };

      // Warn if host is localhost (common discovery issue)
      if (host.includes("localhost") || host.includes("127.0.0.1")) {
        // Only warn once every ~100 pulses to avoid spam, or warn at startup (but this is a loop)
        // Check random chance or just debug log
        if (Math.random() < 0.05) {
          loggers.server.warn(
            { host },
            "⚠️  Relay host is configured as localhost. External relays will not be able to connect to you. Set RELAY_HOST in .env"
          );
        }
      }

      getZenNode(zen, ZEN_PATHS.RELAYS).get(host).put(relayData);

      // Also save to a separate pulse namespace for easier querying
      getZenNode(zen, ZEN_PATHS.RELAYS).get(host).get("pulse").put(pulse);

      // Log pulse only in debug mode to avoid console spam
      loggers.server.debug(
        {
          host,
          connections: activeWires,
          ipfsConnected: pulse.ipfs?.connected,
          numPins: pulse.ipfs?.numPins || 0,
        },
        `📡 Pulse saved to relays`
      );
    } catch (e: any) {
      loggers.server.warn({ err: e.message }, "Failed to save pulse to Zen relays namespace");
      loggers.server.debug(
        {
          host,
          connections: activeWires,
          ipfsConnected: pulse.ipfs?.connected,
          numPins: pulse.ipfs?.numPins || 0,
        },
        `📡 Pulse saved to relays`
      );
    }

    addTimeSeriesPoint("connections.active", activeWires);
    addTimeSeriesPoint("memory.heapUsed", process.memoryUsage().heapUsed);

  }, 300000); // 5 minutes

  // Shutdown function
  async function shutdown() {
    loggers.server.info("🛑 Shutting down Delay...");

    // Give a grace period for in-flight operations to complete
    // Zen may still have pending operations, so we wait a bit longer
    loggers.server.info("⏳ Waiting for in-flight operations to complete...");
    await new Promise((resolve) => setTimeout(resolve, 2000));



    // Close server
    if (server) {
      server.close(() => {
        loggers.server.info("✅ Server closed");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }

  // Handle shutdown signals
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  loggers.server.info({ host, port }, `🚀 Delay Server running`);

  return {
    server,
    gun: zen,
    addSystemLog,
    addTimeSeriesPoint,
    shutdown,
  };
}

// Add process-level error handlers to catch GUN JSON parse errors
process.on("uncaughtException", (error: Error) => {
  // Handle JSON parse errors from GUN's yson.js gracefully
  if (error.message && error.message.includes("Bad control character in string literal")) {
    loggers.server.warn(
      { err: error },
      "⚠️  Corrupted data file detected in GUN storage. This is usually harmless - GUN will skip the corrupted file."
    );
    // Don't exit - let GUN continue with other files
    return;
  }

  // Handle other uncaught exceptions
  loggers.server.error({ err: error }, "Uncaught exception");
  // Only exit for critical errors
  if (error.message && !error.message.includes("JSON")) {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  // Handle JSON parse errors in promises
  if (
    reason &&
    reason.message &&
    reason.message.includes("Bad control character in string literal")
  ) {
    loggers.server.warn(
      { err: reason },
      "⚠️  Corrupted data file detected in GUN storage (promise rejection). This is usually harmless."
    );
    return;
  }

  loggers.server.error({ err: reason, promise }, "Unhandled promise rejection");
});

// Avvia il server
initializeServer().catch((error) => {
  loggers.server.error({ err: error }, "Failed to initialize server");
  process.exit(1);
});
