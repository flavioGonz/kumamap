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
        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          maxHeight: "90vh",
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

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: "calc(90vh - 130px)" }}>

          {/* ── Antenna Type ── */}
          <div style={sectionStyle}>
            <div className="flex items-center gap-2 mb-3">
              <Signal className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Tipo de Antena</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ANTENNA_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => update("antennaType", t.value)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: config.antennaType === t.value ? "rgba(245,158,11,0.12)" : "var(--surface-hover)",
                    border: `1px solid ${config.antennaType === t.value ? "rgba(245,158,11,0.35)" : "var(--glass-border)"}`,
                    color: config.antennaType === t.value ? "#f59e0b" : "var(--text-secondary)",
                  }}
                >
                  <span className="text-lg leading-none">{t.icon}</span>
                  <div>
                    <div className="text-[11px] font-bold">{t.label}</div>
                    <div className="text-[9px] opacity-60">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Radio Parameters ── */}
          <div style={sectionStyle}>
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Parámetros de Radio</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Frequency */}
              <div>
                <label style={labelStyle}>Frecuencia</label>
                <select
                  value={config.frequency}
                  onChange={(e) => update("frequency", e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              {/* Bandwidth */}
              <div>
                <label style={labelStyle}>Ancho de Banda</label>
                <select
                  value={config.bandwidth}
                  onChange={(e) => update("bandwidth", e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {BANDWIDTHS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Gain */}
              <div>
                <label style={labelStyle}>Ganancia (dBi)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0} max={40} step={1}
                    value={config.antennaGain}
                    onChange={(e) => update("antennaGain", Number(e.target.value))}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, #f59e0b ${(config.antennaGain / 40) * 100}%, var(--muted) 0%)` }}
                  />
                  <span className="text-xs font-mono font-bold min-w-[32px] text-right" style={{ color: "#f59e0b" }}>
                    {config.antennaGain}
                  </span>
                </div>
              </div>

              {/* TX Power */}
              <div>
                <label style={labelStyle}>Potencia TX (dBm)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0} max={30} step={1}
                    value={config.txPower}
                    onChange={(e) => update("txPower", Number(e.target.value))}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, #ef4444 ${(config.txPower / 30) * 100}%, var(--muted) 0%)` }}
                  />
                  <span className="text-xs font-mono font-bold min-w-[32px] text-right" style={{ color: "#ef4444" }}>
                    {config.txPower}
                  </span>
                </div>
              </div>
            </div>

            {/* SSID */}
            <div className="mt-3">
              <label style={labelStyle}>SSID</label>
              <input
                type="text"
                value={config.ssid}
                onChange={(e) => update("ssid", e.target.value)}
                placeholder="Nombre de red inalámbrica"
                style={inputStyle}
              />
            </div>

            {/* Protocol */}
            <div className="mt-3 relative">
              <label style={labelStyle}>Protocolo</label>
              <button
                onClick={() => setShowProtocols(!showProtocols)}
                className="flex items-center justify-between w-full transition-all"
                style={inputStyle}
              >
                <span>{config.protocol || "Seleccionar..."}</span>
                <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)", transform: showProtocols ? "rotate(180deg)" : "" }} />
              </button>
              {showProtocols && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowProtocols(false)} />
                  <div
                    className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-20"
                    style={{
                      background: "var(--card)",
                      border: "1px solid var(--glass-border)",
                      boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    {PROTOCOLS.map((p) => (
                      <button
                        key={p}
                        onClick={() => { update("protocol", p); setShowProtocols(false); }}
                        className="w-full text-left px-3 py-2 text-xs transition-all hover:bg-[var(--surface-hover)]"
                        style={{
                          color: config.protocol === p ? "#f59e0b" : "var(--text-secondary)",
                          fontWeight: config.protocol === p ? 700 : 400,
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Beam / Coverage ── */}
          <div style={sectionStyle}>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Cobertura / Haz</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Beam Width */}
              <div>
                <label style={labelStyle}>Apertura ({config.beamWidth}°)</label>
                <input
                  type="range"
                  min={5} max={360} step={5}
                  value={config.beamWidth}
                  onChange={(e) => update("beamWidth", Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, #22c55e ${(config.beamWidth / 360) * 100}%, var(--muted) 0%)` }}
                  disabled={config.antennaType === "omni"}
                />
              </div>

              {/* Beam Color */}
              <div>
                <label style={labelStyle}>Color del Haz</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {BEAM_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => update("beamColor", c.value)}
                      className="rounded-full transition-all"
                      style={{
                        width: 22, height: 22,
                        background: c.value,
                        border: config.beamColor === c.value ? "3px solid var(--text-primary)" : "2px solid var(--glass-border)",
                        boxShadow: config.beamColor === c.value ? `0 0 8px ${c.value}88` : "none",
                      }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Peer / Link ── */}
          {config.antennaType === "ptp" && (
            <div style={sectionStyle}>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-3.5 w-3.5" style={{ color: "#8b5cf6" }} />
                <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Enlace PTP</span>
              </div>
              <label style={labelStyle}>Antena Peer (otro extremo)</label>
              <select
                value={config.peerNodeId}
                onChange={(e) => update("peerNodeId", e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Sin enlazar</option>
                {availableNodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.label || n.id}</option>
                ))}
              </select>
              <p className="text-[10px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
                Seleccioná la antena del otro extremo del enlace punto a punto
              </p>
            </div>
          )}
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
