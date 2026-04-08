"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { KumaMonitor } from "@/components/network-map/MonitorPanel";
import { getLastMonitorsPayload } from "@/lib/socket";

export function useKumaMonitors() {
  const cached = getLastMonitorsPayload();
  const [monitors, setMonitors] = useState<KumaMonitor[]>((cached?.monitors as KumaMonitor[]) ?? []);
  const [connected, setConnected] = useState<boolean>(cached?.connected ?? false);
  const prevStatusRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    import("@/lib/socket").then(({ getSocket }) => {
      const socket = getSocket();

      const handleMonitors = (data: { connected: boolean; monitors: KumaMonitor[] }) => {
        setConnected(data.connected);
        const newMonitors = data.monitors || [];

        newMonitors.forEach((m) => {
          const prev = prevStatusRef.current.get(m.id);
          if (prev !== undefined && prev !== m.status) {
            if (m.status === 0) {
              toast.error(`${m.name} DOWN`, { description: m.msg || "Monitor caido", duration: 8000 });
            } else if (m.status === 1 && prev === 0) {
              toast.success(`${m.name} UP`, { description: `${m.ping ?? "?"}ms`, duration: 5000 });
            }
          }
          prevStatusRef.current.set(m.id, m.status ?? 2);
        });

        setMonitors(newMonitors);
      };

      socket.on("kuma:monitors", handleMonitors);
      socket.on("disconnect", () => setConnected(false));

      return () => {
        socket.off("kuma:monitors", handleMonitors);
      };
    });
  }, []);

  return { monitors, connected };
}

/** Lightweight version without toast notifications — for kiosk/readonly views */
export function useKumaMonitorsSimple() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    import("@/lib/socket").then(({ getSocket }) => {
      const socket = getSocket();

      const handleMonitors = (data: { connected: boolean; monitors: KumaMonitor[] }) => {
        setConnected(data.connected);
        setMonitors(data.monitors || []);
      };

      socket.on("kuma:monitors", handleMonitors);
      socket.on("disconnect", () => setConnected(false));

      return () => {
        socket.off("kuma:monitors", handleMonitors);
      };
    });
  }, []);

  return { monitors, connected };
}
