"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X, Download, Server, Network, Zap, Settings, Trash2, Plus,
  Inbox, Router, Cable, Lock, Unlock, Save, Search, FileText, ChevronLeft, ChevronRight,
  FileSpreadsheet, Printer, FileDown, Upload,
} from "lucide-react";
import html2canvas from "html2canvas";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface PatchPort {
  port: number;
  label: string;
  connected: boolean;
  destination?: string;
  cableLength?: string;
  cableColor?: string;
  isPoe?: boolean;
  poeType?: "802.3af" | "802.3at" | "802.3bt";
  connectedDevice?: string;
  macAddress?: string;
  notes?: string;
}

export interface SwitchPort {
  port: number;
  label: string;
  connected: boolean;
  speed?: "10" | "100" | "1G" | "10G";
  isPoe?: boolean;
  poeWatts?: number;
  connectedDevice?: string;
  macAddress?: string;
  vlan?: number;
  uplink?: boolean;
  notes?: string;
}

export interface RouterInterface {
  id: string;
  name: string;
  type: "WAN" | "LAN" | "MGMT" | "DMZ" | "VPN" | "other";
  ipAddress?: string;
  connected: boolean;
  notes?: string;
}

export interface RackDevice {
  id: string;
  unit: number;
  sizeUnits: number;
  label: string;
  type: "server" | "switch" | "patchpanel" | "ups" | "router" | "pdu" | "tray-fiber" | "tray-1u" | "tray-2u" | "cable-organizer" | "other";
  color?: string;
  monitorId?: number | null;
  ports?: PatchPort[];
  switchPorts?: SwitchPort[];
  routerInterfaces?: RouterInterface[];
  portCount?: number;
  managementIp?: string;
  model?: string;
  serial?: string;
  cableLength?: number;
  isPoeCapable?: boolean;
  notes?: string;
  // Bandeja de fibra
  fiberTrayType?: string;
  fiberCapacity?: number;
  fiberConnectorType?: string;
  fiberMode?: string;
  spliceCount?: number;
  // Organizador de cable
  mountedItems?: string;
  // PDU
  pduHasBreaker?: boolean;
  pduInputCount?: number;
}

interface RackDesignerDrawerProps {
  open: boolean;
  onClose: () => void;
  nodeId: string | null;
  nodes: any[];
  monitors?: any[];
  onSave: (nodeId: string, customData: any) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  server:       { label: "Servidor",         icon: <Server className="w-4 h-4" />,   color: "#3b82f6" },
  switch:       { label: "Switch",           icon: <Network className="w-4 h-4" />,  color: "#10b981" },
  patchpanel:   { label: "Patch Panel",      icon: <Cable className="w-4 h-4" />,    color: "#8b5cf6" },
  ups:          { label: "UPS / Energía",    icon: <Zap className="w-4 h-4" />,      color: "#f59e0b" },
  router:       { label: "Router",           icon: <Router className="w-4 h-4" />,   color: "#ef4444" },
  pdu:          { label: "PDU",              icon: <Zap className="w-4 h-4" />,      color: "#f97316" },
  "tray-fiber": { label: "Bandeja de Fibra", icon: <Inbox className="w-4 h-4" />,   color: "#d946ef" },
  "tray-1u":         { label: "Bandeja 1U",          icon: <Inbox className="w-4 h-4" />,       color: "#52525b" },
  "tray-2u":         { label: "Bandeja 2U",          icon: <Inbox className="w-4 h-4" />,       color: "#52525b" },
  "cable-organizer": { label: "Organizador de Cable", icon: <Cable className="w-4 h-4" />,       color: "#78716c" },
  other:             { label: "Otro",                icon: <Settings className="w-4 h-4" />,    color: "#6b7280" },
};

const UNIT_OPTIONS = [3, 6, 9, 12, 18, 22, 24, 42, 45, 48];
const CABLE_LENGTHS = ["0.5m", "1m", "1.5m", "2m", "3m", "5m", "7m", "10m", "15m", "20m"];
const CABLE_PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#a8a8a8", "#f5f5f5"];
const SWITCH_SPEEDS = ["10", "100", "1G", "10G"] as const;
const POE_TYPES = ["802.3af", "802.3at", "802.3bt"] as const;
const ROUTER_IF_TYPES = ["WAN", "LAN", "MGMT", "DMZ", "VPN", "other"] as const;

const SPEED_COLOR: Record<string, string> = {
  "10": "#52525b", "100": "#3b82f6", "1G": "#10b981", "10G": "#f59e0b",
};

const IF_TYPE_COLOR: Record<string, string> = {
  WAN: "#ef4444", LAN: "#22c55e", MGMT: "#f59e0b", DMZ: "#f97316", VPN: "#8b5cf6", other: "#6b7280",
};

// ── Shared inline styles ───────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: "7px 12px",
  fontSize: 13,
  color: "rgba(255,255,255,0.85)",
  outline: "none",
};

const miniFieldStyle: React.CSSProperties = {
  ...fieldStyle,
  padding: "4px 8px",
  fontSize: 11,
};

const toggleTrack = (on: boolean, accentColor = "#22c55e"): React.CSSProperties => ({
  width: 36,
  height: 20,
  borderRadius: 10,
  background: on ? accentColor : "#333",
  position: "relative",
  cursor: "pointer",
  transition: "background 0.2s",
  flexShrink: 0,
  border: "none",
  padding: 0,
});

const toggleThumb = (on: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 2,
  left: on ? "calc(100% - 18px)" : 2,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  transition: "left 0.2s",
});

// ── Main component ─────────────────────────────────────────────────────────────

export default function RackDesignerDrawer({ open, onClose, nodeId, nodes, monitors, onSave }: RackDesignerDrawerProps) {
  const [totalUnits, setTotalUnits] = useState(42);
  const [devices, setDevices] = useState<RackDevice[]>([]);
  const [rackName, setRackName] = useState("Rack");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<RackDevice | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isRackCollapsed, setIsRackCollapsed] = useState(false);
  const [selectedEmptyUnit, setSelectedEmptyUnit] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const rackRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const getDeviceStatusInfo = useCallback((monitorId?: number | null) => {
    if (!monitorId || !monitors) return { color: "#6b7280", name: "" };
    const m = monitors.find((x: any) => x.id === monitorId);
    if (!m) return { color: "#6b7280", name: "" };
    if (!m.active || m.status == null) return { color: "#6b7280", name: m.name };
    if (m.status === 0) return { color: "#ef4444", name: m.name };
    if (m.status === 2) return { color: "#f59e0b", name: m.name };
    if (m.status === 3) return { color: "#8b5cf6", name: m.name };
    return { color: "#22c55e", name: m.name };
  }, [monitors]);

  useEffect(() => {
    if (open && nodeId) {
      const node = nodes.find((n: any) => n.id === nodeId);
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
      setSelectedEmptyUnit(null);
    }
  }, [open, nodeId, nodes]);

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
    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) return;

    // Auto-flush any active device edits so port changes don't get lost
    let currentDevices = devices;
    if (editingDevice) {
      const idx = currentDevices.findIndex(p => p.id === editingDevice.id);
      if (idx >= 0) {
        currentDevices = [...currentDevices];
        currentDevices[idx] = editingDevice;
      } else {
        currentDevices = [...currentDevices, editingDevice];
      }
      setDevices(currentDevices);
    }

    const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
    cd.type = "rack";
    cd.totalUnits = totalUnits;
    cd.devices = currentDevices;
    onSave(nodeId, cd);
  };

  const handleDownloadReport = async () => {
    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) return;

    // Flush pending device edits
    let currentDevices = devices;
    if (editingDevice) {
      const idx = currentDevices.findIndex(p => p.id === editingDevice.id);
      currentDevices = idx >= 0
        ? currentDevices.map((d, i) => (i === idx ? editingDevice : d))
        : [...currentDevices, editingDevice];
    }

    try {
      const res = await fetch("/api/rack-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rackName, totalUnits, devices: currentDevices }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rack-${rackName.replace(/\s+/g, "_")}-report.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error al generar el reporte: " + err);
    }
  };

  const handleExportTemplate = async () => {
    let currentDevices = devices;
    if (editingDevice) {
      const idx = currentDevices.findIndex(p => p.id === editingDevice.id);
      currentDevices = idx >= 0 ? currentDevices.map((d, i) => (i === idx ? editingDevice : d)) : [...currentDevices, editingDevice];
    }
    try {
      const res = await fetch("/api/rack-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rackName, totalUnits, devices: currentDevices }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rack-${rackName.replace(/\s+/g, "_")}-template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error al exportar plantilla: " + err);
    }
  };

  const handleImportTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      let currentDevices = devices;
      if (editingDevice) {
        const idx = currentDevices.findIndex(p => p.id === editingDevice.id);
        currentDevices = idx >= 0 ? currentDevices.map((d, i) => (i === idx ? editingDevice : d)) : [...currentDevices, editingDevice];
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("devices", JSON.stringify(currentDevices));
      const res = await fetch("/api/rack-import", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDevices(data.devices);
      setEditingDevice(null);
      setSelectedDeviceId(null);
    } catch (err) {
      alert("Error al importar: " + err);
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const handleClickUnit = (u: number) => {
    if (isLocked) return;
    const occ = occupancyMap.get(u);
    if (occ) {
      setSelectedDeviceId(occ.device.id);
      setIsAddingNew(false);
      setSelectedEmptyUnit(null);
    } else {
      setSelectedDeviceId(null);
      setIsAddingNew(false);
      setEditingDevice(null);
      setSelectedEmptyUnit(u);
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
    // Build a professional export container off-screen
    const container = document.createElement("div");
    container.style.cssText = `
      position:fixed; left:-9999px; top:0;
      width:900px; background:#0f0f0f; padding:32px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#fff; border-radius:16px;
    `;

    // Header
    const now = new Date().toLocaleDateString("es-UY", { day:"2-digit", month:"2-digit", year:"numeric" });
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.1)">
        <div>
          <div style="font-size:22px;font-weight:700;color:#fff">${rackName}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px">${totalUnits}U total · ${usedUnits}U ocupadas · ${freeUnits}U libres</div>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.3);text-align:right">
          Exportado ${now}<br/>
          <span style="font-size:10px;color:rgba(255,255,255,0.2)">KumaMap Rack Designer</span>
        </div>
      </div>
      <div style="display:flex;gap:24px;align-items:flex-start">
        <div id="rack-export-visual" style="flex-shrink:0"></div>
        <div id="rack-export-table" style="flex:1;min-width:0"></div>
      </div>
    `;
    document.body.appendChild(container);

    // Clone rack visual
    if (rackRef.current) {
      const clone = rackRef.current.cloneNode(true) as HTMLElement;
      clone.style.cssText = "width:200px;border-radius:8px;overflow:hidden;";
      container.querySelector("#rack-export-visual")!.appendChild(clone);
    }

    // Build device table
    const sorted = [...devices].sort((a, b) => b.unit - a.unit);
    const tableHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.12)">
            ${["U","Nombre","Tipo","Modelo","IP Gestión","Puertos","Cable","PoE","Notas"].map(h =>
              `<th style="text-align:left;padding:6px 8px;color:rgba(255,255,255,0.4);font-weight:600;text-transform:uppercase;font-size:9px;letter-spacing:0.06em">${h}</th>`
            ).join("")}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((d, i) => {
            const meta = TYPE_META[d.type] || TYPE_META.other;
            const connPorts = d.type === "patchpanel"
              ? `${(d.ports||[]).filter(p=>p.connected).length}/${d.portCount||24}`
              : d.type === "switch"
              ? `${(d.switchPorts||[]).filter(p=>p.connected).length}/${d.portCount||24}`
              : "—";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);background:${i%2===0?"transparent":"rgba(255,255,255,0.02)"}">
              <td style="padding:6px 8px;font-family:monospace;color:rgba(255,255,255,0.5)">U${d.unit}${d.sizeUnits>1?`-${d.unit+d.sizeUnits-1}`:""}</td>
              <td style="padding:6px 8px;font-weight:600;color:#fff">${d.label}</td>
              <td style="padding:6px 8px;color:rgba(255,255,255,0.5)">${meta.label}</td>
              <td style="padding:6px 8px;color:rgba(255,255,255,0.4)">${d.model||"—"}</td>
              <td style="padding:6px 8px;font-family:monospace;color:rgba(255,255,255,0.4)">${d.managementIp||"—"}</td>
              <td style="padding:6px 8px;font-family:monospace;color:rgba(255,255,255,0.4)">${connPorts}</td>
              <td style="padding:6px 8px;color:rgba(255,255,255,0.4);font-family:monospace">${d.cableLength != null ? d.cableLength+"m" : "—"}</td>
              <td style="padding:6px 8px;color:${d.isPoeCapable?"#f59e0b":"rgba(255,255,255,0.3)"}">${d.isPoeCapable?"✓":"—"}</td>
              <td style="padding:6px 8px;color:rgba(255,255,255,0.35);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.notes||""}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
    container.querySelector("#rack-export-table")!.innerHTML = tableHtml;

    try {
      const canvas = await html2canvas(container, { backgroundColor: "#0f0f0f", scale: 2, useCORS: true } as any);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `rack-${rackName.replace(/\s+/g, "_")}-${totalUnits}U.png`;
      a.click();
    } catch { alert("Error al exportar."); }
    finally { document.body.removeChild(container); }
  };

  if (!open) return null;

  const usedUnits = devices.reduce((s, d) => s + d.sizeUnits, 0);
  const freeUnits = totalUnits - usedUnits;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(10px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative flex flex-col rounded-2xl overflow-hidden border border-white/10"
        style={{
          width: "min(96vw, 910px)",
          maxHeight: "76vh",
          background: "linear-gradient(160deg, #161616 0%, #0e0e0e 100%)",
          boxShadow: "0 32px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.07] shrink-0"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#3b82f688,#6366f144)" }}
            >
              <Server className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-white/90 leading-none">{rackName}</h2>
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">
                {totalUnits}U ·{" "}
                <span style={{ color: "#fbbf24aa" }}>{usedUnits}U ocupadas</span> ·{" "}
                <span style={{ color: "#34d399aa" }}>{freeUnits}U libres</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={totalUnits}
              onChange={e => setTotalUnits(parseInt(e.target.value))}
              disabled={isLocked}
              className="text-xs rounded-lg px-2.5 py-1.5 border border-white/10 text-white/80 focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              {UNIT_OPTIONS.map(u => <option key={u} value={u} style={{ background: "#1a1a1a" }}>{u}U</option>)}
            </select>
            {/* Hidden file input for import */}
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportTemplate}
            />
            {/* Export template */}
            <button
              data-tooltip-id="rack-tip"
              data-tooltip-content="Exportar plantilla Excel editable"
              onClick={handleExportTemplate}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 transition-all cursor-pointer"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <FileDown className="w-3.5 h-3.5" />
            </button>
            {/* Import from template */}
            <button
              data-tooltip-id="rack-tip"
              data-tooltip-content="Importar desde plantilla Excel"
              onClick={() => importFileRef.current?.click()}
              disabled={isImporting}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: isImporting ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)", borderColor: isImporting ? "rgba(59,130,246,0.3)" : undefined }}
            >
              {isImporting
                ? <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}
            </button>
            {/* Export report */}
            <button
              data-tooltip-id="rack-tip"
              data-tooltip-content="Exportar datos del rack"
              onClick={() => setShowExportModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 transition-all cursor-pointer"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {/* Lock / Unlock — icon only */}
            <button
              data-tooltip-id="rack-tip"
              data-tooltip-content={isLocked ? "Desbloquear para editar" : "Bloquear edición"}
              onClick={() => {
                setIsLocked(l => {
                  if (!l) { setSelectedDeviceId(null); setEditingDevice(null); setIsAddingNew(false); setSelectedEmptyUnit(null); }
                  return !l;
                });
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all cursor-pointer"
              style={{
                background: isLocked ? "rgba(251,191,36,0.1)" : "rgba(34,197,94,0.1)",
                border: `1px solid ${isLocked ? "rgba(251,191,36,0.25)" : "rgba(34,197,94,0.25)"}`,
                color: isLocked ? "#fbbf24" : "#4ade80",
              }}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>

            <button
              data-tooltip-id="rack-tip"
              data-tooltip-content="Guardar Rack"
              onClick={handleSaveRack}
              className="w-8 h-8 flex items-center justify-center rounded-lg font-semibold transition-all cursor-pointer"
              style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              data-tooltip-id="rack-tip"
              data-tooltip-content="Cerrar"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0 relative">

          {/* ── Rack Visual (left) ── */}
          {/* Collapse toggle */}
          <button
            onClick={() => setIsRackCollapsed(c => !c)}
            data-tooltip-id="rack-tip"
            data-tooltip-content={isRackCollapsed ? "Mostrar rack" : "Ocultar rack"}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-5 flex flex-col items-center justify-center cursor-pointer transition-all"
            style={{
              height: 48,
              background: "rgba(255,255,255,0.06)",
              borderRadius: "0 6px 6px 0",
              border: "1px solid rgba(255,255,255,0.08)",
              borderLeft: "none",
              color: "rgba(255,255,255,0.4)",
              marginLeft: isRackCollapsed ? 0 : 310,
              transition: "margin-left 0.25s ease",
            }}
          >
            {isRackCollapsed
              ? <ChevronRight className="w-3 h-3" />
              : <ChevronLeft className="w-3 h-3" />
            }
          </button>

          <motion.div
            animate={{ width: isRackCollapsed ? 0 : 310, opacity: isRackCollapsed ? 0 : 1 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="shrink-0 border-r border-white/[0.06] overflow-hidden"
            style={{ background: "rgba(0,0,0,0.25)" }}
          >
            <div className="w-[310px] h-full overflow-y-auto rack-scroll">
            <div className="flex flex-col items-center gap-3 p-4" style={{ minHeight: "100%", justifyContent: "center", display: "flex", flexDirection: "column" }}>
            <div className="text-[10px] text-white/25 self-start pl-7 font-mono">U{totalUnits} → U1</div>
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
                const isSelected = !!(occ && selectedDeviceId === occ.device.id);

                if (occ) {
                  if (occ.isHead) {
                    const meta = TYPE_META[occ.device.type] || TYPE_META.other;
                    const si = getDeviceStatusInfo(occ.device.monitorId);
                    const h = occ.device.sizeUnits * 26;
                    return (
                      <div
                        key={u}
                        onClick={() => { setSelectedDeviceId(occ.device.id); setIsAddingNew(false); }}
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
                        <div className="absolute left-0 top-0 bottom-0 w-[8px]" style={{ background: "#1a1a1a", borderRight: "1px solid #0a0a0a" }} />
                        <div className="absolute right-0 top-0 bottom-0 w-[8px]" style={{ background: "#1a1a1a", borderLeft: "1px solid #0a0a0a" }} />
                        {[0, h - 6].map((t, si2) => (
                          <React.Fragment key={si2}>
                            <div className="absolute w-1 h-1 rounded-full" style={{ top: t + 3, left: 1.5, background: "#0a0a0a" }} />
                            <div className="absolute w-1 h-1 rounded-full" style={{ top: t + 3, right: 1.5, background: "#0a0a0a" }} />
                          </React.Fragment>
                        ))}
                        <div className="absolute inset-x-[10px] inset-y-0 flex items-center justify-between px-1.5 gap-1">
                          <div className="flex items-center gap-1.5 min-w-0 shrink">
                            <span className="text-white/80 shrink-0">{meta.icon}</span>
                            <span className="text-[11px] font-semibold text-white/95 truncate leading-none">{occ.device.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {occ.device.monitorId && (
                              <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: si.color, boxShadow: `0 0 6px ${si.color}88` }}
                                title={si.name}
                              />
                            )}
                            <span className="text-[9px] text-white/40 font-mono">
                              U{occ.device.unit}{occ.device.sizeUnits > 1 ? `-${occ.device.unit + occ.device.sizeUnits - 1}` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }

                return (
                  <div
                    key={u}
                    onClick={() => handleClickUnit(u)}
                    className="w-full flex-shrink-0 flex items-center cursor-pointer group transition-colors"
                    style={{ height: "26px", borderBottom: "1px solid #232323", background: "transparent" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="w-[8px] h-full shrink-0" style={{ background: "#1a1a1a", borderRight: "1px solid #0a0a0a" }} />
                    <span className="text-[9px] text-white/15 font-mono flex-1 text-center group-hover:text-white/35 transition-colors select-none">{u}</span>
                    <div className="w-[8px] h-full shrink-0" style={{ background: "#1a1a1a", borderLeft: "1px solid #0a0a0a" }} />
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/20 text-center">Slot vacío → agregar · Equipo → editar</p>
            </div>
            </div>
          </motion.div>

          {/* ── Right panel ── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <AnimatePresence mode="wait">
              {editingDevice ? (
                <DeviceEditor
                  key="editor"
                  device={editingDevice}
                  isNew={isAddingNew}
                  totalUnits={totalUnits}
                  monitors={monitors}
                  isLocked={isLocked}
                  onChange={setEditingDevice}
                  onSave={handleSaveDevice}
                  onDelete={!isAddingNew && selectedDeviceId ? () => handleDeleteDevice(selectedDeviceId) : undefined}
                  onCancel={() => { setIsAddingNew(false); setSelectedDeviceId(null); setEditingDevice(null); setSelectedEmptyUnit(null); }}
                />
              ) : selectedEmptyUnit !== null ? (
                <EmptySlotPanel
                  key={`empty-${selectedEmptyUnit}`}
                  unit={selectedEmptyUnit}
                  onAdd={() => {
                    setIsAddingNew(true);
                    setSelectedDeviceId(null);
                    setEditingDevice({
                      id: `dev-${Date.now()}`,
                      unit: selectedEmptyUnit,
                      sizeUnits: 1,
                      label: "Nuevo Equipo",
                      type: "server",
                      color: TYPE_META.server.color,
                    });
                    setSelectedEmptyUnit(null);
                  }}
                  onClose={() => setSelectedEmptyUnit(null)}
                />
              ) : (
                <DeviceList
                  key="list"
                  devices={devices}
                  selectedDeviceId={selectedDeviceId}
                  isLocked={isLocked}
                  onSelect={id => { if (!isLocked) { setSelectedDeviceId(id); setIsAddingNew(false); setSelectedEmptyUnit(null); } }}
                  onAdd={() => {
                    if (isLocked) return;
                    setIsAddingNew(true);
                    setSelectedDeviceId(null);
                    setSelectedEmptyUnit(null);
                    setEditingDevice({ id: `dev-${Date.now()}`, unit: 1, sizeUnits: 1, label: "Nuevo Equipo", type: "server", color: TYPE_META.server.color });
                  }}
                  onDelete={handleDeleteDevice}
                  getStatusInfo={getDeviceStatusInfo}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* React-Tooltip global instance */}
      <Tooltip
        id="rack-tip"
        place="bottom"
        style={{
          background: "rgba(15,15,15,0.96)",
          color: "#e5e7eb",
          fontSize: 11,
          fontWeight: 500,
          padding: "5px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
          zIndex: 99999,
        }}
      />

      {/* Scrollbar styling */}
      <style>{`
        .rack-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .rack-scroll::-webkit-scrollbar-track { background: transparent; }
        .rack-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .rack-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .rack-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
      `}</style>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <ExportModal
            rackName={rackName}
            totalUnits={totalUnits}
            devices={devices}
            onClose={() => setShowExportModal(false)}
            onPng={async () => {
              await handleDownloadImage();
              setShowExportModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Monitor searchable combobox ───────────────────────────────────────────────

function MonitorSelect({
  monitors,
  value,
  onChange,
}: {
  monitors?: any[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = monitors?.find((m: any) => m.id === value) ?? null;

  const filtered = useMemo(() => {
    if (!monitors) return [];
    const q = query.toLowerCase();
    return monitors.filter((m: any) =>
      m.name?.toLowerCase().includes(q) || m.type?.toLowerCase().includes(q)
    );
  }, [monitors, query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className="w-full flex items-center justify-between cursor-pointer"
        style={{
          ...fieldStyle,
          textAlign: "left",
          paddingRight: 32,
        }}
      >
        <span style={{ color: selected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}>
          {selected ? `${selected.name} (${selected.type})` : "— Sin sensor —"}
        </span>
        <Search
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 13,
            height: 13,
            color: "rgba(255,255,255,0.3)",
            pointerEvents: "none",
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 10000,
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            maxHeight: 220,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar monitor..."
              style={{
                ...miniFieldStyle,
                width: "100%",
                background: "rgba(255,255,255,0.06)",
              }}
            />
          </div>
          {/* Options */}
          <div className="rack-scroll" style={{ overflowY: "auto", flex: 1 }}>
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="w-full text-left cursor-pointer"
              style={{
                padding: "7px 12px",
                fontSize: 12,
                color: !value ? "#60a5fa" : "rgba(255,255,255,0.4)",
                background: !value ? "rgba(59,130,246,0.08)" : "transparent",
                border: "none",
                display: "block",
              }}
              onMouseEnter={e => { if (value) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              — Sin sensor —
            </button>
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                No hay resultados
              </div>
            )}
            {filtered.map((m: any) => {
              const isSel = m.id === value;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m.id)}
                  className="w-full text-left cursor-pointer"
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    color: isSel ? "#60a5fa" : "rgba(255,255,255,0.75)",
                    background: isSel ? "rgba(59,130,246,0.1)" : "transparent",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.4)",
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}>
                    {m.type}
                  </span>
                  <span className="truncate">{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty Slot Panel ───────────────────────────────────────────────────────────

function EmptySlotPanel({
  unit, onAdd, onClose,
}: {
  unit: number;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.16 }}
      className="flex-1 flex flex-col items-center justify-center p-8 gap-6"
    >
      {/* Icon + label */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1.5px dashed rgba(255,255,255,0.12)",
          }}
        >
          <Inbox className="w-7 h-7" style={{ color: "rgba(255,255,255,0.2)" }} />
        </div>

        <div className="text-center">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono font-bold mb-2"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>U</span>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{unit}</span>
          </div>
          <p className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>
            Slot vacío — sin asignación
          </p>
          <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
            Este espacio del rack está disponible
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="flex flex-col items-center gap-2 w-full max-w-[220px]">
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all cursor-pointer"
          style={{
            background: "linear-gradient(135deg,#2563eb,#4f46e5)",
            boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
          }}
        >
          <Plus className="w-4 h-4" />
          Agregar equipo en U{unit}
        </button>
        <button
          onClick={onClose}
          className="text-xs cursor-pointer transition-colors"
          style={{ color: "rgba(255,255,255,0.25)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
        >
          ← Volver a la lista
        </button>
      </div>
    </motion.div>
  );
}

// ── Device List ────────────────────────────────────────────────────────────────

function DeviceList({
  devices, selectedDeviceId, isLocked, onSelect, onAdd, onDelete, getStatusInfo,
}: {
  devices: RackDevice[];
  selectedDeviceId: string | null;
  isLocked: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  getStatusInfo: (monitorId?: number | null) => { color: string; name: string };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.16 }}
      className="flex-1 overflow-y-auto rack-scroll p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/70">Equipos en el Rack</h3>
        {!isLocked && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all cursor-pointer"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }}
          >
            <Plus className="w-3.5 h-3.5" /> Agregar Equipo
          </button>
        )}
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 gap-3" style={{ color: "rgba(255,255,255,0.2)" }}>
          <Server className="w-12 h-12" />
          <p className="text-sm text-center">Haz clic en un slot del rack<br />para agregar equipos</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {[...devices].sort((a, b) => b.unit - a.unit).map(d => {
            const meta = TYPE_META[d.type] || TYPE_META.other;
            const si = getStatusInfo(d.monitorId);
            const isSel = selectedDeviceId === d.id;
            return (
              <div
                key={d.id}
                onClick={() => onSelect(d.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer border transition-all group"
                style={{
                  background: isSel ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                  border: isSel ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: d.color || meta.color }}
                >
                  <span className="text-white/90">{meta.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>{d.label}</span>
                    {d.model && <span className="text-[10px] text-white/30 truncate">{d.model}</span>}
                    {d.monitorId && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: si.color, boxShadow: `0 0 6px ${si.color}88` }}
                        title={si.name}
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-white/35">
                    {meta.label} · U{d.unit}{d.sizeUnits > 1 ? `–U${d.unit + d.sizeUnits - 1}` : ""} · {d.sizeUnits}U
                    {d.managementIp && <span className="ml-1.5 font-mono text-white/25">{d.managementIp}</span>}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(d.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ── Device Editor ──────────────────────────────────────────────────────────────

function DeviceEditor({
  device, isNew, totalUnits, monitors, isLocked, onChange, onSave, onDelete, onCancel,
}: {
  device: RackDevice;
  isNew: boolean;
  totalUnits: number;
  monitors?: any[];
  isLocked: boolean;
  onChange: (d: RackDevice) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"ports" | "general">("ports");
  const meta = TYPE_META[device.type] || TYPE_META.other;
  const hasPorts = ["patchpanel", "switch", "router"].includes(device.type);

  const makeDefaultPatchPorts = (count: number): PatchPort[] =>
    Array.from({ length: count }, (_, i) => ({ port: i + 1, label: `P${i + 1}`, connected: false }));

  const makeDefaultSwitchPorts = (count: number): SwitchPort[] =>
    Array.from({ length: count }, (_, i) => ({ port: i + 1, label: `${i + 1}`, connected: false, speed: "1G" as const }));

  const handleTypeChange = (type: RackDevice["type"]) => {
    const upd: Partial<RackDevice> = { type, color: TYPE_META[type]?.color || device.color };
    if (type === "patchpanel" && !device.ports)
      upd.ports = makeDefaultPatchPorts(device.portCount || 24);
    if (type === "switch" && !device.switchPorts)
      upd.switchPorts = makeDefaultSwitchPorts(device.portCount || 24);
    if (type === "router" && !device.routerInterfaces)
      upd.routerInterfaces = [
        { id: "if-wan", name: "WAN", type: "WAN", connected: false },
        { id: "if-lan1", name: "LAN1", type: "LAN", connected: false },
        { id: "if-mgmt", name: "MGMT", type: "MGMT", connected: false },
      ];
    onChange({ ...device, ...upd });
  };

  const handlePortCountChange = (cnt: number) => {
    const upd: Partial<RackDevice> = { portCount: cnt };
    if (device.type === "patchpanel") {
      upd.ports = Array.from({ length: cnt }, (_, i) =>
        device.ports?.[i] || { port: i + 1, label: `P${i + 1}`, connected: false });
    } else if (device.type === "switch") {
      upd.switchPorts = Array.from({ length: cnt }, (_, i) =>
        device.switchPorts?.[i] || { port: i + 1, label: `${i + 1}`, connected: false, speed: "1G" as const });
    }
    onChange({ ...device, ...upd });
  };

  const showPortCount = device.type === "patchpanel" || device.type === "switch";
  const showManagementIp = device.type === "switch" || device.type === "router" || device.type === "server";

  // Default to ports tab if device has ports, otherwise general
  useEffect(() => {
    if (!hasPorts) setActiveTab("general");
  }, [device.type, hasPorts]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.16 }}
      className="flex-1 flex flex-col min-h-0"
    >
      {/* Sticky header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]" style={{ background: "#0e0e0e" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: device.color || meta.color }}>
            <span className="text-white/90">{meta.icon}</span>
          </div>
          <span className="text-sm font-semibold text-white/80">{isNew ? "Nuevo Equipo" : device.label}</span>
          <span className="text-[11px] text-white/30">{meta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && onDelete && (
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {!isLocked && (
            <button onClick={onSave} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer" style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 2px 8px rgba(99,102,241,0.3)" }}>
              {isNew ? "Agregar al Rack" : "Guardar"}
            </button>
          )}
          <button onClick={onCancel} className="text-xs text-white/35 hover:text-white/65 transition-colors cursor-pointer">← Volver</button>
        </div>
      </div>

      {/* Tab bar */}
      {hasPorts && (
        <div className="shrink-0 flex border-b border-white/[0.06]" style={{ background: "rgba(0,0,0,0.2)" }}>
          {[
            { id: "ports", label: device.type === "router" ? "Interfaces" : `Puertos${device.type === "patchpanel" ? " del Panel" : ""}` },
            { id: "general", label: "General" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "ports" | "general")}
              className="px-5 py-2.5 text-xs font-semibold transition-all cursor-pointer relative"
              style={{
                color: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.35)",
                borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
                background: activeTab === tab.id ? "rgba(59,130,246,0.05)" : "transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto rack-scroll p-5 flex flex-col gap-5">
        {/* Ports tab */}
        {activeTab === "ports" && device.type === "patchpanel" && (
          <PatchPanelEditor
            ports={device.ports || makeDefaultPatchPorts(device.portCount || 24)}
            onChange={ports => onChange({ ...device, ports })}
          />
        )}
        {activeTab === "ports" && device.type === "switch" && (
          <SwitchEditor
            ports={device.switchPorts || makeDefaultSwitchPorts(device.portCount || 24)}
            onChange={switchPorts => onChange({ ...device, switchPorts })}
          />
        )}
        {activeTab === "ports" && device.type === "router" && (
          <RouterEditor
            interfaces={device.routerInterfaces || []}
            onChange={routerInterfaces => onChange({ ...device, routerInterfaces })}
          />
        )}

        {/* General tab */}
        {activeTab === "general" && (
          <>
            <SectionHeader title="Información General" />
            <div className="grid grid-cols-2 gap-3 -mt-2">
              <div style={{ gridColumn: "span 2" }}>
                <FieldLabel>Nombre</FieldLabel>
                <input type="text" value={device.label} onChange={e => onChange({ ...device, label: e.target.value })} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Tipo</FieldLabel>
                <select value={device.type} onChange={e => handleTypeChange(e.target.value as RackDevice["type"])} style={fieldStyle}>
                  {Object.entries(TYPE_META).map(([k, v]) => (<option key={k} value={k} style={{ background: "#1a1a1a" }}>{v.label}</option>))}
                </select>
              </div>
              <div>
                <FieldLabel>Color</FieldLabel>
                <div className="flex items-center gap-2">
                  <input type="color" value={device.color || meta.color} onChange={e => onChange({ ...device, color: e.target.value })} className="w-10 h-9 rounded-lg border border-white/10 cursor-pointer p-0.5" style={{ background: "rgba(255,255,255,0.05)" }} />
                  <span className="text-[11px] text-white/35 font-mono">{device.color || meta.color}</span>
                </div>
              </div>
              <div>
                <FieldLabel>Modelo</FieldLabel>
                <input type="text" value={device.model || ""} onChange={e => onChange({ ...device, model: e.target.value })} placeholder="ej. Cisco SG350-28P" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Número de Serie</FieldLabel>
                <input type="text" value={device.serial || ""} onChange={e => onChange({ ...device, serial: e.target.value })} placeholder="S/N..." disabled={isLocked} style={{ ...fieldStyle, opacity: isLocked ? 0.5 : 1 }} />
              </div>
              {showManagementIp && (
                <div style={{ gridColumn: "span 2" }}>
                  <FieldLabel>IP de Gestión</FieldLabel>
                  <input type="text" value={device.managementIp || ""} onChange={e => onChange({ ...device, managementIp: e.target.value })} placeholder="192.168.1.1" style={{ ...fieldStyle, fontFamily: "monospace" }} />
                </div>
              )}
            </div>

            <SectionHeader title="Posición en el Rack" />
            <div className="grid gap-3 -mt-2" style={{ gridTemplateColumns: showPortCount ? "1fr 1fr 1fr" : "1fr 1fr" }}>
              <div>
                <FieldLabel>Posición (U base)</FieldLabel>
                <input type="number" min={1} max={totalUnits} value={device.unit} onChange={e => onChange({ ...device, unit: parseInt(e.target.value) || 1 })} style={{ ...fieldStyle, fontFamily: "monospace" }} />
              </div>
              <div>
                <FieldLabel>Alto (U)</FieldLabel>
                <input type="number" min={1} max={totalUnits - device.unit + 1} value={device.sizeUnits} onChange={e => onChange({ ...device, sizeUnits: parseInt(e.target.value) || 1 })} style={{ ...fieldStyle, fontFamily: "monospace" }} />
              </div>
              {showPortCount && (
                <div>
                  <FieldLabel>Cant. Puertos</FieldLabel>
                  <select value={device.portCount || 24} onChange={e => handlePortCountChange(parseInt(e.target.value))} style={fieldStyle}>
                    {[8, 12, 16, 24, 28, 48, 52].map(n => (<option key={n} value={n} style={{ background: "#1a1a1a" }}>{n} puertos</option>))}
                  </select>
                </div>
              )}
            </div>

            {/* ── Bandeja de Fibra: campos específicos ── */}
            {device.type === "tray-fiber" && (
              <>
                <SectionHeader title="Bandeja de Fibra" />
                <div className="grid grid-cols-2 gap-3 -mt-2">
                  <div>
                    <FieldLabel>Tipo de Bandeja</FieldLabel>
                    <select value={device.fiberTrayType || ""} onChange={e => onChange({ ...device, fiberTrayType: e.target.value })} style={fieldStyle}>
                      <option value="" style={{ background: "#1a1a1a" }}>— Seleccionar —</option>
                      <option value="lgx" style={{ background: "#1a1a1a" }}>LGX (Módulo estándar)</option>
                      <option value="mtp" style={{ background: "#1a1a1a" }}>MTP / MPO</option>
                      <option value="splice" style={{ background: "#1a1a1a" }}>Bandeja de Empalme</option>
                      <option value="duct" style={{ background: "#1a1a1a" }}>Bandeja Pasacable</option>
                      <option value="wdm" style={{ background: "#1a1a1a" }}>WDM / CWDM / DWDM</option>
                      <option value="other" style={{ background: "#1a1a1a" }}>Otro</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Capacidad (fibras)</FieldLabel>
                    <input type="number" min={1} value={device.fiberCapacity || ""} onChange={e => onChange({ ...device, fiberCapacity: parseInt(e.target.value) || undefined })} placeholder="24" style={{ ...fieldStyle, fontFamily: "monospace" }} />
                  </div>
                  <div>
                    <FieldLabel>Tipo de Conector</FieldLabel>
                    <select value={device.fiberConnectorType || ""} onChange={e => onChange({ ...device, fiberConnectorType: e.target.value })} style={fieldStyle}>
                      <option value="" style={{ background: "#1a1a1a" }}>— Seleccionar —</option>
                      <option value="sc-apc" style={{ background: "#1a1a1a" }}>SC/APC</option>
                      <option value="sc-upc" style={{ background: "#1a1a1a" }}>SC/UPC</option>
                      <option value="lc-upc" style={{ background: "#1a1a1a" }}>LC/UPC</option>
                      <option value="lc-apc" style={{ background: "#1a1a1a" }}>LC/APC</option>
                      <option value="fc-upc" style={{ background: "#1a1a1a" }}>FC/UPC</option>
                      <option value="st" style={{ background: "#1a1a1a" }}>ST</option>
                      <option value="mtp" style={{ background: "#1a1a1a" }}>MTP/MPO</option>
                      <option value="other" style={{ background: "#1a1a1a" }}>Otro</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Modo de Fibra</FieldLabel>
                    <select value={device.fiberMode || ""} onChange={e => onChange({ ...device, fiberMode: e.target.value })} style={fieldStyle}>
                      <option value="" style={{ background: "#1a1a1a" }}>— Seleccionar —</option>
                      <option value="os2" style={{ background: "#1a1a1a" }}>Monomodo OS2 (9/125)</option>
                      <option value="om3" style={{ background: "#1a1a1a" }}>Multimodo OM3 (50/125)</option>
                      <option value="om4" style={{ background: "#1a1a1a" }}>Multimodo OM4 (50/125)</option>
                      <option value="om5" style={{ background: "#1a1a1a" }}>Multimodo OM5 (50/125)</option>
                      <option value="other" style={{ background: "#1a1a1a" }}>Otro</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Cantidad de Empalmes</FieldLabel>
                    <input type="number" min={0} value={device.spliceCount ?? ""} onChange={e => onChange({ ...device, spliceCount: parseInt(e.target.value) || 0 })} placeholder="0" style={{ ...fieldStyle, fontFamily: "monospace" }} />
                  </div>
                </div>
              </>
            )}

            {/* ── Organizador de Cable ── */}
            {device.type === "cable-organizer" && (
              <>
                <SectionHeader title="Organizador de Cable" />
                <div className="-mt-2">
                  <FieldLabel>Elementos montados / apoyados</FieldLabel>
                  <textarea
                    value={device.mountedItems || ""}
                    onChange={e => onChange({ ...device, mountedItems: e.target.value })}
                    rows={3}
                    placeholder="ej. Cables del servidor 3, Patch del switch principal, Lazo fibra óptica..."
                    style={{ ...fieldStyle, resize: "none" }}
                  />
                </div>
              </>
            )}

            {/* ── PDU: energía ── */}
            {device.type === "pdu" && (
              <>
                <SectionHeader title="Distribución de Energía" />
                <div className="grid grid-cols-2 gap-3 -mt-2">
                  <div>
                    <FieldLabel>Entradas de energía</FieldLabel>
                    <input
                      type="number" min={1} max={8}
                      value={device.pduInputCount ?? 1}
                      onChange={e => onChange({ ...device, pduInputCount: parseInt(e.target.value) || 1 })}
                      style={{ ...fieldStyle, fontFamily: "monospace" }}
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={device.pduHasBreaker ?? false}
                        onChange={e => onChange({ ...device, pduHasBreaker: e.target.checked })}
                        className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                      />
                      <span className="text-[12px] text-white/70">Llave de corte (breaker)</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {device.type !== "patchpanel" && (
              <>
                <SectionHeader title="Sensor Uptime Kuma" />
                <div className="-mt-2">
                  <MonitorSelect monitors={monitors} value={device.monitorId} onChange={id => onChange({ ...device, monitorId: id })} />
                </div>
              </>
            )}

            <SectionHeader title="Notas" />
            <div className="-mt-2">
              <textarea value={device.notes || ""} onChange={e => onChange({ ...device, notes: e.target.value })} rows={2} placeholder="IP, observaciones, configuración, modelo..." style={{ ...fieldStyle, resize: "none" }} />
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Port button (used by PatchPanel + Switch) ──────────────────────────────────

type AnyPort = PatchPort | SwitchPort;

function PortBtn({
  port, selected, onClick,
}: {
  port: AnyPort;
  selected: boolean;
  onClick: () => void;
}) {
  const isPatch = "cableColor" in port;
  const pp = port as PatchPort;
  const sp = port as SwitchPort;

  const resolvedBg = (() => {
    if (!port.connected) return "#1a1a1a";
    if (isPatch && pp.cableColor) return pp.cableColor + "2a";
    if (!isPatch && sp.speed) return SPEED_COLOR[sp.speed] + "2a";
    return "#22c55e1a";
  })();

  const resolvedBorder = (() => {
    if (!port.connected) return selected ? "#3b82f6" : "#333";
    if (isPatch && pp.cableColor) return selected ? "#3b82f6" : pp.cableColor + "88";
    if (!isPatch && sp.speed) return selected ? "#3b82f6" : SPEED_COLOR[sp.speed] + "88";
    return selected ? "#3b82f6" : "#22c55e66";
  })();

  const resolvedText = (() => {
    if (selected) return "#93c5fd";
    if (!port.connected) return "#444";
    if (isPatch && pp.cableColor) return pp.cableColor;
    if (!isPatch && sp.speed) return SPEED_COLOR[sp.speed];
    return "#22c55e";
  })();

  const tipContent = [
    `Puerto ${port.port}`,
    port.label && port.label !== String(port.port) && port.label !== `P${port.port}` ? port.label : null,
    (port as PatchPort).connectedDevice || (port as SwitchPort).connectedDevice || null,
    port.connected ? "✓ Conectado" : "Libre",
    !isPatch && (port as SwitchPort).speed ? `${(port as SwitchPort).speed}` : null,
    !isPatch && (port as SwitchPort).vlan ? `VLAN ${(port as SwitchPort).vlan}` : null,
    isPatch && (port as PatchPort).destination ? (port as PatchPort).destination! : null,
  ].filter(Boolean).join("  ·  ");

  return (
    <button
      onClick={onClick}
      data-tooltip-id="rack-tip"
      data-tooltip-content={tipContent}
      className="relative w-full flex items-center justify-center transition-all cursor-pointer"
      style={{
        aspectRatio: "1",
        borderRadius: 3,
        background: selected ? "rgba(59,130,246,0.18)" : resolvedBg,
        border: `1px solid ${resolvedBorder}`,
        color: resolvedText,
        fontSize: 7,
        fontFamily: "monospace",
        fontWeight: 700,
        boxShadow: port.connected ? `0 0 5px ${resolvedBorder}` : "none",
        outline: selected ? "2px solid rgba(59,130,246,0.35)" : "none",
        outlineOffset: 1,
      }}
    >
      {port.port}
      {/* PoE indicator (patch) */}
      {isPatch && pp.isPoe && port.connected && (
        <span
          className="absolute"
          style={{ top: -2, right: -2, width: 5, height: 5, borderRadius: "50%", background: "#f59e0b" }}
        />
      )}
      {/* Uplink indicator (switch) */}
      {!isPatch && sp.uplink && (
        <span
          className="absolute"
          style={{ top: -2, right: -2, width: 5, height: 5, borderRadius: "50%", background: "#60a5fa" }}
        />
      )}
    </button>
  );
}

// ── Port grid helper ───────────────────────────────────────────────────────────

function PortGrid({
  ports, selectedPort, onSelect,
}: {
  ports: AnyPort[];
  selectedPort: number | null;
  onSelect: (port: number) => void;
}) {
  // For ≤24 ports: one row. For 25–48: two rows of 24. For >48: rows of 24.
  const rowSize = ports.length <= 24 ? ports.length : 24;
  const rows: AnyPort[][] = [];
  for (let i = 0; i < ports.length; i += rowSize) rows.push(ports.slice(i, i + rowSize));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, ri) => (
        <div key={ri}>
          {/* Port number labels */}
          <div className="grid gap-1 mb-0.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
            {row.map(p => (
              <div key={p.port} className="text-center font-mono" style={{ fontSize: 6, color: "rgba(255,255,255,0.2)" }}>
                {p.port}
              </div>
            ))}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
            {row.map(p => (
              <PortBtn
                key={p.port}
                port={p}
                selected={selectedPort === p.port}
                onClick={() => onSelect(selectedPort === p.port ? -1 : p.port)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Ethernet port SVG icon ────────────────────────────────────────────────────

function EthernetIcon({ ifNum, color = "#888", size = 28 }: { ifNum: number; color?: string; size?: number }) {
  const w = size;
  const h = Math.round(size * 0.78);
  return (
    <svg width={w} height={h} viewBox="0 0 28 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer RJ45 body */}
      <rect x="2" y="2" width="24" height="17" rx="3" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
      {/* Contact area */}
      <rect x="6" y="6" width="16" height="8" rx="1" stroke={color} strokeWidth="1" strokeOpacity="0.5" fill="none" />
      {/* 8 pins */}
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i}
          x1={7 + i * 2} y1="6" x2={7 + i * 2} y2="10"
          stroke={color} strokeWidth="1" strokeOpacity="0.7"
        />
      ))}
      {/* Locking tab at bottom */}
      <rect x="9" y="19" width="10" height="3" rx="1" fill={color} fillOpacity="0.4" />
      {/* Interface number */}
      <text
        x="14" y="13.5"
        textAnchor="middle"
        fontSize="5"
        fontFamily="monospace"
        fontWeight="700"
        fill={color}
        fillOpacity="0.9"
      >
        {ifNum}
      </text>
    </svg>
  );
}

// ── Port Table ────────────────────────────────────────────────────────────────

function PortTable({
  ports, selectedPort, onSelect, type, renderExpansion,
}: {
  ports: AnyPort[];
  selectedPort: number | null;
  onSelect: (port: number) => void;
  type: "patch" | "switch";
  renderExpansion?: (port: AnyPort) => React.ReactNode;
}) {
  const isPatch = type === "patch";
  const colCount = isPatch ? 7 : 8;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 480 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            {["#", "Estado", "Etiqueta",
              ...(isPatch ? ["Destino", "Dispositivo", "Cable", "PoE"] : ["Velocidad", "Dispositivo", "VLAN", "PoE", "Uplink"])
            ].map(h => (
              <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ports.map((p, ri) => {
            const pp = p as PatchPort;
            const sp = p as SwitchPort;
            const isSel = selectedPort === p.port;
            const speedColor: Record<string, string> = { "10": "#52525b", "100": "#3b82f6", "1G": "#10b981", "10G": "#f59e0b" };
            return (
              <React.Fragment key={p.port}>
                <tr
                  onClick={() => onSelect(isSel ? -1 : p.port)}
                  style={{
                    cursor: "pointer",
                    background: isSel ? "rgba(59,130,246,0.1)" : ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                    borderBottom: isSel && renderExpansion ? "none" : "1px solid rgba(255,255,255,0.04)",
                    outline: isSel ? "1px solid rgba(59,130,246,0.35)" : "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"; }}
                >
                  <td style={{ padding: "5px 10px", fontFamily: "monospace", color: isSel ? "#93c5fd" : "rgba(255,255,255,0.5)", fontWeight: 700 }}>{p.port}</td>
                  <td style={{ padding: "5px 10px" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.connected ? "#22c55e" : "#333", boxShadow: p.connected ? "0 0 6px #22c55e88" : "none" }} />
                  </td>
                  <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.75)" }}>{p.label}</td>
                  {isPatch ? (
                    <>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.4)" }}>{pp.destination || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.4)" }}>{pp.connectedDevice || "—"}</td>
                      <td style={{ padding: "5px 10px" }}>
                        {pp.cableColor && <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: pp.cableColor, marginRight: 4, verticalAlign: "middle" }} />}
                        <span style={{ color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{pp.cableLength || "—"}</span>
                      </td>
                      <td style={{ padding: "5px 10px", color: pp.isPoe ? "#f59e0b" : "rgba(255,255,255,0.2)" }}>{pp.isPoe ? (pp.poeType || "✓") : "—"}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: "5px 10px" }}>
                        {sp.speed && <span style={{ background: speedColor[sp.speed] + "33", color: speedColor[sp.speed], padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10, fontFamily: "monospace" }}>{sp.speed}</span>}
                      </td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.4)" }}>{sp.connectedDevice || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{sp.vlan || "—"}</td>
                      <td style={{ padding: "5px 10px", color: sp.isPoe ? "#f59e0b" : "rgba(255,255,255,0.2)" }}>{sp.isPoe ? `${sp.poeWatts || ""}W` : "—"}</td>
                      <td style={{ padding: "5px 10px", color: sp.uplink ? "#60a5fa" : "rgba(255,255,255,0.2)" }}>{sp.uplink ? "↑" : "—"}</td>
                    </>
                  )}
                </tr>
                <AnimatePresence>
                  {isSel && renderExpansion && (
                    <tr key={`exp-${p.port}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td colSpan={colCount} style={{ padding: 0 }}>
                        {renderExpansion(p)}
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Patch Panel Editor ─────────────────────────────────────────────────────────

function PatchPanelEditor({ ports, onChange }: { ports: PatchPort[]; onChange: (p: PatchPort[]) => void }) {
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const sel = selectedPort !== null ? ports.find(p => p.port === selectedPort) ?? null : null;

  const updatePort = (portNum: number, updates: Partial<PatchPort>) => {
    onChange(ports.map(p => p.port === portNum ? { ...p, ...updates } : p));
  };

  const handleSelect = (portNum: number) => {
    setSelectedPort(portNum === -1 || portNum === selectedPort ? null : portNum);
  };

  const renderPatchExpansion = (port: AnyPort) => {
    const p = port as PatchPort;
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeInOut" }}
        style={{ overflow: "hidden" }}
      >
        <div
          className="rounded-b-xl overflow-hidden"
          style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderTop: "none", margin: "0 1px 2px 1px" }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-2"
            style={{ background: "rgba(139,92,246,0.1)", borderBottom: "1px solid rgba(139,92,246,0.15)" }}
          >
            <span className="font-mono font-bold" style={{ fontSize: 12, color: "#c4b5fd" }}>
              Puerto {p.port}
            </span>
            {p.label && p.label !== `P${p.port}` && (
              <span className="px-2 py-0.5 rounded font-mono" style={{ fontSize: 10, background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}>
                {p.label}
              </span>
            )}
            {p.cableColor && (
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.cableColor, boxShadow: `0 0 6px ${p.cableColor}88` }} />
            )}
            <div className="flex items-center gap-2 ml-auto">
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Conectado</span>
              <button onClick={e => { e.stopPropagation(); updatePort(p.port, { connected: !p.connected }); }} style={toggleTrack(p.connected, "#22c55e")}>
                <div style={toggleThumb(p.connected)} />
              </button>
              <button onClick={e => { e.stopPropagation(); setSelectedPort(null); }} className="ml-2 cursor-pointer" style={{ color: "rgba(255,255,255,0.3)" }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
          {/* Fields grid */}
          <div className="p-3 grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Etiqueta</span>
              <input type="text" value={p.label} onChange={e => updatePort(p.port, { label: e.target.value })} onClick={e => e.stopPropagation()} style={miniFieldStyle} />
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Destino / Sala</span>
              <input type="text" value={p.destination || ""} onChange={e => updatePort(p.port, { destination: e.target.value })} onClick={e => e.stopPropagation()} placeholder="Sala, piso, patch..." style={miniFieldStyle} />
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Dispositivo conectado</span>
              <input type="text" value={p.connectedDevice || ""} onChange={e => updatePort(p.port, { connectedDevice: e.target.value })} onClick={e => e.stopPropagation()} placeholder="Nombre del equipo" style={miniFieldStyle} />
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>MAC Address</span>
              <input type="text" value={p.macAddress || ""} onChange={e => updatePort(p.port, { macAddress: e.target.value })} onClick={e => e.stopPropagation()} placeholder="AA:BB:CC:DD:EE:FF" style={{ ...miniFieldStyle, fontFamily: "monospace" }} />
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Largo de cable</span>
              <select value={p.cableLength || ""} onChange={e => updatePort(p.port, { cableLength: e.target.value })} onClick={e => e.stopPropagation()} style={miniFieldStyle}>
                <option value="" style={{ background: "#1a1a1a" }}>—</option>
                {CABLE_LENGTHS.map(l => <option key={l} value={l} style={{ background: "#1a1a1a" }}>{l}</option>)}
              </select>
            </div>
            <div>
              <span className="block text-[10px] mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Color de cable</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {CABLE_PRESET_COLORS.map(c => (
                  <button key={c} onClick={e => { e.stopPropagation(); updatePort(p.port, { cableColor: c }); }}
                    className="transition-all cursor-pointer"
                    style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: p.cableColor === c ? "2px solid #fff" : "2px solid transparent", boxShadow: p.cableColor === c ? `0 0 0 1.5px ${c}` : "none" }} />
                ))}
                <input type="color" value={p.cableColor || "#3b82f6"} onChange={e => updatePort(p.port, { cableColor: e.target.value })} onClick={e => e.stopPropagation()} title="Color personalizado"
                  style={{ width: 18, height: 18, borderRadius: "50%", padding: 0, border: "none", cursor: "pointer", background: "transparent" }} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>PoE</span>
                <button onClick={e => { e.stopPropagation(); updatePort(p.port, { isPoe: !p.isPoe }); }} style={toggleTrack(!!p.isPoe, "#f59e0b")}>
                  <div style={toggleThumb(!!p.isPoe)} />
                </button>
              </div>
            </div>
            <div>
              {p.isPoe && (
                <>
                  <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Tipo PoE</span>
                  <select value={p.poeType || ""} onChange={e => updatePort(p.port, { poeType: e.target.value as PatchPort["poeType"] })} onClick={e => e.stopPropagation()} style={miniFieldStyle}>
                    <option value="" style={{ background: "#1a1a1a" }}>—</option>
                    {POE_TYPES.map(t => <option key={t} value={t} style={{ background: "#1a1a1a" }}>{t}</option>)}
                  </select>
                </>
              )}
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Notas</span>
              <textarea value={p.notes || ""} onChange={e => updatePort(p.port, { notes: e.target.value })} onClick={e => e.stopPropagation()}
                rows={2} style={{ ...miniFieldStyle, resize: "none", width: "100%" }} />
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Port table with inline accordion expansion */}
      <PortTable ports={ports} selectedPort={selectedPort} onSelect={handleSelect} type="patch" renderExpansion={renderPatchExpansion} />

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#22c55e22", border: "1px solid #22c55e66" }} />
          Conectado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#1a1a1a", border: "1px solid #333" }} />
          Libre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#f59e0b" }} />
          PoE activo
        </span>
        <span className="ml-auto" style={{ color: "rgba(255,255,255,0.2)" }}>
          Clic en puerto para editar
        </span>
      </div>
    </div>
  );
}

// ── Switch Editor ──────────────────────────────────────────────────────────────

function SwitchEditor({ ports, onChange }: { ports: SwitchPort[]; onChange: (p: SwitchPort[]) => void }) {
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const sel = selectedPort !== null ? ports.find(p => p.port === selectedPort) ?? null : null;

  const updatePort = (portNum: number, updates: Partial<SwitchPort>) => {
    onChange(ports.map(p => p.port === portNum ? { ...p, ...updates } : p));
  };

  const handleSelect = (portNum: number) => {
    setSelectedPort(portNum === -1 || portNum === selectedPort ? null : portNum);
  };

  const renderSwitchExpansion = (port: AnyPort) => {
    const p = port as SwitchPort;
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeInOut" }}
        style={{ overflow: "hidden" }}
      >
        <div
          className="rounded-b-xl overflow-hidden"
          style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderTop: "none", margin: "0 1px 2px 1px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2" style={{ background: "rgba(16,185,129,0.08)", borderBottom: "1px solid rgba(16,185,129,0.15)" }}>
            <span className="font-mono font-bold" style={{ fontSize: 12, color: "#6ee7b7" }}>Puerto {p.port}</span>
            {p.speed && (
              <span className="px-2 py-0.5 rounded font-mono font-bold" style={{ fontSize: 10, background: SPEED_COLOR[p.speed] + "33", color: SPEED_COLOR[p.speed] }}>
                {p.speed}
              </span>
            )}
            {p.uplink && (
              <span className="px-2 py-0.5 rounded font-mono" style={{ fontSize: 10, background: "#3b82f633", color: "#60a5fa" }}>UPLINK</span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Conectado</span>
              <button onClick={e => { e.stopPropagation(); updatePort(p.port, { connected: !p.connected }); }} style={toggleTrack(p.connected, "#22c55e")}>
                <div style={toggleThumb(p.connected)} />
              </button>
              <button onClick={e => { e.stopPropagation(); setSelectedPort(null); }} className="ml-2 cursor-pointer" style={{ color: "rgba(255,255,255,0.3)" }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
          {/* Fields grid */}
          <div className="p-3 grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Etiqueta</span>
              <input type="text" value={p.label} onChange={e => updatePort(p.port, { label: e.target.value })} onClick={e => e.stopPropagation()} style={miniFieldStyle} />
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Velocidad</span>
              <div className="flex gap-1">
                {SWITCH_SPEEDS.map(s => (
                  <button key={s} onClick={e => { e.stopPropagation(); updatePort(p.port, { speed: s }); }}
                    className="flex-1 rounded text-center transition-all cursor-pointer"
                    style={{ padding: "4px 2px", fontSize: 10, fontWeight: 700, background: p.speed === s ? SPEED_COLOR[s] : "rgba(255,255,255,0.05)", color: p.speed === s ? "#fff" : "#555", border: `1px solid ${p.speed === s ? SPEED_COLOR[s] : "transparent"}`, borderRadius: 6 }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Dispositivo conectado</span>
              <input type="text" value={p.connectedDevice || ""} onChange={e => updatePort(p.port, { connectedDevice: e.target.value })} onClick={e => e.stopPropagation()} placeholder="Nombre del equipo" style={miniFieldStyle} />
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>MAC Address</span>
              <input type="text" value={p.macAddress || ""} onChange={e => updatePort(p.port, { macAddress: e.target.value })} onClick={e => e.stopPropagation()} placeholder="AA:BB:CC:DD:EE:FF" style={{ ...miniFieldStyle, fontFamily: "monospace" }} />
            </div>
            <div>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>VLAN</span>
              <input type="number" min={1} max={4094} value={p.vlan || ""} onChange={e => updatePort(p.port, { vlan: parseInt(e.target.value) || undefined })} onClick={e => e.stopPropagation()} placeholder="1" style={{ ...miniFieldStyle, fontFamily: "monospace" }} />
            </div>
            <div className="flex flex-col gap-2 justify-center">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>PoE</span>
                <button onClick={e => { e.stopPropagation(); updatePort(p.port, { isPoe: !p.isPoe }); }} style={toggleTrack(!!p.isPoe, "#f59e0b")}>
                  <div style={toggleThumb(!!p.isPoe)} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Uplink</span>
                <button onClick={e => { e.stopPropagation(); updatePort(p.port, { uplink: !p.uplink }); }} style={toggleTrack(!!p.uplink, "#3b82f6")}>
                  <div style={toggleThumb(!!p.uplink)} />
                </button>
              </div>
            </div>
            <div>
              {p.isPoe && (
                <>
                  <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Potencia PoE (W)</span>
                  <input type="number" min={0} max={90} value={p.poeWatts || ""} onChange={e => updatePort(p.port, { poeWatts: parseFloat(e.target.value) || undefined })} onClick={e => e.stopPropagation()} placeholder="15.4" style={{ ...miniFieldStyle, fontFamily: "monospace" }} />
                </>
              )}
            </div>
            <div />
            <div style={{ gridColumn: "span 4" }}>
              <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Notas</span>
              <textarea value={p.notes || ""} onChange={e => updatePort(p.port, { notes: e.target.value })} onClick={e => e.stopPropagation()}
                rows={2} style={{ ...miniFieldStyle, resize: "none", width: "100%" }} />
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Port table with inline accordion expansion */}
      <PortTable ports={ports} selectedPort={selectedPort} onSelect={handleSelect} type="switch" renderExpansion={renderSwitchExpansion} />

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
        {SWITCH_SPEEDS.map(s => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: SPEED_COLOR[s] }} />{s}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#60a5fa" }} />Uplink
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#f59e0b" }} />PoE
        </span>
        <span className="ml-auto" style={{ color: "rgba(255,255,255,0.2)" }}>Clic en puerto para editar</span>
      </div>
    </div>
  );
}

// ── Router Interface Editor ────────────────────────────────────────────────────

function RouterEditor({ interfaces, onChange }: { interfaces: RouterInterface[]; onChange: (i: RouterInterface[]) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addInterface = () => {
    const nif: RouterInterface = { id: `if-${Date.now()}`, name: "ETH0", type: "LAN", connected: false };
    onChange([...interfaces, nif]);
    setExpandedId(nif.id);
  };

  const updateIf = (id: string, upd: Partial<RouterInterface>) =>
    onChange(interfaces.map(i => i.id === id ? { ...i, ...upd } : i));

  const deleteIf = (id: string) => {
    onChange(interfaces.filter(i => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {interfaces.map(iface => {
        const isExp = expandedId === iface.id;
        const typeColor = IF_TYPE_COLOR[iface.type] || IF_TYPE_COLOR.other;
        return (
          <motion.div
            key={iface.id}
            layout
            className="rounded-xl overflow-hidden"
            style={{
              border: isExp ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
              background: isExp ? "rgba(59,130,246,0.05)" : "rgba(255,255,255,0.02)",
            }}
          >
            {/* Row */}
            <div
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
              onClick={() => setExpandedId(isExp ? null : iface.id)}
            >
              {/* Ethernet port icon with interface number */}
              <div className="shrink-0 relative">
                <EthernetIcon
                  ifNum={interfaces.indexOf(iface)}
                  color={iface.connected ? typeColor : "#555"}
                  size={28}
                />
                {/* Connection status dot */}
                <span
                  className="absolute"
                  style={{
                    bottom: -2, right: -2,
                    width: 7, height: 7,
                    borderRadius: "50%",
                    background: iface.connected ? "#22c55e" : "#444",
                    border: "1.5px solid #0e0e0e",
                  }}
                />
              </div>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0"
                style={{ background: typeColor + "22", color: typeColor }}
              >
                {iface.type}
              </span>
              <span className="text-[13px] font-semibold font-mono" style={{ color: "rgba(255,255,255,0.75)" }}>
                {iface.name}
              </span>
              {iface.ipAddress && (
                <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>{iface.ipAddress}</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={e => { e.stopPropagation(); deleteIf(iface.id); }}
                  className="p-1.5 rounded-lg transition-all cursor-pointer"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.2)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <Trash2 style={{ width: 12, height: 12 }} />
                </button>
              </div>
            </div>

            {/* Expanded form */}
            <AnimatePresence>
              {isExp && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div
                    className="grid grid-cols-2 gap-2 px-3 pb-3"
                    style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div>
                      <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Nombre</span>
                      <input type="text" value={iface.name}
                        onChange={e => updateIf(iface.id, { name: e.target.value })}
                        style={{ ...miniFieldStyle, fontFamily: "monospace" }} />
                    </div>
                    <div>
                      <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Tipo</span>
                      <select value={iface.type}
                        onChange={e => updateIf(iface.id, { type: e.target.value as RouterInterface["type"] })}
                        style={miniFieldStyle}>
                        {ROUTER_IF_TYPES.map(t => <option key={t} value={t} style={{ background: "#1a1a1a" }}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Dirección IP</span>
                      <input type="text" value={iface.ipAddress || ""}
                        onChange={e => updateIf(iface.id, { ipAddress: e.target.value })}
                        placeholder="192.168.1.1/24"
                        style={{ ...miniFieldStyle, fontFamily: "monospace" }} />
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Conectado</span>
                      <button
                        onClick={() => updateIf(iface.id, { connected: !iface.connected })}
                        style={toggleTrack(iface.connected)}
                      >
                        <div style={toggleThumb(iface.connected)} />
                      </button>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Notas</span>
                      <input type="text" value={iface.notes || ""}
                        onChange={e => updateIf(iface.id, { notes: e.target.value })}
                        placeholder="Gateway, descripción..."
                        style={miniFieldStyle} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      <button
        onClick={addInterface}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl w-full transition-all cursor-pointer"
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.35)",
          border: "1px dashed rgba(255,255,255,0.1)",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
        }}
      >
        <Plus style={{ width: 13, height: 13 }} /> Agregar Interfaz
      </button>
    </div>
  );
}

// ── Port detail panel shell ────────────────────────────────────────────────────

function PortDetailPanel({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{title}</span>
        <button
          onClick={onClose}
          className="transition-colors cursor-pointer"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>
      <div className="p-3 flex flex-col gap-2.5 overflow-y-auto" style={{ maxHeight: 420 }}>
        {children}
      </div>
    </div>
  );
}

// ── Micro form helpers ─────────────────────────────────────────────────────────

function Toggle({ label, value, color = "#22c55e", onChange }: { label: string; value: boolean; color?: string; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <button onClick={() => onChange(!value)} style={toggleTrack(value, color)}>
        <div style={toggleThumb(value)} />
      </button>
    </div>
  );
}

function MiniInput({
  label, value, placeholder, mono, onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ ...miniFieldStyle, fontFamily: mono ? "monospace" : undefined }}
      />
    </div>
  );
}

function MiniSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={miniFieldStyle}>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#1a1a1a" }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function MiniTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="block text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        style={{ ...miniFieldStyle, resize: "none" }}
      />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </span>
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block mb-1.5" style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
      {children}
    </label>
  );
}

// ── Export Modal ───────────────────────────────────────────────────────────────

function ExportModal({
  rackName, totalUnits, devices, onClose, onPng
}: {
  rackName: string;
  totalUnits: number;
  devices: RackDevice[];
  onClose: () => void;
  onPng: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const safeName = rackName.replace(/\s+/g, "_");

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const download = async (type: string) => {
    setLoading(type);
    setError(null);
    try {
      if (type === "word") {
        const res = await fetch("/api/rack-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rackName, totalUnits, devices }),
        });
        if (!res.ok) throw new Error(await res.text());
        triggerDownload(await res.blob(), `rack-${safeName}-report.docx`);
      } else if (type === "excel") {
        const res = await fetch("/api/rack-report-xlsx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rackName, totalUnits, devices }),
        });
        if (!res.ok) throw new Error(await res.text());
        triggerDownload(await res.blob(), `rack-${safeName}-report.xlsx`);
      } else if (type === "pdf") {
        const res = await fetch("/api/rack-report-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rackName, totalUnits, devices }),
        });
        if (!res.ok) throw new Error(await res.text());
        const html = await res.text();
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 800);
        }
      } else if (type === "markdown") {
        const sorted = [...devices].sort((a, b) => b.unit - a.unit);
        const usedU = devices.reduce((s, d) => s + d.sizeUnits, 0);
        let md = `# ${rackName}\n\n`;
        md += `**Total:** ${totalUnits}U | **Ocupados:** ${usedU}U | **Libres:** ${totalUnits - usedU}U\n\n`;
        md += `**Exportado:** ${new Date().toLocaleDateString("es-UY")}\n\n`;
        md += `## Equipos\n\n| U | Nombre | Tipo | Modelo | IP | Puertos | Notas |\n|---|--------|------|--------|----|---------|---------|\n`;
        sorted.forEach(d => {
          const meta = TYPE_META[d.type] || TYPE_META.other;
          const connPorts = d.type === "patchpanel"
            ? `${(d.ports||[]).filter(p=>p.connected).length}/${d.portCount||24}`
            : d.type === "switch"
            ? `${(d.switchPorts||[]).filter(p=>p.connected).length}/${d.portCount||24}`
            : "—";
          md += `| U${d.unit}${d.sizeUnits>1?`-${d.unit+d.sizeUnits-1}`:""} | ${d.label} | ${meta.label} | ${d.model||""} | ${d.managementIp||""} | ${connPorts} | ${d.notes||""} |\n`;
        });
        triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), `rack-${safeName}-report.md`);
      }
      setDone(type);
      setTimeout(() => { setDone(null); onClose(); }, 900);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  type ExportCardProps = {
    type: string;
    icon: React.ElementType;
    label: string;
    ext: string;
    desc: string;
    accentColor: string;
    glowColor: string;
    bgGradient: string;
  };

  const ExportCard = ({ type, icon: Icon, label, ext, desc, accentColor, glowColor, bgGradient }: ExportCardProps) => {
    const isLoading = loading === type;
    const isDone = done === type;
    return (
      <button
        onClick={() => download(type)}
        disabled={loading !== null}
        className="relative group rounded-xl p-4 text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
        style={{
          background: bgGradient,
          border: `1px solid ${accentColor}33`,
          boxShadow: isLoading ? `0 0 20px ${glowColor}` : "none",
        }}
        onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = `0 0 16px ${glowColor}`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = isLoading ? `0 0 20px ${glowColor}` : "none"; }}
      >
        {/* background shimmer on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 60%)` }} />

        <div className="flex items-start gap-3 relative z-10">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}40` }}>
            {isLoading
              ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accentColor} transparent transparent transparent` }} />
              : isDone
              ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={accentColor} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              : <Icon className="w-4 h-4" style={{ color: accentColor }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-white/90">{label}</span>
              <span className="text-[10px] font-mono font-medium px-1 py-0.5 rounded" style={{ background: `${accentColor}20`, color: accentColor }}>{ext}</span>
            </div>
            <div className="text-xs text-white/45 mt-0.5 leading-tight">{desc}</div>
          </div>
        </div>
      </button>
    );
  };

  const usedUnits = devices.reduce((s, d) => s + d.sizeUnits, 0);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="rounded-2xl w-[500px]"
        style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #141420 50%, #0f0f1a 100%)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 0 14px rgba(99,102,241,0.4)" }}>
              <FileDown className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white/95 leading-none">Exportar Datos del Rack</h3>
              <p className="text-[11px] text-white/40 mt-0.5">{rackName} · {devices.length} equipos · {usedUnits}/{totalUnits}U</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-2.5">
          {/* Format grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <ExportCard type="word"     icon={FileText}       label="Word"     ext=".docx" desc="Documento profesional con tablas y formato"    accentColor="#3b82f6" glowColor="rgba(59,130,246,0.25)"  bgGradient="linear-gradient(135deg,#1e2a3a,#151f2d)" />
            <ExportCard type="excel"    icon={FileSpreadsheet} label="Excel"   ext=".xlsx" desc="Planilla multi-hoja con datos y estadísticas"   accentColor="#22c55e" glowColor="rgba(34,197,94,0.25)"   bgGradient="linear-gradient(135deg,#1a2e1f,#13201a)" />
            <ExportCard type="pdf"      icon={Printer}         label="PDF"     ext="print" desc="Abre el reporte listo para imprimir o guardar"  accentColor="#f97316" glowColor="rgba(249,115,22,0.25)"  bgGradient="linear-gradient(135deg,#2e1f10,#201508)" />
            <ExportCard type="markdown" icon={FileDown}        label="Markdown" ext=".md"  desc="Texto plano con tablas Markdown estándar"       accentColor="#a855f7" glowColor="rgba(168,85,247,0.25)"  bgGradient="linear-gradient(135deg,#231430,#180d25)" />
          </div>

          {/* PNG — full width */}
          <button
            onClick={onPng}
            disabled={loading !== null}
            className="relative group w-full rounded-xl p-3.5 text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
            style={{ background: "linear-gradient(135deg,#1e1e28,#18181f)", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.03) 0%, transparent 60%)" }} />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Download className="w-3.5 h-3.5 text-white/60" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-white/80">Imagen PNG</span>
                  <span className="text-[10px] font-mono font-medium px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>.png</span>
                </div>
                <div className="text-xs text-white/40">Captura visual del rack como imagen de alta resolución</div>
              </div>
            </div>
          </button>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs text-red-400" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
              <span className="leading-snug">{error}</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
