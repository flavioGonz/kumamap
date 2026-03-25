import { io, Socket } from "socket.io-client";

export interface KumaMonitor {
  id: number;
  name: string;
  type: string;
  url: string;
  hostname: string;
  port: number;
  interval: number;
  active: boolean;
  tags: { name: string; color: string }[];
  status?: number; // 0=down, 1=up, 2=pending, 3=maintenance
  ping?: number | null;
  msg?: string;
  uptime24?: number;
}

export interface KumaHeartbeat {
  monitorID: number;
  status: number;
  time: string;
  msg: string;
  ping: number | null;
  duration: number;
}

class KumaClient {
  private socket: Socket | null = null;
  private monitors: Map<number, KumaMonitor> = new Map();
  private heartbeats: Map<number, KumaHeartbeat> = new Map();
  private connected = false;
  private authenticated = false;
  private initPromise: Promise<void> | null = null;

  get isConnected() {
    return this.connected && this.authenticated;
  }

  connect(url: string, username: string, password: string): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      console.log(`[Kuma] Connecting to ${url}...`);

      this.socket = io(url, {
        reconnection: true,
        reconnectionDelay: 5000,
        reconnectionAttempts: Infinity,
        transports: ["websocket"],
      });

      this.socket.on("connect", () => {
        console.log("[Kuma] Socket connected, authenticating...");
        this.connected = true;

        this.socket!.emit(
          "login",
          { username, password, token: "" },
          (res: any) => {
            if (res.ok) {
              console.log("[Kuma] Authenticated successfully");
              this.authenticated = true;
              resolve();
            } else {
              console.error("[Kuma] Auth failed:", res.msg);
              this.authenticated = false;
              resolve();
            }
          }
        );
      });

      this.socket.on(
        "monitorList",
        (data: Record<string, any>) => {
          for (const [id, monitor] of Object.entries(data)) {
            const mid = parseInt(id);
            const hb = this.heartbeats.get(mid);
            this.monitors.set(mid, {
              id: mid,
              name: monitor.name,
              type: monitor.type,
              url: monitor.url || "",
              hostname: monitor.hostname || "",
              port: monitor.port || 0,
              interval: monitor.interval || 60,
              active: monitor.active !== false,
              tags: (monitor.tags || []).map((t: any) => ({
                name: t.name,
                color: t.color,
              })),
              status: hb?.status ?? monitor.status,
              ping: hb?.ping ?? null,
              msg: hb?.msg ?? "",
            });
          }
        }
      );

      this.socket.on("heartbeat", (data: KumaHeartbeat) => {
        this.heartbeats.set(data.monitorID, data);
        const monitor = this.monitors.get(data.monitorID);
        if (monitor) {
          monitor.status = data.status;
          monitor.ping = data.ping;
          monitor.msg = data.msg;
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

      this.socket.on("disconnect", () => {
        console.log("[Kuma] Disconnected");
        this.connected = false;
        this.authenticated = false;
      });

      this.socket.on("connect_error", (err: Error) => {
        console.error("[Kuma] Connection error:", err.message);
        this.connected = false;
        this.authenticated = false;
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
}

// Singleton
let kumaInstance: KumaClient | null = null;

export function getKumaClient(): KumaClient {
  if (!kumaInstance) {
    kumaInstance = new KumaClient();
    const url = process.env.KUMA_URL;
    const user = process.env.KUMA_USER;
    const pass = process.env.KUMA_PASS;
    if (url && user && pass) {
      kumaInstance.connect(url, user, pass);
    }
  }
  return kumaInstance;
}
