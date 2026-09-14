"use client";

import { useEffect, useState, useRef, memo } from "react";
import { apiUrl } from "@/lib/api";
import { safeFetch, safeJsonParse } from "@/lib/error-handler";
import type { SavedNode, NodeCustomData, RackDeviceSummary, KumaMonitor } from "@/lib/types";
import type { UpsResult } from "@/lib/ups";
import { statusColor as upsStatusColor, statusLabel as upsStatusLabel, batteryColor, loadColor, runtimeStr } from "@/lib/ups";

// ── Types ──

interface RackDeviceStatus {
  label: string;
  type: string;
  status: number;    // 1=up, 0=down, 2=pending, 3=maint, -1=paused
  color: string;
  ping: number | null;
  monitorId: number | null;
}

export interface KioskTooltipData {
  node: SavedNode;
  type: "rack" | "ups";
  rackDevices?: RackDeviceStatus[];
  rackTotalDevices?: number;
  upsData?: UpsResult | null;
}

const STATUS_COLORS: Record<number, string> = {
  [-1]: "#6b7280",
  0: "#ef4444",
  1: "#22c55e",
  2: "#f59e0b",
  3: "#a855f7",
};

// ── Rack Tooltip ──

function RackTooltipContent({ data }: { data: KioskTooltipData }) {
  const devices = data.rackDevices || [];
  const total = data.rackTotalDevices || devices.length;
  const monitored = devices.length;
  const upCount = devices.filter(d => d.status === 1).length;
  const downCount = devices.filter(d => d.status === 0).length;
  const pendCount = devices.filter(d => d.status === 2 || d.status === 3).length;
  const pausedCount = devices.filter(d => d.status === -1).length;
  const unmonitored = total - monitored;

  // Worst status for header color
  const worstStatus = downCount > 0 ? 0 : pendCount > 0 ? 2 : pausedCount === monitored ? -1 : 1;
  const headerColor = STATUS_COLORS[worstStatus] || "#22c55e";
  const statusText = worstStatus === 0 ? "DOWN" : worstStatus === 2 ? "PEND" : worstStatus === -1 ? "PAUSA" : monitored > 0 ? "OK" : "SIN SENSOR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
        borderBottom: `1px solid ${headerColor}20`,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={headerColor} strokeWidth="1.5" strokeLinecap="round">
          <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/>
          <line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>
          <circle cx="12" cy="18" r="1" fill={headerColor}/>
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.node.label}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500, marginTop: 1 }}>
            {total} equipos · {monitored} monitoreados
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 800, color: headerColor,
          background: `${headerColor}20`, padding: "3px 10px", borderRadius: 8,
          letterSpacing: "0.06em",
        }}>{statusText}</span>
      </div>

      {/* Stats row */}
      {monitored > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "12px 20px 8px" }}>
          <StatCard value={upCount} label="UP" color="#22c55e" />
          <StatCard value={downCount} label="DOWN" color="#ef4444" />
          {pendCount > 0 && <StatCard value={pendCount} label="PEND" color="#f59e0b" />}
          {pausedCount > 0 && <StatCard value={pausedCount} label="PAUSA" color="#6b7280" />}
        </div>
      )}

      {/* Device list */}
      {devices.length > 0 && (
        <div style={{
          maxHeight: 200, overflowY: "auto", margin: "4px 16px 14px",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 12, padding: "4px 6px",
        }}>
          {devices.map((d, i) => {
            const stText = d.status === -1 ? "⏸" : d.status === 0 ? "DOWN" : d.status === 2 ? "PEND" : d.status === 3 ? "MAINT" : "UP";
            const pingText = d.ping != null ? `${d.ping}ms` : "";
            return (
              <div key={d.monitorId ?? i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderBottom: i < devices.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                borderRadius: 8,
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%", background: d.color,
                  boxShadow: `0 0 6px ${d.color}88`, flexShrink: 0,
                  animation: d.status === 0 || d.status === 2 ? "kiosk-pulse 1.5s ease-in-out infinite" : "none",
                  opacity: d.status === -1 ? 0.4 : 1,
                }} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{
                    fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{d.label}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "ui-monospace, monospace", textTransform: "uppercase" }}>
                    {d.type}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: d.color,
                  background: `${d.color}18`, padding: "2px 7px", borderRadius: 6,
                  letterSpacing: "0.03em",
                }}>{stText}</span>
                {pingText && (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "ui-monospace, monospace" }}>{pingText}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unmonitored > 0 && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingBottom: 10 }}>
          {unmonitored} equipos sin sensor
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      flex: 1, background: `${color}0c`, border: `1px solid ${color}25`,
      borderRadius: 10, padding: "7px 10px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── UPS Tooltip ──

function UpsTooltipContent({ data }: { data: KioskTooltipData }) {
  const ups = data.upsData;

  if (!ups || !ups.reachable) {
    return (
      <div style={{ padding: "20px 24px", textAlign: "center" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" style={{ margin: "0 auto 8px" }}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0", marginBottom: 4 }}>{data.node.label}</div>
        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
          {ups?.error || "UPS no alcanzable"}
        </div>
      </div>
    );
  }

  const battery = ups.battery;
  const output = ups.output;
  const input = ups.input;
  const identity = ups.identity;

  const outStatus = output?.status || "unknown";
  const outColor = upsStatusColor(outStatus);
  const outLabel = upsStatusLabel(outStatus);
  const charge = battery?.charge ?? 0;
  const batColor = batteryColor(charge);
  const load = output?.loadPercent ?? 0;
  const ldColor = loadColor(load);
  const runtime = battery?.runtimeMinutes;
  const onBattery = outStatus === "onBattery";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
        borderBottom: `1px solid ${outColor}20`,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={outColor} strokeWidth="1.5" strokeLinecap="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.node.label}
          </div>
          {identity?.model && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 500, marginTop: 1 }}>
              {identity.model}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 800, color: outColor,
          background: `${outColor}20`, padding: "3px 10px", borderRadius: 8,
          letterSpacing: "0.06em",
        }}>{outLabel.toUpperCase()}</span>
      </div>

      {/* Gauges row */}
      <div style={{ display: "flex", gap: 12, padding: "14px 20px 10px", justifyContent: "center" }}>
        {/* Battery gauge */}
        <GaugeCircle
          value={charge} max={100} label="Batería" unit="%"
          color={batColor} icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={batColor} strokeWidth="2" strokeLinecap="round">
              <rect x="6" y="4" width="12" height="18" rx="2"/><rect x="9" y="1" width="6" height="4" rx="1"/>
              <rect x="8" y={20 - Math.round(charge / 100 * 12)} width="8" height={Math.max(1, Math.round(charge / 100 * 12))} rx="1" fill={batColor} opacity="0.6"/>
            </svg>
          }
          pulse={onBattery}
        />
        {/* Load gauge */}
        <GaugeCircle
          value={load} max={100} label="Carga" unit="%"
          color={ldColor} icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ldColor} strokeWidth="2" strokeLinecap="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          }
        />
        {/* Runtime */}
        {runtime != null && (
          <GaugeCircle
            value={runtime} max={Math.max(runtime, 120)} label="Autonomía" unit="min"
            color={runtime < 10 ? "#ef4444" : runtime < 30 ? "#f59e0b" : "#22c55e"}
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={runtime < 10 ? "#ef4444" : "#22c55e"} strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            }
          />
        )}
      </div>

      {/* Metrics grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
        padding: "6px 20px 14px",
      }}>
        {input?.voltage != null && (
          <MetricPill label="Entrada" value={`${input.voltage}V`} sub={input.frequency ? `${input.frequency}Hz` : undefined} />
        )}
        {output?.voltage != null && (
          <MetricPill label="Salida" value={`${output.voltage}V`} sub={output.frequency ? `${output.frequency}Hz` : undefined} />
        )}
        {battery?.temperature != null && (
          <MetricPill label="Temp" value={`${battery.temperature}°C`} warn={battery.temperature > 40} />
        )}
        {output?.power != null && (
          <MetricPill label="Potencia" value={`${output.power}VA`} />
        )}
      </div>
    </div>
  );
}

function GaugeCircle({ value, max, label, unit, color, icon, pulse }: {
  value: number; max: number; label: string; unit: string; color: string;
  icon?: React.ReactNode; pulse?: boolean;
}) {
  const size = 68;
  const r = 25;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dashoff = circ * (1 - pct * 0.75);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={dashoff} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}>
          {pulse && <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />}
        </circle>
      </svg>
      <div style={{
        position: "relative", marginTop: -size + 8, width: size, height: size - 8,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1, fontFamily: "ui-monospace, monospace" }}>
          {typeof value === "number" ? Math.round(value) : value}
        </div>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontWeight: 600, marginTop: 1 }}>{unit}</div>
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.04em", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function MetricPill({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 8, padding: "6px 10px",
    }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{
          fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace",
          color: warn ? "#ef4444" : "rgba(255,255,255,0.8)",
        }}>{value}</span>
        {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "ui-monospace, monospace" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Main Tooltip Wrapper ──

function KioskTourTooltip({ data, visible, anchorPos }: {
  data: KioskTooltipData | null;
  visible: boolean;
  anchorPos?: { x: number; y: number } | null;
}) {
  const [show, setShow] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (visible && data) {
      const t = setTimeout(() => setShow(true), 50);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [visible, data]);

  // Compute position above the node once tooltip is shown and we know its size
  useEffect(() => {
    if (!show || !anchorPos || !tooltipRef.current) {
      if (!anchorPos) setPos(null);
      return;
    }
    const rect = tooltipRef.current.getBoundingClientRect();
    const tooltipW = rect.width || 380;
    const tooltipH = rect.height || 260;
    const gap = 24; // px above the node icon

    let left = anchorPos.x - tooltipW / 2;
    let top = anchorPos.y - tooltipH - gap;

    // Clamp to viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left < 12) left = 12;
    if (left + tooltipW > vw - 12) left = vw - 12 - tooltipW;
    // If no room above, show below
    if (top < 12) top = anchorPos.y + gap + 30;
    if (top + tooltipH > vh - 12) top = vh - 12 - tooltipH;

    setPos({ left, top });
  }, [show, anchorPos]);

  if (!data) return null;

  // Determine positioning style
  const useAnchor = anchorPos != null && pos != null;

  return (
    <>
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes kiosk-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes kiosk-tooltip-anchor-in {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes kiosk-tooltip-anchor-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(16px) scale(0.95); }
        }
        @keyframes kiosk-tooltip-in {
          from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes kiosk-tooltip-out {
          from { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
          to   { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
        }
      `}</style>
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          ...(useAnchor
            ? { left: pos.left, top: pos.top }
            : { bottom: 32, left: "50%", transform: "translateX(-50%)" }),
          zIndex: 10002,
          minWidth: 320,
          maxWidth: 440,
          background: "rgba(10,10,10,0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          backdropFilter: "blur(24px)",
          boxShadow: "0 16px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset",
          fontFamily: "system-ui, -apple-system, sans-serif",
          overflow: "hidden",
          animation: show
            ? (useAnchor
                ? "kiosk-tooltip-anchor-in 0.35s cubic-bezier(0, 0, 0.2, 1) forwards"
                : "kiosk-tooltip-in 0.35s cubic-bezier(0, 0, 0.2, 1) forwards")
            : (useAnchor
                ? "kiosk-tooltip-anchor-out 0.25s cubic-bezier(0.4, 0, 1, 1) forwards"
                : "kiosk-tooltip-out 0.25s cubic-bezier(0.4, 0, 1, 1) forwards"),
          pointerEvents: "none",
        }}
      >
        {data.type === "rack" ? <RackTooltipContent data={data} /> : <UpsTooltipContent data={data} />}
      </div>
    </>
  );
}

export default memo(KioskTourTooltip);
