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
      className="relative flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Handles (invisible, around the pulse icon) */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-transparent !border-0" style={{ top: -2 }} />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-transparent !border-0" style={{ bottom: -2 }} />
      <Handle type="target" position={Position.Left} id="left" className="!w-2 !h-2 !bg-transparent !border-0" style={{ left: -2 }} />
      <Handle type="source" position={Position.Right} id="right" className="!w-2 !h-2 !bg-transparent !border-0" style={{ right: -2 }} />

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
          className="absolute top-10 left-1/2 -translate-x-1/2 z-50 rounded-xl p-3 min-w-[200px] max-w-[260px]"
          style={{
            background: "rgba(12,12,12,0.97)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            backdropFilter: "blur(16px)",
          }}
        >
          {/* Tooltip header */}
          <div className="flex items-center gap-2 mb-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
              style={{ background: status.color + "22", border: `1px solid ${status.color}33` }}
            >
              <IconComponent className="h-3.5 w-3.5" style={{ color: status.color }} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#ededed] truncate">{data.label}</div>
              <div className="text-[10px] font-semibold" style={{ color: status.color }}>
                {status.text}
                {data.ping != null && <span className="text-[#737373] ml-1.5">{data.ping}ms</span>}
              </div>
            </div>
          </div>

          {/* Stats grid */}
          {data.kumaMonitorId != null && (
            <div className="space-y-1.5 text-[10px] text-[#999]">
              {data.type && (
                <div className="flex justify-between">
                  <span className="text-[#666]">Tipo</span>
                  <span className="uppercase font-semibold text-[#bbb]">{data.type}</span>
                </div>
              )}
              {data.ping != null && (
                <div className="flex justify-between">
                  <span className="text-[#666]">Latencia</span>
                  <span className="font-semibold text-[#bbb]">
                    <ArrowUpDown className="inline h-2.5 w-2.5 mr-0.5" />
                    {data.ping}ms
                  </span>
                </div>
              )}
              {data.uptime24 != null && (
                <div className="flex justify-between">
                  <span className="text-[#666]">Uptime 24h</span>
                  <span className="font-semibold" style={{ color: data.uptime24 > 0.99 ? "#22c55e" : data.uptime24 > 0.95 ? "#f59e0b" : "#ef4444" }}>
                    <Activity className="inline h-2.5 w-2.5 mr-0.5" />
                    {(data.uptime24 * 100).toFixed(2)}%
                  </span>
                </div>
              )}
              {data.url && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#666] shrink-0">URL</span>
                  <span className="font-mono text-[9px] text-[#888] truncate">
                    <Globe className="inline h-2.5 w-2.5 mr-0.5" />
                    {data.url}
                  </span>
                </div>
              )}
              {data.msg && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#666] shrink-0">Mensaje</span>
                  <span className="text-[#888] truncate">{data.msg}</span>
                </div>
              )}
              {data.lastCheck && (
                <div className="flex justify-between">
                  <span className="text-[#666]">Ultimo check</span>
                  <span className="text-[#888]">
                    <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                    {new Date(data.lastCheck).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Live ping chart */}
          {data.kumaMonitorId != null && (
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[9px] text-[#666] mb-1 font-semibold uppercase tracking-wider">Latencia en vivo</div>
              <MiniChart monitorId={data.kumaMonitorId as number} width={190} height={45} />
            </div>
          )}

          {data.kumaMonitorId == null && (
            <div className="text-[10px] text-[#666] italic">Nodo manual (sin monitor Kuma)</div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(KumaMonitorNode);
