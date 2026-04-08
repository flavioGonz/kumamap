"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X, Download, Server, Network, Zap, Settings, Trash2, Plus,
  Inbox, Router, ChevronUp, ChevronDown, Wifi, Database,
  FileText, FileSpreadsheet,
} from "lucide-react";
import html2canvas from "html2canvas";

export interface RackDevice {
  id: string;
  unit: number;
  sizeUnits: number;
  label: string;
  type: "server" | "switch" | "patchpanel" | "ups" | "router" | "pdu" | "tray-fiber" | "tray-1u" | "tray-2u" | "other";
  color?: string;
  monitorId?: number | null;
  /** Patch panel ports (only for type === 'patchpanel') */
  ports?: PatchPort[];
  notes?: string;
}

export interface PatchPort {
  port: number;
  label: string;
  connected: boolean;
  destination?: string;
}

interface RackDesignerDrawerProps {
  open: boolean;
  onClose: () => void;
  nodeId: string | null;
  nodes: any[];
  monitors?: any[];
  onSave: (nodeId: string, customData: any) => void;
}

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  server:      { label: "Servidor",          icon: <Server className="w-4 h-4" />,   color: "#3b82f6" },
  switch:      { label: "Switch",            icon: <Network className="w-4 h-4" />,  color: "#10b981" },
  patchpanel:  { label: "Patch Panel",       icon: <Wifi className="w-4 h-4" />,     color: "#8b5cf6" },
  ups:         { label: "UPS / Energía",     icon: <Zap className="w-4 h-4" />,      color: "#f59e0b" },
  router:      { label: "Router",            icon: <Router className="w-4 h-4" />,   color: "#ef4444" },
  pdu:         { label: "PDU",               icon: <Zap className="w-4 h-4" />,      color: "#f97316" },
  "tray-fiber":{ label: "Bandeja de Fibra",  icon: <Inbox className="w-4 h-4" />,   color: "#d946ef" },
  "tray-1u":   { label: "Bandeja 1U",        icon: <Inbox className="w-4 h-4" />,   color: "#52525b" },
  "tray-2u":   { label: "Bandeja 2U",        icon: <Inbox className="w-4 h-4" />,   color: "#52525b" },
  other:       { label: "Otro",              icon: <Settings className="w-4 h-4" />, color: "#6b7280" },
};

const UNIT_OPTIONS = [3, 6, 12, 18, 22, 24, 42, 45, 48];

export default function RackDesignerDrawer({ open, onClose, nodeId, nodes, monitors, onSave }: RackDesignerDrawerProps) {
  const [totalUnits, setTotalUnits] = useState(42);
  const [devices, setDevices] = useState<RackDevice[]>([]);
  const [rackName, setRackName] = useState("Rack");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<RackDevice | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [pendingClickUnit, setPendingClickUnit] = useState<number | null>(null);
  const rackRef = useRef<HTMLDivElement>(null);

  const getDeviceStatusInfo = useCallback((monitorId?: number | null) => {
    if (!monitorId || !monitors) return { color: "#6b7280", name: "" };
    const m = monitors.find(x => x.id === monitorId);
    if (!m) return { color: "#6b7280", name: "" };
    if (!m.active || m.status == null) return { color: "#6b7280", name: m.name };
    if (m.status === 0) return { color: "#ef4444", name: m.name };
    if (m.status === 2) return { color: "#f59e0b", name: m.name };
    if (m.status === 3) return { color: "#8b5cf6", name: m.name };
    return { color: "#22c55e", name: m.name };
  }, [monitors]);

  useEffect(() => {
    if (open && nodeId) {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        try {
          const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
          setTotalUnits(cd.totalUnits || 42);
          setDevices(cd.devices || []);
          setRackName(node.label || "Rack");
        } catch {
          setTotalUnits(42);
          setDevices([]);
        }
      }
    } else {
      setSelectedDeviceId(null);
      setEditingDevice(null);
      setIsAddingNew(false);
    }
  }, [open, nodeId, nodes]);

  // Sync editing device from selected
  useEffect(() => {
    if (selectedDeviceId) {
      const d = devices.find(x => x.id === selectedDeviceId);
      setEditingDevice(d ? { ...d } : null);
    } else {
      setEditingDevice(null);
    }
  }, [selectedDeviceId, devices]);

  const occupancyMap = useMemo(() => {
    const map = new Map<number, { device: RackDevice; isHead: boolean }>();
    devices.forEach(d => {
      for (let i = 0; i < d.sizeUnits; i++) {
        map.set(d.unit + i, { device: d, isHead: i === d.sizeUnits - 1 });
      }
    });
    return map;
  }, [devices]);

  const handleSaveRack = () => {
    if (!nodeId) return;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
    cd.type = "rack";
    cd.totalUnits = totalUnits;
    cd.devices = devices;
    onSave(nodeId, cd);
  };

  const handleClickUnit = (u: number) => {
    const occ = occupancyMap.get(u);
    if (occ) {
      setSelectedDeviceId(occ.device.id);
      setIsAddingNew(false);
    } else {
      // Start adding a new device at this unit
      setPendingClickUnit(u);
      setSelectedDeviceId(null);
      setIsAddingNew(true);
      setEditingDevice({
        id: `dev-${Date.now()}`,
        unit: u,
        sizeUnits: 1,
        label: "Nuevo Equipo",
        type: "server",
        color: TYPE_META.server.color,
      });
    }
  };

  const handleSaveDevice = () => {
    if (!editingDevice) return;
    const startU = editingDevice.unit;
    const endU = startU + editingDevice.sizeUnits - 1;
    const hasOverlap = devices.some(d => {
      if (d.id === editingDevice.id) return false;
      const dEnd = d.unit + d.sizeUnits - 1;
      return Math.max(startU, d.unit) <= Math.min(endU, dEnd);
    });
    if (hasOverlap) { alert("Error: El equipo se sobrepone con otro en el Rack."); return; }
    setDevices(prev => {
      const idx = prev.findIndex(p => p.id === editingDevice.id);
      if (idx >= 0) { const nc = [...prev]; nc[idx] = editingDevice; return nc; }
      return [...prev, editingDevice];
    });
    setSelectedDeviceId(editingDevice.id);
    setIsAddingNew(false);
  };

  const handleDeleteDevice = (id: string) => {
    if (!confirm("¿Eliminar este componente del Rack?")) return;
    setDevices(prev => prev.filter(d => d.id !== id));
    setSelectedDeviceId(null);
    setEditingDevice(null);
  };

  const handleDownloadImage = async () => {
    if (!rackRef.current) return;
    try {
      const canvas = await html2canvas(rackRef.current, { backgroundColor: "#111111" } as any);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `rack-${rackName.replace(/\s+/g, "_")}-${totalUnits}U.png`;
      a.click();
    } catch (e) { alert("Error al exportar la imagen."); }
  };

  const handleExportPDF = async () => {
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const res = await fetch(`${basePath}/api/rack-report-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rackName, totalUnits, devices }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const html = await res.text();
      // Open in new window and trigger print dialog
      const win = window.open("", "_blank");
      if (!win) { alert("Permitir popups para exportar PDF"); return; }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 600);
    } catch (e) {
      alert("Error al generar el reporte PDF.");
    }
  };

  const handleExportXlsx = async () => {
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const res = await fetch(`${basePath}/api/rack-report-xlsx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rackName, totalUnits, devices }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rack-${rackName.replace(/\s+/g, "_")}-report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error al generar el reporte Excel.");
    }
  };

  if (!open) return null;

  const usedUnits = devices.reduce((s, d) => s + d.sizeUnits, 0);
  const freeUnits = totalUnits - usedUnits;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden border border-white/10"
        style={{
          width: "min(96vw, 1100px)",
          maxHeight: "92vh",
          background: "linear-gradient(160deg, #161616 0%, #0e0e0e 100%)",
          boxShadow: "0 32px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#3b82f688,#6366f144)" }}>
              <Server className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white/90 leading-none">{rackName}</h2>
              <p className="text-[11px] text-white/40 mt-0.5">
                {totalUnits}U · {usedUnits}U ocupadas · {freeUnits}U libres
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={totalUnits}
              onChange={e => setTotalUnits(parseInt(e.target.value))}
              className="text-xs rounded-lg px-2.5 py-1.5 border border-white/10 text-white/80 focus:outline-none focus:border-blue-500 cursor-pointer"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              {UNIT_OPTIONS.map(u => <option key={u} value={u} style={{ background: "#1a1a1a" }}>{u}U</option>)}
            </select>
            <button onClick={handleDownloadImage} title="Exportar PNG" className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 transition-all" style={{ background: "rgba(255,255,255,0.03)" }}>
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
            <button onClick={handleExportPDF} title="Reporte PDF" className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.18)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"; }}>
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={handleExportXlsx} title="Reporte Excel" className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.18)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.08)"; }}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
            <button onClick={handleSaveRack} className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-semibold transition-all" style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}>
              Guardar Rack
            </button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body: rack + panel ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Rack Vis (left) ── */}
          <div className="w-[340px] shrink-0 border-r border-white/[0.06] overflow-y-auto p-5 flex flex-col items-center gap-3" style={{ background: "rgba(0,0,0,0.25)" }}>
            {/* U number legend */}
            <div className="text-[10px] text-white/30 self-start pl-10 font-mono">U{totalUnits} → U1</div>
            {/* Rack chassis */}
            <div
              ref={rackRef}
              className="w-full rounded-md overflow-hidden"
              style={{
                background: "#1c1c1c",
                border: "3px solid #2a2a2a",
                boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6), 0 4px 20px rgba(0,0,0,0.5)",
                display: "flex",
                flexDirection: "column-reverse",
              }}
            >
              {Array.from({ length: totalUnits }).map((_, i) => {
                const u = i + 1;
                const occ = occupancyMap.get(u);
                const isSelected = occ && selectedDeviceId === occ.device.id;

                if (occ) {
                  if (occ.isHead) {
                    const meta = TYPE_META[occ.device.type] || TYPE_META.other;
                    const statusInfo = getDeviceStatusInfo(occ.device.monitorId);
                    const h = occ.device.sizeUnits * 26;
                    return (
                      <div
                        key={u}
                        onClick={() => setSelectedDeviceId(occ.device.id)}
                        className="relative w-full flex-shrink-0 cursor-pointer transition-all duration-100"
                        style={{
                          height: `${h}px`,
                          backgroundColor: occ.device.color || meta.color,
                          boxShadow: isSelected
                            ? `inset 0 0 0 2px #fff, 0 0 12px ${occ.device.color || meta.color}88`
                            : "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.5)",
                          filter: isSelected ? "brightness(1.15)" : "brightness(1)",
                        }}
                      >
                        {/* Rails */}
                        <div className="absolute left-0 top-0 bottom-0 w-[10px]" style={{ background: "#1a1a1a", borderRight: "1px solid #0a0a0a" }} />
                        <div className="absolute right-0 top-0 bottom-0 w-[10px]" style={{ background: "#1a1a1a", borderLeft: "1px solid #0a0a0a" }} />
                        {/* Screw dots */}
                        {[0, h - 6].map((t, si) => (
                          <React.Fragment key={si}>
                            <div className="absolute w-1.5 h-1.5 rounded-full" style={{ top: t + 3, left: 2, background: "#0a0a0a" }} />
                            <div className="absolute w-1.5 h-1.5 rounded-full" style={{ top: t + 3, right: 2, background: "#0a0a0a" }} />
                          </React.Fragment>
                        ))}
                        {/* Device label area */}
                        <div className="absolute inset-x-[12px] inset-y-0 flex items-center justify-between px-2 gap-2">
                          <div className="flex items-center gap-2 min-w-0 shrink">
                            <span className="text-white/80 shrink-0">{meta.icon}</span>
                            <span className="text-[11px] font-semibold text-white/95 truncate leading-none">{occ.device.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {occ.device.monitorId && (
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusInfo.color, boxShadow: `0 0 6px ${statusInfo.color}88` }} title={statusInfo.name} />
                            )}
                            <span className="text-[9px] text-white/50 font-mono">
                              U{occ.device.unit}{occ.device.sizeUnits > 1 ? `-${occ.device.unit + occ.device.sizeUnits - 1}` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }

                // Empty slot
                return (
                  <div
                    key={u}
                    onClick={() => handleClickUnit(u)}
                    className="w-full flex-shrink-0 flex items-center cursor-crosshair transition-colors group"
                    style={{
                      height: "26px",
                      borderBottom: "1px solid #232323",
                      background: "transparent",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="w-[10px] h-full shrink-0" style={{ background: "#1a1a1a", borderRight: "1px solid #0a0a0a" }} />
                    <span className="text-[9px] text-white/15 font-mono flex-1 text-center group-hover:text-white/35 transition-colors select-none">
                      {u}
                    </span>
                    <div className="w-[10px] h-full shrink-0" style={{ background: "#1a1a1a", borderLeft: "1px solid #0a0a0a" }} />
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/25 text-center">Clic en slot vacío = agregar · Clic en equipo = editar</p>
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* If nothing selected → device list */}
            {!editingDevice && !isAddingNew && (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white/70">Equipos en el Rack</h3>
                  <button
                    onClick={() => {
                      setIsAddingNew(true);
                      setSelectedDeviceId(null);
                      setEditingDevice({ id: `dev-${Date.now()}`, unit: 1, sizeUnits: 1, label: "Nuevo Equipo", type: "server", color: TYPE_META.server.color });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all"
                    style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar Equipo
                  </button>
                </div>

                {devices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-3 text-white/25">
                    <Server className="w-10 h-10" />
                    <p className="text-sm">Clic en un slot del rack para agregar equipos</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {[...devices].sort((a, b) => b.unit - a.unit).map(d => {
                      const meta = TYPE_META[d.type] || TYPE_META.other;
                      const si = getDeviceStatusInfo(d.monitorId);
                      return (
                        <div
                          key={d.id}
                          onClick={() => setSelectedDeviceId(d.id)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer border transition-all group"
                          style={{
                            background: selectedDeviceId === d.id ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                            border: selectedDeviceId === d.id ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: d.color || meta.color }}>
                            <span className="text-white/90">{meta.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-white/85 truncate">{d.label}</span>
                              {d.monitorId && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: si.color, boxShadow: `0 0 6px ${si.color}88` }} />}
                            </div>
                            <p className="text-[11px] text-white/35">{meta.label} · U{d.unit}{d.sizeUnits > 1 ? `-U${d.unit + d.sizeUnits - 1}` : ""} · {d.sizeUnits}U</p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteDevice(d.id); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-white/30 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Device Editor */}
            {editingDevice && (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-semibold text-white/70">
                    {isAddingNew ? "Agregar Equipo" : "Editar Equipo"}
                  </h3>
                  <button
                    onClick={() => { setIsAddingNew(false); setSelectedDeviceId(null); setEditingDevice(null); }}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Name */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Nombre</label>
                    <input
                      type="text"
                      value={editingDevice.label}
                      onChange={e => setEditingDevice({ ...editingDevice, label: e.target.value })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm text-white border border-white/10 focus:outline-none focus:border-blue-500 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    />
                  </div>

                  {/* Type + Color */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Tipo</label>
                      <select
                        value={editingDevice.type}
                        onChange={e => setEditingDevice({ ...editingDevice, type: e.target.value as any, color: TYPE_META[e.target.value]?.color || editingDevice.color })}
                        className="w-full rounded-xl px-4 py-2.5 text-sm text-white border border-white/10 focus:outline-none focus:border-blue-500 transition-colors"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        {Object.entries(TYPE_META).map(([k, v]) => (
                          <option key={k} value={k} style={{ background: "#1a1a1a" }}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Color</label>
                      <input
                        type="color"
                        value={editingDevice.color || TYPE_META[editingDevice.type]?.color || "#3b82f6"}
                        onChange={e => setEditingDevice({ ...editingDevice, color: e.target.value })}
                        className="w-full h-[42px] rounded-xl border border-white/10 cursor-pointer p-1"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      />
                    </div>
                  </div>

                  {/* Position + Size */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Posición (U base)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min={1} max={totalUnits}
                          value={editingDevice.unit}
                          onChange={e => setEditingDevice({ ...editingDevice, unit: parseInt(e.target.value) || 1 })}
                          className="w-full rounded-xl px-4 py-2.5 text-sm text-white border border-white/10 focus:outline-none focus:border-blue-500 transition-colors"
                          style={{ background: "rgba(255,255,255,0.05)" }}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Alto (U)</label>
                      <input
                        type="number"
                        min={1} max={totalUnits - editingDevice.unit + 1}
                        value={editingDevice.sizeUnits}
                        onChange={e => setEditingDevice({ ...editingDevice, sizeUnits: parseInt(e.target.value) || 1 })}
                        className="w-full rounded-xl px-4 py-2.5 text-sm text-white border border-white/10 focus:outline-none focus:border-blue-500 transition-colors"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      />
                    </div>
                  </div>

                  {/* Monitor Association */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Sensor Uptime Kuma</label>
                    <select
                      value={editingDevice.monitorId || ""}
                      onChange={e => setEditingDevice({ ...editingDevice, monitorId: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full rounded-xl px-4 py-2.5 text-sm text-white border border-white/10 focus:outline-none focus:border-blue-500 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <option value="" style={{ background: "#1a1a1a" }}>— Sin sensor —</option>
                      {monitors?.map(m => (
                        <option key={m.id} value={m.id} style={{ background: "#1a1a1a" }}>{m.name} ({m.type})</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Notas</label>
                    <textarea
                      value={editingDevice.notes || ""}
                      onChange={e => setEditingDevice({ ...editingDevice, notes: e.target.value })}
                      rows={2}
                      placeholder="IP, observaciones, modelo..."
                      className="w-full rounded-xl px-4 py-2.5 text-sm text-white border border-white/10 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    />
                  </div>

                  {/* Patch Panel Ports (special) */}
                  {editingDevice.type === "patchpanel" && (
                    <div>
                      <label className="block text-[11px] font-semibold text-white/40 mb-2 uppercase tracking-wider">
                        Puertos del Patch Panel
                        <span className="ml-2 normal-case text-white/25">(click para marcar conectado)</span>
                      </label>
                      <PatchPanelEditor
                        ports={editingDevice.ports || Array.from({ length: 24 }, (_, i) => ({ port: i + 1, label: `P${i + 1}`, connected: false }))}
                        onChange={ports => setEditingDevice({ ...editingDevice, ports })}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={handleSaveDevice}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                      style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
                    >
                      {isAddingNew ? "Agregar al Rack" : "Guardar Cambios"}
                    </button>
                    {!isAddingNew && selectedDeviceId && (
                      <button
                        onClick={() => handleDeleteDevice(selectedDeviceId)}
                        className="px-4 py-2.5 rounded-xl text-sm font-semibold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Patch Panel visual sub-component ──
function PatchPanelEditor({ ports, onChange }: { ports: PatchPort[]; onChange: (p: PatchPort[]) => void }) {
  const togglePort = (i: number) => {
    const next = [...ports];
    next[i] = { ...next[i], connected: !next[i].connected };
    onChange(next);
  };
  const updateLabel = (i: number, v: string) => {
    const next = [...ports];
    next[i] = { ...next[i], label: v };
    onChange(next);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.07]" style={{ background: "#111" }}>
      <div className="grid p-3 gap-1" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
        {ports.map((p, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <button
              onClick={() => togglePort(i)}
              className="w-full aspect-square rounded-sm flex items-center justify-center transition-all text-[8px] font-mono font-bold border"
              style={{
                background: p.connected ? "#22c55e22" : "#1a1a1a",
                border: p.connected ? "1px solid #22c55e66" : "1px solid #333",
                color: p.connected ? "#22c55e" : "#555",
                boxShadow: p.connected ? "0 0 6px #22c55e44" : "none",
              }}
              title={`Puerto ${p.port}: ${p.connected ? "Conectado" : "Libre"}`}
            >
              {p.port}
            </button>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3 flex items-center gap-2 text-[10px] text-white/30">
        <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#22c55e44", border: "1px solid #22c55e66" }} />
        Conectado
        <span className="w-2 h-2 rounded-sm inline-block ml-2" style={{ background: "#1a1a1a", border: "1px solid #333" }} />
        Libre
      </div>
    </div>
  );
}
