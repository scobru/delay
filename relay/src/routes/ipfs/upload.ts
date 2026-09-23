import { Router, Response } from "express";
import multer from "multer";
import FormData from "form-data";
import { loggers } from "../../utils/logger";
import { ipfsUpload } from "../../utils/ipfs-client";
import { adminOrApiKeyAuthMiddleware } from "../../middleware/admin-or-api-key-auth";
import { saveSystemHash, SystemHashMetadata } from "../../utils/system-hashes-store";
import { getContentTypeFromExtension } from "./utils";
import { ipfsConfig } from "../../config/env-config";

const router: Router = Router();

// Configurazione multer per upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ipfsConfig.maxFileSizeMB * 1024 * 1024,
  },
});

/**
 * IPFS File Upload endpoint with Admin/API Key authentication
 */
router.post(
  "/upload",
  adminOrApiKeyAuthMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file provided" });
      }

      // Read custom filename if provided
      const rawCustomName = (
        (req.body.customName as string) ||
        (req.body.fileName as string) ||
        req.file.originalname
      ).trim();

      let finalName = rawCustomName || req.file.originalname;
      // Preserve extension if user provided a custom name without extension
      if (
        rawCustomName &&
        !rawCustomName.includes(".") &&
        req.file.originalname.includes(".")
      ) {
        const ext = req.file.originalname.split(".").pop();
        if (ext) finalName = `${rawCustomName}.${ext}`;
      }

      const formData = new FormData();
      formData.append("file", req.file.buffer, {
        filename: finalName,
        contentType: req.file.mimetype,
      });

      const fileResult = await ipfsUpload("/api/v0/add?wrap-with-directory=false", formData, {
        timeout: ipfsConfig.uploadTimeoutMs,
        maxRetries: 3,
        retryDelay: 1000,
      });

      loggers.server.debug({ fileResult }, "📤 IPFS Upload response");

      const cid = fileResult.Hash || fileResult.cid;
      const isEncrypted = req.body.isEncrypted === "true" || finalName.endsWith(".enc");
      const contentType = req.file.mimetype || getContentTypeFromExtension(finalName);

      // Persist metadata in system-hashes store
      const metadata: SystemHashMetadata = {
        hash: cid,
        userAddress: (req.body.userAddress as string) || "admin-upload",
        timestamp: Date.now(),
        fileName: finalName,
        displayName: finalName,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        contentType,
        isDirectory: false,
        isEncrypted,
        fileCount: 1,
      };

      try {
        await saveSystemHash(metadata);
      } catch (saveErr) {
        loggers.server.warn({ err: saveErr }, "⚠️ Could not auto-save metadata in system-hashes-store");
      }

      const uploadData = {
        name: finalName,
        displayName: finalName,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: contentType,
        hash: cid,
        cid: cid,
        sizeBytes: fileResult.Size,
        uploadedAt: Date.now(),
        isDirectory: false,
      };

      res.json({
        success: true,
        cid: cid,
        hash: cid,
        file: uploadData,
      });
    } catch (error: unknown) {
      loggers.server.error({ err: error }, "❌ IPFS Upload error");
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMessage });
    }
  }
);

export default router;
