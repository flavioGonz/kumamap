"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import Link from "next/link";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import PageTransition from "@/components/mobile/PageTransition";
import { SkeletonList, SkeletonBanner, SkeletonStatsRow } from "@/components/mobile/Skeleton";
import { useToast } from "@/components/mobile/MobileToast";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { hapticTap, hapticSuccess } from "@/lib/haptics";

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

export default function MobileHome() {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [monitors, setMonitors] = useState<Map<number, KumaMonitor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { show } = useToast();
  const online = useOnlineStatus();

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
    } catch {
      show("Sin conexión al servidor", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    await fetchData();
    hapticSuccess();
    show("Actualizado", "success");
  }, [fetchData, show]);

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
    <PageTransition>
    <PullToRefresh onRefresh={handleRefresh}>
      {/* Header — immersive, no sticky bar */}
      <div className="px-5 pt-3 pb-1 safe-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))", border: "1px solid rgba(59,130,246,0.25)", boxShadow: "0 4px 16px rgba(59,130,246,0.15)" }}>
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="6" fill="none" stroke="#60a5fa" strokeWidth="2" />
                <circle cx="16" cy="16" r="2.5" fill="#60a5fa" />
                <circle cx="9" cy="9" r="1.5" fill="#22c55e" />
                <circle cx="23" cy="9" r="1.5" fill="#22c55e" />
                <circle cx="9" cy="23" r="1.5" fill="#ef4444" />
                <circle cx="23" cy="23" r="1.5" fill="#f59e0b" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>KumaMap</h1>
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: online ? "#22c55e" : "#ef4444",
                    boxShadow: online ? "0 0 8px rgba(34,197,94,0.6)" : "0 0 8px rgba(239,68,68,0.6)",
                  }}
                />
              </div>
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString("es")}` : "Cargando..."}
              </p>
            </div>
          </div>
          {/* Push notification indicator */}
          <PushIndicator />
        </div>
      </div>

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
              <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{totalUp} UP · {totalDown} DOWN · {uniqueIds.length} total</div>
            </div>
          </div>
        );
      })()}

      {/* Quick stats row */}
      {!loading && maps.length > 0 && (() => {
        const allMonitorIds = maps.flatMap((m) => m.monitor_ids);
        const uniqueIds = [...new Set(allMonitorIds)];
        const pings = uniqueIds.map((id) => monitors.get(id)?.ping).filter((p): p is number => p != null && p > 0);
        const avgPing = pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null;
        const maxPing = pings.length > 0 ? Math.max(...pings) : null;

        return (
          <div className="px-4 mt-2 flex gap-2">
            <MiniStat label="Mapas" value={String(maps.length)} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              </svg>
            } color="#60a5fa" />
            <MiniStat label="Monitores" value={String(uniqueIds.length)} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            } color="#a78bfa" />
            {avgPing !== null && (
              <MiniStat label="Avg ping" value={`${avgPing}ms`} icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              } color="#f59e0b" />
            )}
          </div>
        );
      })()}

      {/* Skeleton loading state for banner + stats + list */}
      {loading && (
        <>
          <SkeletonBanner />
          <SkeletonStatsRow />
        </>
      )}

      {/* Map list */}
      <div className="flex-1 px-4 py-4 space-y-2.5">
        {loading && <SkeletonList count={4} />}

        {!loading && maps.length === 0 && (
          <div className="flex flex-col items-center py-16" style={{ color: "var(--text-tertiary)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            </svg>
            <p className="text-xs">No hay mapas creados</p>
          </div>
        )}

        {maps.map((map) => {
          const status = getMapStatus(map);
          const hasDown = status.down > 0;
          const healthPct = status.total > 0 ? (status.up / status.total) * 100 : 100;

          return (
            <Link key={map.id} href={`/mobile/map?id=${map.id}`} onClick={() => hapticTap()}>
              <div
                className="rounded-2xl p-4 transition-all active:scale-[0.98]"
                style={{
                  background: hasDown ? "rgba(239,68,68,0.04)" : "var(--surface-card)",
                  border: `1px solid ${hasDown ? "rgba(239,68,68,0.12)" : "var(--glass-border)"}`,
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
                      <h3 className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{map.name}</h3>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" className="shrink-0"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{map.node_count} nodos · {map.edge_count} links</span>
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
                  <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--surface-hover)" }}>
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
    </PullToRefresh>
    </PageTransition>
  );
}

function PushIndicator() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => setEnabled(!!sub));
      });
    }
  }, []);
  if (!enabled) return null;
  return (
    <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
      </svg>
    </div>
  );
}

function MiniStat({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div
      className="flex-1 rounded-xl px-2.5 py-2 flex items-center gap-2"
      style={{ background: `${color}08`, border: `1px solid ${color}15` }}
    >
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-[11px] font-bold font-mono" style={{ color }}>{value}</div>
        <div className="text-[8px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      </div>
    </div>
  );
}
