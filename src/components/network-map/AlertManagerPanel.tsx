"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";

// ── Report data type (from EventReportModal) ─────────────────────
interface ReportData {
  monitor: { id: number; name: string; type: string; url: string; status: number; tags: { name: string; color: string }[] };
  period: { hours: number; from: string | null; to: string | null };
  stats: { totalChecks: number; upChecks: number; downChecks: number; uptimePercent: number; avgPing: number; maxPing: number; minPing: number };
  events: Array<{ time: string; status: number; prevStatus: number; msg: string; ping: number | null; duration: number }>;
  eventsByDay: Record<string, Array<{ time: string; status: number; prevStatus: number; msg: string }>>;
  downtimes: Array<{ start: string; end: string; durationMs: number; msg: string }>;
  totalDowntimeMs: number;
}

// ── Types ──────────────────────────────────────────────────────────
export interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  time: string;
  status: number;
  prevStatus: number;
  ping: number | null;
  msg: string;
}

interface AlertManagerPanelProps {
  open: boolean;
  onClose: () => void;
  sidebarWidth: number;
  onCountChange?: (count: number) => void;
  onEventClick?: (event: TimelineEvent) => void;
  /** Monitor IDs present on the current map — used to show "not on map" and filter */
  mapMonitorIds?: number[];
}

// ── Helpers ────────────────────────────────────────────────────────
const STATUS_MAP: Record<number, { label: string; color: string; bg: string; icon: string }> = {
  0: { label: "CAÍDO", color: "#ef4444", bg: "rgba(239,68,68,0.12)", icon: "▼" },
  1: { label: "ACTIVO", color: "#22c55e", bg: "rgba(34,197,94,0.10)", icon: "▲" },
  2: { label: "PENDIENTE", color: "#f59e0b", bg: "rgba(245,158,11,0.10)", icon: "●" },
  3: { label: "MANT.", color: "#6366f1", bg: "rgba(99,102,241,0.10)", icon: "◆" },
};

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `hace ${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d ${hrs % 24}h`;
}

function formatTime(date: Date): string {
  return date.toLocaleString("es-UY", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatFullDate(date: Date): string {
  return date.toLocaleString("es-UY", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 0) return "";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ${mins % 60}m`;
}

/** Compute downtime duration for each DOWN event.
 * Returns a Map from event key "monitorId-time" → duration in ms.
 * Duration = time between DOWN and next UP (status=1) for the same monitor.
 * If still down (no recovery found), returns -1 (ongoing). */
function computeDowntimes(events: TimelineEvent[]): Map<string, number> {
  const result = new Map<string, number>();
  // Events are sorted newest-first. For each DOWN event, scan forward (older) for the recovery.
  // Actually: recovery comes AFTER the down event in time → it's earlier in the array (newer).
  // So for each DOWN event at index i, scan backward (i-1, i-2...) for the same monitor with status=1.
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.status !== 0) continue;
    const downTime = new Date(ev.time).getTime();
    const key = `${ev.monitorId}-${ev.time}`;
    let recovered = false;
    // Search for next recovery event for this monitor (newer in time = earlier in array)
    for (let j = i - 1; j >= 0; j--) {
      const candidate = events[j];
      if (candidate.monitorId === ev.monitorId && candidate.status === 1) {
        const upTime = new Date(candidate.time).getTime();
        result.set(key, upTime - downTime);
        recovered = true;
        break;
      }
      // If we find another DOWN for the same monitor before a recovery, this DOWN was superseded
      if (candidate.monitorId === ev.monitorId && candidate.status === 0) {
        break;
      }
    }
    if (!recovered) {
      result.set(key, -1); // still down or no recovery in range
    }
  }
  return result;
}

// ── Event message interpreter ─────────────────────────────────────
function interpretEvent(ev: TimelineEvent): { translated: string; explanation: string; suggestion: string } {
  const msg = (ev.msg || "").trim();
  const isDown = ev.status === 0;
  const isUp = ev.status === 1;
  const isPending = ev.status === 2;

  // Common patterns
  if (/Connection failed/i.test(msg) || /connect ETIMEDOUT/i.test(msg)) {
    return {
      translated: "Fallo de conexión",
      explanation: isDown
        ? "El monitor no pudo establecer conexión con el host destino. El servicio o dispositivo no responde."
        : "Se restableció la conexión con el host destino.",
      suggestion: isDown
        ? "Verificar que el equipo esté encendido, comprobar conectividad de red y revisar firewall o reglas de acceso."
        : "La conexión fue restablecida. Monitorear estabilidad en las próximas horas.",
    };
  }
  if (/timeout/i.test(msg) && !/ETIMEDOUT/.test(msg)) {
    return {
      translated: "Tiempo de espera agotado",
      explanation: isDown
        ? "La solicitud al servicio excedió el tiempo máximo de espera sin obtener respuesta."
        : "El servicio respondió dentro del tiempo esperado nuevamente.",
      suggestion: isDown
        ? "Verificar carga del servidor, latencia de red, o posible congestión. Considerar aumentar el timeout si es un enlace lento."
        : "Servicio normalizado. Si el timeout fue recurrente, evaluar capacidad del enlace.",
    };
  }
  if (/certificate|ssl|tls/i.test(msg)) {
    return {
      translated: "Error de certificado SSL/TLS",
      explanation: "El certificado de seguridad del servicio presenta problemas (expirado, autofirmado, o dominio no coincide).",
      suggestion: "Revisar la fecha de expiración del certificado y renovarlo si es necesario. Verificar que el dominio coincida con el certificado.",
    };
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return {
      translated: "Conexión rechazada",
      explanation: "El host destino rechazó activamente la conexión. El puerto está cerrado o el servicio no está corriendo.",
      suggestion: "Verificar que el servicio esté ejecutándose en el puerto esperado. Revisar configuración del firewall.",
    };
  }
  if (/EHOSTUNREACH/i.test(msg)) {
    return {
      translated: "Host inalcanzable",
      explanation: "No se puede llegar al host destino. Puede haber un problema de ruteo o el equipo está desconectado de la red.",
      suggestion: "Verificar cableado, switches intermedios, y tablas de ruteo. Comprobar que el equipo esté en la red.",
    };
  }
  if (/ENETUNREACH/i.test(msg)) {
    return {
      translated: "Red inalcanzable",
      explanation: "La red destino no es accesible desde el punto de monitoreo.",
      suggestion: "Revisar rutas de red, enlaces WAN/VPN entre sitios, y estado de los routers intermedios.",
    };
  }
  if (/DNS/i.test(msg) || /ENOTFOUND/i.test(msg) || /getaddrinfo/i.test(msg)) {
    return {
      translated: "Error de resolución DNS",
      explanation: "No se pudo resolver el nombre de dominio a una dirección IP.",
      suggestion: "Verificar configuración DNS del servidor de monitoreo, comprobar que el registro DNS exista y esté actualizado.",
    };
  }
  if (/status code/i.test(msg)) {
    const code = msg.match(/(\d{3})/)?.[1];
    const codeNum = code ? parseInt(code) : 0;
    const codeLabel = codeNum >= 500 ? "Error del servidor" : codeNum >= 400 ? "Error del cliente" : `Código ${code}`;
    return {
      translated: `Respuesta HTTP ${code || "inválida"} — ${codeLabel}`,
      explanation: codeNum >= 500
        ? "El servidor respondió con un error interno. El servicio puede estar sobrecargado o con errores."
        : codeNum === 404
          ? "El recurso solicitado no fue encontrado en el servidor."
          : codeNum === 403
            ? "El acceso al recurso fue denegado por el servidor."
            : `El servidor respondió con código ${code}, indicando un estado no esperado.`,
      suggestion: codeNum >= 500
        ? "Revisar logs del servidor web, verificar estado de la aplicación y recursos disponibles (CPU, RAM, disco)."
        : "Verificar la URL monitoreada, permisos de acceso y configuración del servidor web.",
    };
  }
  if (/comparing/i.test(msg) && />=/.test(msg)) {
    return {
      translated: "Verificación de contador SNMP",
      explanation: "Se comparó el valor del contador SNMP con el umbral esperado. Esto es parte del monitoreo de tráfico de red.",
      suggestion: "Valor normal de operación del monitor SNMP. Los contadores se incrementan con el tráfico de la interfaz.",
    };
  }
  if (/ping/i.test(msg) || /packet loss/i.test(msg)) {
    return {
      translated: "Monitor de ping/latencia",
      explanation: isDown
        ? "El host no respondió al ping o presenta pérdida de paquetes significativa."
        : "El host respondió correctamente al ping.",
      suggestion: isDown
        ? "Verificar conectividad, posible congestión de red, o que el host tenga ICMP habilitado."
        : "Conectividad normal. Monitorear latencia para detectar tendencias.",
    };
  }

  // Generic fallback
  if (isDown) {
    return {
      translated: msg || "Servicio caído",
      explanation: "El monitor detectó que el servicio o dispositivo dejó de responder correctamente.",
      suggestion: "Revisar el estado del servicio, conectividad de red y logs del sistema.",
    };
  }
  if (isUp) {
    return {
      translated: msg || "Servicio restaurado",
      explanation: "El servicio o dispositivo volvió a responder correctamente después de una interrupción.",
      suggestion: "Servicio normalizado. Revisar causa raíz de la caída anterior para prevenir recurrencia.",
    };
  }
  if (isPending) {
    return {
      translated: msg || "Estado pendiente",
      explanation: "El monitor está en proceso de verificación o fue configurado recientemente.",
      suggestion: "Esperar a que el ciclo de monitoreo complete la verificación.",
    };
  }
  return {
    translated: msg || "Evento de monitoreo",
    explanation: "Se registró un cambio de estado en el monitor.",
    suggestion: "Revisar el historial del monitor para más contexto.",
  };
}

// ── Severity ──────────────────────────────────────────────────────
/** Classify downtime severity based on duration.
 * <5min = "leve" (transient, not a real failure)
 * >=5min = "grave" (real failure requiring attention)
 * ongoing = "grave" (still down) */
function getSeverity(downtimeMs: number | undefined): { level: "leve" | "grave" | "none"; label: string; color: string; bg: string } {
  if (downtimeMs == null) return { level: "none", label: "", color: "", bg: "" };
  if (downtimeMs === -1) return { level: "grave", label: "GRAVE", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (downtimeMs < 300000) return { level: "leve", label: "LEVE", color: "#f59e0b", bg: "rgba(245,158,11,0.10)" }; // <5min
  return { level: "grave", label: "GRAVE", color: "#ef4444", bg: "rgba(239,68,68,0.12)" }; // >=5min
}

// ── Constants ─────────────────────────────────────────────────────
const PAGE_SIZE = 50;
const POLL_INTERVAL = 30000;

const QUICK_RANGES = [
  { value: 1, label: "1h" },
  { value: 6, label: "6h" },
  { value: 24, label: "24h" },
  { value: 72, label: "3d" },
  { value: 168, label: "7d" },
  { value: 720, label: "30d" },
];

// ── Report helpers ────────────────────────────────────────────────
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

function exportReportExcel(data: ReportData, hours: number) {
  import("xlsx").then(XLSX => {
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
      evtRows.push([d.toLocaleDateString(), d.toLocaleTimeString(), evt.status === 0 ? "DOWN" : evt.status === 1 ? "UP" : "PENDING", evt.prevStatus === 0 ? "DOWN" : evt.prevStatus === 1 ? "UP" : "PENDING", evt.msg, evt.ping != null ? evt.ping : ("N/A" as any)]);
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
  });
}

function exportReportPDF(data: ReportData, hours: number) {
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
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;color:#333;padding:40px;background:#fff}.header{background:linear-gradient(135deg,#1e293b,#0f172a);color:white;padding:30px;border-radius:16px;margin-bottom:30px}.header h1{font-size:24px;font-weight:800;margin-bottom:4px}.header p{color:rgba(255,255,255,0.6);font-size:13px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}.stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center}.stat-value{font-size:28px;font-weight:800;margin-bottom:2px}.stat-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:600}.section{margin-bottom:24px}.section h2{font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f1f5f9;padding:10px 12px;text-align:left;font-weight:700;color:#475569;text-transform:uppercase;font-size:10px;letter-spacing:0.05em}td{padding:8px 12px;border-bottom:1px solid #f1f5f9}tr:hover td{background:#f8fafc}.footer{margin-top:30px;padding-top:16px;border-top:2px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between}@media print{body{padding:20px}.header{break-inside:avoid}}</style></head><body>
  <div class="header"><div style="display:flex;align-items:center;justify-content:space-between"><div><h1>${data.monitor.name}</h1><p>${data.monitor.type.toUpperCase()} — ${data.monitor.url}</p></div><div style="text-align:right"><div style="font-size:36px;font-weight:900;color:${uptimeColor}">${data.stats.uptimePercent}%</div><div style="font-size:11px;color:rgba(255,255,255,0.5)">UPTIME</div></div></div><div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);">Periodo: ${data.period.from ? new Date(data.period.from).toLocaleString() : "—"} → ${data.period.to ? new Date(data.period.to).toLocaleString() : "—"} (${hours}h)</div></div>
  <div class="stats"><div class="stat"><div class="stat-value" style="color:${uptimeColor}">${data.stats.uptimePercent}%</div><div class="stat-label">Disponibilidad</div></div><div class="stat"><div class="stat-value" style="color:#3b82f6">${data.stats.avgPing}ms</div><div class="stat-label">Ping Promedio</div></div><div class="stat"><div class="stat-value" style="color:#dc2626">${data.stats.downChecks}</div><div class="stat-label">Caidas</div></div><div class="stat"><div class="stat-value" style="color:#f59e0b">${formatDuration(data.totalDowntimeMs)}</div><div class="stat-label">Downtime Total</div></div></div>
  ${data.events.length > 0 ? `<div class="section"><h2>Eventos (${data.events.length})</h2><table><thead><tr><th>Fecha</th><th>Hora</th><th>Estado</th><th>Mensaje</th><th>Ping</th></tr></thead><tbody>${evtRows}</tbody></table></div>` : ""}
  ${data.downtimes.length > 0 ? `<div class="section"><h2>Periodos de Caida (${data.downtimes.length})</h2><table><thead><tr><th>Inicio</th><th>Fin</th><th>Duracion</th><th>Mensaje</th></tr></thead><tbody>${dtRows}</tbody></table></div>` : ""}
  <div class="footer"><span>KumaMap Network Monitoring</span><span>Generado: ${new Date().toLocaleString()}</span></div></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ── Event Detail Card ─────────────────────────────────────────────
function EventDetailCard({ event, onBack, onLocate, isOnMap, downtime, allEvents, downtimes, onSelectEvent, isAcknowledged, onAcknowledge }: {
  event: TimelineEvent;
  onBack: () => void;
  onLocate: () => void;
  isOnMap: boolean;
  downtime?: number; // ms, -1 = ongoing, undefined = not a down event
  allEvents: TimelineEvent[];
  downtimes: Map<string, number>;
  onSelectEvent: (ev: TimelineEvent) => void;
  isAcknowledged: boolean;
  onAcknowledge: () => void;
}) {
  const st = STATUS_MAP[event.status] || STATUS_MAP[2];
  const prevSt = STATUS_MAP[event.prevStatus] || STATUS_MAP[2];
  const date = new Date(event.time);

  // ── Report data for this monitor ──
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportHours, setReportHours] = useState(24);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    setReportLoading(true);
    fetch(apiUrl(`/api/kuma/report/${event.monitorId}?hours=${reportHours}`))
      .then(r => r.json())
      .then(d => { setReportData(d); setReportLoading(false); })
      .catch(() => setReportLoading(false));
  }, [event.monitorId, reportHours]);

  const uptimeColor = reportData ? getUptimeColor(reportData.stats.uptimePercent) : "#888";

  return (
    <div className="flex flex-col h-full" style={{ animation: "am-slideIn 0.2s ease-out" }}>
      {/* Back button */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/80 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          Volver
        </button>
      </div>

      {/* Event header with big status */}
      <div className="px-4 pb-3">
        <div
          className="rounded-xl p-4"
          style={{
            background: `linear-gradient(135deg, ${st.color}15, ${st.color}08)`,
            border: `1px solid ${st.color}30`,
          }}
        >
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-lg"
              style={{ background: `${st.color}20`, color: st.color }}
            >
              {st.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white/90 truncate">{event.monitorName}</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold" style={{ color: st.color }}>{st.label}</span>
                {!isOnMap && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    NO EN MAPA
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Transition */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ color: prevSt.color, background: prevSt.bg }}>
              {prevSt.icon} {prevSt.label}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/20">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
            <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ color: st.color, background: st.bg }}>
              {st.icon} {st.label}
            </span>
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5 text-[11px] text-white/50 font-mono mb-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            {formatFullDate(date)}
          </div>
          <div className="text-[10px] text-white/30 font-mono">{timeAgo(date)}</div>

          {/* Downtime duration + severity */}
          {downtime != null && (() => {
            const severity = getSeverity(downtime);
            return (
              <div
                className="flex items-center gap-2 mt-2 rounded-lg px-3 py-2"
                style={{
                  background: downtime === -1 ? "rgba(239,68,68,0.08)" : severity.level === "leve" ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${downtime === -1 ? "rgba(239,68,68,0.15)" : severity.level === "leve" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.15)"}`,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={severity.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold" style={{ color: severity.color }}>
                      {downtime === -1 ? "Caída en curso" : `Tiempo de caída: ${formatDuration(downtime)}`}
                    </span>
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: severity.bg, color: severity.color, border: `1px solid ${severity.color}33` }}>
                      {severity.label}
                    </span>
                  </div>
                  <div className="text-[9px] text-white/30">
                    {downtime === -1
                      ? "El sensor aún no se ha recuperado"
                      : severity.level === "leve"
                        ? "Interrupción breve (< 5 min) — probable fluctuación transitoria"
                        : "Interrupción significativa — requiere atención"}
                  </div>
                </div>
                {downtime === -1 && (
                  <div className="ml-auto h-2 w-2 rounded-full bg-red-500 shrink-0" style={{ animation: "am-pulse 1.5s ease-in-out infinite", boxShadow: "0 0 8px #ef4444" }} />
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Details */}
      <div className="px-4 flex flex-col gap-3 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>

        {/* ── Report stats (from EventReportModal) ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Disponibilidad</div>
            {/* Period selector chips */}
            <div className="flex gap-0.5">
              {[{ h: 24, l: "1d" }, { h: 72, l: "3d" }, { h: 168, l: "7d" }, { h: 720, l: "30d" }].map(p => (
                <button key={p.h} onClick={() => setReportHours(p.h)}
                  className="px-1.5 py-0.5 rounded text-[8px] font-bold transition-all"
                  style={{
                    background: reportHours === p.h ? `${uptimeColor}20` : "rgba(255,255,255,0.03)",
                    color: reportHours === p.h ? uptimeColor : "#444",
                    border: `1px solid ${reportHours === p.h ? `${uptimeColor}33` : "transparent"}`,
                  }}>{p.l}</button>
              ))}
            </div>
          </div>
          {reportLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: uptimeColor }} />
            </div>
          ) : reportData ? (
            <div className="space-y-2">
              {/* Uptime hero */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-black tracking-tight" style={{ color: uptimeColor }}>{reportData.stats.uptimePercent}%</span>
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: `${uptimeColor}88` }}>{getUptimeGrade(reportData.stats.uptimePercent)}</span>
              </div>
              {/* Mini uptime bar */}
              <div className="flex gap-[1px] w-full h-[12px] rounded-md overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                {Array.from({ length: 48 }, (_, i) => {
                  const slotMs = (reportHours * 3600000) / 48;
                  const slotStart = Date.now() - reportHours * 3600000 + i * slotMs;
                  const hasDown = reportData.events.some(e => {
                    const t = new Date(e.time).getTime();
                    return e.status === 0 && t >= slotStart && t < slotStart + slotMs;
                  });
                  return <div key={i} className="flex-1" style={{ background: hasDown ? "#ef4444" : "rgba(34,197,94,0.5)", borderRadius: i === 0 ? "3px 0 0 3px" : i === 47 ? "0 3px 3px 0" : "0" }} />;
                })}
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "Ping", value: `${reportData.stats.avgPing}ms`, color: "#60a5fa" },
                  { label: "Caídas", value: `${reportData.downtimes.length}`, color: reportData.downtimes.length > 0 ? "#ef4444" : "#22c55e" },
                  { label: "Downtime", value: formatDuration(reportData.totalDowntimeMs), color: reportData.totalDowntimeMs > 0 ? "#f59e0b" : "#22c55e" },
                  { label: "Checks", value: `${reportData.stats.totalChecks}`, color: "#8b5cf6" },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
                    <div className="text-[11px] font-black" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[7px] text-[#444] font-bold uppercase tracking-wider mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Interpreted event */}
        {(() => {
          const interp = interpretEvent(event);
          return (
            <>
              {/* Translated message */}
              <div>
                <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-1.5">Diagnóstico</div>
                <div
                  className="rounded-lg p-3"
                  style={{ background: `${st.color}08`, border: `1px solid ${st.color}18` }}
                >
                  <div className="text-[12px] font-bold mb-1.5" style={{ color: st.color }}>{interp.translated}</div>
                  <div className="text-[11px] text-white/55 leading-relaxed">{interp.explanation}</div>
                </div>
              </div>

              {/* Suggestion */}
              <div>
                <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-1.5">Acción sugerida</div>
                <div
                  className="rounded-lg p-3 flex gap-2.5"
                  style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                  </svg>
                  <div className="text-[11px] text-white/50 leading-relaxed">{interp.suggestion}</div>
                </div>
              </div>
            </>
          );
        })()}

        {/* Raw message */}
        {event.msg && (
          <div>
            <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-1">Mensaje original</div>
            <div
              className="rounded-lg p-3 text-[10px] text-white/35 leading-relaxed break-words font-mono"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              {event.msg}
            </div>
          </div>
        )}

        {/* Ping + Monitor ID row */}
        <div className="flex items-center gap-4">
          {event.ping != null && event.ping > 0 && (
            <div>
              <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-1">Latencia</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold font-mono text-white/80">{event.ping}</span>
                <span className="text-[10px] text-white/30">ms</span>
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-1">Monitor</div>
            <span className="text-[11px] font-mono text-white/50">#{event.monitorId}</span>
          </div>
        </div>

        {/* ── Vertical timeline of sensor events ── */}
        {(() => {
          const sensorEvents = allEvents
            .filter(e => e.monitorId === event.monitorId)
            .slice(0, 30); // limit to last 30 events
          if (sensorEvents.length <= 1) return null;
          return (
            <div>
              <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-2">
                Historial del sensor
                <span className="ml-1.5 text-white/15 normal-case">({sensorEvents.length} eventos)</span>
              </div>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                {sensorEvents.map((sev, idx) => {
                  const sevSt = STATUS_MAP[sev.status] || STATUS_MAP[2];
                  const sevDate = new Date(sev.time);
                  const isCurrent = sev.time === event.time && sev.status === event.status;
                  const sevKey = `${sev.monitorId}-${sev.time}`;
                  const sevDt = sev.status === 0 ? downtimes.get(sevKey) : undefined;
                  const severity = sevDt != null ? getSeverity(sevDt) : null;
                  return (
                    <div
                      key={`${sev.time}-${idx}`}
                      className={`relative flex items-start gap-2.5 py-1.5 pl-0 rounded-md transition-all ${isCurrent ? "" : "cursor-pointer hover:bg-white/[0.04]"}`}
                      onClick={() => { if (!isCurrent) onSelectEvent(sev); }}
                      style={{ opacity: isCurrent ? 1 : 0.7 }}
                    >
                      {/* Dot on the timeline */}
                      <div
                        className="relative shrink-0 mt-0.5 rounded-full z-10"
                        style={{
                          width: isCurrent ? 15 : 11,
                          height: isCurrent ? 15 : 11,
                          background: isCurrent ? sevSt.color : `${sevSt.color}88`,
                          boxShadow: isCurrent ? `0 0 10px ${sevSt.color}` : "none",
                          border: isCurrent ? `2px solid ${sevSt.color}` : "none",
                        }}
                      />
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: sevSt.color, background: sevSt.bg }}>
                            {sevSt.icon} {sevSt.label}
                          </span>
                          {severity && severity.level !== "none" && (
                            <span className="text-[7px] font-black px-1 py-px rounded" style={{ background: severity.bg, color: severity.color, border: `1px solid ${severity.color}33` }}>
                              {severity.label}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25">ACTUAL</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-mono text-white/40">
                            {sevDate.toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          {sevDt != null && sevDt > 0 && (
                            <span className="text-[8px] font-mono" style={{ color: severity?.color || "#f59e0b" }}>
                              {formatDuration(sevDt)}
                            </span>
                          )}
                          {sevDt === -1 && (
                            <span className="text-[8px] font-mono text-red-400">en curso</span>
                          )}
                        </div>
                        {sev.msg && (
                          <div className="text-[8px] text-white/20 truncate mt-0.5 max-w-[240px]">{sev.msg}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Action buttons at bottom */}
      <div className="px-4 py-3 border-t border-white/5 flex flex-col gap-2">
        <div className="flex gap-2">
          {isOnMap ? (
            <button
              onClick={onLocate}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[11px] font-semibold transition-all"
              style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h4" /><path d="M18 12h4" />
              </svg>
              Localizar
            </button>
          ) : (
            <div
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[11px] font-medium"
              style={{ background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              No en mapa
            </div>
          )}
        </div>
        {/* Acknowledge button */}
        {event.status === 0 && (
          <button
            onClick={onAcknowledge}
            disabled={isAcknowledged}
            className="flex items-center justify-center gap-2 h-9 rounded-lg text-[11px] font-semibold transition-all"
            style={isAcknowledged
              ? { background: "rgba(34,197,94,0.08)", color: "#4ade8088", border: "1px solid rgba(34,197,94,0.15)", cursor: "default" }
              : { background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }
            }
          >
            {isAcknowledged ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Alerta aceptada
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
                </svg>
                Aceptar alerta
              </>
            )}
          </button>
        )}
        {/* Export buttons */}
        {reportData && (
          <div className="flex gap-2">
            <button
              onClick={() => exportReportExcel(reportData, reportHours)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[10px] font-bold transition-all hover:brightness-125"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", color: "#4ade80" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Excel
            </button>
            <button
              onClick={() => exportReportPDF(reportData, reportHours)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[10px] font-bold transition-all hover:brightness-125"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", color: "#60a5fa" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              PDF / Imprimir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────
export default function AlertManagerPanel({ open, onClose, sidebarWidth, onCountChange, onEventClick, mapMonitorIds }: AlertManagerPanelProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(24);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterStatus, setFilterStatus] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [filterOnMap, setFilterOnMap] = useState(false);
  // Acknowledged alerts — persisted in sessionStorage to survive re-renders
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = sessionStorage.getItem("kumamap-ack-alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  // Date range filter
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Set of monitor IDs on the current map
  const mapMonitorSet = useMemo(() => new Set(mapMonitorIds || []), [mapMonitorIds]);

  // Close date picker on outside click
  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDatePicker]);

  // ── Fetch events ──
  const fetchHours = useMemo(() => {
    if (useCustomDates && dateFrom && dateTo) {
      const fromMs = new Date(dateFrom).getTime();
      const toMs = new Date(dateTo).getTime();
      return Math.max(1, Math.ceil((toMs - fromMs) / 3600000));
    }
    return hours;
  }, [useCustomDates, dateFrom, dateTo, hours]);

  const fetchEvents = useCallback(async (h: number) => {
    setLoading(true);
    try {
      let url = apiUrl(`/api/kuma/timeline?hours=${h}`);
      if (useCustomDates && dateFrom && dateTo) {
        url = apiUrl(`/api/kuma/timeline?hours=${h}&from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`);
      }
      const res = await fetch(url);
      const data = await res.json();
      let sorted: TimelineEvent[] = (data.events || []).sort(
        (a: TimelineEvent, b: TimelineEvent) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      // Client-side date filter for custom range
      if (useCustomDates && dateFrom && dateTo) {
        const fromMs = new Date(dateFrom).getTime();
        const toMs = new Date(dateTo).getTime();
        sorted = sorted.filter(e => {
          const t = new Date(e.time).getTime();
          return t >= fromMs && t <= toMs;
        });
      }
      setEvents(sorted);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, [useCustomDates, dateFrom, dateTo]);

  // ── Initial load + poll ──
  useEffect(() => {
    if (!open) return;
    fetchEvents(fetchHours);
    pollRef.current = setInterval(() => fetchEvents(fetchHours), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, fetchHours, fetchEvents]);

  // ── Acknowledge handler ──
  const handleAcknowledge = useCallback((key: string) => {
    setAcknowledgedKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      try { sessionStorage.setItem("kumamap-ack-alerts", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── Badge count (excludes acknowledged) ──
  useEffect(() => {
    const downCount = events.filter(e => e.status === 0 && !acknowledgedKeys.has(`${e.monitorId}-${e.time}`)).length;
    onCountChange?.(downCount);
  }, [events, onCountChange, acknowledgedKeys]);

  // ── Filter logic ──
  const filtered = events.filter(e => {
    if (filterStatus !== null && e.status !== filterStatus) return false;
    if (searchText && !e.monitorName.toLowerCase().includes(searchText.toLowerCase()) && !e.msg.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (filterOnMap && !mapMonitorSet.has(e.monitorId)) return false;
    return true;
  });

  const filteredLenRef = useRef(filtered.length);
  filteredLenRef.current = filtered.length;

  // Compute downtime durations for DOWN events
  const downtimes = useMemo(() => computeDowntimes(events), [events]);

  // Count how many are on map vs not
  const onMapCount = useMemo(() => filtered.filter(e => mapMonitorSet.has(e.monitorId)).length, [filtered, mapMonitorSet]);

  // ── Infinite scroll ──
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredLenRef.current));
    }
  }, []);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filterStatus, searchText, hours, useCustomDates, dateFrom, dateTo, filterOnMap]);

  const visible = filtered.slice(0, visibleCount);

  // ── Event handlers ──
  const handleEventSelect = useCallback((ev: TimelineEvent) => {
    setSelectedEvent(ev);
    // Only trigger map/TM interaction if the monitor is on the map
    if (mapMonitorSet.has(ev.monitorId)) {
      onEventClick?.(ev);
    }
  }, [onEventClick, mapMonitorSet]);

  const handleLocateFromDetail = useCallback(() => {
    if (selectedEvent && mapMonitorSet.has(selectedEvent.monitorId)) {
      onEventClick?.(selectedEvent);
    }
  }, [selectedEvent, onEventClick, mapMonitorSet]);

  const handleQuickRange = useCallback((h: number) => {
    setUseCustomDates(false);
    setHours(h);
    setShowDatePicker(false);
  }, []);

  const handleApplyCustomDates = useCallback(() => {
    if (dateFrom && dateTo) {
      setUseCustomDates(true);
      setShowDatePicker(false);
    }
  }, [dateFrom, dateTo]);

  // Clear detail when panel closes
  useEffect(() => { if (!open) setSelectedEvent(null); }, [open]);

  if (!open) return null;

  // ── Render detail card ──
  if (selectedEvent) {
    const selectedOnMap = mapMonitorSet.has(selectedEvent.monitorId);
    return (
      <div
        className="fixed top-0 bottom-0 flex flex-col"
        style={{
          right: 0, width: 380, zIndex: 9998,
          background: "rgba(8,8,12,0.96)",
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
        }}
      >
        <EventDetailCard
          event={selectedEvent}
          onBack={() => setSelectedEvent(null)}
          onLocate={handleLocateFromDetail}
          isOnMap={selectedOnMap}
          downtime={selectedEvent.status === 0 ? downtimes.get(`${selectedEvent.monitorId}-${selectedEvent.time}`) : undefined}
          allEvents={events}
          downtimes={downtimes}
          onSelectEvent={(ev) => {
            setSelectedEvent(ev);
            if (mapMonitorSet.has(ev.monitorId)) onEventClick?.(ev);
          }}
          isAcknowledged={acknowledgedKeys.has(`${selectedEvent.monitorId}-${selectedEvent.time}`)}
          onAcknowledge={() => handleAcknowledge(`${selectedEvent.monitorId}-${selectedEvent.time}`)}
        />
        <style>{`
          @keyframes am-spin { to { transform: rotate(360deg); } }
          @keyframes am-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes am-slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
          @keyframes am-fadeSlide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    );
  }

  // ── Render list view ──
  const activeRangeLabel = useCustomDates
    ? `${new Date(dateFrom).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })} – ${new Date(dateTo).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })}`
    : QUICK_RANGES.find(r => r.value === hours)?.label || `${hours}h`;

  return (
    <div
      className="fixed top-0 bottom-0 flex flex-col"
      style={{
        right: 0, width: 380, zIndex: 9998,
        background: "rgba(8,8,12,0.96)",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(24px)",
        transition: "right 0.3s ease",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span className="text-sm font-bold text-white/90">Alert Manager</span>
          <span className="text-[10px] text-white/30 font-mono ml-1">
            {filtered.length} eventos
          </span>
        </div>
        <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 transition-all">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="px-4 pb-2 flex flex-col gap-2">
        {/* Search */}
        <div className="relative">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar monitor o mensaje..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full h-7 pl-7 pr-2 rounded-md text-xs text-white/80 placeholder-white/25 outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        {/* Status chips + map filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { val: null, label: "Todos", color: "#888" },
            { val: 0, label: "Caídos", color: "#ef4444" },
            { val: 1, label: "Activos", color: "#22c55e" },
            { val: 2, label: "Pendiente", color: "#f59e0b" },
            { val: 3, label: "Mant.", color: "#6366f1" },
          ].map(chip => (
            <button
              key={String(chip.val)}
              onClick={() => setFilterStatus(chip.val)}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
              style={{
                background: filterStatus === chip.val ? chip.color + "22" : "rgba(255,255,255,0.04)",
                color: filterStatus === chip.val ? chip.color : "rgba(255,255,255,0.4)",
                border: `1px solid ${filterStatus === chip.val ? chip.color + "44" : "transparent"}`,
              }}
            >
              {chip.label}
            </button>
          ))}
          <div className="flex-1" />
          {/* Map filter toggle */}
          <button
            onClick={() => setFilterOnMap(v => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
            style={{
              background: filterOnMap ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
              color: filterOnMap ? "#60a5fa" : "rgba(255,255,255,0.35)",
              border: `1px solid ${filterOnMap ? "rgba(59,130,246,0.3)" : "transparent"}`,
            }}
            title={filterOnMap ? "Mostrando solo sensores del mapa" : "Mostrar solo sensores en este mapa"}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
            </svg>
            Mapa
            {filterOnMap && <span className="text-[8px] font-bold text-blue-300">{onMapCount}</span>}
          </button>
        </div>

        {/* Time range row: quick chips + date picker toggle */}
        <div className="flex items-center gap-1" ref={datePickerRef} style={{ position: "relative" }}>
          {QUICK_RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => handleQuickRange(r.value)}
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
              style={{
                background: !useCustomDates && hours === r.value ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
                color: !useCustomDates && hours === r.value ? "#a5b4fc" : "rgba(255,255,255,0.35)",
                border: `1px solid ${!useCustomDates && hours === r.value ? "rgba(99,102,241,0.3)" : "transparent"}`,
              }}
            >
              {r.label}
            </button>
          ))}
          <div className="flex-1" />
          {/* Calendar button */}
          <button
            onClick={() => setShowDatePicker(v => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all"
            style={{
              background: useCustomDates || showDatePicker ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
              color: useCustomDates || showDatePicker ? "#a5b4fc" : "rgba(255,255,255,0.35)",
              border: `1px solid ${useCustomDates || showDatePicker ? "rgba(99,102,241,0.3)" : "transparent"}`,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
            </svg>
            {useCustomDates ? activeRangeLabel : "Fechas"}
          </button>

          {/* Date picker popup */}
          {showDatePicker && (
            <div
              style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
                background: "linear-gradient(180deg, #1e1e2e 0%, #181825 100%)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, padding: 12, width: 260,
                boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                animation: "am-fadeSlide 0.15s ease-out",
              }}
            >
              <div className="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-2">Rango personalizado</div>
              <div className="flex flex-col gap-2 mb-3">
                <div>
                  <label className="text-[10px] text-white/30 mb-0.5 block">Desde</label>
                  <input
                    type="datetime-local"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full h-7 px-2 rounded text-[11px] text-white/80 outline-none"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      colorScheme: "dark",
                    }}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/30 mb-0.5 block">Hasta</label>
                  <input
                    type="datetime-local"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full h-7 px-2 rounded text-[11px] text-white/80 outline-none"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      colorScheme: "dark",
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setUseCustomDates(false); setShowDatePicker(false); }}
                  className="flex-1 h-7 rounded text-[10px] font-medium text-white/40 transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  Limpiar
                </button>
                <button
                  onClick={handleApplyCustomDates}
                  disabled={!dateFrom || !dateTo}
                  className="flex-1 h-7 rounded text-[10px] font-semibold transition-all"
                  style={{
                    background: dateFrom && dateTo ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                    color: dateFrom && dateTo ? "#a5b4fc" : "rgba(255,255,255,0.2)",
                    border: `1px solid ${dateFrom && dateTo ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mx-3 h-px bg-white/6" />

      {/* ── Event list (infinite scroll) ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
      >
        {loading && events.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 rounded-full border-2 border-white/10 border-t-blue-400" style={{ animation: "am-spin 0.8s linear infinite" }} />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/10">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="text-xs text-white/25">Sin eventos en este rango</span>
          </div>
        )}

        {visible.map((ev, i) => {
          const st = STATUS_MAP[ev.status] || STATUS_MAP[2];
          const prevSt = STATUS_MAP[ev.prevStatus] || STATUS_MAP[2];
          const date = new Date(ev.time);
          const isOnMap = mapMonitorSet.has(ev.monitorId);
          const evKey = `${ev.monitorId}-${ev.time}`;
          const isAck = acknowledgedKeys.has(evKey);
          return (
            <div
              key={`${ev.monitorId}-${ev.time}-${i}`}
              onClick={() => handleEventSelect(ev)}
              className="group rounded-lg px-3 py-2.5 mb-1 transition-all hover:bg-white/[0.06] cursor-pointer active:scale-[0.99]"
              style={{ borderLeft: `3px solid ${isAck ? "rgba(255,255,255,0.15)" : st.color}`, opacity: isAck ? 0.45 : isOnMap ? 1 : 0.55 }}
            >
              {/* Top row: monitor name + badges + time ago */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-white/85 truncate max-w-[180px]">
                    {ev.monitorName}
                  </span>
                  {isAck && (
                    <span
                      className="shrink-0 flex items-center gap-0.5 text-[7px] font-bold px-1 py-px rounded"
                      style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.15)" }}
                      title="Alerta aceptada"
                    >
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      ACK
                    </span>
                  )}
                  {!isOnMap && (
                    <span
                      className="shrink-0 text-[7px] font-bold px-1 py-px rounded"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}
                      title="Este sensor no está en el mapa actual"
                    >
                      NO EN MAPA
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-white/25 font-mono shrink-0 ml-2" title={formatTime(date)}>
                  {timeAgo(date)}
                </span>
              </div>

              {/* Status transition */}
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: prevSt.color, background: prevSt.bg }}
                >
                  {prevSt.icon} {prevSt.label}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/15">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: st.color, background: st.bg }}
                >
                  {st.icon} {st.label}
                </span>
                {ev.ping != null && ev.ping > 0 && (
                  <span className="text-[9px] text-white/20 font-mono ml-auto">{ev.ping}ms</span>
                )}
              </div>

              {/* Downtime duration + severity for DOWN events */}
              {ev.status === 0 && (() => {
                const key = `${ev.monitorId}-${ev.time}`;
                const dt = downtimes.get(key);
                if (dt == null) return null;
                const isOngoing = dt === -1;
                const severity = getSeverity(dt);
                return (
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={severity.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                    <span className="text-[9px] font-mono font-semibold" style={{ color: severity.color }}>
                      {isOngoing ? "Aún caído" : `Caída: ${formatDuration(dt)}`}
                    </span>
                    <span className="text-[7px] font-black px-1 py-px rounded" style={{ background: severity.bg, color: severity.color, border: `1px solid ${severity.color}33` }}>
                      {severity.label}
                    </span>
                    {isOngoing && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" style={{ animation: "am-spin 2s linear infinite", boxShadow: "0 0 6px #ef4444" }} />
                    )}
                  </div>
                );
              })()}

              {/* Message */}
              {ev.msg && (
                <div className="text-[10px] text-white/30 truncate leading-relaxed" title={ev.msg}>
                  {ev.msg}
                </div>
              )}

              {/* Exact time on hover */}
              <div className="text-[9px] text-white/15 font-mono mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(date)}
              </div>
            </div>
          );
        })}

        {visibleCount < filtered.length && (
          <div className="flex justify-center py-3">
            <div className="h-4 w-4 rounded-full border-2 border-white/10 border-t-white/30" style={{ animation: "am-spin 0.8s linear infinite" }} />
          </div>
        )}
      </div>

      {/* ── Footer summary ── */}
      <div className="px-4 py-2 flex items-center justify-between border-t border-white/5">
        <div className="flex items-center gap-3">
          {[0, 1].map(s => {
            const count = events.filter(e => e.status === s).length;
            const st = STATUS_MAP[s];
            return (
              <span key={s} className="flex items-center gap-1 text-[10px] font-mono" style={{ color: st.color + "99" }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                {count}
              </span>
            );
          })}
          {(() => {
            const ackCount = events.filter(e => e.status === 0 && acknowledgedKeys.has(`${e.monitorId}-${e.time}`)).length;
            return ackCount > 0 ? (
              <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "rgba(74,222,128,0.5)" }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {ackCount}
              </span>
            ) : null;
          })()}
          {mapMonitorSet.size > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "rgba(96,165,250,0.6)" }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              </svg>
              {onMapCount}
            </span>
          )}
        </div>
        <span className="text-[9px] text-white/15 font-mono">
          {loading ? "cargando..." : useCustomDates ? activeRangeLabel : `últimas ${hours}h`}
        </span>
      </div>

      <style>{`
        @keyframes am-spin { to { transform: rotate(360deg); } }
        @keyframes am-fadeSlide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes am-slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes am-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

// ── Standalone hook for badge count (respects acknowledged alerts) ──
export function useAlertCount(pollMs = 60000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(apiUrl("/api/kuma/timeline?hours=24"));
        const data = await res.json();
        if (!alive) return;
        // Read acknowledged keys from sessionStorage
        let ackSet = new Set<string>();
        try {
          const stored = sessionStorage.getItem("kumamap-ack-alerts");
          if (stored) ackSet = new Set(JSON.parse(stored));
        } catch {}
        const downEvents = (data.events || []).filter((e: any) => e.status === 0 && !ackSet.has(`${e.monitorId}-${e.time}`)).length;
        setCount(downEvents);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, pollMs);
    // Also listen for sessionStorage changes (when user acks inside the panel)
    const onStorage = () => poll();
    window.addEventListener("storage", onStorage);
    return () => { alive = false; clearInterval(id); window.removeEventListener("storage", onStorage); };
  }, [pollMs]);

  return count;
}
