"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { KumaMonitor } from "./MonitorPanel";
import ContextMenu, { menuIcons } from "./ContextMenu";
import LinkModal, { type LinkFormData } from "./LinkModal";
import InputModal from "./InputModal";
import { Pencil, Signal } from "lucide-react";
import TimeMachine from "./TimeMachine";

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
  overlayOpacity?: number;
}

interface LeafletMapViewProps {
  mapId: string;
  mapName?: string;
  kumaMonitors: KumaMonitor[];
  kumaConnected: boolean;
  onSave: (nodes: SavedNode[], edges: SavedEdge[], viewState?: MapViewState) => void;
  onBack?: () => void;
  initialNodes: SavedNode[];
  initialEdges: SavedEdge[];
  initialViewState?: MapViewState;
  readonly?: boolean;
  panelCollapsed?: boolean;
}

function MapClock({ timeMachineTime, timeMachineOpen }: { timeMachineTime: Date | null; timeMachineOpen: boolean }) {
  const [now, setNow] = useState(new Date());
  const [flash, setFlash] = useState(false);
  const prevTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Flash effect when time jumps (time travel!)
  useEffect(() => {
    if (timeMachineTime && prevTimeRef.current) {
      const diff = Math.abs(timeMachineTime.getTime() - prevTimeRef.current.getTime());
      if (diff > 60000) { // Jump > 1 min
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
    }
    prevTimeRef.current = timeMachineTime;
  }, [timeMachineTime]);

  const displayTime = timeMachineTime || now;
  const isHistorical = !!timeMachineTime;
  const hrs = displayTime.getHours().toString().padStart(2, "0");
  const min = displayTime.getMinutes().toString().padStart(2, "0");
  const sec = displayTime.getSeconds().toString().padStart(2, "0");
  const dateStr = displayTime.toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div
      className="absolute z-[10000] flex flex-col items-center transition-all duration-500"
      style={{
        bottom: 44,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
      }}
    >
      {/* Time Machine badge */}
      {isHistorical && (
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-0.5 mb-1 transition-all duration-300"
          style={{
            background: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.3)",
            boxShadow: "0 0 20px rgba(59,130,246,0.2)",
          }}
        >
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" style={{ boxShadow: "0 0 8px #60a5fa" }} />
          <span className="text-[9px] font-black text-blue-400 uppercase tracking-[0.15em]">TIME MACHINE</span>
        </div>
      )}

      {/* Clock */}
      <div
        className="rounded-2xl px-4 py-1.5 transition-all duration-500"
        style={{
          background: isHistorical
            ? "rgba(10,10,20,0.85)"
            : "rgba(10,10,10,0.6)",
          border: `1px solid ${isHistorical ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)"}`,
          backdropFilter: "blur(20px)",
          boxShadow: flash
            ? "0 0 60px rgba(96,165,250,0.6), 0 0 120px rgba(96,165,250,0.3)"
            : isHistorical
              ? "0 4px 30px rgba(59,130,246,0.15), 0 0 60px rgba(59,130,246,0.08)"
              : "0 4px 20px rgba(0,0,0,0.3)",
          transform: flash ? "scale(1.15)" : "scale(1)",
        }}
      >
        <div className="flex items-baseline gap-1 justify-center">
          <span
            className="font-mono font-black tracking-tight transition-all duration-300"
            style={{
              fontSize: isHistorical ? 28 : 18,
              color: isHistorical ? "#ffffff" : "#ededed",
              textShadow: isHistorical
                ? "0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(96,165,250,0.4)"
                : "0 1px 4px rgba(0,0,0,0.5)",
              letterSpacing: "0.02em",
            }}
          >
            {hrs}<span style={{ opacity: 0.5 }}>:</span>{min}
          </span>
          <span
            className="font-mono font-bold transition-all duration-300"
            style={{
              fontSize: isHistorical ? 16 : 12,
              color: isHistorical ? "rgba(255,255,255,0.5)" : "#555",
              textShadow: isHistorical ? "0 0 8px rgba(255,255,255,0.2)" : "none",
            }}
          >
            :{sec}
          </span>
        </div>
        <div
          className="text-center transition-all duration-300"
          style={{
            fontSize: isHistorical ? 10 : 9,
            color: isHistorical ? "rgba(96,165,250,0.6)" : "#444",
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginTop: -2,
          }}
        >
          {dateStr}
        </div>
      </div>
    </div>
  );
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
  readonly = false,
  panelCollapsed = false,
}: LeafletMapViewProps) {
  const sidebarWidth = readonly ? 0 : panelCollapsed ? 40 : 320;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const failPopupsRef = useRef<Map<string, any>>(new Map());
  const polylinesRef = useRef<Map<string, any>>(new Map());
  const fovLayersRef = useRef<Map<string, any>>(new Map());
  const camHandlesRef = useRef<Map<string, any>>(new Map());
  const nodesRef = useRef<SavedNode[]>(initialNodes);
  const edgesRef = useRef<SavedEdge[]>(initialEdges);
  const LRef = useRef<any>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [eventDetail, setEventDetail] = useState<{ nodeLabel: string; monitorId: number; msg: string; time: Date; type: string; ping: number | null; status: number } | null>(null);

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
  const [inputModalConfig, setInputModalConfig] = useState<{ nodeId: string; initial: string; mac?: string; ip?: string }>({ nodeId: "", initial: "" });
  const [overlayOpacity, setOverlayOpacity] = useState(initialViewState?.overlayOpacity ?? 0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignNodeId, setAssignNodeId] = useState<string>("");
  const [assignSearch, setAssignSearch] = useState("");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [showNodes, setShowNodes] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showCameras, setShowCameras] = useState(true);
  const [showFOV, setShowFOV] = useState(true);
  const [mapRotation, setMapRotation] = useState(0);
  const [timeDragging, setTimeDragging] = useState(false);
  const [polygonMode, setPolygonMode] = useState(false);
  const polygonPointsRef = useRef<[number, number][]>([]);
  const polygonPreviewRef = useRef<any>(null);
  const polygonLayersRef = useRef<Map<string, any>>(new Map());
  const edgeUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timeMachineOpen, setTimeMachineOpen] = useState(false);
  const [timeMachineTime, setTimeMachineTime] = useState<Date | null>(null);
  const [timeBlurPulse, setTimeBlurPulse] = useState(0);
  const [colorPickerNodeId, setColorPickerNodeId] = useState<string>("");
  const [lensPickerOpen, setLensPickerOpen] = useState(false);
  const [lensPickerNodeId, setLensPickerNodeId] = useState<string>("");

  // Undo history
  const undoStackRef = useRef<Array<{ nodes: SavedNode[]; edges: SavedEdge[] }>>([]);
  const MAX_UNDO = 30;

  function pushUndo() {
    undoStackRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
  }

  function performUndo() {
    const prev = undoStackRef.current.pop();
    if (!prev) { toast.info("Nada que deshacer"); return; }
    nodesRef.current = prev.nodes;
    edgesRef.current = prev.edges;
    if (LRef.current && mapRef.current) {
      renderNodes(LRef.current, mapRef.current);
      renderEdges(LRef.current, mapRef.current);
    }
    toast.success("Deshecho");
  }

  // Keep ref in sync with state for closures
  useEffect(() => { linkSourceRef.current = linkSource; }, [linkSource]);

  // Visibility toggles — show/hide layers without re-rendering
  useEffect(() => {
    markersRef.current.forEach((marker, nodeId) => {
      const node = nodesRef.current.find(n => n.id === nodeId);
      const isCamera = node?.icon === "_camera";
      const isLabel = node?.icon === "_textLabel";
      const isWaypoint = node?.icon === "_waypoint";
      if (isCamera) {
        if (showCameras) marker.getElement()?.style.setProperty("display", "");
        else marker.getElement()?.style.setProperty("display", "none");
      } else if (!isLabel && !isWaypoint) {
        if (showNodes) marker.getElement()?.style.setProperty("display", "");
        else marker.getElement()?.style.setProperty("display", "none");
      }
    });
    // FOV
    fovLayersRef.current.forEach((layer) => {
      if (showFOV && showCameras) {
        try { if (!mapRef.current?.hasLayer(layer)) mapRef.current?.addLayer(layer); } catch {}
      } else {
        try { mapRef.current?.removeLayer(layer); } catch {}
      }
    });
    // Links
    polylinesRef.current.forEach((line) => {
      if (showLinks) {
        try { if (!mapRef.current?.hasLayer(line)) mapRef.current?.addLayer(line); } catch {}
      } else {
        try { mapRef.current?.removeLayer(line); } catch {}
      }
    });
  }, [showNodes, showLinks, showCameras, showFOV]);

  // Map rotation
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.transform = mapRotation ? `rotate(${mapRotation}deg)` : "";
      containerRef.current.style.transformOrigin = "center center";
    }
  }, [mapRotation]);

  // Keyboard shortcuts: Escape = cancel link, Ctrl+Z = undo, Ctrl+S = save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (linkSourceRef.current) { cancelLinkCreation(); e.preventDefault(); }
        if (polygonPointsRef.current.length > 0) { cancelPolygon(); e.preventDefault(); }
        setPolygonMode(false);
        setCtxMenu(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        performUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Alert sound on monitor DOWN
  const playAlertSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      gain.gain.value = 0.15;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

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

      // General map click handler (for polygon drawing)
      map.on("click", (e: any) => {
        if (polygonPointsRef.current !== undefined && document.querySelector("[data-polygon-active]")) {
          handlePolygonClick(e.latlng);
        }
      });
      map.on("dblclick", (e: any) => {
        if (polygonPointsRef.current.length >= 3 && document.querySelector("[data-polygon-active]")) {
          e.originalEvent?.preventDefault?.();
          finishPolygon();
        }
      });

      // Render initial nodes after map is ready
      map.whenReady(() => {
        // Delay render slightly to ensure map is fully settled (fixes label scatter bug)
        setTimeout(() => {
          map.invalidateSize();
          renderNodes(L, map);
          renderEdges(L, map);
          if (initialNodes.length > 0) {
            const bounds = initialNodes.map((n) => [n.x, n.y] as [number, number]);
            if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
          }
        }, 300);
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

  // Performance: index monitors by ID for O(1) lookup instead of O(n) .find()
  const monitorIndex = useMemo(() => {
    const map = new Map<number, KumaMonitor>();
    kumaMonitors.forEach((m) => map.set(m.id, m));
    return map;
  }, [kumaMonitors]);

  function getStatusColor(monitorId: number | null): string {
    if (monitorId == null) return "#6b7280";
    const m = monitorIndex.get(monitorId);
    if (!m) return "#6b7280"; // unknown monitor = gray
    if (!m.active) return "#6b7280"; // inactive = gray
    if (m.status == null) return "#6b7280"; // no status yet = gray
    if (m.status === 0) return "#ef4444"; // DOWN = red
    if (m.status === 2) return "#f59e0b"; // PENDING = amber
    if (m.status === 3) return "#8b5cf6"; // MAINTENANCE = purple
    return "#22c55e"; // UP = green (tag colors shown in popup only, not on map to avoid confusion with status)
  }

  function getMonitorData(monitorId: number | null): KumaMonitor | undefined {
    if (monitorId == null) return undefined;
    return monitorIndex.get(monitorId);
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

  // Build sparkline SVG from ping history
  function buildSparkline(pings: number[], width: number = 200, height: number = 40): string {
    if (pings.length < 2) return "";
    const max = Math.max(...pings, 1);
    const min = Math.min(...pings, 0);
    const range = max - min || 1;
    const step = width / (pings.length - 1);
    const points = pings.map((p, i) => `${i * step},${height - ((p - min) / range) * (height - 4) - 2}`).join(" ");
    const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
    const maxP = Math.round(max);
    const minP = Math.round(min);
    return `
      <div style="margin-top:8px;border-top:1px solid #222;padding-top:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:8px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Latencia</span>
          <span style="font-size:8px;color:#888;">min ${minP}ms · avg ${avg}ms · max ${maxP}ms</span>
        </div>
        <svg width="${width}" height="${height}" style="display:block;">
          <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>
          <polygon points="0,${height} ${points} ${width},${height}" fill="url(#sg)" />
          <polyline points="${points}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linejoin="round" />
          <circle cx="${width}" cy="${points.split(" ").pop()?.split(",")[1]}" r="2.5" fill="#60a5fa" />
        </svg>
      </div>`;
  }

  // Ping history cache
  const pingHistoryRef = useRef<Map<number, number[]>>(new Map());

  function createPopupContent(node: SavedNode): string {
    const m = getMonitorData(node.kuma_monitor_id);
    const color = getStatusColor(node.kuma_monitor_id);
    const statusText = m ? (m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING") : "N/A";
    const cd = node.custom_data ? JSON.parse(node.custom_data) : {};

    // Get tag info for display
    const tagBadges = (m?.tags || []).map((t: any) =>
      `<span style="background:${t.color}22;border:1px solid ${t.color}44;color:${t.color};padding:1px 5px;border-radius:4px;font-size:8px;font-weight:700;">${t.name}</span>`
    ).join(" ");

    // Sparkline from history
    const history = node.kuma_monitor_id ? (pingHistoryRef.current.get(node.kuma_monitor_id) || []) : [];
    const sparkline = history.length >= 3 ? buildSparkline(history) : "";

    // Async fetch history (updates for next popup open)
    if (node.kuma_monitor_id) {
      fetch(`/maps/api/kuma/history/${node.kuma_monitor_id}`).then(r => r.json()).then((data: any[]) => {
        const pings = data.filter((h: any) => h.ping != null).map((h: any) => h.ping).slice(-30);
        pingHistoryRef.current.set(node.kuma_monitor_id!, pings);
      }).catch(() => {});
    }

    return `
      <div style="background:#111;color:#eee;padding:10px 14px;border-radius:12px;min-width:240px;max-width:300px;font-family:system-ui;border:1px solid ${color}44;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};"></div>
          <strong style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${node.label}</strong>
          <span style="color:${color};font-size:10px;font-weight:700;">${statusText}</span>
        </div>
        ${tagBadges ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">${tagBadges}</div>` : ""}
        ${cd.ip || cd.mac ? `
          <div style="font-size:10px;color:#999;margin-bottom:6px;display:flex;gap:6px;flex-wrap:wrap;">
            ${cd.ip ? `<span style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;padding:1px 6px;border-radius:6px;font-family:monospace;font-size:10px;">${cd.ip}</span>` : ""}
            ${cd.mac ? `<span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#888;padding:1px 6px;border-radius:6px;font-family:monospace;font-size:9px;">${cd.mac}</span>` : ""}
          </div>
        ` : ""}
        ${m ? `
          <div style="font-size:10px;color:#888;">
            ${m.type ? `<div style="display:flex;justify-content:space-between;"><span>Tipo</span><span style="color:#bbb;text-transform:uppercase;">${m.type}</span></div>` : ""}
            ${m.ping != null ? `<div style="display:flex;justify-content:space-between;"><span>Latencia</span><span style="color:#bbb;">${m.ping}ms</span></div>` : ""}
            ${m.uptime24 != null ? `<div style="display:flex;justify-content:space-between;"><span>Uptime</span><span style="color:${m.uptime24 > 0.99 ? "#22c55e" : "#f59e0b"};">${(m.uptime24 * 100).toFixed(2)}%</span></div>` : ""}
            ${m.msg ? `<div style="display:flex;justify-content:space-between;gap:8px;"><span>Msg</span><span style="color:#777;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${m.msg}</span></div>` : ""}
          </div>
        ` : '<div style="font-size:10px;color:#666;font-style:italic;">Nodo manual</div>'}
        ${sparkline}
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

    // Clear polygon layers
    polygonLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
    polygonLayersRef.current.clear();

    nodesRef.current.forEach((node) => {
      const isLabel = node.icon === "_textLabel";
      const isCamera = node.icon === "_camera";
      const isWaypoint = node.icon === "_waypoint";
      const isPolygon = node.icon === "_polygon";
      const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
      const color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      const pulse = !isLabel && (m?.status === 0 || m?.status === 2);


      // Render polygon zone
      if (isPolygon && cd.points?.length >= 3) {
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
          setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, nodeId: node.id });
        });
        poly.addTo(map);
        polygonLayersRef.current.set(node.id, poly);
        return; // Don't render a marker for polygons
      }
      const isSource = linkSource === node.id;

      const rotation = cd.rotation || 0;
      const fov = cd.fov || 60;
      const fovRange = cd.fovRange || 0.002; // ~200m at this lat

      let nodeIcon;
      if (isLabel) {
        nodeIcon = L.divIcon({
          className: "text-label-marker",
          html: `<span style="color:#ededed;font-size:13px;font-weight:600;white-space:nowrap;text-shadow:0 1px 6px rgba(0,0,0,0.9),0 0 12px rgba(0,0,0,0.6);cursor:move;pointer-events:auto;user-select:none;">${node.label}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 8],
        });
      } else if (isWaypoint) {
        nodeIcon = L.divIcon({
          className: "waypoint-marker",
          html: `<div style="width:10px;height:10px;border-radius:50%;background:${isSource ? "#60a5fa" : "rgba(255,255,255,0.25)"};border:2px solid ${isSource ? "#60a5fa" : "rgba(255,255,255,0.4)"};cursor:move;box-shadow:0 0 6px ${isSource ? "#60a5fa88" : "rgba(255,255,255,0.15)"};transition:all 0.15s;"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
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
        draggable: !readonly,
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
          draggable: !readonly,
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
          draggable: !readonly,
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
          draggable: !readonly,
        });
        fovHandle.bindTooltip("Apertura", { direction: "top", offset: [0, -10], className: "leaflet-label-dark" });
        fovHandle.on("drag", () => {
          const fp = fovHandle.getLatLng();
          const mp = marker.getLatLng();
          const angleToHandle = Math.atan2(fp.lng - mp.lng, fp.lat - mp.lat) * (180 / Math.PI);
          const idx = nodesRef.current.findIndex((n) => n.id === node.id);
          if (idx >= 0) {
            const ncd = nodesRef.current[idx].custom_data ? JSON.parse(nodesRef.current[idx].custom_data!) : {};
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

      // Label tooltip (always visible) — only for non-label/camera nodes
      if (!isLabel && !isWaypoint) {
        marker.bindTooltip(node.label, {
          permanent: true,
          direction: "top",
          offset: [0, -16],
          className: "leaflet-label-dark",
        });
      }

      // Double-click to edit label or node name
      marker.on("dblclick", (e: any) => {
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
        if (readonly) return;
        map.closePopup();

        // Link mode is handled by overlay — skip context menu

        setCtxMenu({
          x: e.originalEvent.clientX,
          y: e.originalEvent.clientY,
          nodeId: node.id,
        });
      });

      // Click — open popup (link mode handled by overlay)
      marker.on("click", () => {
        if (isLabel || isCamera || isWaypoint || isPolygon) return;
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

        if (isCamera) {
          const cd2 = nodesRef.current[idx]?.custom_data ? JSON.parse(nodesRef.current[idx].custom_data!) : {};
          const rot = cd2.rotation ?? 0;
          const range = cd2.fovRange ?? 0.003;
          const fovAngle = cd2.fov ?? 60;
          const radConst = Math.PI / 180;

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

          // Live update rotation handle
          const rh = camHandlesRef.current.get(node.id + "-rot");
          if (rh) rh.setLatLng([pos.lat + range * 0.7 * Math.cos(rot * radConst), pos.lng + range * 0.7 * Math.sin(rot * radConst)]);

          // Live update range handle
          const rng = camHandlesRef.current.get(node.id + "-range");
          if (rng) rng.setLatLng([pos.lat + range * Math.cos(rot * radConst), pos.lng + range * Math.sin(rot * radConst)]);

          // Live update FOV angle handle
          const fovH = camHandlesRef.current.get(node.id + "-fov");
          if (fovH) {
            const fovEdge = rot + fovAngle / 2;
            fovH.setLatLng([pos.lat + range * 0.6 * Math.cos(fovEdge * radConst), pos.lng + range * 0.6 * Math.sin(fovEdge * radConst)]);
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

  // Trace a route through waypoints to find the REAL endpoint nodes (with kuma_monitor_id)
  // Waypoints (icon === "waypoint" or no kuma_monitor_id and connected to exactly 2 edges) are transparent
  function findRealEndpoints(edgeId: string): { srcStatus: number | undefined; tgtStatus: number | undefined } {
    const edge = edgesRef.current.find((e) => e.id === edgeId);
    if (!edge) return { srcStatus: undefined, tgtStatus: undefined };

    const allNodes = nodesRef.current;
    const allEdges = edgesRef.current;

    // Walk from source side to find real node
    function walkToRealNode(startNodeId: string, fromEdgeId: string, visited: Set<string>): number | undefined {
      const node = allNodes.find((n) => n.id === startNodeId);
      if (!node) return undefined;

      // If this node has a kuma monitor, it's a real node — return its status
      if (node.kuma_monitor_id) {
        const mon = kumaMonitors.find((m) => m.id === node.kuma_monitor_id);
        return mon?.status;
      }

      // If this is a waypoint/blind node (icon === "waypoint" or no monitor), follow the chain
      const isWaypoint = node.icon === "waypoint" || !node.kuma_monitor_id;
      if (!isWaypoint) return undefined;

      visited.add(fromEdgeId);

      // Find other edges connected to this waypoint (not the one we came from)
      const connectedEdges = allEdges.filter(
        (e) => !visited.has(e.id) && (e.source_node_id === startNodeId || e.target_node_id === startNodeId)
      );

      for (const nextEdge of connectedEdges) {
        const nextNodeId = nextEdge.source_node_id === startNodeId ? nextEdge.target_node_id : nextEdge.source_node_id;
        const result = walkToRealNode(nextNodeId, nextEdge.id, visited);
        if (result !== undefined) return result;
      }

      return undefined; // dead end — no real node found
    }

    const srcStatus = walkToRealNode(edge.source_node_id, edgeId, new Set([edgeId]));
    const tgtStatus = walkToRealNode(edge.target_node_id, edgeId, new Set([edgeId]));

    return { srcStatus, tgtStatus };
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

      // Find real endpoints through waypoint chains
      const { srcStatus, tgtStatus } = findRealEndpoints(edge.id);
      const isFiber = cd.linkType === "fiber";
      const isWireless = cd.linkType === "wireless";
      const isDown = srcStatus === 0 || tgtStatus === 0;
      const isBothDown = srcStatus === 0 && tgtStatus === 0;
      const isMaint = (srcStatus === 3 || tgtStatus === 3) && !isDown;
      const isPending = (srcStatus === 2 || tgtStatus === 2) && !isDown && !isMaint;

      let lineColor = isBothDown ? "#991b1b" : isDown ? "#ef4444" : isMaint ? "#8b5cf6" : isPending ? "#f59e0b" : isFiber ? "#3b82f6" : isWireless ? "#f97316" : "#22c55e";
      let dashArray = isDown ? "8,6" : isWireless ? "6,8" : undefined;
      const lineOpacity = isBothDown ? 0.4 : isDown ? 0.9 : 0.9;

      // Bezier curve: add control point offset perpendicular to the line
      const dx = tgtNode.y - srcNode.y;
      const dy = tgtNode.x - srcNode.x;
      const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const curvature = 0.15; // adjust for more/less curve
      const cpLat = (srcNode.x + tgtNode.x) / 2 + (-dx / len) * len * curvature;
      const cpLng = (srcNode.y + tgtNode.y) / 2 + (dy / len) * len * curvature;

      // Create curved path with intermediate points
      const steps = 20;
      const curvePoints: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = (1 - t) * (1 - t) * srcNode.x + 2 * (1 - t) * t * cpLat + t * t * tgtNode.x;
        const lng = (1 - t) * (1 - t) * srcNode.y + 2 * (1 - t) * t * cpLng + t * t * tgtNode.y;
        curvePoints.push([lat, lng]);
      }

      const line = L.polyline(curvePoints, {
        color: lineColor, weight: isDown ? 4 : 3, opacity: lineOpacity, dashArray,
        smoothFactor: 1,
        className: isDown && !isBothDown ? "link-pulse" : undefined,
      });

      // Tooltip for cable label on hover — include endpoint status
      const statusLabel = (s: number | undefined) => s === 0 ? "🔴 DOWN" : s === 1 ? "🟢 UP" : s === 2 ? "🟡 PENDING" : s === 3 ? "🟣 MAINT" : "⚪ N/A";
      const tooltipParts: string[] = [];
      if (edge.label) tooltipParts.push(`<b>${edge.label}</b>`);
      if (isDown || isMaint || isPending) {
        // Find real endpoint names
        const findRealName = (nodeId: string, fromEdge: string, visited: Set<string>): string => {
          const node = nodesRef.current.find((n) => n.id === nodeId);
          if (!node) return "?";
          if (node.kuma_monitor_id) return node.label || "?";
          visited.add(fromEdge);
          const next = edgesRef.current.find((e) => !visited.has(e.id) && (e.source_node_id === nodeId || e.target_node_id === nodeId));
          if (!next) return node.label || "?";
          const nextNodeId = next.source_node_id === nodeId ? next.target_node_id : next.source_node_id;
          return findRealName(nextNodeId, next.id, visited);
        };
        const srcName = findRealName(edge.source_node_id, edge.id, new Set([edge.id]));
        const tgtName = findRealName(edge.target_node_id, edge.id, new Set([edge.id]));
        tooltipParts.push(`<span style="font-size:10px">${srcName}: ${statusLabel(srcStatus)}<br/>${tgtName}: ${statusLabel(tgtStatus)}</span>`);
      }
      if (tooltipParts.length > 0) {
        line.bindTooltip(tooltipParts.join("<br/>"), { sticky: true, className: "leaflet-label-dark" });
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

    // Throttle edge color updates (expensive) — only if a status changed
    if (!edgeUpdateTimerRef.current) {
      edgeUpdateTimerRef.current = setTimeout(() => {
        renderEdges(LRef.current!, mapRef.current!);
        edgeUpdateTimerRef.current = null;
      }, 3000);
    }
  }

  // ─── Link creation flow (HTML overlay approach) ─────────────────────
  const linkOverlayRef = useRef<HTMLDivElement | null>(null);
  const linkLineRef = useRef<SVGLineElement | null>(null);
  const linkSvgRef = useRef<SVGSVGElement | null>(null);
  const snappedTargetRef = useRef<string | null>(null);

  function startLinkCreation(nodeId: string) {
    linkSourceRef.current = nodeId;
    setLinkSource(nodeId);
    const node = nodesRef.current.find((n) => n.id === nodeId);
    toast.info(`Haz clic en el nodo destino`, {
      description: `Origen: ${node?.label || nodeId}`,
      duration: 4000,
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
      pushUndo();
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
    snappedTargetRef.current = null;
    linkSourceRef.current = null;
    setLinkSource(null);
    if (LRef.current && mapRef.current) {
      renderNodes(LRef.current, mapRef.current);
    }
  }

  // ─── Polygon drawing ────────────────────────
  function handlePolygonClick(latlng: any) {
    if (!LRef.current || !mapRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    const point: [number, number] = [latlng.lat, latlng.lng];
    polygonPointsRef.current.push(point);

    // Update preview polygon
    if (polygonPreviewRef.current) map.removeLayer(polygonPreviewRef.current);
    if (polygonPointsRef.current.length >= 2) {
      polygonPreviewRef.current = L.polygon(polygonPointsRef.current, {
        color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15,
        weight: 2, dashArray: "6,4", interactive: false,
      }).addTo(map);
    } else {
      // Show dot for first point
      polygonPreviewRef.current = L.circleMarker(point, {
        radius: 5, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 1,
      }).addTo(map);
    }
  }

  function finishPolygon() {
    if (polygonPointsRef.current.length < 3) {
      toast.error("Se necesitan al menos 3 puntos");
      cancelPolygon();
      return;
    }
    pushUndo();
    const pts = [...polygonPointsRef.current];
    const centroid: [number, number] = [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ];
    const id = `poly-${Date.now()}`;
    nodesRef.current = [...nodesRef.current, {
      id,
      kuma_monitor_id: null,
      label: "Zona",
      x: centroid[0],
      y: centroid[1],
      icon: "_polygon",
      custom_data: JSON.stringify({
        points: pts,
        color: "#3b82f6",
        fillOpacity: 0.15,
      }),
    }];
    cancelPolygon();
    setPolygonMode(false);
    if (LRef.current && mapRef.current) {
      renderNodes(LRef.current, mapRef.current);
      renderEdges(LRef.current, mapRef.current);
    }
    toast.success("Zona creada — doble clic para renombrar");
  }

  function cancelPolygon() {
    polygonPointsRef.current = [];
    if (polygonPreviewRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(polygonPreviewRef.current); } catch {}
      polygonPreviewRef.current = null;
    }
  }

  // ─── Context menu items ─────────────────────
  function getNodeCtxItems(nodeId: string) {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    const isLabel = node?.icon === "_textLabel";
    const isWaypoint = node?.icon === "_waypoint";


    // Polygons: rename, color, delete
    const isPolygon = node?.icon === "_polygon";
    if (isPolygon) {
      return [
        {
          label: "Editar nombre",
          icon: menuIcons.Pencil,
          onClick: () => {
            const newName = prompt("Nombre de la zona:", node?.label || "Zona");
            if (newName?.trim()) {
              const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
              if (idx >= 0) {
                nodesRef.current[idx] = { ...nodesRef.current[idx], label: newName.trim() };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              }
            }
          },
        },
        {
          label: "Color zona",
          icon: menuIcons.Palette,
          onClick: () => {
            setColorPickerNodeId(nodeId);
            setColorPickerOpen(true);
          },
        },
        {
          label: "Eliminar zona",
          icon: menuIcons.Trash2,
          danger: true,
          divider: true,
          onClick: () => {
            pushUndo();
            nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Zona eliminada");
          },
        },
      ];
    }

    // Waypoints: link + delete only
    if (isWaypoint) {
      return [
        {
          label: linkSource ? "Cancelar enlace" : "Nuevo link",
          icon: menuIcons.Link2,
          onClick: () => { if (linkSource) cancelLinkCreation(); else startLinkCreation(nodeId); },
        },
        {
          label: "Eliminar punto",
          icon: menuIcons.Trash2,
          danger: true,
          divider: true,
          onClick: () => {
            pushUndo();
            nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
            edgesRef.current = edgesRef.current.filter((e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId);
            if (LRef.current && mapRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
            toast.success("Punto eliminado");
          },
        },
      ];
    }

    // Labels only get edit text + delete
    if (isLabel) {
      return [
        {
          label: "Editar texto",
          icon: menuIcons.Pencil,
          onClick: () => {
            const newText = prompt("Texto de la etiqueta:", node?.label || "");
            if (newText?.trim()) {
              const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
              if (idx >= 0) {
                nodesRef.current[idx] = { ...nodesRef.current[idx], label: newText.trim() };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              }
            }
          },
        },
        {
          label: "Eliminar etiqueta",
          icon: menuIcons.Trash2,
          danger: true,
          divider: true,
          onClick: () => {
            pushUndo();
            nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Etiqueta eliminada");
          },
        },
      ];
    }

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
        label: "Editar nodo",
        icon: menuIcons.Pencil,
        onClick: () => {
          const cd = node?.custom_data ? JSON.parse(node.custom_data) : {};
          setInputModalConfig({ nodeId, initial: node?.label || "", mac: cd.mac || "", ip: cd.ip || "" });
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
      // Camera-specific options
      ...(node?.icon === "_camera" ? [
        {
          label: "Lente / FOV",
          icon: menuIcons.Maximize2,
          submenu: true,
          onClick: () => {
            setLensPickerNodeId(nodeId);
            setLensPickerOpen(true);
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
        {
          label: "Duplicar camara",
          icon: menuIcons.Plus,
          onClick: () => {
            const cd = node.custom_data ? JSON.parse(node.custom_data) : {};
            const newId = `node-${Date.now()}`;
            const offset = 0.0003; // slight offset so it doesn't overlap
            nodesRef.current = [...nodesRef.current, {
              id: newId,
              kuma_monitor_id: node.kuma_monitor_id,
              label: node.label + " (copia)",
              x: node.x + offset,
              y: node.y + offset,
              icon: "_camera",
              custom_data: JSON.stringify({ ...cd }),
            }];
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Camara duplicada");
          },
        },
      ] : []),
      // Duplicate node (non-cameras — cameras have their own duplicate)
      ...(node?.icon !== "_camera" ? [{
        label: "Duplicar nodo",
        icon: menuIcons.Plus,
        onClick: () => {
          pushUndo();
          const cd = node?.custom_data ? JSON.parse(node.custom_data) : {};
          const newId = `node-${Date.now()}`;
          nodesRef.current = [...nodesRef.current, {
            id: newId,
            kuma_monitor_id: null,
            label: (node?.label || "Nodo") + " (copia)",
            x: (node?.x || 0) + 0.0003,
            y: (node?.y || 0) + 0.0003,
            icon: node?.icon || "server",
            custom_data: node?.custom_data || null,
          }];
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Nodo duplicado");
        },
      }] : []),
      {
        label: "Eliminar nodo",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          pushUndo();
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
      ...[
        { type: "fiber", label: "Fibra", color: "#3b82f6" },
        { type: "copper", label: "Cobre", color: "#22c55e" },
        { type: "wireless", label: "Wireless", color: "#f97316" },
      ].filter(t => t.type !== (cd.linkType || "copper")).map(t => ({
        label: `→ ${t.label}`,
        icon: menuIcons.Link2,
        onClick: () => {
          const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
          if (idx >= 0) {
            const oldCd = edgesRef.current[idx].custom_data ? JSON.parse(edgesRef.current[idx].custom_data!) : {};
            oldCd.linkType = t.type;
            edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
            if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
            toast.success(`Enlace: ${t.label}`);
          }
        },
      })),
      {
        label: "Eliminar conexion",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          pushUndo();
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
      overlayOpacity,
    };
    onSave(nodesRef.current, edgesRef.current, viewState);
    setSaving(false);
  }, [onSave, mapStyle, overlayOpacity]);

  // Auto-save every 60s (if enabled)
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const interval = setInterval(() => {
      if (nodesRef.current.length > 0) handleSave();
    }, 60000);
    return () => clearInterval(interval);
  }, [handleSave, autoSaveEnabled]);

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
    <div className="relative h-full w-full transition-all duration-300" style={{ marginRight: `${sidebarWidth}px` }}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ zIndex: 0 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

      {/* ── Link mode overlay: captures ALL clicks above Leaflet ── */}
      {linkSource && (
        <div
          ref={linkOverlayRef}
          className="absolute inset-0 cursor-crosshair"
          style={{ zIndex: 1000 }}
          onMouseMove={(e) => {
            if (!mapRef.current || !linkSvgRef.current || !linkLineRef.current) return;
            const rect = containerRef.current!.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // Update SVG line endpoint
            linkLineRef.current.setAttribute("x2", String(mx));
            linkLineRef.current.setAttribute("y2", String(my));

            // Find snap target
            const SNAP = 40;
            let snapped = false;
            const srcId = linkSourceRef.current;
            for (const n of nodesRef.current) {
              if (n.id === srcId || n.icon === "_textLabel") continue;
              const nPoint = mapRef.current!.latLngToContainerPoint([n.x, n.y]);
              const dist = Math.sqrt((mx - nPoint.x) ** 2 + (my - nPoint.y) ** 2);
              if (dist < SNAP) {
                linkLineRef.current.setAttribute("x2", String(nPoint.x));
                linkLineRef.current.setAttribute("y2", String(nPoint.y));
                linkLineRef.current.setAttribute("stroke", "#60a5fa");
                linkLineRef.current.setAttribute("stroke-dasharray", "");
                linkLineRef.current.setAttribute("stroke-width", "3");
                snappedTargetRef.current = n.id;
                snapped = true;
                break;
              }
            }
            if (!snapped) {
              snappedTargetRef.current = null;
              linkLineRef.current.setAttribute("stroke", "#60a5fa");
              linkLineRef.current.setAttribute("stroke-dasharray", "8,5");
              linkLineRef.current.setAttribute("stroke-width", "2.5");
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (snappedTargetRef.current) {
              completeLinkCreation(snappedTargetRef.current);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelLinkCreation();
          }}
        >
          <svg ref={linkSvgRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1001 }}>
            {(() => {
              const srcNode = nodesRef.current.find(n => n.id === linkSource);
              if (!srcNode || !mapRef.current) return null;
              const srcPoint = mapRef.current.latLngToContainerPoint([srcNode.x, srcNode.y]);
              return (
                <line
                  ref={linkLineRef}
                  x1={srcPoint.x} y1={srcPoint.y}
                  x2={srcPoint.x} y2={srcPoint.y}
                  stroke="#60a5fa" strokeWidth="2.5" strokeDasharray="8,5" opacity="0.9"
                />
              );
            })()}
          </svg>
          {/* Visual hint */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 text-xs font-bold text-[#60a5fa] pointer-events-none"
            style={{ background: "rgba(10,10,10,0.85)", border: "1px solid rgba(59,130,246,0.3)", backdropFilter: "blur(8px)", zIndex: 1002 }}>
            Haz clic en el nodo destino &middot; Esc para cancelar
          </div>
        </div>
      )}

      {/* ── Dark Overlay: CSS filter on tile pane only ── */}
      <style>{`
        .leaflet-tile-pane { filter: brightness(${1 - overlayOpacity}); transition: filter 0.3s; }
      `}</style>

      {/* ── Floating Top Bar ── */}
      {!readonly && <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5"
        id="leaflet-toolbar"
        style={{
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

        {/* Edit mode toggle */}
        <button
          onClick={() => setEditMode(v => !v)}
          className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
          style={{
            background: editMode ? "rgba(245,158,11,0.15)" : "transparent",
            border: editMode ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
            color: editMode ? "#f59e0b" : "#666",
          }}
          title={editMode ? "Modo compacto" : "Modo edicion"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {editMode ? <><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/></> : <><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/></>}
          </svg>
          {editMode ? "Editar" : "Edit"}
        </button>

        {/* ═══ EDIT MODE TOOLS ═══ */}
        {editMode && <>
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
        </div>

        {/* ─── Drawing tools separator ─── */}
        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="flex items-center gap-0.5" style={{ background: "rgba(255,255,255,0.02)", borderRadius: "12px", padding: "2px" }}>
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `wp-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "", x: center.lat, y: center.lng, icon: "_waypoint" }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Punto de ruta agregado");
          }} title="Waypoint para curvar links"
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Punto</span>
          </button>
          <button onClick={() => {
            if (linkSource) { cancelLinkCreation(); return; }
            if (nodesRef.current.length === 0) { toast.error("Agrega nodos primero"); return; }
            toast.info("Clic derecho en un nodo → Nuevo link", { duration: 4000 });
          }} title={linkSource ? "Cancelar link" : "Crear link entre nodos"}
            className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-all ${linkSource ? "text-[#60a5fa]" : "text-[#888] hover:text-[#ededed] hover:bg-white/[0.06]"}`}
            style={linkSource ? { background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)" } : {}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Link</span>
          </button>
          <button
            data-polygon-active={polygonMode || undefined}
            onClick={() => {
              if (polygonMode) {
                if (polygonPointsRef.current.length >= 3) finishPolygon();
                else { cancelPolygon(); setPolygonMode(false); }
              } else {
                setPolygonMode(true);
                toast.info("Clic en el mapa para agregar puntos. Doble clic para terminar.", { duration: 5000 });
              }
            }}
            title={polygonMode ? "Terminar poligono (doble clic)" : "Dibujar zona/poligono"}
            className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-all ${polygonMode ? "text-[#4ade80]" : "text-[#888] hover:text-[#ededed] hover:bg-white/[0.06]"}`}
            style={polygonMode ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)" } : {}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">{polygonMode ? "Listo" : "Zona"}</span>
          </button>
        </div>

        {/* Link mode indicator */}
        {linkSource && (
          <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[10px] font-bold"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Enlazando...
            <button onClick={cancelLinkCreation} className="ml-0.5 text-[#888] hover:text-white">✕</button>
          </div>
        )}
        </>}

        {/* ═══ RIGHT SIDE ═══ */}

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

        {/* ═══ EDIT MODE: Map controls ═══ */}
        {editMode && <>
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

        {/* Dark overlay slider */}
        <div className="flex items-center gap-1.5 rounded-xl px-2 py-1" style={{ background: "rgba(255,255,255,0.02)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={overlayOpacity > 0 ? "#60a5fa" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
          <input
            type="range" min="0" max="0.7" step="0.05" value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
            className="w-14 h-1 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right, #3b82f6 ${(overlayOpacity / 0.7) * 100}%, #333 0%)` }}
            title={`Oscuridad: ${Math.round(overlayOpacity * 100)}%`}
          />
        </div>

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Visibility toggles */}
        <div className="flex items-center gap-0.5 rounded-xl p-0.5" style={{ background: "rgba(255,255,255,0.02)" }}>
          <button onClick={() => setShowNodes(v => !v)} title={showNodes ? "Ocultar nodos" : "Mostrar nodos"}
            className="rounded-lg p-1.5 transition-all" style={{ color: showNodes ? "#22c55e" : "#333" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
          </button>
          <button onClick={() => setShowLinks(v => !v)} title={showLinks ? "Ocultar links" : "Mostrar links"}
            className="rounded-lg p-1.5 transition-all" style={{ color: showLinks ? "#3b82f6" : "#333" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          <button onClick={() => setShowCameras(v => !v)} title={showCameras ? "Ocultar camaras" : "Mostrar camaras"}
            className="rounded-lg p-1.5 transition-all" style={{ color: showCameras ? "#f59e0b" : "#333" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
          </button>
          <button onClick={() => setShowFOV(v => !v)} title={showFOV ? "Ocultar areas de cobertura" : "Mostrar areas de cobertura"}
            className="rounded-lg p-1.5 transition-all" style={{ color: showFOV ? "#8b5cf6" : "#333" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>

        {/* Rotation */}
        <div className="flex items-center gap-1 rounded-xl px-2 py-1" style={{ background: "rgba(255,255,255,0.02)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={mapRotation !== 0 ? "#60a5fa" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          <input type="range" min="-180" max="180" step="5" value={mapRotation}
            onChange={(e) => setMapRotation(parseInt(e.target.value))}
            onDoubleClick={() => setMapRotation(0)}
            className="w-12 h-1 rounded-full appearance-none cursor-pointer" title={`Rotacion: ${mapRotation}°`}
            style={{ background: `linear-gradient(to right, #333 0%, #3b82f6 ${((mapRotation + 180) / 360) * 100}%, #333 100%)` }}
          />
          {mapRotation !== 0 && <span className="text-[9px] text-[#666] font-mono">{mapRotation}°</span>}
        </div>

        </>}

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Auto-save toggle */}
        <button onClick={() => setAutoSaveEnabled(v => !v)} title={autoSaveEnabled ? "Auto-save ON (clic para desactivar)" : "Auto-save OFF (clic para activar)"}
          className="rounded-lg p-1.5 transition-all"
          style={{ color: autoSaveEnabled ? "#4ade80" : "#555" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {autoSaveEnabled ? <><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></> : <><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></>}
          </svg>
        </button>

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
      </div>}

      {/* Context Menu */}
      {!readonly && ctxMenu && (
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

      {/* Node Edit Modal (name + MAC + IP) */}
      {inputModalOpen && (() => {
        const [editName, setEditName] = [inputModalConfig.initial, (v: string) => setInputModalConfig(c => ({ ...c, initial: v }))];
        const [editMac, setEditMac] = [inputModalConfig.mac || "", (v: string) => setInputModalConfig(c => ({ ...c, mac: v }))];
        const [editIp, setEditIp] = [inputModalConfig.ip || "", (v: string) => setInputModalConfig(c => ({ ...c, ip: v }))];

        const handleSubmit = () => {
          if (editName.trim()) {
            const idx = nodesRef.current.findIndex((n) => n.id === inputModalConfig.nodeId);
            if (idx >= 0) {
              const ncd = nodesRef.current[idx].custom_data ? JSON.parse(nodesRef.current[idx].custom_data!) : {};
              ncd.mac = editMac.trim() || undefined;
              ncd.ip = editIp.trim() || undefined;
              nodesRef.current[idx] = { ...nodesRef.current[idx], label: editName.trim(), custom_data: JSON.stringify(ncd) };
              if (LRef.current && mapRef.current) {
                renderNodes(LRef.current, mapRef.current);
                renderEdges(LRef.current, mapRef.current);
              }
            }
          }
          setInputModalOpen(false);
        };

        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setInputModalOpen(false)}>
            <div className="w-full max-w-sm rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}
              style={{ background: "linear-gradient(180deg, rgba(22,22,22,0.98), rgba(14,14,14,0.99))", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
                  <Pencil className="h-4 w-4 text-blue-400" />
                </div>
                <h3 className="text-sm font-bold text-[#ededed] flex-1">Editar Nodo</h3>
                <button onClick={() => setInputModalOpen(false)} className="text-[#555] hover:text-[#ededed] text-lg">&times;</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="px-5 py-4 space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#666] block mb-1">Nombre</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre del nodo..." autoFocus
                    className="w-full rounded-xl px-3.5 py-2 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#666] block mb-1">MAC Address</label>
                    <input type="text" value={editMac} onChange={(e) => setEditMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF"
                      className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#666] block mb-1">IP Address</label>
                    <input type="text" value={editIp} onChange={(e) => setEditIp(e.target.value)} placeholder="192.168.1.100"
                      className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setInputModalOpen(false)}
                    className="flex-1 rounded-xl py-2 text-xs font-semibold"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}>Cancelar</button>
                  <button type="submit"
                    className="flex-1 rounded-xl py-2 text-xs font-bold"
                    style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>Guardar</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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

      {/* Lens Picker Modal */}
      {lensPickerOpen && (() => {
        const lpNode = nodesRef.current.find((n) => n.id === lensPickerNodeId);
        const lpCd = lpNode?.custom_data ? JSON.parse(lpNode.custom_data) : {};
        const currentFov = lpCd.fov || 60;

        const lensPresets = [
          { name: "Ojo de pez", fov: 180, mm: "1.2mm", desc: "Vista 180° panoramica" },
          { name: "Super gran angular", fov: 120, mm: "2.8mm", desc: "Cobertura amplia 120°" },
          { name: "Gran angular", fov: 90, mm: "3.6mm", desc: "Estandar de vigilancia 90°" },
          { name: "Normal", fov: 60, mm: "6mm", desc: "Angulo medio 60°" },
          { name: "Teleobjetivo", fov: 35, mm: "12mm", desc: "Enfoque selectivo 35°" },
          { name: "Tele largo", fov: 18, mm: "25mm", desc: "Lectura de placas 18°" },
          { name: "PTZ Zoom", fov: 8, mm: "50mm", desc: "Detalle maximo 8°" },
          { name: "Personalizado", fov: currentFov, mm: "custom", desc: "Define tu propio FOV" },
        ];

        const applyLens = (fov: number) => {
          const idx = nodesRef.current.findIndex((n) => n.id === lensPickerNodeId);
          if (idx >= 0) {
            const ncd = nodesRef.current[idx].custom_data ? JSON.parse(nodesRef.current[idx].custom_data!) : {};
            ncd.fov = fov;
            nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          }
        };

        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setLensPickerOpen(false)}>
            <div className="rounded-2xl w-[380px] overflow-hidden" onClick={(e) => e.stopPropagation()}
              style={{ background: "rgba(16,16,16,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                <span className="text-sm font-bold text-[#ededed]">Seleccionar Lente</span>
                <span className="text-[10px] text-[#555] ml-1">Actual: {currentFov}°</span>
                <button onClick={() => setLensPickerOpen(false)} className="ml-auto text-[#555] hover:text-[#ededed] text-lg leading-none">&times;</button>
              </div>

              <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
                {lensPresets.map((lens) => {
                  const isActive = currentFov === lens.fov;
                  const isCustom = lens.mm === "custom";
                  return (
                    <div key={lens.name}>
                      <button
                        onClick={() => {
                          if (!isCustom) {
                            applyLens(lens.fov);
                            toast.success(`Lente: ${lens.name}`, { description: `${lens.fov}° (${lens.mm})` });
                          }
                        }}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                        style={{
                          background: isActive ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.02)",
                          border: `1px solid ${isActive ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)"}`,
                        }}
                      >
                        {/* FOV visual indicator */}
                        <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
                          <svg width="40" height="40" viewBox="0 0 40 40">
                            <path
                              d={(() => {
                                const cx = 20, cy = 20, r = 16;
                                const startAngle = -lens.fov / 2;
                                const endAngle = lens.fov / 2;
                                const x1 = cx + r * Math.cos(startAngle * Math.PI / 180 - Math.PI / 2);
                                const y1 = cy + r * Math.sin(startAngle * Math.PI / 180 - Math.PI / 2);
                                const x2 = cx + r * Math.cos(endAngle * Math.PI / 180 - Math.PI / 2);
                                const y2 = cy + r * Math.sin(endAngle * Math.PI / 180 - Math.PI / 2);
                                const largeArc = lens.fov > 180 ? 1 : 0;
                                return `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
                              })()}
                              fill={isActive ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)"}
                              stroke={isActive ? "#60a5fa" : "#555"}
                              strokeWidth="1"
                            />
                            <circle cx="20" cy="20" r="3" fill={isActive ? "#60a5fa" : "#888"} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold text-[#ededed]">{lens.name}</span>
                            {!isCustom && <span className="text-[10px] font-mono text-[#666]">{lens.mm}</span>}
                          </div>
                          <div className="text-[10px] text-[#777]">{lens.desc}</div>
                        </div>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: isActive ? "#60a5fa" : "#666" }}>
                          {lens.fov}°
                        </span>
                      </button>
                      {/* Custom FOV slider */}
                      {isCustom && (
                        <div className="mt-2 px-3 pb-1">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-[#666] shrink-0">5°</span>
                            <input
                              type="range" min="5" max="360" step="1" value={currentFov}
                              onChange={(e) => applyLens(parseInt(e.target.value))}
                              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                              style={{ background: `linear-gradient(to right, #3b82f6 ${((currentFov - 5) / 355) * 100}%, #333 0%)` }}
                            />
                            <span className="text-[10px] text-[#666] shrink-0">360°</span>
                          </div>
                          <div className="text-center text-[10px] text-[#888] mt-1 font-mono">{currentFov}°</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Zoom controls bottom-right ── */}
      <div className="absolute bottom-14 right-3 z-[10000] flex flex-col gap-1 rounded-2xl p-1"
        style={{ background: "rgba(10,10,10,0.85)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
        <button onClick={() => mapRef.current?.zoomIn()} title="Zoom In"
          className="flex items-center justify-center h-8 w-8 rounded-xl text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} title="Zoom Out"
          className="flex items-center justify-center h-8 w-8 rounded-xl text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
        </button>
        <button onClick={() => {
          if (mapRef.current && nodesRef.current.length > 0 && LRef.current) {
            const bounds = nodesRef.current.map((n) => [n.x, n.y] as [number, number]);
            mapRef.current.fitBounds(LRef.current.latLngBounds(bounds), { padding: [50, 50] });
          }
        }} title="Ajustar vista"
          className="flex items-center justify-center h-8 w-8 rounded-xl text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/></svg>
        </button>
      </div>

      {/* ── Map Clock ── */}
      <MapClock timeMachineTime={timeMachineTime} timeMachineOpen={timeMachineOpen} />

      {/* ── Status bar bottom ── */}
      {!readonly && (() => {
        const total = nodesRef.current.filter(n => n.kuma_monitor_id && n.icon !== "_textLabel" && n.icon !== "_waypoint").length;
        const up = nodesRef.current.filter(n => { const m = getMonitorData(n.kuma_monitor_id); return m?.status === 1; }).length;
        const down = nodesRef.current.filter(n => { const m = getMonitorData(n.kuma_monitor_id); return m?.status === 0; }).length;
        const pending = total - up - down;
        return (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 rounded-2xl px-4 py-1.5"
            style={{ background: "rgba(10,10,10,0.8)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)" }}>
            <span className="text-[10px] font-bold text-[#888]">{nodesRef.current.filter(n => n.icon !== "_textLabel" && n.icon !== "_waypoint").length} nodos</span>
            <span className="text-[10px] text-[#555]">|</span>
            <span className="flex items-center gap-1 text-[10px] font-bold"><span className="h-2 w-2 rounded-full bg-emerald-500" />{up} UP</span>
            {down > 0 && <span className="flex items-center gap-1 text-[10px] font-bold text-red-400"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />{down} DOWN</span>}
            {pending > 0 && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-500" />{pending}</span>}
            <span className="text-[10px] text-[#555]">|</span>
            <span className="text-[10px] text-[#888]">{edgesRef.current.length} links</span>
            <span className="text-[10px] text-[#555]">|</span>
            <span className="text-[10px] text-[#555]">Ctrl+Z deshacer &middot; Ctrl+S guardar</span>
          </div>
        );
      })()}

      {/* Time travel blur — only during drag */}
      {!readonly && <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 999,
          backdropFilter: timeDragging ? "blur(3px)" : "none",
          background: timeDragging ? "rgba(0,10,40,0.15)" : "transparent",
          transition: timeDragging ? "none" : "backdrop-filter 0.5s ease-out, background 0.5s ease-out",
        }}
      />}

      {/* Time Machine */}
      {!readonly && <TimeMachine
        open={timeMachineOpen}
        onToggle={() => setTimeMachineOpen((v) => !v)}
        onDragging={useCallback((d: boolean) => setTimeDragging(d), [])}
        mapMonitorIds={useMemo(() => nodesRef.current.filter(n => n.kuma_monitor_id).map(n => n.kuma_monitor_id!), [initialNodes])}
        onFocusEvent={useCallback((monitorId: number, eventType: "down" | "up") => {
          const node = nodesRef.current.find(n => n.kuma_monitor_id === monitorId);
          if (!node || !mapRef.current || !LRef.current) return;
          const L = LRef.current;
          const map = mapRef.current;
          const flashColor = eventType === "down" ? "#ef4444" : "#22c55e";
          const marker = markersRef.current.get(node.id);

          // Check if node is visible in current viewport — only pan if not visible
          const bounds = map.getBounds();
          const nodeLatLng = L.latLng(node.x, node.y);
          if (!bounds.contains(nodeLatLng)) {
            map.panTo(nodeLatLng, { animate: true, duration: 0.6 });
          }

          // Subtle vibration animation on marker (NO scale, NO transform)
          if (marker?.getElement()) {
            const el = marker.getElement();
            // Glow effect only — no position/scale changes
            el.style.filter = `drop-shadow(0 0 20px ${flashColor}) drop-shadow(0 0 40px ${flashColor}) brightness(1.8)`;
            el.style.transition = "filter 0.2s";
            // CSS vibration class
            el.classList.add("node-vibrate");
            setTimeout(() => {
              el.style.filter = `drop-shadow(0 0 10px ${flashColor}) brightness(1.2)`;
              el.style.transition = "filter 1.5s";
            }, 1500);
            setTimeout(() => {
              el.style.filter = "";
              el.style.transition = "filter 1s";
              el.classList.remove("node-vibrate");
            }, 4000);
          }

          // Pulse rings around the node (visual only, don't move node)
          for (let i = 0; i < 2; i++) {
            setTimeout(() => {
              const ring = L.circleMarker(nodeLatLng, {
                radius: 8, color: flashColor, fillColor: flashColor,
                fillOpacity: 0.3, weight: 2, opacity: 0.7,
              }).addTo(map);
              let r = 8;
              const iv = setInterval(() => {
                r += 1.5;
                ring.setRadius(r);
                ring.setStyle({ opacity: Math.max(0, 0.7 - r / 50), fillOpacity: Math.max(0, 0.3 - r / 70) });
                if (r > 45) { clearInterval(iv); try { map.removeLayer(ring); } catch {} }
              }, 30);
            }, i * 500);
          }

          // Open fail popup AFTER a short delay (ensures map settled)
          setTimeout(() => {
            if (eventType === "down") {
              const mon = kumaMonitors.find(m => m.id === monitorId);
              // Remove any existing popup for this node
              const existing = failPopupsRef.current.get(node.id);
              if (existing) { try { map.removeLayer(existing); } catch {} }

              const popup = L.popup({
                closeButton: false, autoClose: false, closeOnClick: false,
                className: "fail-popup-tm", offset: [0, -22], autoPan: false,
              })
                .setLatLng(nodeLatLng)
                .setContent(`
                  <div style="background:linear-gradient(135deg,#dc2626,#991b1b);border:2px solid #fca5a5;border-radius:14px;padding:10px 16px;min-width:160px;box-shadow:0 8px 32px rgba(239,68,68,0.4),0 0 60px rgba(239,68,68,0.2),inset 0 1px 0 rgba(255,255,255,0.15);animation:failPopupIn 0.4s cubic-bezier(0.34,1.56,0.64,1);">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                      <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;animation:failIconPulse 1.5s ease-in-out infinite;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <div>
                        <div style="color:white;font-size:13px;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${node.label}</div>
                        <div style="color:rgba(255,255,255,0.8);font-size:10px;font-weight:700;letter-spacing:0.05em;">▼ OFFLINE</div>
                      </div>
                    </div>
                    ${mon?.msg ? `<div style="color:rgba(255,255,255,0.65);font-size:9px;margin-top:2px;">${mon.msg}</div>` : ""}
                    <button onclick="window.__kumamap_showEventDetail(${monitorId})" style="margin-top:6px;width:100%;padding:4px 0;border-radius:8px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:white;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.2s;letter-spacing:0.05em;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">
                      📋 Detalles
                    </button>
                  </div>
                `);
              // Use addTo instead of openOn to avoid closing other popups
              popup.addTo(map);
              failPopupsRef.current.set(node.id, popup);

              // Register global handler for the Detalles button
              (window as any).__kumamap_showEventDetail = (mid: number) => {
                const m = kumaMonitors.find(km => km.id === mid);
                setEventDetail({
                  nodeLabel: node.label || "?",
                  monitorId: mid,
                  msg: m?.msg || mon?.msg || "",
                  time: new Date(),
                  type: m?.type || "unknown",
                  ping: m?.ping ?? null,
                  status: m?.status ?? 0,
                });
              };

              // Auto-close after 8s
              setTimeout(() => { try { map.removeLayer(popup); failPopupsRef.current.delete(node.id); } catch {} }, 8000);
            }
          }, 300); // Delay to let panTo settle
        }, [kumaMonitors])}
        onTimeChange={(time: Date | null, statuses: Map<number, number>) => {
          setTimeMachineTime(time);
          if (!LRef.current || !mapRef.current) return;
          const L = LRef.current;
          const map = mapRef.current;

          if (!time || statuses.size === 0) {
            // Back to LIVE — clear fail popups and re-render
            failPopupsRef.current.forEach((p) => { try { map.removeLayer(p); } catch {} });
            failPopupsRef.current.clear();
            renderNodes(L, map);
            renderEdges(L, map);
            return;
          }

          // Apply historical statuses to nodes + show dramatic fail popups
          // First close all existing fail popups
          failPopupsRef.current.forEach((p) => { try { map.removeLayer(p); } catch {} });
          failPopupsRef.current.clear();

          nodesRef.current.forEach((node) => {
            const marker = markersRef.current.get(node.id);
            if (!marker || !node.kuma_monitor_id) return;
            const st = statuses.get(node.kuma_monitor_id);
            if (st === undefined) return;
            const color = st === 0 ? "#ef4444" : st === 1 ? "#22c55e" : st === 3 ? "#8b5cf6" : "#f59e0b";
            marker.setIcon(createMarkerIcon(L, color, st === 0, false));

            // Show dramatic red fail popup for DOWN nodes
            if (st === 0) {
              const mon = kumaMonitors.find(m => m.id === node.kuma_monitor_id);
              const popup = L.popup({
                closeButton: false,
                autoClose: false,
                closeOnClick: false,
                className: "fail-popup-tm",
                offset: [0, -20],
                autoPan: false,
              })
                .setLatLng([node.x, node.y])
                .setContent(`
                  <div style="
                    background: linear-gradient(135deg, #dc2626, #991b1b);
                    border: 2px solid #fca5a5;
                    border-radius: 14px;
                    padding: 8px 14px;
                    min-width: 140px;
                    box-shadow: 0 8px 32px rgba(239,68,68,0.4), 0 0 60px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.15);
                    animation: failPopupIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                  ">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                      <div style="
                        width:24px;height:24px;border-radius:8px;
                        background:rgba(255,255,255,0.15);
                        display:flex;align-items:center;justify-content:center;
                        animation: failIconPulse 1.5s ease-in-out infinite;
                      ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      </div>
                      <div>
                        <div style="color:white;font-size:12px;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,0.3);">
                          ${node.label}
                        </div>
                        <div style="color:rgba(255,255,255,0.7);font-size:9px;font-weight:600;letter-spacing:0.05em;">
                          ▼ OFFLINE
                        </div>
                      </div>
                    </div>
                    ${mon?.msg ? `<div style="color:rgba(255,255,255,0.6);font-size:8px;margin-top:2px;font-style:italic;">${mon.msg}</div>` : ""}
                    ${time ? `<div style="color:rgba(255,255,255,0.5);font-size:8px;font-family:monospace;margin-top:3px;">
                      ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>` : ""}
                  </div>
                `)
                .openOn(map);
              failPopupsRef.current.set(node.id, popup);
            }
          });

          // Re-render edges with historical statuses
          // Temporarily override kumaMonitors statuses for renderEdges
          const originalStatuses = new Map<number, number | undefined>();
          kumaMonitors.forEach(m => {
            originalStatuses.set(m.id, m.status);
            const historicalStatus = statuses.get(m.id);
            if (historicalStatus !== undefined) {
              (m as any).status = historicalStatus;
            }
          });

          renderEdges(L, map);

          // Restore original statuses
          kumaMonitors.forEach(m => {
            (m as any).status = originalStatuses.get(m.id);
          });
        }}
        monitors={kumaMonitors.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          status: m.status,
          parent: m.parent,
        }))}
      />}

      {/* ── Event Detail Modal ── */}
      {eventDetail && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
          onClick={() => setEventDetail(null)}>
          <div className="rounded-3xl overflow-hidden" style={{ width: 420, background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)", animation: "failPopupIn 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}
            onClick={e => e.stopPropagation()}>
            {/* Red header */}
            <div style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", padding: "20px 24px" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div>
                  <div className="text-white text-lg font-black">{eventDetail.nodeLabel}</div>
                  <div className="text-white/70 text-sm font-semibold">▼ OFFLINE — Evento de falla</div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Estado", value: eventDetail.status === 0 ? "DOWN" : eventDetail.status === 1 ? "UP" : "PENDING", color: eventDetail.status === 0 ? "#ef4444" : "#22c55e" },
                  { label: "Tipo", value: eventDetail.type.toUpperCase(), color: "#60a5fa" },
                  { label: "Latencia", value: eventDetail.ping != null ? `${eventDetail.ping}ms` : "N/A", color: "#f59e0b" },
                  { label: "Monitor ID", value: `#${eventDetail.monitorId}`, color: "#8b5cf6" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="text-[10px] text-[#555] font-semibold uppercase tracking-wider">{label}</div>
                    <div className="text-sm font-bold mt-0.5" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Timestamp */}
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="text-[10px] text-[#555] font-semibold uppercase tracking-wider">Fecha y hora</div>
                <div className="text-sm font-mono font-bold text-[#ededed] mt-0.5">
                  {eventDetail.time.toLocaleDateString("es-UY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  {" — "}
                  {eventDetail.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>

              {/* Message */}
              {eventDetail.msg && (
                <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
                  <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Mensaje de error</div>
                  <div className="text-sm text-[#ccc] mt-0.5">{eventDetail.msg}</div>
                </div>
              )}

              {/* Export buttons */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => {
                  // Export as CSV/Excel
                  const rows = [
                    ["Campo", "Valor"],
                    ["Nodo", eventDetail.nodeLabel],
                    ["Estado", eventDetail.status === 0 ? "DOWN" : "UP"],
                    ["Tipo", eventDetail.type],
                    ["Latencia", eventDetail.ping != null ? `${eventDetail.ping}ms` : "N/A"],
                    ["Monitor ID", `${eventDetail.monitorId}`],
                    ["Fecha", eventDetail.time.toLocaleDateString()],
                    ["Hora", eventDetail.time.toLocaleTimeString()],
                    ["Mensaje", eventDetail.msg || ""],
                  ];
                  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
                  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `evento_${eventDetail.nodeLabel}_${eventDetail.time.toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all"
                  style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
                  Excel / CSV
                </button>
                <button onClick={() => {
                  // Print-friendly PDF via window.print
                  const w = window.open("", "_blank");
                  if (!w) return;
                  w.document.write(`<!DOCTYPE html><html><head><title>Evento - ${eventDetail.nodeLabel}</title>
                    <style>body{font-family:system-ui;padding:40px;color:#333}h1{color:#dc2626;margin-bottom:4px}
                    .badge{display:inline-block;padding:4px 12px;border-radius:8px;background:#fee2e2;color:#dc2626;font-weight:700;font-size:14px}
                    table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:10px 14px;border-bottom:1px solid #eee}
                    td:first-child{font-weight:600;color:#666;width:140px}td:last-child{color:#333}
                    .footer{margin-top:30px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:12px}</style></head>
                    <body>
                    <h1>⚠️ Reporte de Evento</h1>
                    <p style="color:#666;margin-bottom:20px">Generado por KumaMap</p>
                    <span class="badge">▼ ${eventDetail.status === 0 ? "OFFLINE" : "ONLINE"}</span>
                    <table>
                    <tr><td>Nodo</td><td><strong>${eventDetail.nodeLabel}</strong></td></tr>
                    <tr><td>Tipo</td><td>${eventDetail.type.toUpperCase()}</td></tr>
                    <tr><td>Latencia</td><td>${eventDetail.ping != null ? eventDetail.ping + "ms" : "N/A"}</td></tr>
                    <tr><td>Monitor ID</td><td>#${eventDetail.monitorId}</td></tr>
                    <tr><td>Fecha</td><td>${eventDetail.time.toLocaleDateString("es-UY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</td></tr>
                    <tr><td>Hora</td><td>${eventDetail.time.toLocaleTimeString()}</td></tr>
                    ${eventDetail.msg ? `<tr><td>Error</td><td style="color:#dc2626">${eventDetail.msg}</td></tr>` : ""}
                    </table>
                    <div class="footer">KumaMap Network Monitoring &bull; ${new Date().toLocaleString()}</div>
                    </body></html>`);
                  w.document.close();
                  setTimeout(() => w.print(), 500);
                }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                  PDF / Imprimir
                </button>
              </div>

              {/* Close */}
              <button onClick={() => setEventDetail(null)}
                className="w-full rounded-xl py-2 text-sm font-semibold text-[#666] transition-all hover:text-[#ededed] hover:bg-white/[0.04]"
                style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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
        /* Time Machine fail popup */
        .fail-popup-tm .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
        }
        .fail-popup-tm .leaflet-popup-content {
          margin: 0 !important;
        }
        .fail-popup-tm .leaflet-popup-tip {
          background: #dc2626 !important;
          border: 1px solid #fca5a5 !important;
          box-shadow: 0 4px 12px rgba(239,68,68,0.4) !important;
        }
        /* Subtle vibration for focused nodes — NO position/scale change */
        @keyframes nodeVibrate {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-1px, 0); }
          20% { transform: translate(1px, -1px); }
          30% { transform: translate(-1px, 1px); }
          40% { transform: translate(1px, 0); }
          50% { transform: translate(0, -1px); }
          60% { transform: translate(-1px, 0); }
          70% { transform: translate(1px, 1px); }
          80% { transform: translate(0, -1px); }
          90% { transform: translate(-1px, 0); }
        }
        .node-vibrate {
          animation: nodeVibrate 0.5s ease-in-out 3 !important;
        }
        @keyframes failPopupIn {
          0% { transform: scale(0.3) translateY(10px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes failIconPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
