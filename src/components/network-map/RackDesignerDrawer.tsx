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
import type { PatchPort, SwitchPort, RouterInterface, PbxExtension, PbxTrunkLine, RackDevice } from "./rack/rack-types";
import {
  TYPE_META, UNIT_OPTIONS, CABLE_LENGTHS, CABLE_PRESET_COLORS,
  SWITCH_SPEEDS, POE_TYPES, ROUTER_IF_TYPES,
  SPEED_COLOR, IF_TYPE_COLOR,
  fieldStyle, miniFieldStyle, toggleTrack, toggleThumb,
} from "./rack";
import { RackExportModal } from "./rack";
import MonitorSelect from "./rack/MonitorSelect";
import RackWizard from "./rack/RackWizard";
import DeviceEditor from "./rack/RackDeviceEditor";
import DeviceList, { EmptySlotPanel } from "./rack/RackDeviceList";
import {
  Toggle, MiniInput, MiniSelect, MiniTextarea,
  SectionHeader, FieldLabel, PortDetailPanel,
} from "./rack/RackFormComponents";

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface RackDesignerDrawerProps {
  open: boolean;
  onClose: () => void;
  nodeId: string | null;
  nodes: any[];
  monitors?: any[];
  readonly?: boolean;
  onSave: (nodeId: string, customData: any) => void;
}

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
