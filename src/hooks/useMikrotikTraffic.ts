"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { apiUrl } from "@/lib/api";

export interface TrafficSample {
  ts: number;
  rxBps: number;
  txBps: number;
}

export interface InterfaceTraffic {
  current: TrafficSample | null;
  history: TrafficSample[];
  error: string | null;
  loading: boolean;
}

/** Max history samples kept per interface (at 2s interval → ~2 min) */
const MAX_HISTORY = 60;

/**
 * Hook that polls MikroTik monitor-traffic every `intervalMs` and maintains
 * a per-interface circular history buffer for sparkline rendering.
 *
 * @param config  MikroTik router config: host, user, pass, interfaces[]
 * @param intervalMs  Polling interval in milliseconds (default: 2000)
 * @param enabled  Set false to pause polling
 * @returns Map of interface name → TrafficSample history
 */
export function useMikrotikTraffic(
  config: { host: string; user: string; pass: string; interfaces: string[] } | null,
  intervalMs = 2000,
  enabled = true
): Map<string, InterfaceTraffic> {
  const [data, setData] = useState<Map<string, InterfaceTraffic>>(new Map());
  const historyRef = useRef<Map<string, TrafficSample[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const poll = useCallback(async () => {
    if (!config || !config.host || !config.interfaces.length) return;

    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const res = await fetch(apiUrl("/api/mikrotik/traffic"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: config.host,
          user: config.user,
          pass: config.pass,
          interfaces: config.interfaces,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const json = await res.json() as {
        ts: number;
        interfaces: Record<string, { rxBps: number; txBps: number }>;
      };

      const next = new Map<string, InterfaceTraffic>();

      for (const [iface, vals] of Object.entries(json.interfaces)) {
        const sample: TrafficSample = { ts: json.ts, rxBps: vals.rxBps, txBps: vals.txBps };

        // Append to history
        const hist = historyRef.current.get(iface) || [];
        hist.push(sample);
        if (hist.length > MAX_HISTORY) hist.shift();
        historyRef.current.set(iface, hist);

        next.set(iface, {
          current: sample,
          history: [...hist],
          error: null,
          loading: false,
        });
      }

      setData(next);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      // Set error state for all interfaces
      const next = new Map<string, InterfaceTraffic>();
      for (const iface of config.interfaces) {
        const hist = historyRef.current.get(iface) || [];
        next.set(iface, {
          current: null,
          history: [...hist],
          error: err.message,
          loading: false,
        });
      }
      setData(next);
    }
  }, [config]);

  useEffect(() => {
    if (!enabled || !config) return;

    // Initial poll
    poll();

    // Interval
    const id = setInterval(poll, intervalMs);

    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [poll, intervalMs, enabled, config]);

  return data;
}
