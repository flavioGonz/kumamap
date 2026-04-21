"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, Cpu, HardDrive, Network, RefreshCw, Wifi, WifiOff,
  Clock, Router, Globe, Server, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface MikrotikInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  speed?: string;
  macAddress?: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
  comment?: string;
}

interface MikrotikIpAddress {
  address: string;
  network: string;
  interface: string;
  disabled: boolean;
  dynamic: boolean;
}

interface MikrotikResource {
  uptime: string;
  cpuLoad: number;
  cpuCount: number;
  cpuFrequency: number;
  freeMemory: number;
  totalMemory: number;
  freeHddSpace: number;
  totalHddSpace: number;
  architectureName: string;
  boardName: string;
  platform: string;
  version: string;
}

interface MikrotikIdentity {
  name: string;
}

interface MikrotikRouterboard {
  model?: string;
  serialNumber?: string;
  firmwareType?: string;
  currentFirmware?: string;
  upgradeFirmware?: string;
}

interface MikrotikDhcpLease {
  address: string;
  macAddress: string;
  hostName?: string;
  status: string;
  server: string;
  comment?: string;
}

interface MikrotikResult {
  ip: string;
  timestamp: number;
  reachable: boolean;
  cached?: boolean;
  error?: string;
  identity?: MikrotikIdentity;
  resource?: MikrotikResource;
  routerboard?: MikrotikRouterboard;
  interfaces?: MikrotikInterface[];
  ipAddresses?: MikrotikIpAddress[];
  dhcpLeases?: MikrotikDhcpLease[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function parseUptime(uptime: string): string {
  // RouterOS uptime format: "1w2d3h4m5s" or "3d12:30:00"
  return uptime;
}

const ACCENT = "#8b5cf6"; // Purple for MikroTik

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  ip: string;
  port?: number;  // Puerto de la REST API (default: auto HTTPS 443 / HTTP 80)
  user?: string;
  password?: string;
  compact?: boolean; // For map sidebar (smaller layout)
}

export default function MikrotikStatusPanel({ ip, port, user, password, compact }: Props) {
  const [data, setData] = useState<MikrotikResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showDhcp, setShowDhcp] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBytesRef = useRef<Map<string, { rx: number; tx: number; ts: number }>>(new Map());

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ ip });
      if (port) params.set("port", String(port));
      if (user) params.set("user", user);
      if (password) params.set("pass", password);
      const res = await fetch(apiUrl(`/api/mikrotik/poll?${params}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: MikrotikResult = await res.json();
      setData(result);
      setError(result.error || null);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [ip, user, password]);

  useEffect(() => {
    fetchData();
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 15000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [fetchData, autoRefresh]);

  // Calculate rates
  const getRates = (iface: MikrotikInterface) => {
    const key = iface.name;
    const prev = prevBytesRef.current.get(key);
    const now = Date.now();

    if (prev && now - prev.ts > 0) {
      const dtSec = (now - prev.ts) / 1000;
      const rxRate = Math.max(0, (iface.rxBytes - prev.rx) / dtSec);
      const txRate = Math.max(0, (iface.txBytes - prev.tx) / dtSec);
      prevBytesRef.current.set(key, { rx: iface.rxBytes, tx: iface.txBytes, ts: now });
      return { rxRate, txRate };
    }

    prevBytesRef.current.set(key, { rx: iface.rxBytes, tx: iface.txBytes, ts: now });
    return { rxRate: 0, txRate: 0 };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2" style={{ color: "rgba(255,255,255,0.3)" }}>
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-xs">Conectando a MikroTik...</span>
      </div>
    );
  }

  if (!data || !data.reachable) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <WifiOff className="w-4 h-4" style={{ color: "#ef4444" }} />
          <span className="text-xs font-bold" style={{ color: "#ef4444" }}>MikroTik no alcanzable</span>
        </div>
        <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          {error || "No se pudo conectar a la REST API"}
        </div>
        <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
          Verificá que el servicio www o www-ssl esté habilitado en el router ({ip})
        </div>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="mt-3 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5"
          style={{ background: "rgba(139,92,246,0.15)", color: ACCENT, border: `1px solid ${ACCENT}40` }}
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    );
  }

  const res = data.resource;
  const memUsed = res ? res.totalMemory - res.freeMemory : 0;
  const memPct = res ? Math.round((memUsed / res.totalMemory) * 100) : 0;
  const hddUsed = res ? res.totalHddSpace - res.freeHddSpace : 0;
  const hddPct = res ? Math.round((hddUsed / res.totalHddSpace) * 100) : 0;
  const activeIfaces = data.interfaces?.filter((i) => i.running && !i.disabled) || [];
  const allIfaces = data.interfaces || [];

  return (
    <div className={compact ? "p-3 space-y-3" : "p-4 space-y-4"}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ background: `${ACCENT}20`, border: `1px solid ${ACCENT}40` }}
          >
            <Router className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
                {data.identity?.name || ip}
              </span>
              <Wifi className="w-3 h-3" style={{ color: "#22c55e" }} />
              {data.cached && (
                <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                  CACHE
                </span>
              )}
            </div>
            <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              {res?.boardName || "MikroTik"} · RouterOS {res?.version || "?"}
              {data.routerboard?.model ? ` · ${data.routerboard.model}` : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="p-1.5 rounded-lg transition-all"
            style={{ background: autoRefresh ? `${ACCENT}15` : "transparent", color: autoRefresh ? ACCENT : "rgba(255,255,255,0.2)" }}
            title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          >
            <Activity className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="p-1.5 rounded-lg transition-all hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── System info badges ── */}
      {res && (
        <div className="flex flex-wrap gap-1.5">
          <InfoBadge icon={<Clock className="w-3 h-3" />} label="Uptime" value={parseUptime(res.uptime)} color="#22c55e" />
          <InfoBadge icon={<Server className="w-3 h-3" />} label="Arch" value={res.architectureName} color="#3b82f6" />
          <InfoBadge icon={<Cpu className="w-3 h-3" />} label="CPU" value={`${res.cpuCount}× ${res.cpuFrequency}MHz`} color="#f59e0b" />
          {data.routerboard?.serialNumber && (
            <InfoBadge icon={<Globe className="w-3 h-3" />} label="S/N" value={data.routerboard.serialNumber} color="#06b6d4" />
          )}
          {data.routerboard?.currentFirmware && (
            <InfoBadge icon={<Server className="w-3 h-3" />} label="FW" value={data.routerboard.currentFirmware} color="#a78bfa" />
          )}
        </div>
      )}

      {/* ── CPU / Memory / Disk gauges ── */}
      {res && (
        <div className="grid grid-cols-3 gap-2">
          <GaugeCard label="CPU" value={res.cpuLoad} unit="%" color={res.cpuLoad > 80 ? "#ef4444" : res.cpuLoad > 50 ? "#f59e0b" : "#22c55e"} />
          <GaugeCard label="RAM" value={memPct} unit="%" subtitle={`${formatBytes(memUsed)} / ${formatBytes(res.totalMemory)}`} color={memPct > 85 ? "#ef4444" : memPct > 60 ? "#f59e0b" : "#22c55e"} />
          <GaugeCard label="Disco" value={hddPct} unit="%" subtitle={`${formatBytes(hddUsed)} / ${formatBytes(res.totalHddSpace)}`} color={hddPct > 85 ? "#ef4444" : hddPct > 60 ? "#f59e0b" : "#22c55e"} />
        </div>
      )}

      {/* ── Interfaces ── */}
      {allIfaces.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            <Network className="w-3 h-3" style={{ color: ACCENT }} />
            Interfaces ({activeIfaces.length}/{allIfaces.length} activas)
          </div>
          <div className="space-y-1">
            {allIfaces.map((iface) => {
              const rates = data.reachable ? getRates(iface) : { rxRate: 0, txRate: 0 };
              const ipAddr = data.ipAddresses?.find((a) => a.interface === iface.name);
              return (
                <InterfaceRow key={iface.name} iface={iface} ip={ipAddr?.address} rxRate={rates.rxRate} txRate={rates.txRate} compact={compact} />
              );
            })}
          </div>
        </div>
      )}

      {/* ── IP Addresses ── */}
      {data.ipAddresses && data.ipAddresses.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            <Globe className="w-3 h-3" style={{ color: "#3b82f6" }} />
            Direcciones IP ({data.ipAddresses.length})
          </div>
          <div className="space-y-1">
            {data.ipAddresses.map((addr, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: addr.disabled ? "#555" : "#22c55e" }} />
                <span className="text-[10px] font-mono font-bold" style={{ color: "#93c5fd" }}>{addr.address}</span>
                <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{addr.interface}</span>
                {addr.dynamic && (
                  <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>D</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DHCP Leases (collapsible) ── */}
      {data.dhcpLeases && data.dhcpLeases.length > 0 && (
        <div>
          <button
            onClick={() => setShowDhcp(!showDhcp)}
            className="w-full text-[9px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 cursor-pointer"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            <Server className="w-3 h-3" style={{ color: "#10b981" }} />
            DHCP Leases ({data.dhcpLeases.length})
            {showDhcp ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showDhcp && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.dhcpLeases.map((lease, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: lease.status === "bound" ? "#22c55e" : lease.status === "waiting" ? "#f59e0b" : "#555" }}
                  />
                  <span className="text-[10px] font-mono" style={{ color: "#93c5fd" }}>{lease.address}</span>
                  <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>{lease.macAddress}</span>
                  {lease.hostName && (
                    <span className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{lease.hostName}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="text-[8px] text-center" style={{ color: "rgba(255,255,255,0.15)" }}>
        MikroTik REST API · {ip} · {new Date(data.timestamp).toLocaleTimeString("es")}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function InfoBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: `${color}08`, border: `1px solid ${color}15` }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-[8px] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
      <span className="text-[9px] font-mono font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function GaugeCard({ label, value, unit, subtitle, color }: {
  label: string; value: number; unit: string; subtitle?: string; color: string;
}) {
  return (
    <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="relative mx-auto" style={{ width: 44, height: 44 }}>
        <svg viewBox="0 0 36 36" width="44" height="44">
          <path
            d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${Math.min(value, 100)}, 100`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono" style={{ color }}>
          {value}{unit}
        </span>
      </div>
      <div className="text-[9px] font-bold mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</div>
      {subtitle && (
        <div className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>{subtitle}</div>
      )}
    </div>
  );
}

function InterfaceRow({ iface, ip, rxRate, txRate, compact }: {
  iface: MikrotikInterface; ip?: string; rxRate: number; txRate: number; compact?: boolean;
}) {
  const statusColor = iface.disabled ? "#555" : iface.running ? "#22c55e" : "#ef4444";
  const typeColors: Record<string, string> = {
    ether: "#3b82f6", vlan: "#8b5cf6", bridge: "#06b6d4", wlan: "#f59e0b",
    pppoe: "#ef4444", l2tp: "#ec4899", ovpn: "#10b981", gre: "#f97316",
    bonding: "#a78bfa", cap: "#f59e0b",
  };
  const typeColor = typeColors[iface.type] || "#6b7280";

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: statusColor, boxShadow: iface.running ? `0 0 4px ${statusColor}60` : "none" }} />
      <span className="text-[8px] font-bold px-1 py-0.5 rounded font-mono shrink-0" style={{ background: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}25` }}>
        {iface.type}
      </span>
      <span className="text-[10px] font-mono font-bold truncate" style={{ color: iface.running ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)" }}>
        {iface.name}
      </span>
      {ip && (
        <span className="text-[9px] font-mono shrink-0" style={{ color: "#93c5fd" }}>{ip}</span>
      )}
      {!compact && iface.running && (
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[8px] font-mono" style={{ color: "#22c55e" }}>↓{formatBytes(rxRate)}/s</span>
          <span className="text-[8px] font-mono" style={{ color: "#3b82f6" }}>↑{formatBytes(txRate)}/s</span>
        </div>
      )}
      {compact && iface.running && (
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-[7px] font-mono" style={{ color: "#22c55e" }}>↓{formatBytes(iface.rxBytes)}</span>
          <span className="text-[7px] font-mono" style={{ color: "#3b82f6" }}>↑{formatBytes(iface.txBytes)}</span>
        </div>
      )}
      {iface.macAddress && !compact && (
        <span className="text-[7px] font-mono shrink-0" style={{ color: "rgba(255,255,255,0.15)" }}>{iface.macAddress}</span>
      )}
    </div>
  );
}
