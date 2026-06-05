"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Radio, RefreshCw, Wifi, WifiOff, X,
  Clock, Signal, ArrowUpDown, Activity,
  Network, ChevronDown, ChevronUp,
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
  contact?: string;
  location?: string;
}

interface SnmpInterface {
  index: number;
  name: string;
  alias?: string;
  type: number;
  speed: number;
  operStatus: string;
  adminStatus: string;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
}

interface WirelessResult {
  ip: string;
  timestamp: number;
  reachable: boolean;
  cached?: boolean;
  error?: string;
  system?: SnmpSystem;
  wireless?: SnmpWireless | null;
  interfaces?: SnmpInterface[];
}

// ── Quality badge config ────────────────────────────────────────────────────

const QUALITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: "Excelente", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  good:      { label: "Bueno",     color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  fair:      { label: "Regular",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  poor:      { label: "Debil",     color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  critical:  { label: "Critico",   color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

// ── Vendor display config ───────────────────────────────────────────────────

const VENDOR_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ubiquiti:  { label: "Ubiquiti",  color: "#8b5cf6", bg: "rgba(139,92,246,0.10)" },
  mikrotik:  { label: "MikroTik", color: "#06b6d4", bg: "rgba(6,182,212,0.10)" },
  standard:  { label: "802.11",   color: "#64748b", bg: "rgba(100,116,139,0.10)" },
  unknown:   { label: "Desconocido", color: "#64748b", bg: "rgba(100,116,139,0.10)" },
};

// ── Signal helpers ──────────────────────────────────────────────────────────

function signalColor(signal: number): string {
  if (signal >= -45) return "#22c55e";
  if (signal >= -55) return "#3b82f6";
  if (signal >= -65) return "#f59e0b";
  if (signal >= -75) return "#f97316";
  return "#ef4444";
}

function formatConnTime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatOctets(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ── SVG Signal Gauge ────────────────────────────────────────────────────────

function SignalGauge({ signal, quality }: { signal: number; quality: string }) {
  const qCfg = QUALITY_CONFIG[quality] || QUALITY_CONFIG.critical;

  // Gauge geometry
  const cx = 110;
  const cy = 100;
  const r = 80;
  const startAngle = Math.PI;       // 180 degrees (left)
  const endAngle = 0;               // 0 degrees (right)

  // Signal range: -90 to -30
  const minSignal = -90;
  const maxSignal = -30;
  const clampedSignal = Math.max(minSignal, Math.min(maxSignal, signal));
  const normalizedValue = (clampedSignal - minSignal) / (maxSignal - minSignal);

  // Needle angle (from left=180deg to right=0deg)
  const needleAngle = startAngle - normalizedValue * Math.PI;

  // Arc helper
  const arcPath = (startFrac: number, endFrac: number): string => {
    const a1 = startAngle - startFrac * Math.PI;
    const a2 = startAngle - endFrac * Math.PI;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy - r * Math.sin(a2);
    const largeArc = (a1 - a2) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Color zones as fractions of the arc (0=left/-90, 1=right/-30)
  // Red: -90 to -75 = 0 to 0.25
  // Orange: -75 to -65 = 0.25 to 0.417
  // Yellow: -65 to -55 = 0.417 to 0.583
  // Blue: -55 to -45 = 0.583 to 0.75
  // Green: -45 to -30 = 0.75 to 1
  const zones = [
    { start: 0, end: 0.25, color: "#ef4444" },
    { start: 0.25, end: 0.417, color: "#f97316" },
    { start: 0.417, end: 0.583, color: "#f59e0b" },
    { start: 0.583, end: 0.75, color: "#3b82f6" },
    { start: 0.75, end: 1, color: "#22c55e" },
  ];

  // Needle endpoint
  const needleLen = r - 12;
  const needleX = cx + needleLen * Math.cos(needleAngle);
  const needleY = cy - needleLen * Math.sin(needleAngle);

  // Tick marks
  const ticks = [-90, -80, -70, -60, -50, -40, -30];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg viewBox="0 0 220 130" width={220} height={130}>
        {/* Background arc */}
        <path
          d={arcPath(0, 1)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={14}
          strokeLinecap="round"
        />

        {/* Color zone arcs */}
        {zones.map((zone, i) => (
          <path
            key={i}
            d={arcPath(zone.start, zone.end)}
            fill="none"
            stroke={zone.color}
            strokeWidth={14}
            strokeLinecap="butt"
            opacity={0.35}
          />
        ))}

        {/* Active zone highlight (brighter up to needle position) */}
        <path
          d={arcPath(0, Math.min(1, normalizedValue))}
          fill="none"
          stroke={signalColor(signal)}
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.7}
          style={{ transition: "all 0.6s ease" }}
        />

        {/* Tick marks */}
        {ticks.map((tickVal) => {
          const frac = (tickVal - minSignal) / (maxSignal - minSignal);
          const tickAngle = startAngle - frac * Math.PI;
          const outerR = r + 10;
          const innerR = r + 4;
          const tx1 = cx + outerR * Math.cos(tickAngle);
          const ty1 = cy - outerR * Math.sin(tickAngle);
          const tx2 = cx + innerR * Math.cos(tickAngle);
          const ty2 = cy - innerR * Math.sin(tickAngle);
          const labelR = r + 20;
          const lx = cx + labelR * Math.cos(tickAngle);
          const ly = cy - labelR * Math.sin(tickAngle);
          return (
            <g key={tickVal}>
              <line
                x1={tx1} y1={ty1} x2={tx2} y2={ty2}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={1.5}
              />
              <text
                x={lx} y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fill="rgba(255,255,255,0.25)"
                fontSize={7}
                fontFamily="monospace"
              >
                {tickVal}
              </text>
            </g>
          );
        })}

        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={needleX} y2={needleY}
          stroke={signalColor(signal)}
          strokeWidth={2.5}
          strokeLinecap="round"
          style={{ transition: "all 0.6s ease" }}
        />

        {/* Needle center dot */}
        <circle cx={cx} cy={cy} r={5} fill={signalColor(signal)} opacity={0.9} />
        <circle cx={cx} cy={cy} r={2.5} fill="var(--card, #111)" />

        {/* Center value text */}
        <text
          x={cx} y={cy + 22}
          textAnchor="middle"
          fill={signalColor(signal)}
          fontSize={20}
          fontWeight={800}
          fontFamily="monospace"
          style={{ transition: "fill 0.3s ease" }}
        >
          {signal} dBm
        </text>

        {/* Quality label */}
        <text
          x={cx} y={cy + 36}
          textAnchor="middle"
          fill={qCfg.color}
          fontSize={10}
          fontWeight={700}
        >
          {qCfg.label}
        </text>
      </svg>
    </div>
  );
}

// ── Signal History Sparkline ────────────────────────────────────────────────

function SignalSparkline({ history }: { history: number[] }) {
  if (history.length < 2) return null;

  const w = 530;
  const h = 60;
  const padX = 8;
  const padY = 6;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;

  const minY = -90;
  const maxY = -30;

  const points = history.map((val, i) => {
    const x = padX + (i / (history.length - 1)) * chartW;
    const clamped = Math.max(minY, Math.min(maxY, val));
    const y = padY + ((maxY - clamped) / (maxY - minY)) * chartH;
    return { x, y };
  });

  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${lineD} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;

  const lastVal = history[history.length - 1];
  const lineColor = signalColor(lastVal);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={60} style={{ display: "block" }}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[-80, -60, -40].map((val) => {
        const y = padY + ((maxY - val) / (maxY - minY)) * chartH;
        return (
          <g key={val}>
            <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
            <text x={w - padX + 3} y={y + 3} fill="rgba(255,255,255,0.2)" fontSize={6} fontFamily="monospace">{val}</text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaD} fill="url(#sparkFill)" />

      {/* Line */}
      <path d={lineD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Last point dot */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3} fill={lineColor} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill={lineColor} opacity={0.3} />
    </svg>
  );
}

// ── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string | number;
  unit: string;
  color: string;
}) {
  const borderColor = "var(--glass-border, rgba(255,255,255,0.08))";
  return (
    <div style={{
      flex: 1,
      background: "var(--surface-card, rgba(255,255,255,0.02))",
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: "8px 6px",
      textAlign: "center",
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 8,
        fontWeight: 700,
        color: "var(--text-tertiary, rgba(255,255,255,0.35))",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 4,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 20,
        fontWeight: 800,
        fontFamily: "monospace",
        color,
        lineHeight: 1.1,
        transition: "color 0.3s ease",
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 8,
        color: "var(--text-tertiary, rgba(255,255,255,0.25))",
        marginTop: 2,
      }}>
        {unit}
      </div>
    </div>
  );
}

// ── Throughput Bar ───────────────────────────────────────────────────────────

function ThroughputBar({
  label,
  value,
  color,
  maxRef,
}: {
  label: string;
  value: number;
  color: string;
  maxRef: number;
}) {
  const pct = Math.min(100, (value / maxRef) * 100);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.04em" }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary, rgba(255,255,255,0.85))" }}>
          {value} <span style={{ fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Mbps</span>
        </span>
      </div>
      <div style={{
        width: "100%",
        height: 8,
        borderRadius: 4,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 4,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
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
  const [signalHistory, setSignalHistory] = useState<number[]>([]);
  const [showInterfaces, setShowInterfaces] = useState(false);
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

      // Push signal reading to history
      if (result.wireless?.signal != null) {
        setSignalHistory((prev) => {
          const next = [...prev, result.wireless!.signal!];
          return next.length > 20 ? next.slice(-20) : next;
        });
      }

      if (!result.reachable) {
        setError("No se pudo alcanzar el equipo");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Error de red");
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
  const vendorCfg = wireless?.vendor ? VENDOR_CONFIG[wireless.vendor] || VENDOR_CONFIG.unknown : null;

  const cardBg = "var(--card, rgba(15,15,15,0.95))";
  const borderColor = "var(--glass-border, rgba(255,255,255,0.08))";
  const panelBg = "var(--surface-card, rgba(255,255,255,0.02))";
  const sectionStyle: React.CSSProperties = {
    background: panelBg,
    border: `1px solid ${borderColor}`,
    borderRadius: 10,
    padding: "10px 12px",
  };

  // Determine throughput max reference for bar scaling
  const txVal = wireless?.txRate ?? 0;
  const rxVal = wireless?.rxRate ?? 0;
  const throughputMax = Math.max(300, txVal, rxVal);

  // Filter active interfaces
  const activeInterfaces = data?.interfaces?.filter(
    (iface) => iface.operStatus === "up" || iface.adminStatus === "up"
  );

  return (
    <div
      ref={panelRef}
      className="fixed z-[9999]"
      style={{
        right: position.right,
        bottom: position.bottom,
        width: 580,
        background: cardBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        userSelect: dragging ? "none" : "auto",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: `1px solid ${borderColor}`,
          cursor: "grab",
          background: "rgba(245,158,11,0.04)",
        }}
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{
              width: 32, height: 32,
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
            <Radio className="h-4 w-4" style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="text-sm font-bold"
              style={{
                color: "var(--text-primary, #eee)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {antennaName || "Antena"}
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: 1 }}>
              <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary, #666)" }}>
                {ip}
              </span>
              {data?.cached && (
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text-tertiary, #555)",
                }}>
                  cache
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Vendor badge */}
          {vendorCfg && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase" style={{
              background: vendorCfg.bg,
              border: `1px solid ${vendorCfg.color}33`,
              color: vendorCfg.color,
              letterSpacing: "0.04em",
            }}>
              {vendorCfg.label}
            </span>
          )}
          {/* Quality badge */}
          {quality && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{
              background: quality.bg,
              border: `1px solid ${quality.color}33`,
            }}>
              <span className="w-2 h-2 rounded-full" style={{
                background: quality.color,
                boxShadow: `0 0 6px ${quality.color}88`,
                animation: "pulse 2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 10, color: quality.color, fontWeight: 700 }}>
                {quality.label}
              </span>
            </div>
          )}
          {/* Refresh */}
          <button
            onClick={poll}
            disabled={loading}
            className="rounded-lg p-1.5 transition-all hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: "var(--text-tertiary, #666)" }}
            title="Actualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {/* Auto-refresh indicator */}
          <div title="Auto-actualiza cada 30s" style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 4px #22c55e88",
            animation: "pulse 3s ease-in-out infinite",
          }} />
          {/* Close */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-all hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: "var(--text-tertiary, #666)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body (scrollable) ─────────────────────────────────────────────── */}
      <div className="p-3 flex flex-col gap-2.5" style={{ maxHeight: 560, overflowY: "auto" }}>

        {/* Loading state */}
        {loading && !data && (
          <div style={sectionStyle} className="flex items-center justify-center gap-2 py-6">
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#f59e0b" }} />
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
            {/* SNMP reachable badge */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.18)",
              }}>
                <Wifi className="w-3 h-3" style={{ color: "#22c55e" }} />
                <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700, letterSpacing: "0.04em" }}>
                  SNMP OK
                </span>
              </div>
              {sys?.name && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, rgba(255,255,255,0.6))" }}>
                  {sys.name}
                </span>
              )}
            </div>

            {/* ── Section 2: Signal Gauge ──────────────────────────────────── */}
            {wireless?.signal != null && (
              <div style={sectionStyle} className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 self-start mb-1">
                  <Signal className="w-3 h-3" style={{ color: signalColor(wireless.signal) }} />
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: "var(--text-tertiary, rgba(255,255,255,0.4))",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Nivel de Senal
                  </span>
                </div>
                <SignalGauge signal={wireless.signal} quality={wireless.quality} />
              </div>
            )}

            {/* ── Section 3: Key Metrics Row ──────────────────────────────── */}
            {wireless && (
              <div style={{ display: "flex", gap: 8 }}>
                {wireless.snr != null && (
                  <MetricCard
                    label="Senal/Ruido"
                    value={wireless.snr}
                    unit="dB"
                    color={wireless.snr >= 25 ? "#22c55e" : wireless.snr >= 15 ? "#f59e0b" : "#ef4444"}
                  />
                )}
                {wireless.ccq != null && (
                  <MetricCard
                    label="Calidad Conexion"
                    value={wireless.ccq}
                    unit="%"
                    color={wireless.ccq >= 80 ? "#22c55e" : wireless.ccq >= 50 ? "#f59e0b" : "#ef4444"}
                  />
                )}
                {wireless.noise != null && (
                  <MetricCard
                    label="Piso de Ruido"
                    value={wireless.noise}
                    unit="dBm"
                    color="var(--text-secondary, rgba(255,255,255,0.6))"
                  />
                )}
                <MetricCard
                  label="Tiempo Activo"
                  value={sys?.uptimeStr ?? (wireless.connectedTime != null ? formatConnTime(wireless.connectedTime) : "--")}
                  unit=""
                  color="var(--text-secondary, rgba(255,255,255,0.6))"
                />
              </div>
            )}

            {/* ── Section 4: Throughput ────────────────────────────────────── */}
            {wireless && (wireless.txRate != null || wireless.rxRate != null) && (
              <div style={sectionStyle}>
                <div className="flex items-center gap-1.5 mb-3">
                  <ArrowUpDown className="w-3 h-3" style={{ color: "#3b82f6" }} />
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: "var(--text-tertiary, rgba(255,255,255,0.4))",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Throughput
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  {wireless.txRate != null && (
                    <ThroughputBar label="TX" value={wireless.txRate} color="#22c55e" maxRef={throughputMax} />
                  )}
                  {wireless.rxRate != null && (
                    <ThroughputBar label="RX" value={wireless.rxRate} color="#3b82f6" maxRef={throughputMax} />
                  )}
                </div>
              </div>
            )}

            {/* ── Section 5: Signal History ────────────────────────────────── */}
            {signalHistory.length >= 2 && (
              <div style={sectionStyle}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.3))" }} />
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: "var(--text-tertiary, rgba(255,255,255,0.4))",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      Historial de Senal
                    </span>
                  </div>
                  <span style={{
                    fontSize: 9, color: "var(--text-tertiary, rgba(255,255,255,0.3))",
                    fontFamily: "monospace",
                  }}>
                    {signalHistory.length} lecturas
                  </span>
                </div>
                <SignalSparkline history={signalHistory} />
              </div>
            )}

            {/* ── Section 6: Link Details ──────────────────────────────────── */}
            {wireless && (
              <div style={sectionStyle}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Radio className="w-3 h-3" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.3))" }} />
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: "var(--text-tertiary, rgba(255,255,255,0.4))",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Detalles del Enlace
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 8px", fontSize: 11 }}>
                  {wireless.ssid && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>SSID</span>
                      <span style={{
                        color: "var(--text-primary, rgba(255,255,255,0.85))",
                        fontWeight: 600, fontFamily: "monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {wireless.ssid}
                      </span>
                    </>
                  )}
                  {wireless.frequency != null && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Frecuencia</span>
                      <span style={{ color: "var(--text-primary, rgba(255,255,255,0.85))", fontWeight: 600, fontFamily: "monospace" }}>
                        {wireless.frequency} MHz
                        {wireless.frequency >= 5000 && (
                          <span style={{ fontSize: 9, marginLeft: 6, color: "#8b5cf6", fontWeight: 400 }}>5 GHz</span>
                        )}
                        {wireless.frequency > 0 && wireless.frequency < 5000 && (
                          <span style={{ fontSize: 9, marginLeft: 6, color: "#06b6d4", fontWeight: 400 }}>2.4 GHz</span>
                        )}
                      </span>
                    </>
                  )}
                  {wireless.channelWidth != null && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Ancho de Canal</span>
                      <span style={{ color: "var(--text-primary, rgba(255,255,255,0.85))", fontWeight: 600, fontFamily: "monospace" }}>
                        {wireless.channelWidth} MHz
                      </span>
                    </>
                  )}
                  {wireless.connectedTime != null && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Tiempo Conectado</span>
                      <span className="flex items-center gap-1" style={{
                        color: "var(--text-primary, rgba(255,255,255,0.85))",
                        fontWeight: 600, fontFamily: "monospace",
                      }}>
                        <Clock className="w-3 h-3 shrink-0" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.25))" }} />
                        {formatConnTime(wireless.connectedTime)}
                      </span>
                    </>
                  )}
                  {wireless.vendor && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Vendor</span>
                      <span style={{
                        color: "var(--text-primary, rgba(255,255,255,0.85))",
                        fontWeight: 600, textTransform: "capitalize",
                      }}>
                        {wireless.vendor}
                      </span>
                    </>
                  )}
                  {sys?.name && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>System Name</span>
                      <span style={{
                        color: "var(--text-primary, rgba(255,255,255,0.85))",
                        fontWeight: 600, fontFamily: "monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {sys.name}
                      </span>
                    </>
                  )}
                  {sys?.description && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>System Description</span>
                      <span style={{
                        color: "var(--text-primary, rgba(255,255,255,0.7))",
                        fontWeight: 400, fontSize: 10,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                        title={sys.description}
                      >
                        {sys.description.length > 80 ? sys.description.substring(0, 80) + "..." : sys.description}
                      </span>
                    </>
                  )}
                  {sys?.uptimeStr && (
                    <>
                      <span style={{ color: "var(--text-tertiary, rgba(255,255,255,0.35))" }}>Uptime Sistema</span>
                      <span className="flex items-center gap-1" style={{
                        color: "var(--text-primary, rgba(255,255,255,0.85))",
                        fontWeight: 600, fontFamily: "monospace",
                      }}>
                        <Clock className="w-3 h-3 shrink-0" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.25))" }} />
                        {sys.uptimeStr}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Section 7: Interface Stats (collapsible) ────────────────── */}
            {activeInterfaces && activeInterfaces.length > 0 && (
              <div style={sectionStyle}>
                <button
                  onClick={() => setShowInterfaces((v) => !v)}
                  className="flex items-center justify-between w-full"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <div className="flex items-center gap-1.5">
                    <Network className="w-3 h-3" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.3))" }} />
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: "var(--text-tertiary, rgba(255,255,255,0.4))",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      Interfaces ({activeInterfaces.length})
                    </span>
                  </div>
                  {showInterfaces
                    ? <ChevronUp className="w-3 h-3" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.3))" }} />
                    : <ChevronDown className="w-3 h-3" style={{ color: "var(--text-tertiary, rgba(255,255,255,0.3))" }} />
                  }
                </button>

                {showInterfaces && (
                  <div style={{ marginTop: 8, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          {["Interfaz", "Estado", "Velocidad", "IN", "OUT", "Errores"].map((h) => (
                            <th key={h} style={{
                              padding: "4px 6px",
                              textAlign: "left",
                              fontSize: 8,
                              fontWeight: 700,
                              color: "var(--text-tertiary, rgba(255,255,255,0.3))",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              whiteSpace: "nowrap",
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeInterfaces.map((iface) => (
                          <tr key={iface.index} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                            <td style={{
                              padding: "4px 6px", fontFamily: "monospace",
                              color: "var(--text-primary, rgba(255,255,255,0.8))",
                              maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                              title={iface.alias || iface.name}
                            >
                              {iface.alias || iface.name}
                            </td>
                            <td style={{ padding: "4px 6px" }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                fontSize: 9, fontWeight: 600,
                                color: iface.operStatus === "up" ? "#22c55e" : "#ef4444",
                              }}>
                                <span style={{
                                  width: 5, height: 5, borderRadius: "50%",
                                  background: iface.operStatus === "up" ? "#22c55e" : "#ef4444",
                                }} />
                                {iface.operStatus}
                              </span>
                            </td>
                            <td style={{
                              padding: "4px 6px", fontFamily: "monospace",
                              color: "var(--text-secondary, rgba(255,255,255,0.6))",
                              whiteSpace: "nowrap",
                            }}>
                              {iface.speed > 0 ? `${iface.speed} Mbps` : "--"}
                            </td>
                            <td style={{
                              padding: "4px 6px", fontFamily: "monospace",
                              color: "var(--text-secondary, rgba(255,255,255,0.6))",
                              whiteSpace: "nowrap",
                            }}>
                              {formatOctets(iface.inOctets)}
                            </td>
                            <td style={{
                              padding: "4px 6px", fontFamily: "monospace",
                              color: "var(--text-secondary, rgba(255,255,255,0.6))",
                              whiteSpace: "nowrap",
                            }}>
                              {formatOctets(iface.outOctets)}
                            </td>
                            <td style={{
                              padding: "4px 6px", fontFamily: "monospace",
                              color: (iface.inErrors + iface.outErrors) > 0 ? "#f59e0b" : "var(--text-tertiary, rgba(255,255,255,0.25))",
                              whiteSpace: "nowrap",
                            }}>
                              {iface.inErrors + iface.outErrors > 0
                                ? `${iface.inErrors}/${iface.outErrors}`
                                : "0"
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

      {/* Pulse animation keyframe (injected once) */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
