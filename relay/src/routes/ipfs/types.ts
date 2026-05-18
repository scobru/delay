import type { Request } from "express";

/**
 * Extended Request interface with custom properties for IPFS routes
 */
export interface CustomRequest extends Request {
  authType?: "admin" | "user";
  userAddress?: string;
  isDealUpload?: boolean;
  subscription?: {
    active: boolean;
    tier?: string;
    storageMB?: number;
    storageUsedMB?: number;
    storageRemainingMB?: number;
    reason?: string;
  };
  verifiedStorage?: {
    allowed: boolean;
    reason?: string;
    storageUsedMB?: number;
    storageRemainingMB?: number;
    storageTotalMB?: number;
    currentTier?: string;
    verified?: boolean;
    requiresUpgrade?: boolean;
  };
}

/**
 * Standard IPFS request options type
 */
export interface IpfsRequestOptions {
  hostname: string;
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
}


