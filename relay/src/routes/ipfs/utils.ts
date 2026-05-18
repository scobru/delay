import { ipfsConfig } from "../../config";


// IPFS Configuration
export const IPFS_API_URL: string = ipfsConfig.apiUrl;
export const IPFS_API_TOKEN: string | undefined = ipfsConfig.apiToken;


/**
 * Detect content type from file extension
 */
export function getContentTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    xml: "application/xml",
    zip: "application/zip",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Detect content type from file buffer (magic bytes)
 */
export function detectContentType(buffer: Buffer): string {
  const firstBytes = buffer.slice(0, 512);

  // PNG
  if (
    firstBytes[0] === 0x89 &&
    firstBytes[1] === 0x50 &&
    firstBytes[2] === 0x4e &&
    firstBytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG
  if (firstBytes[0] === 0xff && firstBytes[1] === 0xd8) {
    return "image/jpeg";
  }
  // GIF
  if (firstBytes[0] === 0x47 && firstBytes[1] === 0x49 && firstBytes[2] === 0x46) {
    return "image/gif";
  }
  // PDF
  if (
    firstBytes[0] === 0x25 &&
    firstBytes[1] === 0x50 &&
    firstBytes[2] === 0x44 &&
    firstBytes[3] === 0x46
  ) {
    return "application/pdf";
  }
  // HTML
  if (buffer.slice(0, 5).toString() === "<html" || buffer.slice(0, 9).toString() === "<!DOCTYPE") {
    return "text/html";
  }
  // JSON
  try {
    JSON.parse(buffer.toString());
    return "application/json";
  } catch {
    // Not JSON
  }

  return "application/octet-stream";
}
