"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import Link from "next/link";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import PageTransition from "@/components/mobile/PageTransition";
import { SkeletonRackList } from "@/components/mobile/Skeleton";
import { useToast } from "@/components/mobile/MobileToast";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { hapticTap, hapticSuccess } from "@/lib/haptics";

interface MapSummary {
  id: string;
  name: string;
}

interface SavedNode {
  id: string;
  label: string;
  kuma_monitor_id?: number | null;
  custom_data?: string | null;
}

interface RackDevice {
  id?: string;
  label?: string;
  type?: string;
  unit?: number;
  sizeUnits?: number;
  monitorId?: number | null;
}

interface RackInfo {
  nodeId: string;
  nodeLabel: string;
  mapId: string;
  mapName: string;
  totalUnits: number;
  devices: RackDevice[];
}

interface KumaMonitor {
  id: number;
  name: string;
  status: number;
}

export default function MobileRacks() {
  const [racks, setRacks] = useState<RackInfo[]>([]);
  const [monitors, setMonitors] = useState<Map<number, KumaMonitor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { show } = useToast();
  const online = useOnlineStatus();

  const fetchData = useCallback(async () => {
    try {
      const [mapsListRes, kumaRes] = await Promise.all([
        fetch(apiUrl("/api/maps")),
        fetch(apiUrl("/api/kuma")),
      ]);

      if (kumaRes.ok) {
        const kumaData = await kumaRes.json();
        const monMap = new Map<number, KumaMonitor>();
        (kumaData.monitors || []).forEach((m: KumaMonitor) => monMap.set(m.id, m));
        setMonitors(monMap);
      }

      if (mapsListRes.ok) {
        const mapsList: MapSummary[] = await mapsListRes.json();
        const allRacks: RackInfo[] = [];

        // Fetch each map's detail to get nodes
        const mapDetails = await Promise.all(
          mapsList.map(async (mapSummary) => {
            try {
              const res = await fetch(apiUrl(`/api/maps/${mapSummary.id}`));
              if (!res.ok) return null;
              return await res.json();
            } catch {
              return null;
            }
          })
        );

        for (const detail of mapDetails) {
          if (!detail?.nodes) continue;
          for (const node of detail.nodes as SavedNode[]) {
            if (!node.custom_data) continue;
            try {
              const cd = JSON.parse(node.custom_data);
              if (cd.type === "rack") {
                allRacks.push({
                  nodeId: node.id,
                  nodeLabel: node.label || "Rack",
                  mapId: detail.id,
                  mapName: detail.name,
                  totalUnits: cd.totalUnits || 42,
                  devices: cd.devices || [],
                });
              }
            } catch {
              // skip invalid JSON
            }
          }
        }

        setRacks(allRacks);
      }
    } catch {
      show("Error al cargar racks", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
    hapticSuccess();
    show("Actualizado", "success");
  }, [fetchData, show]);

  const filteredRacks = useMemo(() => {
    if (!search.trim()) return racks;
    const q = search.toLowerCase();
    return racks.filter(
      (r) =>
        r.nodeLabel.toLowerCase().includes(q) ||
        r.mapName.toLowerCase().includes(q)
    );
  }, [racks, search]);

  // Group racks by map
  const groupedByMap = useMemo(() => {
    const groups: Record<string, { mapName: string; racks: RackInfo[] }> = {};
    for (const rack of filteredRacks) {
      if (!groups[rack.mapId]) {
        groups[rack.mapId] = { mapName: rack.mapName, racks: [] };
      }
      groups[rack.mapId].racks.push(rack);
    }
    return groups;
  }, [filteredRacks]);

  const getDeviceStatus = (rack: RackInfo) => {
    let up = 0, down = 0, noMonitor = 0;
    for (const dev of rack.devices) {
      if (!dev.monitorId) {
        noMonitor++;
        continue;
      }
      const m = monitors.get(dev.monitorId);
      if (!m) { noMonitor++; continue; }
      if (m.status === 1) up++;
      else if (m.status === 0) down++;
      else noMonitor++;
    }
    return { up, down, noMonitor };
  };

  const getUsedUnits = (rack: RackInfo) => {
    let used = 0;
    for (const dev of rack.devices) {
      used += dev.sizeUnits || 1;
    }
    return used;
  };

  return (
    <PageTransition>
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Immersive Header */}
        <div className="px-5 pt-3 pb-1 safe-top">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{
              background: "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.08))",
              border: "1px solid rgba(16,185,129,0.25)",
              boxShadow: "0 4px 16px rgba(16,185,129,0.15)",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <line x1="6" y1="7" x2="18" y2="7" />
                <line x1="6" y1="12" x2="18" y2="12" />
                <line x1="6" y1="17" x2="18" y2="17" />
                <circle cx="16" cy="7" r="1" fill="#10b981" />
                <circle cx="16" cy="12" r="1" fill="#10b981" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Racks</h1>
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: online ? "#22c55e" : "#ef4444",
                    boxShadow: online ? "0 0 8px rgba(34,197,94,0.6)" : "0 0 8px rgba(239,68,68,0.6)",
                  }}
                />
              </div>
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {racks.length} rack{racks.length !== 1 ? "s" : ""} encontrado{racks.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 pt-3 pb-1">
          <div
            className="flex items-center gap-2.5 rounded-2xl px-4 py-3"
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--glass-border)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar racks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] outline-none"
              style={{
                color: "var(--text-primary)",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="p-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-3 space-y-4">
          {loading && <SkeletonRackList count={4} />}

          {!loading && racks.length === 0 && (
            <div className="flex flex-col items-center py-16" style={{ color: "var(--text-tertiary)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <line x1="6" y1="7" x2="18" y2="7" />
                <line x1="6" y1="12" x2="18" y2="12" />
                <line x1="6" y1="17" x2="18" y2="17" />
              </svg>
              <p className="text-xs">No se encontraron racks</p>
              <p className="text-[10px] mt-1 opacity-60">Agrega dispositivos tipo rack en tus mapas</p>
            </div>
          )}

          {!loading && filteredRacks.length === 0 && racks.length > 0 && search && (
            <div className="flex flex-col items-center py-16" style={{ color: "var(--text-tertiary)" }}>
              <p className="text-xs">Sin resultados para &ldquo;{search}&rdquo;</p>
            </div>
          )}

          {Object.entries(groupedByMap).map(([mapId, group]) => (
            <div key={mapId}>
              {/* Map group header */}
              <div className="flex items-center gap-2 mb-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  {group.mapName}
                </span>
              </div>

              <div className="space-y-2">
                {group.racks.map((rack) => {
                  const status = getDeviceStatus(rack);
                  const usedUnits = getUsedUnits(rack);
                  const hasDown = status.down > 0;
                  const usagePct = rack.totalUnits > 0 ? (usedUnits / rack.totalUnits) * 100 : 0;

                  return (
                    <Link
                      key={`${rack.mapId}-${rack.nodeId}`}
                      href={`/mobile/rack?mapId=${rack.mapId}&nodeId=${rack.nodeId}`}
                      onClick={() => hapticTap()}
                    >
                      <div
                        className="rounded-2xl p-4 transition-all active:scale-[0.98]"
                        style={{
                          background: hasDown ? "rgba(239,68,68,0.04)" : "var(--surface-card)",
                          border: `1px solid ${hasDown ? "rgba(239,68,68,0.12)" : "var(--glass-border)"}`,
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Rack icon */}
                          <div
                            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                            style={{
                              background: hasDown ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                              border: `1px solid ${hasDown ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={hasDown ? "#ef4444" : "#10b981"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="2" width="20" height="20" rx="2" />
                              <line x1="6" y1="7" x2="18" y2="7" />
                              <line x1="6" y1="12" x2="18" y2="12" />
                              <line x1="6" y1="17" x2="18" y2="17" />
                              <circle cx="16" cy="7" r="1" fill={hasDown ? "#ef4444" : "#10b981"} />
                              <circle cx="16" cy="12" r="1" fill={hasDown ? "#ef4444" : "#10b981"} />
                            </svg>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                                {rack.nodeLabel}
                              </h3>
                              <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
                                {rack.devices.length} dispositivo{rack.devices.length !== 1 ? "s" : ""}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                                {usedUnits}/{rack.totalUnits}U
                              </span>
                              {rack.devices.length > 0 && (
                                <div className="flex items-center gap-2">
                                  {status.up > 0 && (
                                    <span className="text-[10px] font-mono font-bold text-[#22c55e]">{status.up} UP</span>
                                  )}
                                  {status.down > 0 && (
                                    <span className="text-[10px] font-mono font-bold text-[#ef4444]">{status.down} DOWN</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Usage bar */}
                            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-hover)" }}>
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(usagePct, 100)}%`,
                                  background: usagePct > 85
                                    ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                                    : usagePct > 60
                                    ? "linear-gradient(90deg, #10b981, #f59e0b)"
                                    : "#10b981",
                                }}
                              />
                            </div>
                          </div>

                          {/* Chevron */}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-2">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <style>{`
          .safe-top { padding-top: env(safe-area-inset-top, 0); }
          input::placeholder { color: var(--text-tertiary); }
        `}</style>
      </PullToRefresh>
    </PageTransition>
  );
}
