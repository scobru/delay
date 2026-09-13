import { Router, Response } from "express";
import multer from "multer";
import FormData from "form-data";
import { loggers } from "../../utils/logger";
import { ipfsUpload } from "../../utils/ipfs-client";
import { adminOrApiKeyAuthMiddleware } from "../../middleware/admin-or-api-key-auth";
import { saveSystemHash, SystemHashMetadata } from "../../utils/system-hashes-store";

const router: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/**
 * IPFS Directory Upload endpoint - supports multiple files with directory structure
 */
router.post(
  "/upload-directory",
  adminOrApiKeyAuthMiddleware,
  upload.any(),
  async (req, res) => {
    try {
      const files = (req.files || []) as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: "No files provided" });
      }

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const totalSizeMB = totalSize / (1024 * 1024);

      loggers.server.info(
        {
          fileCount: files.length,
          totalSizeMB: totalSizeMB.toFixed(2),
        },
        `📁 Directory upload: ${files.length} files (${totalSizeMB.toFixed(2)} MB)`
      );

      // Create FormData with all files
      const formData = new FormData();
      files.forEach((file) => {
        const filePath =
          file.fieldname && file.fieldname !== "files" ? file.fieldname : file.originalname;
        formData.append("file", file.buffer, {
          filename: filePath,
          contentType: file.mimetype || "application/octet-stream",
        });
      });

      loggers.server.debug(`Uploading ${files.length} files to IPFS with wrap-with-directory=true`);
      const directoryResult = await ipfsUpload("/api/v0/add?wrap-with-directory=true", formData, {
        timeout: 120000,
        maxRetries: 3,
        retryDelay: 1000,
      });

      loggers.server.debug({ directoryResult }, "📤 IPFS Directory Upload response");

      const directoryCid = directoryResult.Hash || directoryResult.cid;
      if (!directoryCid) {
        loggers.server.error({ directoryResult }, "❌ Directory CID not found in IPFS response");
        return res
          .status(500)
          .json({ success: false, error: "Directory CID not found in IPFS response" });
      }

      const mappedFiles = files.map((f) => ({
        name: f.originalname,
        path: f.fieldname && f.fieldname !== "files" ? f.fieldname : f.originalname,
        size: f.size,
        mimetype: f.mimetype || "application/octet-stream",
      }));

      const dirName = (req.body.dirName as string) || `Directory (${files.length} files)`;

      // Persist directory metadata in system-hashes store
      const metadata: SystemHashMetadata = {
        hash: directoryCid,
        userAddress: (req.body.userAddress as string) || "admin-upload",
        timestamp: Date.now(),
        fileName: dirName,
        displayName: dirName,
        originalName: dirName,
        fileSize: totalSize,
        contentType: "application/directory",
        isDirectory: true,
        isEncrypted: false,
        fileCount: files.length,
        files: mappedFiles,
      };

      try {
        await saveSystemHash(metadata);
      } catch (saveErr) {
        loggers.server.warn({ err: saveErr }, "⚠️ Could not auto-save directory metadata in system-hashes-store");
      }

      res.json({
        success: true,
        cid: directoryCid,
        hash: directoryCid,
        directoryCid,
        fileCount: files.length,
        totalSize,
        totalSizeMB,
        files: mappedFiles,
      });
    } catch (error: unknown) {
      loggers.server.error({ err: error }, "❌ IPFS Directory Upload error");
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMessage });
    }
  }
);

export default router;
