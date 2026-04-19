"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Trash2, RefreshCw, ArrowDownToLine } from "lucide-react";
import { motion } from "framer-motion";
import { TYPE_META, fieldStyle, miniFieldStyle } from "./rack-constants";
import { RackDevice, PatchPort, SwitchPort, RouterInterface } from "./rack-types";
import { SectionHeader, FieldLabel } from "./RackFormComponents";
import MonitorSelect from "./MonitorSelect";
import { PatchPanelEditor, SwitchEditor, RouterEditor, PbxExtensionsEditor, PbxTrunkLinesEditor, NvrChannelsEditor, NvrDisksEditor } from "./RackPortEditors";
import SnmpStatusPanel from "./SnmpStatusPanel";
import { apiUrl } from "@/lib/api";
import type { NvrChannel, NvrDisk } from "./rack-types";

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
  const [activeTab, setActiveTab] = useState<"ports" | "trunks" | "snmp" | "general">("ports");
  const [snmpSyncing, setSnmpSyncing] = useState(false);
  const [snmpSyncMsg, setSnmpSyncMsg] = useState<string | null>(null);
  const meta = TYPE_META[device.type] || TYPE_META.other;
  const hasPorts = ["patchpanel", "switch", "router", "pbx", "nvr"].includes(device.type);

  // ── SNMP auto-sync for switch ports ──
  const canSnmpSync = device.type === "switch" && !!device.managementIp && !isLocked;

  const handleSnmpSync = useCallback(async () => {
    if (!device.managementIp) return;
    setSnmpSyncing(true);
    setSnmpSyncMsg(null);
    try {
      const res = await fetch(apiUrl("/api/snmp/poll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: device.managementIp, community: device.snmpCommunity || "public", deviceType: "switch" }),
      });
      const data = await res.json();
      if (!data.reachable || !data.interfaces?.length) {
        setSnmpSyncMsg("No se pudo obtener información de puertos vía SNMP");
        return;
      }
      // Map SNMP interfaces to switch ports
      const snmpIfaces: Array<{
        index: number; name: string; alias?: string; speed: number;
        operStatus: string; inOctets: number; outOctets: number;
      }> = data.interfaces;

      const updatedPorts = (device.switchPorts || []).map((port) => {
        // Try to match by index (SNMP index often maps to physical port)
        const match = snmpIfaces.find(iface => {
          // Match by port number to interface index, or by name containing port number
          const portStr = String(port.port);
          return iface.index === port.port
            || iface.name.endsWith(`/${portStr}`)
            || iface.name.endsWith(` ${portStr}`)
            || iface.name === `GigabitEthernet${portStr}`
            || iface.name === `FastEthernet${portStr}`
            || iface.name === `Port ${portStr}`
            || iface.name === `port${portStr}`;
        });
        if (!match) return port;

        // Determine speed label from SNMP Mbps
        let speed: SwitchPort["speed"] = port.speed;
        if (match.speed >= 10000) speed = "10G";
        else if (match.speed >= 1000) speed = "1G";
        else if (match.speed >= 100) speed = "100";
        else if (match.speed > 0) speed = "10";

        return {
          ...port,
          connected: match.operStatus === "up",
          speed,
          label: port.label || match.alias || match.name,
          connectedDevice: port.connectedDevice || match.alias || undefined,
        };
      });

      const synced = updatedPorts.filter((p, i) => p.connected !== (device.switchPorts || [])[i]?.connected).length;
      onChange({ ...device, switchPorts: updatedPorts });
      setSnmpSyncMsg(`Sincronizado: ${synced} puertos actualizados desde SNMP`);
    } catch (err: any) {
      setSnmpSyncMsg(`Error: ${err.message || "SNMP sync failed"}`);
    } finally {
      setSnmpSyncing(false);
    }
  }, [device, onChange]);

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
    if (type === "nvr" && !device.nvrChannels) {
      const chCount = device.nvrTotalChannels || 16;
      upd.nvrChannels = Array.from({ length: chCount }, (_, i) => ({
        channel: i + 1, label: `CH${i + 1}`, enabled: false,
      }));
      upd.nvrTotalChannels = chCount;
      if (!device.nvrDisks) {
        upd.nvrDisks = Array.from({ length: device.nvrDiskBays || 2 }, (_, i) => ({
          id: `disk-${Date.now()}-${i}`, slot: i + 1, status: "empty" as const,
        }));
        upd.nvrDiskBays = device.nvrDiskBays || 2;
      }
    }
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
  const showManagementIp = device.type === "switch" || device.type === "router" || device.type === "server" || device.type === "pbx" || device.type === "nvr";

  // Default tab based on device capabilities
  useEffect(() => {
    if (!hasPorts && showManagementIp && device.managementIp) setActiveTab("snmp");
    else if (!hasPorts) setActiveTab("general");
  }, [device.type, hasPorts, showManagementIp, device.managementIp]);

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
      {(hasPorts || (showManagementIp && device.managementIp)) && (
        <div className="shrink-0 flex border-b border-white/[0.06]" style={{ background: "rgba(0,0,0,0.2)" }}>
          {[
            ...(hasPorts ? [{ id: "ports", label: device.type === "router" ? "Interfaces" : device.type === "pbx" ? "Extensiones" : device.type === "nvr" ? "Canales" : `Puertos${device.type === "patchpanel" ? " del Panel" : ""}` }] : []),
            ...(device.type === "pbx" ? [{ id: "trunks", label: "Líneas" }] : []),
            ...(device.type === "nvr" ? [{ id: "trunks", label: "Discos" }] : []),
            ...(showManagementIp && device.managementIp ? [{ id: "snmp", label: "SNMP" }] : []),
            { id: "general", label: "General" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "ports" | "trunks" | "snmp" | "general")}
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
        {activeTab === "ports" && device.type === "nvr" && (
          <NvrChannelsEditor
            channels={device.nvrChannels || []}
            onChange={nvrChannels => onChange({ ...device, nvrChannels })}
          />
        )}

        {/* Trunk lines / Disks tab */}
        {activeTab === "trunks" && device.type === "nvr" && (
          <NvrDisksEditor
            disks={device.nvrDisks || []}
            onChange={nvrDisks => onChange({ ...device, nvrDisks })}
          />
        )}
        {activeTab === "trunks" && device.type === "pbx" && (
          <PbxTrunkLinesEditor
            trunkLines={device.pbxTrunkLines || []}
            onChange={pbxTrunkLines => onChange({ ...device, pbxTrunkLines })}
          />
        )}

        {/* SNMP tab */}
        {activeTab === "snmp" && showManagementIp && device.managementIp && (
          <>
            <SnmpStatusPanel
              ip={device.managementIp}
              community={device.snmpCommunity}
              deviceType={device.type}
            />
            {/* SNMP auto-sync button for switches */}
            {canSnmpSync && (
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={handleSnmpSync}
                  disabled={snmpSyncing}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.08))",
                    color: "#6ee7b7",
                    border: "1px solid rgba(16,185,129,0.25)",
                    opacity: snmpSyncing ? 0.6 : 1,
                  }}
                >
                  {snmpSyncing
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <ArrowDownToLine className="w-3 h-3" />}
                  {snmpSyncing ? "Sincronizando..." : "Sincronizar puertos desde SNMP"}
                </button>
                {snmpSyncMsg && (
                  <span style={{ fontSize: 10, color: snmpSyncMsg.startsWith("Error") ? "#ef4444" : "rgba(255,255,255,0.45)" }}>
                    {snmpSyncMsg}
                  </span>
                )}
              </div>
            )}
          </>
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
                <>
                  <div>
                    <FieldLabel>IP de Gestión</FieldLabel>
                    <input type="text" value={device.managementIp || ""} onChange={e => onChange({ ...device, managementIp: e.target.value })} placeholder="192.168.1.1" disabled={isLocked} style={{ ...fieldStyle, fontFamily: "monospace", opacity: isLocked ? 0.5 : 1 }} />
                  </div>
                  <div>
                    <FieldLabel>Comunidad SNMP</FieldLabel>
                    <input type="text" value={device.snmpCommunity || ""} onChange={e => onChange({ ...device, snmpCommunity: e.target.value })} placeholder="public" disabled={isLocked} style={{ ...fieldStyle, fontFamily: "monospace", opacity: isLocked ? 0.5 : 1 }} />
                  </div>
                </>
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

            {/* ── NVR: canales y bahías ── */}
            {device.type === "nvr" && (
              <>
                <SectionHeader title="Configuración NVR" />
                <div className="grid grid-cols-2 gap-3 -mt-2">
                  <div>
                    <FieldLabel>Total de Canales</FieldLabel>
                    <select value={device.nvrTotalChannels || 16} onChange={e => {
                      const cnt = parseInt(e.target.value);
                      const channels: NvrChannel[] = Array.from({ length: cnt }, (_, i) =>
                        device.nvrChannels?.[i] || { channel: i + 1, label: `CH${i + 1}`, enabled: false });
                      onChange({ ...device, nvrTotalChannels: cnt, nvrChannels: channels });
                    }} style={fieldStyle}>
                      {[4, 8, 16, 32, 64, 128].map(n => (<option key={n} value={n} style={{ background: "#1a1a1a" }}>{n} canales</option>))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Bahías de Disco</FieldLabel>
                    <select value={device.nvrDiskBays || 2} onChange={e => {
                      const cnt = parseInt(e.target.value);
                      const disks: NvrDisk[] = Array.from({ length: cnt }, (_, i) =>
                        device.nvrDisks?.[i] || { id: `disk-${Date.now()}-${i}`, slot: i + 1, status: "empty" as const });
                      onChange({ ...device, nvrDiskBays: cnt, nvrDisks: disks });
                    }} style={fieldStyle}>
                      {[1, 2, 4, 8, 16].map(n => (<option key={n} value={n} style={{ background: "#1a1a1a" }}>{n} bahías</option>))}
                    </select>
                  </div>
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

export default DeviceEditor;
