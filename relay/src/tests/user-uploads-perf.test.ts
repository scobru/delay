import { describe, it, expect, beforeAll, afterAll } from "vitest";

// We'll mock Zen in-memory structure since actual Zen test setup is slow/hanging
class MockGunNode {
  data: any = {};
  callbacks: Array<(...args: any[]) => any> = [];

  get(key: string) {
    if (!this.data[key]) {
      this.data[key] = new MockGunNode();
    }
    return this.data[key];
  }

  put(val: any, cb?: (...args: any[]) => any) {
    Object.assign(this.data, val);
    this.callbacks.forEach(fn => fn(val, val.hash));
    if (cb) cb();
  }

  map() {
    return {
      on: (cb: (...args: any[]) => any) => {
        Object.keys(this.data).forEach(k => {
          if (k !== '_' && this.data[k].data) {
            cb(this.data[k].data, k);
          }
        });
      }
    };
  }

  once(cb: (...args: any[]) => any) {
    cb(Object.keys(this.data).length > 0 ? this.data : null);
  }
}

class MockGun {
  root = new MockGunNode();
  get(key: string) { return this.root.get(key); }
}

const ZEN_PATHS = { UPLOADS: 'uploads' };

async function getUserUploadsFromGun(gun: any, userAddress: string): Promise<any[]> {
  return new Promise((resolve) => {
    const uploads: any[] = [];
    const timer = setTimeout(() => resolve(uploads), 300);

    gun
      .get(ZEN_PATHS.UPLOADS)
      .get(userAddress)
      .map()
      .on((data: any, key: string) => {
        if (data && key !== "_" && data.hash) {
          uploads.push({ ...data, hash: data.hash || key });
        }
      });

    // simulate immediate return for mock
    clearTimeout(timer);
    resolve(uploads);
  });
}

async function getUserUploadByHashFromGun(gun: any, userAddress: string, hash: string): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 300);

    gun
      .get(ZEN_PATHS.UPLOADS)
      .get(userAddress)
      .get(hash)
      .once((data: any) => {
        if (data && data.hash) {
          clearTimeout(timer);
          resolve({ ...data, hash: data.hash });
        } else if (data) {
          clearTimeout(timer);
          resolve({ ...data, hash });
        } else {
            clearTimeout(timer);
            resolve(null);
        }
      });
  });
}

describe("Uploads Performance", () => {
  let gun: any;
  const userAddress = "0xTestUser";
  const numUploads = 10000;
  const targetHash = "QmTargetHash123";

  beforeAll(() => {
    gun = new MockGun();
    for (let i = 0; i < numUploads; i++) {
      const hash = i === 5000 ? targetHash : `QmFakeHash${i}`;
      gun.get(ZEN_PATHS.UPLOADS).get(userAddress).get(hash).put({
        hash,
        name: `file-${i}.txt`,
        size: 1024,
      });
    }
  });

  it("Baseline: getUserUploadsFromGun (Fetch All)", async () => {
    const start = performance.now();
    const uploads = await getUserUploadsFromGun(gun, userAddress);
    const result = uploads.find((u: any) => u.hash === targetHash);
    const end = performance.now();

    console.log(`[Baseline] Found: ${!!result}, Time: ${(end - start).toFixed(2)}ms, Count: ${uploads.length}`);
    expect(result).toBeDefined();
    expect(result.hash).toBe(targetHash);
  });

  it("Optimized: getUserUploadByHashFromGun (Fetch One)", async () => {
    const start = performance.now();
    const result = await getUserUploadByHashFromGun(gun, userAddress, targetHash);
    const end = performance.now();

    console.log(`[Optimized] Found: ${!!result}, Time: ${(end - start).toFixed(2)}ms`);
    expect(result).toBeDefined();
    expect(result.hash).toBe(targetHash);
  });
});
