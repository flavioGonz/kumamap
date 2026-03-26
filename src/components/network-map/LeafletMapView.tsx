"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import type { KumaMonitor } from "./MonitorPanel";
import ContextMenu, { menuIcons } from "./ContextMenu";
import LinkModal, { type LinkFormData } from "./LinkModal";
import InputModal from "./InputModal";
import { Pencil, MapPin, Signal } from "lucide-react";

interface SavedNode {
  id: string;
  kuma_monitor_id: number | null;
  label: string;
  x: number; // latitude
  y: number; // longitude
  icon: string;
  custom_data?: string | null;
}

interface SavedEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  color: string;
  custom_data: string | null;
}

interface MapViewState {
  zoom: number;
  center: [number, number];
  mapStyle: "dark" | "satellite" | "streets";
}

interface LeafletMapViewProps {
  mapId: string;
  mapName?: string;
  kumaMonitors: KumaMonitor[];
  kumaConnected: boolean;
  onSave: (nodes: SavedNode[], edges: SavedEdge[], viewState?: MapViewState) => void;
  onBack: () => void;
  initialNodes: SavedNode[];
  initialEdges: SavedEdge[];
  initialViewState?: MapViewState;
}

function formatTraffic(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} Gbps`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mbps`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} Kbps`;
  return `${bytes} bps`;
}

const statusColors: Record<number, string> = {
  0: "#ef4444",
  1: "#22c55e",
  2: "#f59e0b",
  3: "#8b5cf6",
};

export default function LeafletMapView({
  mapId,
  mapName,
  kumaMonitors,
  kumaConnected,
  onSave,
  onBack,
  initialNodes,
  initialEdges,
  initialViewState,
}: LeafletMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const polylinesRef = useRef<Map<string, any>>(new Map());
  const fovLayersRef = useRef<Map<string, any>>(new Map());
  const camHandlesRef = useRef<Map<string, any>>(new Map());
  const nodesRef = useRef<SavedNode[]>(initialNodes);
  const edgesRef = useRef<SavedEdge[]>(initialEdges);
  const LRef = useRef<any>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    edgeId?: string;
  } | null>(null);

  // Link creation state
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const linkSourceRef = useRef<string | null>(null);
  const [pendingLinkTarget, setPendingLinkTarget] = useState<string | null>(null);

  // Modal states
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalData, setLinkModalData] = useState<{ sourceId: string; targetId: string; edgeId?: string; initial?: Partial<LinkFormData> }>({ sourceId: "", targetId: "" });
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputModalConfig, setInputModalConfig] = useState<{ nodeId: string; initial: string }>({ nodeId: "", initial: "" });
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignNodeId, setAssignNodeId] = useState<string>("");
  const [assignSearch, setAssignSearch] = useState("");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerNodeId, setColorPickerNodeId] = useState<string>("");

  // Keep ref in sync with state for closures
  useEffect(() => { linkSourceRef.current = linkSource; }, [linkSource]);

  // Map style
  const [mapStyle, setMapStyle] = useState<"dark" | "satellite" | "streets">(initialViewState?.mapStyle || "dark");
  const tileLayerRef = useRef<any>(null);
  const labelMarkersRef = useRef<Map<string, any>>(new Map());

  const tileUrls: Record<string, { url: string; maxZoom: number; maxNativeZoom?: number }> = {
    dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", maxZoom: 22, maxNativeZoom: 19 },
    satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maxZoom: 22, maxNativeZoom: 18 },
    streets: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 22, maxNativeZoom: 19 },
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current) return;

    let map: any;

    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");
      LRef.current = L;

      if (!containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      map = L.map(containerRef.current, {
        center: initialViewState?.center || [-34.85, -56.05],
        zoom: initialViewState?.zoom || 12,
        maxZoom: 22,
        zoomControl: false,
        attributionControl: false,
      });

      const initStyle = initialViewState?.mapStyle || "dark";
      tileLayerRef.current = L.tileLayer(tileUrls[initStyle].url, {
        maxZoom: tileUrls[initStyle].maxZoom,
        maxNativeZoom: tileUrls[initStyle].maxNativeZoom,
      }).addTo(map);

      L.control.zoom({ position: "bottomleft" }).addTo(map);

      mapRef.current = map;

      // Render initial nodes after map is ready
      map.whenReady(() => {
        renderNodes(L, map);
        renderEdges(L, map);
        if (initialNodes.length > 0) {
          const bounds = initialNodes.map((n) => [n.x, n.y] as [number, number]);
          if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
        }
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Switch tile layer
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !tileLayerRef.current) return;
    const tile = tileUrls[mapStyle];
    mapRef.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = LRef.current.tileLayer(tile.url, { maxZoom: tile.maxZoom, maxNativeZoom: tile.maxNativeZoom }).addTo(mapRef.current);
  }, [mapStyle]);

  // Update markers when kuma data changes
  useEffect(() => {
    if (!mapRef.current || !LRef.current) return;
    updateMarkerStatus();
  }, [kumaMonitors]);

  function getStatusColor(monitorId: number | null): string {
    if (monitorId == null) return "#6b7280";
    const m = kumaMonitors.find((mon) => mon.id === monitorId);
    return statusColors[m?.status ?? 2] || "#f59e0b";
  }

  function getMonitorData(monitorId: number | null): KumaMonitor | undefined {
    if (monitorId == null) return undefined;
    return kumaMonitors.find((mon) => mon.id === monitorId);
  }

  function createMarkerIcon(L: any, color: string, pulse: boolean, isLinkSource: boolean = false) {
    const ring = isLinkSource ? `border:3px solid #60a5fa;` : `border:2px solid ${color};`;
    return L.divIcon({
      className: "custom-marker",
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;">
          ${pulse ? `<div style="position:absolute;width:28px;height:28px;border-radius:50%;background:${color}30;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ""}
          <div style="width:18px;height:18px;border-radius:50%;background:${color};${ring}box-shadow:0 0 14px ${color}88, 0 0 4px ${color};cursor:pointer;"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  function createPopupContent(node: SavedNode): string {
    const m = getMonitorData(node.kuma_monitor_id);
    const color = getStatusColor(node.kuma_monitor_id);
    const statusText = m ? (m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING") : "N/A";

    return `
      <div style="background:#111;color:#eee;padding:10px 14px;border-radius:12px;min-width:200px;font-family:system-ui;border:1px solid ${color}44;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};"></div>
          <strong style="font-size:13px;">${node.label}</strong>
          <span style="color:${color};font-size:10px;font-weight:700;margin-left:auto;">${statusText}</span>
        </div>
        ${m ? `
          <div style="font-size:10px;color:#888;space-y:4px;">
            ${m.type ? `<div style="display:flex;justify-content:space-between;"><span>Tipo</span><span style="color:#bbb;text-transform:uppercase;">${m.type}</span></div>` : ""}
            ${m.ping != null ? `<div style="display:flex;justify-content:space-between;"><span>Latencia</span><span style="color:#bbb;">${m.ping}ms</span></div>` : ""}
            ${m.uptime24 != null ? `<div style="display:flex;justify-content:space-between;"><span>Uptime 24h</span><span style="color:${m.uptime24 > 0.99 ? "#22c55e" : "#f59e0b"};">${(m.uptime24 * 100).toFixed(2)}%</span></div>` : ""}
            ${m.url ? `<div style="display:flex;justify-content:space-between;gap:8px;"><span>URL</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${m.url}</span></div>` : ""}
            ${m.msg ? `<div style="display:flex;justify-content:space-between;gap:8px;"><span>Msg</span><span style="color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${m.msg}</span></div>` : ""}
          </div>
        ` : '<div style="font-size:10px;color:#666;font-style:italic;">Nodo manual</div>'}
        <div style="margin-top:6px;font-size:9px;color:#555;">Lat: ${node.x.toFixed(5)}, Lng: ${node.y.toFixed(5)}</div>
      </div>
    `;
  }

  function renderNodes(L: any, map: any) {
    if (!map || !map.getContainer()) return;
    markersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    markersRef.current.clear();
    fovLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
    fovLayersRef.current.clear();
    camHandlesRef.current.forEach((h) => { try { map.removeLayer(h); } catch {} });
    camHandlesRef.current.clear();

    nodesRef.current.forEach((node) => {
      const isLabel = node.icon === "_textLabel";
      const isCamera = node.icon === "_camera";
      const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
      const color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      const pulse = !isLabel && (m?.status === 0 || m?.status === 2);
      const isSource = linkSource === node.id;

      const rotation = cd.rotation || 0;
      const fov = cd.fov || 60;
      const fovRange = cd.fovRange || 0.002; // ~200m at this lat

      let nodeIcon;
      if (isLabel) {
        nodeIcon = L.divIcon({
          className: "text-label-marker",
          html: `<div style="background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);color:#ededed;font-size:13px;font-weight:700;padding:4px 12px;border-radius:8px;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,0.8);cursor:move;">${node.label}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 12],
        });
      } else if (isCamera) {
        nodeIcon = L.divIcon({
          className: "camera-marker",
          html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;transform:rotate(${rotation}deg);">
            <div style="width:22px;height:22px;border-radius:4px;background:${color};border:2px solid ${isSource ? "#60a5fa" : color};box-shadow:0 0 12px ${color}88;cursor:pointer;display:flex;align-items:center;justify-content:center;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
            </div>
          </div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
      } else {
        nodeIcon = createMarkerIcon(L, color, pulse, isSource);
      }

      const marker = L.marker([node.x, node.y], {
        icon: nodeIcon,
        draggable: true,
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

        // ── Rotation handle (◎ at the edge of the cone center direction) ──
        const rotHandleLat = node.x + fovRange * 0.7 * Math.cos(rotation * radConst);
        const rotHandleLng = node.y + fovRange * 0.7 * Math.sin(rotation * radConst);
        const rotHandle = L.marker([rotHandleLat, rotHandleLng], {
          icon: L.divIcon({
            className: "cam-handle",
            html: `<div style="width:14px;height:14px;border-radius:50%;background:rgba(59,130,246,0.8);border:2px solid #60a5fa;box-shadow:0 0 8px rgba(59,130,246,0.6);cursor:grab;"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7],
          }),
          draggable: true,
        });
        rotHandle.bindTooltip("Rotar", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
        rotHandle.on("drag", () => {
          const hp = rotHandle.getLatLng();
          const mp = marker.getLatLng();
          const angle = Math.atan2(hp.lng - mp.lng, hp.lat - mp.lat) * (180 / Math.PI);
          const idx = nodesRef.current.findIndex((n) => n.id === node.id);
          if (idx >= 0) {
            const ncd = nodesRef.current[idx].custom_data ? JSON.parse(nodesRef.current[idx].custom_data!) : {};
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
          draggable: true,
        });
        rangeHandle.bindTooltip("Alcance", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
        rangeHandle.on("drag", () => {
          const rp = rangeHandle.getLatLng();
          const mp = marker.getLatLng();
          const dist = Math.sqrt(Math.pow(rp.lat - mp.lat, 2) + Math.pow(rp.lng - mp.lng, 2));
          const newRange = Math.max(0.0005, dist);
          const idx = nodesRef.current.findIndex((n) => n.id === node.id);
          if (idx >= 0) {
            const ncd = nodesRef.current[idx].custom_data ? JSON.parse(nodesRef.current[idx].custom_data!) : {};
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
      }

      // Label tooltip (always visible) — only for non-label/camera nodes
      if (!isLabel) {
        marker.bindTooltip(node.label, {
          permanent: true,
          direction: "top",
          offset: [0, -16],
          className: "leaflet-label-dark",
        });
      }

      // Click handler — manual popup management to avoid conflict with link mode
      marker.on("click", (e: any) => {
        // In link mode: select as target, NO popup
        if (linkSourceRef.current && linkSourceRef.current !== node.id) {
          e.originalEvent?.stopPropagation?.();
          completeLinkCreation(node.id);
          return;
        }
        // Labels: do nothing on single click (use dblclick to edit)
        if (isLabel) return;
        // Normal mode: open popup manually
        const popup = L.popup({ className: "leaflet-popup-dark", maxWidth: 280 })
          .setLatLng(marker.getLatLng())
          .setContent(createPopupContent(node));
        popup.openOn(map);
      });

      // Double-click to edit label or node name
      marker.on("dblclick", () => {
        const newText = prompt(isLabel ? "Texto de la etiqueta:" : "Nombre del nodo:", node.label);
        if (newText?.trim()) {
          const idx = nodesRef.current.findIndex((n) => n.id === node.id);
          if (idx >= 0) {
            nodesRef.current[idx] = { ...nodesRef.current[idx], label: newText.trim() };
            renderNodes(L, map);
          }
        }
      });

      // Right-click context menu
      marker.on("contextmenu", (e: any) => {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        map.closePopup();

        if (linkSourceRef.current && linkSourceRef.current !== node.id) {
          completeLinkCreation(node.id);
          return;
        }

        setCtxMenu({
          x: e.originalEvent.clientX,
          y: e.originalEvent.clientY,
          nodeId: node.id,
        });
      });

      // Drag to reposition
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          nodesRef.current[idx] = { ...nodesRef.current[idx], x: pos.lat, y: pos.lng };
        }
        // Re-render edges and FOVs
        renderEdges(L, map);
        if (isCamera) renderNodes(L, map);
      });

      marker.addTo(map);
      markersRef.current.set(node.id, marker);
    });
  }

  function renderEdges(L: any, map: any) {
    if (!map || !map.getContainer()) return;
    polylinesRef.current.forEach((p) => { try { map.removeLayer(p); } catch {} });
    polylinesRef.current.clear();
    // Clear interface label markers
    labelMarkersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    labelMarkersRef.current.clear();

    edgesRef.current.forEach((edge) => {
      const srcNode = nodesRef.current.find((n) => n.id === edge.source_node_id);
      const tgtNode = nodesRef.current.find((n) => n.id === edge.target_node_id);
      if (!srcNode || !tgtNode) return;

      const cd = edge.custom_data ? JSON.parse(edge.custom_data) : {};
      const srcMon = srcNode.kuma_monitor_id ? kumaMonitors.find((m) => m.id === srcNode.kuma_monitor_id) : null;
      const tgtMon = tgtNode.kuma_monitor_id ? kumaMonitors.find((m) => m.id === tgtNode.kuma_monitor_id) : null;
      const isFiber = cd.linkType === "fiber";
      const isDown = srcMon?.status === 0 || tgtMon?.status === 0;

      let lineColor = isDown ? "#ef4444" : isFiber ? "#3b82f6" : "#22c55e";
      let dashArray = isDown ? "8,6" : undefined;

      const line = L.polyline(
        [[srcNode.x, srcNode.y], [tgtNode.x, tgtNode.y]],
        { color: lineColor, weight: 3, opacity: 0.9, dashArray }
      );

      // Tooltip for cable label on hover
      if (edge.label) {
        line.bindTooltip(edge.label, { sticky: true, className: "leaflet-label-dark" });
      }

      // Source interface label — plain text near source
      if (cd.sourceInterface) {
        const lat = srcNode.x + (tgtNode.x - srcNode.x) * 0.12;
        const lng = srcNode.y + (tgtNode.y - srcNode.y) * 0.12;
        const srcLabel = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "interface-label",
            html: `<span style="color:#93c5fd;font-size:8px;font-weight:600;font-family:ui-monospace,monospace;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9);pointer-events:none;">${cd.sourceInterface}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 6],
          }),
          interactive: false,
        });
        srcLabel.addTo(map);
        labelMarkersRef.current.set(`${edge.id}-src`, srcLabel);
      }

      // Target interface label — plain text near target
      if (cd.targetInterface) {
        const lat = srcNode.x + (tgtNode.x - srcNode.x) * 0.88;
        const lng = srcNode.y + (tgtNode.y - srcNode.y) * 0.88;
        const tgtLabel = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "interface-label",
            html: `<span style="color:#c4b5fd;font-size:8px;font-weight:600;font-family:ui-monospace,monospace;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9);pointer-events:none;">${cd.targetInterface}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 6],
          }),
          interactive: false,
        });
        tgtLabel.addTo(map);
        labelMarkersRef.current.set(`${edge.id}-tgt`, tgtLabel);
      }

      // SNMP traffic label at center of edge
      if (cd.snmpMonitorId) {
        const snmpMon = kumaMonitors.find((m) => m.id === cd.snmpMonitorId);
        if (snmpMon) {
          const midLat = (srcNode.x + tgtNode.x) / 2;
          const midLng = (srcNode.y + tgtNode.y) / 2;
          const value = snmpMon.ping;
          const statusColor = snmpMon.status === 1 ? "#22c55e" : snmpMon.status === 0 ? "#ef4444" : "#f59e0b";
          const formattedValue = value != null ? formatTraffic(value) : "N/A";

          const trafficLabel = L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: "traffic-label",
              html: `<div style="
                background:rgba(0,0,0,0.85);
                border:1px solid ${statusColor}55;
                color:${statusColor};
                font-size:10px;font-weight:800;
                font-family:ui-monospace,monospace;
                padding:2px 8px;border-radius:6px;
                white-space:nowrap;
                box-shadow:0 2px 12px rgba(0,0,0,0.5), 0 0 8px ${statusColor}22;
                display:flex;align-items:center;gap:4px;
              ">
                <span style="font-size:8px;">▲▼</span> ${formattedValue}
              </div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 10],
            }),
            interactive: false,
          });
          trafficLabel.addTo(map);
          labelMarkersRef.current.set(`${edge.id}-traffic`, trafficLabel);
        }
      }

      // Right-click on edge
      line.on("contextmenu", (e: any) => {
        e.originalEvent.preventDefault();
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

  function updateMarkerStatus() {
    if (!LRef.current || !mapRef.current) return;
    const L = LRef.current;

    nodesRef.current.forEach((node) => {
      const marker = markersRef.current.get(node.id);
      if (!marker) return;

      const color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      const pulse = m?.status === 0 || m?.status === 2;

      marker.setIcon(createMarkerIcon(L, color, pulse, linkSource === node.id));
      marker.setPopupContent(createPopupContent(node));
    });

    // Also update edge colors
    renderEdges(LRef.current, mapRef.current);
  }

  // ─── Link creation flow ─────────────────────
  function startLinkCreation(nodeId: string) {
    linkSourceRef.current = nodeId;
    setLinkSource(nodeId);
    const node = nodesRef.current.find((n) => n.id === nodeId);
    toast.info(`Selecciona el nodo destino`, {
      description: `Origen: ${node?.label || nodeId}. Haz click o clic derecho en otro nodo.`,
      duration: 6000,
    });

    // Highlight source marker
    if (LRef.current && mapRef.current) {
      const marker = markersRef.current.get(nodeId);
      if (marker) {
        const color = getStatusColor(node?.kuma_monitor_id ?? null);
        marker.setIcon(createMarkerIcon(LRef.current, color, false, true));
      }
    }
  }

  function completeLinkCreation(targetId: string) {
    if (!linkSource) return;

    // Prevent self-link
    if (linkSource === targetId) {
      toast.error("No se puede conectar un nodo consigo mismo");
      cancelLinkCreation();
      return;
    }



    // Open modal to fill interface details
    setLinkModalData({ sourceId: linkSource, targetId });
    setLinkModalOpen(true);
  }

  function handleLinkModalSubmit(data: LinkFormData) {
    const { sourceId, targetId, edgeId } = linkModalData;
    const customData = {
      sourceInterface: data.sourceInterface,
      targetInterface: data.targetInterface,
      snmpMonitorId: data.snmpMonitorId ?? null,
    };

    if (edgeId) {
      const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
      if (idx >= 0) {
        edgesRef.current[idx] = {
          ...edgesRef.current[idx],
          label: data.label || null,
          custom_data: JSON.stringify(customData),
        };
      }
      toast.success("Conexion actualizada");
    } else {
      const newEdge: SavedEdge = {
        id: `edge-${Date.now()}`,
        source_node_id: sourceId,
        target_node_id: targetId,
        label: data.label || null,
        color: getStatusColor(nodesRef.current.find((n) => n.id === sourceId)?.kuma_monitor_id ?? null),
        custom_data: JSON.stringify(customData),
      };
      edgesRef.current = [...edgesRef.current, newEdge];

      const srcName = nodesRef.current.find((n) => n.id === sourceId)?.label;
      const tgtName = nodesRef.current.find((n) => n.id === targetId)?.label;
      toast.success("Conexion creada", { description: `${srcName} → ${tgtName}` });
    }

    setLinkModalOpen(false);
    linkSourceRef.current = null;
    setLinkSource(null);

    if (LRef.current && mapRef.current) {
      renderNodes(LRef.current, mapRef.current);
      renderEdges(LRef.current, mapRef.current);
    }
  }

  function cancelLinkCreation() {
    linkSourceRef.current = null;
    setLinkSource(null);
    if (LRef.current && mapRef.current) {
      renderNodes(LRef.current, mapRef.current);
    }
  }

  // ─── Context menu items ─────────────────────
  function getNodeCtxItems(nodeId: string) {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    return [
      {
        label: linkSource ? "Cancelar enlace" : "Nuevo link",
        icon: menuIcons.Link2,
        onClick: () => {
          if (linkSource) cancelLinkCreation();
          else startLinkCreation(nodeId);
        },
      },
      {
        label: "Editar nombre",
        icon: menuIcons.Pencil,
        onClick: () => {
          setInputModalConfig({ nodeId, initial: node?.label || "" });
          setInputModalOpen(true);
        },
      },
      // Assign / reassign monitor
      {
        label: node?.kuma_monitor_id ? "Reasignar monitor" : "Asignar monitor",
        icon: menuIcons.Signal,
        onClick: () => {
          setAssignNodeId(nodeId);
          setAssignSearch("");
          setAssignModalOpen(true);
        },
      },
      // Unassign if has monitor
      ...(node?.kuma_monitor_id ? [{
        label: "Desasignar monitor",
        icon: menuIcons.Trash2,
        onClick: () => {
          const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
          if (idx >= 0) {
            nodesRef.current[idx] = { ...nodesRef.current[idx], kuma_monitor_id: null };
            if (LRef.current && mapRef.current) {
              renderNodes(LRef.current, mapRef.current);
              renderEdges(LRef.current, mapRef.current);
            }
            toast.success("Monitor desasignado");
          }
        },
      }] : []),
      // Camera-specific: rotate and FOV
      ...(node?.icon === "_camera" ? [
        {
          label: "Angulo de vision (FOV)",
          icon: menuIcons.Maximize2,
          onClick: () => {
            const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
            const fov = prompt("Angulo FOV (grados, ej: 60, 90, 120, 180):", String(cd.fov || 60));
            if (fov !== null) {
              cd.fov = Math.max(5, Math.min(360, parseInt(fov) || 60));
              const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
              if (idx >= 0) {
                nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(cd) };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              }
            }
          },
        },
        {
          label: "Color y estilo",
          icon: menuIcons.Palette,
          onClick: () => {
            setColorPickerNodeId(nodeId);
            setColorPickerOpen(true);
          },
        },
      ] : []),
      {
        label: "Eliminar nodo",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
          edgesRef.current = edgesRef.current.filter(
            (e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId
          );
          if (LRef.current && mapRef.current) {
            renderNodes(LRef.current, mapRef.current);
            renderEdges(LRef.current, mapRef.current);
          }
          toast.success("Nodo eliminado");
        },
      },
    ];
  }

  function getEdgeCtxItems(edgeId: string) {
    const edge = edgesRef.current.find((e) => e.id === edgeId);
    const cd = edge?.custom_data ? JSON.parse(edge.custom_data) : {};
    const srcNode = nodesRef.current.find((n) => n.id === edge?.source_node_id);
    const tgtNode = nodesRef.current.find((n) => n.id === edge?.target_node_id);
    return [
      {
        label: "Editar interfaces",
        icon: menuIcons.Link2,
        onClick: () => {
          setLinkModalData({
            sourceId: edge?.source_node_id || "",
            targetId: edge?.target_node_id || "",
            edgeId,
            initial: { sourceInterface: cd.sourceInterface || "", targetInterface: cd.targetInterface || "", label: edge?.label || "", snmpMonitorId: cd.snmpMonitorId ?? null },
          });
          setLinkModalOpen(true);
        },
      },
      {
        label: cd.linkType === "fiber" ? "Cambiar a Cobre" : "Cambiar a Fibra",
        icon: menuIcons.Link2,
        onClick: () => {
          const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
          if (idx >= 0) {
            const oldCd = edgesRef.current[idx].custom_data ? JSON.parse(edgesRef.current[idx].custom_data!) : {};
            oldCd.linkType = cd.linkType === "fiber" ? "copper" : "fiber";
            edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
            if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
            toast.success(oldCd.linkType === "fiber" ? "Enlace: Fibra (azul)" : "Enlace: Cobre (verde)");
          }
        },
      },
      {
        label: "Eliminar conexion",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          edgesRef.current = edgesRef.current.filter((e) => e.id !== edgeId);
          if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
          toast.success("Conexion eliminada");
        },
      },
    ];
  }

  // Handle drop from monitor panel
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/kuma-monitor");
    if (!raw || !mapRef.current || !LRef.current) return;

    const monitor: KumaMonitor = JSON.parse(raw);

    // Prevent duplicates
    if (nodesRef.current.some((n) => n.kuma_monitor_id === monitor.id)) {
      toast.error("Monitor duplicado", { description: `"${monitor.name}" ya existe en este mapa` });
      return;
    }

    const rect = containerRef.current!.getBoundingClientRect();
    const point = mapRef.current.containerPointToLatLng([
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);

    const newNode: SavedNode = {
      id: `node-${Date.now()}-${monitor.id}`,
      kuma_monitor_id: monitor.id,
      label: monitor.name,
      x: point.lat,
      y: point.lng,
      icon: "server",
    };

    nodesRef.current = [...nodesRef.current, newNode];
    renderNodes(LRef.current, mapRef.current);
    renderEdges(LRef.current, mapRef.current);
    toast.success("Monitor agregado", { description: monitor.name });
  }, [kumaMonitors]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    const viewState: MapViewState = {
      zoom: mapRef.current?.getZoom() || 12,
      center: mapRef.current ? [mapRef.current.getCenter().lat, mapRef.current.getCenter().lng] : [-34.85, -56.05],
      mapStyle,
    };
    onSave(nodesRef.current, edgesRef.current, viewState);
    setSaving(false);
  }, [onSave, mapStyle]);

  // Search address (geocoding via Nominatim)
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapRef.current) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        { headers: { "User-Agent": "KumaMap/1.0" } }
      );
      const results = await res.json();
      if (results.length > 0) {
        const { lat, lon, display_name } = results[0];
        mapRef.current.setView([parseFloat(lat), parseFloat(lon)], 16, { animate: true });
        toast.success("Ubicacion encontrada", { description: display_name.substring(0, 60) });
      } else {
        toast.error("No se encontro la direccion");
      }
    } catch {
      toast.error("Error buscando direccion");
    }
  }, [searchQuery]);

  return (
    <div className="relative h-full w-full" style={{ marginRight: "320px", isolation: "isolate" }}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ zIndex: 0 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

      {/* ── Floating Top Bar ── */}
      <div
        className="absolute top-3 left-3 flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5"
        id="leaflet-toolbar"
        style={{
          right: "340px",
          zIndex: 10000,
          background: "rgba(10,10,10,0.82)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
          pointerEvents: "auto",
        }}
      >
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all"
          style={{ color: "#888" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#ededed"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#888"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Mapas
        </button>

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Map name + live status */}
        <div className="flex items-center gap-2 px-1">
          {mapName && (
            <span className="text-[12px] font-bold text-[#ededed] truncate max-w-[160px]">
              {mapName}
            </span>
          )}
          <div className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: kumaConnected ? "#22c55e" : "#ef4444",
                boxShadow: kumaConnected ? "0 0 6px #22c55e" : "0 0 6px #ef4444",
              }}
            />
            <span className="text-[9px] font-semibold" style={{ color: kumaConnected ? "#22c55e" : "#ef4444" }}>
              {kumaConnected ? "LIVE" : "OFF"}
            </span>
          </div>
        </div>

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => mapRef.current?.zoomIn()} title="Zoom In"
            className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/><path d="M11 8v6"/></svg>
          </button>
          <button onClick={() => mapRef.current?.zoomOut()} title="Zoom Out"
            className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/></svg>
          </button>
          <button onClick={() => {
            if (mapRef.current && nodesRef.current.length > 0) {
              const LLocal = LRef.current;
              if (!LLocal) return;
              const bounds = nodesRef.current.map((n) => [n.x, n.y] as [number, number]);
              mapRef.current.fitBounds(LLocal.latLngBounds(bounds), { padding: [50, 50] });
            }
          }} title="Ajustar vista"
            className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/></svg>
          </button>
        </div>

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Node/Edge controls */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `node-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Nuevo equipo", x: center.lat, y: center.lng, icon: "server" }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
          }} title="Agregar nodo"
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Nodo</span>
          </button>
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `label-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Etiqueta", x: center.lat, y: center.lng, icon: "_textLabel" }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
          }} title="Agregar etiqueta"
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Etiqueta</span>
          </button>
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `cam-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Camara", x: center.lat, y: center.lng, icon: "_camera", custom_data: JSON.stringify({ type: "camera", rotation: 0, fov: 60, fovRange: 0.002 }) }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Camara agregada — clic derecho para rotar");
          }} title="Agregar camara con campo de vision"
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Camara</span>
          </button>
          <button onClick={() => {
            if (linkSource) { cancelLinkCreation(); return; }
            // Pick a random node as source — user clicks another to link
            if (nodesRef.current.length === 0) { toast.error("Agrega nodos primero"); return; }
            toast.info("Haz clic derecho en un nodo y selecciona 'Nuevo link'", { duration: 4000 });
          }} title={linkSource ? "Cancelar link" : "Crear link entre nodos"}
            className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-all ${linkSource ? "text-[#60a5fa]" : "text-[#888] hover:text-[#ededed] hover:bg-white/[0.06]"}`}
            style={linkSource ? { background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)" } : {}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Link</span>
          </button>
        </div>

        <div className="flex-1" />

        {/* Link mode indicator */}
        {linkSource && (
          <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[10px] font-bold"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Enlazando...
            <button onClick={cancelLinkCreation} className="ml-0.5 text-[#888] hover:text-white">✕</button>
          </div>
        )}

        {/* Search */}
        {searchVisible ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              placeholder="Buscar direccion..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
                if (e.key === "Escape") { setSearchVisible(false); setSearchQuery(""); }
              }}
              className="h-7 w-48 rounded-lg px-3 py-1 text-[11px] text-[#ededed] placeholder:text-[#555] focus:outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <button
              onClick={handleSearch}
              className="rounded-lg p-1 transition-all text-[#60a5fa]"
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.12)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
            <button
              onClick={() => { setSearchVisible(false); setSearchQuery(""); }}
              className="rounded-lg p-1 text-[#555] hover:text-[#ededed] transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSearchVisible(true)}
            className="rounded-xl p-1.5 transition-all"
            style={{ color: "#888" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#ededed"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#888"; }}
            title="Buscar direccion"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>
        )}

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Map style pills */}
        <div className="flex items-center gap-0.5 rounded-xl p-0.5"
          style={{ background: "rgba(255,255,255,0.02)" }}>
          {([
            { key: "dark", label: "Oscuro" },
            { key: "satellite", label: "Satelite" },
            { key: "streets", label: "Calles" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMapStyle(key)}
              className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all"
              style={{
                background: mapStyle === key ? "rgba(59,130,246,0.15)" : "transparent",
                color: mapStyle === key ? "#60a5fa" : "#555",
                border: mapStyle === key ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[11px] font-bold transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))",
            border: "1px solid rgba(59,130,246,0.3)",
            color: "#60a5fa",
            boxShadow: "0 2px 12px rgba(59,130,246,0.1)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(59,130,246,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(59,130,246,0.1)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={
            ctxMenu.nodeId
              ? getNodeCtxItems(ctxMenu.nodeId)
              : ctxMenu.edgeId
              ? getEdgeCtxItems(ctxMenu.edgeId)
              : []
          }
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Link Modal */}
      <LinkModal
        open={linkModalOpen}
        onClose={() => { setLinkModalOpen(false); cancelLinkCreation(); }}
        onSubmit={handleLinkModalSubmit}
        sourceName={nodesRef.current.find((n) => n.id === linkModalData.sourceId)?.label}
        targetName={nodesRef.current.find((n) => n.id === linkModalData.targetId)?.label}
        initial={linkModalData.initial}
        title={linkModalData.edgeId ? "Editar conexion" : "Nueva conexion"}
        snmpMonitors={kumaMonitors.filter((m) => m.type === "snmp" || m.type === "push" || m.type === "port")}
      />

      {/* Input Modal (node rename) */}
      <InputModal
        open={inputModalOpen}
        onClose={() => setInputModalOpen(false)}
        onSubmit={(value) => {
          if (value.trim()) {
            const idx = nodesRef.current.findIndex((n) => n.id === inputModalConfig.nodeId);
            if (idx >= 0) {
              nodesRef.current[idx] = { ...nodesRef.current[idx], label: value.trim() };
              if (LRef.current && mapRef.current) {
                renderNodes(LRef.current, mapRef.current);
                renderEdges(LRef.current, mapRef.current);
              }
            }
          }
          setInputModalOpen(false);
        }}
        title="Editar nombre"
        placeholder="Nombre del nodo..."
        initial={inputModalConfig.initial}
        icon={<Pencil className="h-4 w-4 text-blue-400" />}
      />

      {/* Assign Monitor Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl w-[380px] max-h-[500px] flex flex-col overflow-hidden"
            style={{ background: "rgba(16,16,16,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <Signal className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-bold text-[#ededed]">Asignar Monitor Kuma</span>
              <button onClick={() => setAssignModalOpen(false)} className="ml-auto text-[#555] hover:text-[#ededed] text-lg leading-none">&times;</button>
            </div>
            <div className="px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <input
                autoFocus
                type="text"
                placeholder="Buscar monitor..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-xs text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
              {kumaMonitors
                .filter((m) => m.type !== "group" && m.active !== false)
                .filter((m) => !assignSearch || m.name.toLowerCase().includes(assignSearch.toLowerCase()))
                .map((m) => {
                  const color = statusColors[m.status ?? 2] || "#f59e0b";
                  const alreadyUsed = nodesRef.current.some((n) => n.kuma_monitor_id === m.id && n.id !== assignNodeId);
                  return (
                    <button
                      key={m.id}
                      disabled={alreadyUsed}
                      onClick={() => {
                        const idx = nodesRef.current.findIndex((n) => n.id === assignNodeId);
                        if (idx >= 0) {
                          nodesRef.current[idx] = { ...nodesRef.current[idx], kuma_monitor_id: m.id, label: m.name };
                          if (LRef.current && mapRef.current) {
                            renderNodes(LRef.current, mapRef.current);
                            renderEdges(LRef.current, mapRef.current);
                          }
                          toast.success("Monitor asignado", { description: m.name });
                        }
                        setAssignModalOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all disabled:opacity-30"
                      style={{ background: "transparent" }}
                      onMouseEnter={(e) => { if (!alreadyUsed) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}88` }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#ededed] truncate">{m.name}</div>
                        <div className="text-[10px] text-[#555]">{m.type.toUpperCase()} {m.ping != null ? `· ${m.ping}ms` : ""}</div>
                      </div>
                      {alreadyUsed && <span className="text-[9px] text-[#555]">en uso</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Color Picker Modal */}
      {colorPickerOpen && (() => {
        const cpNode = nodesRef.current.find((n) => n.id === colorPickerNodeId);
        const cpCd = cpNode?.custom_data ? JSON.parse(cpNode.custom_data) : {};
        const currentColor = cpCd.fovColor || "#22c55e";
        const currentOpacity = cpCd.fovOpacity ?? 0.18;

        const colorOptions = [
          { color: "#22c55e", name: "Verde" },
          { color: "#3b82f6", name: "Azul" },
          { color: "#ef4444", name: "Rojo" },
          { color: "#f59e0b", name: "Naranja" },
          { color: "#8b5cf6", name: "Violeta" },
          { color: "#ec4899", name: "Rosa" },
          { color: "#06b6d4", name: "Cyan" },
          { color: "#f97316", name: "Naranja fuerte" },
          { color: "#14b8a6", name: "Teal" },
          { color: "#a855f7", name: "Purpura" },
          { color: "#ffffff", name: "Blanco" },
          { color: "#facc15", name: "Amarillo" },
        ];

        const opacityOptions = [
          { value: 0.08, name: "Sutil" },
          { value: 0.15, name: "Suave" },
          { value: 0.25, name: "Medio" },
          { value: 0.40, name: "Visible" },
          { value: 0.60, name: "Fuerte" },
          { value: 0.80, name: "Intenso" },
        ];

        const applyChange = (fovColor?: string, fovOpacity?: number) => {
          const idx = nodesRef.current.findIndex((n) => n.id === colorPickerNodeId);
          if (idx >= 0) {
            const ncd = nodesRef.current[idx].custom_data ? JSON.parse(nodesRef.current[idx].custom_data!) : {};
            if (fovColor !== undefined) ncd.fovColor = fovColor;
            if (fovOpacity !== undefined) ncd.fovOpacity = fovOpacity;
            nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          }
        };

        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setColorPickerOpen(false)}>
            <div className="rounded-2xl w-[340px] overflow-hidden" onClick={(e) => e.stopPropagation()}
              style={{ background: "rgba(16,16,16,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="h-4 w-4 rounded" style={{ background: currentColor, opacity: currentOpacity + 0.3 }} />
                <span className="text-sm font-bold text-[#ededed]">Color y Transparencia</span>
                <button onClick={() => setColorPickerOpen(false)} className="ml-auto text-[#555] hover:text-[#ededed] text-lg leading-none">&times;</button>
              </div>

              {/* Colors */}
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-[10px] text-[#666] font-bold uppercase tracking-wider mb-2">Color del area</div>
                <div className="grid grid-cols-6 gap-2">
                  {colorOptions.map((c) => (
                    <button key={c.color} onClick={() => applyChange(c.color)} title={c.name}
                      className="w-10 h-10 rounded-xl transition-all hover:scale-110"
                      style={{
                        background: c.color,
                        border: currentColor === c.color ? "3px solid #fff" : "2px solid rgba(255,255,255,0.1)",
                        boxShadow: currentColor === c.color ? `0 0 12px ${c.color}88` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Opacity */}
              <div className="px-4 py-3">
                <div className="text-[10px] text-[#666] font-bold uppercase tracking-wider mb-2">Transparencia</div>
                <div className="grid grid-cols-3 gap-2">
                  {opacityOptions.map((o) => (
                    <button key={o.value} onClick={() => applyChange(undefined, o.value)}
                      className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                      style={{
                        background: currentOpacity === o.value ? `${currentColor}33` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${currentOpacity === o.value ? currentColor + "66" : "rgba(255,255,255,0.06)"}`,
                        color: currentOpacity === o.value ? currentColor : "#888",
                      }}>
                      <div className="h-3 rounded mb-1" style={{ background: currentColor, opacity: o.value }} />
                      {o.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Custom CSS */}
      <style>{`
        .leaflet-label-dark {
          background: rgba(10,10,10,0.9) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #ccc !important;
          font-size: 10px !important;
          font-weight: 700 !important;
          padding: 2px 6px !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        }
        .leaflet-label-dark::before {
          border-top-color: rgba(10,10,10,0.9) !important;
        }
        .leaflet-popup-dark .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-dark .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-dark .leaflet-popup-tip {
          background: #111 !important;
        }
        .leaflet-popup-close-button {
          color: #888 !important;
        }
        .leaflet-control-zoom a {
          background: rgba(10,10,10,0.85) !important;
          color: #a0a0a0 !important;
          border-color: rgba(255,255,255,0.08) !important;
          border-radius: 8px !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(30,30,30,0.95) !important;
          color: #ededed !important;
        }
        .leaflet-control-zoom {
          border: none !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;
        }
        .custom-marker,
        .text-label-marker,
        .camera-marker,
        .cam-handle,
        .interface-label,
        .traffic-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .text-label-marker {
          z-index: 500 !important;
        }
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
