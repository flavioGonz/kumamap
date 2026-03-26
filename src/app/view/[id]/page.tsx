"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiUrl } from "@/lib/api";
import type { KumaMonitor } from "@/components/network-map/MonitorPanel";

interface SavedNode {
  id: string;
  kuma_monitor_id: number | null;
  label: string;
  x: number;
  y: number;
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

interface MapData {
  id: string;
  name: string;
  background_type: string;
  view_state?: string;
  nodes: SavedNode[];
  edges: SavedEdge[];
}

function formatTraffic(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} Gbps`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mbps`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} Kbps`;
  return `${bytes} bps`;
}

export default function MapViewPage() {
  const params = useParams();
  const mapId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [connected, setConnected] = useState(false);
  const [mapName, setMapName] = useState("Cargando...");

  // Fetch map data
  useEffect(() => {
    fetch(apiUrl(`/api/maps/${mapId}`))
      .then((r) => r.json())
      .then((data) => {
        setMapData(data);
        setMapName(data.name);
      });
  }, [mapId]);

  // Poll kuma monitors
  useEffect(() => {
    const fetchKuma = async () => {
      try {
        const res = await fetch(apiUrl("/api/kuma"));
        const data = await res.json();
        setMonitors(data.monitors || []);
        setConnected(data.connected || false);
      } catch {}
    };
    fetchKuma();
    const interval = setInterval(fetchKuma, 5000);
    return () => clearInterval(interval);
  }, []);

  // Render Leaflet map (readonly)
  useEffect(() => {
    if (!mapData || !containerRef.current) return;
    if (mapData.background_type !== "livemap") return;

    let vs: any = {};
    try { vs = mapData.view_state ? JSON.parse(mapData.view_state) : {}; } catch {}

    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(containerRef.current!, {
        center: vs.center || [-34.85, -56.05],
        zoom: vs.zoom || 12,
        zoomControl: false,
        attributionControl: false,
      });

      const tileUrls: Record<string, { url: string; maxZoom: number; maxNativeZoom?: number }> = {
        dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", maxZoom: 22, maxNativeZoom: 19 },
        satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maxZoom: 22, maxNativeZoom: 18 },
        streets: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 22, maxNativeZoom: 19 },
      };

      const style = vs.mapStyle || "dark";
      const tile = tileUrls[style] || tileUrls.dark;
      L.tileLayer(tile.url, { maxZoom: tile.maxZoom, maxNativeZoom: tile.maxNativeZoom }).addTo(map);

      // Dark overlay
      if (vs.overlayOpacity > 0) {
        const overlay = L.DomUtil.create("div");
        overlay.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,${vs.overlayOpacity});pointer-events:none;z-index:250;`;
        map.getPane("tilePane")?.appendChild(overlay);
      }

      mapRef.current = map;

      // Render nodes
      map.whenReady(() => {
        renderNodes(L, map, mapData.nodes, mapData.edges);
      });
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [mapData]);

  // Update node markers when monitors change
  useEffect(() => {
    if (!mapRef.current || !mapData) return;
    // Update tooltips with live data
    // (simplified — just re-render)
  }, [monitors]);

  function getStatusColor(monitorId: number | null): string {
    if (!monitorId) return "#6b7280";
    const m = monitors.find((mon) => mon.id === monitorId);
    if (!m) return "#f59e0b";
    return m.status === 1 ? "#22c55e" : m.status === 0 ? "#ef4444" : m.status === 3 ? "#8b5cf6" : "#f59e0b";
  }

  function getMonitorData(monitorId: number | null) {
    if (!monitorId) return null;
    return monitors.find((m) => m.id === monitorId) || null;
  }

  function renderNodes(L: any, map: any, nodes: SavedNode[], edges: SavedEdge[]) {
    nodes.forEach((node) => {
      if (node.icon === "_textLabel") {
        const labelIcon = L.divIcon({
          className: "text-label-marker",
          html: `<div style="background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);color:#ededed;font-size:13px;font-weight:700;padding:4px 12px;border-radius:8px;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,0.8);">${node.label}</div>`,
          iconSize: [0, 0], iconAnchor: [0, 12],
        });
        L.marker([node.x, node.y], { icon: labelIcon, interactive: false }).addTo(map);
        return;
      }

      const isCamera = node.icon === "_camera";
      const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
      const color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      const pulse = m?.status === 0 || m?.status === 2;

      // Camera FOV cone
      if (isCamera) {
        const rotation = cd.rotation || 0;
        const fov = cd.fov || 60;
        const fovRange = cd.fovRange || 0.002;
        const fovColor = cd.fovColor || color;
        const fovOpacity = cd.fovOpacity ?? 0.18;
        const radConst = Math.PI / 180;

        const pts: [number, number][] = [[node.x, node.y]];
        const s = rotation - fov / 2;
        const e = rotation + fov / 2;
        for (let a = s; a <= e; a += 2) pts.push([node.x + fovRange * Math.cos(a * radConst), node.y + fovRange * Math.sin(a * radConst)]);
        pts.push([node.x, node.y]);

        L.polygon(pts, {
          color: fovColor, fillColor: fovColor, fillOpacity: fovOpacity,
          weight: 1, opacity: Math.min(1, fovOpacity + 0.2), interactive: false,
        }).addTo(map);
      }

      // Node marker
      let nodeIcon;
      if (isCamera) {
        nodeIcon = L.divIcon({
          className: "camera-marker",
          html: `<div style="width:22px;height:22px;border-radius:4px;background:${color};border:2px solid ${color};box-shadow:0 0 12px ${color}88;display:flex;align-items:center;justify-content:center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
          </div>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        });
      } else {
        const size = 24;
        nodeIcon = L.divIcon({
          className: "node-marker",
          html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
            ${pulse ? `<div style="position:absolute;width:${size + 10}px;height:${size + 10}px;border-radius:50%;background:${color}30;top:-5px;left:-5px;animation:pulse 1.5s ease-in-out infinite;"></div>` : ""}
            <div style="width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle,${color}44,${color}11);border:2px solid ${color};box-shadow:0 0 12px ${color}66,0 0 30px ${color}22;display:flex;align-items:center;justify-content:center;">
              <div style="width:${size * 0.45}px;height:${size * 0.45}px;border-radius:50%;background:${color};"></div>
            </div>
          </div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        });
      }

      const marker = L.marker([node.x, node.y], { icon: nodeIcon, interactive: true });

      // Tooltip with live data
      const statusText = m ? (m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING") : "";
      const ipBadge = cd.ip ? `<span style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;padding:1px 6px;border-radius:6px;font-family:monospace;font-size:9px;">${cd.ip}</span>` : "";
      const pingText = m?.ping != null ? `${m.ping}ms` : "";

      marker.bindTooltip(`
        <div style="font-family:system-ui;min-width:140px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};"></div>
            <strong style="font-size:12px;color:#eee;">${node.label}</strong>
            <span style="color:${color};font-size:9px;font-weight:700;margin-left:auto;">${statusText}</span>
          </div>
          ${ipBadge ? `<div style="margin-bottom:3px;">${ipBadge}</div>` : ""}
          ${pingText ? `<div style="font-size:10px;color:#888;">Latencia: <span style="color:#bbb;">${pingText}</span></div>` : ""}
          ${m?.type ? `<div style="font-size:10px;color:#888;">Tipo: <span style="color:#bbb;text-transform:uppercase;">${m.type}</span></div>` : ""}
        </div>
      `, { direction: "top", offset: [0, -16], className: "leaflet-label-dark" });

      // Permanent label
      marker.bindTooltip(node.label, { permanent: true, direction: "top", offset: [0, -16], className: "leaflet-label-dark" });

      marker.addTo(map);
    });

    // Render edges
    edges.forEach((edge) => {
      const src = nodes.find((n) => n.id === edge.source_node_id);
      const tgt = nodes.find((n) => n.id === edge.target_node_id);
      if (!src || !tgt) return;

      const cd = edge.custom_data ? JSON.parse(edge.custom_data) : {};
      const srcMon = src.kuma_monitor_id ? monitors.find((m) => m.id === src.kuma_monitor_id) : null;
      const tgtMon = tgt.kuma_monitor_id ? monitors.find((m) => m.id === tgt.kuma_monitor_id) : null;
      const isFiber = cd.linkType === "fiber";
      const isDown = srcMon?.status === 0 || tgtMon?.status === 0;

      const lineColor = isDown ? "#ef4444" : isFiber ? "#3b82f6" : "#22c55e";
      const dashArray = isDown ? "8,6" : undefined;

      const line = L.polyline([[src.x, src.y], [tgt.x, tgt.y]], {
        color: lineColor, weight: 3, opacity: 0.9, dashArray,
      });
      if (edge.label) line.bindTooltip(edge.label, { sticky: true, className: "leaflet-label-dark" });
      line.addTo(map);

      // Interface labels
      if (cd.sourceInterface) {
        const lat = src.x + (tgt.x - src.x) * 0.12;
        const lng = src.y + (tgt.y - src.y) * 0.12;
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: "if-label",
            html: `<span style="color:#93c5fd;font-size:8px;font-weight:600;font-family:monospace;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9);">${cd.sourceInterface}</span>`,
            iconSize: [0, 0], iconAnchor: [0, 6],
          }), interactive: false,
        }).addTo(map);
      }
      if (cd.targetInterface) {
        const lat = src.x + (tgt.x - src.x) * 0.88;
        const lng = src.y + (tgt.y - src.y) * 0.88;
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: "if-label",
            html: `<span style="color:#c4b5fd;font-size:8px;font-weight:600;font-family:monospace;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9);">${cd.targetInterface}</span>`,
            iconSize: [0, 0], iconAnchor: [0, 6],
          }), interactive: false,
        }).addTo(map);
      }
    });
  }

  // Non-livemap: image or grid background (simplified view)
  if (mapData && mapData.background_type !== "livemap") {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-center text-[#777]">
          <MapIcon className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <h2 className="text-lg font-bold text-[#ededed] mb-1">{mapName}</h2>
          <p className="text-sm">Vista completa disponible solo para mapas tipo "Mapa real".</p>
          <p className="text-xs mt-2">Cambia el tipo de mapa a "Mapa real" en el editor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative" style={{ background: "#0a0a0a" }}>
      {/* Map name badge */}
      <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2 rounded-xl px-3 py-2"
        style={{ background: "rgba(10,10,10,0.8)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)" }}>
        <Network className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-bold text-[#ededed]">{mapName}</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: connected ? "#22c55e" : "#ef4444", boxShadow: connected ? "0 0 6px #22c55e" : "0 0 6px #ef4444" }} />
      </div>

      {/* Leaflet container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* CSS */}
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
        .leaflet-label-dark::before { border-top-color: rgba(10,10,10,0.9) !important; }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.5); opacity: 0; } }
      `}</style>
    </div>
  );
}
