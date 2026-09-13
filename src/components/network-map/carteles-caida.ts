/**
 * Los carteles de "lleva X caído" que cuelgan sobre un nodo (R2).
 *
 * Se llevaron de `LeafletMapView.tsx` junto con el resto del primer corte. Es la
 * única de las piezas extraídas que sí habla con Leaflet, pero lo hace a través
 * de dos refs concretas —el mapa y el diccionario de marcadores— y nada más, así
 * que entra por parámetro igual que el resto.
 *
 * El cuerpo se movió sin tocar una línea.
 */
import type React from "react";
import { safeJsonParse } from "@/lib/error-handler";
import type { NodeCustomData } from "@/lib/types";
import { formatElapsed, formatSince } from "./map-utils";
import type { SavedNode } from "./LeafletMapView";
import type { KumaMonitor } from "./MonitorPanel";

export interface ContextoCarteles {
  LRef: React.MutableRefObject<any>;
  mapRef: React.MutableRefObject<any>;
  nodesRef: React.MutableRefObject<SavedNode[]>;
  /** monitorId → instante en que Kuma abrió la racha de caída. */
  downSinceRef: React.MutableRefObject<Map<number, number>>;
  /** nodeId → el marcador de Leaflet que muestra el contador. */
  downtimeMarkersRef: React.MutableRefObject<Map<string, any>>;
  getRackStatus: (node: SavedNode) => { status: number };
  getMonitorData: (monitorId: number | null) => KumaMonitor | undefined;
}

export function actualizarCarteles(ctx: ContextoCarteles) {
  const {
    LRef, mapRef, nodesRef, downSinceRef, downtimeMarkersRef, getRackStatus,
    getMonitorData,
  } = ctx;

  if (!LRef.current || !mapRef.current) return;
  const L = LRef.current;
  const map = mapRef.current;
  const now = Date.now();

  // Build set of currently-down node IDs
  const downNodeIds = new Set<string>();
  nodesRef.current.forEach((node) => {
    if (node.icon === "_textLabel" || node.icon === "_waypoint" || node.icon === "_camera" || node.icon === "_polygon" || node.icon === "_traffic") return;
    if (node.icon === "_rack") {
      // Rack node: show downtime badge if ANY device monitor is DOWN
      const rackInfo = getRackStatus(node);
      if (rackInfo.status === 0) downNodeIds.add(node.id);
      return;
    }
    if (!node.kuma_monitor_id) return;
    const mon = getMonitorData(node.kuma_monitor_id);
    if (mon?.status === 0) downNodeIds.add(node.id);
  });

  // Remove counters for nodes no longer down
  downtimeMarkersRef.current.forEach((marker, nodeId) => {
    if (!downNodeIds.has(nodeId)) {
      try { map.removeLayer(marker); } catch { /* ignore */ }
      downtimeMarkersRef.current.delete(nodeId);
    }
  });

  // Add / update counters for each down node
  nodesRef.current.forEach((node) => {
    if (!downNodeIds.has(node.id)) return;

    // ── Resolve downTimestamp ────────────────────────────────────────────────
    let downTimestamp: number;
    if (node.icon === "_rack") {
      // Rack: find earliest DOWN device using DB streak-start times
      const cd2 = safeJsonParse<NodeCustomData>(node.custom_data);
      const rackDevices: any[] = cd2.devices || [];
      let earliest = Infinity;
      let hasAnyDbTs = false;
      for (const d of rackDevices) {
        if (!d.monitorId) continue;
        const m = getMonitorData(d.monitorId);
        if (m?.status !== 0) continue;
        const dbTs = downSinceRef.current.get(d.monitorId);
        if (dbTs) {
          hasAnyDbTs = true;
          if (dbTs < earliest) earliest = dbTs;
        }
      }
      if (!hasAnyDbTs) return; // DB fetch pending — wait for real data
      downTimestamp = earliest;
    } else {
      // Prefer DB streak-start (downSinceRef, from /api/kuma/down-since).
      // If DB hasn't responded yet, skip this node (don't show 00:00:00).
      const dbTs = downSinceRef.current.get(node.kuma_monitor_id!);
      if (!dbTs) return; // DB fetch pending — badge will appear once we have real data
      downTimestamp = dbTs;
    }
    const elapsed = now - downTimestamp;
    const elapsedStr = formatElapsed(elapsed);
    const sinceStr = formatSince(downTimestamp);

    // ── Node visual size (for anchor placement) ──────────────────────────────
    const cd = safeJsonParse<NodeCustomData>(node.custom_data);
    const scale: number = cd.nodeSize || 1.0;
    const containerPx = Math.round(28 * scale);

    const existing = downtimeMarkersRef.current.get(node.id);
    if (existing) {
      // Only update the elapsed timer — "since" never changes once set
      const el = existing.getElement();
      if (el) {
        const span = el.querySelector(".dt-elapsed");
        if (span) span.textContent = elapsedStr;
        // Si Kuma abrio una racha nueva, el "desde" tiene que moverse con el
        // contador. Si no, el cartel muestra dos tiempos que no se corresponden.
        const desde = el.querySelector(".dt-since") as HTMLElement | null;
        if (desde && desde.dataset.ts !== String(downTimestamp)) {
          desde.textContent = `desde ${sinceStr}`;
          desde.dataset.ts = String(downTimestamp);
        }
      }
    } else {
      // ── Tooltip bubble: timer (big) + since (small) + bottom arrow ─────────
      // Total height: ~54px bubble + 8px arrow = 62px
      const tipH = 62;
      const clearance = Math.round(containerPx / 2) + 20; // clear node circle + a bit
      const anchorYFinal = tipH + clearance;

      const icon = L.divIcon({
        className: "downtime-counter",
        html: `<div style="
          position:relative;
          display:inline-flex;flex-direction:column;align-items:flex-start;
          transform:translateX(-50%);
          pointer-events:none;
          background:rgba(15,2,2,0.97);
          border:1.5px solid #ef4444;
          border-radius:10px;
          padding:7px 11px 6px 9px;
          min-width:128px;
          box-shadow:0 0 0 1px rgba(239,68,68,0.15), 0 0 18px rgba(239,68,68,0.45), 0 6px 16px rgba(0,0,0,0.75);
          white-space:nowrap;
          animation:kuma-tip-pulse 2.4s ease-in-out infinite;
        ">
          <!-- Row 1: alert icon + elapsed timer -->
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="
              width:15px;height:15px;border-radius:50%;flex-shrink:0;
              background:linear-gradient(135deg,#ef4444,#b91c1c);
              border:1px solid rgba(252,165,165,0.5);
              display:flex;align-items:center;justify-content:center;
            ">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="14"/><circle cx="12" cy="19" r="1.5" fill="#fff" stroke="none"/>
              </svg>
            </div>
            <span class="dt-elapsed" style="
              font-size:13px;font-weight:800;color:#fca5a5;
              font-family:monospace;letter-spacing:1px;line-height:1;
            ">${elapsedStr}</span>
          </div>
          <!-- Row 2: since date -->
          <div class="dt-since" data-ts="${downTimestamp}" style="
            margin-top:4px;padding-left:21px;
            font-size:9px;color:rgba(252,165,165,0.5);
            font-family:monospace;letter-spacing:0.5px;line-height:1;
          ">desde ${sinceStr}</div>
          <!-- Bottom arrow pointing to node -->
          <div style="
            position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);
            width:0;height:0;
            border-left:7px solid transparent;
            border-right:7px solid transparent;
            border-top:7px solid #ef4444;
          "></div>
          <!-- Arrow inner fill (matches bg) -->
          <div style="
            position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
            width:0;height:0;
            border-left:6px solid transparent;
            border-right:6px solid transparent;
            border-top:6px solid rgba(15,2,2,0.97);
          "></div>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, anchorYFinal],
      });
      const marker = L.marker([node.x, node.y], { icon, interactive: false, zIndexOffset: 6000 });
      marker.addTo(map);
      downtimeMarkersRef.current.set(node.id, marker);
    }
  });
}
