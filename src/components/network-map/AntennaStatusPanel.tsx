"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Radio, RefreshCw, Wifi, WifiOff, X,
  Clock, Signal, ArrowUpDown, Activity,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

// ── Types matching the wireless API response ────────────────────────────────

interface SnmpWireless {
  ssid?: string;
  signal?: number;
  noise?: number;
  snr?: number;
  ccq?: number;
  txRate?: number;
  rxRate?: number;
  frequency?: number;
  channelWidth?: number;
  connectedTime?: number;
  vendor?: "ubiquiti" | "mikrotik" | "standard" | "unknown";
  quality: "excellent" | "good" | "fair" | "poor" | "critical";
}

interface SnmpSystem {
  description?: string;
  uptime?: number;
  uptimeStr?: string;
  name?: string;
}

interface WirelessResult {
  ip: string;
  timestamp: number;
  reachable: boolean;
  cached?: boolean;
  error?: string;
  system?: SnmpSystem;
  wireless?: SnmpWireless | null;
}

// ── Quality badge config ────────────────────────────────────────────────────

const QUALITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: "Excelente", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  good:      { label: "Bueno",     color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  fair:      { label: "Regular",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  poor:      { label: "Debil",     color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  critical:  { label: "Critico",   color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

// ── Signal bar gradient color ───────────────────────────────────────────────

function signalBarColor(signal: number): string {
  // Map -90..-30 to red..green
  if (signal >= -50) return "#22c55e";
  if (signal >= -65) return "#3b82f6";
  if (signal >= -75) return "#f59e0b";
  if (signal >= -85) return "#f97316";
  return "#ef4444";
}

function signalBarPercent(signal: number): number {
  // Map -90dBm = 0%, -30dBm = 100%
  const clamped = Math.max(-90, Math.min(-30, signal));
  return ((clamped + 90) / 60) * 100;
}

function formatConnTime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function AntennaStatusPanel({
  ip,
  community,
  antennaName,
  onClose,
}: {
  ip: string;
  community?: string;
  antennaName?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<WirelessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ right: 16, bottom: 80 });
  const panelRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    if (!ip) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/snmp/poll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, community: community || "public", mode: "wireless" }),
        signal: controller.signal,
      });
      const result: WirelessResult = await res.json();

      if (!mountedRef.current) return;

      setData(result);
      if (!result.reachable) {
        setError("No se pudo alcanzar el equipo");
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (mountedRef.current) {
        setError(err.message || "Error de red");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ip, community]);

  useEffect(() => {
    mountedRef.current = true;
    poll();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [poll]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [poll]);

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (!panelRef.current) return;
    setDragging(true);
    const rect = panelRef.current.getBoundingClientRect();
    setOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const parentW = window.innerWidth;
      const parentH = window.innerHeight;
      const rect = panelRef.current.getBoundingClientRect();
      const newRight = parentW - e.clientX - (rect.width - offset.x);
      const newBottom = parentH - e.clientY - (rect.height - offset.y);
      setPosition({
        right: Math.max(0, Math.min(parentW - rect.width, newRight)),
        bottom: Math.max(0, Math.min(parentH - rect.height, newBottom)),
      });
    };
    const onMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, offset]);

  if (!ip) return null;

  const wireless = data?.wireless;
  const sys = data?.system;
  const quality = wireless ? QUALITY_CONFIG[wireless.quality] || QUALITY_CONFIG.critical : null;

  const cardBg = "var(--card, rgba(15,15,15,0.95))";
  const borderColor = "var(--glass-border, rgba(255,255,255,0.08))";
  const panelBg = "var(--surface-card, rgba(255,255,255,0.02))";
  const sectionStyle: React.CSSProperties = {
    background: panelBg,
    border: `1px solid ${borderColor}`,
    borderRadius: 10,
    padding: "10px 12px",
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-[9999]"
      style={{
        right: position.right,
        bottom: position.bottom,
        width: 340,
        background: cardBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        userSelect: dragging ? "none" : "auto",
      }}
    >
      {/* Header — draggable */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: `1px solid ${borderColor}`,
          cursor: "grab",
          background: "rgba(245,158,11,0.04)",
        }}
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ width: 30, height: 30, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            <Radio className="h-4 w-4" style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: "var(--text-primary, #eee)" }}>
              {antennaName || "Antena"}
            </div>
            <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary, #666)" }}>
              {ip} {data?.cached ? "(cache)" : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={poll}
            disabled={loading}
            className="rounded-lg p-1.5 transition-all hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: "var(--text-tertiary, #666)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-all hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: "var(--text-tertiary, #666)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2.5" style={{ maxHeight: 420, overflowY: "auto" }}>

        {/* Loading state */}
        {loading && !data && (
          <div style={sectionStyle} className="flex items-center justify-center gap-2 py-4">
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: "#f59e0b" }} />
            <span style={{ fontSize: 12, color: "var(--text-tertiary, rgba(255,255,255,0.45))" }}>
              Consultando SNMP wireless en {ip}...
            </span>
          </div>
        )}

        {/* Error state */}
        {error && !data?.reachable && (
          <div style={sectionStyle} className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" style={{ color: "#ef4444" }} />
            <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>
          </div>
        )}

        {/* Data states */}
        {data?.reachable && (
          <>
            {/* Quality badge + system name */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {data.reachable && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <Wifi className="w-3 h-3" style={{ color: "#22c55e" }} />
                    <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>SNMP</span>
                  </div>
                )}
                {wireless?.vendor && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase" style={{
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.2)",
                    color: "#8b5cf6",
                    letterSpacing: "0.04em",
                  }}>
                    {wireless.vendor}
                  </span>
                )}
              </div>
              {quality && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full" style={{ background: quality.bg, border: `1px solid ${quality.color}33` }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: quality.color, boxShadow: `0 0 6px ${quality.color}88` }} />
                  <span style={{ fontSize: 10, color: quality.color, fontWeight: 700 }}>{quality.label}</span>
                </div>
              )}
            </div>

            {/* System info */}
            {sys?.name && (
              <div style={{ fontSize: 11, color: "var(--text-secondary, rgba(255,255,255,0.6))", fontWeight: 600 }}>
                {sys.name}
                {sys.description && (
                  <span style={{ fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.3))", fontWeight: 400, marginLeft: 6 }}>
                    {sys.description.substring(0, 60)}{sys.description.length > 60 ? "..." : ""}
                  </span>
                )}
              </div>
            )}

            {/* Signal meter */}
            {wireless?.signal != null && (
              <div style={sectionStyle}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Signal className="w-3 h-3" style={{ color: signalBarColor(wireless.signal) }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary, rgba(255,255,255,0.4))", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Senal
                    </span>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: signalBarColor(wireless.signal) }}>
                    {wireless.signal} dBm
                  </span>
                </div>
                {/* Gradient signal bar */}
                <div style={{ width: "100%", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
                  <div style={{
                    width: "100%", height: "100%", position: "absolute",
                    background: "linear-gradient(to right, #ef4444, #f97316, #f59e0b, #3b82f6, #22c55e)",
                    opacity: 0.2,
                  }} />
                  <div style={{
                    width: `${signalBarPercent(wireless.signal)}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: signalBarColor(wireless.signal),
                    transition: "width 0.5s ease",
                    position: "relative",
                  }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span style={{ fontSize: 8, color: "var(--text-tertiary, rgba(255,255,255,0.2))", fontFamily: "monospace" }}>-90 dBm</span>
                  <span style={{ fontSize: 8, color: "var(--text-tertiary, rgba(255,255,255,0.2))", fontFamily: "monospace" }}>-30 dBm</span>
                </div>
              </div>
            )}

            {/* Stats grid */}
            {wireless && (
              <div className="grid grid-cols-3 gap-2">
                {/* SNR */}
                {wireless.snr != null && (
                  <div style={sectionStyle} className="text-center">
                    <div style={{ fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.35))", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>SNR</div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: wireless.snr >= 25 ? "#22c55e" : wireless.snr >= 15 ? "#f59e0b" : "#ef4444" }}>
                      {wireless.snr}
                    </div>
                    <div style={{ fontSize: 8, color: "var(--text-tertiary, rgba(255,255,255,0.25))" }}>dB</div>
                  </div>
                )}

                {/* CCQ */}
                {wireless.ccq != null && (
                  <div style={sectionStyle} className="text-center">
                    <div style={{ fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.35))", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>CCQ</div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: wireless.ccq >= 80 ? "#22c55e" : wireless.ccq >= 50 ? "#f59e0b" : "#ef4444" }}>
                      {wireless.ccq}
                    </div>
                    <div style={{ fontSize: 8, color: "var(--text-tertiary, rgba(255,255,255,0.25))" }}>%</div>
                  </div>
                )}

                {/* Noise */}
                {wireless.noise != null && (
                  <div style={sectionStyle} className="text-center">
                    <div style={{ fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.35))", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Ruido</div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: "var(--text-secondary, rgba(255,255,255,0.6))" }}>
                      {wireless.noise}
                    </div>
                    <div style={{ fontSize: 8, color: "var(--text-tertiary, rgba(255,255,255,0.25))" }}>dBm</div>
                  </div>
                )}
              </div>
            )}

            {/* TX/RX rates */}
            {wireless && (wireless.txRate != null || wireless.rxRate != null) && (
              <div style={sectionStyle}>
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowUpDown className="w-3 h-3" style={{ color: "#3b82f6" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary, rgba(255,255,255,0.4))", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Throughput
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {wireless.txRate != null && (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700 }}>TX</span>
                      <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary, rgba(255,255,255,0.8))" }}>
                        {wireless.txRate}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.3))" }}>Mbps</span>
                    </div>
                  )}
                  {wireless.rxRate != null && (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 9, color: "#3b82f6", fontWeight: 700 }}>RX</span>
                      <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary, rgba(255,255,255,0.8))" }}>
                        {wireless.rxRate}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.3))" }}>Mbps</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SSID / Frequency / Channel / Uptime */}
            {wireless && (wireless.ssid || wireless.frequency || wireless.channelWidth || wireless.connectedTime != null || sys?.uptimeStr) && (
              <div style={sectionStyle}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3 h-3" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.3))" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary, rgba(255,255,255,0.4))", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Detalles
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1" style={{ fontSize: 11 }}>
                  {wireless.ssid && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>SSID</span>
                      <span style={{ color: "var(--text-primary, rgba(255,255,255,0.8))", fontWeight: 600, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wireless.ssid}</span>
                    </>
                  )}
                  {wireless.frequency != null && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Frecuencia</span>
                      <span style={{ color: "var(--text-primary, rgba(255,255,255,0.8))", fontWeight: 600, fontFamily: "monospace" }}>{wireless.frequency} MHz</span>
                    </>
                  )}
                  {wireless.channelWidth != null && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Canal</span>
                      <span style={{ color: "var(--text-primary, rgba(255,255,255,0.8))", fontWeight: 600, fontFamily: "monospace" }}>{wireless.channelWidth} MHz</span>
                    </>
                  )}
                  {wireless.connectedTime != null && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Conectado</span>
                      <span style={{ color: "var(--text-primary, rgba(255,255,255,0.8))", fontWeight: 600, fontFamily: "monospace" }}>{formatConnTime(wireless.connectedTime)}</span>
                    </>
                  )}
                  {sys?.uptimeStr && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Uptime</span>
                      <span className="flex items-center gap-1" style={{ color: "var(--text-primary, rgba(255,255,255,0.8))", fontWeight: 600, fontFamily: "monospace" }}>
                        <Clock className="w-3 h-3" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.25))" }} />
                        {sys.uptimeStr}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* No wireless data warning */}
            {!wireless && data.reachable && (
              <div style={{ ...sectionStyle, textAlign: "center", padding: "14px 12px" }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>
                  Equipo alcanzable pero no devolvio OIDs wireless.
                  <br />
                  <span style={{ fontSize: 10 }}>Se intentaron MIBs Ubiquiti, MikroTik y 802.11 estandar.</span>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
