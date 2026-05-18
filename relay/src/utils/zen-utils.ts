export async function waitForZenData(
  node: any,
  timeoutMs: number = 8000
): Promise<any> {
  return new Promise((resolve) => {
    let resolved = false;

    // Total timeout for synchronization
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          (node as any).off();
        } catch (e) {}
        resolve(null);
      }
    }, timeoutMs);

    // Watch for data arrivals in real-time
    node.on((val: any) => {
      // Specifically wait for a non-empty string, as kfrags are base64 strings.
      // This prevents resolving prematurely with GunDB metadata objects {}.
      if (!resolved && typeof val === 'string' && val.trim().length > 0) {
        resolved = true;
        clearTimeout(timer);
        try {
          (node as any).off();
        } catch (e) {}
        resolve(val);
      }
    });
  });
}

