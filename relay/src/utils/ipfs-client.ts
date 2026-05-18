/**
 * IPFS Client Utility with automatic retry and health checking
 * Handles ECONNREFUSED errors gracefully when IPFS daemon is starting up
 *
 * @module utils/ipfs-client
 */

import http from "http";
import https from "https";
import FormData from "form-data";
import { loggers } from "./logger";
import { ipfsConfig } from "../config";

const log = loggers.ipfs;

const IPFS_API_URL = ipfsConfig.apiUrl || "http://127.0.0.1:5001";
const IPFS_API_TOKEN = ipfsConfig.apiToken;

// Parse IPFS API URL
const url = new URL(IPFS_API_URL);
const isHttps = url.protocol === "https:";
const httpModule = isHttps ? https : http;
const hostname = url.hostname;
const port = parseInt(url.port) || (isHttps ? 443 : 80);

// Cache for IPFS readiness status
interface IpfsReadyCache {
  isReady: boolean;
  lastCheck: number;
  checkInterval: number;
}

let ipfsReadyCache: IpfsReadyCache = {
  isReady: false,
  lastCheck: 0,
  checkInterval: 5000, // Check every 5 seconds
};

/**
 * Check if IPFS daemon is ready
 * @param timeout - Timeout in milliseconds
 * @returns Promise<boolean>
 */
async function checkIpfsReady(timeout: number = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname,
      port,
      path: "/api/v0/version",
      method: "POST",
      headers: { "Content-Length": "0" },
      timeout,
    };

    if (IPFS_API_TOKEN) {
      const headers = (options.headers || {}) as Record<
        string,
        string | string[] | number | undefined
      >;
      options.headers = {
        ...headers,
        Authorization: `Bearer ${IPFS_API_TOKEN}`,
      };
    }

    const req = httpModule.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Wait for IPFS to be ready with exponential backoff
 * @param maxWaitTime - Maximum time to wait in milliseconds (default: 30s)
 * @param initialDelay - Initial delay in milliseconds (default: 500ms)
 * @returns Promise<boolean> True if IPFS is ready, false if timeout
 */
async function waitForIpfs(
  maxWaitTime: number = 30000,
  initialDelay: number = 500
): Promise<boolean> {
  const startTime = Date.now();
  let delay = initialDelay;
  const maxDelay = 2000; // Max 2 seconds between retries

  while (Date.now() - startTime < maxWaitTime) {
    const isReady = await checkIpfsReady(1000);
    if (isReady) {
      ipfsReadyCache.isReady = true;
      ipfsReadyCache.lastCheck = Date.now();
      return true;
    }

    // Exponential backoff with max cap
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }

  return false;
}

interface IpfsRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  waitForReady?: boolean;
  responseType?: "arraybuffer" | "json" | "text";
}

/**
 * Make an IPFS API request with automatic retry on ECONNREFUSED
 * @param path - API path (e.g., '/api/v0/version')
 * @param options - Request options
 * @returns Promise<Object|string|Buffer> Response data (parsed JSON or raw string)
 */
async function ipfsRequest(
  path: string,
  options: IpfsRequestOptions = {}
): Promise<Record<string, any> | string | Buffer> {
  const {
    method = "POST",
    headers = {},
    timeout = 60000,
    maxRetries = 3,
    retryDelay = 1000,
    waitForReady = true,
  } = options;

  // Check cache first (if recent check)
  const cacheAge = Date.now() - ipfsReadyCache.lastCheck;
  if (waitForReady && (!ipfsReadyCache.isReady || cacheAge > ipfsReadyCache.checkInterval)) {
    const isReady = await checkIpfsReady(1000);
    if (!isReady) {
      log.debug("IPFS daemon not ready, waiting...");
      const ready = await waitForIpfs(10000); // Wait up to 10 seconds
      if (!ready) {
        log.warn("IPFS daemon not ready after waiting, proceeding anyway...");
      }
    }
    ipfsReadyCache.isReady = isReady;
    ipfsReadyCache.lastCheck = Date.now();
  }

  let lastError: Error | undefined;
  let currentDelay = retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise<Record<string, any> | string | Buffer>((resolve, reject) => {
        const requestOptions: http.RequestOptions = {
          hostname,
          port,
          path,
          method,
          headers: {
            "Content-Length": "0",
            ...headers,
          },
          timeout,
        };

        if (IPFS_API_TOKEN) {
          const reqHeaders = (requestOptions.headers || {}) as Record<
            string,
            string | string[] | number | undefined
          >;
          requestOptions.headers = {
            ...reqHeaders,
            Authorization: `Bearer ${IPFS_API_TOKEN}`,
          };
        }

        const req = httpModule.request(requestOptions, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            if (res.statusCode === 200) {
              if (options.responseType === "arraybuffer") {
                resolve(buffer);
              } else {
                const data = buffer.toString();
                try {
                  resolve(JSON.parse(data));
                } catch {
                  resolve(data);
                }
              }
            } else {
              reject(new Error(`IPFS API returned status ${res.statusCode}: ${buffer.toString()}`));
            }
          });
        });

        req.on("error", (err: Error) => {
          reject(err);
        });

        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timeout"));
        });

        req.end();
      });

      // Success - update cache
      ipfsReadyCache.isReady = true;
      ipfsReadyCache.lastCheck = Date.now();
      return result;
    } catch (error: any) {
      lastError = error;

      // Only retry on connection errors (ECONNREFUSED, ECONNRESET, etc.)
      const isConnectionError =
        error.code === "ECONNREFUSED" ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.message?.includes("timeout");

      if (!isConnectionError || attempt === maxRetries) {
        throw error;
      }

      // Update cache on connection error
      ipfsReadyCache.isReady = false;

      log.warn(
        { err: error },
        `IPFS request failed (attempt ${attempt + 1}/${
          maxRetries + 1
        }). Retrying in ${currentDelay}ms...`
      );

      // Wait before retry with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * 1.5, 5000); // Max 5 seconds
    }
  }

  throw lastError;
}

interface IpfsUploadOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Make an IPFS API request with file upload (multipart/form-data)
 * @param path - API path (e.g., '/api/v0/add')
 * @param formData - FormData object with file
 * @param options - Request options
 * @returns Promise<Object> Response data
 */
async function ipfsUpload(
  path: string,
  formData: FormData,
  options: IpfsUploadOptions = {}
): Promise<Record<string, any>> {
  const { timeout = 60000, maxRetries = 3, retryDelay = 1000 } = options;

  // Wait for IPFS to be ready first
  if (
    !ipfsReadyCache.isReady ||
    Date.now() - ipfsReadyCache.lastCheck > ipfsReadyCache.checkInterval
  ) {
    const isReady = await checkIpfsReady(1000);
    if (!isReady) {
      log.debug("IPFS daemon not ready, waiting before upload...");
      await waitForIpfs(10000);
    }
    ipfsReadyCache.isReady = isReady;
    ipfsReadyCache.lastCheck = Date.now();
  }

  let lastError: Error | undefined;
  let currentDelay = retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise<Record<string, any>>((resolve, reject) => {
        const requestOptions: http.RequestOptions = {
          hostname,
          port,
          path,
          method: "POST",
          headers: formData.getHeaders(),
          timeout,
        };

        if (IPFS_API_TOKEN) {
          const reqHeaders = (requestOptions.headers || {}) as Record<
            string,
            string | string[] | number | undefined
          >;
          requestOptions.headers = {
            ...reqHeaders,
            Authorization: `Bearer ${IPFS_API_TOKEN}`,
          };
        }

        const req = httpModule.request(requestOptions, (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode === 200) {
              try {
                // IPFS add returns newline-delimited JSON
                const lines = data.trim().split("\n");
                const lastLine = lines[lines.length - 1];
                resolve(JSON.parse(lastLine));
              } catch (e) {
                reject(new Error(`Failed to parse IPFS response: ${data}`));
              }
            } else {
              reject(new Error(`IPFS upload failed with status ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on("error", (err: Error) => {
          reject(err);
        });

        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Upload timeout"));
        });

        formData.pipe(req);
      });

      // Success
      ipfsReadyCache.isReady = true;
      ipfsReadyCache.lastCheck = Date.now();
      return result;
    } catch (error: any) {
      lastError = error;

      const isConnectionError =
        error.code === "ECONNREFUSED" ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.message?.includes("timeout");

      if (!isConnectionError || attempt === maxRetries) {
        throw error;
      }

      ipfsReadyCache.isReady = false;

      log.warn(
        {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          errorCode: error.code,
          errorMessage: error.message,
          retryDelay: currentDelay,
        },
        `⚠️ IPFS upload failed, retrying`
      );

      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * 1.5, 5000);
    }
  }

  throw lastError;
}

export { ipfsRequest, ipfsUpload };
