"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, Cpu, HardDrive, Network, RefreshCw, Wifi, WifiOff,
  Clock, Router, Globe, Server, ChevronDown, ChevronUp,
  Shield, FileText, Map, Radio, Layers, Database,
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

interface MikrotikIdentity { name: string; }
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

const ACCENT = "#8b5cf6";

// ── Section definitions ───────────────────────────────────────────────────

type SectionId = "overview" | "interfaces" | "ip" | "routes" | "dhcp" | "firewall" | "dns" | "logs" | "arp" | "queues";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const SECTIONS: SectionDef[] = [
  { id: "overview", label: "General", icon: <Router className="w-3.5 h-3.5" />, color: ACCENT },
  { id: "interfaces", label: "Interfaces", icon: <Network className="w-3.5 h-3.5" />, color: "#3b82f6" },
  { id: "ip", label: "IP", icon: <Globe className="w-3.5 h-3.5" />, color: "#06b6d4" },
  { id: "routes", label: "Routes", icon: <Map className="w-3.5 h-3.5" />, color: "#22c55e" },
  { id: "dhcp", label: "DHCP", icon: <Database className="w-3.5 h-3.5" />, color: "#10b981" },
  { id: "arp", label: "ARP", icon: <Layers className="w-3.5 h-3.5" />, color: "#f59e0b" },
  { id: "firewall", label: "Firewall", icon: <Shield className="w-3.5 h-3.5" />, color: "#ef4444" },
  { id: "dns", label: "DNS", icon: <Radio className="w-3.5 h-3.5" />, color: "#a78bfa" },
  { id: "queues", label: "Queues", icon: <Layers className="w-3.5 h-3.5" />, color: "#ec4899" },
  { id: "logs", label: "Logs", icon: <FileText className="w-3.5 h-3.5" />, color: "#6b7280" },
];

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  ip: string;
  port?: number;
  user?: string;
  password?: string;
  compact?: boolean;
}

export default function MikrotikStatusPanel({ ip, port, user, password, compact }: Props) {
  const [data, setData] = useState<MikrotikResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBytesRef = useRef<Record<string, { rx: number; tx: number; ts: number }>>({});

  const bodyPayload = useCallback(() => {
    const payload: any = { ip };
    if (port) payload.port = port;
    if (user) payload.user = user;
    if (password) payload.pass = password;
    return payload;
  }, [ip, port, user, password]);

  // Legacy helper for sub-components that still use URLSearchParams
  const baseParams = useCallback(() => {
    const p = new URLSearchParams({ ip });
    if (port) p.set("port", String(port));
    if (user) p.set("user", user);
    if (password) p.set("pass", password);
    return p;
  }, [ip, port, user, password]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/mikrotik/poll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: MikrotikResult = await res.json();
      setData(result);
      setError(result.error || null);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [bodyPayload]);

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
    const prev = prevBytesRef.current[key];
    const now = Date.now();
    if (prev && now - prev.ts > 0) {
      const dtSec = (now - prev.ts) / 1000;
      const rxRate = Math.max(0, (iface.rxBytes - prev.rx) / dtSec);
      const txRate = Math.max(0, (iface.txBytes - prev.tx) / dtSec);
      prevBytesRef.current[key] = { rx: iface.rxBytes, tx: iface.txBytes, ts: now };
      return { rxRate, txRate };
    }
    prevBytesRef.current[key] = { rx: iface.rxBytes, tx: iface.txBytes, ts: now };
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

  return (
    <div className={compact ? "p-2 space-y-2" : "p-3 space-y-3"}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: `${ACCENT}20`, border: `1px solid ${ACCENT}40` }}>
            <Router className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
                {data.identity?.name || ip}
              </span>
              <Wifi className="w-3 h-3" style={{ color: "#22c55e" }} />
              {data.cached && (
                <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>CACHE</span>
              )}
            </div>
            <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              {data.resource?.boardName || "MikroTik"} · RouterOS {data.resource?.version || "?"}
              {data.routerboard?.model ? ` · ${data.routerboard.model}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAutoRefresh(!autoRefresh)} className="p-1.5 rounded-lg transition-all"
            style={{ background: autoRefresh ? `${ACCENT}15` : "transparent", color: autoRefresh ? ACCENT : "rgba(255,255,255,0.2)" }}
            title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}>
            <Activity className="w-3 h-3" />
          </button>
          <button onClick={() => { setLoading(true); fetchData(); }} className="p-1.5 rounded-lg transition-all hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
        {SECTIONS.map((s) => {
          const active = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold whitespace-nowrap transition-all shrink-0"
              style={{
                background: active ? `${s.color}18` : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? `${s.color}40` : "rgba(255,255,255,0.04)"}`,
                color: active ? s.color : "rgba(255,255,255,0.3)",
              }}
            >
              <span style={{ color: active ? s.color : "rgba(255,255,255,0.2)" }}>{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── Section content ── */}
      <div className="min-h-[120px]">
        {activeSection === "overview" && <OverviewSection data={data} />}
        {activeSection === "interfaces" && <InterfacesSection data={data} getRates={getRates} compact={compact} />}
        {activeSection === "ip" && <IpSection data={data} />}
        {activeSection === "routes" && <RemoteSection ip={ip} port={port} user={user} password={password} path="/ip/route" title="Rutas IP" columns={routeColumns} baseParams={baseParams} />}
        {activeSection === "dhcp" && <DhcpSection data={data} ip={ip} port={port} user={user} password={password} baseParams={baseParams} />}
        {activeSection === "arp" && <RemoteSection ip={ip} port={port} user={user} password={password} path="/ip/arp" title="Tabla ARP" columns={arpColumns} baseParams={baseParams} />}
        {activeSection === "firewall" && <FirewallSection ip={ip} port={port} user={user} password={password} baseParams={baseParams} />}
        {activeSection === "dns" && <DnsSection ip={ip} port={port} user={user} password={password} baseParams={baseParams} />}
        {activeSection === "queues" && <RemoteSection ip={ip} port={port} user={user} password={password} path="/queue/simple" title="Queues" columns={queueColumns} baseParams={baseParams} />}
        {activeSection === "logs" && <RemoteSection ip={ip} port={port} user={user} password={password} path="/log" title="Logs" columns={logColumns} baseParams={baseParams} reverseOrder />}
      </div>

      {/* ── Footer ── */}
      <div className="text-[8px] text-center" style={{ color: "rgba(255,255,255,0.15)" }}>
        MikroTik REST API · {ip} · {new Date(data.timestamp).toLocaleTimeString("es")}
      </div>
    </div>
  );
}

// ── Overview section ──────────────────────────────────────────────────────

function OverviewSection({ data }: { data: MikrotikResult }) {
  const res = data.resource;
  if (!res) return <EmptyState text="Sin datos de recursos" />;

  const memUsed = res.totalMemory - res.freeMemory;
  const memPct = Math.round((memUsed / res.totalMemory) * 100);
  const hddUsed = res.totalHddSpace - res.freeHddSpace;
  const hddPct = Math.round((hddUsed / res.totalHddSpace) * 100);
  const activeIfaces = data.interfaces?.filter((i) => i.running && !i.disabled)?.length || 0;
  const totalIfaces = data.interfaces?.length || 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <InfoBadge icon={<Clock className="w-3 h-3" />} label="Uptime" value={res.uptime} color="#22c55e" />
        <InfoBadge icon={<Server className="w-3 h-3" />} label="Arch" value={res.architectureName} color="#3b82f6" />
        <InfoBadge icon={<Cpu className="w-3 h-3" />} label="CPU" value={`${res.cpuCount}× ${res.cpuFrequency}MHz`} color="#f59e0b" />
        {data.routerboard?.serialNumber && (
          <InfoBadge icon={<Globe className="w-3 h-3" />} label="S/N" value={data.routerboard.serialNumber} color="#06b6d4" />
        )}
        {data.routerboard?.currentFirmware && (
          <InfoBadge icon={<Server className="w-3 h-3" />} label="FW" value={data.routerboard.currentFirmware} color="#a78bfa" />
        )}
        <InfoBadge icon={<Network className="w-3 h-3" />} label="Ifaces" value={`${activeIfaces}/${totalIfaces}`} color="#8b5cf6" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <GaugeCard label="CPU" value={res.cpuLoad} unit="%" color={res.cpuLoad > 80 ? "#ef4444" : res.cpuLoad > 50 ? "#f59e0b" : "#22c55e"} />
        <GaugeCard label="RAM" value={memPct} unit="%" subtitle={`${formatBytes(memUsed)} / ${formatBytes(res.totalMemory)}`} color={memPct > 85 ? "#ef4444" : memPct > 60 ? "#f59e0b" : "#22c55e"} />
        <GaugeCard label="Disco" value={hddPct} unit="%" subtitle={`${formatBytes(hddUsed)} / ${formatBytes(res.totalHddSpace)}`} color={hddPct > 85 ? "#ef4444" : hddPct > 60 ? "#f59e0b" : "#22c55e"} />
      </div>
    </div>
  );
}

// ── Interfaces section ────────────────────────────────────────────────────

function InterfacesSection({ data, getRates, compact }: {
  data: MikrotikResult; getRates: (i: MikrotikInterface) => { rxRate: number; txRate: number }; compact?: boolean;
}) {
  const allIfaces = data.interfaces || [];
  const [filter, setFilter] = useState<"all" | "active" | "disabled">("all");

  const filtered = allIfaces.filter((i) => {
    if (filter === "active") return i.running && !i.disabled;
    if (filter === "disabled") return i.disabled;
    return true;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {(["all", "active", "disabled"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="text-[8px] font-bold px-2 py-1 rounded-md transition-all"
            style={{
              background: filter === f ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.02)",
              color: filter === f ? "#60a5fa" : "rgba(255,255,255,0.3)",
              border: `1px solid ${filter === f ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)"}`,
            }}
          >
            {f === "all" ? `Todas (${allIfaces.length})` : f === "active" ? `Activas (${allIfaces.filter(i => i.running && !i.disabled).length})` : `Deshabilitadas (${allIfaces.filter(i => i.disabled).length})`}
          </button>
        ))}
      </div>
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {filtered.map((iface) => {
          const rates = getRates(iface);
          const ipAddr = data.ipAddresses?.find((a) => a.interface === iface.name);
          return <InterfaceRow key={iface.name} iface={iface} ip={ipAddr?.address} rxRate={rates.rxRate} txRate={rates.txRate} compact={compact} />;
        })}
        {filtered.length === 0 && <EmptyState text="Sin interfaces" />}
      </div>
    </div>
  );
}

// ── IP section ────────────────────────────────────────────────────────────

function IpSection({ data }: { data: MikrotikResult }) {
  const addrs = data.ipAddresses || [];

  return (
    <div className="space-y-2">
      <SectionLabel icon={<Globe className="w-3 h-3" />} color="#06b6d4" text={`Direcciones IP (${addrs.length})`} />
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {addrs.map((addr, i) => (
          <div key={i} className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: addr.disabled ? "#555" : "#22c55e" }} />
            <span className="text-[10px] font-mono font-bold" style={{ color: "#93c5fd" }}>{addr.address}</span>
            <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>{addr.network}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.08)", color: "rgba(255,255,255,0.4)" }}>{addr.interface}</span>
            {addr.dynamic && <DynamicBadge />}
            <div className="ml-auto" />
          </div>
        ))}
        {addrs.length === 0 && <EmptyState text="Sin direcciones IP" />}
      </div>
    </div>
  );
}

// ── DHCP section ──────────────────────────────────────────────────────────

function DhcpSection({ data, ip, port, user, password, baseParams }: {
  data: MikrotikResult; ip: string; port?: number; user?: string; password?: string; baseParams: () => URLSearchParams;
}) {
  const [subTab, setSubTab] = useState<"leases" | "servers" | "networks">("leases");
  const leases = data.dhcpLeases || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(["leases", "servers", "networks"] as const).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className="text-[8px] font-bold px-2 py-1 rounded-md transition-all"
            style={{
              background: subTab === t ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.02)",
              color: subTab === t ? "#34d399" : "rgba(255,255,255,0.3)",
              border: `1px solid ${subTab === t ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.04)"}`,
            }}
          >
            {t === "leases" ? `Leases (${leases.length})` : t === "servers" ? "Servers" : "Networks"}
          </button>
        ))}
      </div>

      {subTab === "leases" && (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {leases.map((lease, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <div className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: lease.status === "bound" ? "#22c55e" : lease.status === "waiting" ? "#f59e0b" : "#555" }} />
              <span className="text-[10px] font-mono font-bold" style={{ color: "#93c5fd" }}>{lease.address}</span>
              <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>{lease.macAddress}</span>
              {lease.hostName && <span className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{lease.hostName}</span>}
              <span className="text-[7px] px-1 py-0.5 rounded ml-auto shrink-0" style={{
                background: lease.status === "bound" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                color: lease.status === "bound" ? "#22c55e" : "#f59e0b",
              }}>{lease.status}</span>
            </div>
          ))}
          {leases.length === 0 && <EmptyState text="Sin leases DHCP" />}
        </div>
      )}

      {subTab === "servers" && (
        <RemoteSection ip={ip} port={port} user={user} password={password} path="/ip/dhcp-server" title="" columns={dhcpServerColumns} baseParams={baseParams} inline />
      )}
      {subTab === "networks" && (
        <RemoteSection ip={ip} port={port} user={user} password={password} path="/ip/dhcp-server/network" title="" columns={dhcpNetworkColumns} baseParams={baseParams} inline />
      )}
    </div>
  );
}

// ── Firewall section ──────────────────────────────────────────────────────

function FirewallSection({ ip, port, user, password, baseParams }: {
  ip: string; port?: number; user?: string; password?: string; baseParams: () => URLSearchParams;
}) {
  const [subTab, setSubTab] = useState<"filter" | "nat" | "mangle">("filter");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(["filter", "nat", "mangle"] as const).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className="text-[8px] font-bold px-2 py-1 rounded-md transition-all uppercase"
            style={{
              background: subTab === t ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.02)",
              color: subTab === t ? "#f87171" : "rgba(255,255,255,0.3)",
              border: `1px solid ${subTab === t ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.04)"}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <RemoteSection
        ip={ip} port={port} user={user} password={password}
        path={`/ip/firewall/${subTab}`}
        title="" columns={firewallColumns} baseParams={baseParams} inline
      />
    </div>
  );
}

// ── DNS section ───────────────────────────────────────────────────────────

function DnsSection({ ip, port, user, password, baseParams }: {
  ip: string; port?: number; user?: string; password?: string; baseParams: () => URLSearchParams;
}) {
  const [subTab, setSubTab] = useState<"static" | "cache">("static");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(["static", "cache"] as const).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className="text-[8px] font-bold px-2 py-1 rounded-md transition-all"
            style={{
              background: subTab === t ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.02)",
              color: subTab === t ? "#a78bfa" : "rgba(255,255,255,0.3)",
              border: `1px solid ${subTab === t ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.04)"}`,
            }}
          >
            {t === "static" ? "Estáticas" : "Cache"}
          </button>
        ))}
      </div>
      <RemoteSection
        ip={ip} port={port} user={user} password={password}
        path={subTab === "static" ? "/ip/dns/static" : "/ip/dns/cache"}
        title="" columns={subTab === "static" ? dnsStaticColumns : dnsCacheColumns} baseParams={baseParams} inline
      />
    </div>
  );
}

// ── Generic remote data section ───────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  mono?: boolean;
  color?: string;
  format?: (val: any, row: any) => string;
  badge?: boolean;
  badgeColor?: (val: any) => string;
}

function RemoteSection({ ip, port, user, password, path, title, columns, baseParams, inline, reverseOrder }: {
  ip: string; port?: number; user?: string; password?: string; path: string; title: string;
  columns: ColumnDef[]; baseParams: () => URLSearchParams; inline?: boolean; reverseOrder?: boolean;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const payload: any = { ip, path };
    if (port) payload.port = port;
    if (user) payload.user = user;
    if (password) payload.pass = password;
    fetch(apiUrl("/api/mikrotik/query"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setErr(j.error); return; }
        const d = Array.isArray(j.data) ? j.data : [j.data];
        setRows(reverseOrder ? [...d].reverse() : d);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [path, baseParams, reverseOrder]);

  if (loading) return <div className="flex items-center justify-center py-6 gap-2" style={{ color: "rgba(255,255,255,0.2)" }}><RefreshCw className="w-3 h-3 animate-spin" /><span className="text-[10px]">Cargando...</span></div>;
  if (err) return <div className="text-[10px] p-3 rounded-lg" style={{ color: "#f87171", background: "rgba(239,68,68,0.06)" }}>{err}</div>;
  if (!rows || rows.length === 0) return <EmptyState text={`Sin datos para ${path}`} />;

  return (
    <div className={inline ? "" : "space-y-2"}>
      {title && <SectionLabel icon={null} color="rgba(255,255,255,0.3)" text={`${title} (${rows.length})`} />}
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {rows.map((row, i) => (
          <div key={row[".id"] || i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg flex-wrap"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
            {/* Status dot for disabled items */}
            {row.disabled !== undefined && (
              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: (row.disabled === "true" || row.disabled === true) ? "#555" : "#22c55e" }} />
            )}
            {columns.map((col) => {
              const val = row[col.key];
              if (val === undefined && !col.format) return null;
              const display = col.format ? col.format(val, row) : String(val ?? "");
              if (!display) return null;

              if (col.badge) {
                const bc = col.badgeColor ? col.badgeColor(val) : "rgba(255,255,255,0.2)";
                return (
                  <span key={col.key} className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: `${bc}15`, color: bc, border: `1px solid ${bc}25` }}>
                    {display}
                  </span>
                );
              }

              return (
                <span key={col.key} className={`text-[9px] shrink-0 ${col.mono ? "font-mono" : ""}`}
                  style={{ color: col.color || "rgba(255,255,255,0.5)" }}>
                  {display}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Column definitions ────────────────────────────────────────────────────

const routeColumns: ColumnDef[] = [
  { key: "dst-address", label: "Destino", mono: true, color: "#93c5fd" },
  { key: "gateway", label: "Gateway", mono: true, color: "rgba(255,255,255,0.5)" },
  { key: "distance", label: "Dist", format: (v) => v ? `d=${v}` : "" },
  { key: "routing-table", label: "Table", badge: true, badgeColor: () => "#8b5cf6" },
  { key: "scope", label: "Scope", format: (v) => v ? `scope=${v}` : "" },
  { key: "dynamic", label: "", format: (v) => (v === "true" || v === true) ? "D" : "", badge: true, badgeColor: () => "#f59e0b" },
];

const arpColumns: ColumnDef[] = [
  { key: "address", label: "IP", mono: true, color: "#93c5fd" },
  { key: "mac-address", label: "MAC", mono: true, color: "rgba(255,255,255,0.35)" },
  { key: "interface", label: "Iface", badge: true, badgeColor: () => "#3b82f6" },
  { key: "dynamic", label: "", format: (v) => (v === "true" || v === true) ? "D" : "", badge: true, badgeColor: () => "#f59e0b" },
  { key: "comment", label: "Comment", color: "rgba(255,255,255,0.25)" },
];

const firewallColumns: ColumnDef[] = [
  { key: "chain", label: "Chain", badge: true, badgeColor: (v) => v === "forward" ? "#3b82f6" : v === "input" ? "#f59e0b" : v === "output" ? "#22c55e" : v === "srcnat" ? "#ec4899" : v === "dstnat" ? "#8b5cf6" : "#6b7280" },
  { key: "action", label: "Action", badge: true, badgeColor: (v) => v === "accept" ? "#22c55e" : v === "drop" ? "#ef4444" : v === "reject" ? "#f59e0b" : v === "masquerade" ? "#8b5cf6" : v === "dst-nat" ? "#06b6d4" : "#6b7280" },
  { key: "src-address", label: "Src", mono: true, color: "rgba(255,255,255,0.4)", format: (v) => v || "" },
  { key: "dst-address", label: "Dst", mono: true, color: "rgba(255,255,255,0.4)", format: (v) => v || "" },
  { key: "protocol", label: "Proto", format: (v) => v || "" },
  { key: "dst-port", label: "Port", mono: true, format: (v) => v || "" },
  { key: "comment", label: "", color: "rgba(255,255,255,0.2)", format: (v) => v || "" },
];

const logColumns: ColumnDef[] = [
  { key: "time", label: "Time", mono: true, color: "rgba(255,255,255,0.35)" },
  { key: "topics", label: "Topic", badge: true, badgeColor: (v) => {
    const s = String(v || "");
    if (s.includes("error") || s.includes("critical")) return "#ef4444";
    if (s.includes("warning")) return "#f59e0b";
    if (s.includes("info")) return "#3b82f6";
    if (s.includes("dhcp")) return "#10b981";
    if (s.includes("firewall")) return "#ef4444";
    return "#6b7280";
  }},
  { key: "message", label: "Message", color: "rgba(255,255,255,0.6)" },
];

const queueColumns: ColumnDef[] = [
  { key: "name", label: "Name", color: "rgba(255,255,255,0.7)" },
  { key: "target", label: "Target", mono: true, color: "#93c5fd" },
  { key: "max-limit", label: "Max", mono: true, format: (v) => v || "unlimited" },
  { key: "burst-limit", label: "Burst", mono: true, format: (v) => v || "" },
  { key: "bytes", label: "Bytes", mono: true, format: (v) => v || "0" },
  { key: "packet-marks", label: "Mark", format: (v) => v || "", badge: true, badgeColor: () => "#8b5cf6" },
];

const dhcpServerColumns: ColumnDef[] = [
  { key: "name", label: "Name", color: "rgba(255,255,255,0.7)" },
  { key: "interface", label: "Iface", badge: true, badgeColor: () => "#3b82f6" },
  { key: "address-pool", label: "Pool", color: "#93c5fd" },
  { key: "lease-time", label: "Lease", color: "rgba(255,255,255,0.35)" },
  { key: "disabled", label: "", format: (v) => (v === "true" || v === true) ? "OFF" : "", badge: true, badgeColor: () => "#ef4444" },
];

const dhcpNetworkColumns: ColumnDef[] = [
  { key: "address", label: "Network", mono: true, color: "#93c5fd" },
  { key: "gateway", label: "Gateway", mono: true, color: "rgba(255,255,255,0.5)" },
  { key: "dns-server", label: "DNS", mono: true, color: "rgba(255,255,255,0.35)" },
  { key: "domain", label: "Domain", color: "rgba(255,255,255,0.3)" },
];

const dnsStaticColumns: ColumnDef[] = [
  { key: "name", label: "Name", color: "rgba(255,255,255,0.7)" },
  { key: "address", label: "Address", mono: true, color: "#93c5fd" },
  { key: "type", label: "Type", badge: true, badgeColor: () => "#a78bfa" },
  { key: "ttl", label: "TTL", color: "rgba(255,255,255,0.3)" },
  { key: "disabled", label: "", format: (v) => (v === "true" || v === true) ? "OFF" : "", badge: true, badgeColor: () => "#ef4444" },
];

const dnsCacheColumns: ColumnDef[] = [
  { key: "name", label: "Name", color: "rgba(255,255,255,0.7)" },
  { key: "address", label: "Address", mono: true, color: "#93c5fd" },
  { key: "type", label: "Type", badge: true, badgeColor: () => "#a78bfa" },
  { key: "ttl", label: "TTL", color: "rgba(255,255,255,0.3)" },
];

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
          <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${Math.min(value, 100)}, 100`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono" style={{ color }}>
          {value}{unit}
        </span>
      </div>
      <div className="text-[9px] font-bold mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</div>
      {subtitle && <div className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>{subtitle}</div>}
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
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: statusColor, boxShadow: iface.running ? `0 0 4px ${statusColor}60` : "none" }} />
      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0" style={{ background: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}25` }}>
        {iface.type}
      </span>
      <span className="text-[10px] font-mono font-bold truncate" style={{ color: iface.running ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)" }}>
        {iface.name}
      </span>
      {ip && <span className="text-[9px] font-mono shrink-0" style={{ color: "#93c5fd" }}>{ip}</span>}
      {iface.comment && <span className="text-[8px] truncate" style={{ color: "rgba(255,255,255,0.2)" }}>{iface.comment}</span>}
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

function SectionLabel({ icon, color, text }: { icon: React.ReactNode | null; color: string; text: string }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color }}>
      {icon && <span style={{ color }}>{icon}</span>}
      {text}
    </div>
  );
}

function DynamicBadge() {
  return <span className="text-[7px] px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>D</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-6" style={{ color: "rgba(255,255,255,0.15)" }}>
      <span className="text-[10px]">{text}</span>
    </div>
  );
}
