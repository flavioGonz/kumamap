"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import MiniChart from "./MiniChart";
import {
  Globe,
  Server,
  Wifi,
  MonitorSmartphone,
  Database,
  Activity,
  Clock,
  ArrowUpDown,
  Radio,
  HardDrive,
  Router,
  Shield,
  Cpu,
  Cloud,
} from "lucide-react";

export interface KumaNodeData {
  label: string;
  kumaMonitorId: number | null;
  icon: string;
  status?: number;
  ping?: number | null;
  msg?: string;
  type?: string;
  url?: string;
  uptime24?: number;
  lastCheck?: string;
  [key: string]: unknown;
}

const statusConfig: Record<
  number,
  { color: string; glow: string; text: string; pulse: boolean }
> = {
  0: { color: "#ef4444", glow: "0 0 16px rgba(239,68,68,0.5), 0 0 40px rgba(239,68,68,0.2)", text: "DOWN", pulse: true },
  1: { color: "#22c55e", glow: "0 0 12px rgba(34,197,94,0.4), 0 0 30px rgba(34,197,94,0.15)", text: "UP", pulse: false },
  2: { color: "#f59e0b", glow: "0 0 14px rgba(245,158,11,0.5), 0 0 35px rgba(245,158,11,0.2)", text: "PENDING", pulse: true },
  3: { color: "#8b5cf6", glow: "0 0 12px rgba(139,92,246,0.4), 0 0 30px rgba(139,92,246,0.15)", text: "MAINT", pulse: false },
};

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  server: Server, globe: Globe, wifi: Wifi, monitor: MonitorSmartphone,
  database: Database, activity: Activity, radio: Radio, harddrive: HardDrive,
  router: Router, shield: Shield, cpu: Cpu, cloud: Cloud,
};

function KumaMonitorNode({ data, selected }: NodeProps & { data: KumaNodeData }) {
  const [hovered, setHovered] = useState(false);
  const status = statusConfig[data.status ?? 2] || statusConfig[2];
  const IconComponent = iconMap[data.icon] || Server;

  return (
    <div
      className="relative flex flex-col items-center group/node"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Connection handles — visible on hover with glow */}
      {([
        { type: "target" as const, pos: Position.Top, id: "top", css: { top: -5 } },
        { type: "source" as const, pos: Position.Bottom, id: "bottom", css: { bottom: -5 } },
        { type: "target" as const, pos: Position.Left, id: "left", css: { left: -5 } },
        { type: "source" as const, pos: Position.Right, id: "right", css: { right: -5 } },
      ]).map((h) => (
        <Handle
          key={h.id}
          type={h.type}
          position={h.pos}
          id={h.id === "top" || h.id === "bottom" ? undefined : h.id}
          className="!rounded-full !transition-all !duration-200"
          style={{
            ...h.css,
            width: 10,
            height: 10,
            background: hovered ? status.color : "transparent",
            border: hovered ? `2px solid ${status.color}` : "2px solid transparent",
            boxShadow: hovered ? `0 0 8px ${status.color}88` : "none",
            opacity: hovered ? 1 : 0,
            cursor: "crosshair",
          }}
        />
      ))}

      {/* Label above */}
      <div
        className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-wide"
        style={{
          color: selected ? "#fff" : "#ccc",
          textShadow: "0 1px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)",
        }}
      >
        {data.label}
      </div>

      {/* Pulse ring (animated for DOWN/PENDING) */}
      {status.pulse && (
        <div
          className="absolute rounded-full animate-ping"
          style={{
            width: 36,
            height: 36,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: status.color + "30",
          }}
        />
      )}

      {/* Main icon circle */}
      <div
        className="relative flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer"
        style={{
          width: selected ? 34 : 28,
          height: selected ? 34 : 28,
          background: `radial-gradient(circle, ${status.color}44, ${status.color}11)`,
          border: `2px solid ${status.color}`,
          boxShadow: selected
            ? `${status.glow}, 0 0 0 3px ${status.color}55`
            : status.glow,
        }}
      >
        <IconComponent className="h-3.5 w-3.5" style={{ color: status.color }} />
      </div>

      {/* Hover tooltip with full details */}
      {hovered && (
        <div
          className="absolute top-10 left-1/2 -translate-x-1/2 z-50 rounded-2xl p-0 overflow-hidden"
          style={{
            minWidth: 260,
            maxWidth: 300,
            background: "linear-gradient(180deg, rgba(16,16,16,0.98), rgba(10,10,10,0.99))",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)`,
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Status bar top accent */}
          <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${status.color}, ${status.color}44)` }} />

          <div className="p-3.5">
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${status.color}33, ${status.color}11)`,
                  border: `1px solid ${status.color}33`,
                  boxShadow: `0 0 12px ${status.color}22`,
                }}
              >
                <IconComponent className="h-4 w-4" style={{ color: status.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-[#ededed] truncate">{data.label}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded"
                    style={{
                      background: status.color + "22",
                      color: status.color,
                      border: `1px solid ${status.color}33`,
                    }}
                  >
                    {status.text}
                  </span>
                  {data.ping != null && (
                    <span className="text-[10px] text-[#888] font-semibold">{data.ping}ms</span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats grid - 2 columns */}
            {data.kumaMonitorId != null && (
              <div
                className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] mb-3 pb-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                {data.type && (
                  <div className="flex justify-between">
                    <span className="text-[#555]">Tipo</span>
                    <span className="uppercase font-bold text-[#bbb]">{data.type}</span>
                  </div>
                )}
                {data.ping != null && (
                  <div className="flex justify-between">
                    <span className="text-[#555]">Ping</span>
                    <span className="font-bold text-[#bbb]">
                      <ArrowUpDown className="inline h-2.5 w-2.5 mr-0.5 text-blue-400" />
                      {data.ping}ms
                    </span>
                  </div>
                )}
                {data.uptime24 != null && (
                  <div className="flex justify-between">
                    <span className="text-[#555]">Uptime</span>
                    <span className="font-bold" style={{
                      color: (data.uptime24 as number) > 0.99 ? "#22c55e" : (data.uptime24 as number) > 0.95 ? "#f59e0b" : "#ef4444",
                    }}>
                      {((data.uptime24 as number) * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {data.lastCheck && (
                  <div className="flex justify-between">
                    <span className="text-[#555]">Check</span>
                    <span className="text-[#888] font-medium">
                      <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                      {new Date(data.lastCheck as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* URL */}
            {data.url && (
              <div className="mb-2 text-[9px] font-mono text-[#666] truncate">
                <Globe className="inline h-2.5 w-2.5 mr-1 text-[#555]" />
                {data.url as string}
              </div>
            )}

            {/* Message */}
            {data.msg && (
              <div className="mb-2 text-[9px] text-[#777] truncate">
                <Activity className="inline h-2.5 w-2.5 mr-1 text-[#555]" />
                {data.msg as string}
              </div>
            )}

            {/* Live ping chart with stats */}
            {data.kumaMonitorId != null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[8px] text-[#555] font-bold uppercase tracking-wider">Latencia en vivo</div>
                  <div className="flex items-center gap-1">
                    <div className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[7px] text-[#555]">en tiempo real</span>
                  </div>
                </div>
                <MiniChart
                  monitorId={data.kumaMonitorId as number}
                  width={240}
                  height={55}
                  showStats={true}
                  showTimeline={true}
                />
              </div>
            )}

            {data.kumaMonitorId == null && (
              <div className="text-[10px] text-[#555] italic text-center py-2">
                Nodo manual — sin monitor Kuma asociado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(KumaMonitorNode);
