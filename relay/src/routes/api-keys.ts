import { Router, Request, Response } from "express";
import { generateApiKey, listApiKeys, revokeApiKey } from "../utils/api-keys-store";
import { loggers } from "../utils/logger";

const router: Router = Router();

/**
 * List all API keys
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const keys = await listApiKeys();
    res.json({ success: true, keys });
  } catch (error: any) {
    loggers.server.error({ error }, "Error listing API keys");
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Generate a new API key
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: "Name is required for the API key" });
    }

    const { token, data } = await generateApiKey(name);
    res.json({ success: true, token, data });
  } catch (error: any) {
    loggers.server.error({ error }, "Error generating API key");
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Revoke an API key
 */
router.delete("/:keyId", async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const success = await revokeApiKey(keyId as string);

    if (success) {
      res.json({ success: true, message: "API key revoked successfully" });
    } else {
      res.status(404).json({ success: false, error: "API key not found" });
    }
  } catch (error: any) {
    loggers.server.error({ error }, "Error revoking API key");
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
