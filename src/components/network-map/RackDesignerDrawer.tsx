"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X, Download, Server, Network, Zap, Settings, Trash2, Plus, Phone,
  Inbox, Router, Cable, Lock, Unlock, Save, Search, FileText, ChevronLeft, ChevronRight,
  FileSpreadsheet, Printer, FileDown, Upload, ImageIcon, Camera as CameraIcon, ZoomIn, Trash,
  Eye, EyeOff, Copy, PhoneIncoming, Activity,
} from "lucide-react";
import html2canvas from "html2canvas";
import { apiUrl } from "@/lib/api";
import { safeFetch } from "@/lib/error-handler";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import {
  TYPE_META, UNIT_OPTIONS, CABLE_LENGTHS, CABLE_PRESET_COLORS,
  SWITCH_SPEEDS, POE_TYPES, ROUTER_IF_TYPES,
  SPEED_COLOR, IF_TYPE_COLOR,
  fieldStyle, miniFieldStyle, toggleTrack, toggleThumb,
} from "./rack";
import { RackExportModal } from "./rack";
import MonitorSelect from "./rack/MonitorSelect";
import {
  Toggle, MiniInput, MiniSelect, MiniTextarea,
  SectionHeader, FieldLabel, PortDetailPanel,
} from "./rack/RackFormComponents";

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

export interface PbxExtension {
  extension: string;
  name: string;
  ipPhone?: string;
  macAddress?: string;
  username?: string;
  password?: string;
  model?: string;
  location?: string;
  notes?: string;
  monitorId?: number | null;
  webUser?: string;
  webPassword?: string;
}

export interface PbxTrunkLine {
  id: string;
  provider: string;
  number: string;
  type: "SIP" | "PRI" | "BRI" | "FXO" | "FXS" | "IAX" | "other";
  channels?: number;
  sipServer?: string;
  sipUser?: string;
  sipPassword?: string;
  codec?: string;
  status?: "active" | "inactive" | "backup";
  notes?: string;
}

export interface RackDevice {
  id: string;
  unit: number;
  sizeUnits: number;
  label: string;
  type: "server" | "switch" | "patchpanel" | "ups" | "router" | "pdu" | "pbx" | "tray-fiber" | "tray-1u" | "tray-2u" | "cable-organizer" | "other";
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
  // PBX
  pbxExtensions?: PbxExtension[];
  pbxTrunkLines?: PbxTrunkLine[];
}

interface RackDesignerDrawerProps {
  open: boolean;
  onClose: () => void;
  nodeId: string | null;
  nodes: any[];
  monitors?: any[];
  readonly?: boolean;
  onSave: (nodeId: string, customData: any) => void;
}

// Constants, styles, and form components imported from ./rack/

// ── Main component ─────────────────────────────────────────────────────────────

export default function RackDesignerDrawer({ open, onClose, nodeId, nodes, monitors, readonly = false, onSave }: RackDesignerDrawerProps) {
  const [totalUnits, setTotalUnits] = useState(42);
  const [devices, setDevices] = useState<RackDevice[]>([]);
  const [rackName, setRackName] = useState("Rack");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<RackDevice | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isLockedInternal, setIsLocked] = useState(true);
  const isLocked = readonly || isLockedInternal;
  const [isRackCollapsed, setIsRackCollapsed] = useState(false);
  const [selectedEmptyUnit, setSelectedEmptyUnit] = useState<number | null>(null);
  const [dragDeviceId, setDragDeviceId] = useState<string | null>(null);
  const [dragOverUnit, setDragOverUnit] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [rackPhotos, setRackPhotos] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
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
          setRackPhotos(cd.photos || []);
          setRackName(cd.rackName || node.label || "Rack");
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
    cd.photos = rackPhotos;
    cd.rackName = rackName;
    onSave(nodeId, cd);
  };

  const handleAddPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        // Resize to max 1200px width for storage
        const img = new Image();
        img.onload = () => {
          const maxW = 1200;
          const scale = img.width > maxW ? maxW / img.width : 1;
          const canvas = document.createElement("canvas");
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL("image/jpeg", 0.82);
          setRackPhotos(prev => [...prev, compressed]);
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleDeletePhoto = (idx: number) => {
    setRackPhotos(prev => prev.filter((_, i) => i !== idx));
    setGalleryIndex(prev => Math.min(prev, rackPhotos.length - 2));
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
      const res = await fetch(apiUrl("/api/rack-report"), {
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
      const res = await fetch(apiUrl("/api/rack-template"), {
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
      const data = await safeFetch<{ devices: typeof devices }>(apiUrl("/api/rack-import"), { method: "POST", body: formData }, "RackImport");
      if (!data) throw new Error("Import failed");
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

  const handleDropDevice = (targetUnit: number) => {
    if (!dragDeviceId || isLocked) return;
    const dev = devices.find(d => d.id === dragDeviceId);
    if (!dev) return;
    const endU = targetUnit + dev.sizeUnits - 1;
    if (endU > totalUnits) return; // doesn't fit
    // Check overlap (excluding self)
    const hasOverlap = devices.some(d => {
      if (d.id === dev.id) return false;
      const dEnd = d.unit + d.sizeUnits - 1;
      return Math.max(targetUnit, d.unit) <= Math.min(endU, dEnd);
    });
    if (hasOverlap) return;
    setDevices(prev => prev.map(d => d.id === dev.id ? { ...d, unit: targetUnit } : d));
    if (editingDevice?.id === dev.id) setEditingDevice({ ...editingDevice, unit: targetUnit });
    setDragDeviceId(null);
    setDragOverUnit(null);
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
    // ── Inline SVG icons (lucide-style, html2canvas-safe) ──
    const svgI = (paths: string, color: string, size = 16) =>
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${paths}</svg>`;
    const TYPE_ICON: Record<string, (c: string, s?: number) => string> = {
      server:           (c, s) => svgI('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="'+c+'"/><circle cx="6" cy="18" r="1" fill="'+c+'"/>', c, s),
      switch:           (c, s) => svgI('<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/>', c, s),
      patchpanel:       (c, s) => svgI('<rect x="2" y="8" width="20" height="8" rx="1"/><circle cx="6" cy="12" r="1.5"/><circle cx="10" cy="12" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>', c, s),
      ups:              (c, s) => svgI('<rect x="6" y="2" width="12" height="20" rx="2"/><line x1="10" y1="9" x2="14" y2="9"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="10" y1="15" x2="14" y2="15"/>', c, s),
      router:           (c, s) => svgI('<rect x="2" y="8" width="20" height="8" rx="2"/><circle cx="7" cy="12" r="1" fill="'+c+'"/><circle cx="11" cy="12" r="1" fill="'+c+'"/><path d="M6 8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/><line x1="12" y1="16" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>', c, s),
      pdu:              (c, s) => svgI('<rect x="8" y="2" width="8" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="11" y1="7" x2="13" y2="7"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>', c, s),
      "tray-fiber":     (c, s) => svgI('<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8V5"/><path d="M10 8V4"/><path d="M14 8V4"/><path d="M18 8V5"/><line x1="6" y1="16" x2="6" y2="19"/><line x1="18" y1="16" x2="18" y2="19"/>', c, s),
      "tray-1u":        (c, s) => svgI('<rect x="2" y="8" width="20" height="8" rx="1"/><line x1="7" y1="12" x2="17" y2="12"/>', c, s),
      "tray-2u":        (c, s) => svgI('<rect x="2" y="6" width="20" height="12" rx="1"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/>', c, s),
      "cable-organizer":(c, s) => svgI('<rect x="2" y="9" width="20" height="6" rx="1"/><path d="M6 9c0-2 2-4 6-4s6 2 6 4"/><circle cx="8" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>', c, s),
      pbx:              (c, s) => svgI('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>', c, s),
      other:            (c, s) => svgI('<circle cx="12" cy="12" r="3"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>', c, s),
    };
    const TYPE_LABEL: Record<string, string> = {
      server: "Servidor", switch: "Switch", patchpanel: "Patch Panel", ups: "UPS",
      router: "Router", pdu: "PDU", pbx: "PBX", "tray-fiber": "Bandeja Fibra", "tray-1u": "Bandeja 1U",
      "tray-2u": "Bandeja 2U", "cable-organizer": "Organizador", other: "Otro",
    };
    const TYPE_COLOR: Record<string, string> = {
      server: "#3b82f6", switch: "#10b981", patchpanel: "#8b5cf6", ups: "#f59e0b",
      router: "#ef4444", pdu: "#f97316", pbx: "#06b6d4", "tray-fiber": "#d946ef", "tray-1u": "#52525b",
      "tray-2u": "#52525b", "cable-organizer": "#78716c", other: "#6b7280",
    };

    // Build occupancy lookup
    const occMap = new Map<number, RackDevice>();
    devices.forEach(d => { for (let i = 0; i < d.sizeUnits; i++) occMap.set(d.unit + i, d); });

    const unitH = 32; // px per U
    const rackW = 340;
    const rackX = 36; // left margin for U numbers
    const railW = 10;
    const now = new Date().toLocaleDateString("es-UY", { day:"2-digit", month:"2-digit", year:"numeric" });

    // Build rack units HTML — bottom to top (U1 at bottom)
    let rackUnitsHtml = "";
    const rendered = new Set<string>();
    for (let u = totalUnits; u >= 1; u--) {
      const dev = occMap.get(u);
      if (dev && !rendered.has(dev.id)) {
        rendered.add(dev.id);
        const h = dev.sizeUnits * unitH;
        const color = dev.color || TYPE_COLOR[dev.type] || "#6b7280";
        const iconFn = TYPE_ICON[dev.type] || TYPE_ICON.other;
        const icon = iconFn("rgba(255,255,255,0.7)", 14);
        const si = getDeviceStatusInfo(dev.monitorId);
        const statusDot = dev.monitorId ? `<span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:${si.color};box-shadow:0 0 6px ${si.color}"></span>` : "";
        rackUnitsHtml += `
          <div style="position:relative;height:${h}px;background:${color};display:flex;align-items:center;overflow:hidden">
            <div style="position:absolute;left:0;top:0;bottom:0;width:${railW}px;background:#1a1a1a;border-right:1px solid #0a0a0a"></div>
            <div style="position:absolute;right:0;top:0;bottom:0;width:${railW}px;background:#1a1a1a;border-left:1px solid #0a0a0a"></div>
            <div style="position:absolute;left:${railW}px;right:${railW}px;top:0;bottom:0;display:flex;align-items:center;justify-content:center">
              <span style="display:inline-block;margin-right:6px;vertical-align:middle;line-height:0">${icon}</span>
              <div style="text-align:center;display:inline-block;vertical-align:middle">
                <div style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;line-height:1.2">${dev.label}</div>
                ${dev.model ? `<div style="font-size:9px;color:rgba(255,255,255,0.5);white-space:nowrap;line-height:1.2">${dev.model}</div>` : ""}
              </div>
            </div>
            ${statusDot}
            <span style="position:absolute;right:${railW + 2}px;bottom:1px;font-size:8px;color:rgba(255,255,255,0.4);font-family:monospace">U${dev.unit}${dev.sizeUnits > 1 ? `-${dev.unit + dev.sizeUnits - 1}` : ""}</span>
          </div>`;
        // Skip the remaining units of this device
        for (let skip = 1; skip < dev.sizeUnits; skip++) u--;
      } else if (!dev) {
        rackUnitsHtml += `
          <div style="height:${unitH}px;background:#1c1c1c;border-bottom:1px solid #252525;display:flex;align-items:center">
            <div style="position:absolute;left:0;width:${railW}px;height:${unitH}px;background:#1a1a1a;border-right:1px solid #0a0a0a"></div>
            <div style="position:absolute;right:0;width:${railW}px;height:${unitH}px;background:#1a1a1a;border-left:1px solid #0a0a0a"></div>
          </div>`;
      }
    }

    // Build U number labels (right side of rack, bottom-to-top)
    let uLabelsHtml = "";
    for (let u = totalUnits; u >= 1; u--) {
      uLabelsHtml += `<div style="height:${unitH}px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:9px;font-family:monospace;color:rgba(255,255,255,0.3)">${u}</div>`;
    }

    // Build device table
    const sorted = [...devices].sort((a, b) => b.unit - a.unit);
    const tableRows = sorted.map((d, i) => {
      const typeColor = TYPE_COLOR[d.type] || "#6b7280";
      const iconFn = TYPE_ICON[d.type] || TYPE_ICON.other;
      const icon = iconFn(typeColor, 14);
      const label = TYPE_LABEL[d.type] || "Otro";
      const color = d.color || typeColor;
      const connPorts = d.type === "patchpanel"
        ? `${(d.ports||[]).filter((p: any)=>p.connected).length}/${d.portCount||24}`
        : d.type === "switch"
        ? `${(d.switchPorts||[]).filter((p: any)=>p.connected).length}/${d.portCount||24}`
        : "—";
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);background:${i%2===0?"transparent":"rgba(255,255,255,0.02)"}">
        <td style="padding:7px 8px;font-family:monospace;color:rgba(255,255,255,0.5);font-size:11px;vertical-align:middle;line-height:20px">U${d.unit}${d.sizeUnits>1?`-${d.unit+d.sizeUnits-1}`:""}</td>
        <td style="padding:7px 4px;vertical-align:middle;text-align:center;line-height:20px;width:28px">${icon}</td>
        <td style="padding:7px 8px;font-weight:600;color:#fff;font-size:11px;vertical-align:middle;line-height:20px">${d.label}</td>
        <td style="padding:7px 8px;color:${color};font-size:10px;font-weight:600;vertical-align:middle;line-height:20px">${label}</td>
        <td style="padding:7px 8px;color:rgba(255,255,255,0.4);font-size:10px;vertical-align:middle;line-height:20px">${d.model||"—"}</td>
        <td style="padding:7px 8px;font-family:monospace;color:rgba(255,255,255,0.4);font-size:10px;vertical-align:middle;line-height:20px">${d.managementIp||"—"}</td>
        <td style="padding:7px 8px;font-family:monospace;color:rgba(255,255,255,0.4);font-size:10px;vertical-align:middle;line-height:20px">${connPorts}</td>
        <td style="padding:7px 8px;color:${d.isPoeCapable?"#f59e0b":"rgba(255,255,255,0.3)"};font-size:10px;vertical-align:middle;line-height:20px">${d.isPoeCapable?"⚡ Sí":"—"}</td>
        <td style="padding:7px 8px;color:rgba(255,255,255,0.35);font-size:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle">${d.notes||""}</td>
      </tr>`;
    }).join("");

    // Build full container
    const container = document.createElement("div");
    container.style.cssText = `
      position:fixed; left:-9999px; top:0;
      width:1200px; background:#0f0f0f; padding:36px;
      font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;
      color:#fff;
    `;
    container.innerHTML = `
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div>
          <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.02em">${rackName}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:4px">${totalUnits}U · ${devices.length} equipos</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:rgba(255,255,255,0.3)">Exportado ${now}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.15);margin-top:2px">KumaMap Rack Designer</div>
        </div>
      </div>

      <!-- Body: rack + table -->
      <div style="display:flex;gap:28px;align-items:flex-start">
        <!-- Rack visual -->
        <div style="flex-shrink:0;width:${rackX + rackW + 10}px">
          <div style="font-size:9px;color:rgba(255,255,255,0.2);text-align:center;margin-bottom:6px;font-family:monospace">▲ U${totalUnits} (arriba)</div>
          <div style="display:flex;position:relative">
            <div style="width:${rackX}px;display:flex;flex-direction:column">${uLabelsHtml}</div>
            <div style="width:${rackW}px;border:3px solid #2a2a2a;border-radius:6px;overflow:hidden;background:#1c1c1c;box-shadow:inset 0 2px 8px rgba(0,0,0,0.6),0 4px 20px rgba(0,0,0,0.5);display:flex;flex-direction:column;position:relative">${rackUnitsHtml}</div>
          </div>
          <div style="text-align:center;margin-top:6px;font-size:10px;color:rgba(255,255,255,0.25)">${usedUnits}U usadas · ${freeUnits}U libres</div>
        </div>

        <!-- Device table -->
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:rgba(255,255,255,0.3);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">${devices.length} Equipos instalados</div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
                ${["U","","Nombre","Tipo","Modelo","IP Gestión","Puertos","PoE","Notas"].map(h =>
                  `<th style="text-align:left;padding:7px 8px;color:rgba(255,255,255,0.35);font-weight:600;text-transform:uppercase;font-size:8px;letter-spacing:0.06em;vertical-align:middle">${h}</th>`
                ).join("")}
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>

      <!-- PBX Extensions -->
      ${(() => {
        const pbxDevs = sorted.filter((d: any) => d.type === "pbx" && (d.pbxExtensions || []).length > 0);
        if (pbxDevs.length === 0) return "";
        return pbxDevs.map((d: any) => {
          const exts = d.pbxExtensions || [];
          const extRows = exts.map((ext: any, ei: number) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);background:${ei%2===0?'transparent':'rgba(255,255,255,0.02)'}">
              <td style="padding:6px 8px;font-family:monospace;color:#06b6d4;font-weight:700;font-size:11px">${ext.extension}</td>
              <td style="padding:6px 8px;color:#fff;font-size:11px">${ext.name||"—"}</td>
              <td style="padding:6px 8px;font-family:monospace;color:rgba(255,255,255,0.4);font-size:10px">${ext.ipPhone||"—"}</td>
              <td style="padding:6px 8px;font-family:monospace;color:rgba(255,255,255,0.4);font-size:10px">${ext.macAddress||"—"}</td>
              <td style="padding:6px 8px;color:rgba(255,255,255,0.4);font-size:10px">${ext.model||"—"}</td>
              <td style="padding:6px 8px;color:rgba(255,255,255,0.4);font-size:10px">${ext.location||"—"}</td>
            </tr>
          `).join("");
          return `
          <div style="margin-top:20px">
            <div style="font-size:11px;color:#06b6d4;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">${d.label} · ${exts.length} extensiones</div>
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
                ${["Ext.","Nombre","IP Teléfono","MAC","Modelo","Ubicación"].map((h: string) =>
                  `<th style="text-align:left;padding:6px 8px;color:rgba(255,255,255,0.35);font-weight:600;text-transform:uppercase;font-size:8px;letter-spacing:0.06em">${h}</th>`
                ).join("")}
              </tr></thead>
              <tbody>${extRows}</tbody>
            </table>
          </div>`;
        }).join("");
      })()}

      <!-- Footer -->
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:10px;color:rgba(255,255,255,0.15)">KumaMap Network Monitoring · Rack Designer</div>
        <div style="display:flex;gap:12px">
          ${Object.entries(TYPE_COLOR).filter(([k]) => devices.some(d => d.type === k)).map(([k, c]) => {
            const fn = TYPE_ICON[k] || TYPE_ICON.other;
            return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;color:rgba(255,255,255,0.35);line-height:1">${fn(c, 12)} ${TYPE_LABEL[k]||k}</span>`;
          }).join("")}
        </div>
      </div>
    `;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: "#0f0f0f",
        scale: 2,
        useCORS: true,
        logging: false,
        removeContainer: false,
      } as any);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `rack-${rackName.replace(/\s+/g, "_")}-${totalUnits}U.png`;
      a.click();
    } catch (err) {
      console.error("Rack PNG export error:", err);
      alert("Error al exportar: " + (err instanceof Error ? err.message : String(err)));
    }
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
              <div className="flex items-center gap-1.5 group/name">
                <input
                  type="text"
                  value={rackName}
                  onChange={e => setRackName(e.target.value)}
                  onBlur={() => { if (!rackName.trim()) setRackName("Rack"); }}
                  className="text-[15px] font-semibold text-white/90 leading-none bg-transparent border-none outline-none p-0 m-0 w-auto min-w-[60px]"
                  style={{ maxWidth: 200, borderBottom: "1px dashed rgba(255,255,255,0.1)" }}
                  spellCheck={false}
                />
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20 group-hover/name:text-white/50 transition-colors shrink-0">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
                </svg>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[11px] text-white/40">
                  {totalUnits}U ·{" "}
                  <span style={{ color: "#fbbf24aa" }}>{usedUnits}U ocupadas</span> ·{" "}
                  <span style={{ color: "#34d399aa" }}>{freeUnits}U libres</span>
                </p>
                <button
                  data-tooltip-id="rack-tip"
                  data-tooltip-content={showGallery ? "Volver al rack" : `Fotos del rack${rackPhotos.length ? ` (${rackPhotos.length})` : ""}`}
                  onClick={() => setShowGallery(g => !g)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-all cursor-pointer"
                  style={{
                    background: showGallery ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${showGallery ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.08)"}`,
                    color: showGallery ? "#c084fc" : "rgba(255,255,255,0.4)",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  <ImageIcon style={{ width: 11, height: 11 }} />
                  {rackPhotos.length > 0 && <span>{rackPhotos.length}</span>}
                </button>
              </div>
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
            {/* Lock / Unlock — icon only (hidden in readonly mode) */}
            {!readonly && (
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
            )}

            {!readonly && (
            <button
              data-tooltip-id="rack-tip"
              data-tooltip-content="Guardar Rack"
              onClick={handleSaveRack}
              className="w-8 h-8 flex items-center justify-center rounded-lg font-semibold transition-all cursor-pointer"
              style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
            >
              <Save className="w-4 h-4" />
            </button>
            )}
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
                        draggable={!isLocked}
                        onDragStart={e => {
                          if (isLocked) { e.preventDefault(); return; }
                          setDragDeviceId(occ.device.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", occ.device.id);
                        }}
                        onDragEnd={() => { setDragDeviceId(null); setDragOverUnit(null); }}
                        className="relative w-full flex-shrink-0 cursor-pointer transition-all duration-100"
                        style={{
                          height: `${h}px`,
                          backgroundColor: occ.device.color || meta.color,
                          boxShadow: isSelected
                            ? `inset 0 0 0 2px #fff, 0 0 12px ${occ.device.color || meta.color}88`
                            : "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.5)",
                          filter: isSelected ? "brightness(1.15)" : "brightness(1)",
                          opacity: dragDeviceId === occ.device.id ? 0.4 : 1,
                          cursor: !isLocked ? "grab" : "pointer",
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

                const isDragOver = dragOverUnit === u;
                return (
                  <div
                    key={u}
                    onClick={() => handleClickUnit(u)}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverUnit(u); }}
                    onDragLeave={() => { if (dragOverUnit === u) setDragOverUnit(null); }}
                    onDrop={e => { e.preventDefault(); handleDropDevice(u); }}
                    className="w-full flex-shrink-0 flex items-center cursor-pointer group transition-colors"
                    style={{ height: "26px", borderBottom: "1px solid #232323", background: isDragOver ? "rgba(59,130,246,0.15)" : "transparent" }}
                    onMouseEnter={e => { if (!isDragOver) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { if (!isDragOver) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div className="w-[8px] h-full shrink-0" style={{ background: "#1a1a1a", borderRight: "1px solid #0a0a0a" }} />
                    <span className="text-[9px] font-mono flex-1 text-center group-hover:text-white/35 transition-colors select-none" style={{ color: isDragOver ? "#60a5fa" : "rgba(255,255,255,0.15)" }}>{u}</span>
                    <div className="w-[8px] h-full shrink-0" style={{ background: "#1a1a1a", borderLeft: "1px solid #0a0a0a" }} />
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/20 text-center">Slot vacío → agregar · Equipo → editar</p>
            </div>
            </div>
          </motion.div>

          {/* Hidden photo input */}
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhoto} />

          {/* ── Right panel ── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <AnimatePresence mode="wait">
              {showGallery ? (
                <motion.div
                  key="gallery"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex-1 flex flex-col min-h-0"
                >
                  {/* Gallery header */}
                  <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]" style={{ background: "rgba(168,85,247,0.04)" }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#a855f7,#6366f1)" }}>
                        <CameraIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-white/80">Fotos del Rack</span>
                      <span className="text-[11px] text-white/30">{rackPhotos.length} foto{rackPhotos.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isLocked && (
                        <button
                          onClick={() => photoInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all cursor-pointer"
                          style={{ background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar
                        </button>
                      )}
                      <button onClick={() => setShowGallery(false)} className="text-xs text-white/35 hover:text-white/65 transition-colors cursor-pointer">← Volver</button>
                    </div>
                  </div>

                  {/* Gallery content */}
                  <div className="flex-1 overflow-y-auto rack-scroll p-4">
                    {rackPhotos.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex flex-col items-center justify-center h-52 gap-3"
                        style={{ color: "rgba(255,255,255,0.2)" }}
                      >
                        <ImageIcon className="w-16 h-16" />
                        <p className="text-sm text-center">No hay fotos del rack</p>
                        {!isLocked && (
                          <button
                            onClick={() => photoInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl font-medium transition-all cursor-pointer mt-2"
                            style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)" }}
                          >
                            <CameraIcon className="w-4 h-4" /> Subir fotos
                          </button>
                        )}
                      </motion.div>
                    ) : (
                      <>
                        {/* Main photo viewer */}
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={galleryIndex}
                            initial={{ opacity: 0, scale: 0.92, rotateY: -8 }}
                            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                            exit={{ opacity: 0, scale: 0.92, rotateY: 8 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            className="relative rounded-xl overflow-hidden mb-3"
                            style={{
                              background: "#000",
                              boxShadow: "0 16px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
                              aspectRatio: "16/10",
                            }}
                          >
                            <img
                              src={rackPhotos[galleryIndex]}
                              alt={`Rack foto ${galleryIndex + 1}`}
                              style={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                            {/* Photo overlay controls */}
                            <div className="absolute top-2 right-2 flex gap-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: "rgba(0,0,0,0.7)", color: "#fff", backdropFilter: "blur(8px)" }}>
                                {galleryIndex + 1} / {rackPhotos.length}
                              </span>
                            </div>
                            {/* Prev/Next overlay arrows */}
                            {rackPhotos.length > 1 && (
                              <>
                                <button
                                  onClick={() => setGalleryIndex(i => (i - 1 + rackPhotos.length) % rackPhotos.length)}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                                  style={{ background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.1)" }}
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setGalleryIndex(i => (i + 1) % rackPhotos.length)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                                  style={{ background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.1)" }}
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </motion.div>
                        </AnimatePresence>

                        {/* Thumbnail strip */}
                        <div className="flex gap-2 overflow-x-auto pb-2 rack-scroll">
                          {rackPhotos.map((photo, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.05, duration: 0.2 }}
                              className="relative shrink-0 rounded-lg overflow-hidden cursor-pointer group"
                              style={{
                                width: 72,
                                height: 54,
                                border: galleryIndex === idx ? "2px solid #a855f7" : "2px solid rgba(255,255,255,0.06)",
                                boxShadow: galleryIndex === idx ? "0 0 12px rgba(168,85,247,0.3)" : "none",
                              }}
                              onClick={() => setGalleryIndex(idx)}
                            >
                              <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              {/* Delete overlay on hover */}
                              {!isLocked && (
                                <div
                                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: "rgba(0,0,0,0.65)" }}
                                >
                                  <button
                                    onClick={e => { e.stopPropagation(); handleDeletePhoto(idx); }}
                                    className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                                    style={{ background: "rgba(239,68,68,0.8)", color: "#fff" }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </motion.div>
                          ))}
                          {/* Add photo thumbnail */}
                          {!isLocked && (
                            <motion.button
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: rackPhotos.length * 0.05 }}
                              onClick={() => photoInputRef.current?.click()}
                              className="shrink-0 rounded-lg flex items-center justify-center cursor-pointer transition-all"
                              style={{
                                width: 72,
                                height: 54,
                                border: "2px dashed rgba(168,85,247,0.3)",
                                background: "rgba(168,85,247,0.05)",
                                color: "#a855f7",
                              }}
                            >
                              <Plus className="w-5 h-5" />
                            </motion.button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : editingDevice ? (
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
                  onWizard={() => setShowWizard(true)}
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
          <RackExportModal
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
        {showWizard && (
          <RackWizard
            totalUnits={totalUnits}
            existingDevices={devices}
            onComplete={(newDevices) => {
              setDevices(prev => [...prev, ...newDevices]);
              setShowWizard(false);
            }}
            onClose={() => setShowWizard(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// MonitorSelect imported from ./rack/MonitorSelect

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

// ── Rack Wizard ──────────────────────────────────────────────────────────────

type WizardStep = "type" | "structure" | "network" | "power" | "extras" | "review";

interface WizardConfig {
  rackType: "network" | "server" | "mixed" | "telecom";
  hasPatchPanels: boolean;
  patchPanelCount: number;
  patchPanelPorts: number;
  hasSwitches: boolean;
  switchCount: number;
  switchPorts: number;
  switchModel: string;
  hasRouters: boolean;
  routerCount: number;
  routerModel: string;
  hasServers: boolean;
  serverCount: number;
  serverSize: number;
  serverModel: string;
  hasUPS: boolean;
  upsSize: number;
  upsModel: string;
  hasPDU: boolean;
  pduCount: number;
  hasFiberTray: boolean;
  fiberTrayCount: number;
  hasCableOrganizer: boolean;
  cableOrganizerCount: number;
  hasTray: boolean;
  trayCount: number;
}

const defaultWizardConfig: WizardConfig = {
  rackType: "network",
  hasPatchPanels: true, patchPanelCount: 2, patchPanelPorts: 24,
  hasSwitches: true, switchCount: 1, switchPorts: 24, switchModel: "",
  hasRouters: false, routerCount: 1, routerModel: "",
  hasServers: false, serverCount: 1, serverSize: 2, serverModel: "",
  hasUPS: false, upsSize: 2, upsModel: "",
  hasPDU: false, pduCount: 1,
  hasFiberTray: false, fiberTrayCount: 1,
  hasCableOrganizer: true, cableOrganizerCount: 2,
  hasTray: false, trayCount: 1,
};

function RackWizard({ totalUnits, existingDevices, onComplete, onClose }: {
  totalUnits: number;
  existingDevices: RackDevice[];
  onComplete: (devices: RackDevice[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizardStep>("type");
  const [config, setConfig] = useState<WizardConfig>(defaultWizardConfig);

  const steps: { id: WizardStep; label: string }[] = [
    { id: "type", label: "Tipo" },
    { id: "structure", label: "Estructura" },
    { id: "network", label: "Red" },
    { id: "power", label: "Energía" },
    { id: "extras", label: "Extras" },
    { id: "review", label: "Resumen" },
  ];

  const stepIdx = steps.findIndex(s => s.id === step);
  const canNext = stepIdx < steps.length - 1;
  const canPrev = stepIdx > 0;

  const upd = (partial: Partial<WizardConfig>) => setConfig(c => ({ ...c, ...partial }));

  // Auto-configure based on rack type
  const handleTypeSelect = (type: WizardConfig["rackType"]) => {
    const base = { ...defaultWizardConfig, rackType: type };
    if (type === "network") {
      Object.assign(base, { hasPatchPanels: true, hasSwitches: true, hasCableOrganizer: true, hasRouters: true });
    } else if (type === "server") {
      Object.assign(base, { hasServers: true, serverCount: 4, hasPDU: true, hasUPS: true, hasPatchPanels: false, hasSwitches: true, switchCount: 1 });
    } else if (type === "mixed") {
      Object.assign(base, { hasPatchPanels: true, hasSwitches: true, hasServers: true, serverCount: 2, hasUPS: true });
    } else if (type === "telecom") {
      Object.assign(base, { hasPatchPanels: true, patchPanelCount: 4, hasFiberTray: true, fiberTrayCount: 2, hasSwitches: true });
    }
    setConfig(base);
  };

  // Generate devices from wizard config
  const generateDevices = (): RackDevice[] => {
    const result: RackDevice[] = [];
    const occupiedUnits = new Set<number>();
    existingDevices.forEach(d => {
      for (let u = d.unit; u < d.unit + d.sizeUnits; u++) occupiedUnits.add(u);
    });

    let nextUnit = 1; // start from bottom
    const findSlot = (size: number): number => {
      for (let u = nextUnit; u <= totalUnits - size + 1; u++) {
        let free = true;
        for (let i = 0; i < size; i++) { if (occupiedUnits.has(u + i)) { free = false; break; } }
        if (free) {
          for (let i = 0; i < size; i++) occupiedUnits.add(u + i);
          if (u + size > nextUnit) nextUnit = u + size;
          return u;
        }
      }
      return nextUnit; // fallback
    };

    // PDU at bottom
    if (config.hasPDU) {
      for (let i = 0; i < config.pduCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-pdu-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `PDU ${i + 1}`, type: "pdu", color: TYPE_META.pdu.color, pduHasBreaker: true });
      }
    }

    // UPS
    if (config.hasUPS) {
      const u = findSlot(config.upsSize);
      result.push({ id: `wiz-ups-${Date.now()}`, unit: u, sizeUnits: config.upsSize, label: config.upsModel || "UPS", type: "ups", color: TYPE_META.ups.color, model: config.upsModel || undefined });
    }

    // Cable organizers between sections
    const addOrganizer = () => {
      if (config.hasCableOrganizer && config.cableOrganizerCount > 0) {
        const u = findSlot(1);
        result.push({ id: `wiz-org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, unit: u, sizeUnits: 1, label: "Organizador de Cable", type: "cable-organizer", color: TYPE_META["cable-organizer"].color });
      }
    };

    // Patch panels
    if (config.hasPatchPanels) {
      for (let i = 0; i < config.patchPanelCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-pp-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `Patch Panel ${i + 1}`, type: "patchpanel", color: TYPE_META.patchpanel.color, portCount: config.patchPanelPorts });
      }
      addOrganizer();
    }

    // Fiber trays
    if (config.hasFiberTray) {
      for (let i = 0; i < config.fiberTrayCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-fiber-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `Bandeja Fibra ${i + 1}`, type: "tray-fiber", color: TYPE_META["tray-fiber"].color });
      }
    }

    // Switches
    if (config.hasSwitches) {
      for (let i = 0; i < config.switchCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-sw-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: config.switchModel || `Switch ${i + 1}`, type: "switch", color: TYPE_META.switch.color, portCount: config.switchPorts, model: config.switchModel || undefined });
      }
      addOrganizer();
    }

    // Routers
    if (config.hasRouters) {
      for (let i = 0; i < config.routerCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-rt-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: config.routerModel || `Router ${i + 1}`, type: "router", color: TYPE_META.router.color, model: config.routerModel || undefined });
      }
    }

    // Servers
    if (config.hasServers) {
      for (let i = 0; i < config.serverCount; i++) {
        const u = findSlot(config.serverSize);
        result.push({ id: `wiz-srv-${Date.now()}-${i}`, unit: u, sizeUnits: config.serverSize, label: config.serverModel || `Servidor ${i + 1}`, type: "server", color: TYPE_META.server.color, model: config.serverModel || undefined });
      }
    }

    // Shelves
    if (config.hasTray) {
      for (let i = 0; i < config.trayCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-tray-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `Bandeja ${i + 1}`, type: "tray-1u", color: TYPE_META["tray-1u"].color });
      }
    }

    return result;
  };

  const previewDevices = useMemo(() => step === "review" ? generateDevices() : [], [step, config]);
  const totalUs = previewDevices.reduce((s, d) => s + d.sizeUnits, 0);
  const freeUs = totalUnits - existingDevices.reduce((s, d) => s + d.sizeUnits, 0) - totalUs;

  // Shared styles
  const toggleBtn = (active: boolean, color: string) => ({
    background: active ? `${color}15` : "rgba(255,255,255,0.03)",
    border: `1px solid ${active ? `${color}40` : "rgba(255,255,255,0.06)"}`,
    color: active ? color : "#555",
  });

  const numInput = (val: number, set: (n: number) => void, min = 1, max = 20) => (
    <div className="flex items-center gap-1">
      <button onClick={() => set(Math.max(min, val - 1))} className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white/80 transition-colors" style={{ background: "rgba(255,255,255,0.05)" }}>-</button>
      <span className="text-[12px] font-bold text-white/80 w-6 text-center">{val}</span>
      <button onClick={() => set(Math.min(max, val + 1))} className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white/80 transition-colors" style={{ background: "rgba(255,255,255,0.05)" }}>+</button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[30000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          width: 520, maxHeight: "85vh",
          background: "rgba(12,12,16,0.98)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 32px 100px rgba(0,0,0,0.8)",
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L9 10H3L12 22L21 10H15L12 2Z" fill="rgba(99,102,241,0.3)" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="5" r="1" fill="#c4b5fd" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-white/90">Asistente de Rack</div>
                <div className="text-[10px] text-white/35">Configuración paso a paso</div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Step indicator */}
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full h-1 rounded-full transition-all" style={{ background: i <= stepIdx ? "#818cf8" : "rgba(255,255,255,0.06)" }} />
                <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: i <= stepIdx ? "#818cf8" : "#333" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
          {step === "type" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué tipo de rack vas a configurar?</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "network" as const, label: "Rack de Red", desc: "Switches, patch panels, routers", color: "#10b981", icon: <Network className="w-5 h-5" /> },
                  { id: "server" as const, label: "Rack de Servidores", desc: "Servidores, UPS, PDU", color: "#3b82f6", icon: <Server className="w-5 h-5" /> },
                  { id: "mixed" as const, label: "Rack Mixto", desc: "Red + servidores + energía", color: "#f59e0b", icon: <Zap className="w-5 h-5" /> },
                  { id: "telecom" as const, label: "Rack Telecom", desc: "Fibra, patch panels, switches", color: "#d946ef", icon: <Cable className="w-5 h-5" /> },
                ]).map(t => (
                  <button key={t.id} onClick={() => handleTypeSelect(t.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all cursor-pointer"
                    style={toggleBtn(config.rackType === t.id, t.color)}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${t.color}18`, color: t.color }}>{t.icon}</div>
                    <div className="text-[11px] font-bold" style={{ color: config.rackType === t.id ? t.color : "#aaa" }}>{t.label}</div>
                    <div className="text-[9px] text-white/30">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "structure" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué estructura de cableado tendrá?</div>
              {/* Patch Panels */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)" }}>
                    <Cable className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Patch Panels</div>
                    <div className="text-[9px] text-white/30">Paneles de parcheo para cableado estructurado</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasPatchPanels && numInput(config.patchPanelCount, n => upd({ patchPanelCount: n }))}
                  <button onClick={() => upd({ hasPatchPanels: !config.hasPatchPanels })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasPatchPanels ? "#8b5cf6" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasPatchPanels ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasPatchPanels && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Puertos:</span>
                  {[24, 48].map(p => (
                    <button key={p} onClick={() => upd({ patchPanelPorts: p })} className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.patchPanelPorts === p, "#8b5cf6")}>{p} puertos</button>
                  ))}
                </div>
              )}

              {/* Fiber Trays */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(217,70,239,0.15)" }}>
                    <Inbox className="w-4 h-4" style={{ color: "#d946ef" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Bandejas de Fibra</div>
                    <div className="text-[9px] text-white/30">Bandejas para empalme y distribución de fibra óptica</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasFiberTray && numInput(config.fiberTrayCount, n => upd({ fiberTrayCount: n }))}
                  <button onClick={() => upd({ hasFiberTray: !config.hasFiberTray })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasFiberTray ? "#d946ef" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasFiberTray ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>

              {/* Cable Organizers */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(120,113,108,0.15)" }}>
                    <Cable className="w-4 h-4" style={{ color: "#78716c" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Organizadores de Cable</div>
                    <div className="text-[9px] text-white/30">Guías horizontales para orden del cableado</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasCableOrganizer && numInput(config.cableOrganizerCount, n => upd({ cableOrganizerCount: n }), 1, 10)}
                  <button onClick={() => upd({ hasCableOrganizer: !config.hasCableOrganizer })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasCableOrganizer ? "#78716c" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasCableOrganizer ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "network" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué equipos de red tendrá el rack?</div>
              {/* Switches */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                    <Network className="w-4 h-4" style={{ color: "#10b981" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Switches</div>
                    <div className="text-[9px] text-white/30">Switches de red gestionables o no gestionables</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasSwitches && numInput(config.switchCount, n => upd({ switchCount: n }))}
                  <button onClick={() => upd({ hasSwitches: !config.hasSwitches })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasSwitches ? "#10b981" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasSwitches ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasSwitches && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Puertos:</span>
                  {[8, 16, 24, 48].map(p => (
                    <button key={p} onClick={() => upd({ switchPorts: p })} className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.switchPorts === p, "#10b981")}>{p}</button>
                  ))}
                  <input placeholder="Modelo" value={config.switchModel} onChange={e => upd({ switchModel: e.target.value })}
                    className="ml-2 flex-1 h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}

              {/* Routers */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)" }}>
                    <Router className="w-4 h-4" style={{ color: "#ef4444" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Routers</div>
                    <div className="text-[9px] text-white/30">Routers, firewalls, gateways</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasRouters && numInput(config.routerCount, n => upd({ routerCount: n }))}
                  <button onClick={() => upd({ hasRouters: !config.hasRouters })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasRouters ? "#ef4444" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasRouters ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasRouters && (
                <div className="ml-11">
                  <input placeholder="Modelo (ej: MikroTik CCR1036)" value={config.routerModel} onChange={e => upd({ routerModel: e.target.value })}
                    className="w-full h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}

              {/* Servers */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)" }}>
                    <Server className="w-4 h-4" style={{ color: "#3b82f6" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Servidores</div>
                    <div className="text-[9px] text-white/30">Servidores rack-mount</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasServers && numInput(config.serverCount, n => upd({ serverCount: n }), 1, 10)}
                  <button onClick={() => upd({ hasServers: !config.hasServers })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasServers ? "#3b82f6" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasServers ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasServers && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Tamaño:</span>
                  {[1, 2, 4].map(u => (
                    <button key={u} onClick={() => upd({ serverSize: u })} className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.serverSize === u, "#3b82f6")}>{u}U</button>
                  ))}
                  <input placeholder="Modelo" value={config.serverModel} onChange={e => upd({ serverModel: e.target.value })}
                    className="ml-2 flex-1 h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}
            </div>
          )}

          {step === "power" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué equipos de energía tendrá?</div>
              {/* UPS */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
                    <Zap className="w-4 h-4" style={{ color: "#f59e0b" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">UPS</div>
                    <div className="text-[9px] text-white/30">Respaldo de energía ininterrumpida</div>
                  </div>
                </div>
                <button onClick={() => upd({ hasUPS: !config.hasUPS })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasUPS ? "#f59e0b" : "rgba(255,255,255,0.1)" }}>
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasUPS ? "translateX(14px)" : "translateX(2px)" }} />
                </button>
              </div>
              {config.hasUPS && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Tamaño:</span>
                  {[2, 3, 4, 6].map(u => (
                    <button key={u} onClick={() => upd({ upsSize: u })} className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.upsSize === u, "#f59e0b")}>{u}U</button>
                  ))}
                  <input placeholder="Modelo" value={config.upsModel} onChange={e => upd({ upsModel: e.target.value })}
                    className="ml-2 flex-1 h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}

              {/* PDU */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.15)" }}>
                    <Zap className="w-4 h-4" style={{ color: "#f97316" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">PDU</div>
                    <div className="text-[9px] text-white/30">Unidad de distribución de energía</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasPDU && numInput(config.pduCount, n => upd({ pduCount: n }), 1, 4)}
                  <button onClick={() => upd({ hasPDU: !config.hasPDU })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasPDU ? "#f97316" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasPDU ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "extras" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Algo más que agregar?</div>
              {/* Bandeja */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(82,82,91,0.15)" }}>
                    <Inbox className="w-4 h-4" style={{ color: "#52525b" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Bandejas</div>
                    <div className="text-[9px] text-white/30">Bandejas fijas 1U para equipos pequeños</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasTray && numInput(config.trayCount, n => upd({ trayCount: n }), 1, 6)}
                  <button onClick={() => upd({ hasTray: !config.hasTray })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasTray ? "#52525b" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasTray ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">Se agregarán los siguientes equipos al rack:</div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold text-white/40">{previewDevices.length} equipos</span>
                <span className="text-[10px] text-white/25">·</span>
                <span className="text-[10px] font-bold text-white/40">{totalUs}U ocupadas</span>
                <span className="text-[10px] text-white/25">·</span>
                <span className="text-[10px] font-bold" style={{ color: freeUs >= 0 ? "#22c55e" : "#ef4444" }}>{freeUs}U libres</span>
              </div>
              {freeUs < 0 && (
                <div className="rounded-lg p-3 text-[10px] text-red-400 font-semibold" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  ⚠ No hay suficiente espacio en el rack. Reduce equipos o ajusta el tamaño.
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {previewDevices.map((d, i) => {
                  const meta = TYPE_META[d.type] || TYPE_META.other;
                  return (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: d.color || meta.color }}>
                        <span className="text-white/90 scale-75">{meta.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold text-white/80 truncate block">{d.label}</span>
                        <span className="text-[9px] text-white/30">{meta.label} · U{d.unit}{d.sizeUnits > 1 ? `–U${d.unit + d.sizeUnits - 1}` : ""} · {d.sizeUnits}U</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[9px] text-white/25 mt-2">
                Luego de finalizar, podrás editar cada equipo individualmente: cambiar posición, agregar IP de gestión, modelo, serial, y asociar monitores de Uptime Kuma.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <button onClick={canPrev ? () => setStep(steps[stepIdx - 1].id) : onClose}
            className="px-4 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.06)" }}>
            {canPrev ? "Anterior" : "Cancelar"}
          </button>
          {step === "review" ? (
            <button onClick={() => onComplete(previewDevices)} disabled={freeUs < 0}
              className="px-5 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:opacity-30"
              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
              Crear {previewDevices.length} equipos
            </button>
          ) : (
            <button onClick={() => setStep(steps[stepIdx + 1].id)}
              className="px-5 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
              Siguiente
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Device List ────────────────────────────────────────────────────────────────

function DeviceList({
  devices, selectedDeviceId, isLocked, onSelect, onAdd, onDelete, getStatusInfo, onWizard,
}: {
  devices: RackDevice[];
  selectedDeviceId: string | null;
  isLocked: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  getStatusInfo: (monitorId?: number | null) => { color: string; name: string };
  onWizard?: () => void;
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
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white/70">Equipos en el Rack</h3>
          {!isLocked && onWizard && (
            <button
              onClick={onWizard}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110 cursor-pointer"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
              title="Asistente de configuración"
            >
              {/* Wizard hat icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L9 10H3L12 22L21 10H15L12 2Z" fill="rgba(99,102,241,0.3)" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 2L10 7L12 6L14 7L12 2Z" fill="#818cf8" />
                <path d="M6 18H18" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="5" r="1" fill="#c4b5fd" />
                <circle cx="10" cy="12" r="0.7" fill="#c4b5fd" opacity="0.6" />
                <circle cx="14" cy="14" r="0.7" fill="#c4b5fd" opacity="0.6" />
              </svg>
            </button>
          )}
        </div>
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
  const [activeTab, setActiveTab] = useState<"ports" | "trunks" | "general">("ports");
  const meta = TYPE_META[device.type] || TYPE_META.other;
  const hasPorts = ["patchpanel", "switch", "router", "pbx"].includes(device.type);

  const getStatusInfo = useCallback((monitorId?: number | null) => {
    if (!monitorId || !monitors) return { color: "#6b7280", name: "" };
    const m = monitors.find((x: any) => x.id === monitorId);
    if (!m) return { color: "#6b7280", name: "" };
    const up = m.status === 1;
    return { color: up ? "#22c55e" : "#ef4444", name: m.name || "" };
  }, [monitors]);

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
    if (type === "pbx" && !device.pbxExtensions)
      upd.pbxExtensions = [
        { extension: "100", name: "Recepción" },
        { extension: "101", name: "Oficina 1" },
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
  const showManagementIp = device.type === "switch" || device.type === "router" || device.type === "server" || device.type === "pbx";

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

      {/* Lock banner */}
      {isLocked && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5" style={{ background: "rgba(251,191,36,0.06)", borderBottom: "1px solid rgba(251,191,36,0.15)" }}>
          <Lock className="w-3 h-3" style={{ color: "#fbbf24" }} />
          <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600, letterSpacing: "0.04em" }}>Modo lectura — desbloquea el candado para editar</span>
        </div>
      )}

      {/* Tab bar */}
      {hasPorts && (
        <div className="shrink-0 flex border-b border-white/[0.06]" style={{ background: "rgba(0,0,0,0.2)" }}>
          {[
            { id: "ports", label: device.type === "router" ? "Interfaces" : device.type === "pbx" ? "Extensiones" : `Puertos${device.type === "patchpanel" ? " del Panel" : ""}` },
            ...(device.type === "pbx" ? [{ id: "trunks", label: "Líneas" }] : []),
            { id: "general", label: "General" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "ports" | "trunks" | "general")}
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
      <div className="flex-1 overflow-y-auto rack-scroll p-5 flex flex-col gap-5" style={isLocked ? { pointerEvents: "none", opacity: 0.6, filter: "saturate(0.6)" } : undefined}>
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
        {activeTab === "ports" && device.type === "pbx" && (
          <PbxExtensionsEditor
            extensions={device.pbxExtensions || []}
            onChange={pbxExtensions => onChange({ ...device, pbxExtensions })}
            monitors={monitors}
            getStatusInfo={getStatusInfo}
          />
        )}

        {/* Trunk lines tab */}
        {activeTab === "trunks" && device.type === "pbx" && (
          <PbxTrunkLinesEditor
            trunkLines={device.pbxTrunkLines || []}
            onChange={pbxTrunkLines => onChange({ ...device, pbxTrunkLines })}
          />
        )}

        {/* General tab */}
        {activeTab === "general" && (
          <>
            <SectionHeader title="Información General" />
            <div className="grid grid-cols-2 gap-3 -mt-2">
              <div style={{ gridColumn: "span 2" }}>
                <FieldLabel>Nombre</FieldLabel>
                <input type="text" value={device.label} onChange={e => onChange({ ...device, label: e.target.value })} disabled={isLocked} style={{ ...fieldStyle, opacity: isLocked ? 0.5 : 1 }} />
              </div>
              <div>
                <FieldLabel>Tipo</FieldLabel>
                <select value={device.type} onChange={e => handleTypeChange(e.target.value as RackDevice["type"])} disabled={isLocked} style={{ ...fieldStyle, opacity: isLocked ? 0.5 : 1 }}>
                  {Object.entries(TYPE_META).map(([k, v]) => (<option key={k} value={k} style={{ background: "#1a1a1a" }}>{v.label}</option>))}
                </select>
              </div>
              <div>
                <FieldLabel>Color</FieldLabel>
                <div className="flex items-center gap-2">
                  <input type="color" value={device.color || meta.color} onChange={e => onChange({ ...device, color: e.target.value })} disabled={isLocked} className="w-10 h-9 rounded-lg border border-white/10 cursor-pointer p-0.5 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "rgba(255,255,255,0.05)" }} />
                  <span className="text-[11px] text-white/35 font-mono">{device.color || meta.color}</span>
                </div>
              </div>
              <div>
                <FieldLabel>Modelo</FieldLabel>
                <input type="text" value={device.model || ""} onChange={e => onChange({ ...device, model: e.target.value })} placeholder="ej. Cisco SG350-28P" disabled={isLocked} style={{ ...fieldStyle, opacity: isLocked ? 0.5 : 1 }} />
              </div>
              <div>
                <FieldLabel>Número de Serie</FieldLabel>
                <input type="text" value={device.serial || ""} onChange={e => onChange({ ...device, serial: e.target.value })} placeholder="S/N..." disabled={isLocked} style={{ ...fieldStyle, opacity: isLocked ? 0.5 : 1 }} />
              </div>
              {showManagementIp && (
                <div style={{ gridColumn: "span 2" }}>
                  <FieldLabel>IP de Gestión</FieldLabel>
                  <input type="text" value={device.managementIp || ""} onChange={e => onChange({ ...device, managementIp: e.target.value })} placeholder="192.168.1.1" disabled={isLocked} style={{ ...fieldStyle, fontFamily: "monospace", opacity: isLocked ? 0.5 : 1 }} />
                </div>
              )}
            </div>

            <SectionHeader title="Posición en el Rack" />
            <div className="grid gap-3 -mt-2" style={{ gridTemplateColumns: showPortCount ? "1fr 1fr 1fr" : "1fr 1fr" }}>
              <div>
                <FieldLabel>Posición (U base)</FieldLabel>
                <input type="number" min={1} max={totalUnits} value={device.unit} onChange={e => onChange({ ...device, unit: parseInt(e.target.value) || 1 })} disabled={isLocked} style={{ ...fieldStyle, fontFamily: "monospace", opacity: isLocked ? 0.5 : 1 }} />
              </div>
              <div>
                <FieldLabel>Alto (U)</FieldLabel>
                <input type="number" min={1} max={totalUnits - device.unit + 1} value={device.sizeUnits} onChange={e => onChange({ ...device, sizeUnits: parseInt(e.target.value) || 1 })} disabled={isLocked} style={{ ...fieldStyle, fontFamily: "monospace", opacity: isLocked ? 0.5 : 1 }} />
              </div>
              {showPortCount && (
                <div>
                  <FieldLabel>Cant. Puertos</FieldLabel>
                  <select value={device.portCount || 24} onChange={e => handlePortCountChange(parseInt(e.target.value))} disabled={isLocked} style={{ ...fieldStyle, opacity: isLocked ? 0.5 : 1 }}>
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
              <textarea value={device.notes || ""} onChange={e => onChange({ ...device, notes: e.target.value })} rows={2} placeholder="IP, observaciones, configuración, modelo..." disabled={isLocked} style={{ ...fieldStyle, resize: "none", opacity: isLocked ? 0.5 : 1 }} />
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
  const colCount = isPatch ? 8 : 8;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 480 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            {["#", "Estado", "Etiqueta",
              ...(isPatch ? ["Destino", "Dispositivo", "Metraje", "Cable", "PoE"] : ["Velocidad", "Dispositivo", "VLAN", "PoE", "Uplink"])
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
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace", fontSize: 10 }}>{pp.cableLength || "—"}</td>
                      <td style={{ padding: "5px 10px" }}>
                        {pp.cableColor ? <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: pp.cableColor, verticalAlign: "middle", boxShadow: `0 0 4px ${pp.cableColor}66` }} /> : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
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

// ── PBX Extensions Editor ─────────────────────────────────────────────────────

function SecureField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const fStyle: React.CSSProperties = { width: "100%", padding: "6px 10px", paddingRight: 56, borderRadius: 8, fontSize: 11, color: "#ddd", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", outline: "none", fontFamily: "monospace" };

  const handleCopy = () => {
    navigator.clipboard.writeText(value || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">{label}</label>
      <div className="relative">
        <input type={visible ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={fStyle} />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button type="button" onClick={() => setVisible(v => !v)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-all cursor-pointer" title={visible ? "Ocultar" : "Mostrar"}>
            {visible ? <EyeOff className="w-3 h-3 text-white/40" /> : <Eye className="w-3 h-3 text-white/40" />}
          </button>
          <button type="button" onClick={handleCopy} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-all cursor-pointer" title="Copiar">
            <Copy className="w-3 h-3" style={{ color: copied ? "#22d3ee" : "rgba(255,255,255,0.4)" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PbxExtensionsEditor({ extensions, onChange, monitors, getStatusInfo }: {
  extensions: PbxExtension[];
  onChange: (e: PbxExtension[]) => void;
  monitors?: any[];
  getStatusInfo: (monitorId?: number | null) => { color: string; name: string };
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const addExtension = () => {
    const maxExt = extensions.reduce((m, e) => Math.max(m, parseInt(e.extension) || 0), 99);
    onChange([...extensions, { extension: String(maxExt + 1), name: "" }]);
    setExpandedIdx(extensions.length);
  };

  const removeExtension = (idx: number) => {
    onChange(extensions.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  const updateExtension = (idx: number, upd: Partial<PbxExtension>) => {
    onChange(extensions.map((e, i) => i === idx ? { ...e, ...upd } : e));
  };

  const filtered = search
    ? extensions.map((e, i) => ({ ...e, _idx: i })).filter(e =>
        e.extension.includes(search) || e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.ipPhone || "").includes(search) || (e.macAddress || "").toLowerCase().includes(search.toLowerCase()))
    : extensions.map((e, i) => ({ ...e, _idx: i }));

  const fStyle: React.CSSProperties = { width: "100%", padding: "6px 10px", borderRadius: 8, fontSize: 11, color: "#ddd", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", outline: "none" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4" style={{ color: "#06b6d4" }} />
          <span className="text-xs font-bold text-white/60">{extensions.length} extensiones</span>
        </div>
        <button onClick={addExtension} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{ background: "rgba(6,182,212,0.1)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.2)" }}>
          <Plus className="w-3 h-3" />Agregar
        </button>
      </div>

      {extensions.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25" />
          <input type="text" placeholder="Buscar extensión, nombre, IP, MAC..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-7 pl-8 pr-3 rounded-lg text-[11px] text-white/70 placeholder-white/25 outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
        </div>
      )}

      {/* Table header */}
      <div className="grid gap-1 px-2 py-1" style={{ gridTemplateColumns: "60px 1fr 110px 18px 40px", fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <span>Ext.</span><span>Nombre / Usuario</span><span>IP Teléfono</span><span></span><span></span>
      </div>

      <div className="flex flex-col gap-1">
        {filtered.map((ext) => {
          const idx = ext._idx;
          const isExpanded = expandedIdx === idx;
          const si = getStatusInfo(ext.monitorId);
          return (
            <div key={idx} className="rounded-xl overflow-hidden transition-all" style={{ background: isExpanded ? "rgba(6,182,212,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${isExpanded ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.04)"}` }}>
              {/* Row summary */}
              <div onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="grid gap-1 px-2.5 py-2 cursor-pointer hover:bg-white/[0.03] transition-all items-center"
                style={{ gridTemplateColumns: "60px 1fr 110px 18px 40px" }}>
                <span className="text-xs font-mono font-bold" style={{ color: "#22d3ee" }}>{ext.extension || "—"}</span>
                <div className="min-w-0">
                  <span className="text-[11px] text-white/70 truncate block">{ext.name || "Sin nombre"}</span>
                  {ext.username && <span className="text-[9px] text-white/25 font-mono">{ext.username}</span>}
                </div>
                <span className="text-[10px] font-mono text-white/35 truncate">{ext.ipPhone || "—"}</span>
                {ext.monitorId ? (
                  <span className="w-2 h-2 rounded-full" style={{ background: si.color, boxShadow: `0 0 6px ${si.color}` }} title={si.name} />
                ) : <span />}
                <button onClick={(e) => { e.stopPropagation(); removeExtension(idx); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-white/[0.04]">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Extensión</label>
                      <input type="text" value={ext.extension} onChange={e => updateExtension(idx, { extension: e.target.value })} placeholder="100" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Nombre</label>
                      <input type="text" value={ext.name} onChange={e => updateExtension(idx, { name: e.target.value })} placeholder="Recepción" style={fStyle} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">IP Teléfono</label>
                      <input type="text" value={ext.ipPhone || ""} onChange={e => updateExtension(idx, { ipPhone: e.target.value })} placeholder="192.168.1.50" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">MAC Address</label>
                      <input type="text" value={ext.macAddress || ""} onChange={e => updateExtension(idx, { macAddress: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Modelo</label>
                      <input type="text" value={ext.model || ""} onChange={e => updateExtension(idx, { model: e.target.value })} placeholder="Yealink T46U" style={fStyle} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Ubicación</label>
                      <input type="text" value={ext.location || ""} onChange={e => updateExtension(idx, { location: e.target.value })} placeholder="Oficina 2" style={fStyle} />
                    </div>

                    {/* Sensor association */}
                    <div style={{ gridColumn: "span 2" }}>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider flex items-center gap-1 mb-0.5">
                        <Activity className="w-3 h-3" style={{ color: "#06b6d4" }} />Sensor Uptime Kuma
                      </label>
                      <select value={ext.monitorId ?? ""} onChange={e => updateExtension(idx, { monitorId: e.target.value ? Number(e.target.value) : null })}
                        style={{ ...fStyle, cursor: "pointer" }}>
                        <option value="" style={{ background: "#1a1a1a" }}>— Sin sensor —</option>
                        {(monitors || []).map((m: any) => (
                          <option key={m.id} value={m.id} style={{ background: "#1a1a1a" }}>{m.name} ({m.type})</option>
                        ))}
                      </select>
                    </div>

                    {/* SIP credentials */}
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Usuario SIP</label>
                      <input type="text" value={ext.username || ""} onChange={e => updateExtension(idx, { username: e.target.value })} placeholder="ext100" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <SecureField label="Contraseña SIP" value={ext.password || ""} onChange={v => updateExtension(idx, { password: v })} placeholder="••••••" />

                    {/* Web credentials */}
                    <SecureField label="Usuario Web Teléfono" value={ext.webUser || ""} onChange={v => updateExtension(idx, { webUser: v })} placeholder="admin" />
                    <SecureField label="Contraseña Web Teléfono" value={ext.webPassword || ""} onChange={v => updateExtension(idx, { webPassword: v })} placeholder="••••••" />

                    <div style={{ gridColumn: "span 2" }}>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Notas</label>
                      <input type="text" value={ext.notes || ""} onChange={e => updateExtension(idx, { notes: e.target.value })} placeholder="Notas adicionales..." style={fStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && search && (
        <div className="text-center py-4 text-[11px] text-white/20">Sin resultados para &quot;{search}&quot;</div>
      )}
      {extensions.length === 0 && !search && (
        <div className="text-center py-6 text-[11px] text-white/20">Sin extensiones — agregá una para comenzar</div>
      )}
    </div>
  );
}

// ── PBX Trunk Lines Editor ───────────────────────────────────────────────────

function PbxTrunkLinesEditor({ trunkLines, onChange }: { trunkLines: PbxTrunkLine[]; onChange: (t: PbxTrunkLine[]) => void }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const addTrunk = () => {
    const id = `trunk-${Date.now()}`;
    onChange([...trunkLines, { id, provider: "", number: "", type: "SIP", status: "active" }]);
    setExpandedIdx(trunkLines.length);
  };

  const removeTrunk = (idx: number) => {
    onChange(trunkLines.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  const updateTrunk = (idx: number, upd: Partial<PbxTrunkLine>) => {
    onChange(trunkLines.map((t, i) => i === idx ? { ...t, ...upd } : t));
  };

  const fStyle: React.CSSProperties = { width: "100%", padding: "6px 10px", borderRadius: 8, fontSize: 11, color: "#ddd", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", outline: "none" };
  const statusColors: Record<string, string> = { active: "#22c55e", inactive: "#ef4444", backup: "#f59e0b" };
  const statusLabels: Record<string, string> = { active: "Activa", inactive: "Inactiva", backup: "Backup" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhoneIncoming className="w-4 h-4" style={{ color: "#06b6d4" }} />
          <span className="text-xs font-bold text-white/60">{trunkLines.length} líneas</span>
        </div>
        <button onClick={addTrunk} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{ background: "rgba(6,182,212,0.1)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.2)" }}>
          <Plus className="w-3 h-3" />Agregar Línea
        </button>
      </div>

      {/* Table header */}
      <div className="grid gap-1 px-2 py-1" style={{ gridTemplateColumns: "1fr 100px 60px 50px 40px", fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <span>Proveedor / Número</span><span>Tipo</span><span>Canales</span><span>Estado</span><span></span>
      </div>

      <div className="flex flex-col gap-1">
        {trunkLines.map((trunk, idx) => {
          const isExpanded = expandedIdx === idx;
          const sColor = statusColors[trunk.status || "active"] || "#6b7280";
          return (
            <div key={trunk.id} className="rounded-xl overflow-hidden transition-all" style={{ background: isExpanded ? "rgba(6,182,212,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${isExpanded ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.04)"}` }}>
              {/* Row summary */}
              <div onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="grid gap-1 px-2.5 py-2 cursor-pointer hover:bg-white/[0.03] transition-all items-center"
                style={{ gridTemplateColumns: "1fr 100px 60px 50px 40px" }}>
                <div className="min-w-0">
                  <span className="text-[11px] text-white/70 truncate block">{trunk.provider || "Sin proveedor"}</span>
                  <span className="text-[10px] font-mono text-white/30">{trunk.number || "—"}</span>
                </div>
                <span className="text-[10px] font-mono text-cyan-300/60">{trunk.type}</span>
                <span className="text-[10px] font-mono text-white/35">{trunk.channels || "—"}</span>
                <span className="w-2 h-2 rounded-full" style={{ background: sColor, boxShadow: `0 0 4px ${sColor}` }} title={statusLabels[trunk.status || "active"]} />
                <button onClick={(e) => { e.stopPropagation(); removeTrunk(idx); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-white/[0.04]">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Proveedor</label>
                      <input type="text" value={trunk.provider} onChange={e => updateTrunk(idx, { provider: e.target.value })} placeholder="Antel / Claro / VoIP..." style={fStyle} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Número / DID</label>
                      <input type="text" value={trunk.number} onChange={e => updateTrunk(idx, { number: e.target.value })} placeholder="+598 2XXX XXXX" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Tipo de Línea</label>
                      <select value={trunk.type} onChange={e => updateTrunk(idx, { type: e.target.value as PbxTrunkLine["type"] })} style={{ ...fStyle, cursor: "pointer" }}>
                        {["SIP", "PRI", "BRI", "FXO", "FXS", "IAX", "other"].map(t => (
                          <option key={t} value={t} style={{ background: "#1a1a1a" }}>{t === "other" ? "Otro" : t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Canales</label>
                      <input type="number" value={trunk.channels || ""} onChange={e => updateTrunk(idx, { channels: e.target.value ? Number(e.target.value) : undefined })} placeholder="2" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Servidor SIP</label>
                      <input type="text" value={trunk.sipServer || ""} onChange={e => updateTrunk(idx, { sipServer: e.target.value })} placeholder="sip.proveedor.com" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Códec</label>
                      <input type="text" value={trunk.codec || ""} onChange={e => updateTrunk(idx, { codec: e.target.value })} placeholder="G.711 / G.729 / Opus" style={fStyle} />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Usuario SIP Trunk</label>
                      <input type="text" value={trunk.sipUser || ""} onChange={e => updateTrunk(idx, { sipUser: e.target.value })} placeholder="trunk_user" style={{ ...fStyle, fontFamily: "monospace" }} />
                    </div>
                    <SecureField label="Contraseña SIP Trunk" value={trunk.sipPassword || ""} onChange={v => updateTrunk(idx, { sipPassword: v })} placeholder="••••••" />
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Estado</label>
                      <select value={trunk.status || "active"} onChange={e => updateTrunk(idx, { status: e.target.value as PbxTrunkLine["status"] })} style={{ ...fStyle, cursor: "pointer" }}>
                        <option value="active" style={{ background: "#1a1a1a" }}>Activa</option>
                        <option value="inactive" style={{ background: "#1a1a1a" }}>Inactiva</option>
                        <option value="backup" style={{ background: "#1a1a1a" }}>Backup</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Notas</label>
                      <input type="text" value={trunk.notes || ""} onChange={e => updateTrunk(idx, { notes: e.target.value })} placeholder="Notas..." style={fStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {trunkLines.length === 0 && (
        <div className="text-center py-6 text-[11px] text-white/20">Sin líneas — agregá una para comenzar</div>
      )}
    </div>
  );
}

// ── Port detail panel shell ────────────────────────────────────────────────────

// PortDetailPanel, Toggle, MiniInput, MiniSelect, MiniTextarea, SectionHeader, FieldLabel
// imported from ./rack/RackFormComponents

// ExportModal imported from ./rack/RackExportModal
