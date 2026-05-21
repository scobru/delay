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
import { secureCompare, hashToken, createProductionErrorHandler, isOriginAllowed } from "./utils/security";

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
      const hasValidAuth = msg.headers.token === authConfig.adminPassword;
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

  // --- Zen HTTP Direct Routes (replaces legacy root-level http-proxy-middleware context filtering) ---
  app.get(["/status", "/zen/status"], async (req, res) => {
    try {
      const response = await fetch("http://127.0.0.1:8420/status");
      const data = await response.text();
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    } catch (e: any) {
      loggers.server.warn({ err: e.message }, "⚠️ Zen /status not reachable");
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("");
    }
  });

  app.get("/.well-known/peers.json", async (req, res) => {
    try {
      const response = await fetch("http://127.0.0.1:8420/.well-known/peers.json");
      const data = await response.json();

      if (data && Array.isArray(data.peers)) {
        data.peers = data.peers.map((peer: string) => {
          if (typeof peer === "string" && peer.endsWith(":")) {
            return peer.slice(0, -1);
          }
          return peer;
        });
      }

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=60",
      });
      res.end(JSON.stringify(data));
    } catch (e: any) {
      loggers.server.warn({ err: e.message }, "⚠️ Zen /.well-known/peers.json not reachable");
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ peers: [] }));
    }
  });

  // Return the resolved peers list directly to keep compatibility
  app.get("/peers", async (req, res) => {
    try {
      const response = await fetch("http://127.0.0.1:8420/.well-known/peers.json");
      const data = await response.json();
      
      let peers = data.peers || [];
      if (Array.isArray(peers)) {
        peers = peers.map((peer: string) => {
          if (typeof peer === "string" && peer.endsWith(":")) {
            return peer.slice(0, -1);
          }
          return peer;
        });
      }

      res.status(200).json(peers);
    } catch (e) {
      res.status(200).json([]);
    }
  });

  // Proxy websocket/HTTP requests on /zen to http://127.0.0.1:8420/zen
  const zenProxy = createProxyMiddleware({
    target: "http://127.0.0.1:8420",
    changeOrigin: true,
    ws: true,
    // @ts-ignore
    on: {
      error: (err: any, req: any, res: any) => {
        // If Zen service is not reachable, return empty fallback instead of crashing
        loggers.server.warn({ err: err.message }, "⚠️ Zen service on :8420 not reachable");
        if (res && !res.headersSent) {
          const url: string = req.url || "";
          if (url.includes("peers.json")) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ peers: [] }));
          } else {
            res.writeHead(503, { "Content-Type": "text/plain" });
            res.end("");
          }
        }
      },
    },
  });

  app.use("/zen", zenProxy);

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

      if (token === authConfig.adminPassword) {
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

  // Handle WebSocket upgrade proxying to standalone Zen service
  server.on("upgrade", (req: any, socket: any, head: any) => {
    if (req.url?.startsWith("/zen")) {
      // Patch raw socket to track stats for dashboard
      const addr = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "unknown";
      statsTracker.patchRawSocket(socket, addr as string, "zen");
      
      // @ts-ignore
      zenProxy.upgrade(req, socket, head);
    }
  });

  const peers = relayConfig.peers;
  loggers.server.info({ peers }, "🔍 Peers");

  // Storage is handled out-of-process by the standalone Zen service on 8420.
  // We act as a client connecting to it.

  // Configure ZEN options as a lightweight client
  const zenOptions: any = {
    super: false, // Act as client
    localStorage: false,
    radisk: true, // Standalone service handles database persistence!
    axe: true,    // Standalone service handles AXE!
    peers: ["http://127.0.0.1:8420/zen"], // Connect to local Zen relay (e.g. http://localhost:8420/zen)
  };

  loggers.server.info({ peers: zenOptions.peers }, "🚀 Initializing ZEN Client Instance...");

  const zen = new ZEN(zenOptions);

  // Initialize Gun Alias Guard (running over Zen instance natively)
  gunAliasGuard(zen);

  // Store Zen instance in express app for access from routes
  app.set("zenInstance", zen);

  (global as any).zenInstance = zen;

  loggers.server.info("✅ ZEN Client Instance successfully initialized");

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




  // Get relay host identifier
  // Extract hostname from endpoint if it's a URL
  let host = serverConfig.host || relayConfig.endpoint || "localhost";
  try {
    // If it's a URL, extract just the hostname
    if (host.includes("://") || host.includes(".")) {
      const url = new URL(host.startsWith("http") ? host : `https://${host}`);
      host = url.hostname;
    }
  } catch (e) {
    // Not a valid URL, use as-is
  }

  // Initialize Generic Services (Linda functionality)
  // DISABLED: Services removed as client migrated to pure Zen
  /*
    try {
      const { initServices } = await import("./services/manager");
      await initServices(app, server, gun);
    } catch (error) {
      loggers.server.error({ err: error }, "Failed to load Generic Services");
    }
    */

  // Initialize Relay Identity
  if (relayKeysConfig.seaKeypair) {
    try {
      relayKeyPair = JSON.parse(relayKeysConfig.seaKeypair);
      loggers.server.info("🔑 Relay KeyPair loaded from config");
    } catch (e: any) {
      loggers.server.error({ err: e.message }, "❌ Failed to parse RELAY_SEA_KEYPAIR");
    }
  }

  if (!relayKeyPair) {
    loggers.server.warn("⚠️ No Relay KeyPair configured, generating ephemeral pair");
    relayKeyPair = await ZEN.pair();
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
