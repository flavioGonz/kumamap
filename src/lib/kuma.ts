import { io, Socket } from "socket.io-client";
import type { KumaMonitor, KumaHeartbeat } from "./types";
import { onHeartbeat as pushOnHeartbeat } from "./push-sender";

// Re-export types for backward compatibility
export type { KumaMonitor, KumaHeartbeat } from "./types";

const MAX_HISTORY = 1440; // Keep last 1440 heartbeats per monitor (~24h at 60s intervals)

class KumaClient {
  private socket: Socket | null = null;
  private monitors: Map<number, KumaMonitor> = new Map();
  private heartbeats: Map<number, KumaHeartbeat> = new Map();
  private heartbeatHistory: Map<number, KumaHeartbeat[]> = new Map();
  private connected = false;
  private authenticated = false;
  private initPromise: Promise<void> | null = null;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private kumaUrl: string = "";
  private lastConnectAt: string | null = null;
  private lastDisconnectAt: string | null = null;
  private lastAuthAt: string | null = null;
  private lastError: string | null = null;
  private connectAttempts = 0;

  get isConnected() {
    return this.connected && this.authenticated;
  }

  /** Diagnostic info for health/debug endpoints */
  getDiagnostics() {
    return {
      kumaUrl: this.kumaUrl.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@"), // hide credentials in URL
      connected: this.connected,
      authenticated: this.authenticated,
      isConnected: this.isConnected,
      socketConnected: this.socket?.connected ?? false,
      socketId: this.socket?.id ?? null,
      monitors: this.monitors.size,
      connectAttempts: this.connectAttempts,
      lastConnectAt: this.lastConnectAt,
      lastDisconnectAt: this.lastDisconnectAt,
      lastAuthAt: this.lastAuthAt,
      lastError: this.lastError,
      pollingActive: this.pollIntervalId !== null,
      hasInitPromise: this.initPromise !== null,
    };
  }

  /** Force reconnect — destroys current socket and creates a fresh connection */
  forceReconnect(): void {
    console.log("[Kuma] Force reconnect requested");
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.initPromise = null; // Allow connect() to run again
    this.lastError = null;

    const url = process.env.KUMA_URL;
    const user = process.env.KUMA_USER;
    const pass = process.env.KUMA_PASS;
    if (url && user && pass) {
      this.connect(url, user, pass);
    } else {
      console.error("[Kuma] Force reconnect failed: missing KUMA_URL/KUMA_USER/KUMA_PASS env vars");
      this.lastError = "Missing env vars: KUMA_URL, KUMA_USER, or KUMA_PASS";
    }
  }

  connect(url: string, username: string, password: string): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.kumaUrl = url;

    this.initPromise = new Promise((resolve) => {
      console.log(`[Kuma] Connecting to ${url}...`);

      this.socket = io(url, {
        reconnection: true,
        reconnectionDelay: 5000,
        reconnectionAttempts: Infinity,
        transports: ["websocket"],
      });

      const startPolling = () => {
        if (this.pollIntervalId) clearInterval(this.pollIntervalId);
        this.pollIntervalId = setInterval(() => {
          if (this.socket && this.authenticated) {
            this.socket.emit("getMonitorList", (res: any) => {
              if (res?.ok && res.data) {
                const data: Record<string, any> = res.data;
                const newIds = new Set(Object.keys(data).map((k) => parseInt(k)));
                for (const existingId of this.monitors.keys()) {
                  if (!newIds.has(existingId)) this.monitors.delete(existingId);
                }
                for (const [id, monitor] of Object.entries(data)) {
                  const mid = parseInt(id);
                  if (isNaN(mid)) continue;
                  const existing = this.monitors.get(mid);
                  const hb = this.heartbeats.get(mid);
                  const effectiveStatus2 = existing?.status ?? hb?.status ?? monitor.status;
                  this.monitors.set(mid, {
                    id: mid,
                    name: monitor.name,
                    type: monitor.type,
                    url: monitor.url || "",
                    hostname: monitor.hostname || "",
                    port: monitor.port || 0,
                    interval: monitor.interval || 60,
                    active: monitor.active !== false,
                    parent: monitor.parent ?? null,
                    tags: (monitor.tags || []).map((t: any) => ({ name: t.name, color: t.color })),
                    status: effectiveStatus2,
                    ping: existing?.ping ?? hb?.ping ?? null,
                    msg: existing?.msg ?? hb?.msg ?? "",
                    uptime24: existing?.uptime24,
                    downTime: effectiveStatus2 === 0 ? (existing?.downTime ?? hb?.time) : undefined,
                  });
                }
              }
            });
          }
        }, 30000);
      };

      const doLogin = (cb?: () => void) => {
        this.socket!.emit(
          "login",
          { username, password, token: "" },
          (res: any) => {
            if (res.ok) {
              console.log("[Kuma] Authenticated successfully");
              this.authenticated = true;
              this.lastAuthAt = new Date().toISOString();
              this.lastError = null;
              startPolling(); // Restart polling after every successful auth
            } else {
              const errMsg = `Auth failed: ${res.msg || "unknown"}`;
              console.error(`[Kuma] ${errMsg}`);
              this.authenticated = false;
              this.lastError = errMsg;
            }
            cb?.();
          }
        );
      };

      // "connect" fires on BOTH initial connection and reconnections in Socket.IO v4
      this.socket.on("connect", () => {
        const wasConnected = this.connected;
        this.connected = true;
        this.connectAttempts++;
        this.lastConnectAt = new Date().toISOString();
        console.log(`[Kuma] Socket ${wasConnected ? "re" : ""}connected (attempt #${this.connectAttempts}), authenticating...`);
        doLogin(() => resolve());
      });

      this.socket.on(
        "monitorList",
        (data: Record<string, any>) => {
          // Rebuild full list (handles additions AND deletions)
          const newIds = new Set(Object.keys(data).map((k) => parseInt(k)));
          // Remove monitors that no longer exist
          for (const existingId of this.monitors.keys()) {
            if (!newIds.has(existingId)) this.monitors.delete(existingId);
          }
          for (const [id, monitor] of Object.entries(data)) {
            const mid = parseInt(id);
            const hb = this.heartbeats.get(mid);
            const effectiveStatus = hb?.status ?? monitor.status;
            this.monitors.set(mid, {
              id: mid,
              name: monitor.name,
              type: monitor.type,
              url: monitor.url || "",
              hostname: monitor.hostname || "",
              port: monitor.port || 0,
              interval: monitor.interval || 60,
              active: monitor.active !== false,
              parent: monitor.parent ?? null,
              tags: (monitor.tags || []).map((t: any) => ({
                name: t.name,
                color: t.color,
              })),
              status: effectiveStatus,
              ping: hb?.ping ?? null,
              msg: hb?.msg ?? "",
              // If monitor is currently DOWN, seed downTime from the latest heartbeat time
              downTime: effectiveStatus === 0 && hb?.time ? hb.time : undefined,
            });
          }
        }
      );

      this.socket.on("heartbeat", (data: KumaHeartbeat) => {
        this.heartbeats.set(data.monitorID, data);
        const monitor = this.monitors.get(data.monitorID);
        if (monitor) {
          const wasDown = monitor.status === 0;
          monitor.status = data.status;
          monitor.ping = data.ping;
          monitor.msg = data.msg;
          if (data.status === 0) {
            // DOWN: keep existing downTime (preserve streak start), or seed it now
            if (!wasDown || !monitor.downTime) monitor.downTime = data.time;
          } else {
            // UP / pending / maintenance: clear downtime streak
            monitor.downTime = undefined;
          }
        }
        // Store history
        const history = this.heartbeatHistory.get(data.monitorID) || [];
        history.push(data);
        if (history.length > MAX_HISTORY) history.shift();
        this.heartbeatHistory.set(data.monitorID, history);

        // Send push notification on status change
        try {
          pushOnHeartbeat(data.monitorID, monitor?.name || `Monitor #${data.monitorID}`, data.status, data.msg, data.ping);
        } catch {}

        // If heartbeat arrives for unknown monitor, request updated list
        if (!monitor && this.authenticated) {
          this.socket!.emit("getMonitorList", () => {});
        }
      });

      this.socket.on(
        "uptime",
        (monitorId: number, period: number, uptime: number) => {
          if (period === 24) {
            const monitor = this.monitors.get(monitorId);
            if (monitor) monitor.uptime24 = uptime;
          }
        }
      );

      // Also listen for individual monitor additions/edits
      this.socket.on("monitorListDesktop", (data: Record<string, any>) => {
        // Same handler as monitorList — Kuma uses this event in some versions
        for (const [id, monitor] of Object.entries(data)) {
          const mid = parseInt(id);
          if (isNaN(mid)) continue;
          const hb = this.heartbeats.get(mid);
          const existing = this.monitors.get(mid);
          const effectiveStatus = hb?.status ?? monitor.status;
          this.monitors.set(mid, {
            id: mid,
            name: monitor.name,
            type: monitor.type,
            url: monitor.url || "",
            hostname: monitor.hostname || "",
            port: monitor.port || 0,
            interval: monitor.interval || 60,
            active: monitor.active !== false,
            parent: monitor.parent ?? null,
            tags: (monitor.tags || []).map((t: any) => ({ name: t.name, color: t.color })),
            status: effectiveStatus,
            ping: hb?.ping ?? null,
            msg: hb?.msg ?? "",
            // Preserve existing downTime if still DOWN, or seed from heartbeat
            downTime: effectiveStatus === 0 ? (existing?.downTime ?? hb?.time) : undefined,
          });
        }
      });

      this.socket.on("disconnect", (reason: string) => {
        console.log(`[Kuma] Disconnected (reason: ${reason})`);
        this.connected = false;
        this.authenticated = false;
        this.lastDisconnectAt = new Date().toISOString();
        this.lastError = `Disconnected: ${reason}`;
        if (this.pollIntervalId) { clearInterval(this.pollIntervalId); this.pollIntervalId = null; }
      });

      this.socket.on("connect_error", (err: Error) => {
        console.error("[Kuma] Connection error:", err.message);
        this.connected = false;
        this.authenticated = false;
        this.lastError = `connect_error: ${err.message}`;
        resolve(); // Don't block forever
      });

      // Timeout after 10s
      setTimeout(() => resolve(), 10000);
    });

    return this.initPromise;
  }

  getMonitors(): KumaMonitor[] {
    return Array.from(this.monitors.values());
  }

  getMonitor(id: number): KumaMonitor | undefined {
    return this.monitors.get(id);
  }

  getHistory(monitorId: number): KumaHeartbeat[] {
    return this.heartbeatHistory.get(monitorId) || [];
  }

  /** Get recent heartbeats for ALL monitors (last N beats each) */
  getAllHistory(count: number = 50): Record<number, KumaHeartbeat[]> {
    const result: Record<number, KumaHeartbeat[]> = {};
    for (const [id, beats] of this.heartbeatHistory) {
      result[id] = beats.slice(-count);
    }
    return result;
  }

  /** Fetch notification providers configured in Uptime Kuma */
  getNotifications(): Promise<{ id: number; name: string; type: string }[]> {
    if (!this.socket || !this.authenticated) return Promise.resolve([]);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve([]), 5000);
      this.socket!.emit("getNotificationList", (res: any) => {
        clearTimeout(timeout);
        if (res?.ok && Array.isArray(res.data)) {
          resolve(res.data.map((n: any) => ({ id: n.id, name: n.name, type: n.type })));
        } else {
          resolve([]);
        }
      });
    });
  }

  /** Add a new monitor via the Uptime Kuma socket API */
  addMonitor(data: Record<string, unknown>): Promise<{ ok: boolean; msg?: string; monitorID?: number }> {
    if (!this.socket || !this.authenticated) {
      return Promise.resolve({ ok: false, msg: "Not connected to Uptime Kuma" });
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, msg: "Timeout adding monitor" }), 10000);
      this.socket!.emit("add", data, (res: any) => {
        clearTimeout(timeout);
        // Force refresh monitor list so getMonitors() returns the new one immediately
        if (res?.ok && this.socket) {
          this.socket.emit("getMonitorList", () => {});
        }
        resolve({ ok: !!res?.ok, msg: res?.msg, monitorID: res?.monitorID });
      });
    });
  }

  /** Edit an existing monitor */
  editMonitor(data: Record<string, unknown>): Promise<{ ok: boolean; msg?: string }> {
    if (!this.socket || !this.authenticated) {
      return Promise.resolve({ ok: false, msg: "Not connected to Uptime Kuma" });
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, msg: "Timeout editing monitor" }), 10000);
      this.socket!.emit("editMonitor", data, (res: any) => {
        clearTimeout(timeout);
        if (res?.ok && this.socket) this.socket.emit("getMonitorList", () => {});
        resolve({ ok: !!res?.ok, msg: res?.msg });
      });
    });
  }

  /** Delete a monitor by ID */
  deleteMonitor(monitorId: number): Promise<{ ok: boolean; msg?: string }> {
    if (!this.socket || !this.authenticated) {
      return Promise.resolve({ ok: false, msg: "Not connected to Uptime Kuma" });
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, msg: "Timeout deleting monitor" }), 10000);
      this.socket!.emit("deleteMonitor", monitorId, (res: any) => {
        clearTimeout(timeout);
        if (res?.ok) this.monitors.delete(monitorId);
        if (res?.ok && this.socket) this.socket.emit("getMonitorList", () => {});
        resolve({ ok: !!res?.ok, msg: res?.msg });
      });
    });
  }

  /** Pause (disable) a monitor */
  pauseMonitor(monitorId: number): Promise<{ ok: boolean; msg?: string }> {
    if (!this.socket || !this.authenticated) {
      return Promise.resolve({ ok: false, msg: "Not connected to Uptime Kuma" });
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, msg: "Timeout pausing monitor" }), 10000);
      this.socket!.emit("pauseMonitor", monitorId, (res: any) => {
        clearTimeout(timeout);
        resolve({ ok: !!res?.ok, msg: res?.msg });
      });
    });
  }

  /** Resume (enable) a monitor */
  resumeMonitor(monitorId: number): Promise<{ ok: boolean; msg?: string }> {
    if (!this.socket || !this.authenticated) {
      return Promise.resolve({ ok: false, msg: "Not connected to Uptime Kuma" });
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, msg: "Timeout resuming monitor" }), 10000);
      this.socket!.emit("resumeMonitor", monitorId, (res: any) => {
        clearTimeout(timeout);
        resolve({ ok: !!res?.ok, msg: res?.msg });
      });
    });
  }

  // Fetch historical beats from Kuma DB (cached 5 min per monitor)
  private beatsCache: Map<string, { data: KumaHeartbeat[]; ts: number }> = new Map();
  private CACHE_TTL = 5 * 60 * 1000; // 5 min

  async getMonitorBeats(monitorId: number, hours: number = 24): Promise<KumaHeartbeat[]> {
    const cacheKey = `${monitorId}-${hours}`;
    const cached = this.beatsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached.data;
    }

    if (!this.socket || !this.authenticated) {
      return this.heartbeatHistory.get(monitorId) || [];
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Fallback to in-memory history
        resolve(this.heartbeatHistory.get(monitorId) || []);
      }, 5000);

      this.socket!.emit(
        "getMonitorBeats",
        monitorId,
        hours,
        (res: { ok: boolean; data: any[] }) => {
          clearTimeout(timeout);
          if (res.ok && Array.isArray(res.data)) {
            // Compress: only keep fields we need
            const beats: KumaHeartbeat[] = res.data.map((b: any) => ({
              monitorID: monitorId,
              status: b.status,
              time: b.time,
              msg: b.msg || "",
              ping: b.ping,
              duration: b.duration || 0,
            }));
            this.beatsCache.set(cacheKey, { data: beats, ts: Date.now() });
            resolve(beats);
          } else {
            resolve(this.heartbeatHistory.get(monitorId) || []);
          }
        }
      );
    });
  }

  // Bulk fetch: all monitors in parallel, but throttled
  async getAllBeats(monitorIds: number[], hours: number = 24): Promise<Map<number, KumaHeartbeat[]>> {
    const result = new Map<number, KumaHeartbeat[]>();
    // Process in batches of 5 to not overload Kuma
    const batchSize = 5;
    for (let i = 0; i < monitorIds.length; i += batchSize) {
      const batch = monitorIds.slice(i, i + batchSize);
      const promises = batch.map(async (id) => {
        const beats = await this.getMonitorBeats(id, hours);
        result.set(id, beats);
      });
      await Promise.all(promises);
    }
    return result;
  }
}

// Singleton — share across module boundaries using the `process` object.
// server.ts (compiled by tsx) and Next.js API routes (compiled by webpack/turbopack)
// load separate copies of this module. A plain `let` singleton creates two
// KumaClient instances that compete for the same Uptime Kuma socket —
// whichever connects last wins, leaving the other (and its Socket.IO clients)
// stuck on "disconnected". Attaching to `process` ensures a single instance.
const KUMA_KEY = Symbol.for("kumamap.kumaClient");

export function getKumaClient(): KumaClient {
  if (!(process as any)[KUMA_KEY]) {
    const instance = new KumaClient();
    (process as any)[KUMA_KEY] = instance;
    const url = process.env.KUMA_URL;
    const user = process.env.KUMA_USER;
    const pass = process.env.KUMA_PASS;
    if (url && user && pass) {
      instance.connect(url, user, pass);
    }
  }
  return (process as any)[KUMA_KEY];
}
