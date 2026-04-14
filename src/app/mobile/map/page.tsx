"use client";

import React, { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { statusColors } from "@/utils/status";
import { getIconSvg } from "@/utils/map-icons";
import { safeJsonParse } from "@/lib/error-handler";
import type { NodeCustomData } from "@/lib/types";

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
}

interface KumaMonitor {
  id: number;
  name: string;
  status: number;
  type: string;
  ping: number | null;
  msg: string;
  uptime24?: number;
  tags?: { name: string; color: string }[];
}

interface MapData {
  id: string;
  name: string;
  background_type: string;
  background_image?: string;
  width?: number;
  height?: number;
}

interface SelectedNode {
  node: SavedNode;
  monitor: KumaMonitor | null;
  customData: NodeCustomData;
}

function MobileMapViewer() {
  const searchParams = useSearchParams();
  const mapId = searchParams.get("id") || "";

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [nodes, setNodes] = useState<SavedNode[]>([]);
  const [edges, setEdges] = useState<SavedEdge[]>([]);
  const [monitors, setMonitors] = useState<Map<number, KumaMonitor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [filterStatus, setFilterStatus] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  const fetchData = useCallback(async () => {
    if (!mapId) return;
    try {
      // /api/maps/[id] returns map + nodes + edges all in one response
      const [mapRes, kumaRes] = await Promise.all([
        fetch(apiUrl(`/api/maps/${mapId}`)),
        fetch(apiUrl("/api/kuma")),
      ]);
      if (mapRes.ok) {
        const data = await mapRes.json();
        setMapData(data);
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
      }
      if (kumaRes.ok) {
        const data = await kumaRes.json();
        const monMap = new Map<number, KumaMonitor>();
        (data.monitors || []).forEach((m: KumaMonitor) => monMap.set(m.id, m));
        setMonitors(monMap);
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [mapId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current || !mapData) return;

    import("leaflet").then((L) => {
      LRef.current = L;

      const isImage = mapData.background_type === "image" || mapData.background_type === "grid";
      let map: any;

      if (isImage) {
        const w = mapData.width || 1920;
        const h = mapData.height || 1080;
        const bounds = L.latLngBounds(L.latLng(0, 0), L.latLng(-h, w));
        map = L.map(mapContainerRef.current!, {
          crs: L.CRS.Simple,
          maxBounds: bounds.pad(0.2),
          zoomSnap: 0.25,
          attributionControl: false,
          zoomControl: false,
        });
        map.fitBounds(bounds);
        if (mapData.background_image) {
          L.imageOverlay(apiUrl(`/uploads/${mapData.background_image}`), bounds).addTo(map);
        }
      } else {
        map = L.map(mapContainerRef.current!, {
          center: [0, 0],
          zoom: 3,
          attributionControl: false,
          zoomControl: false,
        });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
        }).addTo(map);
      }

      mapInstanceRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapReady(false);
      }
    };
  }, [mapData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render markers — depends on mapReady to ensure Leaflet is initialized
  useEffect(() => {
    const L = LRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map || !mapReady) return;

    // Clear existing layers
    markersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    markersRef.current.clear();

    // Fit to nodes on first render
    const isImage = mapData?.background_type === "image" || mapData?.background_type === "grid";
    const visibleNodes = nodes.filter((n) => n.icon !== "_waypoint" && n.icon !== "_textLabel");
    if (visibleNodes.length > 0) {
      const latlngs = visibleNodes.map((n) => [n.x, n.y] as [number, number]);
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: isImage ? undefined : 16 });
    }

    // Draw edges
    edges.forEach((edge) => {
      const src = nodes.find((n) => n.id === edge.source_node_id);
      const tgt = nodes.find((n) => n.id === edge.target_node_id);
      if (!src || !tgt) return;
      L.polyline([[src.x, src.y], [tgt.x, tgt.y]], {
        color: edge.color || "#333",
        weight: 1.5,
        opacity: 0.4,
      }).addTo(map);
    });

    // Draw nodes
    nodes.forEach((node) => {
      if (node.icon === "_waypoint") return;
      if (node.icon === "_textLabel") return;

      const cd = safeJsonParse<NodeCustomData>(node.custom_data);
      const mon = node.kuma_monitor_id ? monitors.get(node.kuma_monitor_id) : null;
      const status = mon?.status ?? -1;
      const color = status >= 0 ? (statusColors[status] || "#6b7280") : (cd.nodeColor || "#6b7280");
      const scale = cd.nodeSize || 1.0;
      const size = Math.round(24 * scale);

      const iconHtml = `
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};
          box-shadow:0 0 8px ${color}88;
          display:flex;align-items:center;justify-content:center;
          border:2px solid rgba(255,255,255,0.2);
          ${status === 0 ? "animation:pulse-red 1.5s ease-in-out infinite;" : ""}
        ">
          ${getIconSvg(node.icon === "_rack" ? "_rack" : node.icon === "_camera" ? "camera" : node.icon, Math.round(size * 0.5))}
        </div>
        <div style="
          position:absolute;top:${size + 2}px;left:50%;transform:translateX(-50%);
          white-space:nowrap;font-size:9px;font-weight:700;color:#ccc;
          text-shadow:0 1px 3px rgba(0,0,0,0.8);text-align:center;
        ">${node.label}</div>
      `;

      const icon = L.divIcon({
        className: "mobile-marker",
        html: iconHtml,
        iconSize: [size, size + 16],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([node.x, node.y], { icon }).addTo(map);
      marker.on("click", () => {
        setSelected({
          node,
          monitor: mon || null,
          customData: cd,
        });
      });
      markersRef.current.set(node.id, marker);
    });
  }, [nodes, edges, monitors, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered node list for bottom drawer
  const filteredNodes = useMemo(() => {
    const visible = nodes.filter((n) => n.icon !== "_waypoint" && n.icon !== "_textLabel");
    if (filterStatus === null) return visible;
    return visible.filter((n) => {
      const mon = n.kuma_monitor_id ? monitors.get(n.kuma_monitor_id) : null;
      return mon?.status === filterStatus;
    });
  }, [nodes, monitors, filterStatus]);

  const statusCounts = useMemo(() => {
    let up = 0, down = 0, pending = 0, unmonitored = 0;
    nodes.forEach((n) => {
      if (n.icon === "_waypoint" || n.icon === "_textLabel") return;
      const mon = n.kuma_monitor_id ? monitors.get(n.kuma_monitor_id) : null;
      if (!mon) { unmonitored++; return; }
      if (mon.status === 1) up++;
      else if (mon.status === 0) down++;
      else pending++;
    });
    return { up, down, pending, unmonitored };
  }, [nodes, monitors]);

  if (!mapId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[#555]">No se especificó un mapa</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 px-3 py-2.5 flex items-center gap-2 safe-top" style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/mobile" className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] active:scale-95" style={{ background: "rgba(255,255,255,0.04)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-bold text-[#ededed] truncate">{mapData?.name || "Cargando..."}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {statusCounts.up > 0 && <span className="text-[9px] font-mono font-bold text-[#22c55e]">{statusCounts.up}↑</span>}
            {statusCounts.down > 0 && <span className="text-[9px] font-mono font-bold text-[#ef4444]">{statusCounts.down}↓</span>}
            {statusCounts.pending > 0 && <span className="text-[9px] font-mono font-bold text-[#f59e0b]">{statusCounts.pending}?</span>}
            <span className="text-[9px] text-[#555]">{nodes.filter((n) => n.icon !== "_waypoint" && n.icon !== "_textLabel").length} nodos</span>
          </div>
        </div>
        <button onClick={fetchData} className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] active:scale-95" style={{ background: "rgba(255,255,255,0.04)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
          </svg>
        </button>
      </header>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0" style={{ background: "#0a0a0a" }} />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: "rgba(10,10,10,0.8)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
            </svg>
          </div>
        )}

        {/* Status filter chips - overlaid on map */}
        {!loading && (
          <div className="absolute top-3 left-3 right-3 z-20 flex gap-1.5 flex-wrap">
            {[
              { label: "Todos", status: null, count: filteredNodes.length },
              { label: "DOWN", status: 0, count: statusCounts.down, color: "#ef4444" },
              { label: "UP", status: 1, count: statusCounts.up, color: "#22c55e" },
            ].filter((f) => f.status === null || f.count > 0).map((f) => (
              <button
                key={f.label}
                onClick={() => setFilterStatus(f.status)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all active:scale-95"
                style={{
                  background: filterStatus === f.status ? (f.color ? `${f.color}33` : "rgba(59,130,246,0.2)") : "rgba(10,10,10,0.85)",
                  border: `1px solid ${filterStatus === f.status ? (f.color || "#3b82f6") + "55" : "rgba(255,255,255,0.1)"}`,
                  color: filterStatus === f.status ? (f.color || "#60a5fa") : "#888",
                  backdropFilter: "blur(8px)",
                }}
              >
                {f.label} {f.count}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Node detail bottom sheet */}
      {selected && (
        <div className="z-50" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-4 py-3" style={{ background: "rgba(14,14,14,0.98)", backdropFilter: "blur(16px)" }}>
            {/* Handle + close */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: selected.monitor ? `${statusColors[selected.monitor.status] || "#6b7280"}22` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected.monitor ? `${statusColors[selected.monitor.status] || "#6b7280"}44` : "rgba(255,255,255,0.08)"}`,
                  }}
                  dangerouslySetInnerHTML={{ __html: getIconSvg(selected.node.icon === "_rack" ? "_rack" : selected.node.icon === "_camera" ? "camera" : selected.node.icon, 14) }}
                />
                <div>
                  <h3 className="text-sm font-bold text-[#ededed]">{selected.node.label}</h3>
                  {selected.monitor && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: `${statusColors[selected.monitor.status]}22`,
                        color: statusColors[selected.monitor.status],
                      }}
                    >
                      {selected.monitor.status === 1 ? "UP" : selected.monitor.status === 0 ? "DOWN" : "PENDING"}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="h-7 w-7 rounded-lg flex items-center justify-center text-[#555] active:scale-95" style={{ background: "rgba(255,255,255,0.04)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2">
              {selected.customData.ip && (
                <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">IP</div>
                  <div className="text-[11px] font-mono text-[#60a5fa]">{selected.customData.ip}</div>
                </div>
              )}
              {selected.customData.mac && (
                <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">MAC</div>
                  <div className="text-[11px] font-mono text-[#aaa]">{selected.customData.mac}</div>
                </div>
              )}
              {selected.monitor?.ping != null && (
                <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">Latencia</div>
                  <div className="text-[11px] font-mono text-[#ededed]">{selected.monitor.ping}ms</div>
                </div>
              )}
              {selected.monitor?.uptime24 != null && (
                <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">Uptime 24h</div>
                  <div className="text-[11px] font-mono" style={{ color: selected.monitor.uptime24 > 0.99 ? "#22c55e" : "#f59e0b" }}>
                    {(selected.monitor.uptime24 * 100).toFixed(2)}%
                  </div>
                </div>
              )}
              {selected.monitor?.type && (
                <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">Tipo</div>
                  <div className="text-[11px] text-[#aaa] uppercase">{selected.monitor.type}</div>
                </div>
              )}
              {selected.monitor?.msg && (
                <div className="rounded-xl px-3 py-2 col-span-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">Mensaje</div>
                  <div className="text-[10px] text-[#888] truncate">{selected.monitor.msg}</div>
                </div>
              )}
              {/* Rack link */}
              {selected.node.icon === "_rack" && (
                <Link
                  href={`/mobile/rack?mapId=${mapId}&nodeId=${selected.node.id}`}
                  className="col-span-2 rounded-xl px-3 py-2.5 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                  <span className="text-[11px] font-bold text-[#8b5cf6]">Ver Rack</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leaflet CSS + animations */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`
        .mobile-marker { background: none !important; border: none !important; }
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 8px #ef444488; }
          50% { box-shadow: 0 0 20px #ef4444cc, 0 0 40px #ef444444; }
        }
        .safe-top { padding-top: env(safe-area-inset-top, 0); }
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0); }
      `}</style>
    </div>
  );
}

export default function MobileMapPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </div>
    }>
      <MobileMapViewer />
    </Suspense>
  );
}
