import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { getKumaClient, type KumaMonitor, type KumaHeartbeat } from "./src/lib/kuma";
import webpush from "web-push";
import { getAllSubscriptions, removeSubscription } from "./src/lib/push-store";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

// ── VAPID setup for push notifications ──────────────────────────────────────
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:admin@kumamap.local", VAPID_PUBLIC, VAPID_PRIVATE);
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Socket.IO server on same port
  const io = new SocketIOServer(server, {
    path: "/ws",
    cors: { origin: "*" },
    transports: ["websocket", "polling"],
  });

  // Connect to Kuma
  const kuma = getKumaClient();

  // Forward Kuma events to all connected browsers
  let lastMonitors: KumaMonitor[] = [];
  let lastConnected: boolean = false;

  // Poll kuma monitors and emit to clients — uses lightweight hash instead of JSON.stringify
  let lastHash = "";
  const prevStatus = new Map<number, number>(); // track per-monitor status for push

  setInterval(() => {
    const monitors = kuma.getMonitors();
    const isConnected = kuma.isConnected;
    // Build a fast hash from id:status:ping for change detection
    const hash = `${isConnected}|${monitors.map(m => `${m.id}:${m.status}:${m.ping ?? ""}`).join(",")}`;

    if (hash !== lastHash) {
      lastHash = hash;
      lastConnected = isConnected;
      lastMonitors = monitors;
      io.emit("kuma:monitors", { connected: isConnected, monitors });

      // ── Push notifications for DOWN/UP transitions ──────────────────────
      if (VAPID_PUBLIC && VAPID_PRIVATE) {
        for (const m of monitors) {
          const prev = prevStatus.get(m.id);
          if (prev !== undefined && prev !== m.status) {
            if (m.status === 0) {
              sendPushToAll({
                title: `⚠ ${m.name} DOWN`,
                body: m.msg || "Monitor caído",
                tag: `down-${m.id}`,
                data: { url: "/mobile" },
              });
            } else if (m.status === 1 && prev === 0) {
              sendPushToAll({
                title: `✓ ${m.name} UP`,
                body: `Recuperado · ${m.ping ?? "?"}ms`,
                tag: `up-${m.id}`,
                data: { url: "/mobile" },
              });
            }
          }
          prevStatus.set(m.id, m.status ?? 2);
        }
      }
    }
  }, 2000);

  // ── Send push notification to all subscribers ────────────────────────────
  function sendPushToAll(payload: { title: string; body: string; tag?: string; data?: any }) {
    const subs = getAllSubscriptions();
    if (subs.length === 0) return;
    const json = JSON.stringify(payload);
    for (const sub of subs) {
      webpush.sendNotification(sub, json).catch((err: any) => {
        // Remove expired/invalid subscriptions
        if (err.statusCode === 404 || err.statusCode === 410) {
          removeSubscription(sub.endpoint);
        }
      });
    }
  }

  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Send current state immediately
    socket.emit("kuma:monitors", {
      connected: kuma.isConnected,
      monitors: kuma.getMonitors(),
    });

    // Send heartbeat history for a specific monitor
    socket.on("kuma:getHistory", (monitorId: number) => {
      socket.emit("kuma:history", {
        monitorId,
        history: kuma.getHistory(monitorId),
      });
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  server.listen(port, () => {
    console.log(`
╔══════════════════════════════════════╗
║  KumaMap Server v1.0                 ║
║  Port: ${port}                          ║
║  Mode: ${dev ? "development" : "production "}               ║
║  Socket.IO: enabled                  ║
║  Kuma: ${kuma.isConnected ? "connected   " : "connecting..."}                ║
╚══════════════════════════════════════╝
    `);
  });
});
