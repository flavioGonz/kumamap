"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Globe,
  Server,
  Wifi,
  Database,
  Activity,
  GripVertical,
  ChevronRight,
  ChevronLeft,
  Signal,
  Radio,
  Filter,
} from "lucide-react";

export interface KumaMonitor {
  id: number;
  name: string;
  type: string;
  url: string;
  hostname: string;
  active: boolean;
  parent?: number | null;
  status?: number;
  ping?: number | null;
  msg?: string;
  uptime24?: number;
  tags?: { name: string; color: string }[];
}

interface MonitorPanelProps {
  monitors: KumaMonitor[];
  connected: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  groupName?: string;
  onAutoImport?: () => void;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  http: Globe,
  keyword: Globe,
  ping: Wifi,
  port: Server,
  dns: Database,
  push: Activity,
  steam: Radio,
};

const statusColors: Record<number, string> = {
  0: "#ef4444",
  1: "#22c55e",
  2: "#f59e0b",
  3: "#8b5cf6",
};

export default function MonitorPanel({
  monitors,
  connected,
  collapsed,
  onToggleCollapse,
  groupName,
  onAutoImport,
}: MonitorPanelProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let result = monitors;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.url?.toLowerCase().includes(q) ||
          m.type?.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== null) {
      result = result.filter((m) => m.status === filterStatus);
    }
    return result;
  }, [monitors, search, filterStatus]);

  const counts = useMemo(
    () => ({
      up: monitors.filter((m) => m.status === 1).length,
      down: monitors.filter((m) => m.status === 0).length,
      pending: monitors.filter((m) => m.status === 2 || m.status === 3).length,
      total: monitors.length,
    }),
    [monitors]
  );

  const onDragStart = (e: React.DragEvent, monitor: KumaMonitor) => {
    e.dataTransfer.setData(
      "application/kuma-monitor",
      JSON.stringify(monitor)
    );
    e.dataTransfer.effectAllowed = "move";
  };

  if (collapsed) {
    return (
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20">
        <button
          onClick={onToggleCollapse}
          className="flex flex-col items-center gap-2 rounded-2xl px-2.5 py-5 transition-all hover:px-3.5"
          style={{
            background: "rgba(10,10,10,0.88)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
        >
          <Signal className="h-4 w-4 text-blue-400" />
          <span
            className="text-[7px] font-black text-[#555] tracking-wider"
            style={{ writingMode: "vertical-rl" }}
          >
            MONITORES
          </span>
          <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }}>
            {counts.total}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute right-0 top-0 z-20 h-full w-80 flex flex-col shadow-2xl"
      style={{
        background: "rgba(14,14,14,0.97)",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <Signal className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#ededed]">
              {groupName ? groupName : "Monitores"}
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-[#737373]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: connected ? "#22c55e" : "#ef4444",
                  boxShadow: connected
                    ? "0 0 6px #22c55e"
                    : "0 0 6px #ef4444",
                }}
              />
              {connected ? "Conectado" : "Desconectado"}
              {groupName && <span className="text-indigo-400 ml-1">grupo</span>}
            </div>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-[#737373] hover:text-[#ededed] hover:bg-white/5 transition-all"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Stats */}
      <div
        className="flex gap-1.5 px-3 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {[
          { label: "Todos", count: counts.total, status: null, color: "#3b82f6" },
          { label: "UP", count: counts.up, status: 1, color: "#22c55e" },
          { label: "DOWN", count: counts.down, status: 0, color: "#ef4444" },
          { label: "Otros", count: counts.pending, status: 2, color: "#f59e0b" },
        ].map(({ label, count, status, color }) => (
          <button
            key={label}
            onClick={() => setFilterStatus(filterStatus === status ? null : status)}
            className="flex-1 rounded-lg px-2 py-1.5 text-center transition-all"
            style={{
              background:
                filterStatus === status ? color + "22" : "rgba(255,255,255,0.03)",
              border: `1px solid ${filterStatus === status ? color + "44" : "transparent"}`,
              color: filterStatus === status ? color : "#737373",
            }}
          >
            <div className="text-[11px] font-bold">{count}</div>
            <div className="text-[8px] font-semibold uppercase tracking-wider">{label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div
        className="px-3 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#737373]" />
          <input
            type="text"
            placeholder="Buscar monitor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg py-2 pl-8 pr-3 text-xs text-[#ededed] placeholder:text-[#737373] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          />
        </div>
      </div>

      {/* Monitor list */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1">
        {!connected && (
          <div
            className="rounded-xl p-3.5 text-xs text-amber-300"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.15)",
            }}
          >
            <Activity className="inline h-3.5 w-3.5 mr-1.5" />
            Conectando a Uptime Kuma...
          </div>
        )}
        {filtered.map((monitor) => {
          const Icon = typeIcons[monitor.type] || Server;
          const color = statusColors[monitor.status ?? 2];

          return (
            <div
              key={monitor.id}
              draggable
              onDragStart={(e) => onDragStart(e, monitor)}
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing transition-all"
              style={{
                background: "transparent",
                border: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "rgba(255,255,255,0.03)";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.borderColor = "transparent";
              }}
            >
              <GripVertical className="h-3.5 w-3.5 text-[#404040] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: `${color}15`,
                  border: `1px solid ${color}22`,
                }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate text-[#ededed]">
                  {monitor.name}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[#737373]">
                  <span className="uppercase font-medium">{monitor.type}</span>
                  {monitor.ping != null && <span>{monitor.ping}ms</span>}
                </div>
              </div>
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 6px ${color}88`,
                }}
              />
            </div>
          );
        })}
        {filtered.length === 0 && connected && (
          <div className="flex flex-col items-center py-10 text-[#737373]">
            <Filter className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No se encontraron monitores</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {/* Footer */}
      <div
        className="px-3 py-2.5 space-y-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {onAutoImport && (
          <button
            onClick={onAutoImport}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.3)",
              color: "#818cf8",
            }}
          >
            Importar todo el grupo al mapa
          </button>
        )}
        <div className="text-[10px] text-[#737373] text-center">
          Arrastra un monitor al canvas para agregarlo
        </div>
      </div>
    </div>
  );
}
