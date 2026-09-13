import { Router, Request, Response, NextFunction } from "express";
import { loggers } from "../utils/logger";
import {
  getSystemHashesMap,
  saveSystemHash,
  removeSystemHash,
  SystemHashMetadata,
} from "../utils/system-hashes-store";
import { adminOrApiKeyAuthMiddleware } from "../middleware/admin-or-api-key-auth";

const router: Router = Router();

// Apply auth to all user-uploads routes
router.use((req: Request, res: Response, next: NextFunction) => {
  adminOrApiKeyAuthMiddleware(req, res, next);
});

/**
 * GET /api/v1/user-uploads/system-hashes-map
 * Returns full map of CID to metadata
 */
router.get("/system-hashes-map", async (req: Request, res: Response) => {
  try {
    const systemHashes = await getSystemHashesMap();
    res.json({
      success: true,
      systemHashes,
      count: Object.keys(systemHashes).length,
    });
  } catch (error: any) {
    loggers.server.error({ error }, "Error fetching system hashes map");
    res.status(500).json({
      success: false,
      error: "Failed to retrieve system hashes map",
      details: error.message,
    });
  }
});

/**
 * POST /api/v1/user-uploads/save-system-hash
 * Save or update metadata for a file / directory
 */
router.post("/save-system-hash", async (req: Request, res: Response) => {
  try {
    const {
      hash,
      userAddress,
      timestamp,
      fileName,
      displayName,
      originalName,
      fileSize,
      contentType,
      isEncrypted,
      isDirectory,
      fileCount,
      files,
      relayUrl,
    } = req.body;

    if (!hash) {
      return res.status(400).json({
        success: false,
        error: "Hash (CID) is required",
      });
    }

    const metadata: SystemHashMetadata = {
      hash,
      userAddress: userAddress || "admin-upload",
      timestamp: timestamp || Date.now(),
      fileName: fileName || displayName || originalName || hash,
      displayName: displayName || fileName || originalName || hash,
      originalName: originalName || fileName,
      fileSize: typeof fileSize === "number" ? fileSize : undefined,
      contentType: contentType || (isDirectory ? "application/directory" : "application/octet-stream"),
      isEncrypted: !!isEncrypted,
      isDirectory: !!isDirectory,
      fileCount: typeof fileCount === "number" ? fileCount : (Array.isArray(files) ? files.length : undefined),
      files: Array.isArray(files) ? files : undefined,
      relayUrl,
    };

    await saveSystemHash(metadata);

    res.json({
      success: true,
      message: "System hash saved successfully",
      hash,
      metadata,
    });
  } catch (error: any) {
    loggers.server.error({ error }, "Error saving system hash");
    res.status(500).json({
      success: false,
      error: "Failed to save system hash",
      details: error.message,
    });
  }
});

/**
 * DELETE /api/v1/user-uploads/remove-system-hash/:cid
 * Remove metadata for a given CID
 */
router.delete("/remove-system-hash/:cid", async (req: Request, res: Response) => {
  try {
    const rawCid = req.params.cid;
    const cid = Array.isArray(rawCid) ? rawCid[0] : rawCid;
    if (!cid) {
      return res.status(400).json({
        success: false,
        error: "CID is required",
      });
    }

    const removed = await removeSystemHash(cid);
    res.json({
      success: true,
      message: removed ? "System hash removed successfully" : "Hash not found in store",
      hash: cid,
    });
  } catch (error: any) {
    loggers.server.error({ error, cid: req.params.cid }, "Error removing system hash");
    res.status(500).json({
      success: false,
      error: "Failed to remove system hash",
      details: error.message,
    });
  }
});

export default router;
