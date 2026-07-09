import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import FormData from "form-data";
import { secureCompare, hashToken, validateAdminToken, isAdminPasswordConfigured } from "../utils/security";
import { getZenStorageStats } from "../utils/zen-storage-stats";
// http import removed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurazione multer per upload file
const upload = multer({ storage: multer.memoryStorage() });


// Middleware di autenticazione admin (secure, timing-safe)
const tokenAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader && authHeader.split(" ")[1];

  // Check custom token header (for Gun/Wormhole compatibility)
  const customToken = req.headers["token"] as string | undefined;

  // Accept either format
  const token = bearerToken || customToken;

  if (!token) {
    loggers.server.warn(
      { bearerToken: !!bearerToken, customToken: !!customToken },
      "Auth failed - no token"
    );
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Secure comparison using hash and timing-safe comparison
  const tokenHash = hashToken(token);
  const isConfigured = isAdminPasswordConfigured();

  if (isConfigured && validateAdminToken(token)) {
    next();
  } else {
    loggers.server.warn(
      { bearerToken: !!bearerToken, customToken: !!customToken },
      "Auth failed - invalid token"
    );
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
};

import ipfsRouter from "./ipfs";
import apiKeysRouter from "./api-keys";
import systemRouter from "./system";
import debugRouter from "./debug";
import visualGraphRouter from "./visualGraph";
// torrentRouter removed
import authRouter from "./auth";
// TPRE removed
import networkRouter from "./network";

import { ipfsRequest } from "../utils/ipfs-client";
import { generateOpenAPISpec } from "../utils/openapi-generator";
import { loggers } from "../utils/logger";
import { authConfig, ipfsConfig, packageConfig, relayConfig, zenConfig } from "../config";

// Rate limiting generale
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 1000, // massimo 1000 richieste per IP
  message: {
    success: false as any, // Type assertion for compatibility
    message: "Troppe richieste. Riprova tra 15 minuti.",
    data: null,
  } as any, // Type assertion to match rate-limit types
});

export default async (app: express.Application) => {
  // Configurazione generale delle route
  const baseRoute = "/api/v1";

  // OpenAPI Specification endpoint - Must be registered BEFORE other API routes
  app.get("/api/openapi.json", (req, res) => {
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const spec = generateOpenAPISpec(baseUrl);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*"); // Allow CORS for API docs
      res.json(spec);
    } catch (error: any) {
      loggers.server.error({ err: error }, "Error generating OpenAPI spec");
      res.status(500).json({
        success: false,
        error: "Failed to generate OpenAPI specification",
        details: error.message,
      });
    }
  });

  // --- IPFS Desktop Proxy Configuration ---
  const IPFS_GATEWAY_URL = ipfsConfig.gatewayUrl;
  const IPFS_API_TOKEN = ipfsConfig.apiToken as string | undefined;
  const IPFS_API_URL = ipfsConfig.apiUrl as string;

  loggers.server.info(
    { IPFS_API_URL, IPFS_GATEWAY_URL, authConfigured: !!IPFS_API_TOKEN },
    `🌐 IPFS Proxy Configuration`
  );

  // IPFS Gateway handler with direct IPFS API fallback
  app.get("/ipfs/:cid", async (req: Request, res: Response, next: NextFunction) => {
    const { cid } = req.params;
    // Try to retrieve file directly from IPFS API
    try {
      loggers.server.debug({ cid }, `📁 Direct IPFS retrieval attempt`);

      // Try to get file from IPFS directly using HTTP API
      const fileBuffer = (await ipfsRequest(`/cat?arg=${encodeURIComponent(cid as string)}`, {
        responseType: "arraybuffer",
      })) as Buffer;

      if (fileBuffer && fileBuffer.length > 0) {
        // Try to detect content type from first bytes
        let contentType = "application/octet-stream";
        const firstBytes = fileBuffer.slice(0, 512);

        // Basic content type detection
        if (
          firstBytes[0] === 0x89 &&
          firstBytes[1] === 0x50 &&
          firstBytes[2] === 0x4e &&
          firstBytes[3] === 0x47
        ) {
          contentType = "image/png";
        } else if (firstBytes[0] === 0xff && firstBytes[1] === 0xd8) {
          contentType = "image/jpeg";
        } else if (firstBytes[0] === 0x47 && firstBytes[1] === 0x49 && firstBytes[2] === 0x46) {
          contentType = "image/gif";
        } else if (
          firstBytes[0] === 0x25 &&
          firstBytes[1] === 0x50 &&
          firstBytes[2] === 0x44 &&
          firstBytes[3] === 0x46
        ) {
          contentType = "application/pdf";
        } else if (
          fileBuffer.slice(0, 5).toString() === "<html" ||
          fileBuffer.slice(0, 9).toString() === "<!DOCTYPE"
        ) {
          contentType = "text/html";
        } else {
          // Try to detect JSON
          try {
            JSON.parse(fileBuffer.toString());
            contentType = "application/json";
          } catch (e) {
            // Not JSON, keep default
          }
        }

        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", fileBuffer.length);
        res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year
        res.setHeader("X-Content-Source", "ipfs-direct");

        loggers.server.info(
          { cid, size: fileBuffer.length, contentType },
          `✅ Served CID directly from IPFS API`
        );
        return res.send(fileBuffer);
      }
    } catch (error: any) {
      loggers.server.warn({ err: error, cid }, `⚠️ Direct IPFS retrieval failed`);
      // Fall through to proxy gateway
    }

    // If direct retrieval fails or IPFS not available, pass to proxy
    next();
  });

  // IPFS Gateway Proxy with fallback - for accessing files via IPFS hash
  app.use(
    "/ipfs",
    createProxyMiddleware({
      target: IPFS_GATEWAY_URL,
      changeOrigin: true,
      pathRewrite: {
        "^/ipfs": "/ipfs", // Changed to preserve /ipfs in the path
      },
      // @ts-ignore - http-proxy-middleware types
      onProxyReq: (proxyReq: any, req: any, res: any) => {
        loggers.server.debug(
          {
            method: req.method,
            url: req.url,
            target: `${IPFS_GATEWAY_URL}${proxyReq.path}`,
          },
          `📁 IPFS Gateway Request`
        );
      },
      // @ts-ignore - http-proxy-middleware types
      onProxyRes: async (proxyRes: any, req: any, res: any) => {
        loggers.server.debug(
          { statusCode: proxyRes.statusCode, url: req.url },
          `📁 IPFS Gateway Response`
        );

        // If local gateway fails with 404, show user-friendly error page with fallback links
        if (proxyRes.statusCode === 404) {
          const hash = req.url.split("/ipfs/")[1]?.split("?")[0]?.split("#")[0]; // Get CID, remove query/hash
          if (hash) {
            loggers.server.warn({ hash }, `⚠️ Local gateway 404, showing fallback page`);

            // Stop the proxy response and send our own HTML page
            const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPFS Content Not Found - Delay</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
      color: #ffffff;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 600px;
      padding: 40px;
      text-align: center;
    }
    h1 {
      font-size: 32px;
      margin-bottom: 16px;
      color: #ff6b6b;
    }
    p {
      font-size: 18px;
      line-height: 1.6;
      color: #b0b0b0;
      margin-bottom: 32px;
    }
    .cid {
      font-family: 'Courier New', monospace;
      background: #3a3a3a;
      padding: 12px;
      border-radius: 8px;
      word-break: break-all;
      margin: 20px 0;
      color: #4fc3f7;
    }
    .fallback-links {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 32px;
    }
    .fallback-link {
      display: block;
      padding: 16px 24px;
      background: #4a4a4a;
      border: 2px solid #5a5a5a;
      border-radius: 8px;
      color: #ffffff;
      text-decoration: none;
      transition: all 0.3s ease;
    }
    .fallback-link:hover {
      background: #5a5a5a;
      border-color: #6a6a6a;
      transform: translateY(-2px);
    }
    .fallback-link strong {
      display: block;
      margin-bottom: 4px;
      color: #4fc3f7;
    }
    .fallback-link span {
      font-size: 14px;
      color: #b0b0b0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📦 IPFS Content Not Found</h1>
    <p>The requested content is not available on this relay's local IPFS node.</p>
    <div class="cid">CID: ${hash}</div>
    <p>Try accessing it via a public IPFS gateway:</p>
    <div class="fallback-links">
      <a href="https://ipfs.io/ipfs/${hash}" target="_blank" class="fallback-link">
        <strong>🌐 IPFS.io Gateway</strong>
        <span>ipfs.io/ipfs/${hash}</span>
      </a>
      <a href="https://cloudflare-ipfs.com/ipfs/${hash}" target="_blank" class="fallback-link">
        <strong>☁️ Cloudflare Gateway</strong>
        <span>cloudflare-ipfs.com/ipfs/${hash}</span>
      </a>
      <a href="https://dweb.link/ipfs/${hash}" target="_blank" class="fallback-link">
        <strong>🔗 DWeb Link</strong>
        <span>dweb.link/ipfs/${hash}</span>
      </a>
    </div>
  </div>
</body>
</html>
            `;

            res.status(404);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Content-Length", Buffer.byteLength(html));
            res.setHeader("X-IPFS-Fallback", `https://ipfs.io/ipfs/${hash}`);
            res.end(html);
            return;
          }
        }
      },
      // @ts-ignore - http-proxy-middleware types
      onError: (err: any, req: any, res: any) => {
        loggers.server.error({ err }, "❌ IPFS Gateway Proxy Error");

        // Extract hash from URL for fallback
        const hash = req.url.split("/ipfs/")[1];

        res.status(502).json({
          success: false,
          error: "Local IPFS Gateway unavailable",
          details: err.message,
          fallback: hash
            ? {
                publicGateway: `https://ipfs.io/ipfs/${hash}`,
                cloudflareGateway: `https://cloudflare-ipfs.com/ipfs/${hash}`,
                dweb: `https://dweb.link/ipfs/${hash}`,
              }
            : undefined,
        });
      },
    })
  );

  app.use(
    "/ipns",
    createProxyMiddleware({
      target: IPFS_GATEWAY_URL,
      changeOrigin: true,
      pathRewrite: {
        "^/ipns": "/ipns",
      },
      // @ts-ignore - http-proxy-middleware types
      onProxyReq: (proxyReq: any, req: any, res: any) => {
        loggers.server.debug(
          {
            method: req.method,
            url: req.url,
            target: `${IPFS_GATEWAY_URL}${req.url}`,
          },
          `📁 IPNS Gateway Request`
        );
      },
      // @ts-ignore - http-proxy-middleware types
      onError: (err: any, req: any, res: any) => {
        loggers.server.error({ err }, "❌ IPNS Gateway Proxy Error");
        res.status(500).json({
          success: false,
          error: "IPFS Gateway unavailable",
          details: err.message,
        });
      },
    })
  );

  app.get("/api/v1/ipfs/webui", (req, res) => {
    const token =
      req.query?.auth_token ||
      req.query?._auth_token ||
      (req.headers["authorization"] && (req.headers["authorization"] as string).split(" ")[1]) ||
      req.headers["token"];

    if (validateAdminToken(token as string)) {
      res.redirect("/api/v1/ipfs/webui/?auth_token=" + encodeURIComponent(token as string));
      return;
    }

    res.redirect(`/admin?error=unauthorized&path=${encodeURIComponent(req.originalUrl)}`);
  });

  app.get("/admin", async (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    const adminPath = path.resolve(publicPath, "admin.html");

    const exists = await fs.promises
      .access(adminPath)
      .then(() => true)
      .catch(() => false);

    loggers.server.debug({ publicPath, adminPath, exists }, `🔍 Admin route requested`);

    if (!exists) {
      loggers.server.error({ adminPath }, `❌ Admin file not found`);
      return res.status(404).json({
        success: false,
        error: "Admin panel HTML file not found",
        path: adminPath,
      });
    }

    // Aggiungi header per prevenire il caching
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    res.sendFile(adminPath);
  });

  app.get("/stats", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "stats.html"));
  });

  app.get("/charts", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "charts.html"));
  });

  app.get("/services-dashboard", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "services-dashboard.html"));
  });

  app.get("/pin-manager", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "pin-manager.html"));
  });

  app.get("/notes", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "notes.html"));
  });

  app.get("/upload", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "upload.html"));
  });

  app.get("/api-keys", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "api-keys.html"));
  });

  app.get("/graph", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "graph.html"));
  });



  app.get("/rpc-console", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "rpc-console.html"));
  });

  app.get("/endpoints", (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    res.sendFile(path.resolve(publicPath, "endpoints.html"));
  });

  // Route per servire i file JavaScript dalla directory lib
  app.get("/lib/:filename", async (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    const targetDir = path.resolve(publicPath, "lib");
    const filePath = path.resolve(targetDir, req.params.filename);

    if (!filePath.startsWith(targetDir + path.sep)) {
      loggers.server.warn({ filename: req.params.filename }, `⚠️ Path traversal attempt blocked`);
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const exists = await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);

    loggers.server.debug(
      {
        filename: req.params.filename,
        filePath,
        exists,
      },
      `🔍 Lib file requested`
    );

    if (!exists) {
      loggers.server.error({ filePath }, `❌ Lib file not found`);
      return res.status(404).json({
        success: false,
        error: "JavaScript file not found",
        path: filePath,
      });
    }

    // Set correct content type for JavaScript files
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(filePath);
  });

  // Route per servire i file CSS dalla directory styles
  app.get("/styles/:filename", async (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    const targetDir = path.resolve(publicPath, "styles");
    const filePath = path.resolve(targetDir, req.params.filename);

    if (!filePath.startsWith(targetDir + path.sep)) {
      loggers.server.warn({ filename: req.params.filename }, `⚠️ Path traversal attempt blocked`);
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const exists = await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);

    loggers.server.debug(
      {
        filename: req.params.filename,
        filePath,
        exists,
      },
      `🔍 Styles file requested`
    );

    if (!exists) {
      loggers.server.error({ filePath }, `❌ Styles file not found`);
      return res.status(404).json({
        success: false,
        error: "CSS file not found",
        path: filePath,
      });
    }

    // Set correct content type for CSS files
    res.setHeader("Content-Type", "text/css");
    res.sendFile(filePath);
  });

  // Route di autenticazione

  // API Keys (stateless admin keys)
  app.use(`${baseRoute}/api-keys`, tokenAuthMiddleware, apiKeysRouter);

  // Route per IPFS (conditional)
  if (ipfsConfig.enabled) {
    app.use(`${baseRoute}/ipfs`, ipfsRouter);
    loggers.server.info(`✅ IPFS routes registered`);
  } else {
    loggers.server.info(`⏭️ IPFS routes disabled (IPFS_ENABLED=false)`);
    // Return disabled message for any IPFS route request
    app.use(`${baseRoute}/ipfs/*`, (req, res) => {
      res.status(503).json({ success: false, error: "IPFS module is disabled" });
    });
  }

  // Route di sistema e debug (always enabled - core functionality)
  app.use(`${baseRoute}/system`, systemRouter);
  app.use(`${baseRoute}/network`, networkRouter);
  app.use(`${baseRoute}/debug`, debugRouter);

  // Route per il grafico visivo (always enabled)
  app.use(`${baseRoute}/visualGraph`, visualGraphRouter);


  // Route di autenticazione
  app.use(`${baseRoute}/auth`, authRouter);

  // Route TPRE per Threshold Proxy Re-Encryption
  // TPRE endpoint removed
  loggers.server.info(`✅ TPRE routes registered`);


  // Route di test per verificare se le route sono registrate correttamente
  app.get(`${baseRoute}/test`, (req, res) => {
    res.json({
      success: true,
      message: "API routes are working",
      timestamp: Date.now(),
      baseRoute: baseRoute,
    });
  });

  // Debug endpoint per verificare la configurazione admin
  // SECURED: Protected by admin authentication and only shows presence, not details
  app.get(`${baseRoute}/debug/admin-config`, tokenAuthMiddleware, (req: Request, res: Response) => {
    res.json({
      success: true,
      adminPasswordStatus: isAdminPasswordConfigured() ? "CONFIGURED" : "NOT_CONFIGURED",
      timestamp: Date.now(),
    });
  });

  // Route principale per il visual graph
  app.use("/visualGraph", visualGraphRouter);

  // IPFS API Proxy - for API calls to the IPFS node
  // Example: /api/v0/add, /api/v0/cat, etc.
  // SECURED: This generic proxy requires the admin token for any access.
  app.use(
    "/api/v0",
    (req, res, next) => {
      const authHeader = req.headers["authorization"];
      const bearerToken = authHeader && authHeader.split(" ")[1];
      const customToken = req.headers["token"];
      const token = bearerToken || customToken;

      if (validateAdminToken(token as string)) {
        next();
      } else {
        res.status(401).json({ success: false, error: "Unauthorized" });
      }
    },
    createProxyMiddleware({
      target: IPFS_API_URL,
      changeOrigin: true,
      pathRewrite: {
        "^/api/v0": "/api/v0",
      },
      // @ts-ignore - http-proxy-middleware types
      onProxyReq: (proxyReq: any, req: any, res: any) => {
        loggers.server.debug(
          {
            method: req.method,
            url: req.url,
            target: `${IPFS_API_URL}${req.url}`,
          },
          `🔧 IPFS API Request`
        );

        // Add authentication headers for IPFS API
        if (IPFS_API_TOKEN) {
          proxyReq.setHeader("Authorization", `Bearer ${IPFS_API_TOKEN}`);
        }

        // IPFS API requires POST method for most endpoints
        // Override GET requests to POST for IPFS API endpoints
        if (
          req.method === "GET" &&
          (req.url.includes("/version") || req.url.includes("/id") || req.url.includes("/peers"))
        ) {
          proxyReq.method = "POST";
          proxyReq.setHeader("Content-Length", "0");
        }

        // Add query parameter to get JSON response
        if (req.url.includes("/version")) {
          const originalPath = proxyReq.path;
          proxyReq.path = originalPath + (originalPath.includes("?") ? "&" : "?") + "format=json";
        }
      },
      // @ts-ignore - http-proxy-middleware types
      onProxyRes: (proxyRes: any, req: any, res: any) => {
        loggers.server.debug(
          { statusCode: proxyRes.statusCode, method: req.method, url: req.url },
          `📤 IPFS API Response`
        );

        // Handle non-JSON responses from IPFS
        if (
          proxyRes.headers["content-type"] &&
          !proxyRes.headers["content-type"].includes("application/json")
        ) {
          loggers.server.debug(
            { contentType: proxyRes.headers["content-type"] },
            `📝 IPFS Response Content-Type`
          );
        }
      },
      // @ts-ignore - http-proxy-middleware types
      onError: (err: any, req: any, res: any) => {
        loggers.server.error({ err }, "❌ IPFS API Proxy Error");
        res.status(500).json({
          success: false,
          error: "IPFS API unavailable",
          details: err.message,
        });
      },
    })
  );

  // --- FINE ROUTE LEGACY ---

  // Enhanced health check endpoint with detailed metrics
  app.get(`${baseRoute}/health`, (req, res) => {
    try {
      const memUsage = process.memoryUsage();
      const memUsageMB = memUsage.heapUsed / 1024 / 1024;
      const memLimitMB = memUsage.heapTotal / 1024 / 1024;
      const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      let status = "healthy";
      const warnings = [];

      if (memPercent > 90) {
        status = "degraded";
        warnings.push("High memory usage");
      }

      const uptimeSeconds = process.uptime();
      const uptimeHours = uptimeSeconds / 3600;
      if (uptimeSeconds < 30) {
        warnings.push("Recently started (still initializing)");
      }

      const activeWires = app.get("activeWires") || 0;
      const totalConnections = app.get("totalConnections") || 0;
      const zenInstance = app.get("zenInstance");
      const holsterInstance = app.get("holsterInstance");

      const healthData = {
        success: true,
        status,
        relayName: relayConfig.name,
        version: packageConfig.version || "1.0.0",
        uptime: Math.floor(uptimeSeconds),
        timestamp: new Date().toISOString(),
        uptimeDetails: {
          seconds: Math.floor(uptimeSeconds),
          hours: Math.floor(uptimeHours * 10) / 10,
          formatted: `${Math.floor(uptimeHours)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
        },
        connections: {
          active: activeWires,
          total: totalConnections,
        },
        memory: {
          heapUsedMB: Math.round(memUsageMB * 10) / 10,
          heapTotalMB: Math.round(memLimitMB * 10) / 10,
          percent: Math.round(memPercent * 10) / 10,
          rssMB: Math.round((memUsage.rss / 1024 / 1024) * 10) / 10,
        },
        relay: {
          pub: app.get("relayUserPub") || null,
          epub: (app.get("relayKeyPair") as any)?.epub || null,
          name: relayConfig.name,
        },
        services: {
          gun: zenInstance ? "active" : "inactive",
          zen: app.get("zenInstance") ? "active" : "inactive",
          holster: holsterInstance ? "active" : "inactive",
          ipfs: ipfsConfig.enabled ? "enabled" : "disabled",
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };

      res.status(200).json(healthData);
    } catch (error: any) {
      loggers.server.error({ err: error }, "Error in /health endpoint");
      res.status(200).json({
        success: false,
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    }
  });

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================


  /**
   * GET /api/v1/admin/storage-stats
   * Get storage usage statistics for all data directories
   * Admin only - requires authentication
   */
  app.get(
    `${baseRoute}/admin/storage-stats`,
    tokenAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const dataDir = path.resolve(process.cwd(), "data");
        const radataDir = path.resolve(process.cwd(), "radata");

        // Helper function to get directory size
        const getDirSize = async (dirPath: string): Promise<{ bytes: number; files: number }> => {
          let totalSize = 0;
          let fileCount = 0;

          const exists = await fs.promises
            .access(dirPath)
            .then(() => true)
            .catch(() => false);
          if (!exists) {
            return { bytes: 0, files: 0 };
          }

          const walkDir = async (dir: string): Promise<void> => {
            try {
              const items = await fs.promises.readdir(dir, { withFileTypes: true });
              // Process directory entries concurrently for better performance
              await Promise.all(
                items.map(async (item) => {
                  const fullPath = path.join(dir, item.name);
                  if (item.isDirectory()) {
                    await walkDir(fullPath);
                  } else if (item.isFile()) {
                    try {
                      const stats = await fs.promises.stat(fullPath);
                      totalSize += stats.size;
                      fileCount++;
                    } catch (e) {
                      // Ignore unreadable files
                    }
                  }
                })
              );
            } catch (e) {
              // Ignore unreadable directories
            }
          };

          await walkDir(dirPath);
          return { bytes: totalSize, files: fileCount };
        };

        const formatSize = (bytes: number) => {
          const mb = bytes / (1024 * 1024);
          const gb = bytes / (1024 * 1024 * 1024);
          return {
            bytes,
            mb: Math.round(mb * 100) / 100,
            gb: Math.round(gb * 100) / 100,
            formatted: gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(2)} MB`,
          };
        };

        // Calculate sizes for each directory
        const dataStats = await getDirSize(dataDir);
        const radataStats = await getDirSize(radataDir);
        const ipfsStats = await getDirSize(path.join(dataDir, "ipfs"));
        const zenStats = await getDirSize(zenConfig.dataDir || path.join(dataDir, "zendata"));

        // Pass the store instance if available for accurate stats
        const zenStore = req.app.get("zenStore");
        const gundbStats = await getZenStorageStats();

        const totalBytes = dataStats.bytes + radataStats.bytes + zenStats.bytes;

        res.json({
          success: true,
          storage: {
            total: formatSize(totalBytes),
            data: {
              ...formatSize(dataStats.bytes),
              path: dataDir,
              files: dataStats.files,
            },
            radata: {
              ...formatSize(radataStats.bytes),
              path: radataDir,
              files: radataStats.files,
              description: "Zen radix storage",
            },
            breakdown: {
              ipfs: {
                ...formatSize(ipfsStats.bytes),
                path: path.join(dataDir, "ipfs"),
                files: ipfsStats.files,
              },

              zen: {
                ...formatSize(zenStats.bytes),
                path: zenConfig.dataDir || path.join(dataDir, "zendata"),
                files: zenStats.files,
                description: "ZEN storage (radata)",
              },
            },
          },
          timestamp: Date.now(),
        });
      } catch (error: any) {
        loggers.server.error({ err: error }, "Failed to get storage stats");
        res.status(500).json({
          success: false,
          error: error.message || "Internal server error",
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/config
   * Get all configuration values with metadata
   * Admin only
   */
  app.get(`${baseRoute}/admin/config`, tokenAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { getAllConfig, HOT_RELOADABLE_KEYS, RESTART_REQUIRED_KEYS } =
        await import("../utils/runtime-config");

      const config = getAllConfig();

      // Group by category
      const grouped: Record<string, typeof config> = {};
      for (const item of config) {
        if (!grouped[item.category]) {
          grouped[item.category] = [];
        }
        grouped[item.category].push(item);
      }

      res.json({
        success: true,
        config: grouped,
        hotReloadableKeys: HOT_RELOADABLE_KEYS,
        restartRequiredKeys: RESTART_REQUIRED_KEYS,
      });
    } catch (error: any) {
      loggers.server.error({ err: error }, "Failed to get config");
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  });

  /**
   * PUT /api/v1/admin/config
   * Update hot-reloadable configuration values (no restart required)
   * Admin only
   */
  app.put(`${baseRoute}/admin/config`, tokenAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { setRuntimeValue, isHotReloadable, HOT_RELOADABLE_KEYS } =
        await import("../utils/runtime-config");
      const updates = req.body as Record<string, string>;

      if (!updates || typeof updates !== "object") {
        return res.status(400).json({
          success: false,
          error: "Request body must be an object with key-value pairs",
        });
      }

      const results: Record<string, { success: boolean; error?: string }> = {};
      const successful: string[] = [];
      const failed: string[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (!isHotReloadable(key)) {
          results[key] = {
            success: false,
            error: `Key '${key}' is not hot-reloadable. Modify .env and restart server.`,
          };
          failed.push(key);
          continue;
        }

        const success = setRuntimeValue(key as any, String(value));
        results[key] = { success };
        if (success) {
          successful.push(key);
        } else {
          failed.push(key);
        }
      }

      res.json({
        success: failed.length === 0,
        message: `Updated ${successful.length} config(s)${failed.length > 0 ? `, ${failed.length} failed` : ""}`,
        results,
        hotReloadableKeys: HOT_RELOADABLE_KEYS,
      });
    } catch (error: any) {
      loggers.server.error({ err: error }, "Failed to update config");
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  });

  /**
   * PUT /api/v1/admin/config/env
   * Update .env file directly (requires server restart)
   * Admin only
   */
  app.put(
    `${baseRoute}/admin/config/env`,
    tokenAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { updateEnvFile, isHotReloadable, requiresRestart } =
          await import("../utils/runtime-config");
        const updates = req.body as Record<string, string>;

        if (!updates || typeof updates !== "object") {
          return res.status(400).json({
            success: false,
            error: "Request body must be an object with key-value pairs",
          });
        }

        // Identify which keys require restart
        const restartRequired: string[] = [];
        const hotReloadable: string[] = [];

        for (const key of Object.keys(updates)) {
          if (requiresRestart(key)) {
            restartRequired.push(key);
          } else if (isHotReloadable(key)) {
            hotReloadable.push(key);
          }
        }

        const success = await updateEnvFile(updates);

        if (!success) {
          return res.status(500).json({
            success: false,
            error: "Failed to write to .env file",
          });
        }

        res.json({
          success: true,
          message: ".env file updated",
          restartRequired: restartRequired.length > 0,
          restartRequiredKeys: restartRequired,
          hotReloadableKeys: hotReloadable,
          warning:
            restartRequired.length > 0
              ? `⚠️ Server restart required for: ${restartRequired.join(", ")}`
              : undefined,
        });
      } catch (error: any) {
        loggers.server.error({ err: error }, "Failed to update .env file");
        res.status(500).json({
          success: false,
          error: error.message || "Internal server error",
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/config/env
   * Read the current .env file contents
   * Admin only
   */
  app.get(
    `${baseRoute}/admin/config/env`,
    tokenAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { readEnvFile, parseEnvFile } = await import("../utils/runtime-config");

        const content = await readEnvFile();
        if (content === null) {
          return res.status(404).json({
            success: false,
            error: ".env file not found",
          });
        }

        const parsed = parseEnvFile(content);

        res.json({
          success: true,
          raw: content,
          parsed,
        });
      } catch (error: any) {
        loggers.server.error({ err: error }, "Failed to read .env file");
        res.status(500).json({
          success: false,
          error: error.message || "Internal server error",
        });
      }
    }
  );

  loggers.server.info(`✅ Admin routes registered`);

  // Users (observed users on relay) - must be before catch-all

  // Route di default per API non trovate
  app.use(`${baseRoute}/*`, (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: "API endpoint non trovato",
      data: {
        path: req.path,
        method: req.method,
        availableEndpoints: [
          // Health & System
          `${baseRoute}/health`,
          `${baseRoute}/system/health`,
          `${baseRoute}/system/stats`,
          `${baseRoute}/system/alldata`,
          // API Keys
          `${baseRoute}/api-keys`,
          `${baseRoute}/api-keys/generate`,
          // IPFS (aligned with Kubo API)
          `${baseRoute}/ipfs/upload`,
          `${baseRoute}/ipfs/status`,
          `${baseRoute}/ipfs/cat/:cid`,
          `${baseRoute}/ipfs/cat/:cid/json`,
          `${baseRoute}/ipfs/cat/:cid/decrypt`,
          `${baseRoute}/ipfs/pin/add`,
          `${baseRoute}/ipfs/pin/rm`,
          `${baseRoute}/ipfs/pin/ls`,
          `${baseRoute}/ipfs/repo/gc`,
          `${baseRoute}/ipfs/repo/stat`,
          `${baseRoute}/ipfs/version`,
          // Users

          // Gateway proxy
          `/ipfs/:cid`,
          `/ipns/:name`,
          // Notes
          `${baseRoute}/notes`,
          `${baseRoute}/notes/regular`,
          // Services
          `${baseRoute}/services/status`,
          `${baseRoute}/services/:service/restart`,
          // Visual Graph
          `${baseRoute}/visualGraph`,
        ],
      },
    });
  });

  // Fallback to ZEN.serve for library assets and internal routes
  // This is placed after specific API routes but before the final catch-all
  // @ts-ignore
  const { default: ZEN } = await import("zen");
  if (ZEN && (ZEN as any).serve) {
    app.use((ZEN as any).serve);
  }

  // Fallback to index.html per tutte le altre route
  app.get("/*", async (req, res) => {
    const publicPath = path.resolve(__dirname, "../public");
    const indexPath = path.resolve(publicPath, "index.html");
    const exists = await fs.promises
      .access(indexPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Index file not found");
    }
  });
};
