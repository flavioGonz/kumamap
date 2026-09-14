/**
 * El dibujo de los nodos sobre el mapa (R2).
 *
 * 884 lineas: era la funcion mas grande del archivo. A diferencia de los menus y
 * los globos, esta si habla con Leaflet de punta a punta —crea marcadores, conos
 * de vision, manijas de arrastre, poligonos— y por eso se dejo para el final del
 * refactor, cuando el metodo ya estaba probado en las piezas de menor riesgo.
 *
 * El cuerpo se movio sin tocar una linea. Las 30 cosas del componente que usaba
 * por closure entran ahora por un parametro.
 *
 * `renderEdges` viaja en el contexto porque las dos se llaman entre si: al mover
 * un nodo hay que redibujar sus enlaces. En el componente las dos siguen siendo
 * funciones declaradas, asi que la referencia cruzada se resuelve igual que antes.
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

export interface ContextoRenderNodos {
  mapRef: React.MutableRefObject<any>;
  nodesRef: React.MutableRefObject<SavedNode[]>;
  edgesRef: React.MutableRefObject<SavedEdge[]>;
  nodeByIdRef: React.MutableRefObject<Map<string, SavedNode>>;
  ctxHandledRef: React.MutableRefObject<boolean>;
  isLocked: boolean;
  isLockedRef: React.MutableRefObject<boolean>;
  setCtxMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; nodeId?: string; edgeId?: string; latlng?: [number, number] } | null>>;
  markersRef: React.MutableRefObject<Map<string, any>>;
  fovLayersRef: React.MutableRefObject<Map<string, any>>;
  polygonLayersRef: React.MutableRefObject<Map<string, any>>;
  camHandlesRef: React.MutableRefObject<Map<string, any>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  createPopupContent: (node: SavedNode) => string;
  getRackStatus: (node: SavedNode) => { status: number; color: string; pulse: boolean; monitoredCount: number; totalDevices: number; deviceStatuses: any[] };
  renderEdges: (L: any, map: any) => void;
  /** Se pasa a si misma: el cuerpo se vuelve a llamar al mover o borrar un nodo. */
  renderNodes: (L: any, map: any) => void;
  getStatusColor: (monitorId: number | null) => string;
  getMonitorData: (monitorId: number | null) => KumaMonitor | undefined;
  pushUndo: () => void;
  isImageMode: boolean;
  linkSource: string | null;
  readonly?: boolean;
  onOpenMap?: (mapId: string) => void;
  MAX_STREAMS: number;
  setAntennaConfigNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setInputModalConfig: React.Dispatch<React.SetStateAction<NodeEditConfig>>;
  setInputModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setNodeMapModalNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setRackDrawerNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamConfigNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamViewers: React.Dispatch<React.SetStateAction<{ nodeId: string; mode: "tooltip" | "pip" }[]>>;
  setTooltipAnchor: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function dibujarNodos(L: any, map: any, ctx: ContextoRenderNodos) {
  const {
    MAX_STREAMS, camHandlesRef, containerRef, createPopupContent, ctxHandledRef, edgesRef,
    fovLayersRef, getRackStatus, isImageMode, isLocked, isLockedRef, linkSource, mapRef,
    markersRef, nodeByIdRef, nodesRef, onOpenMap, polygonLayersRef, pushUndo, readonly,
    renderEdges, setAntennaConfigNodeId, setCtxMenu, setInputModalConfig,
    setInputModalOpen, setNodeMapModalNodeId, setRackDrawerNodeId, setStreamConfigNodeId,
    setStreamViewers, setTooltipAnchor,
    renderNodes, getStatusColor, getMonitorData,
  } = ctx;

  if (!map || !map.getContainer()) return;
  // Rebuild O(1) node index
  const nIdx = new Map<string, SavedNode>();
  nodesRef.current.forEach(n => nIdx.set(n.id, n));
  nodeByIdRef.current = nIdx;
  markersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
  markersRef.current.clear();
  fovLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
  fovLayersRef.current.clear();
  camHandlesRef.current.forEach((h) => { try { map.removeLayer(h); } catch {} });
  camHandlesRef.current.clear();

  // Clear polygon layers
  polygonLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
  polygonLayersRef.current.clear();

  // Migrate legacy _submap nodes → regular server nodes with linkedMaps
  if (nodesRef.current.some(n => n.icon === "_submap")) {
    nodesRef.current = nodesRef.current.map(n => {
      if (n.icon !== "_submap") return n;
      const mcd = safeJsonParse<NodeCustomData>(n.custom_data);
      if (mcd.submapId && !(mcd.linkedMaps?.length)) {
        mcd.linkedMaps = [{ id: mcd.submapId, name: mcd.submapName || n.label || "Submap" }];
      }
      return { ...n, icon: "server", custom_data: JSON.stringify(mcd) };
    });
  }

  nodesRef.current.forEach((node) => {
    const isLabel = node.icon === "_textLabel";
    const isCamera = node.icon === "_camera";
    const isAntenna = node.icon === "_antenna";
    const isWaypoint = node.icon === "_waypoint";
    const isPolygon = node.icon === "_polygon";
    const isRack = node.icon === "_rack";
    const isTrafico = node.icon === "_traffic";
    const cd = safeJsonParse<NodeCustomData>(node.custom_data);
    let color = getStatusColor(node.kuma_monitor_id);
    const m = getMonitorData(node.kuma_monitor_id);
    let pulse = !isLabel && (m?.status === 0 || m?.status === 2) && m?.active !== false;
    // Rack nodes: aggregate color+pulse from all device monitors
    if (isRack) {
      const rackInfo = getRackStatus(node);
      if (rackInfo.monitoredCount > 0) { color = rackInfo.color; pulse = rackInfo.pulse; }
    }
    const nodeScale: number = cd.nodeSize || 1.0;


    // Render polygon zone
    if (isPolygon && cd.points && cd.points.length >= 3) {
      const polyColor = cd.color || "#3b82f6";
      const polyOpacity = cd.fillOpacity ?? 0.15;
      const poly = L.polygon(cd.points, {
        color: polyColor, fillColor: polyColor, fillOpacity: polyOpacity,
        weight: 2, opacity: 0.6,
      });
      poly.bindTooltip(node.label || "Zona", { sticky: true, className: "leaflet-label-dark" });
      poly.on("dblclick", () => {
        const newName = prompt("Nombre de la zona:", node.label || "Zona");
        if (newName?.trim()) {
          const idx = nodesRef.current.findIndex((n) => n.id === node.id);
          if (idx >= 0) {
            nodesRef.current[idx] = { ...nodesRef.current[idx], label: newName.trim() };
            renderNodes(L, map);
          }
        }
      });
      poly.on("contextmenu", (e: any) => {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        ctxHandledRef.current = true;
        setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, nodeId: node.id });
      });
      poly.addTo(map);
      polygonLayersRef.current.set(node.id, poly);
      return; // Don't render a marker for polygons
    }
    const isSource = linkSource === node.id;

    const rotation = cd.rotation || 0;
    const fov = cd.fov || 60;
    // In image mode (CRS.Simple) coords are pixels; geo default 0.002° ≈ 200m → scale to 200px
    const rawFovRange = cd.fovRange || (isImageMode ? 200 : 0.002);
    const fovRange = isImageMode && rawFovRange < 1 ? rawFovRange * 100000 : rawFovRange;

    let nodeIcon;
    if (isLabel) {
      const labelFontSize = cd.fontSize || 13;
      const labelColor = cd.color || "#ededed";
      const bgEnabled = cd.bgEnabled !== false;
      const labelRotation = cd.rotation || 0;
      nodeIcon = L.divIcon({
        className: "text-label-marker",
        html: `<span style="display:inline-block;transform:rotate(${labelRotation}deg);transform-origin:center center;color:${labelColor};font-size:${labelFontSize}px;font-weight:600;white-space:nowrap;text-shadow:0 1px 6px rgba(0,0,0,0.9),0 0 12px rgba(0,0,0,0.6);cursor:move;pointer-events:auto;user-select:none;${bgEnabled ? `background:rgba(0,0,0,0.45);padding:2px 8px;border-radius:6px;` : ""}">${node.label}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, Math.round(labelFontSize / 2)],
      });
    } else if (isWaypoint) {
      nodeIcon = L.divIcon({
        className: "waypoint-marker",
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${isSource ? "#60a5fa" : "rgba(255,255,255,0.25)"};border:2px solid ${isSource ? "#60a5fa" : "rgba(255,255,255,0.4)"};cursor:move;box-shadow:0 0 6px ${isSource ? "#60a5fa88" : "rgba(255,255,255,0.15)"};transition:all 0.15s;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
    } else if (isCamera) {
      const camSize = Math.round(22 * nodeScale);
      const camIcon = Math.round(12 * nodeScale);
      const camType = cd.cameraType;
      const typeBadge = camType === "lpr"
        ? `<span style="position:absolute;top:-6px;right:-8px;background:#06b6d4;color:#fff;font-size:7px;font-weight:900;padding:1px 3px;border-radius:3px;letter-spacing:0.5px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.5);">LPR</span>`
        : camType === "face"
        ? `<span style="position:absolute;top:-6px;right:-8px;background:#a855f7;color:#fff;font-size:7px;font-weight:900;padding:1px 3px;border-radius:3px;letter-spacing:0.5px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.5);">FACE</span>`
        : "";
      nodeIcon = L.divIcon({
        className: "camera-marker",
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;transform:rotate(${rotation}deg);">
          <div style="width:${camSize}px;height:${camSize}px;border-radius:4px;background:${color};border:2px solid ${isSource ? "#60a5fa" : color};box-shadow:0 0 12px ${color}88;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <svg width="${camIcon}" height="${camIcon}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
          </div>
          ${typeBadge}
        </div>`,
        iconSize: [camSize, camSize],
        iconAnchor: [camSize / 2, camSize / 2],
      });
    } else if (isAntenna) {
      // Antenna node — radio tower icon with type badge
      const antSize = Math.round(24 * nodeScale);
      const antIcon = Math.round(14 * nodeScale);
      const antType = cd.antennaType || "ptp";
      const typeBadge = antType === "ptp"
        ? `<span style="position:absolute;top:-6px;right:-8px;background:#f59e0b;color:#000;font-size:6px;font-weight:900;padding:1px 3px;border-radius:3px;letter-spacing:0.5px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.5);">PTP</span>`
        : antType === "ptmp"
        ? `<span style="position:absolute;top:-6px;right:-8px;background:#8b5cf6;color:#fff;font-size:6px;font-weight:900;padding:1px 3px;border-radius:3px;letter-spacing:0.5px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.5);">PTMP</span>`
        : antType === "sector"
        ? `<span style="position:absolute;top:-6px;right:-8px;background:#06b6d4;color:#fff;font-size:6px;font-weight:900;padding:1px 3px;border-radius:3px;letter-spacing:0.5px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.5);">SEC</span>`
        : "";
      const freqBadge = cd.frequency
        ? `<span style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;font-size:7px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;line-height:1;">${cd.frequency}</span>`
        : "";
      nodeIcon = L.divIcon({
        className: "antenna-marker",
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;transform:rotate(${rotation}deg);">
          <div style="width:${antSize}px;height:${antSize}px;border-radius:50%;background:${color};border:2px solid ${isSource ? "#60a5fa" : color};box-shadow:0 0 14px ${color}88, 0 0 6px ${color};cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <svg width="${antIcon}" height="${antIcon}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12 7 2"/><path d="m7 12 5-10"/><path d="m12 12 5-10"/><path d="m17 12 5-10"/><path d="M4.5 7h15"/><path d="M12 16v6"/></svg>
          </div>
          ${typeBadge}
          ${freqBadge}
        </div>`,
        iconSize: [antSize, antSize],
        iconAnchor: [antSize / 2, antSize / 2],
      });
    } else if (isTrafico) {
      // ── Ventana de trafico suelta ─────────────────────────────────────────
      // Es un nodo como cualquier otro: se arrastra, se guarda con el mapa y
      // sobrevive a recargar. La diferencia es que en vez de un icono dibuja el
      // grafico del sensor SNMP que tenga asignado. El monitor se elige con el
      // mismo modal de siempre (clic derecho -> Editar), y por eso no hace falta
      // inventar una pantalla nueva.
      const monTraf = node.kuma_monitor_id ? getMonitorData(node.kuma_monitor_id) : null;

      if (!node.kuma_monitor_id || !monTraf) {
        nodeIcon = L.divIcon({
          className: "traffic-node",
          html: `<div style="background:rgba(11,14,20,.95);border:1px dashed rgba(255,255,255,.22);
                   border-radius:11px;padding:10px 12px;min-width:186px;color:#93a3b8;
                   font-family:ui-sans-serif,system-ui,sans-serif;font-size:11.5px;line-height:1.5;
                   box-shadow:0 8px 24px rgba(0,0,0,.5)">
                   <div style="font-weight:600;color:#c8d4e4;margin-bottom:3px">Ventana de tráfico</div>
                   Sin sensor asignado. Clic derecho → Editar y elegí un monitor SNMP.
                 </div>`,
          iconSize: [200, 64], iconAnchor: [0, 0],
        });
      } else {
        const AZUL_T = "#3987e5", AQUA_T = "#199e70";
        const claveT = `traf-${node.kuma_monitor_id}`;
        const cacheT: any = (window as any)[claveT] || null;

        if (!cacheT || cacheT.sello !== monTraf.msg) {
          safeFetch<any>(apiUrl(`/api/kuma/traffic/${node.kuma_monitor_id}?minutos=60`), undefined, "TraficoNodo")
            .then((dd) => { if (dd) (window as any)[claveT] = { ...dd, sello: monTraf.msg || "", vivoBuf: (window as any)[claveT]?.vivoBuf }; })
            .catch(() => {});
        }

        let entT = cacheT?.entrada || null;
        let salT = cacheT?.salida || null;
        // Si hay lecturas en vivo (poll SNMP cada 3 s), dibujamos con esas; si no,
        // con el historial de Kuma.
        const vbuf: Array<{ t: number; e: number | null; s: number | null }> = cacheT?.vivoBuf || [];
        if (vbuf.length >= 2) {
          const serie = (k: "e" | "s") => {
            const puntos = vbuf.filter((x) => x[k] != null).map((x) => ({ t: x.t, bps: x[k] as number }));
            if (puntos.length < 2) return null;
            const vals = puntos.map((p) => p.bps);
            return { puntos, actual: vals[vals.length - 1], pico: Math.max(...vals), promedio: 0 };
          };
          entT = serie("e") || entT;
          salT = serie("s") || salT;
        }
        const capT: number | null = cacheT?.capacidadBps ?? null;
        const ifazT = cacheT?.interfaz || null;
        const picoT = Math.max(entT?.pico || 0, salT?.pico || 0);
        const techoT = picoT > 0 ? picoT * 1.15 : 1;

        const WT = 172, HT = 40;
        const puntosT = (s: any) => {
          const p: Array<{ t: number; bps: number }> = (s?.puntos || []).slice(-60);
          if (p.length < 2) return null;
          return p.map((v, i) => ({ x: (i / (p.length - 1)) * WT, y: HT - (v.bps / techoT) * (HT - 3), ...v }));
        };
        const pE = puntosT(entT), pS = puntosT(salT);
        const caminoT = (pts: any[] | null) =>
          pts ? pts.map((q, i) => `${i === 0 ? "M" : "L"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ") : "";

        let bandasT = "";
        const baseT = pE || pS;
        if (baseT && baseT.length > 1) {
          const anchoT = WT / baseT.length;
          bandasT = baseT.map((q: any, i: number) => {
            const hora = new Date(q.t).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
            const a = pE?.[i] ? formatTraffic(pE[i].bps) : "—";
            const b = pS?.[i] ? formatTraffic(pS[i].bps) : "—";
            return `<rect x="${(q.x - anchoT / 2).toFixed(1)}" y="0" width="${anchoT.toFixed(1)}" height="${HT}" fill="transparent"><title>${hora}  ▼ ${a}   ▲ ${b}</title></rect>`;
          }).join("");
        }

        const yCapT = capT && picoT > 0 && capT < techoT ? (HT - (capT / techoT) * (HT - 3)).toFixed(1) : null;
        const graficoT = (pE || pS) ? `
          <svg width="${WT}" height="${HT}" viewBox="0 0 ${WT} ${HT}" style="display:block;overflow:visible">
            <line x1="0" y1="${HT}" x2="${WT}" y2="${HT}" stroke="#ffffff" stroke-width="1" opacity=".12"/>
            ${yCapT ? `<line x1="0" y1="${yCapT}" x2="${WT}" y2="${yCapT}" stroke="#8493a8" stroke-width="1" stroke-dasharray="3 3" opacity=".5"/>` : ""}
            ${pE ? `<path d="${caminoT(pE)} L${WT},${HT} L0,${HT} Z" fill="${AZUL_T}" opacity=".22"/>
                    <path d="${caminoT(pE)}" fill="none" stroke="${AZUL_T}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
            ${pS ? `<path d="${caminoT(pS)}" fill="none" stroke="${AQUA_T}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
            ${bandasT}
          </svg>` : "";

        const filaT = (col: string, flecha: string, s: any) => `
          <div style="display:flex;align-items:baseline;gap:5px;min-width:0">
            <span style="width:7px;height:7px;border-radius:2px;background:${col};flex:none;transform:translateY(-1px)"></span>
            <span style="font-size:9px;color:#93a3b8;letter-spacing:.04em">${flecha}</span>
            <span style="font-size:13px;font-weight:700;color:#e8eef7;font-variant-numeric:tabular-nums;white-space:nowrap">${s?.actual != null ? formatTraffic(s.actual) : "—"}</span>
          </div>`;

        const pctT = capT && picoT > 0 ? Math.round((picoT / capT) * 100) : null;
        const pieT = picoT > 0
          ? `pico ${formatTraffic(picoT)}${pctT != null ? ` · ${pctT}% de ${formatTraffic(capT!)}` : ""}`
          : (cacheT?.aviso || "esperando lecturas");
        const tituloT = ifazT?.nombre
          ? `${ifazT.nombre}${ifazT.alias ? ` · ${ifazT.alias}` : ""}`
          : (node.label || monTraf.name || "tráfico");

        nodeIcon = L.divIcon({
          className: "traffic-node",
          html: `<div style="
              background:rgba(8,12,20,.94);
              border:1px solid ${color}44;
              border-radius:12px;
              padding:9px 11px 8px;
              min-width:194px;
              box-shadow:0 10px 28px rgba(0,0,0,.6);
              backdrop-filter:blur(8px);
              font-family:ui-sans-serif,system-ui,sans-serif;
              cursor:${isLocked ? "default" : "grab"};
            ">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="width:6px;height:6px;border-radius:99px;background:${color};flex:none;box-shadow:0 0 6px ${color}"></span>
                <span style="font-size:10.5px;font-weight:600;color:#c4d0e0;letter-spacing:.02em;
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:172px">${tituloT}</span>
              </div>
              <div style="display:flex;gap:12px;margin-bottom:5px">
                ${filaT(AZUL_T, "▼", entT)}
                ${salT ? filaT(AQUA_T, "▲", salT) : ""}
              </div>
              ${graficoT}
              <div style="margin-top:5px;font-size:9px;color:#7d8da0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:182px">${pieT}</div>
            </div>`,
          iconSize: [214, 160], iconAnchor: [0, 0],
        });
      }
    } else {
      const hasLinkedMap = Array.isArray(cd.linkedMaps) && cd.linkedMaps.length > 0;
      nodeIcon = createMarkerIcon(L, color, pulse, isSource, nodeScale, node.icon || "server", hasLinkedMap);
    }

    const marker = L.marker([node.x, node.y], {
      icon: nodeIcon,
      draggable: !isLocked && node.icon !== '_polygon',
    });

    // Camera FOV cone + interactive handles
    if (isCamera) {
      const fovColor = cd.fovColor || color;
      const fovOpacity = cd.fovOpacity ?? 0.18;
      const radConst = (Math.PI / 180);

      function buildFovPoints(cx: number, cy: number, rot: number, range: number, fovAngle: number): [number, number][] {
        const pts: [number, number][] = [[cx, cy]];
        const s = rot - fovAngle / 2;
        const e = rot + fovAngle / 2;
        for (let a = s; a <= e; a += 2) pts.push([cx + range * Math.cos(a * radConst), cy + range * Math.sin(a * radConst)]);
        pts.push([cx, cy]);
        return pts;
      }

      const fovPoly = L.polygon(buildFovPoints(node.x, node.y, rotation, fovRange, fov), {
        color: fovColor, fillColor: fovColor, fillOpacity: fovOpacity,
        weight: 1, opacity: Math.min(1, fovOpacity + 0.2), interactive: false,
      });
      fovPoly.addTo(map);
      fovLayersRef.current.set(node.id, fovPoly);

      // Apply SVG radial gradient: solid at camera origin → transparent at arc edge
      const applyFovGradient = () => {
        const path = (fovPoly as any)._path as SVGPathElement | undefined;
        if (!path) return;
        const svg = path.closest("svg");
        if (!svg) return;

        // Camera position in SVG/layer-point space
        const camPt = map.latLngToLayerPoint([node.x, node.y]);
        // Arc tip point (center of the arc) to calculate radius
        const arcTipLat = node.x + fovRange * Math.cos(rotation * radConst);
        const arcTipLng = node.y + fovRange * Math.sin(rotation * radConst);
        const arcPt = map.latLngToLayerPoint([arcTipLat, arcTipLng]);
        const radius = Math.sqrt(Math.pow(arcPt.x - camPt.x, 2) + Math.pow(arcPt.y - camPt.y, 2));

        // Ensure <defs> exists in the SVG
        let defs: Element | null = svg.querySelector("defs");
        if (!defs) {
          defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
          svg.insertBefore(defs, svg.firstChild);
        }

        const gradId = `fovGrad-${node.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const existing = defs!.querySelector(`#${gradId}`);
        if (existing) existing.remove();

        const grad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
        grad.setAttribute("id", gradId);
        grad.setAttribute("cx", String(camPt.x));
        grad.setAttribute("cy", String(camPt.y));
        grad.setAttribute("r", String(radius));
        grad.setAttribute("gradientUnits", "userSpaceOnUse");

        const solidOpacity = Math.min(1, fovOpacity * 6); // brighter at the origin
        const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", fovColor);
        stop1.setAttribute("stop-opacity", String(solidOpacity));

        const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop2.setAttribute("offset", "75%");
        stop2.setAttribute("stop-color", fovColor);
        stop2.setAttribute("stop-opacity", String(fovOpacity));

        const stop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop3.setAttribute("offset", "100%");
        stop3.setAttribute("stop-color", fovColor);
        stop3.setAttribute("stop-opacity", "0");

        grad.appendChild(stop1);
        grad.appendChild(stop2);
        grad.appendChild(stop3);
        defs!.appendChild(grad);

        path.setAttribute("fill", `url(#${gradId})`);
        path.setAttribute("fill-opacity", "1"); // gradient stops control opacity
        path.setAttribute("stroke", fovColor);
        path.setAttribute("stroke-opacity", String(Math.min(1, fovOpacity + 0.15)));
        path.setAttribute("stroke-width", "1");
      };

      // Apply after first paint; re-apply after every zoom (layer points change)
      requestAnimationFrame(applyFovGradient);
      map.on("zoomend", applyFovGradient);

      // ── Rotation handle (◎ at the edge of the cone center direction) ──
      const rotHandleLat = node.x + fovRange * 0.7 * Math.cos(rotation * radConst);
      const rotHandleLng = node.y + fovRange * 0.7 * Math.sin(rotation * radConst);
      const rotHandle = L.marker([rotHandleLat, rotHandleLng], {
        icon: L.divIcon({
          className: "cam-handle",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:rgba(59,130,246,0.8);border:2px solid #60a5fa;box-shadow:0 0 8px rgba(59,130,246,0.6);cursor:grab;"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        }),
        draggable: !isLocked,
      });
      rotHandle.bindTooltip("Rotar", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
      rotHandle.on("drag", () => {
        const hp = rotHandle.getLatLng();
        const mp = marker.getLatLng();
        const angle = Math.atan2(hp.lng - mp.lng, hp.lat - mp.lat) * (180 / Math.PI);
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
          ncd.rotation = Math.round(angle);
          nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
          fovPoly.setLatLngs(buildFovPoints(mp.lat, mp.lng, Math.round(angle), ncd.fovRange || fovRange, ncd.fov || fov));
          // Move range handle too
          const rh = camHandlesRef.current.get(node.id + "-range");
          if (rh) rh.setLatLng([mp.lat + (ncd.fovRange || fovRange) * Math.cos(Math.round(angle) * radConst), mp.lng + (ncd.fovRange || fovRange) * Math.sin(Math.round(angle) * radConst)]);
        }
      });
      rotHandle.addTo(map);
      camHandlesRef.current.set(node.id + "-rot", rotHandle);

      // ── Range handle (▸ at the tip of the cone) ──
      const rangeHandleLat = node.x + fovRange * Math.cos(rotation * radConst);
      const rangeHandleLng = node.y + fovRange * Math.sin(rotation * radConst);
      const rangeHandle = L.marker([rangeHandleLat, rangeHandleLng], {
        icon: L.divIcon({
          className: "cam-handle",
          html: `<div style="width:12px;height:12px;border-radius:2px;background:rgba(34,197,94,0.8);border:2px solid #4ade80;box-shadow:0 0 8px rgba(34,197,94,0.5);cursor:ns-resize;transform:rotate(45deg);"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        }),
        draggable: !isLocked,
      });
      rangeHandle.bindTooltip("Alcance", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
      rangeHandle.on("drag", () => {
        const rp = rangeHandle.getLatLng();
        const mp = marker.getLatLng();
        const dist = Math.sqrt(Math.pow(rp.lat - mp.lat, 2) + Math.pow(rp.lng - mp.lng, 2));
        const newRange = Math.max(0.00005, dist);
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
          ncd.fovRange = parseFloat(newRange.toFixed(6));
          nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
          const rot = ncd.rotation || rotation;
          fovPoly.setLatLngs(buildFovPoints(mp.lat, mp.lng, rot, newRange, ncd.fov || fov));
          // Move rotation handle proportionally
          const roh = camHandlesRef.current.get(node.id + "-rot");
          if (roh) roh.setLatLng([mp.lat + newRange * 0.7 * Math.cos(rot * radConst), mp.lng + newRange * 0.7 * Math.sin(rot * radConst)]);
        }
      });
      rangeHandle.addTo(map);
      camHandlesRef.current.set(node.id + "-range", rangeHandle);

      // ── FOV angle handle (◆ at the edge of the cone spread) ──
      const fovEdgeAngle = rotation + fov / 2;
      const fovHandleLat = node.x + fovRange * 0.6 * Math.cos(fovEdgeAngle * radConst);
      const fovHandleLng = node.y + fovRange * 0.6 * Math.sin(fovEdgeAngle * radConst);
      const fovHandle = L.marker([fovHandleLat, fovHandleLng], {
        icon: L.divIcon({
          className: "cam-handle",
          html: `<div style="width:12px;height:12px;border-radius:2px;background:rgba(250,204,21,0.85);border:2px solid #facc15;box-shadow:0 0 8px rgba(250,204,21,0.5);cursor:ew-resize;transform:rotate(45deg);"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        }),
        draggable: !isLocked,
      });
      fovHandle.bindTooltip("Apertura", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
      fovHandle.on("drag", () => {
        const fp = fovHandle.getLatLng();
        const mp = marker.getLatLng();
        const angleToHandle = Math.atan2(fp.lng - mp.lng, fp.lat - mp.lat) * (180 / Math.PI);
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
          const rot = ncd.rotation ?? rotation;
          // FOV = 2 * angle difference between handle and center direction
          const diff = Math.abs(((angleToHandle - rot + 540) % 360) - 180);
          const newFov = Math.max(5, Math.min(360, Math.round(diff * 2)));
          ncd.fov = newFov;
          nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
          const range = ncd.fovRange || fovRange;
          fovPoly.setLatLngs(buildFovPoints(mp.lat, mp.lng, rot, range, newFov));
        }
      });
      fovHandle.addTo(map);
      camHandlesRef.current.set(node.id + "-fov", fovHandle);
    }

    // ── Antenna beam cone (same technique as camera FOV) ──
    if (isAntenna && cd.type === "antenna") {
      const beamColor = cd.beamColor || "#f59e0b";
      const beamWidth = cd.beamWidth || 30;
      const rawBeamRange = cd.beamRange || (isImageMode ? 300 : 0.003);
      const beamRange = isImageMode && rawBeamRange < 1 ? rawBeamRange * 100000 : rawBeamRange;
      const beamOpacity = 0.12;
      const radConst = Math.PI / 180;

      function buildBeamPoints(cx: number, cy: number, rot: number, range: number, bw: number): [number, number][] {
        const pts: [number, number][] = [[cx, cy]];
        const s = rot - bw / 2;
        const e = rot + bw / 2;
        for (let a = s; a <= e; a += 2) pts.push([cx + range * Math.cos(a * radConst), cy + range * Math.sin(a * radConst)]);
        pts.push([cx, cy]);
        return pts;
      }

      const beamPoly = L.polygon(buildBeamPoints(node.x, node.y, rotation, beamRange, beamWidth), {
        color: beamColor, fillColor: beamColor, fillOpacity: beamOpacity,
        weight: 1, opacity: beamOpacity + 0.2, interactive: false,
        dashArray: "4 3",
      });
      beamPoly.addTo(map);
      fovLayersRef.current.set(node.id, beamPoly);

      // Gradient for antenna beam
      const applyBeamGradient = () => {
        const path = (beamPoly as any)._path as SVGPathElement | undefined;
        if (!path) return;
        const svg = path.closest("svg");
        if (!svg) return;
        const antPt = map.latLngToLayerPoint([node.x, node.y]);
        const tipLat = node.x + beamRange * Math.cos(rotation * radConst);
        const tipLng = node.y + beamRange * Math.sin(rotation * radConst);
        const tipPt = map.latLngToLayerPoint([tipLat, tipLng]);
        const radius = Math.sqrt(Math.pow(tipPt.x - antPt.x, 2) + Math.pow(tipPt.y - antPt.y, 2));
        let defs: Element | null = svg.querySelector("defs");
        if (!defs) { defs = document.createElementNS("http://www.w3.org/2000/svg", "defs"); svg.insertBefore(defs, svg.firstChild); }
        const gradId = `beamGrad-${node.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const existing = defs!.querySelector(`#${gradId}`);
        if (existing) existing.remove();
        const grad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
        grad.setAttribute("id", gradId);
        grad.setAttribute("cx", String(antPt.x));
        grad.setAttribute("cy", String(antPt.y));
        grad.setAttribute("r", String(radius));
        grad.setAttribute("gradientUnits", "userSpaceOnUse");
        const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s1.setAttribute("offset", "0%"); s1.setAttribute("stop-color", beamColor); s1.setAttribute("stop-opacity", String(beamOpacity * 5));
        const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s2.setAttribute("offset", "60%"); s2.setAttribute("stop-color", beamColor); s2.setAttribute("stop-opacity", String(beamOpacity));
        const s3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s3.setAttribute("offset", "100%"); s3.setAttribute("stop-color", beamColor); s3.setAttribute("stop-opacity", "0");
        grad.appendChild(s1); grad.appendChild(s2); grad.appendChild(s3);
        defs!.appendChild(grad);
        path.setAttribute("fill", `url(#${gradId})`);
        path.setAttribute("fill-opacity", "1");
        path.setAttribute("stroke", beamColor);
        path.setAttribute("stroke-opacity", "0.3");
        path.setAttribute("stroke-dasharray", "4 3");
      };
      requestAnimationFrame(applyBeamGradient);
      map.on("zoomend", applyBeamGradient);

      // Rotation handle for antenna beam
      const rotHandleLat = node.x + beamRange * 0.7 * Math.cos(rotation * radConst);
      const rotHandleLng = node.y + beamRange * 0.7 * Math.sin(rotation * radConst);
      const rotHandle = L.marker([rotHandleLat, rotHandleLng], {
        icon: L.divIcon({
          className: "antenna-handle",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:rgba(245,158,11,0.8);border:2px solid #f59e0b;box-shadow:0 0 8px rgba(245,158,11,0.6);cursor:grab;"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        }),
        draggable: !isLocked,
      });
      rotHandle.bindTooltip("Apuntar", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
      rotHandle.on("drag", () => {
        const hp = rotHandle.getLatLng();
        const mp = marker.getLatLng();
        const angle = Math.atan2(hp.lng - mp.lng, hp.lat - mp.lat) * (180 / Math.PI);
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
          ncd.rotation = Math.round(angle);
          nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
          beamPoly.setLatLngs(buildBeamPoints(mp.lat, mp.lng, Math.round(angle), ncd.beamRange || beamRange, ncd.beamWidth || beamWidth));
        }
      });
      rotHandle.addTo(map);
      camHandlesRef.current.set(node.id + "-rot", rotHandle);

      // Range handle for antenna beam
      const rangeHandleLat = node.x + beamRange * Math.cos(rotation * radConst);
      const rangeHandleLng = node.y + beamRange * Math.sin(rotation * radConst);
      const rangeHandle = L.marker([rangeHandleLat, rangeHandleLng], {
        icon: L.divIcon({
          className: "antenna-handle",
          html: `<div style="width:12px;height:12px;border-radius:2px;background:rgba(34,197,94,0.8);border:2px solid #4ade80;box-shadow:0 0 8px rgba(34,197,94,0.5);cursor:ns-resize;transform:rotate(45deg);"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        }),
        draggable: !isLocked,
      });
      rangeHandle.bindTooltip("Alcance", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
      rangeHandle.on("drag", () => {
        const rp = rangeHandle.getLatLng();
        const mp = marker.getLatLng();
        const dist = Math.sqrt(Math.pow(rp.lat - mp.lat, 2) + Math.pow(rp.lng - mp.lng, 2));
        const newRange = Math.max(0.00005, dist);
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
          ncd.beamRange = parseFloat(newRange.toFixed(6));
          nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
          const rot = ncd.rotation || rotation;
          beamPoly.setLatLngs(buildBeamPoints(mp.lat, mp.lng, rot, newRange, ncd.beamWidth || beamWidth));
          const roh = camHandlesRef.current.get(node.id + "-rot");
          if (roh) roh.setLatLng([mp.lat + newRange * 0.7 * Math.cos(rot * radConst), mp.lng + newRange * 0.7 * Math.sin(rot * radConst)]);
        }
      });
      rangeHandle.addTo(map);
      camHandlesRef.current.set(node.id + "-range", rangeHandle);
    }

    // ── Label rotation handle (◆ above the label, drag to rotate) ──
    if (isLabel && !isLockedRef.current) {
      const labelRotation = cd.rotation || 0;
      const radConst2 = Math.PI / 180;
      const handleOffset = 0.0003; // geo offset; scaled for image mode below
      const scaledOffset = isImageMode ? 30 : handleOffset;
      // Place handle directly above the label (90° = up in screen space)
      const handleLat = node.x + scaledOffset * Math.cos((labelRotation - 90) * radConst2);
      const handleLng = node.y + scaledOffset * Math.sin((labelRotation - 90) * radConst2);
      const rotHandle = L.marker([handleLat, handleLng], {
        icon: L.divIcon({
          className: "cam-handle",
          html: `<div style="width:10px;height:10px;border-radius:50%;background:rgba(167,139,250,0.85);border:2px solid #a78bfa;box-shadow:0 0 8px rgba(167,139,250,0.5);cursor:grab;"></div>`,
          iconSize: [10, 10], iconAnchor: [5, 5],
        }),
        draggable: true,
      });
      rotHandle.bindTooltip("Rotar etiqueta", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
      rotHandle.on("drag", () => {
        const hp = rotHandle.getLatLng();
        const mp = marker.getLatLng();
        // Angle from label to handle → add 90° because handle is "above"
        const angleRad = Math.atan2(hp.lng - mp.lng, hp.lat - mp.lat);
        const newRotation = Math.round(((angleRad * 180 / Math.PI) + 90 + 360) % 360);
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
          ncd.rotation = newRotation;
          nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
          // Update the label span rotation live without full re-render
          const el = marker.getElement()?.querySelector("span") as HTMLElement | null;
          if (el) el.style.transform = `rotate(${newRotation}deg)`;
          // Keep handle above the label
          const rr = newRotation - 90;
          rotHandle.setLatLng([
            mp.lat + scaledOffset * Math.cos(rr * radConst2),
            mp.lng + scaledOffset * Math.sin(rr * radConst2),
          ]);
        }
      });
      rotHandle.addTo(map);
      camHandlesRef.current.set(node.id + "-labelrot", rotHandle);
      // Hidden by default — only shown when the label is selected (clicked)
      requestAnimationFrame(() => {
        const el = rotHandle.getElement();
        if (el) el.style.display = "none";
      });
    }

    // Label tooltip (always visible) — only for non-label/camera nodes
    if (!isLabel && !isWaypoint && !isTrafico) {
      const cd_label = safeJsonParse<NodeCustomData>(node.custom_data);
      if (!cd_label.labelHidden) {
        const labelFontSizePx = cd_label.labelSize ? `${cd_label.labelSize}px` : "11px";
        marker.bindTooltip(node.label, {
          permanent: true,
          direction: "top",
          offset: [0, Math.round(-16 * nodeScale)],
          className: "leaflet-label-dark",
        });
        // Apply custom font size via CSS on the tooltip element after binding
        if (cd_label.labelSize) {
          requestAnimationFrame(() => {
            const el = marker.getTooltip()?.getElement?.();
            if (el) (el as HTMLElement).style.fontSize = labelFontSizePx;
          });
        }
      }
    }

    // Double-click opens the unified edit modal (not a browser prompt)
    marker.on("dblclick", (e: any) => {
      L.DomEvent.stopPropagation(e);
      if (isLabel) {
        // For text labels, still allow quick inline rename
        const newText = prompt("Texto de la etiqueta:", node.label);
        if (newText?.trim()) {
          const idx = nodesRef.current.findIndex((n) => n.id === node.id);
          if (idx >= 0) {
            nodesRef.current[idx] = { ...nodesRef.current[idx], label: newText.trim() };
            renderNodes(L, map);
          }
        }
      } else if (isRack) {
        // Double clicking a rack opens the Rack Designer Drawer (view-only when locked)
        setRackDrawerNodeId(node.id);
      } else if (!isWaypoint) {
        // If node has linked maps, navigate directly (1 map) or show modal (multiple)
        const cd = safeJsonParse<NodeCustomData>(node.custom_data);
        const linked: { id: string; name: string }[] = cd.linkedMaps || [];
        if (linked.length === 1) {
          // Single linked map — navigate directly
          if (readonly) window.open(apiUrl(`/view/${linked[0].id}`), "_blank");
          else if (onOpenMap) onOpenMap(linked[0].id);
          else window.open(apiUrl(`/map/${linked[0].id}`), "_blank");
        } else if (linked.length > 1) {
          if (readonly) window.open(apiUrl(`/view/${linked[0].id}`), "_blank");
          else setNodeMapModalNodeId(node.id);
        } else if (!isLockedRef.current) {
          if (isCamera) {
            // Camera: open stream config modal
            setStreamConfigNodeId(node.id);
          } else if (isAntenna) {
            // Antenna: open antenna config modal
            setAntennaConfigNodeId(node.id);
          } else {
            // Normal edit modal
            setInputModalConfig({ nodeId: node.id, initial: node.label, mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "", nodeType: cd.type, kumaMonitorId: node?.kuma_monitor_id ?? null });
            setInputModalOpen(true);
          }
        }
      }
    });

    // Right-click context menu
    marker.on("contextmenu", (e: any) => {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      ctxHandledRef.current = true;
      if (isLockedRef.current) {
        toast.info("Activa el modo edición (icono lápiz) para modificar el mapa", { id: "edit-lock-hint" });
        return;
      }
      map.closePopup();

      // Link mode is handled by overlay — skip context menu

      setCtxMenu({
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        nodeId: node.id,
      });
    });

    // Click — open popup or stream viewer for cameras
    marker.on("click", () => {
      if (isWaypoint || isPolygon || isTrafico) return;
      // Label click: show description tooltip if it has one
      if (isLabel) {
        const labelCd = safeJsonParse<NodeCustomData>(nodesRef.current.find(n => n.id === node.id)?.custom_data);
        if (labelCd.description) {
          const currentNode = nodesRef.current.find(n => n.id === node.id);
          const popup = L.popup({
            className: "leaflet-popup-dark",
            maxWidth: 320,
            closeButton: true,
          })
            .setLatLng(marker.getLatLng())
            .setContent(`<div style="font-size:12px;color:#ededed;line-height:1.5;padding:4px 0;">
              <div style="font-weight:600;font-size:13px;margin-bottom:6px;color:#60a5fa;">${currentNode?.label || node.label}</div>
              <div style="white-space:pre-wrap;color:#c0c0c0;">${labelCd.description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>`)
            .openOn(map);
        } else if (!isLockedRef.current) {
          // No description — show rotation handle in edit mode
          camHandlesRef.current.forEach((handle, key) => {
            if (key.endsWith("-labelrot")) {
              const el = handle.getElement();
              if (el) el.style.display = "none";
            }
          });
          const thisHandle = camHandlesRef.current.get(node.id + "-labelrot");
          if (thisHandle) {
            const el = thisHandle.getElement();
            if (el) el.style.display = "";
          }
        }
        return;
      }
      // Camera click: open stream viewer (PiP popup) if configured
      if (isCamera) {
        const camCd = safeJsonParse<NodeCustomData>(node.custom_data);
        if (camCd.streamUrl) {
          // Also compute tooltip anchor in case user switches mode later
          const map = mapRef.current;
          if (map) {
            const pt = map.latLngToContainerPoint([node.x, node.y]);
            const rect = containerRef.current?.getBoundingClientRect();
            setTooltipAnchor({
              x: (rect?.left ?? 0) + pt.x,
              y: (rect?.top ?? 0) + pt.y,
            });
          }
          setStreamViewers(prev => {
            if (prev.some(v => v.nodeId === node.id)) return prev; // already open
            if (prev.length >= MAX_STREAMS) return prev; // max reached
            return [...prev, { nodeId: node.id, mode: "pip" }];
          });
        }
        return;
      }
      const popup = L.popup({ className: "leaflet-popup-dark", maxWidth: 280 })
        .setLatLng(marker.getLatLng())
        .setContent(createPopupContent(node));
      popup.openOn(map);
    });

    // ── Drag: live update FOV cone, handles, edges, shadow ──
    marker.on("dragstart", () => {
      pushUndo();
      const el = marker.getElement();
      if (el) {
        el.style.filter = "drop-shadow(0 0 12px rgba(59,130,246,0.7))";
        el.style.opacity = "0.85";
        el.style.transition = "filter 0.15s, opacity 0.15s";
      }
    });

    marker.on("drag", () => {
      const pos = marker.getLatLng();
      const idx = nodesRef.current.findIndex((n) => n.id === node.id);
      if (idx >= 0) {
        nodesRef.current[idx] = { ...nodesRef.current[idx], x: pos.lat, y: pos.lng };
      }

      if (isCamera || isAntenna) {
        const cd2 = safeJsonParse<NodeCustomData>(nodesRef.current[idx]?.custom_data);
        const rot = cd2.rotation ?? 0;
        const radConst = Math.PI / 180;

        if (isCamera) {
          const rawRange2 = cd2.fovRange ?? (isImageMode ? 200 : 0.003);
          const range = isImageMode && rawRange2 < 1 ? rawRange2 * 100000 : rawRange2;
          const fovAngle = cd2.fov ?? 60;

          // Live update FOV polygon
          const fovPoly = fovLayersRef.current.get(node.id);
          if (fovPoly) {
            const pts: [number, number][] = [[pos.lat, pos.lng]];
            const s = rot - fovAngle / 2;
            const e = rot + fovAngle / 2;
            for (let a = s; a <= e; a += 2) pts.push([pos.lat + range * Math.cos(a * radConst), pos.lng + range * Math.sin(a * radConst)]);
            pts.push([pos.lat, pos.lng]);
            fovPoly.setLatLngs(pts);
          }

          // Live update FOV angle handle
          const fovH = camHandlesRef.current.get(node.id + "-fov");
          if (fovH) {
            const fovEdge = rot + fovAngle / 2;
            fovH.setLatLng([pos.lat + range * 0.6 * Math.cos(fovEdge * radConst), pos.lng + range * 0.6 * Math.sin(fovEdge * radConst)]);
          }

          // Live update rotation handle
          const rh = camHandlesRef.current.get(node.id + "-rot");
          if (rh) rh.setLatLng([pos.lat + range * 0.7 * Math.cos(rot * radConst), pos.lng + range * 0.7 * Math.sin(rot * radConst)]);

          // Live update range handle
          const rng = camHandlesRef.current.get(node.id + "-range");
          if (rng) rng.setLatLng([pos.lat + range * Math.cos(rot * radConst), pos.lng + range * Math.sin(rot * radConst)]);
        }

        if (isAntenna) {
          const rawBeamRange = cd2.beamRange ?? (isImageMode ? 300 : 0.003);
          const beamRange = isImageMode && rawBeamRange < 1 ? rawBeamRange * 100000 : rawBeamRange;
          const beamWidth = cd2.beamWidth ?? 30;

          // Live update beam polygon
          const beamPoly = fovLayersRef.current.get(node.id);
          if (beamPoly) {
            const pts: [number, number][] = [[pos.lat, pos.lng]];
            const s = rot - beamWidth / 2;
            const e = rot + beamWidth / 2;
            for (let a = s; a <= e; a += 2) pts.push([pos.lat + beamRange * Math.cos(a * radConst), pos.lng + beamRange * Math.sin(a * radConst)]);
            pts.push([pos.lat, pos.lng]);
            beamPoly.setLatLngs(pts);
          }

          // Live update rotation handle
          const rh = camHandlesRef.current.get(node.id + "-rot");
          if (rh) rh.setLatLng([pos.lat + beamRange * 0.7 * Math.cos(rot * radConst), pos.lng + beamRange * 0.7 * Math.sin(rot * radConst)]);

          // Live update range handle
          const rng = camHandlesRef.current.get(node.id + "-range");
          if (rng) rng.setLatLng([pos.lat + beamRange * Math.cos(rot * radConst), pos.lng + beamRange * Math.sin(rot * radConst)]);
        }
      }

      // Live update edges
      renderEdges(L, map);
    });

    marker.on("dragend", () => {
      const el = marker.getElement();
      if (el) {
        el.style.filter = "";
        el.style.opacity = "1";
      }
      const pos = marker.getLatLng();
      const idx = nodesRef.current.findIndex((n) => n.id === node.id);
      if (idx >= 0) {
        nodesRef.current[idx] = { ...nodesRef.current[idx], x: pos.lat, y: pos.lng };
      }
      renderEdges(L, map);
    });

    marker.addTo(map);
    markersRef.current.set(node.id, marker);
  });
}
