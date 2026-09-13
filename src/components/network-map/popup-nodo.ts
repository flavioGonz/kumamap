/**
 * El HTML de los globos que abre un nodo del mapa (R2).
 *
 * Estaban dentro de `LeafletMapView.tsx`, que llegó a 6.165 líneas. Ese tamaño no
 * es un problema estético: es la razón por la que cada cambio del mapa se aplica
 * parchando por anclas de texto en vez de editando, y por la que nadie puede leer
 * una parte sin cargarse el resto en la cabeza.
 *
 * Estas dos funciones se llevaron primero porque son las de menor riesgo de todo
 * el archivo: no tocan Leaflet, no tienen hooks, y de las decenas de variables
 * del componente sólo necesitaban dos — el índice de monitores y la caché de
 * latencias. El resto del cuerpo se movió tal cual, sin reescribir una línea, y
 * en el componente quedaron dos envoltorios con la misma firma de antes para que
 * todos sus llamadores sigan sin enterarse.
 */
import { safeJsonParse, safeFetch } from "@/lib/error-handler";
import type { NodeCustomData, RackDeviceSummary } from "@/lib/types";
import { statusColors, getStatusColor as _getStatusColor, getMonitorData as _getMonitorData } from "@/utils/status";
import { buildSparkline } from "./map-utils";
import { apiUrl } from "@/lib/api";
import type { KumaMonitor } from "./MonitorPanel";

/** El índice id → monitor que el mapa ya mantiene en una ref. */
export type Indice = Map<number, KumaMonitor>;

/**
 * Lo único que el globo necesita de un nodo. Se declara acá, con la misma forma
 * que `SavedNode`, en vez de importarlo del componente: TypeScript compara por
 * estructura, así que encaja igual y no queda una dependencia circular.
 */
export interface NodoDePopup {
  id: string;
  kuma_monitor_id: number | null;
  label: string;
  icon: string;
  custom_data?: string | null;
}

export interface ContextoPopup {
  indice: Indice;
  /** Caché de latencias por monitor; el globo la lee y la va llenando. */
  historialPing: Map<number, number[]>;
}

/** El peor estado entre los equipos monitoreados de un rack. */
export function estadoDeRack(node: NodoDePopup, indice: Indice): {
  status: number; color: string; pulse: boolean; monitoredCount: number;
  totalDevices: number;
  deviceStatuses: Array<{ label: string; type: string; status: number; color: string; ping: number | null; uptime24: number | null; monitorId: number | null; ip: string }>;
} {
  const cd = safeJsonParse<NodeCustomData>(node.custom_data);
  const devices: RackDeviceSummary[] = cd.devices || [];
  const monitored = devices.filter((d) => d.monitorId);
  if (monitored.length === 0) {
    return { status: -1, color: "#6b7280", pulse: false, monitoredCount: 0, totalDevices: devices.length, deviceStatuses: [] };
  }
  const deviceStatuses = monitored.map((d) => {
    const m = _getMonitorData(d.monitorId!, indice);
    const isPaused = m ? !m.active : false;
    const s = isPaused ? -1 : (m?.status ?? 2);
    return { label: d.label || "Equipo", type: d.type || "other", status: s, color: isPaused ? "#6b7280" : (statusColors[s] || "#6b7280"), ping: m?.ping ?? null, uptime24: m?.uptime24 ?? null, monitorId: d.monitorId ?? null, ip: (d as any).managementIp || "" };
  });
  // Only consider active (non-paused) devices for worst-status calculation
  const activeDevices = deviceStatuses.filter(d => d.status >= 0);
  let worstStatus = 1;
  if (activeDevices.length === 0) {
    // All monitored devices are paused — return gray
    return { status: -1, color: "#6b7280", pulse: false, monitoredCount: monitored.length, totalDevices: devices.length, deviceStatuses };
  }
  if (activeDevices.some(d => d.status === 0)) worstStatus = 0;
  else if (activeDevices.some(d => d.status === 2)) worstStatus = 2;
  else if (activeDevices.some(d => d.status === 3)) worstStatus = 3;
  return {
    status: worstStatus,
    color: statusColors[worstStatus] || "#22c55e",
    pulse: worstStatus === 0 || worstStatus === 2,
    monitoredCount: monitored.length,
    totalDevices: devices.length,
    deviceStatuses,
  };
}

export function htmlDePopup(node: NodoDePopup, ctx: ContextoPopup): string {
  const { indice, historialPing } = ctx;
  const cd = safeJsonParse<NodeCustomData>(node.custom_data);

  // ── Rack popup — aggregated status from all device monitors ──────────────
  if (node.icon === "_rack" && cd.type === "rack") {
    const rack = estadoDeRack(node, indice);
    const upCount = rack.deviceStatuses.filter(d => d.status === 1).length;
    const downCount = rack.deviceStatuses.filter(d => d.status === 0).length;
    const pendCount = rack.deviceStatuses.filter(d => d.status === 2 || d.status === 3).length;
    const pausedCount = rack.deviceStatuses.filter(d => d.status === -1).length;
    const unmonitored = rack.totalDevices - rack.monitoredCount;
    const st = rack.status === -1 ? "PAUSADO" : rack.status === 0 ? "DOWN" : rack.status === 2 ? "PENDING" : rack.status === 3 ? "MAINT" : rack.monitoredCount > 0 ? "OK" : "SIN SENSOR";
    const col = rack.color;
    // Rack header color based on worst status
    const rackBg = rack.status === 0 ? "rgba(127,29,29,0.55)" : rack.status === 2 || rack.status === 3 ? "rgba(113,63,18,0.55)" : rack.status === -1 ? "rgba(55,65,81,0.55)" : "rgba(22,101,52,0.45)";
    const rackBorder = rack.status === 0 ? "rgba(239,68,68,0.3)" : rack.status === 2 || rack.status === 3 ? "rgba(245,158,11,0.3)" : rack.status === -1 ? "rgba(156,163,175,0.25)" : "rgba(34,197,94,0.25)";

    const rows = rack.deviceStatuses.map(d => {
      const stT = d.status === -1 ? "⏸" : d.status === 0 ? "DOWN" : d.status === 2 ? "PEND" : d.status === 3 ? "MAINT" : "UP";
      const pingT = d.ping != null ? `${d.ping}ms` : "";
      const clickable = d.monitorId != null;
      const onclick = clickable ? `onclick="window.__kumamap_showEventDetail(${d.monitorId}, '${d.label.replace(/'/g, "\\'")}')"` : "";
      const cursorStyle = clickable ? "cursor:pointer;" : "";
      const hoverBg = clickable ? "onmouseenter=\"this.style.background='rgba(255,255,255,0.05)'\" onmouseleave=\"this.style.background='transparent'\"" : "";
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.03);border-radius:6px;${cursorStyle}transition:background 0.15s;" ${onclick} ${hoverBg}>
        <div style="width:6px;height:6px;border-radius:50%;background:${d.color};box-shadow:0 0 6px ${d.color}88;flex-shrink:0;${d.status===0||d.status===2?"animation:sileo-pulse 1.5s ease-in-out infinite;":""}${d.status===-1?"opacity:0.4;":""}"></div>
        <div style="flex:1;overflow:hidden;">
          <div style="font-size:11px;color:rgba(255,255,255,0.75);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.label}</div>
          ${d.ip ? `<div style="font-size:9px;color:rgba(255,255,255,0.25);font-family:ui-monospace,monospace;">${d.ip}</div>` : ""}
        </div>
        <span style="font-size:9px;font-weight:700;color:${d.color};background:${d.color}18;padding:2px 6px;border-radius:5px;letter-spacing:0.03em;">${stT}</span>
        ${pingT ? `<span style="font-size:9px;color:rgba(255,255,255,0.3);font-family:ui-monospace,monospace;">${pingT}</span>` : ""}
      </div>`;
    }).join("");

    // Stat card helper
    const statCard = (val: number, label: string, c: string) =>
      `<div style="flex:1;background:${c}0c;border:1px solid ${c}25;border-radius:10px;padding:6px 8px;text-align:center;">
        <div style="font-size:16px;font-weight:800;color:${c};line-height:1;">${val}</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.3);font-weight:600;letter-spacing:0.06em;margin-top:2px;">${label}</div>
      </div>`;

    return `<div style="min-width:260px;max-width:320px;font-family:system-ui,-apple-system,sans-serif;">
      <!-- Rack header -->
      <div style="background:${rackBg};border-bottom:1px solid ${rackBorder};padding:14px 16px;display:flex;align-items:center;gap:10px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><circle cx="12" cy="18" r="1" fill="${col}"/></svg>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:#f0f0f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${node.label}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35);font-weight:500;margin-top:1px;">${rack.totalDevices} equipos · ${cd.totalUnits || 42}U</div>
        </div>
        <span style="font-size:10px;font-weight:800;color:${col};background:${col}20;padding:2px 8px;border-radius:6px;letter-spacing:0.06em;">${st}</span>
      </div>
      <!-- Body -->
      <div style="padding:10px 16px 14px;">
        ${rack.monitoredCount > 0 ? `
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          ${statCard(upCount, "UP", "#22c55e")}
          ${statCard(downCount, "DOWN", "#ef4444")}
          ${statCard(pendCount, "PEND", "#f59e0b")}
          ${pausedCount > 0 ? statCard(pausedCount, "PAUSA", "#6b7280") : ""}
        </div>
        <div style="max-height:150px;overflow-y:auto;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:10px;padding:2px 4px;">${rows}</div>` : ""}
        ${unmonitored > 0 ? `<div style="font-size:9px;color:rgba(255,255,255,0.2);margin-top:8px;text-align:center;">${unmonitored} equipos sin sensor</div>` : ""}
      </div>
    </div>`;
  }

  const m = _getMonitorData(node.kuma_monitor_id, indice);
  const color = _getStatusColor(node.kuma_monitor_id, indice);
  const statusText = m ? (!m.active ? "PAUSADO" : m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING") : "N/A";
  const isDown = m?.status === 0;
  const isPaused = m && !m.active;
  const isPending = m?.status === 2 || m?.status === 3;
  const mng: any = m && (m as any).type === "monitor-ng" ? (m as any).mng : null;
  const mngStatus = mng ? ((mng.stale || isPaused) ? "SIN REPORTE" : isDown ? "CRITICO" : isPending ? "ATENCION" : "ESTABLE") : null;
  let mngGrid = "";
  if (mng && Array.isArray(mng.metrics) && mng.metrics.length) {
    const MCOL: Record<string, string> = { ok: "#22c55e", warn: "#f59e0b", crit: "#ef4444" };
    const MTAG: Record<string, string> = { cpu: "CPU", mem: "MEM", dsk: "DSK", store: "IMG", raid: "RAID", pg: "PG", sys: "SYS", crash: "CRSH", svc: "SVC", net: "NET", temp: "TMP", log: "LOG" };
    const dim = mng.stale ? "opacity:0.45;filter:saturate(0.4);" : "";
    const chips = mng.metrics.map((mt: any) => {
      const c = MCOL[mt.state] || "#6b7280";
      const lbl = String(mt.label || mt.id).replace(/"/g, "&quot;");
      const val = String(mt.value ?? "");
      return `<div title="${lbl}" style="display:flex;flex-direction:column;align-items:center;gap:2px;background:${c}14;border:1px solid ${c}33;border-radius:8px;padding:6px 2px;min-width:0;${dim}">` +
        `<span style="font-size:8.5px;font-weight:800;letter-spacing:0.04em;color:${c};">${MTAG[mt.id] || String(mt.id).toUpperCase()}</span>` +
        `<span style="font-size:9.5px;font-weight:600;color:rgba(255,255,255,0.85);font-family:ui-monospace,monospace;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 3px;">${val}</span></div>`;
    }).join("");
    const bad = mng.metrics.filter((mt: any) => mt.state !== "ok").map((mt: any) => {
      const c = MCOL[mt.state] || "#6b7280";
      return `<div style="display:flex;gap:6px;align-items:center;padding:3px 0;"><span style="width:6px;height:6px;border-radius:50%;background:${c};flex-shrink:0;"></span>` +
        `<span style="font-size:10px;color:rgba(255,255,255,0.55);">${mt.label || mt.id}:</span>` +
        `<span style="font-size:10px;font-weight:600;color:${c};font-family:ui-monospace,monospace;">${mt.value}</span></div>`;
    }).join("");
    mngGrid = `<div style="margin-top:4px;">` +
      `<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0 7px;">` +
      `<span style="font-size:9px;font-weight:800;letter-spacing:0.09em;color:rgba(255,255,255,0.35);">SENSORES MONITOR-NG</span>` +
      `<span style="font-size:9px;font-weight:700;font-family:ui-monospace,monospace;"><span style="color:#22c55e;">${mng.ok} OK</span><span style="color:rgba(255,255,255,0.25);"> &middot; </span><span style="color:#f59e0b;">${mng.warn} ATEN</span><span style="color:rgba(255,255,255,0.25);"> &middot; </span><span style="color:#ef4444;">${mng.crit} CRIT</span></span></div>` +
      `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;">${chips}</div>` +
      (bad && !mng.stale ? `<div style="margin-top:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:5px 10px;">${bad}</div>` : "") +
      `<div style="margin-top:7px;font-size:9px;color:rgba(255,255,255,0.3);text-align:right;font-family:ui-monospace,monospace;">${mng.stale ? "SIN REPORTE &mdash; ultimo: " : "ultimo reporte: "}${mng.ts || "?"}</div></div>`;
  }

  // Sileo status colors
  const statusBg = isDown ? "rgba(127,29,29,0.55)" : isPaused ? "rgba(55,65,81,0.55)" : isPending ? "rgba(113,63,18,0.55)" : "rgba(22,101,52,0.45)";
  const statusBorder = isDown ? "rgba(239,68,68,0.3)" : isPaused ? "rgba(156,163,175,0.25)" : isPending ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.25)";
  const accentColor = isDown ? "#ef4444" : isPaused ? "#9ca3af" : isPending ? "#f59e0b" : "#22c55e";

  // Animated SVG status icon
  const statusSvg = isDown
    ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="50" stroke-dashoffset="50" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="50" to="0" dur="0.5s" fill="freeze"/></circle><circle cx="12" cy="12" r="4" fill="${accentColor}" opacity="0.2"><animate attributeName="r" values="4;8;4" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite"/></circle><line x1="15" y1="9" x2="9" y2="15" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-dasharray="8.5" stroke-dashoffset="8.5"><animate attributeName="stroke-dashoffset" from="8.5" to="0" dur="0.25s" begin="0.35s" fill="freeze"/></line><line x1="9" y1="9" x2="15" y2="15" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-dasharray="8.5" stroke-dashoffset="8.5"><animate attributeName="stroke-dashoffset" from="8.5" to="0" dur="0.25s" begin="0.5s" fill="freeze"/></line></svg>`
    : isPaused
    ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="${accentColor}" stroke-width="1.5" opacity="0.4"/><rect x="9" y="8" width="2.5" height="8" rx="0.8" fill="${accentColor}" opacity="0.7"/><rect x="12.5" y="8" width="2.5" height="8" rx="0.8" fill="${accentColor}" opacity="0.7"/></svg>`
    : isPending
    ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="50" stroke-dashoffset="50" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="50" to="0" dur="0.6s" fill="freeze"/></circle><circle cx="8" cy="12" r="1.2" fill="${accentColor}"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin="0s" repeatCount="indefinite"/></circle><circle cx="12" cy="12" r="1.2" fill="${accentColor}"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin="0.2s" repeatCount="indefinite"/></circle><circle cx="16" cy="12" r="1.2" fill="${accentColor}"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin="0.4s" repeatCount="indefinite"/></circle></svg>`
    : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="50" stroke-dashoffset="50" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="50" to="0" dur="0.5s" fill="freeze"/></circle><polyline points="8 12 11 15 16 9" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14" stroke-dashoffset="14"><animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.3s" begin="0.35s" fill="freeze"/></polyline></svg>`;

  // Get tag info for display
  const tagBadges = (m?.tags || []).map((t: any) =>
    `<span style="background:${t.color}18;border:1px solid ${t.color}30;color:${t.color};padding:2px 7px;border-radius:6px;font-size:9px;font-weight:600;letter-spacing:0.02em;">${t.name}</span>`
  ).join(" ");

  // Sparkline from history
  const history = node.kuma_monitor_id ? (historialPing.get(node.kuma_monitor_id) || []) : [];
  const sparkline = history.length >= 3 ? buildSparkline(history) : "";

  // Async fetch history (updates for next popup open)
  if (node.kuma_monitor_id) {
    safeFetch<{ ping: number | null }[]>(apiUrl(`/api/kuma/history/${node.kuma_monitor_id}`), undefined, "PingHistory").then(data => {
      if (!data) return;
      const pings = data.filter(h => h.ping != null).map(h => h.ping!).slice(-30);
      historialPing.set(node.kuma_monitor_id!, pings);
    });
  }

  // Metric row helper
  const row = (label: string, value: string, valueColor?: string) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <span style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:500;">${label}</span>
      <span style="font-size:11px;font-weight:600;color:${valueColor || "rgba(255,255,255,0.8)"};font-family:ui-monospace,monospace;">${value}</span>
    </div>`;

  return `
    <div style="min-width:260px;max-width:320px;font-family:system-ui,-apple-system,sans-serif;">
      <!-- Status header bar -->
      <div style="background:${statusBg};border-bottom:1px solid ${statusBorder};padding:14px 16px;display:flex;align-items:center;gap:10px;">
        <div style="flex-shrink:0;">${statusSvg}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:#f0f0f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.01em;">${node.label}</div>
          ${m?.type ? `<div style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:500;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">${m.type}</div>` : ""}
        </div>
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
          <span style="font-size:10px;font-weight:800;color:${accentColor};background:${accentColor}20;padding:2px 8px;border-radius:6px;letter-spacing:0.06em;">${mngStatus ?? statusText}</span>
          ${m?.ping != null ? `<span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);font-family:ui-monospace,monospace;">${m.ping}ms</span>` : ""}
        </div>
      </div>

      <!-- Body -->
      <div style="padding:10px 16px 14px;">
        ${tagBadges ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">${tagBadges}</div>` : ""}

        ${cd.ip || cd.mac ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
            ${cd.ip ? `<a href="http://${cd.ip}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;"><span style="display:inline-flex;align-items:center;gap:4px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#60a5fa;padding:3px 8px;border-radius:8px;font-family:ui-monospace,monospace;font-size:11px;font-weight:500;cursor:pointer;transition:background 0.15s;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10A15 15 0 0 1 12 2z"/></svg>
              ${cd.ip}</span></a>` : ""}
            ${cd.mac ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);padding:3px 8px;border-radius:8px;font-family:ui-monospace,monospace;font-size:10px;font-weight:500;">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/></svg>
              ${cd.mac}</span>` : ""}
          </div>
        ` : ""}

        ${m && !mng ? `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:2px 12px;">
            ${m.ping != null ? row("Latencia", `${m.ping}ms`, m.ping > 100 ? "#f59e0b" : m.ping > 300 ? "#ef4444" : "#22c55e") : ""}
            ${m.uptime24 != null ? row("Uptime 24h", `${(m.uptime24 * 100).toFixed(2)}%`, m.uptime24 > 0.99 ? "#22c55e" : m.uptime24 > 0.95 ? "#f59e0b" : "#ef4444") : ""}
            ${m.msg && !mng ? row("Mensaje", `<span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom;">${m.msg}</span>`, "rgba(255,255,255,0.5)") : ""}
          </div>
        ` : !m ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px 12px;text-align:center;">
          <span style="font-size:11px;color:rgba(255,255,255,0.25);font-style:italic;">Nodo sin monitor asignado</span>
        </div>` : ``}

        ${mngGrid}
        ${sparkline}
      </div>
    </div>
  `;
}
