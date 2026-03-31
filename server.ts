import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { getKumaClient, type KumaMonitor, type KumaHeartbeat } from "./src/lib/kuma";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

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

  // Poll kuma monitors and emit to clients (kuma fires monitorList on changes)
  setInterval(() => {
    const monitors = kuma.getMonitors();
    const isConnected = kuma.isConnected;

    if (isConnected !== lastConnected || JSON.stringify(monitors) !== JSON.stringify(lastMonitors)) {
      lastConnected = isConnected;
      lastMonitors = monitors;
      io.emit("kuma:monitors", { connected: isConnected, monitors });
    }
  }, 2000);

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
