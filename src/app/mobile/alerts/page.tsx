"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";

interface KumaMonitor {
  id: number;
  name: string;
  status: number;
  type: string;
  ping: number | null;
  msg: string;
}

export default function MobileAlerts() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "down" | "up">("down");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/kuma"));
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  const filtered = monitors.filter((m) => {
    if (filter === "down") return m.status === 0;
    if (filter === "up") return m.status === 1;
    return true;
  });

  const downCount = monitors.filter((m) => m.status === 0).length;
  const upCount = monitors.filter((m) => m.status === 1).length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-4 py-3"
        style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-bold text-[#ededed]">Alertas</h1>
          <div className="flex items-center gap-2">
            {downCount > 0 && (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25">
                {downCount} DOWN
              </span>
            )}
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/25">
              {upCount} UP
            </span>
          </div>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="px-4 py-2.5 flex gap-1.5">
        {([
          { key: "down" as const, label: "Caídos", count: downCount, color: "#ef4444" },
          { key: "up" as const, label: "Activos", count: upCount, color: "#22c55e" },
          { key: "all" as const, label: "Todos", count: monitors.length, color: "#60a5fa" },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="rounded-xl px-3 py-1.5 text-[10px] font-bold transition-all active:scale-95"
            style={{
              background: filter === f.key ? `${f.color}22` : "rgba(255,255,255,0.02)",
              border: `1px solid ${filter === f.key ? `${f.color}44` : "rgba(255,255,255,0.06)"}`,
              color: filter === f.key ? f.color : "#666",
            }}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Monitor list */}
      <div className="flex-1 px-4 space-y-1.5 pb-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
            </svg>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-12 text-[#555]">
            {filter === "down" ? (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" className="mb-2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p className="text-xs text-[#22c55e] font-bold">Todo operativo</p>
                <p className="text-[10px] text-[#555]">No hay monitores caídos</p>
              </>
            ) : (
              <p className="text-xs">Sin resultados</p>
            )}
          </div>
        )}

        {filtered.map((m) => (
          <div
            key={m.id}
            className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{
              background: m.status === 0 ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${m.status === 0 ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{
                background: m.status === 1 ? "#22c55e" : m.status === 0 ? "#ef4444" : "#f59e0b",
                boxShadow: m.status === 0 ? "0 0 8px rgba(239,68,68,0.5)" : "none",
                animation: m.status === 0 ? "pulse-dot 2s ease-in-out infinite" : "none",
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-[#ddd] truncate">{m.name}</div>
              <div className="text-[10px] text-[#555] truncate">{m.msg || m.type.toUpperCase()}</div>
            </div>
            {m.ping != null && m.status === 1 && (
              <span className="text-[10px] font-mono text-[#555]">{m.ping}ms</span>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 12px rgba(239,68,68,0.8); }
        }
      `}</style>
    </div>
  );
}
