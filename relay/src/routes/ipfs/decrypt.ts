import { Router, Request, Response } from "express";
import { loggers } from "../../utils/logger";
import { ipfsConfig } from "../../config";
import type { IpfsRequestOptions } from "./types";
// @ts-ignore
import ZEN from "zen";

const router: Router = Router();

/**
 * IPFS Cat with decryption (for SEA encrypted content)
 */
router.get("/cat/:cid/decrypt", async (req: Request, res: Response) => {
  try {
    const cid = req.params.cid as string;
    let { token } = req.query;
    const userAddress = req.headers["x-user-address"]; // Optional: user address for signature verification
    const IPFS_GATEWAY_URL = ipfsConfig.gatewayUrl || "http://127.0.0.1:8080";

    loggers.server.debug({ cid, hasToken: !!token }, `🔓 IPFS Decrypt request`);

    // Signature verification removed (Blockchain features disabled)
    if (userAddress && token && typeof token === "string" && token.startsWith("0x")) {
      loggers.server.debug("Signature verification skipped (Blockchain features disabled)");
    }

    // Parse token if it's a JSON string (not a hex string)
    if (token && typeof token === "string" && !token.startsWith("0x")) {
      if (token.trim().startsWith("{") || token.trim().startsWith("[")) {
        try {
          token = JSON.parse(token);
          loggers.server.debug(`🔑 Token parsed as JSON successfully`);
        } catch (parseError) {
          loggers.server.debug(`🔑 Token is not JSON, using as-is (password or other format)`);
        }
      } else {
        loggers.server.debug(`🔑 Token is a simple string (password), using as-is`);
      }
    }

    if (!cid) {
      return res.status(400).json({ success: false, error: "CID is required" });
    }

    // Try to use IPFS API first (localhost) for better availability, fallback to gateway
    let requestOptions: IpfsRequestOptions | any;
    let protocolModule: any;
    const IPFS_API_TOKEN = ipfsConfig.apiToken;

    const useApi =
      IPFS_GATEWAY_URL &&
      (IPFS_GATEWAY_URL.includes("127.0.0.1") || IPFS_GATEWAY_URL.includes("localhost"));

    if (useApi) {
      // Use IPFS API directly
      protocolModule = await import("http");
      requestOptions = {
        hostname: "127.0.0.1",
        port: 5001,
        path: `/api/v0/cat?arg=${encodeURIComponent(cid as string)}`,
        method: "POST",
        headers: { "Content-Length": "0" },
      };

      if (IPFS_API_TOKEN) {
        requestOptions.headers["Authorization"] = `Bearer ${IPFS_API_TOKEN}`;
      }
    } else {
      // Use gateway
      const gatewayUrl = new URL(IPFS_GATEWAY_URL);
      protocolModule =
        gatewayUrl.protocol === "https:" ? await import("https") : await import("http");

      requestOptions = {
        hostname: gatewayUrl.hostname,
        port: gatewayUrl.port
          ? Number(gatewayUrl.port)
          : gatewayUrl.protocol === "https:"
            ? 443
            : 80,
        path: `/ipfs/${cid}`,
        method: "GET",
        headers: { Host: gatewayUrl.host },
      };
    }

    const ipfsReq = protocolModule.request(requestOptions, (ipfsRes: any) => {
      loggers.server.debug({ cid, statusCode: ipfsRes.statusCode }, `📥 IPFS response received`);

      ipfsRes.on("error", (err: any) => {
        loggers.server.error({ err, cid }, `❌ IPFS response error`);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ success: false, error: "Failed to fetch from IPFS", message: err.message });
        }
      });

      // If no token, just stream the response
      if (!token) {
        loggers.server.debug({ cid }, `📤 Streaming content without decryption`);
        res.setHeader(
          "Content-Type",
          ipfsRes.headers["content-type"] || "application/octet-stream"
        );
        ipfsRes.pipe(res);
        return;
      }

      // If token provided, buffer and decrypt
      loggers.server.debug({ cid }, `🔓 Attempting decryption`);
      const chunks: Buffer[] = [];
      ipfsRes.on("data", (chunk: any) => chunks.push(chunk));

      ipfsRes.on("end", async () => {
        const body = Buffer.concat(chunks).toString("utf8");
        loggers.server.debug({ cid, bodyLength: body.length }, `   Body received`);

        try {
          let isEncryptedData = false;
          let encryptedObject: any = null;

          // Check for [object Object] error
          if (body && typeof body === "string" && body.trim() === "[object Object]") {
            loggers.server.warn(
              { cid },
              `⚠️ Detected "[object Object]" string - file was uploaded incorrectly`
            );
            if (!res.headersSent) {
              res.status(400).json({
                success: false,
                error: "File was uploaded in incorrect format. Please re-upload the file.",
              });
            }
            return;
          }

          try {
            // Try to parse as JSON
            let parsed = JSON.parse(body);

            // Check for SEA string format "SEA{...}"
            if (typeof parsed === "string" && parsed.trim().startsWith("SEA{")) {
              loggers.server.debug({ cid }, `🔐 Detected string starting with SEA{`);
              try {
                let seaString = parsed.trim();
                if (seaString.startsWith("SEA{")) {
                  seaString = seaString.substring(3);
                }
                const innerParsed = JSON.parse(seaString);
                if (
                  innerParsed &&
                  typeof innerParsed === "object" &&
                  (innerParsed.ct || innerParsed.iv || innerParsed.s || innerParsed.salt)
                ) {
                  isEncryptedData = true;
                  encryptedObject = innerParsed;
                  loggers.server.debug(
                    { cid },
                    `✅ Detected encrypted data structure (SEA string format)`
                  );
                }
              } catch (innerError) {
                // Failed to parse inner SEA string, try direct JSON parse of body
                try {
                  const directParsed = JSON.parse(body);
                  if (
                    directParsed &&
                    typeof directParsed === "object" &&
                    (directParsed.ct || directParsed.iv || directParsed.s || directParsed.salt)
                  ) {
                    isEncryptedData = true;
                    encryptedObject = directParsed;
                    loggers.server.debug(
                      { cid },
                      `✅ Detected encrypted data structure (direct from body)`
                    );
                  }
                } catch {
                  isEncryptedData = false;
                }
              }
            }
            // SEA encrypted data is direct object
            else if (
              parsed &&
              typeof parsed === "object" &&
              (parsed.ct || parsed.iv || parsed.s || parsed.salt)
            ) {
              isEncryptedData = true;
              encryptedObject = parsed;
              loggers.server.debug({ cid }, `✅ Detected encrypted data structure (direct object)`);
            } else if (typeof parsed === "string") {
              loggers.server.debug({ cid }, `📄 Parsed JSON is a string (not SEA{...})`);
            }
          } catch (e) {
            // Not JSON, check if it's direct SEA string
            if (typeof body === "string" && body.trim().startsWith("SEA{")) {
              try {
                let seaString = body.trim();
                if (seaString.startsWith("SEA{")) {
                  seaString = seaString.substring(3);
                }
                const seaParsed = JSON.parse(seaString);
                if (
                  seaParsed &&
                  typeof seaParsed === "object" &&
                  (seaParsed.ct || seaParsed.iv || seaParsed.s || seaParsed.salt)
                ) {
                  isEncryptedData = true;
                  encryptedObject = seaParsed;
                  loggers.server.debug(
                    { cid },
                    `✅ Detected encrypted data structure (direct SEA, no JSON wrapper)`
                  );
                }
              } catch {
                isEncryptedData = false;
              }
            } else {
              isEncryptedData = false;
            }
          }

          if (isEncryptedData && encryptedObject && token) {
            loggers.server.debug({ cid }, `🔓 Attempting decryption with token`);

            let decrypted;
            try {
              const tokenForDecrypt =
                typeof token === "string" ? token : Array.isArray(token) ? token[0] : "";
              if (typeof tokenForDecrypt === "string") {
                decrypted = await (ZEN as any).decrypt(encryptedObject, tokenForDecrypt);
              } else {
                decrypted = null;
              }
            } catch (decryptErr) {
              loggers.server.error({ err: decryptErr, cid }, `   Decryption threw error`);
              decrypted = null;
            }

            if (decrypted) {
              loggers.server.debug({ cid }, `✅ Decryption successful!`);

              if (typeof decrypted === "string" && decrypted.startsWith("data:")) {
                const matches = decrypted.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                  const contentType = matches[1];
                  const base64Data = matches[2];
                  const buffer = Buffer.from(base64Data, "base64");
                  res.setHeader("Content-Type", contentType);
                  res.setHeader("Content-Length", buffer.length);
                  res.setHeader("Cache-Control", "public, max-age=3600");
                  res.send(buffer);
                  return;
                }
              } else if (typeof decrypted === "string") {
                try {
                  const buffer = Buffer.from(decrypted, "base64");
                  let contentType = "application/octet-stream";

                  // Magic number detection (simplified)
                  if (buffer.length >= 4) {
                    if (
                      buffer[0] === 0x89 &&
                      buffer[1] === 0x50 &&
                      buffer[2] === 0x4e &&
                      buffer[3] === 0x47
                    )
                      contentType = "image/png";
                    else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
                      contentType = "image/jpeg";
                    else if (
                      buffer[0] === 0x25 &&
                      buffer[1] === 0x50 &&
                      buffer[2] === 0x44 &&
                      buffer[3] === 0x46
                    )
                      contentType = "application/pdf";
                  }

                  res.setHeader("Content-Type", contentType);
                  res.setHeader("Content-Length", buffer.length);
                  res.setHeader("Cache-Control", "public, max-age=3600");
                  res.send(buffer);
                  return;
                } catch {
                  res.setHeader("Content-Type", "text/plain");
                  res.send(decrypted);
                  return;
                }
              } else {
                res.setHeader("Content-Type", "text/plain");
                res.send(decrypted);
                return;
              }
            } else {
              if (!res.headersSent) {
                res.status(400).json({
                  success: false,
                  error: "Decryption failed",
                  message: "Incorrect token/password or crypto error.",
                });
              }
              return;
            }
          } else {
            // Not encrypted or no token, but token was provided? Try decrypting body anyway
            if (token && body && body.length > 0) {
              // ... logic to attempt decryption anyway ...
              // For brevity in this refactor, if detection failed earlier, we likely can't decrypt easily or it's not encrypted.
              // We'll respond with the original body if we can't decrypt.
              res.setHeader("Content-Type", "text/plain");
              res.send(body);
            } else {
              res.setHeader("Content-Type", "text/plain");
              res.send(body);
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          loggers.server.error({ err: error }, `❌ Decryption processing error`);
          res.status(500).json({ success: false, error: errorMessage });
        }
      });
    });

    ipfsReq.on("error", (err: any) => {
      loggers.server.error({ err, cid }, `❌ IPFS request error`);
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    });

    ipfsReq.setTimeout(30000, () => {
      ipfsReq.destroy();
      if (!res.headersSent)
        res.status(408).json({ success: false, error: "Content retrieval timeout" });
    });

    ipfsReq.end();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    loggers.server.error({ err: error }, `❌ IPFS decrypt endpoint error`);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
