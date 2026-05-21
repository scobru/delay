import { loggers } from "./logger";
import { packageConfig } from "../config/env-config";

export interface PeerStats {
  id: string;
  addr: string;
  engine: "gun" | "zen";
  connectedAt: number;
  msgCount: number;
  bytesSent: number;
  uptime: number; // calculated on demand
}

export interface MetricPoint {
  ts: number;
  v: number;
  zen: number;
  gun: number;
}

export class StatsTracker {
  private startTime = Date.now();
  private totalMessages = 0;
  private totalBytes = 0;
  private peers = new Map<string, PeerStats>();
  private msgHistory: MetricPoint[] = []; // 120 ticks rolling buffer
  private byteHistory: MetricPoint[] = []; // 120 ticks rolling buffer
  private peakPeers = 0;
  private putCount = 0;
  private getCount = 0;
  private ackCount = 0;
  private errorCount = 0;

  // Engine specific stats
  private zenPeers = 0;
  private gunPeers = 0;

  private tickMsgs = 0;
  private tickBytes = 0;
  private zenTickMsgs = 0;
  private gunTickMsgs = 0;
  private zenTickBytes = 0;
  private gunTickBytes = 0;
  private timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => this.tick(), 1000);
  }

  private pushHistory(arr: MetricPoint[], value: number, zen: number, gun: number) {
    arr.push({ ts: Date.now(), v: value, zen, gun });
    if (arr.length > 120) arr.shift();
  }

  private tick() {
    this.pushHistory(this.msgHistory, this.tickMsgs, this.zenTickMsgs, this.gunTickMsgs);
    this.pushHistory(this.byteHistory, this.tickBytes, this.zenTickBytes, this.gunTickBytes);
    this.tickMsgs = 0;
    this.tickBytes = 0;
    this.zenTickMsgs = 0;
    this.gunTickMsgs = 0;
    this.zenTickBytes = 0;
    this.gunTickBytes = 0;
  }

  public patchSocket(socket: any, addr: string, engine?: "gun" | "zen") {
    if (!socket) return;
    
    // Check if already patched
    if (socket.__patchedStats) return;
    socket.__patchedStats = true;

    // Auto-detect engine if not provided
    const resolvedEngine: "gun" | "zen" = engine || (addr.includes('/zen') ? 'zen' : 'gun');

    const id = addr + "_" + Date.now();
    const peer: PeerStats = { id, addr, engine: resolvedEngine, connectedAt: Date.now(), msgCount: 0, bytesSent: 0, uptime: 0 };
    this.peers.set(id, peer);
    
    if (resolvedEngine === "zen") this.zenPeers++;
    else this.gunPeers++;

    if (this.peers.size > this.peakPeers) {
      this.peakPeers = this.peers.size;
    }

    loggers.server.info(`[+] Peer connected: ${addr} (Total: ${this.peers.size})`);

    const origSend = typeof socket.send === "function" ? socket.send.bind(socket) : null;
    if (origSend) {
      socket.send = (data: any, ...args: any[]) => {
        const bytes = typeof data === "string" ? Buffer.byteLength(data) : data?.length || 0;
        peer.bytesSent += bytes;
        this.totalBytes += bytes;
        this.tickBytes += bytes;
        if (resolvedEngine === "zen") this.zenTickBytes += bytes;
        else this.gunTickBytes += bytes;
        return origSend(data, ...args);
      };
    }

    const onMessage = (raw: any) => {
      const bytes = typeof raw === "string" ? Buffer.byteLength(raw) : raw?.length || 0;
      peer.msgCount += 1;
      this.totalMessages += 1;
      this.tickMsgs += 1;
      this.totalBytes += bytes;
      this.tickBytes += bytes;
      if (resolvedEngine === "zen") {
        this.zenTickMsgs += 1;
        this.zenTickBytes += bytes;
      } else {
        this.gunTickMsgs += 1;
        this.gunTickBytes += bytes;
      }

      // OPTIMIZATION: Avoid full JSON.parse for every message
      // GunDB messages usually start with {"put":, {"get":, or contain "@" for acks
      // This reduces CPU load significantly under high traffic
      try {
        if (typeof raw === "string") {
          // Peek into the string instead of full parse
          const start = raw.substring(0, 20); // Get enough to check common keys
          if (start.includes('"put"')) this.putCount++;
          else if (start.includes('"get"')) this.getCount++;
          else if (raw.includes('"@"')) this.ackCount++;
        } else if (raw && typeof raw === "object") {
          if (raw.put) this.putCount++;
          if (raw.get) this.getCount++;
          if (raw["@"]) this.ackCount++;
        }
      } catch (_) {
        this.errorCount++;
      }
    };

    socket.on("message", onMessage);
    
    socket.on("close", () => {
      this.peers.delete(id);
      if (resolvedEngine === "zen") this.zenPeers--;
      else this.gunPeers--;
      loggers.server.info(`[-] Peer disconnected: ${addr} (Total: ${this.peers.size}, Gun: ${this.gunPeers}, Zen: ${this.zenPeers})`);
    });

    socket.on("error", () => {
      this.errorCount++;
    });
  }

  public patchRawSocket(socket: any, addr: string, engine?: "gun" | "zen") {
    if (!socket) return;
    
    // Check if already patched
    if (socket.__patchedStatsRaw) return;
    socket.__patchedStatsRaw = true;

    const resolvedEngine: "gun" | "zen" = engine || (addr.includes('/zen') ? 'zen' : 'gun');

    const id = addr + "_" + Date.now();
    const peer: PeerStats = { id, addr, engine: resolvedEngine, connectedAt: Date.now(), msgCount: 0, bytesSent: 0, uptime: 0 };
    this.peers.set(id, peer);
    
    if (resolvedEngine === "zen") this.zenPeers++;
    else this.gunPeers++;

    if (this.peers.size > this.peakPeers) {
      this.peakPeers = this.peers.size;
    }

    loggers.server.info(`[+] Raw Proxy Peer connected: ${addr} (Total: ${this.peers.size})`);

    const origWrite = typeof socket.write === "function" ? socket.write.bind(socket) : null;
    if (origWrite) {
      socket.write = (data: any, ...args: any[]) => {
        const bytes = typeof data === "string" ? Buffer.byteLength(data) : data?.length || 0;
        peer.bytesSent += bytes;
        this.totalBytes += bytes;
        this.tickBytes += bytes;
        if (resolvedEngine === "zen") this.zenTickBytes += bytes;
        else this.gunTickBytes += bytes;
        return origWrite(data, ...args);
      };
    }

    const onData = (chunk: Buffer) => {
      const bytes = chunk.length || 0;
      // Approximate messages: assuming 1 chunk = 1 message
      peer.msgCount += 1;
      this.totalMessages += 1;
      this.tickMsgs += 1;
      this.totalBytes += bytes;
      this.tickBytes += bytes;
      if (resolvedEngine === "zen") {
        this.zenTickMsgs += 1;
        this.zenTickBytes += bytes;
      } else {
        this.gunTickMsgs += 1;
        this.gunTickBytes += bytes;
      }
    };

    socket.on("data", onData);
    
    socket.on("close", () => {
      this.peers.delete(id);
      if (resolvedEngine === "zen") this.zenPeers--;
      else this.gunPeers--;
      loggers.server.info(`[-] Raw Proxy Peer disconnected: ${addr} (Total: ${this.peers.size}, Gun: ${this.gunPeers}, Zen: ${this.zenPeers})`);
    });

    socket.on("error", () => {
      this.errorCount++;
    });
  }

  public getStats() {
    const now = Date.now();
    const uptimeMs = now - this.startTime;
    
    const peersArr = Array.from(this.peers.values()).map(p => ({
      ...p,
      uptime: now - p.connectedAt
    }));

    const memoryUsage = process.memoryUsage();

    return {
      success: true,
      timestamp: now,
      version: packageConfig.version || "1.0.0",
      uptime: uptimeMs,
      totalMessages: this.totalMessages,
      totalBytes: this.totalBytes,
      connectedPeers: this.peers.size,
      gunPeers: this.gunPeers,
      zenPeers: this.zenPeers,
      peakPeers: this.peakPeers,
      putCount: this.putCount,
      getCount: this.getCount,
      ackCount: this.ackCount,
      errorCount: this.errorCount,
      msgHistory: this.msgHistory,
      byteHistory: this.byteHistory,
      peers: peersArr,
      
      // Legacy structure for existing React components (mapped to new values)
      up: { time: uptimeMs },
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
      cpu: process.cpuUsage(),
      dam: {
        in: {
          rate: this.msgHistory.length > 0 ? this.msgHistory[this.msgHistory.length - 1].v : 0,
          count: this.totalMessages
        },
        out: {
          rate: this.byteHistory.length > 0 ? this.byteHistory[this.byteHistory.length - 1].v : 0,
          count: this.totalBytes
        }
      }
    };
  }

  public destroy() {
    clearInterval(this.timer);
  }
}
