/**
 * S3 Store Adapter for Gun Radisk
 *
 * Implements the store interface required by radisk:
 * - get(file, cb): Read data from S3/MinIO
 * - put(file, data, cb): Write data to S3/MinIO
 * - list(cb): List all files (optional)
 *
 * Uses AWS SDK v3 (@aws-sdk/client-s3) for S3-compatible storage (AWS S3, MinIO, etc.)
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { loggers } from "./logger";

const log = loggers.server;

type GetCallback = (err: Error | null, data: string | null) => void;
type PutCallback = (err: Error | null, ok: number | null) => void;
type ListCallback = (file: string | null) => void;

interface S3StoreOptions {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket?: string;
  region?: string;
}

/**
 * Convert stream to string (for AWS SDK v3)
 */
async function streamToString(stream: any): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

class S3Store {
  private client: S3Client;
  private bucket: string;
  private isClosed: boolean;
  private initialized: boolean;
  private cache: { p: Record<string, string>; g: Record<string, GetCallback[]> };

  constructor(options: S3StoreOptions) {
    if (!options.endpoint || !options.accessKeyId || !options.secretAccessKey) {
      throw new Error("S3Store: endpoint, accessKeyId, and secretAccessKey are required");
    }

    this.bucket = options.bucket || "shogun-gun-data";
    this.isClosed = false;
    this.initialized = false;
    this.cache = { p: {}, g: {} };

    // Parse endpoint URL for SSL detection
    const useSSL = options.endpoint.startsWith("https://");

    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region || "us-east-1",
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO and most S3-compatible services
      // Limit concurrent connections to prevent socket exhaustion
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        socketTimeout: 30000,
        socketAcquisitionWarningTimeout: 10000, // Warn only if acquisition takes longer than 10s
        // limit max sockets to prevent 502 overload
        httpsAgent: {
          maxSockets: 250,
          keepAlive: true,
        },
        httpAgent: {
          maxSockets: 250,
          keepAlive: true,
        },
      }),
      ...(useSSL ? {} : { tls: false }),
    });

    log.info({ endpoint: options.endpoint, bucket: this.bucket }, "🪣 S3Store initialized");

    // Initialize bucket in background
    this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      log.info({ bucket: this.bucket }, "🪣 S3 bucket exists");
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          log.info({ bucket: this.bucket }, "🪣 S3 bucket created");
        } catch (createError: any) {
          log.error({ err: createError, bucket: this.bucket }, "Failed to create S3 bucket");
          throw createError;
        }
      } else {
        log.error({ err: error, bucket: this.bucket }, "Failed to check S3 bucket");
        throw error;
      }
    }

    this.initialized = true;
  }

  /**
   * Get data from S3
   * @param file - File name (key)
   * @param cb - Callback(err, data)
   */
  get(file: string, cb: GetCallback): void {
    if (this.isClosed) {
      return cb(null, null);
    }

    // Check put cache first
    const cachedPut = this.cache.p[file];
    if (cachedPut) {
      return cb(null, cachedPut);
    }

    // Check if already fetching
    const pendingCallbacks = this.cache.g[file];
    if (pendingCallbacks) {
      pendingCallbacks.push(cb);
      return;
    }

    // Start new fetch
    const callbacks = (this.cache.g[file] = [cb]);

    this.client
      .send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: file,
        })
      )
      .then(async (response) => {
        delete this.cache.g[file];
        const data = await streamToString(response.Body);

        // Validate JSON before returning
        try {
          JSON.parse(data);
          callbacks.forEach((callback) => callback(null, data));
        } catch (parseErr) {
          log.warn({ file }, "Corrupted JSON data detected in S3 file, skipping");
          callbacks.forEach((callback) => callback(null, null));
        }
      })
      .catch((err) => {
        delete this.cache.g[file];
        // NoSuchKey means file doesn't exist - not an error
        if (err.name === "NoSuchKey" || err.Code === "NoSuchKey") {
          callbacks.forEach((callback) => callback(null, null));
        } else {
          callbacks.forEach((callback) => callback(err, null));
        }
      });
  }

  /**
   * Put data to S3
   * @param file - File name (key)
   * @param data - Data to store (JSON string)
   * @param cb - Callback(err, ok)
   */
  put(file: string, data: string, cb: PutCallback): void {
    if (this.isClosed) {
      return cb(null, 1);
    }

    // Cache the write
    this.cache.p[file] = data;
    delete this.cache.g[file];

    this.client
      .send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: file,
          Body: data,
          ContentType: "application/json",
        })
      )
      .then(() => {
        delete this.cache.p[file];
        cb(null, 1);
      })
      .catch((err) => {
        delete this.cache.p[file];
        cb(err, null);
      });
  }

  /**
   * List all files
   * @param cb - Callback(file) called for each file, then with null when done
   */
  list(cb: ListCallback): void {
    if (this.isClosed) {
      return cb(null);
    }

    this.listRecursive(cb, undefined);
  }

  private listRecursive(cb: ListCallback, continuationToken?: string): void {
    this.client
      .send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
        })
      )
      .then((response) => {
        // Emit each file
        for (const obj of response.Contents || []) {
          if (obj.Key) {
            cb(obj.Key);
          }
        }

        // Continue pagination or signal completion
        if (response.IsTruncated && response.NextContinuationToken) {
          this.listRecursive(cb, response.NextContinuationToken);
        } else {
          cb(null); // Signal completion
        }
      })
      .catch((err) => {
        log.error({ err }, "Error listing S3 objects");
        cb(null); // Signal completion on error
      });
  }

  /**
   * Get storage statistics from S3 bucket
   * @returns Promise with bytes and files count
   */
  async getStorageStats(): Promise<{ bytes: number; files: number }> {
    if (this.isClosed) {
      return { bytes: 0, files: 0 };
    }

    try {
      await this.ensureBucket();

      let totalBytes = 0;
      let fileCount = 0;
      let continuationToken: string | undefined;

      do {
        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            ContinuationToken: continuationToken,
          })
        );

        for (const obj of response.Contents || []) {
          if (obj.Key && obj.Size !== undefined) {
            fileCount++;
            totalBytes += obj.Size;
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return { bytes: totalBytes, files: fileCount };
    } catch (err) {
      log.error({ err }, "Failed to get storage stats from S3");
      return { bytes: 0, files: 0 };
    }
  }

  /**
   * Close the store (cleanup)
   */
  close(): void {
    if (!this.isClosed) {
      this.isClosed = true;
      this.client.destroy();
      log.info("🪣 S3Store closed");
    }
  }
}

export default S3Store;
