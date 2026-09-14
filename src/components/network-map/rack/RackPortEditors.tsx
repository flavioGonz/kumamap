"use client";

import React, { useState, useCallback } from "react";
import {
  X, Plus, Trash2, Phone, Search, Eye, EyeOff, Copy, PhoneIncoming, Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CABLE_LENGTHS, CABLE_PRESET_COLORS,
  SWITCH_SPEEDS, POE_TYPES, ROUTER_IF_TYPES,
  SPEED_COLOR, IF_TYPE_COLOR,
  NVR_CODECS, NVR_PROTOCOLS, NVR_RECORDINGS, NVR_RESOLUTIONS, NVR_DISK_STATUSES,
  DISK_STATUS_COLOR, RECORDING_COLOR,
  miniFieldStyle, toggleTrack, toggleThumb,
} from "./rack-constants";
import type { PatchPort, SwitchPort, RouterInterface, PbxExtension, PbxTrunkLine, NvrChannel, NvrDisk } from "./rack-types";
import MonitorSelect from "./MonitorSelect";

// ── Port button (used by PatchPanel + Switch) ──────────────────────────────────

export type AnyPort = PatchPort | SwitchPort;

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

export function PatchPanelEditor({ ports, onChange }: { ports: PatchPort[]; onChange: (p: PatchPort[]) => void }) {
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

export function SwitchEditor({ ports, onChange }: { ports: SwitchPort[]; onChange: (p: SwitchPort[]) => void }) {
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

export function RouterEditor({ interfaces, onChange }: { interfaces: RouterInterface[]; onChange: (i: RouterInterface[]) => void }) {
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

export function SecureField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
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

export function PbxExtensionsEditor({ extensions, onChange, monitors, getStatusInfo }: {
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

export function PbxTrunkLinesEditor({ trunkLines, onChange }: { trunkLines: PbxTrunkLine[]; onChange: (t: PbxTrunkLine[]) => void }) {
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

// ── NVR Channels Editor ─────────────────────────────────────────────────────

const RECORDING_LABELS: Record<string, string> = {
  continuous: "Continuo", motion: "Movimiento", schedule: "Horario", alarm: "Alarma", off: "Apagado",
};

export function NvrChannelsEditor({
  channels, onChange,
}: {
  channels: NvrChannel[];
  onChange: (channels: NvrChannel[]) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const updateChannel = (idx: number, partial: Partial<NvrChannel>) => {
    const upd = channels.map((c, i) => i === idx ? { ...c, ...partial } : c);
    onChange(upd);
  };

  const fStyle = { ...miniFieldStyle };
  const enabled = channels.filter(c => c.enabled);

  const handleSelect = (chNum: number) => {
    const idx = channels.findIndex(c => c.channel === chNum);
    setSelected(idx === selected ? null : idx);
  };

  const renderChannelExpansion = (ch: NvrChannel, idx: number) => (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeInOut" }}
      style={{ overflow: "hidden" }}
    >
      <div
        className="rounded-b-xl overflow-hidden"
        style={{ background: "rgba(225,29,72,0.06)", border: "1px solid rgba(225,29,72,0.2)", borderTop: "none", margin: "0 1px 2px 1px" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-2"
          style={{ background: "rgba(225,29,72,0.1)", borderBottom: "1px solid rgba(225,29,72,0.15)" }}
        >
          <span className="font-mono font-bold" style={{ fontSize: 12, color: "#fda4af" }}>
            Canal {ch.channel}
          </span>
          {ch.connectedCamera && (
            <span className="px-2 py-0.5 rounded font-mono" style={{ fontSize: 10, background: "rgba(225,29,72,0.2)", color: "#fb7185" }}>
              {ch.connectedCamera}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Activo</span>
            <button onClick={e => { e.stopPropagation(); updateChannel(idx, { enabled: !ch.enabled }); }} style={toggleTrack(ch.enabled, "#e11d48")}>
              <div style={toggleThumb(ch.enabled)} />
            </button>
            <button onClick={e => { e.stopPropagation(); setSelected(null); }} className="ml-2 cursor-pointer" style={{ color: "rgba(255,255,255,0.3)" }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
        {/* Fields grid — 2 columns to fit within table cell */}
        <div className="p-3 grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Etiqueta</span>
            <input type="text" value={ch.label || ""} onChange={e => updateChannel(idx, { label: e.target.value })} onClick={e => e.stopPropagation()} placeholder={`Canal ${ch.channel}`} style={fStyle} />
          </div>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Cámara conectada</span>
            <input type="text" value={ch.connectedCamera || ""} onChange={e => updateChannel(idx, { connectedCamera: e.target.value })} onClick={e => e.stopPropagation()} placeholder="Nombre cámara..." style={fStyle} />
          </div>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>IP Cámara</span>
            <input type="text" value={ch.cameraIp || ""} onChange={e => updateChannel(idx, { cameraIp: e.target.value })} onClick={e => e.stopPropagation()} placeholder="10.1.10.x" style={{ ...fStyle, fontFamily: "monospace" }} />
          </div>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Protocolo</span>
            <select value={ch.protocol || ""} onChange={e => updateChannel(idx, { protocol: e.target.value as NvrChannel["protocol"] })} onClick={e => e.stopPropagation()} style={fStyle}>
              <option value="" style={{ background: "#1a1a1a" }}>—</option>
              {NVR_PROTOCOLS.map(p => <option key={p} value={p} style={{ background: "#1a1a1a" }}>{p}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Resolución</span>
            <select value={ch.resolution || ""} onChange={e => updateChannel(idx, { resolution: e.target.value })} onClick={e => e.stopPropagation()} style={fStyle}>
              <option value="" style={{ background: "#1a1a1a" }}>—</option>
              {NVR_RESOLUTIONS.map(r => <option key={r} value={r} style={{ background: "#1a1a1a" }}>{r}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Codec</span>
            <select value={ch.codec || ""} onChange={e => updateChannel(idx, { codec: e.target.value as NvrChannel["codec"] })} onClick={e => e.stopPropagation()} style={fStyle}>
              <option value="" style={{ background: "#1a1a1a" }}>—</option>
              {NVR_CODECS.map(c => <option key={c} value={c} style={{ background: "#1a1a1a" }}>{c}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>FPS</span>
            <input type="number" min={1} max={60} value={ch.fps || ""} onChange={e => updateChannel(idx, { fps: parseInt(e.target.value) || undefined })} onClick={e => e.stopPropagation()} placeholder="25" style={{ ...fStyle, fontFamily: "monospace" }} />
          </div>
          <div>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Grabación</span>
            <select value={ch.recording || ""} onChange={e => updateChannel(idx, { recording: e.target.value as NvrChannel["recording"] })} onClick={e => e.stopPropagation()} style={fStyle}>
              <option value="" style={{ background: "#1a1a1a" }}>—</option>
              {NVR_RECORDINGS.map(r => (
                <option key={r} value={r} style={{ background: "#1a1a1a" }}>{RECORDING_LABELS[r] || r}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <span className="block text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Notas</span>
            <textarea value={ch.notes || ""} onChange={e => updateChannel(idx, { notes: e.target.value })} onClick={e => e.stopPropagation()}
              rows={2} style={{ ...fStyle, resize: "none", width: "100%" }} />
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50 font-bold uppercase tracking-wider">
          Canales ({enabled.length}/{channels.length} activos)
        </span>
      </div>

      {/* Channel table */}
      {channels.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                {["#", "Estado", "Cámara", "IP", "Protocolo", "Resolución", "Codec", "FPS", "Grabación", "Notas"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map((ch, idx) => {
                const isSel = selected === idx;
                const recColor = ch.recording ? RECORDING_COLOR[ch.recording] || "#22c55e" : "#52525b";
                return (
                  <React.Fragment key={ch.channel}>
                    <tr
                      onClick={() => handleSelect(ch.channel)}
                      style={{
                        cursor: "pointer",
                        background: isSel ? "rgba(225,29,72,0.1)" : idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                        borderBottom: isSel ? "none" : "1px solid rgba(255,255,255,0.04)",
                        outline: isSel ? "1px solid rgba(225,29,72,0.35)" : "none",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"; }}
                    >
                      <td style={{ padding: "5px 10px", fontFamily: "monospace", color: isSel ? "#fda4af" : "rgba(255,255,255,0.5)", fontWeight: 700 }}>{ch.channel}</td>
                      <td style={{ padding: "5px 10px" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: ch.enabled ? "#22c55e" : "#333", boxShadow: ch.enabled ? "0 0 6px #22c55e88" : "none" }} />
                      </td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.75)" }}>{ch.connectedCamera || "—"}</td>
                      <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>{ch.cameraIp || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.4)" }}>{ch.protocol || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.4)" }}>{ch.resolution || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.35)" }}>{ch.codec || "—"}</td>
                      <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>{ch.fps || "—"}</td>
                      <td style={{ padding: "5px 10px" }}>
                        {ch.recording && ch.recording !== "off" ? (
                          <span style={{ background: `${recColor}33`, color: recColor, padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
                            {RECORDING_LABELS[ch.recording] || ch.recording}
                          </span>
                        ) : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                      </td>
                      <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.3)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.notes || ""}</td>
                    </tr>
                    <AnimatePresence>
                      {isSel && (
                        <tr key={`exp-${ch.channel}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td colSpan={10} style={{ padding: 0 }}>
                            {renderChannelExpansion(ch, idx)}
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
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
        {Object.entries(RECORDING_COLOR).map(([mode, color]) => (
          <span key={mode} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: `${color}33`, border: `1px solid ${color}66` }} />
            {RECORDING_LABELS[mode] || mode}
          </span>
        ))}
        <span className="ml-auto" style={{ color: "rgba(255,255,255,0.2)" }}>
          Clic en canal para editar
        </span>
      </div>

      {channels.length === 0 && (
        <div className="text-center py-6 text-[11px] text-white/20">Sin canales configurados</div>
      )}
    </div>
  );
}

// ── NVR Disks Editor ────────────────────────────────────────────────────────

export function NvrDisksEditor({
  disks, onChange,
}: {
  disks: NvrDisk[];
  onChange: (disks: NvrDisk[]) => void;
}) {
  const updateDisk = (idx: number, partial: Partial<NvrDisk>) => {
    onChange(disks.map((d, i) => i === idx ? { ...d, ...partial } : d));
  };

  const addDisk = () => {
    const maxSlot = disks.length > 0 ? Math.max(...disks.map(d => d.slot)) : 0;
    onChange([...disks, { id: `disk-${Date.now()}`, slot: maxSlot + 1, status: "empty" }]);
  };

  const removeDisk = (idx: number) => {
    onChange(disks.filter((_, i) => i !== idx));
  };

  const fStyle = { ...miniFieldStyle };
  const totalTB = disks.reduce((s, d) => s + (d.capacityTB || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-white/50 font-bold uppercase tracking-wider">
          Discos ({disks.filter(d => d.status !== "empty").length}/{disks.length} instalados · {totalTB}TB total)
        </span>
        <button onClick={addDisk} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={{ background: "rgba(225,29,72,0.1)", color: "#fda4af", border: "1px solid rgba(225,29,72,0.2)" }}>
          <Plus className="w-3 h-3" /> Bahía
        </button>
      </div>

      <div className="space-y-2">
        {disks.map((disk, idx) => {
          const statusColor = DISK_STATUS_COLOR[disk.status || "empty"];
          return (
            <div key={disk.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: statusColor, boxShadow: `0 0 4px ${statusColor}66` }} />
                  <span className="text-[11px] font-bold text-white/70">Bahía {disk.slot}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded capitalize" style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                    {disk.status === "healthy" ? "OK" : disk.status === "degraded" ? "Degradado" : disk.status === "failed" ? "Fallado" : "Vacío"}
                  </span>
                </div>
                <button onClick={() => removeDisk(idx)} className="p-1 rounded text-white/20 hover:text-red-400 transition-colors cursor-pointer">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Marca</label>
                  <input type="text" value={disk.brand || ""} onChange={e => updateDisk(idx, { brand: e.target.value })} placeholder="WD, Seagate..." style={fStyle} />
                </div>
                <div>
                  <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Modelo</label>
                  <input type="text" value={disk.model || ""} onChange={e => updateDisk(idx, { model: e.target.value })} placeholder="Purple, SkyHawk..." style={fStyle} />
                </div>
                <div>
                  <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Capacidad (TB)</label>
                  <input type="number" min={0} step={0.5} value={disk.capacityTB ?? ""} onChange={e => updateDisk(idx, { capacityTB: parseFloat(e.target.value) || undefined })} placeholder="4" style={{ ...fStyle, fontFamily: "monospace" }} />
                </div>
                <div>
                  <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Tipo</label>
                  <select value={disk.type || ""} onChange={e => updateDisk(idx, { type: e.target.value as NvrDisk["type"] })} style={fStyle}>
                    <option value="" style={{ background: "#1a1a1a" }}>—</option>
                    <option value="HDD" style={{ background: "#1a1a1a" }}>HDD</option>
                    <option value="SSD" style={{ background: "#1a1a1a" }}>SSD</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Estado</label>
                  <select value={disk.status || "empty"} onChange={e => updateDisk(idx, { status: e.target.value as NvrDisk["status"] })} style={fStyle}>
                    {NVR_DISK_STATUSES.map(s => {
                      const labels: Record<string, string> = { healthy: "OK", degraded: "Degradado", failed: "Fallado", empty: "Vacío" };
                      return <option key={s} value={s} style={{ background: "#1a1a1a" }}>{labels[s]}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-white/30 font-bold uppercase tracking-wider block mb-0.5">Notas</label>
                  <input type="text" value={disk.notes || ""} onChange={e => updateDisk(idx, { notes: e.target.value })} placeholder="..." style={fStyle} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {disks.length === 0 && (
        <div className="text-center py-6 text-[11px] text-white/20">Sin discos — agregá bahías para comenzar</div>
      )}
    </div>
  );
}
