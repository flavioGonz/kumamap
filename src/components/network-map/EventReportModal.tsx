"use client";

import { useState, useEffect } from "react";
import { X, Download, FileText, Clock, Activity, Shield, TrendingDown, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
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
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function EventReportModal({ monitorId, nodeLabel, onClose }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

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

    // Sheet 1: Resumen
    const summary = [
      ["REPORTE DE DISPONIBILIDAD"],
      [""],
      ["Monitor", data.monitor.name],
      ["Tipo", data.monitor.type.toUpperCase()],
      ["URL/Host", data.monitor.url],
      ["Periodo", `${hours} horas`],
      ["Desde", data.period.from ? new Date(data.period.from).toLocaleString() : "N/A"],
      ["Hasta", data.period.to ? new Date(data.period.to).toLocaleString() : "N/A"],
      [""],
      ["ESTADISTICAS"],
      ["Uptime", `${data.stats.uptimePercent}%`],
      ["Total chequeos", data.stats.totalChecks],
      ["Chequeos UP", data.stats.upChecks],
      ["Chequeos DOWN", data.stats.downChecks],
      ["Ping promedio", `${data.stats.avgPing}ms`],
      ["Ping maximo", `${data.stats.maxPing}ms`],
      ["Ping minimo", `${data.stats.minPing}ms`],
      ["Downtime total", formatDuration(data.totalDowntimeMs)],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1["!cols"] = [{ wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Resumen");

    // Sheet 2: Eventos
    const evtRows = [["Fecha", "Hora", "Estado", "Estado Anterior", "Mensaje", "Ping (ms)"]];
    for (const evt of data.events) {
      const d = new Date(evt.time);
      evtRows.push([
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        evt.status === 0 ? "DOWN" : evt.status === 1 ? "UP" : "PENDING",
        evt.prevStatus === 0 ? "DOWN" : evt.prevStatus === 1 ? "UP" : "PENDING",
        evt.msg,
        evt.ping != null ? `${evt.ping}` : "N/A",
      ]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(evtRows);
    ws2["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 35 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Eventos");

    // Sheet 3: Periodos de caida
    const dtRows = [["Inicio", "Fin", "Duracion", "Mensaje"]];
    for (const dt of data.downtimes) {
      dtRows.push([
        new Date(dt.start).toLocaleString(),
        new Date(dt.end).toLocaleString(),
        formatDuration(dt.durationMs),
        dt.msg,
      ]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(dtRows);
    ws3["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Caidas");

    XLSX.writeFile(wb, `Reporte_${data.monitor.name.replace(/[^a-zA-Z0-9]/g, "_")}_${hours}h.xlsx`);
  };

  const exportPDF = () => {
    if (!data) return;
    const w = window.open("", "_blank");
    if (!w) return;

    const uptimeColor = data.stats.uptimePercent >= 99 ? "#16a34a" : data.stats.uptimePercent >= 95 ? "#ca8a04" : "#dc2626";
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
      .badge { display:inline-block; padding:4px 14px; border-radius:20px; font-size:12px; font-weight:700; }
      .badge-up { background:#dcfce7; color:#16a34a; }
      .badge-down { background:#fee2e2; color:#dc2626; }
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
        <div>
          <h1>📊 ${data.monitor.name}</h1>
          <p>${data.monitor.type.toUpperCase()} — ${data.monitor.url}</p>
        </div>
        <div style="text-align:right">
          <div style="font-size:36px;font-weight:900;color:${uptimeColor}">${data.stats.uptimePercent}%</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5)">UPTIME</div>
        </div>
      </div>
      <div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);">
        Periodo: ${data.period.from ? new Date(data.period.from).toLocaleString() : "—"} → ${data.period.to ? new Date(data.period.to).toLocaleString() : "—"} (${hours}h)
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-value" style="color:${uptimeColor}">${data.stats.uptimePercent}%</div><div class="stat-label">Disponibilidad</div></div>
      <div class="stat"><div class="stat-value" style="color:#3b82f6">${data.stats.avgPing}ms</div><div class="stat-label">Ping Promedio</div></div>
      <div class="stat"><div class="stat-value" style="color:#dc2626">${data.stats.downChecks}</div><div class="stat-label">Caidas</div></div>
      <div class="stat"><div class="stat-value" style="color:#f59e0b">${formatDuration(data.totalDowntimeMs)}</div><div class="stat-label">Downtime Total</div></div>
    </div>
    ${data.events.length > 0 ? `<div class="section"><h2>⚡ Eventos (${data.events.length})</h2>
    <table><thead><tr><th>Fecha</th><th>Hora</th><th>Estado</th><th>Mensaje</th><th>Ping</th></tr></thead><tbody>${evtRows}</tbody></table></div>` : ""}
    ${data.downtimes.length > 0 ? `<div class="section"><h2>🔴 Periodos de Caida (${data.downtimes.length})</h2>
    <table><thead><tr><th>Inicio</th><th>Fin</th><th>Duracion</th><th>Mensaje</th></tr></thead><tbody>${dtRows}</tbody></table></div>` : ""}
    <div class="footer"><span>KumaMap Network Monitoring</span><span>Generado: ${new Date().toLocaleString()}</span></div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}>
      <div className="rounded-3xl overflow-hidden max-h-[90vh] flex flex-col" style={{ width: 520, background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.7)", animation: "failPopupIn 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #1e293b, #0f172a)", padding: "20px 24px" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(59,130,246,0.15)" }}>
                <Activity className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <div className="text-white text-lg font-black">{nodeLabel}</div>
                <div className="text-white/50 text-xs font-medium">{data?.monitor.type.toUpperCase()} — {data?.monitor.url}</div>
              </div>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><X className="h-5 w-5" /></button>
          </div>

          {/* Period selector */}
          <div className="flex gap-1.5 mt-4">
            {[6, 12, 24, 48, 72, 168, 720].map(h => (
              <button key={h} onClick={() => setHours(h)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all"
                style={{ background: hours === h ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${hours === h ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.08)"}`, color: hours === h ? "#60a5fa" : "#888" }}>
                {h < 24 ? `${h}h` : h < 168 ? `${h / 24}d` : "7d"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          ) : data ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Uptime", value: `${data.stats.uptimePercent}%`, color: data.stats.uptimePercent >= 99 ? "#22c55e" : data.stats.uptimePercent >= 95 ? "#f59e0b" : "#ef4444", icon: Shield },
                  { label: "Ping Avg", value: `${data.stats.avgPing}ms`, color: "#60a5fa", icon: Activity },
                  { label: "Caidas", value: `${data.downtimes.length}`, color: "#ef4444", icon: TrendingDown },
                  { label: "Downtime", value: formatDuration(data.totalDowntimeMs), color: "#f59e0b", icon: Clock },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div key={label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <Icon className="h-4 w-4 mx-auto mb-1" style={{ color }} />
                    <div className="text-lg font-black" style={{ color }}>{value}</div>
                    <div className="text-[8px] text-[#555] font-semibold uppercase tracking-wider">{label}</div>
                  </div>
                ))}
              </div>

              {/* Events list */}
              {data.events.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-[#888] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Eventos ({data.events.length})
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    {data.events.map((evt, i) => {
                      const d = new Date(evt.time);
                      const isDown = evt.status === 0;
                      const color = isDown ? "#ef4444" : "#22c55e";
                      return (
                        <div key={i} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-bold" style={{ color }}>{isDown ? "▼ DOWN" : "▲ UP"}</span>
                            {evt.msg && <span className="text-[9px] text-[#555] ml-2 truncate">{evt.msg}</span>}
                          </div>
                          <span className="text-[9px] font-mono text-[#555] shrink-0">{d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Downtimes */}
              {data.downtimes.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-[#888] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-red-400" /> Periodos de caida ({data.downtimes.length})
                  </div>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto rounded-xl" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)" }}>
                    {data.downtimes.map((dt, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: "1px solid rgba(239,68,68,0.05)" }}>
                        <div className="text-[10px] font-mono text-[#888] shrink-0">{new Date(dt.start).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                        <div className="text-[10px] text-[#555]">→</div>
                        <div className="text-[10px] font-mono text-[#888] shrink-0">{new Date(dt.end).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                        <div className="flex-1" />
                        <div className="text-[10px] font-bold text-red-400">{formatDuration(dt.durationMs)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.events.length === 0 && (
                <div className="flex flex-col items-center py-8 text-[#555]">
                  <CheckCircle className="h-10 w-10 mb-2 text-emerald-500/30" />
                  <div className="text-sm font-medium">Sin eventos en este periodo</div>
                  <div className="text-xs text-[#444]">El monitor estuvo estable</div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer: Export buttons */}
        <div className="flex gap-2 p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <button onClick={exportExcel} disabled={loading || !data}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-30"
            style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
            <Download className="h-4 w-4" /> Excel (.xlsx)
          </button>
          <button onClick={exportPDF} disabled={loading || !data}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-30"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
            <FileText className="h-4 w-4" /> PDF / Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
