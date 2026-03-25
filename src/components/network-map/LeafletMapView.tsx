"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import type { KumaMonitor } from "./MonitorPanel";
import type { KumaNodeData } from "./KumaMonitorNode";
import MiniChart from "./MiniChart";

interface SavedNode {
  id: string;
  kuma_monitor_id: number | null;
  label: string;
  x: number; // latitude
  y: number; // longitude
  icon: string;
}

interface SavedEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  color: string;
  custom_data: string | null;
}

interface LeafletMapViewProps {
  mapId: string;
  mapName?: string;
  kumaMonitors: KumaMonitor[];
  kumaConnected: boolean;
  onSave: (nodes: SavedNode[], edges: SavedEdge[]) => void;
  onBack: () => void;
  initialNodes: SavedNode[];
  initialEdges: SavedEdge[];
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
}: LeafletMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const polylinesRef = useRef<Map<string, any>>(new Map());
  const nodesRef = useRef<SavedNode[]>(initialNodes);
  const edgesRef = useRef<SavedEdge[]>(initialEdges);
  const LRef = useRef<any>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current) return;

    let map: any;

    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");
      LRef.current = L;

      if (mapRef.current) {
        mapRef.current.remove();
      }

      map = L.map(containerRef.current!, {
        center: [-34.85, -56.05],
        zoom: 12,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Render initial nodes
      setTimeout(() => {
        renderNodes(L, map);
        renderEdges(L, map);
        if (initialNodes.length > 0) {
          const bounds = initialNodes.map((n) => [n.x, n.y] as [number, number]);
          if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
        }
      }, 200);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

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

  function createMarkerIcon(L: any, color: string, pulse: boolean) {
    return L.divIcon({
      className: "custom-marker",
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;">
          ${pulse ? `<div style="position:absolute;width:28px;height:28px;border-radius:50%;background:${color}30;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ""}
          <div style="width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,${color}66,${color}22);border:2px solid ${color};box-shadow:0 0 12px ${color}55;"></div>
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
    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current.clear();

    nodesRef.current.forEach((node) => {
      const color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      const pulse = m?.status === 0 || m?.status === 2;

      const marker = L.marker([node.x, node.y], {
        icon: createMarkerIcon(L, color, pulse),
        draggable: true,
      });

      // Label tooltip (always visible)
      marker.bindTooltip(node.label, {
        permanent: true,
        direction: "top",
        offset: [0, -16],
        className: "leaflet-label-dark",
      });

      // Popup on click
      marker.bindPopup(createPopupContent(node), {
        className: "leaflet-popup-dark",
        maxWidth: 280,
      });

      // Drag to reposition
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        const idx = nodesRef.current.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          nodesRef.current[idx] = { ...nodesRef.current[idx], x: pos.lat, y: pos.lng };
        }
      });

      marker.addTo(map);
      markersRef.current.set(node.id, marker);
    });
  }

  function renderEdges(L: any, map: any) {
    polylinesRef.current.forEach((p) => map.removeLayer(p));
    polylinesRef.current.clear();

    edgesRef.current.forEach((edge) => {
      const srcNode = nodesRef.current.find((n) => n.id === edge.source_node_id);
      const tgtNode = nodesRef.current.find((n) => n.id === edge.target_node_id);
      if (!srcNode || !tgtNode) return;

      const line = L.polyline(
        [[srcNode.x, srcNode.y], [tgtNode.x, tgtNode.y]],
        { color: edge.color || "#4b5563", weight: 2, opacity: 0.7, dashArray: "5,8" }
      );

      if (edge.label || edge.custom_data) {
        const cd = edge.custom_data ? JSON.parse(edge.custom_data) : {};
        const parts = [cd.sourceInterface, edge.label, cd.targetInterface].filter(Boolean);
        if (parts.length > 0) {
          line.bindTooltip(parts.join(" → "), { sticky: true, className: "leaflet-label-dark" });
        }
      }

      line.addTo(map);
      polylinesRef.current.set(edge.id, line);
    });
  }

  function updateMarkerStatus() {
    if (!LRef.current || !mapRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;

    nodesRef.current.forEach((node) => {
      const marker = markersRef.current.get(node.id);
      if (!marker) return;

      const color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      const pulse = m?.status === 0 || m?.status === 2;

      marker.setIcon(createMarkerIcon(L, color, pulse));
      marker.setPopupContent(createPopupContent(node));
    });
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

    // Get map center as drop position
    const center = mapRef.current.getCenter();
    // Offset slightly based on mouse position relative to container
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
    onSave(nodesRef.current, edgesRef.current);
    setSaving(false);
  }, [onSave]);

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
    <div className="relative h-full w-full" style={{ marginRight: "320px" }}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

      {/* Search bar (toggleable) */}
      {searchVisible && (
        <div className="absolute top-2 left-14 z-[1000] flex gap-1.5">
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
            className="rounded-lg px-3 py-1.5 text-xs text-[#ededed] placeholder:text-[#737373] focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-64"
            style={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <button
            onClick={handleSearch}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
          >
            Buscar
          </button>
          <button
            onClick={() => { setSearchVisible(false); setSearchQuery(""); }}
            className="rounded-lg px-2 py-1.5 text-xs text-[#737373]"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Toggle search button */}
      {!searchVisible && (
        <button
          onClick={() => setSearchVisible(true)}
          className="absolute top-2 left-14 z-[1000] rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: "rgba(10,10,10,0.85)", border: "1px solid rgba(255,255,255,0.08)", color: "#a0a0a0" }}
        >
          🔍 Buscar direccion
        </button>
      )}

      {/* Top bar */}
      <div className="absolute top-2 left-2 z-[1000] flex items-center gap-2">
        <button
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: "rgba(10,10,10,0.85)", border: "1px solid rgba(255,255,255,0.08)", color: "#a0a0a0" }}
        >
          ← Mapas
        </button>
        {mapName && (
          <span className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#ededed]"
            style={{ background: "rgba(10,10,10,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {mapName}
          </span>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="absolute top-2 right-4 z-[1000] flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold"
        style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
      >
        {saving ? "Guardando..." : "Guardar"}
      </button>

      {/* Custom CSS for dark leaflet popups/tooltips */}
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
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
