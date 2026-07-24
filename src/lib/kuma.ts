import { io, Socket } from "socket.io-client";
import type { KumaMonitor, KumaHeartbeat } from "./types";
import { onHeartbeat as pushOnHeartbeat } from "./push-sender";
import { onHeartbeat as whatsappOnHeartbeat } from "./whatsapp-sender";
import { getMonitorNgVirtualMonitors } from './monitorng';

// Re-export types for backward compatibility
export type { KumaMonitor, KumaHeartbeat } from "./types";

const MAX_HISTORY = 1440; // Keep last 1440 heartbeats per monitor (~24h at 60s intervals)
/** Kuma never ACKing a `login` used to hang the client forever. */
const LOGIN_TIMEOUT_MS = 10_000;
/** How often to check for the "socket connected but never authenticated" state. */
const WATCHDOG_INTERVAL_MS = 30_000;

class KumaClient {
  private socket: Socket | null = null;
  private monitors: Map<number, KumaMonitor> = new Map();
  private heartbeats: Map<number, KumaHeartbeat> = new Map();
  private heartbeatHistory: Map<number, KumaHeartbeat[]> = new Map();
  private connected = false;
  private authenticated = false;
  private initPromise: Promise<void> | null = null;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private watchdogId: ReturnType<typeof setInterval> | null = null;
  private kumaUrl: string = "";
  private lastConnectAt: string | null = null;
  private lastDisconnectAt: string | null = null;
  private lastAuthAt: string | null = null;
  private lastError: string | null = null;
  private connectAttempts = 0;
  /** When the socket came up but auth hasn't completed. Drives the watchdog. */
  private connectedSince: number | null = null;

  get isConnected() {
    return this.connected && this.authenticated;
  }

  /**
   * Drop all cached state for monitors that no longer exist in Kuma.
   *
   * Previously only `this.monitors` was pruned, so `heartbeats`, the per-monitor
   * `heartbeatHistory` arrays, and the beats cache grew forever as monitors were
   * created and deleted — a slow leak on a long-lived process.
   */
  private pruneDeleted(liveIds: Set<number>) {
    for (const id of this.monitors.keys()) {
      if (!liveIds.has(id)) this.monitors.delete(id);
    }
    for (const id of this.heartbeats.keys()) {
      if (!liveIds.has(id)) this.heartbeats.delete(id);
    }
    for (const id of this.heartbeatHistory.keys()) {
      if (!liveIds.has(id)) this.heartbeatHistory.delete(id);
    }
    for (const key of this.beatsCache.keys()) {
      const id = parseInt(key.split("-")[0], 10);
      if (!Number.isNaN(id) && !liveIds.has(id)) this.beatsCache.delete(key);
    }
  }

  /**
   * Merge a monitor record coming from Kuma's list with whatever live state we
   * already hold. Used by BOTH `monitorList` and the 30s reconcile poll, which
   * previously applied different precedence rules and could momentarily flip a
   * monitor's status during a list refresh.
   */
  private mergeMonitor(mid: number, monitor: any): KumaMonitor {
    const existing = this.monitors.get(mid);
    const hb = this.heartbeats.get(mid);

    // A heartbeat is always fresher than a list snapshot; fall back to whatever
    // we already had, and only then to the list's own status field.
    const status = hb?.status ?? existing?.status ?? monitor.status;

    return {
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
      status,
      ping: hb?.ping ?? existing?.ping ?? null,
      msg: hb?.msg ?? existing?.msg ?? "",
      // Preserve the DOWN streak start across list refreshes.
      downTime: status === 0 ? (existing?.downTime ?? hb?.time) : undefined,
      // Carry over data that arrives on separate events (uptime/avgPing/certInfo)
      // — a naive rebuild would wipe it on every list refresh.
      uptime24: existing?.uptime24,
      uptime: existing?.uptime,
      avgPing: existing?.avgPing,
      certExpiryDays: existing?.certExpiryDays,
      certValid: existing?.certValid,
      maintenance: status === 3,
    };
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
    if (this.watchdogId) {
      clearInterval(this.watchdogId);
      this.watchdogId = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.connectedSince = null;
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

      const applyMonitorList = (data: Record<string, any>) => {
        const liveIds = new Set<number>();
        for (const key of Object.keys(data)) {
          const mid = parseInt(key, 10);
          if (!Number.isNaN(mid)) liveIds.add(mid);
        }
        // Prune every cache, not just `monitors` (see pruneDeleted).
        this.pruneDeleted(liveIds);

        for (const [id, monitor] of Object.entries(data)) {
          const mid = parseInt(id, 10);
          if (Number.isNaN(mid)) continue;
          this.monitors.set(mid, this.mergeMonitor(mid, monitor));
        }
      };

      const startPolling = () => {
        if (this.pollIntervalId) clearInterval(this.pollIntervalId);
        // Reconcile the monitor list every 30s — catches renames/additions/
        // deletions that a missed push event would otherwise leave stale.
        this.pollIntervalId = setInterval(() => {
          if (this.socket && this.authenticated) {
            this.socket.emit("getMonitorList", (res: any) => {
              if (res?.ok && res.data) applyMonitorList(res.data);
            });
          }
        }, 30000);
      };

      /**
       * Backfill heartbeat history right after auth.
       *
       * Kuma only pushes *new* heartbeats, so on a fresh boot (or after a Kuma
       * restart) our in-memory history started empty and stayed thin until 1440
       * live beats accumulated — sparklines were blank for hours. Pull the last
       * 24h for every monitor once, in small batches so we don't hammer Kuma.
       */
      const backfillHistory = async () => {
        try {
          const ids = Array.from(this.monitors.keys());
          if (ids.length === 0) return;
          const beats = await this.getAllBeats(ids, 24);
          let filled = 0;
          for (const [id, list] of beats) {
            if (!list.length) continue;
            // Don't clobber live beats that arrived while we were fetching.
            const live = this.heartbeatHistory.get(id) || [];
            const merged = [...list, ...live].slice(-MAX_HISTORY);
            this.heartbeatHistory.set(id, merged);
            filled++;
          }
          console.log(`[Kuma] Historial precargado para ${filled}/${ids.length} monitores`);
        } catch (err) {
          console.error("[Kuma] Backfill de historial falló:", err);
        }
      };

      const doLogin = (cb?: () => void) => {
        let settled = false;

        // A login that never gets ACKed used to leave the client permanently
        // "connected but not authenticated" with no retry path.
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.authenticated = false;
          this.lastError = "Login timeout: Uptime Kuma no respondió";
          console.error("[Kuma] Login timeout — se reintentará por el watchdog");
          cb?.();
        }, LOGIN_TIMEOUT_MS);

        this.socket!.emit("login", { username, password, token: "" }, (res: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          if (res?.ok) {
            console.log("[Kuma] Authenticated successfully");
            this.authenticated = true;
            this.lastAuthAt = new Date().toISOString();
            this.lastError = null;
            startPolling(); // Restart polling after every successful auth

            // Ask for the list immediately, then warm the history cache.
            this.socket!.emit("getMonitorList", (listRes: any) => {
              if (listRes?.ok && listRes.data) applyMonitorList(listRes.data);
              void backfillHistory();
            });
          } else {
            const errMsg = `Auth failed: ${res?.msg || "unknown"}`;
            console.error(`[Kuma] ${errMsg}`);
            this.authenticated = false;
            this.lastError = errMsg;
          }
          cb?.();
        });
      };

      // Watchdog: if the socket is up but auth never landed, force a full
      // reconnect instead of sitting there silently broken.
      if (this.watchdogId) clearInterval(this.watchdogId);
      this.watchdogId = setInterval(() => {
        if (
          this.connected &&
          !this.authenticated &&
          this.connectedSince &&
          Date.now() - this.connectedSince > LOGIN_TIMEOUT_MS * 2
        ) {
          console.warn("[Kuma] Conectado pero sin autenticar — forzando reconexión");
          this.forceReconnect();
        }
      }, WATCHDOG_INTERVAL_MS);

      // "connect" fires on BOTH initial connection and reconnections in Socket.IO v4
      this.socket.on("connect", () => {
        const wasConnected = this.connected;
        this.connected = true;
        this.connectedSince = Date.now();
        this.connectAttempts++;
        this.lastConnectAt = new Date().toISOString();
        console.log(`[Kuma] Socket ${wasConnected ? "re" : ""}connected (attempt #${this.connectAttempts}), authenticating...`);
        doLogin(() => resolve());
      });

      this.socket.on("monitorList", (data: Record<string, any>) => {
        applyMonitorList(data);
      });

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

        // Send WhatsApp alert on status change
        try {
          whatsappOnHeartbeat(data.monitorID, monitor?.name || `Monitor #${data.monitorID}`, data.status, data.msg, data.ping);
        } catch {}

        // If heartbeat arrives for unknown monitor, request updated list
        if (!monitor && this.authenticated) {
          this.socket!.emit("getMonitorList", () => {});
        }
      });

      // Kuma emits uptime for several windows (1h, 24h, 30d, 1y). We used to
      // keep only the 24h figure and throw the rest away.
      this.socket.on("uptime", (monitorId: number, period: number, uptime: number) => {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) return;
        monitor.uptime = { ...(monitor.uptime || {}), [period]: uptime };
        if (period === 24) monitor.uptime24 = uptime; // keep the legacy field working
      });

      // Rolling average ping, computed by Kuma. Previously ignored, forcing the
      // report route to recompute it from raw beats.
      this.socket.on("avgPing", (monitorId: number, avgPing: number | null) => {
        const monitor = this.monitors.get(monitorId);
        if (monitor) monitor.avgPing = avgPing;
      });

      // TLS certificate expiry — a core Kuma feature that was entirely invisible
      // on the map. Now every https monitor can show "expira en N días".
      this.socket.on("certInfo", (monitorId: number, certInfoRaw: string) => {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) return;
        try {
          const parsed = typeof certInfoRaw === "string" ? JSON.parse(certInfoRaw) : certInfoRaw;
          monitor.certValid = parsed?.valid ?? undefined;
          monitor.certExpiryDays = parsed?.certInfo?.daysRemaining ?? null;
        } catch {
          // Malformed payload — leave previous cert data untouched.
        }
      });

      // Some Kuma versions use this event name for the same payload.
      this.socket.on("monitorListDesktop", (data: Record<string, any>) => {
        for (const [id, monitor] of Object.entries(data)) {
          const mid = parseInt(id, 10);
          if (Number.isNaN(mid)) continue;
          this.monitors.set(mid, this.mergeMonitor(mid, monitor));
        }
      });

      this.socket.on("disconnect", (reason: string) => {
        console.log(`[Kuma] Disconnected (reason: ${reason})`);
        this.connected = false;
        this.authenticated = false;
        this.connectedSince = null;
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
    return [...Array.from(this.monitors.values()), ...getMonitorNgVirtualMonitors()];
  }

  getMonitor(id: number): KumaMonitor | undefined {
    return this.monitors.get(id) ?? getMonitorNgVirtualMonitors().find((m) => m.id === id);
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
