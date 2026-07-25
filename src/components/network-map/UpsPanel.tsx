"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  X, RefreshCw, Zap, BatteryFull, Thermometer, Clock,
  Activity, AlertTriangle, Plug, ArrowUpFromLine,
  Gauge, Power, ChevronDown, ChevronUp, Settings,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import {
  type UpsResult, type UpsHistoryPoint, type UpsVendor,
  statusColor, statusLabel, batteryColor, loadColor, runtimeStr,
} from "@/lib/ups";

const VENDOR_BADGE: Record<UpsVendor, string | null> = {
  apc: "APC",
  rfc1628: "RFC1628",
  nut: "NUT",
  unknown: null,
};

// ── Compact Battery SVG ────────────────────────────────────────────────────

function CompactBattery({ charge, health, onBattery }: { charge: number; health: string; onBattery: boolean }) {
  const color = batteryColor(charge);
  const fillH = Math.max(1, (charge / 100) * 28);
  return (
    <svg viewBox="0 0 24 42" width={28} height={48} className={onBattery ? "ups-pulse" : ""}>
      <rect x="2" y="6" width="20" height="34" rx="3" ry="3" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <rect x="8" y="2" width="8" height="5" rx="1.5" ry="1.5" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <rect x="4" y={38 - fillH} width="16" height={fillH} rx="1.5" ry="1.5" fill={color} opacity="0.85">
        <animate attributeName="opacity" values="0.85;0.6;0.85" dur="2s" repeatCount={onBattery ? "indefinite" : "0"} />
      </rect>
      <text x="12" y="25" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="8" fontWeight="800" fontFamily="monospace">
        {charge}%
      </text>
      {!onBattery && charge < 100 && (
        <g transform="translate(8, 9)" opacity="0.7">
          <path d="M4 0L2 4H4L2 8L6 3H4L6 0Z" fill="#f59e0b" />
        </g>
      )}
      {(health === "replace" || health === "fault" || health === "low") && (
        <circle cx="20" cy="8" r="3.5" fill="#ef4444">
          <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}

// ── Compact Circular Gauge ─────────────────────────────────────────────────

function MiniGauge({ value, max, label, unit, color }: {
  value: number; max: number; label: string; unit: string; color: string;
}) {
  const size = 56;
  const r = 20;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dashoff = circ * (1 - pct * 0.75);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={dashoff}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div style={{ position: "absolute", top: size * 0.2, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color, lineHeight: 1 }}>{Math.round(value)}</span>
        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{unit}</span>
      </div>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", fontWeight: 600, textTransform: "uppercase", marginTop: -2, letterSpacing: "0.03em" }}>{label}</span>
    </div>
  );
}

// ── Mini Sparkline ──────────────────────────────────────────────────────────

const Sparkline = memo(function Sparkline({
  data, color, width = 260, height = 28, label, unit,
}: {
  data: number[]; color: string; width?: number; height?: number; label: string; unit: string;
}) {
  if (data.length < 2) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 16 }}>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.12)" }}>Recopilando...</span>
    </div>
  );
  const maxV = Math.max(...data, 1), minV = Math.min(...data, 0), range = (maxV - minV) || 1;
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * width, y: height - ((v - minV) / range) * (height - 4) - 2 }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gid = `sg-${label.replace(/\s/g, "")}`;
  const last = data[data.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "monospace", color }}>{last.toFixed(last % 1 ? 1 : 0)} {unit}</span>
      </div>
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0.01" /></linearGradient></defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2} fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth={0.8} />
      </svg>
    </div>
  );
});

// ── CSS keyframes (injected once) ───────────────────────────────────────────

const STYLE_ID = "ups-panel-styles";
function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes upsPulse { 0%, 100% { filter: drop-shadow(0 0 3px rgba(245,158,11,0.3)); } 50% { filter: drop-shadow(0 0 8px rgba(245,158,11,0.6)); } }
    .ups-pulse { animation: upsPulse 1.5s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

// ── Main UPS Panel ──────────────────────────────────────────────────────────

export default function UpsPanel({
  nodeId, ip, upsName, onClose, onConfigure, anchorX, anchorY,
}: {
  nodeId: string; ip?: string; upsName: string; onClose: () => void;
  onConfigure?: () => void; anchorX?: number; anchorY?: number;
}) {
  const [data, setData] = useState<UpsResult | null>(null);
  const [history, setHistory] = useState<UpsHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Draggable positioning ──
  const PANEL_W = 280;
  const initLeft = anchorX != null ? Math.max(8, Math.min(anchorX - PANEL_W / 2, (typeof window !== "undefined" ? window.innerWidth : 1200) - PANEL_W - 8)) : undefined;
  const initTop = anchorY != null ? Math.max(8, Math.min(anchorY + 20, (typeof window !== "undefined" ? window.innerHeight : 800) - 300)) : undefined;
  const [pos, setPos] = useState({ left: initLeft ?? 0, top: initTop ?? 80 });
  const useAnchor = anchorX != null && anchorY != null;
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, form")) return;
    e.preventDefault();
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.left, y: e.clientY - pos.top };
  };
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => setPos({ left: e.clientX - dragOffset.current.x, top: e.clientY - dragOffset.current.y });
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  useEffect(() => { injectStyles(); }, []);

  // Credentials live in the node's custom_data — the server resolves them from nodeId.
  const poll = useCallback(async () => {
    if (!nodeId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/ups/poll"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }), signal: controller.signal,
      });
      const result: UpsResult = await res.json();
      if (!mountedRef.current) return;
      setData(result);
      setError(result.reachable ? null : result.error || "No se pudo alcanzar la UPS");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [nodeId]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/ups/history?nodeId=${encodeURIComponent(nodeId)}&hours=6`));
      const json = await res.json();
      if (mountedRef.current && json.points) setHistory(json.points);
    } catch { /* non-critical */ }
  }, [nodeId]);

  useEffect(() => {
    mountedRef.current = true;
    poll(); fetchHistory();
    // The background monitor pushes every 30 s; the interval only covers a dead socket.
    const pi = setInterval(poll, 30_000);
    const hi = setInterval(fetchHistory, 60_000);
    return () => { mountedRef.current = false; abortRef.current?.abort(); clearInterval(pi); clearInterval(hi); };
  }, [poll, fetchHistory]);

  // Live push from the server-side poller.
  useEffect(() => {
    const socket = getSocket();
    const onReading = (payload: { nodeId: string; result: UpsResult }) => {
      if (payload?.nodeId !== nodeId || !payload.result) return;
      setData(payload.result);
      setError(payload.result.reachable ? null : payload.result.error || "No se pudo alcanzar la UPS");
    };
    const onSnapshot = (snap: Record<string, UpsResult>) => {
      const r = snap?.[nodeId];
      if (r) { setData(r); setError(r.reachable ? null : r.error || "No se pudo alcanzar la UPS"); }
    };
    socket.on("ups:reading", onReading);
    socket.on("ups:snapshot", onSnapshot);
    return () => { socket.off("ups:reading", onReading); socket.off("ups:snapshot", onSnapshot); };
  }, [nodeId]);

  const bat = data?.battery, inp = data?.input, out = data?.output, ident = data?.identity;
  const onBattery = out?.status === "onBattery";
  const stColor = out ? statusColor(out.status) : "#6b7280";
  const stLabel = out ? statusLabel(out.status) : "—";
  const hCharge = history.map(p => p.charge), hLoad = history.map(p => p.load);
  const hInputV = history.filter(p => p.inputV != null).map(p => p.inputV!);
  const hTemp = history.filter(p => p.temp != null).map(p => p.temp!);
  const displayIp = ip || data?.ip || "—";
  const vendorBadge = data?.vendor ? VENDOR_BADGE[data.vendor] : null;
  const transport = data?.vendor === "nut" ? "NUT" : "SNMP";

  // ── Inline metric helper ──
  const M = ({ icon, label: l, value: v, unit: u, color: c }: { icon: React.ReactNode; label: string; value: string | number; unit: string; color: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 0" }}>
      <span style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontWeight: 600, textTransform: "uppercase", minWidth: 50 }}>{l}</span>
      <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: c, marginLeft: "auto" }}>{v}</span>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", fontWeight: 600, minWidth: 18 }}>{u}</span>
    </div>
  );

  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col shadow-2xl"
      style={{
        ...(useAnchor ? { left: pos.left, top: pos.top } : { top: 80, right: 60 }),
        width: PANEL_W,
        maxHeight: "calc(100vh - 60px)",
        background: "rgba(14,14,14,0.97)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        userSelect: dragging ? "none" : "auto",
      }}
    >
      {/* ── Header ── */}
      <div
        onMouseDown={useAnchor ? onDragStart : undefined}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          cursor: useAnchor ? (dragging ? "grabbing" : "grab") : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: `${stColor}15`, border: `1px solid ${stColor}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Zap className="w-3 h-3" style={{ color: stColor }} />
          </div>
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: "#ededed", margin: 0, lineHeight: 1.2 }}>{upsName}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 2,
                padding: "0px 4px", borderRadius: 3,
                background: `${stColor}15`, color: stColor, fontWeight: 700, fontSize: 8,
              }}>
                <Power className="w-2 h-2" />{stLabel}
              </span>
              {ident?.manufacturer && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 8 }}>{ident.manufacturer}</span>}
              {vendorBadge && (
                <span style={{ padding: "0px 3px", borderRadius: 2, fontSize: 7, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>
                  {vendorBadge}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button onClick={poll} disabled={loading} className="rounded p-1 transition-all cursor-pointer" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
          {onConfigure && (
            <button onClick={onConfigure} title="Configurar UPS" className="rounded p-1 transition-all cursor-pointer" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>
              <Settings className="w-3 h-3" />
            </button>
          )}
          <button onClick={onClose} className="rounded p-1 transition-all cursor-pointer" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Loading */}
        {loading && !data && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 12 }}>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: "#f59e0b" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Consultando {displayIp}...</span>
          </div>
        )}

        {/* Error */}
        {error && !data && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8 }}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "#ef4444" }} />
            <span style={{ fontSize: 10, color: "#ef4444" }}>{error}</span>
          </div>
        )}

        {data?.reachable && bat && out && (
          <>
            {/* ── Hero: Battery + Gauges in one row ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Battery + runtime */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <CompactBattery charge={bat.charge} health={bat.health} onBattery={onBattery} />
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Clock className="w-2 h-2" style={{ color: "rgba(255,255,255,0.25)" }} />
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                    color: bat.runtimeMinutes != null && bat.runtimeMinutes < 10 ? "#ef4444" : "#22c55e",
                  }}>
                    {runtimeStr(bat.runtimeMinutes)}
                  </span>
                </div>
              </div>

              {/* Gauges */}
              <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "space-around" }}>
                {out.loadPercent != null && (
                  <MiniGauge value={out.loadPercent} max={100} label="Carga" unit="%" color={loadColor(out.loadPercent)} />
                )}
                {out.voltage != null && (
                  <MiniGauge value={out.voltage} max={260} label="Salida" unit="V" color={out.voltage >= 200 && out.voltage <= 240 ? "#22c55e" : "#f59e0b"} />
                )}
                {inp?.voltage != null && (
                  <MiniGauge value={inp.voltage} max={260} label="Entrada" unit="V" color={inp.voltage >= 200 && inp.voltage <= 240 ? "#3b82f6" : "#f59e0b"} />
                )}
              </div>
            </div>

            {/* Battery health warnings (only if needed) */}
            {bat.health !== "normal" && bat.health !== "unknown" && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 5, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <AlertTriangle className="w-2.5 h-2.5" style={{ color: "#ef4444" }} />
                <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 600 }}>
                  {bat.health === "replace" ? "Reemplazar batería" : bat.health === "low" ? "Batería baja" : bat.health === "depleted" ? "Agotada" : bat.health === "fault" ? "Falla" : bat.health}
                </span>
              </div>
            )}

            {/* ── Compact metrics list ── */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "2px 0" }}>
              {bat.temperature != null && <M icon={<Thermometer className="w-2.5 h-2.5" />} label="Temp." value={bat.temperature} unit="°C" color={bat.temperature > 40 ? "#ef4444" : bat.temperature > 35 ? "#f59e0b" : "#22c55e"} />}
              {bat.voltage != null && <M icon={<BatteryFull className="w-2.5 h-2.5" />} label="Batería" value={bat.voltage.toFixed(1)} unit="Vdc" color="#3b82f6" />}
              {inp?.frequency != null && <M icon={<Activity className="w-2.5 h-2.5" />} label="Frecuencia" value={inp.frequency.toFixed(1)} unit="Hz" color={Math.abs(inp.frequency - 50) <= 1 ? "#22c55e" : "#f59e0b"} />}
              {out.power != null && <M icon={<Gauge className="w-2.5 h-2.5" />} label="Potencia" value={out.power} unit={data.vendor === "apc" ? "VA" : "W"} color="#8b5cf6" />}
              {out.current != null && <M icon={<Zap className="w-2.5 h-2.5" />} label="Corriente" value={out.current.toFixed(1)} unit="A" color="#06b6d4" />}
              {inp?.voltageMax != null && inp?.voltageMin != null && <M icon={<ArrowUpFromLine className="w-2.5 h-2.5" />} label="Rango in" value={`${inp.voltageMin}–${inp.voltageMax}`} unit="V" color="rgba(255,255,255,0.45)" />}
            </div>

            {/* Model */}
            {ident?.model && (
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ident.model}{ident.serial && <span style={{ marginLeft: 4, color: "rgba(255,255,255,0.12)" }}>S/N {ident.serial}</span>}
              </div>
            )}

            {/* ── Sparklines toggle ── */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-between w-full px-2 py-1 rounded transition-all cursor-pointer"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Historial 6h</span>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>{history.length}pts</span>
                {expanded ? <ChevronUp className="w-3 h-3" style={{ color: "rgba(255,255,255,0.25)" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "rgba(255,255,255,0.25)" }} />}
              </div>
            </button>

            {expanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Sparkline data={hCharge} color={batteryColor(bat.charge)} label="Batería" unit="%" />
                <Sparkline data={hLoad} color={loadColor(out.loadPercent ?? 0)} label="Carga" unit="%" />
                {hInputV.length > 0 && <Sparkline data={hInputV} color="#3b82f6" label="V. entrada" unit="V" />}
                {hTemp.length > 0 && <Sparkline data={hTemp} color="#f97316" label="Temp." unit="°C" />}
              </div>
            )}
          </>
        )}

        {/* Unreachable */}
        {data && !data.reachable && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12, textAlign: "center" }}>
            <Plug className="w-6 h-6" style={{ color: "rgba(255,255,255,0.1)" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>No se pudo alcanzar la UPS</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>{data.error || `${displayIp} no responde`}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={poll} className="px-3 py-1 rounded text-[9px] font-bold cursor-pointer" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>Reintentar</button>
              {onConfigure && (
                <button onClick={onConfigure} className="px-3 py-1 rounded text-[9px] font-bold cursor-pointer" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>Configurar</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: "4px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.12)", fontFamily: "monospace" }}>{displayIp} · {transport}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {data?.cached && <span style={{ fontSize: 7, color: "rgba(255,255,255,0.1)", fontStyle: "italic" }}>cache</span>}
          {onConfigure && (
            <button onClick={onConfigure} className="cursor-pointer"
              style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3, color: "rgba(255,255,255,0.3)", fontSize: 8, fontWeight: 600, transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#f59e0b"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
              <Settings className="w-2 h-2" />Configurar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
