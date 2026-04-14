"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import Link from "next/link";

interface MetricsData {
  timestamp: string;
  cpu: { usage: number; cores: number; model: string; history: number[] };
  memory: { usedGb: number; totalGb: number; freeGb: number; usedPercent: number; processHeapMb: number; history: number[] };
  network: { rxBytesPerSec: number; txBytesPerSec: number; rxFormatted: string; txFormatted: string; history: { rx: number; tx: number }[] };
  disk: { totalGb: number; usedGb: number; freeGb: number; usedPercent: number };
  system: { uptimeSeconds: number; uptimeHuman: string; loadAverage: number[]; platform: string; hostname: string; nodeVersion: string; pid: number };
}

function Sparkline({ data, color, height = 40, max }: { data: number[]; color: string; height?: number; max?: number }) {
  if (data.length < 2) return null;
  const maxVal = max ?? Math.max(...data, 1);
  const w = 200;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - (v / maxVal) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${w},${height}`}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function GaugeRing({ percent, color, size = 80, label, value }: { percent: number; color: string; size?: number; label: string; value: string }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="text-center -mt-1">
        <div className="text-lg font-bold font-mono" style={{ color }}>{value}</div>
        <div className="text-[9px] text-[#555] uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function MetricCard({ title, children, icon }: { title: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[#555]">{icon}</div>
        <h3 className="text-[10px] text-[#555] font-bold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/metrics"));
      if (res.ok) setMetrics(await res.json());
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, 5000);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-3" style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] hover:text-[#ededed] active:scale-95 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            </Link>
            <div>
              <h1 className="text-sm font-bold">Métricas del Servidor</h1>
              <p className="text-[9px] text-[#555]">
                {metrics ? `${metrics.system.hostname} · Actualizado cada 5s` : "Cargando..."}
              </p>
            </div>
          </div>
          {metrics && (
            <div className="flex items-center gap-3 text-[10px] text-[#555]">
              <span>PID {metrics.system.pid}</span>
              <span>{metrics.system.nodeVersion}</span>
              <span>Uptime {metrics.system.uptimeHuman}</span>
            </div>
          )}
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
          </svg>
        </div>
      )}

      {metrics && (
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
          {/* Top gauges */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard title="CPU" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M20 15h2M9 2v2M9 20v2M2 9h2M20 9h2"/></svg>}>
              <div className="flex items-center justify-between">
                <GaugeRing
                  percent={metrics.cpu.usage}
                  color={metrics.cpu.usage > 80 ? "#ef4444" : metrics.cpu.usage > 50 ? "#f59e0b" : "#22c55e"}
                  value={`${metrics.cpu.usage}%`}
                  label="Uso"
                />
                <div className="text-right text-[10px] text-[#666] space-y-1">
                  <div>{metrics.cpu.cores} cores</div>
                  <div className="text-[9px] truncate max-w-[120px]">{metrics.cpu.model}</div>
                  <div>Load: {metrics.system.loadAverage.join(" / ")}</div>
                </div>
              </div>
              <div className="mt-3 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                <Sparkline data={metrics.cpu.history} color="#22c55e" max={100} />
              </div>
            </MetricCard>

            <MetricCard title="Memoria" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 19v-3m4 3v-3m4 3v-3m4 3v-3M4 5h16a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg>}>
              <div className="flex items-center justify-between">
                <GaugeRing
                  percent={metrics.memory.usedPercent}
                  color={metrics.memory.usedPercent > 85 ? "#ef4444" : metrics.memory.usedPercent > 60 ? "#f59e0b" : "#3b82f6"}
                  value={`${metrics.memory.usedPercent}%`}
                  label="Uso"
                />
                <div className="text-right text-[10px] text-[#666] space-y-1">
                  <div>{metrics.memory.usedGb} / {metrics.memory.totalGb} GB</div>
                  <div>Libre: {metrics.memory.freeGb} GB</div>
                  <div>Node heap: {metrics.memory.processHeapMb} MB</div>
                </div>
              </div>
              <div className="mt-3 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                <Sparkline data={metrics.memory.history} color="#3b82f6" max={100} />
              </div>
            </MetricCard>

            <MetricCard title="Red" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-[#555]">Download</div>
                    <div className="text-sm font-bold font-mono text-[#22c55e]">{metrics.network.rxFormatted}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#555]">Upload</div>
                    <div className="text-sm font-bold font-mono text-[#60a5fa]">{metrics.network.txFormatted}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                <Sparkline
                  data={metrics.network.history.map((h) => h.rx + h.tx)}
                  color="#a78bfa"
                />
              </div>
            </MetricCard>

            <MetricCard title="Disco" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>}>
              <div className="flex items-center justify-between">
                <GaugeRing
                  percent={metrics.disk.usedPercent}
                  color={metrics.disk.usedPercent > 90 ? "#ef4444" : metrics.disk.usedPercent > 70 ? "#f59e0b" : "#a78bfa"}
                  value={`${metrics.disk.usedPercent}%`}
                  label="Uso"
                />
                <div className="text-right text-[10px] text-[#666] space-y-1">
                  <div>{metrics.disk.usedGb} / {metrics.disk.totalGb} GB</div>
                  <div>Libre: {metrics.disk.freeGb} GB</div>
                  <div>{metrics.system.platform}</div>
                </div>
              </div>
              {/* Disk bar */}
              <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${metrics.disk.usedPercent}%`,
                    background: metrics.disk.usedPercent > 90 ? "#ef4444" : metrics.disk.usedPercent > 70 ? "#f59e0b" : "#a78bfa",
                  }}
                />
              </div>
            </MetricCard>
          </div>
        </div>
      )}
    </div>
  );
}
