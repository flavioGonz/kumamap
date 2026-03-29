"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X, Download, FileText, Clock, Activity, Shield,
  TrendingDown, AlertTriangle, CheckCircle, Wifi, WifiOff,
  ArrowUpRight, ArrowDownRight, Gauge, BarChart3,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

interface ReportData {
  monitor: { id: number; name: string; type: string; url: string; status: number; tags: { name: string; color: string }[] };
  period: { hours: number; from: string | null; to: string | null };
  stats: { totalChecks: number; upChecks: number; downChecks: number; uptimePercent: number; avgPing: number; maxPing: number; minPing: number };
  events: Array<{ time: string; status: number; prevStatus: number; msg: string; ping: number | null; duration: number }>;
  eventsByDay: Record<string, Array<{ time: string; status: number; prevStatus: number; msg: string }>>;
  downtimes: Array<{ start: string; end: string; durationMs: number; msg: string }>;
  totalDowntimeMs: number;
}

interface Props {
  monitorId: number;
  nodeLabel: string;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getUptimeColor(pct: number): string {
  if (pct >= 99.9) return "#22c55e";
  if (pct >= 99) return "#4ade80";
  if (pct >= 95) return "#f59e0b";
  if (pct >= 90) return "#f97316";
  return "#ef4444";
}

function getUptimeGrade(pct: number): string {
  if (pct >= 99.99) return "Excelente";
  if (pct >= 99.9) return "Muy bueno";
  if (pct >= 99) return "Bueno";
  if (pct >= 95) return "Aceptable";
  if (pct >= 90) return "Bajo";
  return "Critico";
}

// Mini uptime bar visualization
function UptimeBar({ events, hours }: { events: ReportData["events"]; hours: number }) {
  // Create 48 time slots
  const slots = 48;
  const slotMs = (hours * 3600000) / slots;
  const now = Date.now();
  const startMs = now - hours * 3600000;

  const slotStates = useMemo(() => {
    const states: ("up" | "down" | "empty")[] = Array(slots).fill("up");
    for (const evt of events) {
      const evtMs = new Date(evt.time).getTime();
      const idx = Math.floor((evtMs - startMs) / slotMs);
      if (idx >= 0 && idx < slots && evt.status === 0) {
        states[idx] = "down";
      }
    }
    return states;
  }, [events, hours]);

  return (
    <div className="flex gap-[1px] w-full h-[18px] rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
      {slotStates.map((s, i) => (
        <div
          key={i}
          className="flex-1 transition-all hover:opacity-80"
          style={{
            background: s === "down" ? "#ef4444" : s === "up" ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.05)",
            borderRadius: i === 0 ? "4px 0 0 4px" : i === slots - 1 ? "0 4px 4px 0" : "0",
          }}
        />
      ))}
    </div>
  );
}

export default function EventReportModal({ monitorId, nodeLabel, onClose }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [activeTab, setActiveTab] = useState<"overview" | "events" | "downtimes">("overview");

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl(`/api/kuma/report/${monitorId}?hours=${hours}`))
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [monitorId, hours]);

  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const summary = [
      ["REPORTE DE DISPONIBILIDAD"], [""],
      ["Monitor", data.monitor.name], ["Tipo", data.monitor.type.toUpperCase()],
      ["URL/Host", data.monitor.url], ["Periodo", `${hours} horas`],
      ["Desde", data.period.from ? new Date(data.period.from).toLocaleString() : "N/A"],
      ["Hasta", data.period.to ? new Date(data.period.to).toLocaleString() : "N/A"], [""],
      ["ESTADISTICAS"], ["Uptime", `${data.stats.uptimePercent}%`],
      ["Total chequeos", data.stats.totalChecks], ["Chequeos UP", data.stats.upChecks],
      ["Chequeos DOWN", data.stats.downChecks], ["Ping promedio", `${data.stats.avgPing}ms`],
      ["Ping maximo", `${data.stats.maxPing}ms`], ["Ping minimo", `${data.stats.minPing}ms`],
      ["Downtime total", formatDuration(data.totalDowntimeMs)],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1["!cols"] = [{ wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Resumen");
    const evtRows: (string | number)[][] = [["Fecha", "Hora", "Estado", "Estado Anterior", "Mensaje", "Ping (ms)"]];
    for (const evt of data.events) {
      const d = new Date(evt.time);
      evtRows.push([d.toLocaleDateString(), d.toLocaleTimeString(), evt.status === 0 ? "DOWN" : evt.status === 1 ? "UP" : "PENDING", evt.prevStatus === 0 ? "DOWN" : evt.prevStatus === 1 ? "UP" : "PENDING", evt.msg, evt.ping != null ? evt.ping : "N/A" as any]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(evtRows);
    ws2["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 35 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Eventos");
    const dtRows: string[][] = [["Inicio", "Fin", "Duracion", "Mensaje"]];
    for (const dt of data.downtimes) dtRows.push([new Date(dt.start).toLocaleString(), new Date(dt.end).toLocaleString(), formatDuration(dt.durationMs), dt.msg]);
    const ws3 = XLSX.utils.aoa_to_sheet(dtRows);
    ws3["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Caidas");
    XLSX.writeFile(wb, `Reporte_${data.monitor.name.replace(/[^a-zA-Z0-9]/g, "_")}_${hours}h.xlsx`);
  };

  const exportPDF = () => {
    if (!data) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const uptimeColor = getUptimeColor(data.stats.uptimePercent);
    const evtRows = data.events.map(e => {
      const d = new Date(e.time);
      const statusColor = e.status === 0 ? "#dc2626" : "#16a34a";
      return `<tr><td>${d.toLocaleDateString()}</td><td>${d.toLocaleTimeString()}</td><td style="color:${statusColor};font-weight:700">${e.status === 0 ? "▼ DOWN" : "▲ UP"}</td><td>${e.msg || ""}</td><td>${e.ping ?? "—"}</td></tr>`;
    }).join("");
    const dtRows = data.downtimes.map(d => `<tr><td>${new Date(d.start).toLocaleString()}</td><td>${new Date(d.end).toLocaleString()}</td><td style="font-weight:700;color:#dc2626">${formatDuration(d.durationMs)}</td><td>${d.msg || ""}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Reporte - ${data.monitor.name}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; color:#333; padding:40px; background:#fff; }
      .header { background:linear-gradient(135deg, #1e293b, #0f172a); color:white; padding:30px; border-radius:16px; margin-bottom:30px; }
      .header h1 { font-size:24px; font-weight:800; margin-bottom:4px; }
      .header p { color:rgba(255,255,255,0.6); font-size:13px; }
      .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
      .stat { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; }
      .stat-value { font-size:28px; font-weight:800; margin-bottom:2px; }
      .stat-label { font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; font-weight:600; }
      .section { margin-bottom:24px; }
      .section h2 { font-size:16px; font-weight:700; color:#1e293b; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th { background:#f1f5f9; padding:10px 12px; text-align:left; font-weight:700; color:#475569; text-transform:uppercase; font-size:10px; letter-spacing:0.05em; }
      td { padding:8px 12px; border-bottom:1px solid #f1f5f9; }
      tr:hover td { background:#f8fafc; }
      .footer { margin-top:30px; padding-top:16px; border-top:2px solid #e2e8f0; font-size:11px; color:#94a3b8; display:flex; justify-content:space-between; }
      @media print { body { padding:20px; } .header { break-inside:avoid; } }
    </style></head><body>
    <div class="header">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div><h1>${data.monitor.name}</h1><p>${data.monitor.type.toUpperCase()} — ${data.monitor.url}</p></div>
        <div style="text-align:right"><div style="font-size:36px;font-weight:900;color:${uptimeColor}">${data.stats.uptimePercent}%</div><div style="font-size:11px;color:rgba(255,255,255,0.5)">UPTIME</div></div>
      </div>
      <div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);">Periodo: ${data.period.from ? new Date(data.period.from).toLocaleString() : "—"} → ${data.period.to ? new Date(data.period.to).toLocaleString() : "—"} (${hours}h)</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-value" style="color:${uptimeColor}">${data.stats.uptimePercent}%</div><div class="stat-label">Disponibilidad</div></div>
      <div class="stat"><div class="stat-value" style="color:#3b82f6">${data.stats.avgPing}ms</div><div class="stat-label">Ping Promedio</div></div>
      <div class="stat"><div class="stat-value" style="color:#dc2626">${data.stats.downChecks}</div><div class="stat-label">Caidas</div></div>
      <div class="stat"><div class="stat-value" style="color:#f59e0b">${formatDuration(data.totalDowntimeMs)}</div><div class="stat-label">Downtime Total</div></div>
    </div>
    ${data.events.length > 0 ? `<div class="section"><h2>Eventos (${data.events.length})</h2><table><thead><tr><th>Fecha</th><th>Hora</th><th>Estado</th><th>Mensaje</th><th>Ping</th></tr></thead><tbody>${evtRows}</tbody></table></div>` : ""}
    ${data.downtimes.length > 0 ? `<div class="section"><h2>Periodos de Caida (${data.downtimes.length})</h2><table><thead><tr><th>Inicio</th><th>Fin</th><th>Duracion</th><th>Mensaje</th></tr></thead><tbody>${dtRows}</tbody></table></div>` : ""}
    <div class="footer"><span>KumaMap Network Monitoring</span><span>Generado: ${new Date().toLocaleString()}</span></div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const uptimeColor = data ? getUptimeColor(data.stats.uptimePercent) : "#888";
  const isCurrentlyUp = data?.monitor.status === 1;

  const periodLabels: Record<number, string> = { 6: "6h", 12: "12h", 24: "1d", 48: "2d", 72: "3d", 168: "7d", 720: "30d" };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
      onClick={onClose}>
      <div className="rounded-2xl overflow-hidden max-h-[90vh] flex flex-col" style={{
        width: 560,
        background: "rgba(14,14,14,0.98)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 32px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02)",
        animation: "failPopupIn 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}
        onClick={e => e.stopPropagation()}>

        {/* ─── Header ─── */}
        <div className="relative overflow-hidden" style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(10,15,30,0.98))" }}>
          {/* Subtle gradient accent line */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${uptimeColor}, ${uptimeColor}44, transparent)` }} />

          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Status indicator */}
                <div className="relative shrink-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${uptimeColor}18`, border: `1px solid ${uptimeColor}30` }}>
                    {isCurrentlyUp
                      ? <Wifi className="h-5 w-5" style={{ color: uptimeColor }} />
                      : <WifiOff className="h-5 w-5" style={{ color: uptimeColor }} />
                    }
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2" style={{ borderColor: "rgba(14,14,14,0.98)", background: isCurrentlyUp ? "#22c55e" : "#ef4444" }} />
                </div>
                <div className="min-w-0">
                  <div className="text-white text-base font-bold truncate">{nodeLabel}</div>
                  <div className="text-[11px] text-white/35 font-medium truncate mt-0.5">
                    {data?.monitor.type.toUpperCase()} — {data?.monitor.url}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="text-white/25 hover:text-white/70 transition-colors mt-0.5 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-1 mt-4">
              {[6, 12, 24, 48, 72, 168, 720].map(h => (
                <button key={h} onClick={() => setHours(h)}
                  className="rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all"
                  style={{
                    background: hours === h ? `${uptimeColor}20` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${hours === h ? `${uptimeColor}40` : "rgba(255,255,255,0.04)"}`,
                    color: hours === h ? uptimeColor : "#555",
                  }}>
                  {periodLabels[h]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Body ─── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-transparent" style={{ borderTopColor: uptimeColor }} />
                <span className="text-[10px] text-[#444] font-medium">Cargando reporte...</span>
              </div>
            </div>
          ) : data ? (
            <div className="p-5 space-y-4">
              {/* ── Uptime hero + bar ── */}
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tracking-tight" style={{ color: uptimeColor }}>{data.stats.uptimePercent}%</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${uptimeColor}88` }}>{getUptimeGrade(data.stats.uptimePercent)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" style={{ color: `${uptimeColor}66` }} />
                    <span className="text-[9px] text-[#444] font-bold uppercase">Disponibilidad</span>
                  </div>
                </div>
                <UptimeBar events={data.events} hours={hours} />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[8px] text-[#333] font-mono">
                    {data.period.from ? new Date(data.period.from).toLocaleDateString([], { day: "numeric", month: "short" }) : ""}
                  </span>
                  <span className="text-[8px] text-[#333] font-mono">Ahora</span>
                </div>
              </div>

              {/* ── Stats grid ── */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Ping Avg", value: `${data.stats.avgPing}ms`, color: "#60a5fa", icon: Gauge, sub: `${data.stats.minPing}–${data.stats.maxPing}ms` },
                  { label: "Caidas", value: `${data.downtimes.length}`, color: data.downtimes.length > 0 ? "#ef4444" : "#22c55e", icon: TrendingDown, sub: `${data.stats.downChecks} checks` },
                  { label: "Downtime", value: formatDuration(data.totalDowntimeMs), color: data.totalDowntimeMs > 0 ? "#f59e0b" : "#22c55e", icon: Clock, sub: `de ${hours}h` },
                  { label: "Checks", value: `${data.stats.totalChecks}`, color: "#8b5cf6", icon: BarChart3, sub: `${data.stats.upChecks} ok` },
                ].map(({ label, value, color, icon: Icon, sub }) => (
                  <div key={label} className="rounded-xl p-2.5 text-center group" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
                    <Icon className="h-3.5 w-3.5 mx-auto mb-1.5 opacity-40 group-hover:opacity-70 transition-opacity" style={{ color }} />
                    <div className="text-sm font-black" style={{ color }}>{value}</div>
                    <div className="text-[7px] text-[#444] font-bold uppercase tracking-wider mt-0.5">{label}</div>
                    {sub && <div className="text-[8px] text-[#333] mt-0.5">{sub}</div>}
                  </div>
                ))}
              </div>

              {/* ── Tabs ── */}
              <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                {([
                  { id: "overview" as const, label: "Resumen", count: null },
                  { id: "events" as const, label: "Eventos", count: data.events.length },
                  { id: "downtimes" as const, label: "Caidas", count: data.downtimes.length },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-bold transition-all"
                    style={{
                      background: activeTab === tab.id ? "rgba(255,255,255,0.06)" : "transparent",
                      color: activeTab === tab.id ? "#ccc" : "#444",
                    }}
                  >
                    {tab.label}
                    {tab.count !== null && tab.count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black"
                        style={{ background: tab.id === "downtimes" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)", color: tab.id === "downtimes" ? "#ef4444" : "#666" }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Tab content ── */}
              {activeTab === "overview" && (
                <div className="space-y-3">
                  {/* Tags */}
                  {data.monitor.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {data.monitor.tags.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md text-[9px] font-bold"
                          style={{ background: `${tag.color}18`, border: `1px solid ${tag.color}30`, color: tag.color }}>
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Recent events (max 5) */}
                  {data.events.length > 0 ? (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="px-3 py-2 flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <AlertTriangle className="h-3 w-3 text-amber-500/50" />
                        <span className="text-[9px] font-bold text-[#555] uppercase tracking-wider">Ultimos eventos</span>
                      </div>
                      {data.events.slice(0, 5).map((evt, i) => {
                        const d = new Date(evt.time);
                        const isDown = evt.status === 0;
                        return (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.015]" style={{ borderTop: "1px solid rgba(255,255,255,0.02)" }}>
                            <div className="shrink-0">
                              {isDown
                                ? <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                                : <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold" style={{ color: isDown ? "#ef4444" : "#22c55e" }}>
                                {isDown ? "DOWN" : "UP"}
                              </span>
                              {evt.msg && <span className="text-[9px] text-[#444] ml-2 truncate">{evt.msg}</span>}
                              {evt.ping != null && <span className="text-[9px] text-[#333] ml-1.5">{evt.ping}ms</span>}
                            </div>
                            <span className="text-[9px] font-mono text-[#444] shrink-0 tabular-nums">
                              {d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        );
                      })}
                      {data.events.length > 5 && (
                        <button onClick={() => setActiveTab("events")} className="w-full px-3 py-2 text-[9px] font-bold text-[#555] hover:text-[#888] transition-colors text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.02)" }}>
                          Ver todos ({data.events.length})
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 text-[#444]">
                      <CheckCircle className="h-8 w-8 mb-2 text-emerald-500/20" />
                      <div className="text-xs font-bold text-[#555]">Sin eventos en este periodo</div>
                      <div className="text-[10px] text-[#333] mt-0.5">El monitor estuvo estable</div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "events" && (
                <div className="rounded-xl overflow-hidden max-h-[280px] overflow-y-auto" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  {data.events.length > 0 ? data.events.map((evt, i) => {
                    const d = new Date(evt.time);
                    const isDown = evt.status === 0;
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.015]" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                        <div className="shrink-0">
                          {isDown
                            ? <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                            : <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold" style={{ color: isDown ? "#ef4444" : "#22c55e" }}>{isDown ? "DOWN" : "UP"}</span>
                          {evt.msg && <span className="text-[9px] text-[#444] ml-2">{evt.msg}</span>}
                          {evt.ping != null && <span className="text-[9px] text-[#333] ml-1.5">{evt.ping}ms</span>}
                        </div>
                        <span className="text-[9px] font-mono text-[#444] shrink-0 tabular-nums">
                          {d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  }) : (
                    <div className="py-8 text-center text-[10px] text-[#444]">Sin eventos</div>
                  )}
                </div>
              )}

              {activeTab === "downtimes" && (
                <div className="rounded-xl overflow-hidden max-h-[280px] overflow-y-auto" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                  {data.downtimes.length > 0 ? data.downtimes.map((dt, i) => (
                    <div key={i} className="px-3 py-2.5 transition-colors hover:bg-white/[0.015]" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          <span className="text-[10px] font-mono text-[#888] tabular-nums">
                            {new Date(dt.start).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] text-[#333]">→</span>
                          <span className="text-[10px] font-mono text-[#888] tabular-nums">
                            {new Date(dt.end).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-red-400 tabular-nums">{formatDuration(dt.durationMs)}</span>
                      </div>
                      {dt.msg && <div className="text-[9px] text-[#444] mt-1 ml-3.5 truncate">{dt.msg}</div>}
                    </div>
                  )) : (
                    <div className="py-8 text-center">
                      <CheckCircle className="h-6 w-6 mx-auto mb-1.5 text-emerald-500/20" />
                      <div className="text-[10px] text-[#555] font-bold">Sin caidas en este periodo</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* ─── Footer: Export ─── */}
        {data && (
          <div className="flex gap-2 p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
            <button onClick={exportExcel} disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-bold transition-all hover:brightness-125 disabled:opacity-30"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", color: "#4ade80" }}>
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button onClick={exportPDF} disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-bold transition-all hover:brightness-125 disabled:opacity-30"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", color: "#60a5fa" }}>
              <FileText className="h-3.5 w-3.5" /> PDF / Imprimir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
