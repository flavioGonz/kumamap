"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import Link from "next/link";

interface MapSummary {
  id: string;
  name: string;
  node_count: number;
  edge_count: number;
  monitor_ids: number[];
  background_type: string;
}

interface KumaMonitor {
  id: number;
  name: string;
  status: number;
  ping: number | null;
}

const STATUS_COLORS: Record<number, string> = {
  1: "#22c55e",
  0: "#ef4444",
  2: "#f59e0b",
  3: "#6b7280",
};

export default function MobileHome() {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [monitors, setMonitors] = useState<Map<number, KumaMonitor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [mapsRes, kumaRes] = await Promise.all([
        fetch(apiUrl("/api/maps")),
        fetch(apiUrl("/api/kuma")),
      ]);
      if (mapsRes.ok) setMaps(await mapsRes.json());
      if (kumaRes.ok) {
        const data = await kumaRes.json();
        const monMap = new Map<number, KumaMonitor>();
        (data.monitors || []).forEach((m: KumaMonitor) => monMap.set(m.id, m));
        setMonitors(monMap);
      }
      setLastUpdate(new Date());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getMapStatus = (map: MapSummary) => {
    if (map.monitor_ids.length === 0) return { up: 0, down: 0, pending: 0, total: 0 };
    let up = 0, down = 0, pending = 0;
    for (const id of map.monitor_ids) {
      const m = monitors.get(id);
      if (!m) { pending++; continue; }
      if (m.status === 1) up++;
      else if (m.status === 0) down++;
      else pending++;
    }
    return { up, down, pending, total: map.monitor_ids.length };
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 px-4 py-3 safe-top" style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="6" fill="none" stroke="#60a5fa" strokeWidth="2" />
                <circle cx="16" cy="16" r="2.5" fill="#60a5fa" />
                <circle cx="9" cy="9" r="1.5" fill="#22c55e" />
                <circle cx="23" cy="9" r="1.5" fill="#22c55e" />
                <circle cx="9" cy="23" r="1.5" fill="#ef4444" />
                <circle cx="23" cy="23" r="1.5" fill="#f59e0b" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#ededed]">KumaMap</h1>
              <p className="text-[9px] text-[#555]">
                {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString("es")}` : "Cargando..."}
              </p>
            </div>
          </div>
          <button onClick={fetchData} className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] hover:text-[#ededed] active:scale-95 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </header>

      {/* Global status bar */}
      {!loading && maps.length > 0 && (() => {
        const allMonitorIds = maps.flatMap((m) => m.monitor_ids);
        const uniqueIds = [...new Set(allMonitorIds)];
        let totalUp = 0, totalDown = 0;
        uniqueIds.forEach((id) => {
          const m = monitors.get(id);
          if (m?.status === 1) totalUp++;
          else if (m?.status === 0) totalDown++;
        });
        return (
          <div className="mx-4 mt-3 rounded-2xl p-3 flex items-center gap-3" style={{ background: totalDown > 0 ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)", border: `1px solid ${totalDown > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)"}` }}>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: totalDown > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)" }}>
              {totalDown > 0 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold" style={{ color: totalDown > 0 ? "#fca5a5" : "#86efac" }}>
                {totalDown > 0 ? `${totalDown} monitor${totalDown > 1 ? "es" : ""} caído${totalDown > 1 ? "s" : ""}` : "Todo operativo"}
              </div>
              <div className="text-[10px] text-[#666]">{totalUp} UP · {totalDown} DOWN · {uniqueIds.length} total</div>
            </div>
          </div>
        );
      })()}

      {/* Map list */}
      <div className="flex-1 px-4 py-4 space-y-2.5">
        {loading && (
          <div className="flex flex-col items-center py-16">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin mb-3">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
            </svg>
            <p className="text-[11px] text-[#555]">Cargando mapas...</p>
          </div>
        )}

        {!loading && maps.length === 0 && (
          <div className="flex flex-col items-center py-16 text-[#555]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
              <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
            </svg>
            <p className="text-xs">No hay mapas creados</p>
          </div>
        )}

        {maps.map((map) => {
          const status = getMapStatus(map);
          const hasDown = status.down > 0;
          const healthPct = status.total > 0 ? (status.up / status.total) * 100 : 100;

          return (
            <Link key={map.id} href={`/mobile/map?id=${map.id}`}>
              <div
                className="rounded-2xl p-4 transition-all active:scale-[0.98]"
                style={{
                  background: hasDown ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${hasDown ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: hasDown ? "rgba(239,68,68,0.12)" : status.total > 0 ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${hasDown ? "rgba(239,68,68,0.25)" : status.total > 0 ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={hasDown ? "#ef4444" : status.total > 0 ? "#22c55e" : "#666"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#ededed] truncate">{map.name}</h3>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" className="shrink-0"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-[#666]">{map.node_count} nodos · {map.edge_count} links</span>
                      {status.total > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-[#22c55e]">{status.up}↑</span>
                          {status.down > 0 && <span className="text-[10px] font-mono font-bold text-[#ef4444]">{status.down}↓</span>}
                          {status.pending > 0 && <span className="text-[10px] font-mono font-bold text-[#f59e0b]">{status.pending}?</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {status.total > 0 && (
                  <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${healthPct}%`,
                        background: hasDown ? `linear-gradient(90deg, #22c55e ${(status.up / status.total) * 100}%, #ef4444 0%)` : "#22c55e",
                      }}
                    />
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <style>{`
        .safe-top { padding-top: env(safe-area-inset-top, 0); }
      `}</style>
    </div>
  );
}
