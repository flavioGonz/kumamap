"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Activity, Cpu, HardDrive, Network, RefreshCw, Wifi, WifiOff, Clock, Server } from "lucide-react";

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
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    if (!ip) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/snmp/poll", {
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
  const labelStyle: React.CSSProperties = { fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" };
  const valueStyle: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.8)", fontFamily: "monospace" };
  const cardStyle: React.CSSProperties = { background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: "10px 12px" };

  // ── Not reachable / loading / error states ──
  if (loading && !data) {
    return (
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 12px" }}>
        <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: "#3b82f6" }} />
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
  const displayIfaces = showAllInterfaces ? ifaces : ifaces.slice(0, 12);

  return (
    <div className="flex flex-col gap-2">
      {/* Header: reachable badge + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <Wifi className="w-3 h-3" style={{ color: "#22c55e" }} />
            <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>SNMP Activo</span>
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

      {/* System info row */}
      {sys && (
        <div style={cardStyle} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Server className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>
              {sys.name || ip}
            </span>
          </div>
          {sys.description && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sys.description}
            </p>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            {sys.uptimeStr && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" style={{ color: "rgba(255,255,255,0.25)" }} />
                <span style={{ ...valueStyle, fontSize: 11 }}>Uptime: {sys.uptimeStr}</span>
              </div>
            )}
            {sys.location && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{sys.location}</span>
            )}
          </div>
        </div>
      )}

      {/* CPU + Storage gauges */}
      {(cpu || storage.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {/* CPU */}
          {cpu && (
            <div style={cardStyle}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" style={{ color: cpuColor(cpu.avgLoad) }} />
                  <span style={labelStyle}>CPU</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: cpuColor(cpu.avgLoad) }}>
                  {cpu.avgLoad}%
                </span>
              </div>
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
                </div>
              )}
            </div>
          )}

          {/* Storage (show top entry — usually RAM or main disk) */}
          {storage.length > 0 && (
            <div style={cardStyle}>
              {storage.slice(0, 3).map((s, i) => (
                <div key={i} className={i > 0 ? "mt-2" : ""}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5" style={{ overflow: "hidden" }}>
                      <HardDrive className="w-3 h-3 shrink-0" style={{ color: storageColor(s.percentUsed) }} />
                      <span style={{ ...labelStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>
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
        </div>
      )}

      {/* Interfaces table (for switches, routers) */}
      {ifaces.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-1.5">
              <Network className="w-3 h-3" style={{ color: "#3b82f6" }} />
              <span style={labelStyle}>Interfaces</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                {upIfaces}/{ifaces.length} up
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{upIfaces}</span>
              <span className="w-2 h-2 rounded-full ml-1.5" style={{ background: "#ef4444" }} />
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{ifaces.length - upIfaces}</span>
            </div>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
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
          {ifaces.length > 12 && (
            <button
              onClick={() => setShowAllInterfaces(!showAllInterfaces)}
              className="w-full py-1.5 text-[10px] font-semibold transition-all cursor-pointer"
              style={{ color: "#3b82f6", background: "rgba(59,130,246,0.04)", borderTop: `1px solid ${borderColor}` }}
            >
              {showAllInterfaces ? "Mostrar menos" : `Ver todas (${ifaces.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
