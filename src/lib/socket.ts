"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

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
    });
  }
  return socket;
}
