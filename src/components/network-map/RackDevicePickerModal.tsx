"use client";

import React, { useState } from "react";
import {
  Server, Network, Cable, Router, Zap, PlugZap, HardDrive, Layers,
  Search, X as XIcon,
} from "lucide-react";
import { STATUS_COLORS } from "@/constants/ui";
import type { RackDeviceSummary } from "@/lib/types";
import type { KumaMonitor } from "./MonitorPanel";

interface RackDevicePickerModalProps {
  devices: RackDeviceSummary[];
  rackName: string;
  isSrc: boolean;
  onSelect: (hint: string) => void;
  onCancel: () => void;
  getMonitorData: (id: number) => KumaMonitor | undefined;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  server:        <Server className="w-3.5 h-3.5" />,
  switch:        <Network className="w-3.5 h-3.5" />,
  patchpanel:    <Cable className="w-3.5 h-3.5" />,
  router:        <Router className="w-3.5 h-3.5" />,
  ups:           <Zap className="w-3.5 h-3.5" />,
  pdu:           <PlugZap className="w-3.5 h-3.5" />,
  "tray-fiber":  <HardDrive className="w-3.5 h-3.5" />,
  other:         <Layers className="w-3.5 h-3.5" />,
};

const TYPE_LABEL: Record<string, string> = {
  server: "Servidor", switch: "Switch", patchpanel: "Patch Panel",
  router: "Router", ups: "UPS", pdu: "PDU",
  "tray-fiber": "Fibra", "tray-1u": "Bandeja", "tray-2u": "Bandeja",
  "cable-organizer": "Org. Cable", other: "Otro",
};

const TYPE_COLOR: Record<string, string> = {
  server: "#3b82f6", switch: "#22c55e", patchpanel: "#f59e0b",
  router: "#8b5cf6", ups: "#ef4444", pdu: "#ec4899",
  "tray-fiber": "#06b6d4", other: "#6b7280",
};

function deviceBaseHint(d: RackDeviceSummary): string {
  return `${d.label} (U${d.unit}${(d.sizeUnits || 1) > 1 ? `-${(d.unit || 0) + (d.sizeUnits || 1) - 1}` : ""})`;
}

function getDeviceInterfaces(d: RackDeviceSummary): { id: string; label: string; sub: string; connected: boolean }[] {
  if (d.type === "switch" && d.switchPorts?.length) {
    return d.switchPorts.map((p) => ({
      id: String(p.port),
      label: p.label && p.label !== String(p.port) ? `Puerto ${p.port} — ${p.label}` : `Puerto ${p.port}`,
      sub: [p.speed || "", p.connected ? "conectado" : "libre", p.vlan ? `VLAN ${p.vlan}` : ""].filter(Boolean).join(" · "),
      connected: !!p.connected,
    }));
  }
  if (d.type === "patchpanel" && d.ports?.length) {
    return d.ports.map((p) => ({
      id: String(p.port),
      label: p.label && p.label !== `P${p.port}` ? `Puerto ${p.port} — ${p.label}` : `Puerto ${p.port}`,
      sub: [p.connected ? "conectado" : "libre", p.destination || ""].filter(Boolean).join(" · "),
      connected: !!p.connected,
    }));
  }
  if (d.type === "router" && d.routerInterfaces?.length) {
    return d.routerInterfaces.map((iface) => ({
      id: iface.id,
      label: iface.name,
      sub: [iface.type, iface.ipAddress || "", iface.connected ? "conectado" : "libre"].filter(Boolean).join(" · "),
      connected: !!iface.connected,
    }));
  }
  return [];
}

export default function RackDevicePickerModal({
  devices, rackName, isSrc, onSelect, onCancel, getMonitorData,
}: RackDevicePickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<RackDeviceSummary | null>(null);

  const filtered = devices.filter((d) =>
    !query || d.label?.toLowerCase().includes(query.toLowerCase()) || TYPE_LABEL[d.type || ""]?.toLowerCase().includes(query.toLowerCase())
  );

  const handleDeviceClick = (d: RackDeviceSummary) => {
    const ifaces = getDeviceInterfaces(d);
    if (ifaces.length === 0) {
      onSelect(deviceBaseHint(d));
    } else {
      setSelectedDevice(d);
    }
  };

  // ── Step 2: Port / Interface picker ─────────────────────────────────────────
  if (selectedDevice) {
    const ifaces = getDeviceInterfaces(selectedDevice);
    const col = TYPE_COLOR[selectedDevice.type || ""] || "#6b7280";
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#111", width: 420, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">
            <button onClick={() => setSelectedDevice(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all cursor-pointer">
              <XIcon className="w-3.5 h-3.5" style={{ transform: "rotate(45deg)" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-0.5">
                {isSrc ? "Interfaz de origen" : "Interfaz de destino"}
              </div>
              <div className="text-sm font-bold text-white/90 truncate">{selectedDevice.label}</div>
            </div>
            <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all cursor-pointer">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* "Sin interfaz específica" */}
          <div className="px-4 pt-3 pb-1">
            <button
              onClick={() => onSelect(deviceBaseHint(selectedDevice))}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all cursor-pointer text-xs border border-dashed border-white/[0.08]"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="italic">Sin interfaz específica</span>
            </button>
          </div>

          {/* Interface list */}
          <div className="overflow-y-auto px-4 pb-4 mt-1" style={{ maxHeight: 340, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
            {ifaces.map((iface) => (
              <button
                key={iface.id}
                onClick={() => onSelect(`${selectedDevice.label} > ${iface.label}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all cursor-pointer text-left"
                style={{ background: iface.connected ? `${col}12` : "rgba(255,255,255,0.025)" }}
                onMouseEnter={e => (e.currentTarget.style.background = `${col}22`)}
                onMouseLeave={e => (e.currentTarget.style.background = iface.connected ? `${col}12` : "rgba(255,255,255,0.025)")}
              >
                <div className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: iface.connected ? "#22c55e" : "#4b5563", boxShadow: iface.connected ? "0 0 5px #22c55e88" : "none" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white/85 truncate">{iface.label}</div>
                  {iface.sub && <div className="text-[10px] text-white/35 truncate">{iface.sub}</div>}
                </div>
              </button>
            ))}
          </div>
          <div className="px-5 py-2.5 border-t border-white/[0.05] text-[9px] text-white/20 text-center">
            La interfaz seleccionada se asociará al link
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Device picker ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
      <div
        className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "#111", width: 380, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-0.5">
              {isSrc ? "Equipo de origen" : "Equipo de destino"}
            </div>
            <div className="text-sm font-bold text-white/90 truncate">{rackName}</div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all cursor-pointer">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar equipo..."
              className="flex-1 bg-transparent text-xs text-white/80 placeholder-white/25 outline-none"
            />
          </div>
        </div>

        {/* "Sin equipo específico" option */}
        <div className="px-4 pb-1">
          <button
            onClick={() => onSelect("")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all cursor-pointer text-xs border border-dashed border-white/[0.08]"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="italic">Sin equipo específico</span>
          </button>
        </div>

        {/* Device list */}
        <div className="overflow-y-auto px-4 pb-4 mt-1" style={{ maxHeight: 320, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-white/25 italic">Sin equipos en este rack</div>
          )}
          {filtered.map((d: any) => {
            const col = TYPE_COLOR[d.type] || "#6b7280";
            const icon = TYPE_ICON[d.type] || TYPE_ICON.other;
            const typeLabel = TYPE_LABEL[d.type] || d.type;
            const monInfo = d.monitorId ? getMonitorData(d.monitorId) : null;
            const monColor = monInfo && monInfo.status != null ? (STATUS_COLORS[monInfo.status as number] || "#6b7280") : null;
            const hasInterfaces = getDeviceInterfaces(d).length > 0;

            return (
              <button
                key={d.id}
                onClick={() => handleDeviceClick(d)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all cursor-pointer group text-left"
                style={{ background: "rgba(255,255,255,0.025)" }}
                onMouseEnter={e => (e.currentTarget.style.background = `${col}18`)}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${col}22`, border: `1px solid ${col}44`, color: col }}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white/85 truncate">{d.label}</div>
                  <div className="text-[10px] text-white/35 flex items-center gap-1.5">
                    <span>{typeLabel}</span>
                    <span>·</span>
                    <span>U{d.unit}{d.sizeUnits > 1 ? `–${d.unit + d.sizeUnits - 1}` : ""}</span>
                    {d.portCount && <><span>·</span><span>{d.portCount}P</span></>}
                  </div>
                </div>
                {monColor && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: monColor, boxShadow: `0 0 6px ${monColor}` }} />}
                {hasInterfaces && <div className="text-white/25 text-xs shrink-0">›</div>}
                <div className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
                  U{d.unit}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-white/[0.05] text-[9px] text-white/20 text-center">
          › indica que tiene puertos seleccionables
        </div>
      </div>
    </div>
  );
}
