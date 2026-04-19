"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, Cpu, HardDrive, Network, RefreshCw, Wifi, WifiOff,
  Clock, Server, Phone, Video, Router, MonitorSmartphone, Database,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

// ── Types matching the API response ─────────────────────────────────────────

interface SnmpSystem {
  description?: string;
  uptime?: number;
  uptimeStr?: string;
  name?: string;
  contact?: string;
  location?: string;
}

interface SnmpInterface {
  index: number;
  name: string;
  alias?: string;
  type: number;
  speed: number;
  operStatus: string;
  adminStatus: string;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
}

interface SnmpStorage {
  description: string;
  sizeMB: number;
  usedMB: number;
  percentUsed: number;
}

interface SnmpCpu {
  cores: number;
  avgLoad: number;
  perCore: number[];
}

interface SnmpResult {
  ip: string;
  timestamp: number;
  reachable: boolean;
  cached?: boolean;
  error?: string;
  system?: SnmpSystem;
  interfaces?: SnmpInterface[];
  storage?: SnmpStorage[];
  cpu?: SnmpCpu;
}

// ── Device type config ─────────────────────────────────────────────────────

interface DeviceTypeConfig {
  icon: React.ReactNode;
  label: string;
  accentColor: string;
  showInterfaces: boolean;
  showCpu: boolean;
  showStorage: boolean;
  interfacesLabel: string;
  storageLabel: string;
}

const DEVICE_CONFIGS: Record<string, DeviceTypeConfig> = {
  switch: {
    icon: <Network className="w-3.5 h-3.5" />,
    label: "Switch",
    accentColor: "#3b82f6",
    showInterfaces: true,
    showCpu: true,
    showStorage: true,
    interfacesLabel: "Puertos",
    storageLabel: "Memoria",
  },
  router: {
    icon: <Router className="w-3.5 h-3.5" />,
    label: "Router",
    accentColor: "#8b5cf6",
    showInterfaces: true,
    showCpu: true,
    showStorage: true,
    interfacesLabel: "Interfaces",
    storageLabel: "Memoria",
  },
  nvr: {
    icon: <Video className="w-3.5 h-3.5" />,
    label: "NVR",
    accentColor: "#f59e0b",
    showInterfaces: true,
    showCpu: true,
    showStorage: true,
    interfacesLabel: "Interfaces de Red",
    storageLabel: "Almacenamiento",
  },
  pbx: {
    icon: <Phone className="w-3.5 h-3.5" />,
    label: "PBX",
    accentColor: "#10b981",
    showInterfaces: true,
    showCpu: true,
    showStorage: true,
    interfacesLabel: "Interfaces de Red",
    storageLabel: "Almacenamiento",
  },
  server: {
    icon: <Server className="w-3.5 h-3.5" />,
    label: "Servidor",
    accentColor: "#06b6d4",
    showInterfaces: true,
    showCpu: true,
    showStorage: true,
    interfacesLabel: "Interfaces de Red",
    storageLabel: "Almacenamiento",
  },
};

const DEFAULT_CONFIG: DeviceTypeConfig = {
  icon: <MonitorSmartphone className="w-3.5 h-3.5" />,
  label: "Equipo",
  accentColor: "#6b7280",
  showInterfaces: true,
  showCpu: true,
  showStorage: true,
  interfacesLabel: "Interfaces",
  storageLabel: "Almacenamiento",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatMB(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function statusColor(status: string): string {
  if (status === "up") return "#22c55e";
  if (status === "down") return "#ef4444";
  if (status === "dormant") return "#f59e0b";
  return "#6b7280";
}

function cpuColor(load: number): string {
  if (load >= 90) return "#ef4444";
  if (load >= 70) return "#f59e0b";
  if (load >= 50) return "#eab308";
  return "#22c55e";
}

function storageColor(pct: number): string {
  if (pct >= 90) return "#ef4444";
  if (pct >= 75) return "#f59e0b";
  return "#3b82f6";
}

// ── Bar component ───────────────────────────────────────────────────────────

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ width: "100%", height, borderRadius: height / 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: "100%",
          borderRadius: height / 2,
          background: color,
          transition: "width 0.5s ease",
        }}
      />
    </div>
  );
}

// ── Section header for SNMP tab ─────────────────────────────────────────────

function SnmpSectionHeader({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {title}
        </span>
      </div>
      {badge}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SnmpStatusPanel({
  ip,
  community,
  deviceType,
}: {
  ip: string;
  community?: string;
  deviceType?: string;
}) {
  const [data, setData] = useState<SnmpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllInterfaces, setShowAllInterfaces] = useState(false);
  const [showAllStorage, setShowAllStorage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const config = (deviceType && DEVICE_CONFIGS[deviceType]) || DEFAULT_CONFIG;

  const poll = useCallback(async () => {
    if (!ip) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/snmp/poll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, community: community || "public", deviceType }),
        signal: controller.signal,
      });

      if (!mountedRef.current) return;

      const json = await res.json();
      if (!mountedRef.current) return;

      if (!res.ok) {
        setError(json.error || "Error polling SNMP");
        setData(null);
      } else {
        setData(json);
        setError(null);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (mountedRef.current) {
        setError(err.message || "Network error");
        setData(null);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ip, community, deviceType]);

  // Auto-poll on mount and when IP/community changes
  useEffect(() => {
    mountedRef.current = true;
    poll();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [poll]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [poll]);

  if (!ip) return null;

  const panelBg = "rgba(255,255,255,0.02)";
  const borderColor = "rgba(255,255,255,0.06)";
  const cardStyle: React.CSSProperties = { background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: "10px 12px" };

  // ── Not reachable / loading / error states ──
  if (loading && !data) {
    return (
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 12px" }}>
        <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: config.accentColor }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Consultando SNMP en {ip}...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 8, padding: "12px" }}>
        <WifiOff className="w-3.5 h-3.5 shrink-0" style={{ color: "#ef4444" }} />
        <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>
        <button
          onClick={poll}
          className="ml-auto shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  if (!data.reachable) {
    return (
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 8, padding: "12px" }}>
        <WifiOff className="w-3.5 h-3.5 shrink-0" style={{ color: "#ef4444" }} />
        <span style={{ fontSize: 11, color: "#ef4444" }}>No se pudo alcanzar {ip} por SNMP</span>
        {data.error && <span style={{ fontSize: 10, color: "rgba(239,68,68,0.6)" }}>— {data.error}</span>}
        <button
          onClick={poll}
          className="ml-auto shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Successful data ──
  const sys = data.system;
  const ifaces = data.interfaces || [];
  const storage = data.storage || [];
  const cpu = data.cpu;
  const upIfaces = ifaces.filter(i => i.operStatus === "up").length;
  const totalErrors = ifaces.reduce((sum, i) => sum + i.inErrors + i.outErrors, 0);

  // Device-type-aware: NVR/server show more storage, switch/router show more interfaces
  const isStorageDevice = deviceType === "nvr" || deviceType === "server";
  const maxIfacesDefault = isStorageDevice ? 6 : 12;
  const maxStorageDefault = isStorageDevice ? 8 : 3;
  const displayIfaces = showAllInterfaces ? ifaces : ifaces.slice(0, maxIfacesDefault);
  const displayStorage = showAllStorage ? storage : storage.slice(0, maxStorageDefault);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Header: status badge + device type + refresh ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <Wifi className="w-3 h-3" style={{ color: "#22c55e" }} />
            <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>SNMP Activo</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: `${config.accentColor}10`, border: `1px solid ${config.accentColor}30` }}>
            <span style={{ color: config.accentColor }}>{config.icon}</span>
            <span style={{ fontSize: 10, color: config.accentColor, fontWeight: 600 }}>{config.label}</span>
          </div>
          {data.cached && (
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>cache</span>
          )}
        </div>
        <button
          onClick={poll}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ── System info card ── */}
      {sys && (
        <div style={cardStyle} className="flex flex-col gap-1.5">
          <SnmpSectionHeader
            icon={<Server className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />}
            title="Sistema"
          />
          <div className="flex items-center gap-1.5 -mt-1">
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>
              {sys.name || ip}
            </span>
          </div>
          {sys.description && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0, lineHeight: 1.4 }}>
              {sys.description}
            </p>
          )}
          <div className="flex items-center gap-4 flex-wrap mt-0.5">
            {sys.uptimeStr && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" style={{ color: "rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>Uptime: {sys.uptimeStr}</span>
              </div>
            )}
            {sys.contact && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Contacto: {sys.contact}</span>
            )}
            {sys.location && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Ubicación: {sys.location}</span>
            )}
          </div>
        </div>
      )}

      {/* ── CPU + Storage gauges ── */}
      {(config.showCpu && cpu) || (config.showStorage && storage.length > 0) ? (
        <div className={`grid gap-2 ${cpu && storage.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
          {/* CPU */}
          {config.showCpu && cpu && (
            <div style={cardStyle}>
              <SnmpSectionHeader
                icon={<Cpu className="w-3 h-3" style={{ color: cpuColor(cpu.avgLoad) }} />}
                title="CPU"
                badge={
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: cpuColor(cpu.avgLoad) }}>
                    {cpu.avgLoad}%
                  </span>
                }
              />
              <ProgressBar pct={cpu.avgLoad} color={cpuColor(cpu.avgLoad)} />
              {cpu.cores > 1 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {cpu.perCore.map((load, i) => (
                    <div
                      key={i}
                      title={`Core ${i}: ${load}%`}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: cpuColor(load),
                        opacity: 0.3 + (load / 100) * 0.7,
                        transition: "opacity 0.5s",
                      }}
                    />
                  ))}
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginLeft: 4, alignSelf: "center" }}>
                    {cpu.cores} cores
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Quick storage summary (in gauge row) — only if NOT a storage-heavy device */}
          {config.showStorage && storage.length > 0 && !isStorageDevice && (
            <div style={cardStyle}>
              {storage.slice(0, 3).map((s, i) => (
                <div key={i} className={i > 0 ? "mt-2" : ""}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5" style={{ overflow: "hidden" }}>
                      <HardDrive className="w-3 h-3 shrink-0" style={{ color: storageColor(s.percentUsed) }} />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>
                        {s.description}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: storageColor(s.percentUsed) }}>
                      {s.percentUsed}%
                    </span>
                  </div>
                  <ProgressBar pct={s.percentUsed} color={storageColor(s.percentUsed)} height={4} />
                  <div className="flex justify-between mt-0.5">
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{formatMB(s.usedMB)} / {formatMB(s.sizeMB)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Full-width storage summary for storage-heavy devices (NVR/server) */}
          {config.showStorage && storage.length > 0 && isStorageDevice && cpu && (
            <div /> // placeholder to keep CPU in grid
          )}
        </div>
      ) : null}

      {/* ── Expanded storage section for NVR/Server ── */}
      {config.showStorage && isStorageDevice && storage.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-1.5">
              <Database className="w-3 h-3" style={{ color: config.accentColor }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {config.storageLabel}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                {storage.length} volúmenes
              </span>
            </div>
            {(() => {
              const totalMB = storage.reduce((s, v) => s + v.sizeMB, 0);
              const usedMB = storage.reduce((s, v) => s + v.usedMB, 0);
              const pct = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;
              return (
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: storageColor(pct) }}>
                  {formatMB(usedMB)} / {formatMB(totalMB)} ({pct}%)
                </span>
              );
            })()}
          </div>
          <div className="p-3 flex flex-col gap-2.5">
            {displayStorage.map((s, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5" style={{ overflow: "hidden" }}>
                    <HardDrive className="w-3 h-3 shrink-0" style={{ color: storageColor(s.percentUsed) }} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                      {s.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                      {formatMB(s.usedMB)} / {formatMB(s.sizeMB)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: storageColor(s.percentUsed), minWidth: 36, textAlign: "right" }}>
                      {s.percentUsed}%
                    </span>
                  </div>
                </div>
                <ProgressBar pct={s.percentUsed} color={storageColor(s.percentUsed)} height={5} />
              </div>
            ))}
          </div>
          {storage.length > maxStorageDefault && (
            <button
              onClick={() => setShowAllStorage(!showAllStorage)}
              className="w-full py-1.5 text-[10px] font-semibold transition-all cursor-pointer"
              style={{ color: config.accentColor, background: `${config.accentColor}08`, borderTop: `1px solid ${borderColor}` }}
            >
              {showAllStorage ? "Mostrar menos" : `Ver todos (${storage.length})`}
            </button>
          )}
        </div>
      )}

      {/* ── Interfaces table ── */}
      {config.showInterfaces && ifaces.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-1.5">
              <Network className="w-3 h-3" style={{ color: config.accentColor }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {config.interfacesLabel}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                {upIfaces}/{ifaces.length} up
              </span>
            </div>
            <div className="flex items-center gap-2">
              {totalErrors > 0 && (
                <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 600 }}>
                  {totalErrors} errores
                </span>
              )}
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{upIfaces}</span>
                <span className="w-2 h-2 rounded-full ml-1.5" style={{ background: "#ef4444" }} />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{ifaces.length - upIfaces}</span>
              </div>
            </div>
          </div>
          <div style={{ maxHeight: isStorageDevice ? 160 : 240, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "4px 8px", textAlign: "left", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>Puerto</th>
                  <th style={{ padding: "4px 6px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>Estado</th>
                  <th style={{ padding: "4px 6px", textAlign: "right", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>Velocidad</th>
                  <th style={{ padding: "4px 6px", textAlign: "right", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>↓ In</th>
                  <th style={{ padding: "4px 6px", textAlign: "right", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>↑ Out</th>
                  <th style={{ padding: "4px 6px", textAlign: "right", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>Err</th>
                </tr>
              </thead>
              <tbody>
                {displayIfaces.map(iface => (
                  <tr key={iface.index} style={{ borderTop: `1px solid ${borderColor}` }}>
                    <td style={{ padding: "3px 8px", color: "rgba(255,255,255,0.7)", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                      {iface.alias || iface.name}
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: 9,
                        fontWeight: 700,
                        color: statusColor(iface.operStatus),
                        background: `${statusColor(iface.operStatus)}15`,
                      }}>
                        {iface.operStatus}
                      </span>
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
                      {iface.speed > 0 ? (iface.speed >= 1000 ? `${iface.speed / 1000}G` : `${iface.speed}M`) : "—"}
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>
                      {formatBytes(iface.inOctets)}
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>
                      {formatBytes(iface.outOctets)}
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: (iface.inErrors + iface.outErrors) > 0 ? "#ef4444" : "rgba(255,255,255,0.25)" }}>
                      {iface.inErrors + iface.outErrors > 0 ? iface.inErrors + iface.outErrors : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ifaces.length > maxIfacesDefault && (
            <button
              onClick={() => setShowAllInterfaces(!showAllInterfaces)}
              className="w-full py-1.5 text-[10px] font-semibold transition-all cursor-pointer"
              style={{ color: config.accentColor, background: `${config.accentColor}08`, borderTop: `1px solid ${borderColor}` }}
            >
              {showAllInterfaces ? "Mostrar menos" : `Ver todas (${ifaces.length})`}
            </button>
          )}
        </div>
      )}

      {/* ── No data sections warning ── */}
      {!sys && !cpu && storage.length === 0 && ifaces.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "16px 12px" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            Equipo alcanzable pero no devolvió datos SNMP estándar.
            <br />
            <span style={{ fontSize: 10 }}>Verificá la comunidad SNMP y que el equipo soporte MIB-II / HOST-RESOURCES.</span>
          </span>
        </div>
      )}
    </div>
  );
}
