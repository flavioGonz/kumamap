"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/api";

interface MonitorCounts {
  up: number;
  down: number;
  total: number;
}

/** Lightweight poller that returns global UP/DOWN counts for the tab bar badge */
export function useMonitorCounts(intervalMs = 15000): MonitorCounts {
  const [counts, setCounts] = useState<MonitorCounts>({ up: 0, down: 0, total: 0 });

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/kuma"));
      if (!res.ok) return;
      const data = await res.json();
      const monitors: { status: number }[] = data.monitors || [];
      let up = 0, down = 0;
      monitors.forEach((m) => {
        if (m.status === 1) up++;
        else if (m.status === 0) down++;
      });
      setCounts({ up, down, total: monitors.length });
    } catch {
      // offline — keep last counts
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const id = setInterval(fetchCounts, intervalMs);
    return () => clearInterval(id);
  }, [fetchCounts, intervalMs]);

  return counts;
}
