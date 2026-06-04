"use client";

import { useState } from "react";
import { X, Radio, Wifi, Signal, Zap, Globe, ChevronDown } from "lucide-react";

export interface AntennaConfig {
  antennaType: "ptp" | "ptmp" | "omni" | "sector";
  frequency: string;
  antennaGain: number;
  txPower: number;
  beamWidth: number;
  beamRange: number;
  beamColor: string;
  ssid: string;
  bandwidth: string;
  protocol: string;
  peerNodeId: string;
  ip: string;
  snmpCommunity: string;
}

interface AntennaConfigModalProps {
  currentConfig: AntennaConfig;
  antennaName: string;
  availableNodes: { id: string; label: string }[];
  onSave: (config: AntennaConfig) => void;
  onClose: () => void;
}

const ANTENNA_TYPES = [
  { value: "ptp", label: "Punto a Punto (PTP)", desc: "Enlace dedicado entre dos antenas", icon: "↔" },
  { value: "ptmp", label: "Punto a Multipunto (PTMP)", desc: "Una antena base, múltiples clientes", icon: "⊛" },
  { value: "sector", label: "Sectorial", desc: "Cobertura en un sector angular", icon: "◔" },
  { value: "omni", label: "Omnidireccional", desc: "Cobertura 360°", icon: "◉" },
] as const;

const FREQUENCIES = ["900 MHz", "2.4 GHz", "5 GHz", "5.8 GHz", "6 GHz", "11 GHz", "24 GHz", "60 GHz"];
const BANDWIDTHS = ["5 MHz", "10 MHz", "20 MHz", "40 MHz", "80 MHz", "160 MHz"];
const PROTOCOLS = [
  "802.11n", "802.11ac", "802.11ax (Wi-Fi 6)", "802.11be (Wi-Fi 7)",
  "AirMax", "AirMax AC", "airFiber", "NanoBeam", "LiteBeam",
  "MikroTik NV2", "MikroTik Nstreme",
  "Mimosa", "Cambium ePMP", "Cambium PMP",
  "Radwin", "SAF Tehnika", "Otro",
];

const BEAM_COLORS = [
  { value: "#3b82f6", label: "Azul" },
  { value: "#f59e0b", label: "Ámbar" },
  { value: "#22c55e", label: "Verde" },
  { value: "#ef4444", label: "Rojo" },
  { value: "#8b5cf6", label: "Violeta" },
  { value: "#06b6d4", label: "Cian" },
  { value: "#f97316", label: "Naranja" },
  { value: "#ec4899", label: "Rosa" },
];

export default function AntennaConfigModal({
  currentConfig,
  antennaName,
  availableNodes,
  onSave,
  onClose,
}: AntennaConfigModalProps) {
  const [config, setConfig] = useState<AntennaConfig>({ ...currentConfig });
  const [showProtocols, setShowProtocols] = useState(false);

  const update = <K extends keyof AntennaConfig>(key: K, value: AntennaConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-adjust beam width for omni antennas
      if (key === "antennaType" && value === "omni") next.beamWidth = 360;
      if (key === "antennaType" && value === "ptp" && prev.beamWidth === 360) next.beamWidth = 15;
      if (key === "antennaType" && value === "sector" && prev.beamWidth < 60) next.beamWidth = 90;
      return next;
    });
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-elevated)",
    border: "1px solid var(--glass-border)",
    color: "var(--text-primary)",
    borderRadius: "10px",
    padding: "8px 12px",
    fontSize: "13px",
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "4px",
  };

  const sectionStyle: React.CSSProperties = {
    background: "var(--surface-card)",
    border: "1px solid var(--glass-border)",
    borderRadius: "14px",
    padding: "14px",
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          maxWidth: "680px",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--glass-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{
                width: 38, height: 38,
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <Radio className="h-5 w-5" style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                Configurar Antena
              </h3>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {antennaName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-all hover:bg-[var(--surface-hover)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 2-column layout */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(80vh - 120px)" }}>
          <div className="grid grid-cols-2 gap-4">

            {/* ══════ LEFT COLUMN ══════ */}
            <div className="space-y-3">

              {/* ── Antenna Type ── */}
              <div style={sectionStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <Signal className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Tipo de Antena</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ANTENNA_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => update("antennaType", t.value)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all"
                      style={{
                        background: config.antennaType === t.value ? "rgba(245,158,11,0.12)" : "var(--surface-hover)",
                        border: `1px solid ${config.antennaType === t.value ? "rgba(245,158,11,0.35)" : "var(--glass-border)"}`,
                        color: config.antennaType === t.value ? "#f59e0b" : "var(--text-secondary)",
                      }}
                    >
                      <span className="text-base leading-none">{t.icon}</span>
                      <div>
                        <div className="text-[10px] font-bold leading-tight">{t.label}</div>
                        <div className="text-[8px] opacity-50 leading-tight">{t.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Radio Parameters ── */}
              <div style={sectionStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <Wifi className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Parámetros de Radio</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label style={labelStyle}>Frecuencia</label>
                    <select value={config.frequency} onChange={(e) => update("frequency", e.target.value)} style={{ ...inputStyle, cursor: "pointer", padding: "6px 8px", fontSize: "12px" }}>
                      {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Ancho Banda</label>
                    <select value={config.bandwidth} onChange={(e) => update("bandwidth", e.target.value)} style={{ ...inputStyle, cursor: "pointer", padding: "6px 8px", fontSize: "12px" }}>
                      {BANDWIDTHS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <label style={labelStyle}>Protocolo</label>
                    <button onClick={() => setShowProtocols(!showProtocols)} className="flex items-center justify-between w-full transition-all" style={{ ...inputStyle, cursor: "pointer", padding: "6px 8px", fontSize: "12px" }}>
                      <span className="truncate">{config.protocol || "Seleccionar"}</span>
                      <ChevronDown className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-tertiary)", transform: showProtocols ? "rotate(180deg)" : "", transition: "transform 0.15s" }} />
                    </button>
                    {showProtocols && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowProtocols(false)} />
                        <div className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-20" style={{ background: "var(--card)", border: "1px solid var(--glass-border)", boxShadow: "0 12px 40px rgba(0,0,0,0.4)", maxHeight: "180px", overflowY: "auto" }}>
                          {PROTOCOLS.map((p) => (
                            <button key={p} onClick={() => { update("protocol", p); setShowProtocols(false); }} className="w-full text-left px-3 py-1.5 text-[11px] transition-all hover:bg-[var(--surface-hover)]" style={{ color: config.protocol === p ? "#f59e0b" : "var(--text-secondary)", fontWeight: config.protocol === p ? 700 : 400 }}>
                              {p}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label style={labelStyle}>Ganancia — {config.antennaGain} dBi</label>
                    <input type="range" min={0} max={40} step={1} value={config.antennaGain} onChange={(e) => update("antennaGain", Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #f59e0b ${(config.antennaGain / 40) * 100}%, var(--muted) 0%)` }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Potencia TX — {config.txPower} dBm</label>
                    <input type="range" min={0} max={30} step={1} value={config.txPower} onChange={(e) => update("txPower", Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #ef4444 ${(config.txPower / 30) * 100}%, var(--muted) 0%)` }} />
                  </div>
                </div>

                <div className="mt-2">
                  <label style={labelStyle}>SSID</label>
                  <input type="text" value={config.ssid} onChange={(e) => update("ssid", e.target.value)} placeholder="Nombre de red inalámbrica" style={{ ...inputStyle, padding: "6px 10px", fontSize: "12px" }} />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label style={labelStyle}>IP</label>
                    <input type="text" value={config.ip} onChange={(e) => update("ip", e.target.value)} placeholder="192.168.1.1" style={{ ...inputStyle, padding: "6px 10px", fontSize: "12px", fontFamily: "monospace" }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Comunidad SNMP</label>
                    <input type="text" value={config.snmpCommunity} onChange={(e) => update("snmpCommunity", e.target.value)} placeholder="public" style={{ ...inputStyle, padding: "6px 10px", fontSize: "12px", fontFamily: "monospace" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ══════ RIGHT COLUMN ══════ */}
            <div className="space-y-3">

              {/* ── Beam / Coverage ── */}
              <div style={sectionStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Cobertura / Haz</span>
                </div>

                <div className="mb-3">
                  <label style={labelStyle}>Apertura del haz — {config.beamWidth}°</label>
                  <input type="range" min={5} max={360} step={5} value={config.beamWidth} onChange={(e) => update("beamWidth", Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #22c55e ${(config.beamWidth / 360) * 100}%, var(--muted) 0%)` }} disabled={config.antennaType === "omni"} />
                  {config.antennaType === "omni" && <p className="text-[9px] mt-1" style={{ color: "var(--text-tertiary)" }}>Omni = 360° (no editable)</p>}
                </div>

                <div>
                  <label style={labelStyle}>Color del Haz</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {BEAM_COLORS.map((c) => (
                      <button key={c.value} onClick={() => update("beamColor", c.value)} className="rounded-full transition-all" style={{ width: 26, height: 26, background: c.value, border: config.beamColor === c.value ? "3px solid var(--text-primary)" : "2px solid var(--glass-border)", boxShadow: config.beamColor === c.value ? `0 0 8px ${c.value}88` : "none" }} title={c.label} />
                    ))}
                  </div>
                </div>

                {/* Visual beam preview */}
                <div className="mt-3 flex items-center justify-center" style={{ height: 80 }}>
                  <svg viewBox="0 0 120 80" width="120" height="80">
                    {/* Beam cone preview */}
                    {(() => {
                      const cx = 10, cy = 40, range = 100;
                      const halfAngle = Math.min(config.beamWidth, 360) / 2;
                      const rad = Math.PI / 180;
                      const x1 = cx + range * Math.cos(-halfAngle * rad);
                      const y1 = cy + range * Math.sin(-halfAngle * rad);
                      const x2 = cx + range * Math.cos(halfAngle * rad);
                      const y2 = cy + range * Math.sin(halfAngle * rad);
                      const largeArc = config.beamWidth > 180 ? 1 : 0;
                      return (
                        <>
                          <path d={`M${cx},${cy} L${x1},${y1} A${range},${range} 0 ${largeArc},1 ${x2},${y2} Z`} fill={config.beamColor} fillOpacity={0.2} stroke={config.beamColor} strokeWidth={1} strokeOpacity={0.5} />
                          <circle cx={cx} cy={cy} r={4} fill={config.beamColor} />
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* ── Peer / Link ── */}
              {config.antennaType === "ptp" && (
                <div style={sectionStyle}>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-3.5 w-3.5" style={{ color: "#8b5cf6" }} />
                    <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Enlace PTP</span>
                  </div>
                  <label style={labelStyle}>Antena Peer (otro extremo)</label>
                  <select value={config.peerNodeId} onChange={(e) => update("peerNodeId", e.target.value)} style={{ ...inputStyle, cursor: "pointer", padding: "6px 10px", fontSize: "12px" }}>
                    <option value="">Sin enlazar</option>
                    {availableNodes.map((n) => (
                      <option key={n.id} value={n.id}>{n.label || n.id}</option>
                    ))}
                  </select>
                  <p className="text-[9px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                    Seleccioná la antena del otro extremo del enlace
                  </p>
                </div>
              )}

              {/* ── Summary card ── */}
              <div style={{ ...sectionStyle, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)" }}>
                <div className="text-[10px] font-bold mb-1.5" style={{ color: "#f59e0b" }}>Resumen</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  <span>Tipo</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{ANTENNA_TYPES.find(t => t.value === config.antennaType)?.label}</span>
                  <span>Frecuencia</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{config.frequency}</span>
                  <span>Ganancia</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{config.antennaGain} dBi</span>
                  <span>TX</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{config.txPower} dBm</span>
                  <span>Apertura</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{config.beamWidth}°</span>
                  {config.ssid && <><span>SSID</span><span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{config.ssid}</span></>}
                  {config.protocol && <><span>Protocolo</span><span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{config.protocol}</span></>}
                  {config.ip && <><span>IP</span><span className="font-semibold truncate font-mono" style={{ color: "var(--text-primary)" }}>{config.ip}</span></>}
                  {config.snmpCommunity && <><span>SNMP</span><span className="font-semibold truncate font-mono" style={{ color: "var(--text-primary)" }}>{config.snmpCommunity}</span></>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: "1px solid var(--glass-border)" }}
        >
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-all"
            style={{
              background: "var(--surface-hover)",
              border: "1px solid var(--glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(config); onClose(); }}
            className="rounded-xl px-5 py-2 text-xs font-bold transition-all"
            style={{
              background: "rgba(245,158,11,0.15)",
              border: "1px solid rgba(245,158,11,0.35)",
              color: "#f59e0b",
            }}
          >
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
}
