"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import PageTransition from "@/components/mobile/PageTransition";
import { SkeletonList } from "@/components/mobile/Skeleton";
import { useToast } from "@/components/mobile/MobileToast";
import { hapticTap, hapticSuccess, hapticMedium } from "@/lib/haptics";

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
  const { show } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/kuma"));
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors || []);
      }
    } catch {
      show("Sin conexión", "error");
    }
    finally { setLoading(false); }
  }, [show]);

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

  const handleRefresh = useCallback(async () => {
    await fetchData();
    hapticSuccess();
    show("Actualizado", "success");
  }, [fetchData, show]);

  return (
    <PageTransition>
    <PullToRefresh onRefresh={handleRefresh}>
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
            onClick={() => { setFilter(f.key); hapticTap(); }}
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
        {loading && <SkeletonList count={5} />}

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
          <AlertCard key={m.id} monitor={m} onToast={show} />
        ))}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 12px rgba(239,68,68,0.8); }
        }
      `}</style>
    </PullToRefresh>
    </PageTransition>
  );
}

/* ── Expandable alert card ── */
function AlertCard({ monitor: m, onToast }: { monitor: KumaMonitor; onToast: (msg: string, type?: "success" | "error" | "info" | "warning") => void }) {
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      hapticMedium();
      navigator.clipboard.writeText(m.name).then(() => {
        onToast("Nombre copiado", "info");
      }).catch(() => {});
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: m.status === 0 ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${m.status === 0 ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <button
        onClick={() => { setExpanded(!expanded); hapticTap(); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="w-full px-4 py-3 flex items-center gap-3 active:bg-white/[0.02] transition-all text-left"
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
        <div className="flex items-center gap-2 shrink-0">
          {m.ping != null && m.status === 1 && (
            <span className="text-[10px] font-mono text-[#555]">{m.ping}ms</span>
          )}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expandable detail */}
      {expanded && (
        <div
          className="px-4 pb-3 pt-0 border-t grid grid-cols-2 gap-2"
          style={{ borderColor: "rgba(255,255,255,0.04)", animation: "expand-in 0.2s ease-out" }}
        >
          <DetailChip label="Tipo" value={m.type.toUpperCase()} />
          <DetailChip label="ID" value={`#${m.id}`} />
          {m.ping != null && <DetailChip label="Latencia" value={`${m.ping}ms`} />}
          <DetailChip
            label="Estado"
            value={m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING"}
            color={m.status === 1 ? "#22c55e" : m.status === 0 ? "#ef4444" : "#f59e0b"}
          />
          {m.msg && (
            <div className="col-span-2 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-[8px] uppercase tracking-wider text-[#444] mb-0.5">Mensaje</div>
              <div className="text-[10px] text-[#888] break-all">{m.msg}</div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes expand-in {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 200px; }
        }
      `}</style>
    </div>
  );
}

function DetailChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="text-[8px] uppercase tracking-wider text-[#444]">{label}</div>
      <div className="text-[10px] font-mono font-bold" style={{ color: color || "#aaa" }}>{value}</div>
    </div>
  );
}
