import { describe, it, expect, beforeEach } from "vitest";
import {
  saveSystemHash,
  getSystemHash,
  getSystemHashesMap,
  removeSystemHash,
  SystemHashMetadata,
} from "../utils/system-hashes-store";

describe("System Hashes Store", () => {
  const testCid = "QmTestHash123456789ABCDEF";

  beforeEach(async () => {
    await removeSystemHash(testCid);
  });

  it("should save and retrieve file metadata", async () => {
    const meta: SystemHashMetadata = {
      hash: testCid,
      fileName: "my-photo.jpg",
      displayName: "my-photo.jpg",
      originalName: "camera_123.jpg",
      fileSize: 1048576,
      contentType: "image/jpeg",
      isDirectory: false,
      isEncrypted: false,
      timestamp: 1726210000000,
    };

    await saveSystemHash(meta);

    const retrieved = await getSystemHash(testCid);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.fileName).toBe("my-photo.jpg");
    expect(retrieved?.displayName).toBe("my-photo.jpg");
    expect(retrieved?.fileSize).toBe(1048576);
    expect(retrieved?.contentType).toBe("image/jpeg");
    expect(retrieved?.isDirectory).toBe(false);
  });

  it("should list hashes in getSystemHashesMap", async () => {
    const meta: SystemHashMetadata = {
      hash: testCid,
      fileName: "doc.pdf",
      displayName: "doc.pdf",
      fileSize: 2048,
      contentType: "application/pdf",
      isDirectory: false,
      timestamp: Date.now(),
    };

    await saveSystemHash(meta);
    const map = await getSystemHashesMap();
    expect(map[testCid]).toBeDefined();
    expect(map[testCid].fileName).toBe("doc.pdf");
  });

  it("should remove metadata successfully", async () => {
    await saveSystemHash({
      hash: testCid,
      fileName: "to-remove.png",
      displayName: "to-remove.png",
      timestamp: Date.now(),
    });

    const removed = await removeSystemHash(testCid);
    expect(removed).toBe(true);

    const check = await getSystemHash(testCid);
    expect(check).toBeNull();
  });
});
