"use client";

import React, { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { safeJsonParse } from "@/lib/error-handler";
import type { NodeCustomData } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RackDevice {
  id: string;
  unit: number;
  sizeUnits: number;
  label: string;
  type: string;
  color?: string;
  monitorId?: number | null;
  model?: string;
  serial?: string;
  managementIp?: string;
  notes?: string;
  portCount?: number;
  isPoeCapable?: boolean;
  ports?: any[];
  switchPorts?: any[];
  routerInterfaces?: any[];
}

interface KumaMonitor {
  id: number;
  name: string;
  status: number;
  ping: number | null;
  msg: string;
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  server: { label: "Servidor", color: "#3b82f6" },
  switch: { label: "Switch", color: "#10b981" },
  patchpanel: { label: "Patch Panel", color: "#8b5cf6" },
  ups: { label: "UPS", color: "#f59e0b" },
  router: { label: "Router", color: "#ef4444" },
  pdu: { label: "PDU", color: "#f97316" },
  pbx: { label: "PBX", color: "#06b6d4" },
  "tray-fiber": { label: "Fibra", color: "#d946ef" },
  "tray-1u": { label: "Bandeja 1U", color: "#52525b" },
  "tray-2u": { label: "Bandeja 2U", color: "#52525b" },
  "cable-organizer": { label: "Organizador", color: "#78716c" },
  other: { label: "Otro", color: "#6b7280" },
};

const STATUS_COLORS: Record<number, string> = { 0: "#ef4444", 1: "#22c55e", 2: "#f59e0b", 3: "#8b5cf6" };

// ── Main Component ────────────────────────────────────────────────────────────

function MobileRackViewer() {
  const searchParams = useSearchParams();
  const mapId = searchParams.get("mapId") || "";
  const nodeId = searchParams.get("nodeId") || "";

  const [rackName, setRackName] = useState("");
  const [totalUnits, setTotalUnits] = useState(0);
  const [devices, setDevices] = useState<RackDevice[]>([]);
  const [monitors, setMonitors] = useState<Map<number, KumaMonitor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!mapId) return;
    try {
      const [mapRes, kumaRes] = await Promise.all([
        fetch(apiUrl(`/api/maps/${mapId}`)),
        fetch(apiUrl("/api/kuma")),
      ]);
      if (mapRes.ok) {
        const data = await mapRes.json();
        const node = (data.nodes || []).find((n: any) => n.id === nodeId);
        if (node) {
          const cd = safeJsonParse<NodeCustomData>(node.custom_data);
          setRackName(cd.rackName || node.label || "Rack");
          setTotalUnits(cd.totalUnits || 24);
          setDevices((cd.devices as any as RackDevice[]) || []);
        }
      }
      if (kumaRes.ok) {
        const data = await kumaRes.json();
        const monMap = new Map<number, KumaMonitor>();
        (data.monitors || []).forEach((m: KumaMonitor) => monMap.set(m.id, m));
        setMonitors(monMap);
      }
    } catch {}
    finally { setLoading(false); }
  }, [mapId, nodeId]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Build occupancy map (U position → device)
  const occMap = useMemo(() => {
    const m = new Map<number, RackDevice>();
    devices.forEach((d) => {
      for (let i = 0; i < d.sizeUnits; i++) m.set(d.unit + i, d);
    });
    return m;
  }, [devices]);

  // Stats
  const stats = useMemo(() => {
    let up = 0, down = 0, unmonitored = 0;
    devices.forEach((d) => {
      if (!d.monitorId) { unmonitored++; return; }
      const m = monitors.get(d.monitorId);
      if (m?.status === 1) up++;
      else if (m?.status === 0) down++;
      else unmonitored++;
    });
    const occupiedUnits = devices.reduce((sum, d) => sum + d.sizeUnits, 0);
    return { up, down, unmonitored, occupiedUnits, freeUnits: totalUnits - occupiedUnits };
  }, [devices, monitors, totalUnits]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 px-3 py-2.5 flex items-center gap-2" style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link
          href={mapId ? `/mobile/map?id=${mapId}` : "/mobile"}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] active:scale-95"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-bold text-[#ededed] truncate">{rackName}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-[#555]">{totalUnits}U · {devices.length} equipos</span>
            {stats.down > 0 && <span className="text-[9px] font-bold text-red-400">{stats.down} DOWN</span>}
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="px-3 py-2.5 flex gap-2">
        <StatPill label="UP" value={stats.up} color="#22c55e" />
        <StatPill label="DOWN" value={stats.down} color="#ef4444" />
        <StatPill label="Libre" value={`${stats.freeUnits}U`} color="#555" />
        <div className="flex-1" />
        <span className="text-[9px] text-[#444] self-center">
          {Math.round((stats.occupiedUnits / totalUnits) * 100)}% ocupado
        </span>
      </div>

      {/* Occupancy bar */}
      <div className="mx-3 h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${(stats.occupiedUnits / totalUnits) * 100}%`,
            background: stats.down > 0 ? "linear-gradient(90deg, #22c55e, #ef4444)" : "#22c55e",
          }}
        />
      </div>

      {/* Rack visual */}
      <div className="px-3 mb-3">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Rack units - top to bottom (highest U first) */}
          {Array.from({ length: totalUnits }, (_, i) => totalUnits - i).map((u) => {
            const dev = occMap.get(u);
            const isTop = dev && dev.unit + dev.sizeUnits - 1 === u;
            const isBottom = dev && dev.unit === u;
            const isMiddle = dev && !isTop && !isBottom;

            // Skip middle/bottom units (device renders from top unit)
            if (dev && !isTop) return null;

            if (!dev) {
              // Empty unit
              return (
                <div
                  key={u}
                  className="flex items-center h-6"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                >
                  <span className="w-7 text-center text-[8px] font-mono text-[#333]">{u}</span>
                  <div className="flex-1 h-full" style={{ background: "rgba(255,255,255,0.01)" }} />
                </div>
              );
            }

            // Device block
            const meta = TYPE_META[dev.type] || TYPE_META.other;
            const color = dev.color || meta.color;
            const mon = dev.monitorId ? monitors.get(dev.monitorId) : null;
            const statusColor = mon ? (STATUS_COLORS[mon.status] || "#6b7280") : undefined;
            const h = dev.sizeUnits * 24; // 24px per U on mobile

            return (
              <button
                key={u}
                onClick={() => setExpandedDevice(expandedDevice === dev.id ? null : dev.id)}
                className="w-full flex items-stretch text-left active:opacity-80 transition-all"
                style={{
                  height: h,
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* U label */}
                <div className="w-7 flex items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.3)" }}>
                  <span className="text-[8px] font-mono text-[#444]">{dev.unit}</span>
                </div>

                {/* Device body */}
                <div
                  className="flex-1 flex items-center gap-2 px-2.5 min-w-0"
                  style={{
                    background: `${color}12`,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  {/* Status dot */}
                  {statusColor && (
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        background: statusColor,
                        boxShadow: mon?.status === 0 ? `0 0 6px ${statusColor}` : "none",
                      }}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-[#ddd] truncate">{dev.label}</div>
                    {dev.sizeUnits >= 2 && (
                      <div className="text-[8px] text-[#555] truncate">{meta.label}{dev.model ? ` · ${dev.model}` : ""}</div>
                    )}
                  </div>

                  <span className="text-[8px] font-mono text-[#444] shrink-0">{dev.sizeUnits}U</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Device detail cards */}
      <div className="px-3 pb-20 space-y-2">
        <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider px-1">Equipos</div>

        {[...devices].sort((a, b) => b.unit - a.unit).map((dev) => {
          const meta = TYPE_META[dev.type] || TYPE_META.other;
          const color = dev.color || meta.color;
          const mon = dev.monitorId ? monitors.get(dev.monitorId) : null;
          const statusColor = mon ? (STATUS_COLORS[mon.status] || "#6b7280") : undefined;
          const isExpanded = expandedDevice === dev.id;

          return (
            <div key={dev.id}>
              <button
                onClick={() => setExpandedDevice(isExpanded ? null : dev.id)}
                className="w-full rounded-2xl px-3.5 py-3 text-left active:scale-[0.98] transition-all"
                style={{
                  background: mon?.status === 0 ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${mon?.status === 0 ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Color badge */}
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}22`, border: `1px solid ${color}44` }}
                  >
                    <span className="text-[10px] font-bold" style={{ color }}>{dev.unit}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#ddd] truncate">{dev.label}</span>
                      {statusColor && (
                        <span
                          className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${statusColor}22`, color: statusColor }}
                        >
                          {mon!.status === 1 ? "UP" : mon!.status === 0 ? "DOWN" : "PEND"}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#555] truncate">
                      {meta.label} · U{dev.unit}-{dev.unit + dev.sizeUnits - 1} · {dev.sizeUnits}U
                      {dev.model ? ` · ${dev.model}` : ""}
                    </div>
                  </div>

                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"
                    className="shrink-0 transition-transform"
                    style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div
                  className="mx-2 mt-1 rounded-xl p-3 space-y-2"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.04)" }}
                >
                  {dev.managementIp && <DetailRow label="IP Gestión" value={dev.managementIp} mono />}
                  {dev.model && <DetailRow label="Modelo" value={dev.model} />}
                  {dev.serial && <DetailRow label="Serie" value={dev.serial} mono />}
                  {mon?.ping != null && <DetailRow label="Latencia" value={`${mon.ping}ms`} />}
                  {mon?.msg && <DetailRow label="Mensaje" value={mon.msg} />}
                  {dev.portCount && <DetailRow label="Puertos" value={`${dev.portCount}`} />}
                  {dev.isPoeCapable && <DetailRow label="PoE" value="Sí" />}
                  {dev.notes && <DetailRow label="Notas" value={dev.notes} />}

                  {/* Switch ports summary */}
                  {dev.switchPorts && dev.switchPorts.length > 0 && (
                    <div>
                      <div className="text-[9px] text-[#555] font-bold uppercase mb-1">Puertos Switch</div>
                      <div className="flex flex-wrap gap-1">
                        {dev.switchPorts.slice(0, 48).map((p: any) => (
                          <div
                            key={p.port}
                            className="h-5 w-5 rounded flex items-center justify-center text-[7px] font-mono"
                            style={{
                              background: p.connected ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.03)",
                              border: `1px solid ${p.connected ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`,
                              color: p.connected ? "#22c55e" : "#444",
                            }}
                            title={`Port ${p.port}${p.vlan ? ` VLAN ${p.vlan}` : ""}`}
                          >
                            {p.port}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Patch ports summary */}
                  {dev.ports && dev.ports.length > 0 && (
                    <div>
                      <div className="text-[9px] text-[#555] font-bold uppercase mb-1">Puertos Patch</div>
                      <div className="flex flex-wrap gap-1">
                        {dev.ports.slice(0, 48).map((p: any) => (
                          <div
                            key={p.port}
                            className="h-5 w-5 rounded flex items-center justify-center text-[7px] font-mono"
                            style={{
                              background: p.connected ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                              border: `1px solid ${p.connected ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)"}`,
                              color: p.connected ? "#8b5cf6" : "#444",
                            }}
                          >
                            {p.port}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Router interfaces */}
                  {dev.routerInterfaces && dev.routerInterfaces.length > 0 && (
                    <div>
                      <div className="text-[9px] text-[#555] font-bold uppercase mb-1">Interfaces</div>
                      {dev.routerInterfaces.map((iface: any) => (
                        <div key={iface.id} className="flex items-center gap-2 py-1">
                          <div className="h-2 w-2 rounded-full" style={{ background: iface.connected ? "#22c55e" : "#555" }} />
                          <span className="text-[10px] text-[#888] font-mono">{iface.name}</span>
                          <span className="text-[9px] text-[#555]">{iface.type}</span>
                          {iface.ipAddress && <span className="text-[9px] font-mono text-[#60a5fa]">{iface.ipAddress}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-[#555]">{label}</span>
      <span className={`text-[10px] text-[#aaa] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div
      className="px-2.5 py-1 rounded-lg flex items-center gap-1.5"
      style={{ background: `${color}11`, border: `1px solid ${color}22` }}
    >
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[9px] font-bold" style={{ color }}>{value}</span>
      <span className="text-[8px] text-[#555]">{label}</span>
    </div>
  );
}

export default function MobileRackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </div>
    }>
      <MobileRackViewer />
    </Suspense>
  );
}
