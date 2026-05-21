import express from "express";
import { loggers } from "../utils/logger";
import * as umbral from "@nucypher/umbral-pre";
import { waitForZenData } from "../utils/zen-utils";

const router = express.Router();

/**
 * Re-encrypt Endpoint
 * Body: { groupId, memberPub, capsuleB64 }
 */
router.post("/reencrypt", async (req, res) => {
  const { groupId, memberPub, capsuleB64 } = req.body;
  
  if (!groupId || !memberPub || !capsuleB64) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  loggers.server.info(`[TPRE] 📥 Request for Group: ${groupId?.substring(0, 8)} | Member: ${memberPub?.substring(0, 12)}...`);

  const gun = req.app.get("zenInstance") || req.app.get("zenInstance");
  if (!gun) {
    return res.status(500).json({ error: "No database instance available" });
  }

  try {
    // 1. Look up this relay's kfrag for this (group, member) pair
    // Using waitForZenData to handle P2P sync latency
    const kfragNode = gun.get("linda_rooms").get(groupId).get("relay_kfrags").get(memberPub);
    const kfragString: string | null = await waitForZenData(kfragNode);
    
    if (!kfragString || typeof kfragString !== 'string') {
      loggers.server.warn(`[TPRE] ❌ Kfrag NOT FOUND for member ${memberPub?.substring(0, 8)}`);
      return res.status(404).json({ error: "No relay kfrag found for this member" });
    }

    // 2. Deserialize Handlers
    const kfragBytes = new Uint8Array(Buffer.from(kfragString, "base64"));
    // VerifiedKeyFrag non ha un metodo statico fromBytes, usiamo KeyFrag + skipVerification
    const kfrag = (umbral as any).KeyFrag.fromBytes(kfragBytes).skipVerification();
    const capsuleBytes = new Uint8Array(Buffer.from(capsuleB64, 'base64'));
    const capsule = umbral.Capsule.fromBytes(capsuleBytes);

    // 3. Re-encrypt
    const cfrag = umbral.reencrypt(capsule, kfrag);
    const cfragB64 = Buffer.from(cfrag.toBytes()).toString('base64');

    loggers.server.info(`[TPRE] ✅ Re-encryption successful`);
    res.json({ cfrag: cfragB64 });
  } catch (err: any) {
    loggers.server.error({ err: err.message, groupId, memberPub }, "Error during Proxy Re-Encryption");
    res.status(500).json({ error: "Failed to perform re-encryption", details: err.message });
  }
});

export default router;
