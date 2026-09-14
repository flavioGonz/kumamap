"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Radio, RefreshCw, Wifi, WifiOff, X, Clock, Signal, ArrowUpDown, Activity, ChevronDown, ChevronUp, Server } from "lucide-react";
import { apiUrl } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface SnmpWireless {
  ssid?: string; signal?: number; noise?: number; snr?: number; ccq?: number;
  txRate?: number; rxRate?: number; frequency?: number; channelWidth?: number;
  connectedTime?: number; dlRssi?: number; ulRssi?: number; dlSnr?: number;
  ulSnr?: number; dlMcs?: number; ulMcs?: number; txCapacity?: number;
  rxCapacity?: number; connectedAp?: string; txPower?: number; swVersion?: string;
  vendor: "ubiquiti" | "mikrotik" | "cambium" | "standard" | "unknown";
  quality: "excellent" | "good" | "fair" | "poor" | "critical";
}

interface SnmpSystem { description?: string; uptime?: number; uptimeStr?: string; name?: string; contact?: string; location?: string; }
interface SnmpInterface { index: number; name: string; alias?: string; type: number; speed: number; operStatus: string; adminStatus: string; inOctets: number; outOctets: number; inErrors: number; outErrors: number; }
interface WirelessResult { ip: string; timestamp: number; reachable: boolean; cached?: boolean; error?: string; system?: SnmpSystem; wireless?: SnmpWireless | null; interfaces?: SnmpInterface[]; }

// ── Constants ──────────────────────────────────────────────────────────────

const QUALITY: Record<string, { label: string; color: string }> = {
  excellent: { label: "Excelente", color: "#22c55e" },
  good: { label: "Bueno", color: "#3b82f6" },
  fair: { label: "Regular", color: "#f59e0b" },
  poor: { label: "Débil", color: "#f97316" },
  critical: { label: "Crítico", color: "#ef4444" },
};

const VENDOR: Record<string, { label: string; color: string }> = {
  ubiquiti: { label: "Ubiquiti", color: "#8b5cf6" },
  mikrotik: { label: "MikroTik", color: "#06b6d4" },
  cambium: { label: "Cambium", color: "#f97316" },
  standard: { label: "802.11", color: "#64748b" },
  unknown: { label: "?", color: "#64748b" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function sigColor(s: number): string { return s >= -45 ? "#22c55e" : s >= -55 ? "#3b82f6" : s >= -65 ? "#f59e0b" : s >= -75 ? "#f97316" : "#ef4444"; }
function sigPct(s: number): number { return Math.max(0, Math.min(100, ((Math.max(-90, Math.min(-30, s)) + 90) / 60) * 100)); }
function fmtTime(secs: number): string { const d=Math.floor(secs/86400),h=Math.floor((secs%86400)/3600),m=Math.floor((secs%3600)/60); return d>0?`${d}d ${h}h`:h>0?`${h}h ${m}m`:`${m}m`; }
function fmtBytes(b: number): string { return b>=1073741824?`${(b/1073741824).toFixed(1)} GB`:b>=1048576?`${(b/1048576).toFixed(1)} MB`:b>=1024?`${(b/1024).toFixed(0)} KB`:`${b} B`; }
function fmtSpeed(mbps: number): string { return mbps >= 1000 ? `${(mbps/1000).toFixed(1)} Gbps` : `${mbps} Mbps`; }

// ── Sparkline SVG ──────────────────────────────────────────────────────────

function Sparkline({ data, color, maxVal, width = 260, height = 50 }: { data: number[]; color: string; maxVal?: number; width?: number; height?: number }) {
  if (data.length < 2) return <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--text-tertiary)" }}>Recopilando datos...</div>;
  const max = maxVal || Math.max(...data, 1);
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * width, y: height - (v / max) * (height - 4) - 2 }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs><linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} y1={height * f} x2={width} y2={height * f} stroke="var(--glass-border)" strokeWidth={0.5} />)}
      <path d={area} fill={`url(#sg-${color.replace("#","")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r={3} fill={color} stroke="var(--card)" strokeWidth={1.5} />
    </svg>
  );
}

// ── Frequency Channel Bar ──────────────────────────────────────────────────

function FrequencyBar({ freq, chWidth }: { freq?: number; chWidth?: number }) {
  if (!freq) return null;
  const is5g = freq > 4000;
  const rangeStart = is5g ? 5150 : 2400;
  const rangeEnd = is5g ? 5850 : 2500;
  const range = rangeEnd - rangeStart;
  const cw = chWidth || 20;
  const left = ((freq - cw / 2 - rangeStart) / range) * 100;
  const width = (cw / range) * 100;
  return (
    <div style={{ padding: "8px 12px", background: "var(--surface-card)", borderRadius: 10, border: "1px solid var(--glass-border)" }}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary)" }}>{freq}</span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>({cw})</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>MHz</span>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 6, background: "var(--muted)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: `${Math.max(0, left)}%`, width: `${Math.min(width, 100)}%`, height: "100%", background: `linear-gradient(90deg, #3b82f6, #06b6d4)`, borderRadius: 6, boxShadow: "0 0 8px rgba(59,130,246,0.4)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 8, fontFamily: "monospace", color: "var(--text-tertiary)" }}>{rangeStart}</span>
        {is5g && <span style={{ fontSize: 8, fontFamily: "monospace", color: "var(--text-tertiary)" }}>5500</span>}
        <span style={{ fontSize: 8, fontFamily: "monospace", color: "var(--text-tertiary)" }}>{rangeEnd}</span>
      </div>
    </div>
  );
}

// ── MCS Rate Bar ───────────────────────────────────────────────────────────

function McsBar({ currentMcs, label }: { currentMcs?: number; label?: string }) {
  const levels = Array.from({ length: 9 }, (_, i) => i + 1);
  const active = currentMcs != null ? Math.min(Math.max(Math.round(currentMcs), 0), 9) : -1;
  return (
    <div>
      {label && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>}
      <div style={{ display: "flex", gap: 2 }}>
        {levels.map(l => (
          <div key={l} style={{
            flex: 1, height: 6 + l * 2, borderRadius: 2,
            background: l <= active ? (l <= 3 ? "#ef4444" : l <= 5 ? "#f59e0b" : l <= 7 ? "#3b82f6" : "#22c55e") : "var(--muted)",
            opacity: l <= active ? 1 : 0.3,
            transition: "all 0.3s",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 7, fontFamily: "monospace", color: "var(--text-tertiary)" }}>1X</span>
        <span style={{ fontSize: 7, fontFamily: "monospace", color: "var(--text-tertiary)" }}>5X</span>
        <span style={{ fontSize: 7, fontFamily: "monospace", color: "var(--text-tertiary)" }}>9X</span>
      </div>
    </div>
  );
}

// ── Signal Gauge Mini ──────────────────────────────────────────────────────

function SignalGauge({ value, label, unit = "dBm", size = 90 }: { value: number; label: string; unit?: string; size?: number }) {
  const pct = sigPct(value);
  const color = sigColor(value);
  const r = size * 0.4;
  const cx = size / 2, cy = size * 0.55;
  const startAngle = Math.PI, endAngle = 0;
  const angle = startAngle - (pct / 100) * Math.PI;
  const sx = cx + r * Math.cos(startAngle), sy = cy - r * Math.sin(startAngle);
  const ex = cx + r * Math.cos(endAngle), ey = cy - r * Math.sin(endAngle);
  const ax = cx + r * Math.cos(angle), ay = cy - r * Math.sin(angle);
  const nx = cx + (r + 6) * Math.cos(angle), ny = cy - (r + 6) * Math.sin(angle);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <path d={`M${sx},${sy} A${r},${r} 0 0,1 ${ex},${ey}`} fill="none" stroke="var(--muted)" strokeWidth={6} strokeLinecap="round" />
        <path d={`M${sx},${sy} A${r},${r} 0 ${pct > 50 ? 1 : 0},1 ${ax},${ay}`} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
        <circle cx={nx} cy={ny} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
        <text x={cx} y={cy + 2} textAnchor="middle" style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", fill: color }}>{value}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 7, fill: "var(--text-tertiary)" }}>{unit}</text>
      </svg>
      <div style={{ fontSize: 8, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: -2 }}>{label}</div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function Stat({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "6px 8px", background: "var(--surface-card)", borderRadius: 8, border: "1px solid var(--glass-border)" }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: color || "var(--text-primary)", lineHeight: 1 }}>{value}</div>
      {unit && <div style={{ fontSize: 7, color: "var(--text-tertiary)", marginTop: 1 }}>{unit}</div>}
    </div>
  );
}

// ── Throughput Bar ──────────────────────────────────────────────────────────

function ThroughputBar({ label, value, max, color, arrow }: { label: string; value: number; max: number; color: string; arrow: "up" | "down" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 24, textAlign: "center" }}>
        <span style={{ fontSize: 9, fontWeight: 800, color }}>{arrow === "up" ? "TX" : "RX"}</span>
        <div style={{ fontSize: 7, color: "var(--text-tertiary)" }}>{arrow === "up" ? "▲" : "▼"}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: 10, borderRadius: 5, background: "var(--muted)", overflow: "hidden", position: "relative" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 5, background: `linear-gradient(90deg, ${color}88, ${color})`, transition: "width 0.5s ease" }} />
        </div>
      </div>
      <div style={{ minWidth: 70, textAlign: "right" }}>
        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary)" }}>{value.toFixed(1)}</span>
        <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginLeft: 3 }}>Mbps</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AntennaStatusPanel({ ip, community, antennaName, onClose }: { ip: string; community?: string; antennaName?: string; onClose: () => void }) {
  const [data, setData] = useState<WirelessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signalHist, setSignalHist] = useState<number[]>([]);
  const [txHist, setTxHist] = useState<number[]>([]);
  const [rxHist, setRxHist] = useState<number[]>([]);
  const [countdown, setCountdown] = useState(30);
  const [ifOpen, setIfOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ right: 16, bottom: 60 });

  const poll = useCallback(async () => {
    if (!ip) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/snmp/poll"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip, community: community || "public", mode: "wireless" }), signal: controller.signal });
      const result: WirelessResult = await res.json();
      if (!mountedRef.current) return;
      setData(result);
      if (result.wireless?.signal != null) setSignalHist(prev => [...prev.slice(-19), result.wireless!.signal!]);
      if (result.wireless?.txRate != null) setTxHist(prev => [...prev.slice(-19), result.wireless!.txRate!]);
      if (result.wireless?.rxRate != null) setRxHist(prev => [...prev.slice(-19), result.wireless!.rxRate!]);
      if (!result.reachable) setError("No alcanzable");
    } catch (err: any) {
      if (err.name !== "AbortError" && mountedRef.current) setError(err.message || "Error");
    } finally {
      if (mountedRef.current) { setLoading(false); setCountdown(30); }
    }
  }, [ip, community]);

  useEffect(() => { mountedRef.current = true; poll(); return () => { mountedRef.current = false; abortRef.current?.abort(); }; }, [poll]);
  useEffect(() => { const i = setInterval(poll, 30000); return () => clearInterval(i); }, [poll]);
  useEffect(() => { const i = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000); return () => clearInterval(i); }, []);

  // Drag
  const onMouseDown = (e: React.MouseEvent) => { if (!panelRef.current) return; setDragging(true); const r = panelRef.current.getBoundingClientRect(); setOffset({ x: e.clientX - r.left, y: e.clientY - r.top }); };
  useEffect(() => {
    if (!dragging) return;
    const mm = (e: MouseEvent) => { if (!panelRef.current) return; const r = panelRef.current.getBoundingClientRect(); setPosition({ right: Math.max(0, window.innerWidth - e.clientX - (r.width - offset.x)), bottom: Math.max(0, window.innerHeight - e.clientY - (r.height - offset.y)) }); };
    const mu = () => setDragging(false);
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [dragging, offset]);

  if (!ip) return null;

  const w = data?.wireless;
  const sys = data?.system;
  const ifs = data?.interfaces?.filter(i => i.operStatus === "up") || [];
  const q = w ? QUALITY[w.quality] : null;
  const v = w ? VENDOR[w.vendor] : null;
  const maxRate = Math.max(w?.txRate || 0, w?.rxRate || 0, 100);
  const isCambium = w?.vendor === "cambium";

  const sec: React.CSSProperties = { background: "var(--surface-card)", border: "1px solid var(--glass-border)", borderRadius: 10, padding: "10px 12px" };

  return (
    <div ref={panelRef} className="fixed z-[9999]" style={{ right: position.right, bottom: position.bottom, width: 720, background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", backdropFilter: "blur(20px)", overflow: "hidden", userSelect: dragging ? "none" : "auto", maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column" }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--glass-border)", cursor: "grab", background: "linear-gradient(90deg, rgba(59,130,246,0.04), rgba(245,158,11,0.04))" }} onMouseDown={onMouseDown}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Radio className="h-4 w-4" style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>{antennaName || "Antena"}</div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-tertiary)" }}>{ip}</div>
          </div>
          {v && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${v.color}15`, border: `1px solid ${v.color}30`, color: v.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{v.label}</span>}
          {q && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${q.color}15`, border: `1px solid ${q.color}30`, color: q.color }}>{q.label}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Countdown */}
          <div style={{ position: "relative", width: 20, height: 20 }}>
            <svg width={20} height={20} style={{ transform: "rotate(-90deg)" }}><circle cx={10} cy={10} r={8} fill="none" stroke="var(--muted)" strokeWidth={2} /><circle cx={10} cy={10} r={8} fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeDasharray={`${(countdown / 30) * 50.3} 50.3`} /></svg>
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, fontFamily: "monospace", color: "var(--text-tertiary)" }}>{countdown}</span>
          </div>
          <button onClick={poll} disabled={loading} style={{ padding: 4, borderRadius: 6, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /></button>
          <button onClick={onClose} style={{ padding: 4, borderRadius: 6, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* ═══ BODY ═══ */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Loading */}
        {loading && !data && (
          <div style={{ ...sec, textAlign: "center", padding: 20 }}>
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#f59e0b", margin: "0 auto 8px" }} />
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Consultando SNMP en {ip}...</div>
          </div>
        )}

        {/* Error */}
        {error && !data?.reachable && (
          <div style={{ ...sec, display: "flex", alignItems: "center", gap: 8 }}>
            <WifiOff className="w-4 h-4" style={{ color: "#ef4444" }} />
            <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>
          </div>
        )}

        {data?.reachable && <>

          {/* ═══ LINK OVERVIEW STRIP ═══ */}
          <div style={{ ...sec, background: "linear-gradient(90deg, rgba(59,130,246,0.06), rgba(34,197,94,0.06))", padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {/* LOCAL */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, background: "rgba(59,130,246,0.15)", marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 900, color: "#3b82f6", letterSpacing: "0.08em" }}>LOCAL</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{sys?.name || antennaName || "—"}</div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "monospace" }}>{ip}</div>
                {w?.txPower != null && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>TX POWER <span style={{ fontWeight: 800, fontFamily: "monospace", color: "#ef4444" }}>{w.txPower} dBm</span></div>}
              </div>

              {/* CENTER — SSID + Freq + CCQ */}
              <div style={{ flex: 1.2, textAlign: "center" }}>
                {w?.ssid && <div style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, background: "var(--surface-elevated)", border: "1px solid var(--glass-border)", fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "var(--text-primary)", marginBottom: 4 }}>SSID: {w.ssid}</div>}
                {w?.frequency && <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary)" }}>{w.frequency} MHz</div>}
                {w?.ccq != null && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>CCQ {w.ccq}%</div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--muted)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${w.ccq}%`, borderRadius: 3, background: w.ccq >= 80 ? "#22c55e" : w.ccq >= 50 ? "#f59e0b" : "#ef4444", transition: "width 0.5s" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* REMOTE */}
              <div style={{ flex: 1, textAlign: "right" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, background: "rgba(34,197,94,0.15)", marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 900, color: "#22c55e", letterSpacing: "0.08em" }}>REMOTE</span>
                </div>
                {w?.connectedAp ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{w.connectedAp}</div>
                    {w.swVersion && <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "monospace" }}>v{w.swVersion}</div>}
                  </>
                ) : (
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>—</div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ FREQUENCY BAR ═══ */}
          {w?.frequency && <FrequencyBar freq={w.frequency} chWidth={w.channelWidth} />}

          {/* ═══ SIGNAL SECTION ═══ */}
          {w && (w.signal != null || w.dlRssi != null) && (
            <div style={{ display: "grid", gridTemplateColumns: isCambium ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
              {isCambium ? (
                <>
                  {/* Cambium DL/UL layout */}
                  <div style={sec}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Downlink</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <SignalGauge value={w.dlRssi ?? w.signal ?? -90} label="RSSI" />
                      <div>
                        {w.dlSnr != null && <Stat label="SNR" value={w.dlSnr} unit="dB" color={w.dlSnr >= 25 ? "#22c55e" : w.dlSnr >= 15 ? "#f59e0b" : "#ef4444"} />}
                        {w.dlMcs != null && <div style={{ marginTop: 6 }}><McsBar currentMcs={w.dlMcs} label="MCS DL" /></div>}
                      </div>
                    </div>
                  </div>
                  <div style={sec}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Uplink</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <SignalGauge value={w.ulRssi ?? w.signal ?? -90} label="RSSI" />
                      <div>
                        {w.ulSnr != null && <Stat label="SNR" value={w.ulSnr} unit="dB" color={w.ulSnr >= 25 ? "#22c55e" : w.ulSnr >= 15 ? "#f59e0b" : "#ef4444"} />}
                        {w.ulMcs != null && <div style={{ marginTop: 6 }}><McsBar currentMcs={w.ulMcs} label="MCS UL" /></div>}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Generic: Signal + SNR + Noise + CCQ */}
                  {w.signal != null && <Stat label="Señal" value={w.signal} unit="dBm" color={sigColor(w.signal)} />}
                  {w.snr != null && <Stat label="SNR" value={w.snr} unit="dB" color={w.snr >= 25 ? "#22c55e" : w.snr >= 15 ? "#f59e0b" : "#ef4444"} />}
                  {w.noise != null && <Stat label="Ruido" value={w.noise} unit="dBm" />}
                  {w.ccq != null ? <Stat label="CCQ" value={`${w.ccq}%`} color={w.ccq >= 80 ? "#22c55e" : w.ccq >= 50 ? "#f59e0b" : "#ef4444"} /> : sys?.uptimeStr ? <Stat label="Uptime" value={sys.uptimeStr} /> : null}
                </>
              )}
            </div>
          )}

          {/* ═══ THROUGHPUT ═══ */}
          {w && (w.txRate != null || w.rxRate != null) && (
            <div style={sec}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <ArrowUpDown className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Throughput</span>
                <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginLeft: "auto" }}>max {maxRate.toFixed(0)} Mbps</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {w.txRate != null && <ThroughputBar label="TX" value={w.txRate} max={maxRate} color="#22c55e" arrow="up" />}
                {w.rxRate != null && <ThroughputBar label="RX" value={w.rxRate} max={maxRate} color="#3b82f6" arrow="down" />}
              </div>
            </div>
          )}

          {/* ═══ CAPACITY CHART ═══ */}
          {(txHist.length > 1 || rxHist.length > 1 || signalHist.length > 1) && (
            <div style={sec}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Activity className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Historial en Tiempo Real</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: signalHist.length > 1 ? "1fr 1fr" : "1fr", gap: 10 }}>
                {/* Signal history */}
                {signalHist.length > 1 && (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 4 }}>SEÑAL (dBm)</div>
                    <Sparkline data={signalHist.map(s => s + 100)} color={sigColor(signalHist[signalHist.length - 1])} maxVal={70} width={320} height={45} />
                  </div>
                )}
                {/* TX/RX history */}
                {(txHist.length > 1 || rxHist.length > 1) && (
                  <div>
                    <div style={{ display: "flex", gap: 10, fontSize: 8, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 4 }}>
                      <span>CAPACIDAD</span>
                      <span style={{ color: "#22c55e" }}>● TX</span>
                      <span style={{ color: "#3b82f6" }}>● RX</span>
                    </div>
                    <div style={{ position: "relative" }}>
                      {txHist.length > 1 && <Sparkline data={txHist} color="#22c55e" maxVal={maxRate} width={320} height={45} />}
                      {rxHist.length > 1 && <div style={{ position: "absolute", inset: 0, opacity: 0.7 }}><Sparkline data={rxHist} color="#3b82f6" maxVal={maxRate} width={320} height={45} /></div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ DETAILS TABLE ═══ */}
          <div style={sec}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 16px", fontSize: 10 }}>
              {w?.frequency && <><span style={{ color: "var(--text-tertiary)" }}>Frecuencia</span><span style={{ color: "var(--text-primary)", fontWeight: 600, fontFamily: "monospace", gridColumn: "2/4" }}>{w.frequency} MHz{w.channelWidth ? ` / ${w.channelWidth} MHz` : ""}</span></>}
              {w?.ssid && <><span style={{ color: "var(--text-tertiary)" }}>SSID</span><span style={{ color: "var(--text-primary)", fontWeight: 600, fontFamily: "monospace", gridColumn: "2/4" }}>{w.ssid}</span></>}
              {w?.connectedTime != null && <><span style={{ color: "var(--text-tertiary)" }}>Conectado</span><span style={{ color: "var(--text-primary)", fontWeight: 600, fontFamily: "monospace", gridColumn: "2/4" }}>{fmtTime(w.connectedTime)}</span></>}
              {sys?.uptimeStr && <><span style={{ color: "var(--text-tertiary)" }}>Uptime</span><span style={{ color: "var(--text-primary)", fontWeight: 600, fontFamily: "monospace", gridColumn: "2/4" }}>{sys.uptimeStr}</span></>}
              {sys?.description && <><span style={{ color: "var(--text-tertiary)" }}>Equipo</span><span style={{ color: "var(--text-secondary)", fontSize: 9, gridColumn: "2/4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sys.description}</span></>}
              {w?.swVersion && <><span style={{ color: "var(--text-tertiary)" }}>Firmware</span><span style={{ color: "var(--text-primary)", fontWeight: 600, fontFamily: "monospace", gridColumn: "2/4" }}>{w.swVersion}</span></>}
            </div>
          </div>

          {/* ═══ INTERFACES (collapsible) ═══ */}
          {ifs.length > 0 && (
            <div style={sec}>
              <button onClick={() => setIfOpen(!ifOpen)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>Interfaces ({ifs.length})</span>
                {ifOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {ifOpen && (
                <div style={{ marginTop: 8, fontSize: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 50px 70px 70px 70px 50px", gap: "4px 8px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", fontSize: 8, marginBottom: 4 }}>
                    <span>Interfaz</span><span>Estado</span><span>Velocidad</span><span>IN</span><span>OUT</span><span>Errores</span>
                  </div>
                  {ifs.map(iface => (
                    <div key={iface.index} style={{ display: "grid", gridTemplateColumns: "2fr 50px 70px 70px 70px 50px", gap: "4px 8px", padding: "3px 0", borderTop: "1px solid var(--glass-border)" }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iface.name}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: iface.operStatus === "up" ? "#22c55e" : "#ef4444", boxShadow: `0 0 4px ${iface.operStatus === "up" ? "#22c55e" : "#ef4444"}88` }} /><span style={{ fontSize: 9, color: "var(--text-secondary)" }}>{iface.operStatus}</span></span>
                      <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{fmtSpeed(iface.speed)}</span>
                      <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{fmtBytes(iface.inOctets)}</span>
                      <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{fmtBytes(iface.outOctets)}</span>
                      <span style={{ color: iface.inErrors + iface.outErrors > 0 ? "#ef4444" : "var(--text-tertiary)", fontFamily: "monospace" }}>{iface.inErrors + iface.outErrors}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No wireless data */}
          {!w && data.reachable && (
            <div style={{ ...sec, textAlign: "center", padding: 16 }}>
              <Server className="w-5 h-5" style={{ color: "var(--text-tertiary)", margin: "0 auto 6px" }} />
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Equipo alcanzable — OIDs wireless no disponibles
                <br /><span style={{ fontSize: 9 }}>MIBs probadas: Ubiquiti, MikroTik, Cambium, 802.11</span>
              </div>
              {sys?.name && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{sys.name}</div>}
              {sys?.description && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>{sys.description.substring(0, 80)}</div>}
              {sys?.uptimeStr && <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>Uptime: {sys.uptimeStr}</div>}
            </div>
          )}
        </>}
      </div>
    </div>
  );
}
