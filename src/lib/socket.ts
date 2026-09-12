"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

// Cache the last known kuma:monitors payload so late-mounting components
// get an immediate reply instead of waiting up to 2 s for the next poll.
let lastMonitorsPayload: { connected: boolean; monitors: unknown[] } | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/ws",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => {
      console.log("[KumaMap] Socket.IO connected");
    });

    socket.on("disconnect", () => {
      console.log("[KumaMap] Socket.IO disconnected");
      // Keep last payload so UI doesn't flash disconnected immediately;
      // the component's own "disconnect" listener handles UI update.
    });

    // Cache every monitors update
    socket.on("kuma:monitors", (data: { connected: boolean; monitors: unknown[] }) => {
      lastMonitorsPayload = data;
    });

    // El servidor manda solo lo que cambio. Se mezcla con la ultima foto y se
    // vuelve a disparar "kuma:monitors" a los oyentes locales: para el resto de
    // la aplicacion no cambio nada, y por el cable viaja una fraccion.
    socket.on("kuma:delta", (d: { connected: boolean; cambiados: any[]; quitados: number[] }) => {
      if (!lastMonitorsPayload) return;   // sin foto previa no hay que mezclar; ya llegara
      const porId = new Map<number, any>(
        (lastMonitorsPayload.monitors as any[]).map((m) => [m.id, m])
      );
      // Mezcla, no reemplazo: el delta trae solo lo volatil.
      for (const m of d.cambiados || []) porId.set(m.id, { ...(porId.get(m.id) || {}), ...m });
      for (const id of d.quitados || []) porId.delete(id);
      lastMonitorsPayload = { connected: d.connected, monitors: [...porId.values()] };
      for (const fn of socket!.listeners("kuma:monitors")) {
        try { (fn as (p: unknown) => void)(lastMonitorsPayload); } catch { /* un oyente roto no corta al resto */ }
      }
    });
  }
  return socket;
}

/**
 * Returns the last received kuma:monitors payload, or null if none yet.
 * Use this to initialise component state synchronously on mount.
 */
export function getLastMonitorsPayload() {
  return lastMonitorsPayload;
}
