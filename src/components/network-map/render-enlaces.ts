/**
 * El dibujo de los enlaces sobre el mapa (R2).
 *
 * 441 lineas que salieron junto con el dibujo de nodos. Pinta las lineas segun el
 * estado de sus extremos, el trafico SNMP, las separaciones y los limites de
 * cobre.
 *
 * El cuerpo se movio sin tocar una linea. `renderNodes` viaja en el contexto por
 * la misma razon que `renderEdges` viaja en el suyo: se llaman entre si.
 */
import type React from "react";
import { toast } from "@/components/ui/SileoToast";
import { safeJsonParse, safeFetch } from "@/lib/error-handler";
import type { NodeCustomData, EdgeCustomData } from "@/lib/types";
import { apiUrl } from "@/lib/api";
import { statusColors, getStatusColor as _getStatusColor, getMonitorData as _getMonitorData } from "@/utils/status";
import { iconSvgPaths, getIconSvg, createMarkerIcon } from "@/utils/map-icons";
import { formatTraffic } from "@/utils/format";
import { measure, formatMeters } from "@/lib/measure";
import { SEPARATION_TYPES, separationStyle } from "@/lib/separation";
import { copperStyle, COPPER_MAX_M } from "@/lib/copper";
import { formatElapsed, formatSince, buildSparkline } from "./map-utils";
import type { KumaMonitor } from "./MonitorPanel";
import type { SavedNode, SavedEdge } from "./LeafletMapView";
import type { NodeEditConfig } from "./NodeEditModal";

export interface ContextoRenderEnlaces {
  mapRef: React.MutableRefObject<any>;
  nodesRef: React.MutableRefObject<SavedNode[]>;
  edgesRef: React.MutableRefObject<SavedEdge[]>;
  nodeByIdRef: React.MutableRefObject<Map<string, SavedNode>>;
  ctxHandledRef: React.MutableRefObject<boolean>;
  isLocked: boolean;
  isLockedRef: React.MutableRefObject<boolean>;
  setCtxMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; nodeId?: string; edgeId?: string; latlng?: [number, number] } | null>>;
  polylinesRef: React.MutableRefObject<Map<string, any>>;
  labelMarkersRef: React.MutableRefObject<Map<string, any>>;
  downtimeMarkersRef: React.MutableRefObject<Map<string, any>>;
  edgesByNodeRef: React.MutableRefObject<Map<string, SavedEdge[]>>;
  backgroundTypeRef: React.MutableRefObject<any>;
  scaleMPerUnitRef: React.MutableRefObject<number | null>;
  straightEdgesRef: React.MutableRefObject<boolean>;
  mikrotikDataRef: React.MutableRefObject<Map<string, { current: { rxBps: number; txBps: number } | null; history: { rxBps: number; txBps: number }[] }>>;
  findRealEndpoints: (edgeId: string, edge?: SavedEdge) => { srcStatus: number | undefined; tgtStatus: number | undefined };
  renderNodes: (L: any, map: any) => void;
  kumaMonitors: KumaMonitor[];
}

export function dibujarEnlaces(L: any, map: any, ctx: ContextoRenderEnlaces) {
  const {
    backgroundTypeRef, ctxHandledRef, downtimeMarkersRef, edgesByNodeRef, edgesRef,
    findRealEndpoints, isLocked, isLockedRef, kumaMonitors, labelMarkersRef, mapRef,
    mikrotikDataRef, nodeByIdRef, nodesRef, polylinesRef, renderNodes, scaleMPerUnitRef,
    setCtxMenu, straightEdgesRef,
  } = ctx;

  if (!map || !map.getContainer()) return;
  // Rebuild O(1) node index (in case renderEdges called without renderNodes)
  const nIdx = new Map<string, SavedNode>();
  nodesRef.current.forEach(n => nIdx.set(n.id, n));
  nodeByIdRef.current = nIdx;
  // Rebuild edge adjacency index: nodeId → edges touching that node
  const eAdj = new Map<string, SavedEdge[]>();
  edgesRef.current.forEach(e => {
    let arr = eAdj.get(e.source_node_id);
    if (!arr) { arr = []; eAdj.set(e.source_node_id, arr); }
    arr.push(e);
    let arr2 = eAdj.get(e.target_node_id);
    if (!arr2) { arr2 = []; eAdj.set(e.target_node_id, arr2); }
    arr2.push(e);
  });
  edgesByNodeRef.current = eAdj;
  polylinesRef.current.forEach((p) => { try { map.removeLayer(p); } catch {} });
  polylinesRef.current.clear();
  // Clear interface label markers
  labelMarkersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
  labelMarkersRef.current.clear();
  // Clear downtime counters (they'll be recreated by the interval)
  downtimeMarkersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
  downtimeMarkersRef.current.clear();

  edgesRef.current.forEach((edge) => {
    const srcNode = nodeByIdRef.current.get(edge.source_node_id);
    const tgtNode = nodeByIdRef.current.get(edge.target_node_id);
    if (!srcNode || !tgtNode) return;

    const cd = safeJsonParse<EdgeCustomData>(edge.custom_data);

    // Find real endpoints through waypoint chains (pass edge to avoid re-lookup)
    const { srcStatus, tgtStatus } = findRealEndpoints(edge.id, edge);
    const isFiber = cd.linkType === "fiber";
    const isWireless = cd.linkType === "wireless";
    const isVPN = cd.linkType === "vpn";
    const isSeparation = cd.linkType === "separation";
    const isCopper = cd.linkType === "copper";
    const sepStyle = isSeparation ? separationStyle(cd.sepType) : null;
    // Largo del enlace (distancia entre sus dos nodos) para medición y regla de cobre.
    let edgeMeters: number | null = null;
    try {
      const d = measure(map, [srcNode.x, srcNode.y], [tgtNode.x, tgtNode.y], backgroundTypeRef.current, scaleMPerUnitRef.current);
      edgeMeters = d.meters;
    } catch { edgeMeters = null; }
    const copper = isCopper ? copperStyle(edgeMeters) : null;
    const isDown = !isSeparation && (srcStatus === 0 || tgtStatus === 0);
    const isBothDown = !isSeparation && srcStatus === 0 && tgtStatus === 0;
    const isMaint = !isSeparation && (srcStatus === 3 || tgtStatus === 3) && !isDown;
    const isPending = !isSeparation && (srcStatus === 2 || tgtStatus === 2) && !isDown && !isMaint;

    let lineColor = sepStyle ? sepStyle.color : isBothDown ? "#991b1b" : isDown ? "#ef4444" : isMaint ? "#8b5cf6" : isPending ? "#f59e0b" : isVPN ? "#3b82f6" : isFiber ? "#3b82f6" : isWireless ? "#f97316" : "#22c55e";
    let dashArray = sepStyle ? sepStyle.dash : isDown ? "8,6" : isVPN ? "1,14" : isWireless ? "6,8" : undefined;
    let lineCap: "round" | "butt" | "square" | undefined = sepStyle ? "butt" : isVPN ? "round" : undefined;
    let lineWeight = sepStyle ? sepStyle.weight : isDown ? 4 : isVPN ? 5 : 3;
    const lineOpacity = isSeparation ? 0.9 : isBothDown ? 0.4 : isDown ? 0.9 : 0.9;

    // Alerta de cobre fuera de límite: remarca la línea (DOWN/MAINT/PENDING tienen prioridad).
    if (copper && copper.status !== "ok" && !isDown && !isMaint && !isPending && !isSeparation) {
      lineColor = copper.color;
      dashArray = copper.status === "alert" ? "10,6" : "5,7";
      lineWeight = Math.max(lineWeight, 4);
    }

    // Build line points — straight or bezier curve
    let linePoints: [number, number][];
    if (straightEdgesRef.current) {
      // Straight line
      linePoints = [[srcNode.x, srcNode.y], [tgtNode.x, tgtNode.y]];
    } else {
      // Bezier curve: add control point offset perpendicular to the line
      const dx = tgtNode.y - srcNode.y;
      const dy = tgtNode.x - srcNode.x;
      const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const curvature = 0.15;
      const cpLat = (srcNode.x + tgtNode.x) / 2 + (-dx / len) * len * curvature;
      const cpLng = (srcNode.y + tgtNode.y) / 2 + (dy / len) * len * curvature;
      const steps = 20;
      linePoints = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = (1 - t) * (1 - t) * srcNode.x + 2 * (1 - t) * t * cpLat + t * t * tgtNode.x;
        const lng = (1 - t) * (1 - t) * srcNode.y + 2 * (1 - t) * t * cpLng + t * t * tgtNode.y;
        linePoints.push([lat, lng]);
      }
    }

    const line = L.polyline(linePoints, {
      color: lineColor, weight: lineWeight, opacity: lineOpacity, dashArray,
      lineCap: lineCap || "round",
      smoothFactor: 1,
      className: isDown && !isBothDown ? "link-pulse" : isVPN ? "link-vpn" : undefined,
    });

    // ── Link click popup — shows full link details ──
    const statusLabel = (s: number | undefined) => s === -1 ? "⏸️ PAUSADO" : s === 0 ? "🔴 DOWN" : s === 1 ? "🟢 UP" : s === 2 ? "🟡 PENDING" : s === 3 ? "🟣 MAINT" : "⚪ N/A";
    const statusDot = (s: number | undefined) => s === -1 ? "#6b7280" : s === 0 ? "#ef4444" : s === 1 ? "#22c55e" : s === 2 ? "#f59e0b" : s === 3 ? "#8b5cf6" : "#666";
    const linkTypeLabel = isSeparation ? (sepStyle?.label || "Separación") : isFiber ? "Fibra óptica" : isWireless ? "Wireless" : isVPN ? "VPN" : "Cobre/UTP";
    const linkTypeIcon = isSeparation ? (cd.sepKind === "canalizacion" ? "🛢️" : "🧱") : isFiber ? "🔵" : isWireless ? "📡" : isVPN ? "🔒" : "🟠";

    const buildPopupHtml = () => {
      const srcName = srcNode.label || "?";
      const tgtName = tgtNode.label || "?";
      const rows: string[] = [];

      // Header
      rows.push(`<div style="font-size:12px;font-weight:800;color:#eee;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        ${linkTypeIcon} <span>${linkTypeLabel}</span>
        ${edge.label ? `<span style="font-size:9px;color:#888;font-weight:500;">— ${edge.label}</span>` : ""}
      </div>`);

      // Origin
      rows.push(`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="width:7px;height:7px;border-radius:50%;background:${statusDot(srcStatus)};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:10px;color:#999;font-weight:600;">ORIGEN</div>
          <div style="font-size:11px;color:#ddd;font-weight:700;">${srcName}</div>
          ${cd.sourceInterface ? `<div style="font-size:9px;color:#93c5fd;font-family:ui-monospace,monospace;">${cd.sourceInterface}</div>` : ""}
        </div>
        <span style="font-size:9px;color:#666;">${statusLabel(srcStatus)}</span>
      </div>`);

      // Destination
      rows.push(`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;">
        <div style="width:7px;height:7px;border-radius:50%;background:${statusDot(tgtStatus)};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:10px;color:#999;font-weight:600;">DESTINO</div>
          <div style="font-size:11px;color:#ddd;font-weight:700;">${tgtName}</div>
          ${cd.targetInterface ? `<div style="font-size:9px;color:#c4b5fd;font-family:ui-monospace,monospace;">${cd.targetInterface}</div>` : ""}
        </div>
        <span style="font-size:9px;color:#666;">${statusLabel(tgtStatus)}</span>
      </div>`);

      // Longitud del enlace + alerta de cobre (no bloqueante)
      if (edgeMeters != null) {
        const warn = !!(copper && copper.status !== "ok");
        rows.push(`<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 0 3px;border-top:1px solid rgba(255,255,255,0.06);margin-top:3px;">
          <span style="font-size:10px;color:#999;font-weight:600;">LONGITUD</span>
          <span style="font-size:12px;font-weight:800;color:${warn ? copper!.color : "#e5e7eb"};">${formatMeters(edgeMeters)}${warn ? " " + copper!.icon : ""}</span>
        </div>`);
        if (warn) {
          rows.push(`<div style="font-size:9px;color:${copper!.color};font-weight:700;padding-bottom:2px;">Cobre: ${copper!.label} — se permite igual</div>`);
        }
      } else if (isCopper) {
        rows.push(`<div style="font-size:9px;color:#9ca3af;padding:5px 0 2px;border-top:1px solid rgba(255,255,255,0.06);margin-top:3px;">Calibrá la escala del plano para medir el largo del cobre</div>`);
      }

      return `<div style="min-width:180px;max-width:260px;">${rows.join("")}</div>`;
    };

    // Click on visible line → open popup
    const openLinkPopup = (e: any) => {
      const popup = L.popup({ className: "leaflet-popup-dark", maxWidth: 280 })
        .setLatLng(e.latlng)
        .setContent(buildPopupHtml());
      popup.openOn(map);
    };
    line.on("click", openLinkPopup);

    // ── Trafico del enlace ────────────────────────────────────────────────
    // El calculo ya no se hace aca: lo devuelve /api/kuma/traffic con el tiempo
    // real entre lecturas y, si existe, el sentido contrario. Este bloque solo
    // dibuja. Area para la entrada, linea para la salida: es el lenguaje que
    // cualquiera que haya mirado un grafico de red reconoce de un vistazo.
    if (cd.snmpMonitorId && !cd.hideTraffic) {
      const snmpMon = kumaMonitors.find((m) => m.id === cd.snmpMonitorId);
      if (snmpMon) {
        const savedPos = cd.trafficLabelPos;
        const posLat = savedPos ? savedPos[0] : (srcNode.x + tgtNode.x) / 2;
        const posLng = savedPos ? savedPos[1] : (srcNode.y + tgtNode.y) / 2;

        const AZUL = "#3987e5";   // entrada  · par validado contra fondo oscuro
        const AQUA = "#199e70";   // salida
        const estado = !snmpMon.active ? "#8493a8" : snmpMon.status === 1 ? "#22c55e" : snmpMon.status === 0 ? "#ef4444" : "#f59e0b";

        const clave = `traf-${cd.snmpMonitorId}`;
        const cache: any = (window as any)[clave] || null;

        // Se refresca cuando llega un latido nuevo, o si nunca se pidio.
        if (!cache || cache.sello !== snmpMon.msg) {
          safeFetch<any>(apiUrl(`/api/kuma/traffic/${cd.snmpMonitorId}?minutos=60`), undefined, "Trafico")
            .then((d) => { if (d) (window as any)[clave] = { ...d, sello: snmpMon.msg || "" }; })
            .catch(() => {});
        }

        const ent = cache?.entrada || null;
        const sal = cache?.salida || null;
        const cap: number | null = cache?.capacidadBps ?? null;
        const ifaz = cache?.interfaz || null;

        const pico = Math.max(ent?.pico || 0, sal?.pico || 0);
        const techo = pico > 0 ? pico * 1.15 : 1;

        const W = 148, H = 34;
        const serieAPuntos = (s: any) => {
          const p: Array<{ t: number; bps: number }> = (s?.puntos || []).slice(-60);
          if (p.length < 2) return null;
          return p.map((v, i) => ({ x: (i / (p.length - 1)) * W, y: H - (v.bps / techo) * (H - 3), ...v }));
        };
        const pEnt = serieAPuntos(ent);
        const pSal = serieAPuntos(sal);
        const camino = (pts: any[] | null) => (pts ? pts.map((q, i) => `${i === 0 ? "M" : "L"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ") : "");

        // Bandas invisibles con <title>: dan el dato exacto de cada lectura al
        // pasar el mouse, sin agregar una capa de tooltip propia.
        let bandas = "";
        const base = pEnt || pSal;
        if (base && base.length > 1) {
          const ancho = W / base.length;
          bandas = base.map((q: any, i: number) => {
            const hora = new Date(q.t).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
            const a = pEnt?.[i] ? formatTraffic(pEnt[i].bps) : "—";
            const b = pSal?.[i] ? formatTraffic(pSal[i].bps) : "—";
            return `<rect x="${(q.x - ancho / 2).toFixed(1)}" y="0" width="${ancho.toFixed(1)}" height="${H}" fill="transparent"><title>${hora}  ▼ ${a}   ▲ ${b}</title></rect>`;
          }).join("");
        }

        const lineaCap = cap && pico > 0 && cap < techo
          ? `<line x1="0" y1="${(H - (cap / techo) * (H - 3)).toFixed(1)}" x2="${W}" y2="${(H - (cap / techo) * (H - 3)).toFixed(1)}" stroke="#8493a8" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>`
          : "";

        const grafico = (pEnt || pSal) ? `
          <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">
            <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="#ffffff" stroke-width="1" opacity="0.12"/>
            ${lineaCap}
            ${pEnt ? `<path d="${camino(pEnt)} L${W},${H} L0,${H} Z" fill="${AZUL}" opacity="0.22"/>
                      <path d="${camino(pEnt)}" fill="none" stroke="${AZUL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
            ${pSal ? `<path d="${camino(pSal)}" fill="none" stroke="${AQUA}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
            ${bandas}
          </svg>` : "";

        const fila = (color: string, flecha: string, etiqueta: string, s: any) => `
          <div style="display:flex;align-items:baseline;gap:5px;min-width:0">
            <span style="width:7px;height:7px;border-radius:2px;background:${color};flex:none;transform:translateY(-1px)"></span>
            <span style="font-size:9px;color:#93a3b8;letter-spacing:.04em">${flecha}</span>
            <span style="font-size:12.5px;font-weight:700;color:#e8eef7;font-variant-numeric:tabular-nums;white-space:nowrap"
                  title="${etiqueta}">${s?.actual != null ? formatTraffic(s.actual) : "—"}</span>
          </div>`;

        const pctCap = cap && pico > 0 ? Math.round((pico / cap) * 100) : null;
        const pie = pico > 0
          ? `pico ${formatTraffic(pico)}${pctCap != null ? ` · ${pctCap}% de ${formatTraffic(cap!)}` : ""}`
          : (cache?.aviso || "esperando lecturas");

        const titulo = ifaz?.nombre
          ? `${ifaz.nombre}${ifaz.alias ? ` · ${ifaz.alias}` : ""}`
          : (snmpMon.name || "tráfico");

        const trafficLabel = L.marker([posLat, posLng], {
          // Siempre arrastrable: moverla no cambia la topologia, es una anotacion.
          draggable: true,
          icon: L.divIcon({
            className: "traffic-label",
            html: `<div style="
              background:rgba(8,12,20,0.93);
              border:1px solid rgba(255,255,255,0.10);
              border-radius:11px;
              padding:8px 10px 7px;
              min-width:166px;
              box-shadow:0 8px 26px rgba(0,0,0,0.62);
              backdrop-filter:blur(8px);
              font-family:ui-sans-serif,system-ui,sans-serif;
              cursor:grab;
            ">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="width:6px;height:6px;border-radius:99px;background:${estado};flex:none;
                             box-shadow:0 0 6px ${estado}"></span>
                <span style="font-size:10px;font-weight:600;color:#c4d0e0;letter-spacing:.02em;
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px"
                      title="${snmpMon.name || ""}">${titulo}</span>
              </div>
              <div style="display:flex;gap:12px;margin-bottom:5px">
                ${fila(AZUL, "▼", "entrada", ent)}
                ${sal ? fila(AQUA, "▲", "salida", sal) : ""}
              </div>
              ${grafico}
              <div style="margin-top:5px;font-size:9px;color:#7d8da0;letter-spacing:.02em;
                          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${pie}</div>
            </div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 14],
          }),
          interactive: true,
        });

        trafficLabel.on("dragstart", () => {
          const el = trafficLabel.getElement();
          if (el) { (el.firstElementChild as HTMLElement)?.style.setProperty("cursor", "grabbing");
                    el.style.opacity = "0.85"; }
        });

        trafficLabel.on("dragend", () => {
          const el = trafficLabel.getElement();
          if (el) { (el.firstElementChild as HTMLElement)?.style.setProperty("cursor", "grab");
                    el.style.opacity = "1"; }
          const pos = trafficLabel.getLatLng();
          const idx = edgesRef.current.findIndex((e) => e.id === edge.id);
          if (idx >= 0) {
            const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
            oldCd.trafficLabelPos = [pos.lat, pos.lng];
            edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
          }
        });

        trafficLabel.on("contextmenu", (e: any) => {
          e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation();
          ctxHandledRef.current = true;
          setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, edgeId: edge.id });
        });

        trafficLabel.addTo(map);
        labelMarkersRef.current.set(`${edge.id}-traffic`, trafficLabel);
      }
    }

    // MikroTik direct traffic widget - polls router REST API for live TX/RX
    if (cd.mikrotikTraffic && !cd.hideTraffic && !cd.snmpMonitorId) {
      const savedPos = cd.trafficLabelPos;
      const posLat = savedPos ? savedPos[0] : (srcNode.x + tgtNode.x) / 2;
      const posLng = savedPos ? savedPos[1] : (srcNode.y + tgtNode.y) / 2;

      const cached = mikrotikDataRef.current.get(edge.id);
      const rx = cached?.current?.rxBps ?? 0;
      const tx = cached?.current?.txBps ?? 0;
      const hasData = !!cached?.current;
      const color = hasData ? "#22c55e" : "#6b7280";

      const rxFmt = hasData ? formatTraffic(rx) : "...";
      const txFmt = hasData ? formatTraffic(tx) : "...";

      // Dual sparkline: TX (blue) + RX (green)
      let sparkSvg = "";
      if (cached && cached.history.length >= 2) {
        const pts = cached.history.slice(-30);
        const maxV = Math.max(...pts.map((p) => Math.max(p.rxBps, p.txBps)), 1);
        const w = 80, h = 28;
        const rxPath = pts.map((v, i) => {
          const x = (i / (pts.length - 1)) * w;
          const y = h - (v.rxBps / maxV) * (h - 4);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const txPath = pts.map((v, i) => {
          const x = (i / (pts.length - 1)) * w;
          const y = h - (v.txBps / maxV) * (h - 4);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        });
        sparkSvg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:2px">
          <path d="${rxPath.join(" ")}" fill="none" stroke="#22c55e" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
          <path d="${txPath.join(" ")}" fill="none" stroke="#3b82f6" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
        </svg>`;
      }

      const mtLabel = L.marker([posLat, posLng], {
        draggable: !isLocked,
        icon: L.divIcon({
          className: "traffic-label",
          html: `<div style="
            background:rgba(6,6,10,0.92);
            border:1px solid ${color}44;
            font-size:9px;font-weight:700;
            font-family:ui-monospace,monospace;
            padding:4px 8px;border-radius:8px;
            white-space:nowrap;
            box-shadow:0 4px 16px rgba(0,0,0,0.6), 0 0 12px ${color}15;
            cursor:${isLockedRef.current ? "default" : "grab"};
            min-width:80px;
          ">
            <div style="display:flex;align-items:center;gap:3px;color:#3b82f6;">
              <span style="font-size:7px;">▲</span>
              <span>TX ${txFmt}</span>
            </div>
            <div style="display:flex;align-items:center;gap:3px;color:#22c55e;">
              <span style="font-size:7px;">▼</span>
              <span>RX ${rxFmt}</span>
            </div>
            ${sparkSvg}
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 14],
        }),
        interactive: true,
      });

      mtLabel.on("dragend", () => {
        const pos = mtLabel.getLatLng();
        const idx = edgesRef.current.findIndex((e) => e.id === edge.id);
        if (idx >= 0) {
          const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
          oldCd.trafficLabelPos = [pos.lat, pos.lng];
          edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
        }
      });

      mtLabel.on("contextmenu", (e: any) => {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        ctxHandledRef.current = true;
        setCtxMenu({
          x: e.originalEvent.clientX,
          y: e.originalEvent.clientY,
          edgeId: edge.id,
        });
      });

      mtLabel.addTo(map);
      labelMarkersRef.current.set(`${edge.id}-traffic`, mtLabel);
    }

    // Invisible wider hit polyline for easier right-click on thin lines
    const hitLine = L.polyline(linePoints, {
      color: "transparent", weight: 16, opacity: 0, interactive: true,
    });
    hitLine.on("click", openLinkPopup);
    hitLine.on("contextmenu", (e: any) => {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      ctxHandledRef.current = true;
      setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, edgeId: edge.id });
    });
    hitLine.addTo(map);
    polylinesRef.current.set(`${edge.id}-hit`, hitLine);

    // Right-click on edge (visible line)
    line.on("contextmenu", (e: any) => {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      ctxHandledRef.current = true;
      setCtxMenu({
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        edgeId: edge.id,
      });
    });

    line.addTo(map);
    polylinesRef.current.set(edge.id, line);
  });
}
