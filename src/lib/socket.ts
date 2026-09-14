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
