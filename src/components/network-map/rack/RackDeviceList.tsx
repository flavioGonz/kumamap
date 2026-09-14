"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Server, Trash2, Inbox, Search, X, Download } from "lucide-react";
import { TYPE_META } from "./rack-constants";
import { RackDevice, StatusInfo } from "./rack-types";

// ── Search result type ──
interface SearchResult {
  device: RackDevice;
  type: "switchPort" | "patchPort" | "pbxExtension" | "nvrChannel" | "routerInterface" | "pbxTrunk";
  label: string;
  detail: string;
  highlight: string;
}

function searchAllDevices(devices: RackDevice[], query: string): SearchResult[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const d of devices) {
    // Switch ports
    if (d.switchPorts) {
      for (const p of d.switchPorts) {
        const searchable = [
          `P${p.port}`, p.label, p.connectedDevice, p.macAddress,
          p.speed, p.vlan?.toString(), p.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (searchable.includes(q)) {
          results.push({
            device: d, type: "switchPort",
            label: `Puerto ${p.port}`,
            detail: [p.connectedDevice, p.speed, p.vlan ? `VLAN ${p.vlan}` : "", p.macAddress].filter(Boolean).join(" · "),
            highlight: p.connectedDevice || p.label || `P${p.port}`,
          });
        }
      }
    }
    // Patch panel ports
    if (d.ports) {
      for (const p of d.ports) {
        const searchable = [
          `P${p.port}`, p.label, p.destination, p.connectedDevice, p.macAddress, p.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (searchable.includes(q)) {
          results.push({
            device: d, type: "patchPort",
            label: `Puerto ${p.port}`,
            detail: [p.destination, p.connectedDevice, p.cableLength, p.cableColor].filter(Boolean).join(" · "),
            highlight: p.destination || p.connectedDevice || p.label,
          });
        }
      }
    }
    // PBX extensions
    if (d.pbxExtensions) {
      for (const ext of d.pbxExtensions) {
        const searchable = [
          ext.extension, ext.name, ext.ipPhone, ext.macAddress,
          ext.model, ext.location, ext.username, ext.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (searchable.includes(q)) {
          results.push({
            device: d, type: "pbxExtension",
            label: `Ext ${ext.extension}`,
            detail: [ext.name, ext.ipPhone, ext.model, ext.location].filter(Boolean).join(" · "),
            highlight: ext.name || ext.extension,
          });
        }
      }
    }
    // PBX trunks
    if (d.pbxTrunkLines) {
      for (const tr of d.pbxTrunkLines) {
        const searchable = [
          tr.provider, tr.number, tr.type, tr.sipServer, tr.sipUser, tr.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (searchable.includes(q)) {
          results.push({
            device: d, type: "pbxTrunk",
            label: `Troncal ${tr.provider}`,
            detail: [tr.number, tr.type, tr.sipServer].filter(Boolean).join(" · "),
            highlight: tr.provider || tr.number,
          });
        }
      }
    }
    // NVR channels
    if (d.nvrChannels) {
      for (const ch of d.nvrChannels) {
        const searchable = [
          `CH${ch.channel}`, ch.label, ch.connectedCamera, ch.cameraIp,
          ch.resolution, ch.codec, ch.protocol, ch.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (searchable.includes(q)) {
          results.push({
            device: d, type: "nvrChannel",
            label: `Canal ${ch.channel}`,
            detail: [ch.connectedCamera, ch.cameraIp, ch.resolution, ch.codec].filter(Boolean).join(" · "),
            highlight: ch.connectedCamera || ch.label,
          });
        }
      }
    }
    // Router interfaces
    if (d.routerInterfaces) {
      for (const iface of d.routerInterfaces) {
        const searchable = [
          iface.name, iface.type, iface.ipAddress, iface.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (searchable.includes(q)) {
          results.push({
            device: d, type: "routerInterface",
            label: iface.name,
            detail: [iface.type, iface.ipAddress, iface.connected ? "Conectado" : "Desconectado"].filter(Boolean).join(" · "),
            highlight: iface.name,
          });
        }
      }
    }
  }
  return results;
}

const RESULT_TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  switchPort:      { icon: "🔌", color: "#10b981", label: "Puerto Switch" },
  patchPort:       { icon: "🔗", color: "#8b5cf6", label: "Puerto Patch" },
  pbxExtension:    { icon: "📞", color: "#06b6d4", label: "Extensión PBX" },
  pbxTrunk:        { icon: "📡", color: "#f97316", label: "Troncal PBX" },
  nvrChannel:      { icon: "📹", color: "#ef4444", label: "Canal NVR" },
  routerInterface: { icon: "🌐", color: "#3b82f6", label: "Interfaz Router" },
};

export function EmptySlotPanel({
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

export default function DeviceList({
  devices, selectedDeviceId, isLocked, onSelect, onAdd, onDelete, getStatusInfo, onWizard, onExportDevice,
}: {
  devices: RackDevice[];
  selectedDeviceId: string | null;
  isLocked: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  getStatusInfo: (monitorId?: number | null) => { color: string; name: string };
  onWizard?: () => void;
  onExportDevice?: (device: RackDevice) => void;
}) {
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const searchResults = useMemo(() => searchAllDevices(devices, search), [devices, search]);
  const isSearching = showSearch && search.length >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.16 }}
      className="flex-1 overflow-y-auto rack-scroll p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white/70">Equipos en el Rack</h3>
          {!isLocked && onWizard && (
            <button
              onClick={onWizard}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110 cursor-pointer"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
              title="Asistente de configuración"
            >
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
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowSearch(s => !s); if (showSearch) setSearch(""); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer"
            style={{
              background: showSearch ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${showSearch ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: showSearch ? "#c084fc" : "rgba(255,255,255,0.4)",
            }}
            title="Buscar en puertos, canales, extensiones..."
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          {!isLocked && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all cursor-pointer"
              style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          )}
        </div>
      </div>

      {/* ── Search bar ── */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden mb-3"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "rgba(168,85,247,0.5)" }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar puerto, extensión, canal, IP, MAC..."
                autoFocus
                className="w-full py-2 pl-9 pr-8 rounded-lg text-xs text-white/90 placeholder:text-white/25 outline-none"
                style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search results ── */}
      {isSearching ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] text-white/30 mb-1">
            {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} para &quot;{search}&quot;
          </div>
          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ color: "rgba(255,255,255,0.15)" }}>
              <Search className="w-8 h-8" />
              <p className="text-xs text-center">Sin resultados para &quot;{search}&quot;</p>
            </div>
          ) : (
            searchResults.map((r, i) => {
              const meta = TYPE_META[r.device.type] || TYPE_META.other;
              const rtm = RESULT_TYPE_META[r.type];
              return (
                <div
                  key={`${r.device.id}-${r.type}-${i}`}
                  onClick={() => onSelect(r.device.id)}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-all hover:brightness-110"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${rtm.color}20` }}
                >
                  <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-sm" style={{ background: `${rtm.color}18` }}>
                    {rtm.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-white/85 truncate">{r.highlight}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${rtm.color}18`, color: rtm.color }}>{rtm.label}</span>
                    </div>
                    {r.detail && <p className="text-[10px] text-white/35 truncate mt-0.5">{r.detail}</p>}
                    <p className="text-[9px] text-white/20 mt-0.5">
                      {meta.icon} {r.device.label} · U{r.device.unit}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ── Normal device list ── */
        <>
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
                    <div className="flex items-center gap-0.5 shrink-0">
                      {onExportDevice && (
                        <button
                          onClick={e => { e.stopPropagation(); onExportDevice(d); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-white/30 hover:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                          title="Exportar equipo"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!isLocked && (
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(d.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
