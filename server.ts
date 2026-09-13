import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { getKumaClient, type KumaMonitor, type KumaHeartbeat } from "./src/lib/kuma";
import webpush from "web-push";

import { iniciarReceptorDeTraps, reubicarPendientes } from "./src/lib/traps";
import { getUpsMonitor } from "./src/lib/ups-monitor";
import { reportarEstado, avisarAMapa, mapaDeNodo } from "./src/lib/avisos";

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
    const pathname = parsedUrl.pathname || "";

    // Prevent upstream proxies/routers from caching HTML pages.
    // Next.js sets s-maxage=31536000 on prerendered pages AFTER our setHeader,
    // so we intercept writeHead to override it for non-asset routes.
    if (!pathname.includes("/_next/") && !pathname.includes("/api/")) {
      const origWriteHead = res.writeHead.bind(res);
      (res as any).writeHead = function (statusCode: number, ...args: any[]) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        return origWriteHead(statusCode, ...args);
      };
    }

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

  // Se emite lo que cambio, no la lista entera: ver el comentario del bucle.
  const prevStatus = new Map<number, number>(); // track per-monitor status for push

  /**
   * Lo volatil de un monitor: lo unico que puede cambiar entre latidos. El
   * nombre, la url, el tipo y las etiquetas ya viajaron en la foto y no se
   * repiten. Cada campo va siempre, con null si no hay valor: omitirlo dejaria
   * pegado el valor anterior del lado del cliente.
   */
  const parteVolatil = (m: KumaMonitor) => ({
    id: m.id,
    status: m.status ?? null,
    ping: m.ping ?? null,
    msg: m.msg ?? "",
    active: m.active,
    maintenance: (m as any).maintenance ?? false,
    uptime: (m as any).uptime ?? null,
    uptime24: (m as any).uptime24 ?? null,
    avgPing: (m as any).avgPing ?? null,
    downTime: (m as any).downTime ?? null,
    certExpiryDays: (m as any).certExpiryDays ?? null,
    mng: (m as any).mng ?? null,
  });

  /** Lo que hace distinto a un monitor de como estaba la vez anterior. */
  const firmaDe = (m: KumaMonitor) =>
    `${m.status}|${m.ping ?? ""}|${m.msg ?? ""}|${m.active}|${(m as any).maintenance ?? ""}`;
  const firmas = new Map<number, string>();
  let ultimaFotoCompleta = 0;
  /** Cada tanto va la lista entera igual: es la red por si alguien se perdio un delta. */
  const FOTO_CADA_MS = 5 * 60_000;

  setInterval(() => {
    const monitors = kuma.getMonitors();
    const isConnected = kuma.isConnected;

    // Que cambio desde la vez pasada
    const cambiados: KumaMonitor[] = [];
    const vistos = new Set<number>();
    for (const m of monitors) {
      vistos.add(m.id);
      const f = firmaDe(m);
      if (firmas.get(m.id) !== f) { firmas.set(m.id, f); cambiados.push(m); }
    }
    const quitados: number[] = [];
    for (const id of firmas.keys()) if (!vistos.has(id)) quitados.push(id);
    for (const id of quitados) firmas.delete(id);

    const cambioConexion = isConnected !== lastConnected;
    const hayCambios = cambiados.length > 0 || quitados.length > 0 || cambioConexion;

    // La foto entera se manda cuando cambio la lista de monitores, cuando cambio
    // casi todo (no ahorra nada mandarlo partido) o cada cinco minutos.
    const tocaFoto =
      quitados.length > 0 ||
      cambiados.length > Math.max(6, monitors.length / 2) ||
      Date.now() - ultimaFotoCompleta > FOTO_CADA_MS;

    if (!hayCambios && !tocaFoto) return;

    if (tocaFoto) {
      ultimaFotoCompleta = Date.now();
      lastConnected = isConnected;
      lastMonitors = monitors;
      io.emit("kuma:monitors", { connected: isConnected, monitors });
    } else {
      lastConnected = isConnected;
      lastMonitors = monitors;
      io.emit("kuma:delta", {
        connected: isConnected,
        cambiados: cambiados.map(parteVolatil),
        quitados,
      });
    }

    {
      // ── Avisos de caída y de vuelta ─────────────────────────────────────
      //
      // Este bucle mandaba su propio push, en paralelo con el que push-sender ya
      // mandaba desde el latido de Kuma: DOS notificaciones por cada caída. Y
      // sólo aquel camino tenía el filtro de mantenimiento de K2, así que al
      // cerrar una ventana salía igual un "recuperado" falso desde acá.
      //
      // Ahora los dos reportan a avisos.ts, que decide una sola vez y manda el
      // aviso únicamente a quien sigue ese cliente. Se conservan los dos
      // informantes porque ven cosas distintas: el sondeo llega aunque Kuma esté
      // respondiendo por base en vez de por socket.
      for (const m of cambiados) {
        void reportarEstado(m.id, m.name, m.status ?? 2, m.msg || "", m.ping ?? null);
      }
    }
  }, 2000);

  // El envío de avisos vive en src/lib/avisos.ts: es el único que sabe a quién
  // le interesa cada cliente, y el único que decide si un aviso corresponde.

  // Receptor de traps SNMP: el equipo avisa solo, sin que nadie le pregunte.
  iniciarReceptorDeTraps((trap) => {
    io.emit("trap:nuevo", trap);
  });

  // Monitor de UPS: sondea cada 30 s, guarda cada lectura y evalua las alertas.
  //
  // El modulo estaba escrito entero y nunca se arrancaba: nadie llamaba a
  // start(). Por eso `ups_history` tenia cero filas y el panel mostraba
  // "0 lecturas" con las graficas de seis horas vacias desde el primer dia.
  const ups = getUpsMonitor();
  ups.start({
    onReading: (nodeId, result) => io.emit("ups:reading", { nodeId, result }),
    onAlert: (a) => {
      io.emit("ups:alerta", a);
      // El corte de energia es de las pocas cosas que justifican despertar a
      // alguien: si la UPS paso a bateria, el reloj ya empezo a correr.
      // El aviso de la UPS va a quien sigue ESE cliente, igual que los de caída.
      void avisarAMapa(mapaDeNodo(a.nodeId), {
        title: a.title,
        body: a.body,
        tag: `ups-${a.nodeId}-${a.kind}`,
        data: { url: "/" },
      });
      console.log(`[UPS] ${a.severity.toUpperCase()} ${a.label}: ${a.title}`);
    },
  });

  // El indice de IPs del mapa se rearma solo cada cinco minutos; los avisos que
  // quedaron sin equipo se vuelven a intentar cada diez. Es barato y evita tener
  // que apretar el boton despues de cargarle la IP a un nodo.
  setInterval(() => {
    try { reubicarPendientes(200); } catch { /* es informacion de apoyo */ }
  }, 10 * 60_000);

  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Send current state immediately
    socket.emit("kuma:monitors", {
      connected: kuma.isConnected,
      monitors: kuma.getMonitors(),
    });

    // La ultima lectura de cada UPS, para que el panel pinte al instante en vez
    // de quedarse en blanco hasta el proximo sondeo.
    socket.emit("ups:snapshot", ups.getAllLatest());

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
