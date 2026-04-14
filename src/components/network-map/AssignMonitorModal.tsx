"use client";

import React from "react";
import { Signal } from "lucide-react";
import type { KumaMonitor } from "./MonitorPanel";
import { statusColors } from "@/utils/status";

export interface AssignMonitorModalProps {
  monitors: KumaMonitor[];
  /** IDs of monitors already assigned to other nodes */
  usedMonitorIds: Set<number>;
  search: string;
  onSearchChange: (value: string) => void;
  onAssign: (monitorId: number, monitorName: string) => void;
  onClose: () => void;
}

export default function AssignMonitorModal({
  monitors,
  usedMonitorIds,
  search,
  onSearchChange,
  onAssign,
  onClose,
}: AssignMonitorModalProps) {
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="rounded-2xl w-[380px] max-h-[500px] flex flex-col overflow-hidden"
        style={{
          background: "rgba(16,16,16,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}
      >
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Signal className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-bold text-[#ededed]">Asignar Monitor Kuma</span>
          <button onClick={onClose} className="ml-auto text-[#555] hover:text-[#ededed] text-lg leading-none">
            &times;
          </button>
        </div>
        <div className="px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            autoFocus
            type="text"
            placeholder="Buscar monitor..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-xs text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {monitors
            .filter((m) => m.type !== "group" && m.active !== false)
            .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
            .map((m) => {
              const color = statusColors[m.status ?? 2] || "#f59e0b";
              const alreadyUsed = usedMonitorIds.has(m.id);
              return (
                <button
                  key={m.id}
                  disabled={alreadyUsed}
                  onClick={() => onAssign(m.id, m.name)}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all disabled:opacity-30"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => {
                    if (!alreadyUsed) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#ededed] truncate">{m.name}</div>
                    <div className="text-[10px] text-[#555]">
                      {m.type.toUpperCase()} {m.ping != null ? `· ${m.ping}ms` : ""}
                    </div>
                  </div>
                  {alreadyUsed && <span className="text-[9px] text-[#555]">en uso</span>}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
