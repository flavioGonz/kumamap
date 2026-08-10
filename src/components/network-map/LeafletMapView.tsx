"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import { toast } from "@/components/ui/SileoToast";
import type { KumaMonitor } from "./MonitorPanel";
import ContextMenu, { menuIcons } from "./ContextMenu";
import LinkModal, { type LinkFormData } from "./LinkModal";
import InputModal from "./InputModal";
import {
  Pencil,
  Signal,
  Download,
  Lock,
  Save,
  Loader2,
  Activity,
  Layers,
  Search,
  X as XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Tooltip from "./Tooltip";
import { SEPARATION_TYPES, separationStyle } from "@/lib/separation";
import { copperStyle, COPPER_MAX_M } from "@/lib/copper";
import { measure, formatMeters, calibrationFromReference, type MapBackgroundType } from "@/lib/measure";
import LaserPointer from "./LaserPointer";

// ── Heavy / conditional components — lazy loaded ──────────────────
const TimeMachine = dynamic(() => import("./TimeMachine"), { ssr: false });
const OnvifDiscoveryModal = dynamic(() => import("./OnvifDiscoveryModal"), { ssr: false });
const EventReportModal = dynamic(() => import("./EventReportModal"), { ssr: false });
const AntennaStatusPanel = dynamic(() => import("./AntennaStatusPanel"), { ssr: false });
const CameraStreamViewer = dynamic(() => import("./CameraStreamViewer"), { ssr: false });
const CameraTooltipViewer = dynamic(() => import("./CameraTooltipViewer"), { ssr: false });
const IconPickerModal = dynamic(() => import("./IconPickerModal"), { ssr: false });
const NodeSizeModal = dynamic(() => import("./NodeSizeModal"), { ssr: false });
const RackDesignerDrawer = dynamic(() => import("./RackDesignerDrawer"), { ssr: false });
const UpsPanel = dynamic(() => import("./UpsPanel"), { ssr: false });

// Type-only imports (erased at compile time — no bundle cost)
import type { CameraStreamConfig } from "./CameraStreamConfigModal";
const CameraStreamConfigModal = dynamic(() => import("./CameraStreamConfigModal"), { ssr: false });
import type { AntennaConfig } from "./AntennaConfigModal";
const AntennaConfigModal = dynamic(() => import("./AntennaConfigModal"), { ssr: false });
import type { UpsConfig } from "@/lib/ups";
const UpsConfigModal = dynamic(() => import("./UpsConfigModal"), { ssr: false });
import { safeJsonParse, safeFetch } from "@/lib/error-handler";
import type { NodeCustomData, EdgeCustomData, RackDeviceSummary } from "@/lib/types";
import { formatTraffic } from "@/utils/format";
import { statusColors, getStatusColor as _getStatusColor, getMonitorData as _getMonitorData } from "@/utils/status";
import { iconSvgPaths, getIconSvg, createMarkerIcon } from "@/utils/map-icons";
// map-export utils no longer used — export is now ZIP only
import MapClock from "./MapClock";
const VisualizationPanel = dynamic(() => import("./VisualizationPanel"), { ssr: false });
// AlertManagerPanel: hook useAlertCount must stay static, component is lazy
import { useAlertCount, type TimelineEvent } from "./AlertManagerPanel";
const AlertManagerPanel = dynamic(() => import("./AlertManagerPanel"), { ssr: false });
const WhatsAppSettingsPanel = dynamic(() => import("./WhatsAppSettingsPanel"), { ssr: false });
const FOVColorPickerModal = dynamic(() => import("./FOVColorPickerModal"), { ssr: false });
const LensPickerModal = dynamic(() => import("./LensPickerModal"), { ssr: false });
const NewMonitorModal = dynamic(() => import("./NewMonitorModal"), { ssr: false });
import { useUndoHistory } from "@/hooks/useUndoHistory";
import { useAnimationTimers } from "@/hooks/useAnimationTimers";
import { useMapVisibility } from "@/hooks/useMapVisibility";
import { useAlertSound } from "@/hooks/useAlertSound";
import { useMapKeyboard } from "@/hooks/useMapKeyboard";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { formatElapsed, formatSince, buildSparkline } from "./map-utils";
import type { NodeEditConfig } from "./NodeEditModal";
const NodeEditModal = dynamic(() => import("./NodeEditModal"), { ssr: false });
const AssignMonitorModal = dynamic(() => import("./AssignMonitorModal"), { ssr: false });
const LinkedMapsModal = dynamic(() => import("./LinkedMapsModal"), { ssr: false });
const HikDetectionPopup = dynamic(() => import("./HikDetectionPopup"), { ssr: false });
const LprFeedPanel = dynamic(() => import("./LprFeedPanel"), { ssr: false });
import { useHikEvents } from "@/lib/useHikEvents";
import { loadCameraWindows, saveCameraWindows, updateCameraWindow, removeCameraWindow } from "@/lib/camera-persistence";
import type { CameraWindowState } from "./CameraStreamViewer";
const SubnetDiscoveryModal = dynamic(() => import("./SubnetDiscoveryModal"), { ssr: false });


interface SavedNode {
  id: string;
  kuma_monitor_id: number | null;
  label: string;
  x: number; // latitude
  y: number; // longitude
  icon: string;
  width?: number;
  height?: number;
  color?: string | null;
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
  straightEdges?: boolean;
  showNodes?: boolean;
  showLabels?: boolean;
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
  onTogglePanel?: () => void;
  availableMaps?: { id: string; name: string }[];
  /** Image-type map: URL of the background photo */
  imageBackground?: string | null;
  /** Triggered when user wants to upload a new background image */
  onUploadBackground?: () => void;
  /** Triggered when user wants to switch map type to livemap */
  onSetLiveMap?: () => void;
  /** Tipo de fondo: "livemap" mide en metros reales; "image"/"grid" usa calibración. */
  backgroundType?: MapBackgroundType;
  /** Metros por unidad de mapa (image/grid); null = sin calibrar. */
  scaleMPerUnit?: number | null;
  /** Persistir la calibración (metros por unidad) del mapa. */
  onSaveScale?: (metersPerUnit: number | null) => void;
  /** Navigate to a linked map in the same window */
  onOpenMap?: (mapId: string) => void;
  /** Kiosk: expose map handle for programmatic flyTo */
  onMapReady?: (handle: KioskMapHandle) => void;
}

export interface KioskMapHandle {
  flyTo: (lat: number, lng: number, zoom: number, durationSec?: number) => void;
  fitAll: () => void;
  getNodes: () => SavedNode[];
  openPopup: (nodeId: string) => void;
  closePopup: () => void;
  /** Convert a node's map coordinates to screen pixel position (for overlay positioning) */
  getNodeScreenPos: (nodeId: string) => { x: number; y: number } | null;
}



const RackDevicePickerModal = dynamic(() => import("./RackDevicePickerModal"), { ssr: false });

/* ── Reusable Toolbar Dropdown ── */
function ToolbarDropdown({
  icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition-all"
        style={{
          color: open ? "var(--text-primary)" : "var(--text-secondary)",
          background: open ? "var(--surface-elevated)" : "transparent",
        }}
        onMouseEnter={(e) => { if (!open) { (e.currentTarget as HTMLElement).style.background = "var(--surface-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}}
        onMouseLeave={(e) => { if (!open) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}}
      >
        {icon}
        <span className="hidden xl:inline">{label}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl py-1 z-[99999] min-w-[170px]"
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-all"
      style={{
        color: active ? "#60a5fa" : "var(--text-secondary)",
        background: active ? "rgba(59,130,246,0.1)" : "transparent",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = active ? "rgba(59,130,246,0.15)" : "var(--surface-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = active ? "rgba(59,130,246,0.1)" : "transparent"; (e.currentTarget as HTMLElement).style.color = active ? "#60a5fa" : "var(--text-secondary)"; }}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {active && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto"><polyline points="20 6 9 17 4 12"/></svg>}
    </button>
  );
}

function DropdownSeparator() {
  return <div className="my-1 h-px" style={{ background: "var(--glass-border)" }} />;
}

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
  onTogglePanel,
  availableMaps = [],
  imageBackground = null,
  onUploadBackground,
  onSetLiveMap,
  backgroundType = "livemap",
  scaleMPerUnit = null,
  onSaveScale,
  onOpenMap,
  onMapReady,
}: LeafletMapViewProps) {
  const isImageMode = !!imageBackground;
  // ── Láser / medición / calibración ──
  const [laserActive, setLaserActive] = useState(false);
  const [rulerPts, setRulerPts] = useState<[number, number][]>([]);
  const [calibrateMode, setCalibrateMode] = useState(false);
  const [calibMeters, setCalibMeters] = useState("");
  const backgroundTypeRef = useRef<MapBackgroundType>(backgroundType);
  const scaleMPerUnitRef = useRef<number | null>(scaleMPerUnit);
  useEffect(() => { backgroundTypeRef.current = backgroundType; }, [backgroundType]);
  useEffect(() => { scaleMPerUnitRef.current = scaleMPerUnit; }, [scaleMPerUnit]);
  // Auto-refresh after 20 min idle to prevent memory leaks from Leaflet markers
  useAutoRefresh(20);

  // ── MikroTik traffic polling (2s interval, groups by router) ──
  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const pollMikrotik = async () => {
      if (!active) return;
      // Collect current MikroTik edges, group by router
      const routerGroups = new Map<string, {
        host: string; user: string; pass: string; port?: number;
        interfaces: string[];
        edgeMap: Map<string, string>; // edgeId → interface name
      }>();

      for (const edge of edgesRef.current) {
        const cd = safeJsonParse<EdgeCustomData>(edge.custom_data);
        if (!cd.mikrotikTraffic || cd.hideTraffic) continue;
        const mt = cd.mikrotikTraffic;
        const key = `${mt.host}:${mt.port || 0}:${mt.user}`;
        const g = routerGroups.get(key);
        if (g) {
          if (!g.interfaces.includes(mt.interface)) g.interfaces.push(mt.interface);
          g.edgeMap.set(edge.id, mt.interface);
        } else {
          routerGroups.set(key, {
            host: mt.host, user: mt.user, pass: mt.pass, port: mt.port,
            interfaces: [mt.interface],
            edgeMap: new Map([[edge.id, mt.interface]]),
          });
        }
      }

      if (routerGroups.size === 0) return;

      for (const [, group] of routerGroups) {
        try {
          const res = await fetch(apiUrl("/api/mikrotik/traffic"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              host: group.host, user: group.user, pass: group.pass,
              interfaces: group.interfaces, port: group.port,
            }),
          });
          if (!res.ok) continue;
          const json = await res.json() as { ts: number; interfaces: Record<string, { rxBps: number; txBps: number }> };

          for (const [edgeId, ifaceName] of group.edgeMap) {
            const ifaceData = json.interfaces?.[ifaceName];
            if (!ifaceData) continue;

            const existing = mikrotikDataRef.current.get(edgeId) || { current: null, history: [] };
            const sample = { rxBps: ifaceData.rxBps, txBps: ifaceData.txBps };
            existing.history.push(sample);
            if (existing.history.length > 60) existing.history.shift();
            existing.current = sample;
            mikrotikDataRef.current.set(edgeId, existing);

            // Live-update the existing Leaflet traffic label marker
            const L = LRef.current;
            const marker = labelMarkersRef.current.get(`${edgeId}-traffic`);
            if (marker && L) {
              const rx = sample.rxBps;
              const tx = sample.txBps;
              const rxFmt = formatTraffic(rx);
              const txFmt = formatTraffic(tx);
              const color = "#22c55e";

              // Rebuild dual sparkline
              let sparkSvg = "";
              if (existing.history.length >= 2) {
                const pts = existing.history.slice(-30);
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

              marker.setIcon(L.divIcon({
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
              }));
            }
          }
        } catch {
          // Ignore polling errors silently
        }
      }
    };

    // Start polling
    pollMikrotik();
    intervalId = setInterval(pollMikrotik, 2000);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — reads edgesRef.current each iteration

  const [alertOpen, setAlertOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const polledAlertCount = useAlertCount(60000);
  const [liveAlertCount, setLiveAlertCount] = useState<number | null>(null);
  const alertCount = liveAlertCount ?? polledAlertCount;
  // Sync polled count when it updates (reset live override)
  useEffect(() => { setLiveAlertCount(null); }, [polledAlertCount]);
  // ── Hikvision camera events (LPR / Face recognition) ──
  const hikEvents = useHikEvents(mapId);
  const [hikPopup, setHikPopup] = useState<{ event: import("@/lib/types").HikEvent; x: number; y: number } | null>(null);
  const hikPulsingNodes = useRef<Set<string>>(new Set());

  // Build nodeId → label map for LPR feed panel (camera names)
  const hikNodeLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    initialNodes.forEach((n) => { if (n.label) labels[n.id] = n.label; });
    return labels;
  }, [initialNodes]);

  // Open stream viewer from LPR feed panel
  const handleOpenStreamFromFeed = useCallback((nodeId: string) => {
    setStreamViewers((prev) => {
      if (prev.some((v) => v.nodeId === nodeId)) return prev;
      if (prev.length >= 4) return prev;
      return [...prev, { nodeId, mode: "pip" as const }];
    });
  }, []);

  // Show popup when a new detection arrives
  useEffect(() => {
    if (!hikEvents.latestEvent) return;
    const ev = hikEvents.latestEvent;
    // Only show popup for LPR / face events
    if (ev.eventType !== "anpr" && ev.eventType !== "face") {
      hikEvents.clearLatest();
      return;
    }
    // Find the node's screen position
    const node = nodesRef.current.find((n) => n.id === ev.nodeId);
    if (node && mapRef.current && LRef.current) {
      const point = mapRef.current.latLngToContainerOffset
        ? mapRef.current.latLngToContainerOffset(LRef.current.latLng(node.x, node.y))
        : mapRef.current.latLngToContainerPoint(LRef.current.latLng(node.x, node.y));
      setHikPopup({ event: ev, x: point.x, y: point.y });

      // Add pulsing animation to the node marker
      hikPulsingNodes.current.add(ev.nodeId);
      setTimeout(() => {
        hikPulsingNodes.current.delete(ev.nodeId);
      }, 5000);
    }
    hikEvents.clearLatest();
  }, [hikEvents.latestEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // When alerts panel is open it replaces the monitor sidebar
  const sidebarWidth = readonly ? 0 : alertOpen ? 380 : panelCollapsed ? 40 : 320;
  const monitorsRef = useRef<KumaMonitor[]>(kumaMonitors);
  const monitorIndexRef = useRef<Map<number, KumaMonitor>>(new Map());
  useEffect(() => {
    monitorsRef.current = kumaMonitors;
    const map = new Map<number, KumaMonitor>();
    kumaMonitors.forEach((m) => map.set(m.id, m));
    monitorIndexRef.current = map;

    // Fetch real down-since times from DB whenever monitors update and some are DOWN
    const downIds = kumaMonitors.filter(m => m.status === 0 && m.active).map(m => m.id);
    if (downIds.length > 0) {
      safeFetch<Record<string, string>>(apiUrl("/api/kuma/down-since"), undefined, "DownSince")
        .then((data) => {
          if (data) {
            for (const [idStr, isoTs] of Object.entries(data)) {
              const id = Number(idStr);
              const ts = new Date(isoTs).getTime();
              if (!isNaN(ts) && ts > 0) {
                // Always update — DB is authoritative for streak start time
                downSinceRef.current.set(id, ts);
              }
            }
          }
          // For any DOWN monitor that the DB didn't return a time for
          // (DB not configured or no heartbeat history), seed with Date.now()
          // so the badge at least starts counting from this moment.
          for (const id of downIds) {
            if (!downSinceRef.current.has(id)) {
              downSinceRef.current.set(id, Date.now());
            }
          }
        })
        .catch(() => {
          // DB not configured — seed all DOWN monitors with Date.now()
          for (const id of downIds) {
            if (!downSinceRef.current.has(id)) {
              downSinceRef.current.set(id, Date.now());
            }
          }
        });
    }
  }, [kumaMonitors]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  // ── O(1) node lookup by ID — rebuilt at the start of renderNodes/renderEdges ──
  const nodeByIdRef = useRef<Map<string, SavedNode>>(new Map());
  // ── Edge adjacency index — nodeId → edges touching that node ──
  const edgesByNodeRef = useRef<Map<string, SavedEdge[]>>(new Map());
  const markersRef = useRef<Map<string, any>>(new Map());
  const failPopupsRef = useRef<Map<string, any>>(new Map());
  const downSinceRef = useRef<Map<number, number>>(new Map()); // monitorId → timestamp when DOWN detected
  const downSinceFetchedRef = useRef(false); // flag to avoid duplicate fetches
  const downtimeMarkersRef = useRef<Map<string, any>>(new Map()); // edgeId → L.marker with timer
  const downtimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track animation timers to prevent accumulation on rapid events (extracted hook)
  const { safeTimeout } = useAnimationTimers();
  const polylinesRef = useRef<Map<string, any>>(new Map());
  const fovLayersRef = useRef<Map<string, any>>(new Map());
  const camHandlesRef = useRef<Map<string, any>>(new Map());
  const nodesRef = useRef<SavedNode[]>(initialNodes);
  const edgesRef = useRef<SavedEdge[]>(initialEdges);
  const LRef = useRef<any>(null);
  // Search state moved to MapSearchPanel component
  // exportMenuOpen removed — export is now a single ZIP button
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Effective readonly: true when prop readonly OR editMode is off
  const isLocked = readonly || !editMode;
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const [eventDetail, setEventDetail] = useState<{ nodeLabel: string; monitorId: number; msg: string; time: Date; type: string; ping: number | null; status: number } | null>(null);

  // Alert event tooltip state (shown when clicking an event in AlertManager)
  const [alertTooltip, setAlertTooltip] = useState<{
    event: TimelineEvent;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    edgeId?: string;
    latlng?: [number, number]; // map-level right-click position for paste
  } | null>(null);
  const ctxHandledRef = useRef(false); // flag to prevent map ctx when edge/node ctx fires

  // Link creation state
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const linkSourceRef = useRef<string | null>(null);
  const [pendingLinkTarget, setPendingLinkTarget] = useState<string | null>(null);

  // Rack device picker — shown when a link endpoint is a rack node
  const [rackPickerState, setRackPickerState] = useState<{
    rackNodeId: string;
    side: "source" | "target";
    pendingSourceId: string;
    pendingTargetId: string;
    pendingSourceInterface?: string; // already selected if source was picked first
  } | null>(null);

  // Modal states
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalData, setLinkModalData] = useState<{ sourceId: string; targetId: string; edgeId?: string; initial?: Partial<LinkFormData> }>({ sourceId: "", targetId: "" });
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputModalConfig, setInputModalConfig] = useState<NodeEditConfig>({ nodeId: "", initial: "" });
  const [showPass, setShowPass] = useState(false);

  // Camera stream modals
  const [streamConfigNodeId, setStreamConfigNodeId] = useState<string | null>(null);
  // Antenna config modal + SNMP wireless panel
  const [antennaConfigNodeId, setAntennaConfigNodeId] = useState<string | null>(null);
  const [antennaSnmpNodeId, setAntennaSnmpNodeId] = useState<string | null>(null);
  const [upsPanelState, setUpsPanelState] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [upsConfigNodeId, setUpsConfigNodeId] = useState<string | null>(null);
  const [streamViewers, setStreamViewers] = useState<{ nodeId: string; mode: "tooltip" | "pip" }[]>([]);
  const [focusedViewer, setFocusedViewer] = useState<string | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const MAX_STREAMS = 4;
  // Camera window position/size persistence
  const cameraWindowStates = useRef<Map<string, CameraWindowState>>(new Map());
  const camerasRestored = useRef(false);

  // Icon picker & Node size modals (Leaflet)
  const [iconPickerNodeId, setIconPickerNodeId] = useState<string | null>(null);
  const [nodeSizeModalNodeId, setNodeSizeModalNodeId] = useState<string | null>(null);
  const [rackDrawerNodeId, setRackDrawerNodeId] = useState<string | null>(null);

  // New Monitor creation
  const [newMonitorModalOpen, setNewMonitorModalOpen] = useState(false);
  const [sizePickerNodeId, setSizePickerNodeId] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignNodeId, setAssignNodeId] = useState<string>("");
  const [assignSearch, setAssignSearch] = useState("");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  // ── Visibility, rotation, opacity, straight-edges (extracted hook) ──
  const visibility = useMapVisibility(
    { markersRef, polylinesRef, fovLayersRef, camHandlesRef, mapRef, nodesRef: nodesRef as any, containerRef },
    { showNodes: initialViewState?.showNodes, showLabels: initialViewState?.showLabels, straightEdges: initialViewState?.straightEdges, overlayOpacity: initialViewState?.overlayOpacity },
  );
  const {
    showNodes, setShowNodes, showLinks, setShowLinks, showCameras, setShowCameras,
    showFOV, setShowFOV, showLabels, setShowLabels, mapRotation, setMapRotation,
    overlayOpacity, setOverlayOpacity, straightEdges, setStraightEdges, straightEdgesRef,
  } = visibility;
  const [timeDragging, setTimeDragging] = useState(false);
  const [polygonMode, setPolygonMode] = useState(false);
  const polygonPointsRef = useRef<[number, number][]>([]);
  const polygonPreviewRef = useRef<any>(null);
  const polygonLayersRef = useRef<Map<string, any>>(new Map());

  // ── Measurement / ruler tool state ──
  const [measureMode, setMeasureMode] = useState(false);
  const measureModeRef = useRef(false);
  const measurePointsRef = useRef<[number, number][]>([]);
  const measureLayersRef = useRef<any[]>([]);
  const edgeUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importMapPickerOpen, setImportMapPickerOpen] = useState(false);
  const [importMapSearch, setImportMapSearch] = useState("");
  const [importingMapId, setImportingMapId] = useState<string | null>(null);
  const [nodeMapModalNodeId, setNodeMapModalNodeId] = useState<string | null>(null);
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
  const [onvifModalOpen, setOnvifModalOpen] = useState(false);
  const [timeMachineOpen, setTimeMachineOpen] = useState(false);
  const [timeMachineTime, setTimeMachineTime] = useState<Date | null>(null);
  const [tmFocusMonitorId, setTmFocusMonitorId] = useState<number | null>(null);
  const [tmJumpTo, setTmJumpTo] = useState<{ time: Date; monitorId: number } | null>(null);
  // Compute monitor IDs for nodes on THIS map — used by TimeMachine to filter events
  const [mapMonitorIdsVersion, setMapMonitorIdsVersion] = useState(0);
  const mapMonitorIds = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    mapMonitorIdsVersion; // reactive trigger
    return nodesRef.current
      .filter(n => n.kuma_monitor_id != null && n.kuma_monitor_id > 0)
      .map(n => n.kuma_monitor_id!);
  }, [initialNodes, mapMonitorIdsVersion]);

  // ── Memoized derived data (avoids new-object-every-render for child props) ──
  const tmMonitors = useMemo(() => kumaMonitors.map((m) => ({
    id: m.id, name: m.name, type: m.type, status: m.status, parent: m.parent,
  })), [kumaMonitors]);
  const snmpMonitorsMemo = useMemo(() => kumaMonitors.filter(
    (m) => m.type === "snmp" || m.type === "push" || m.type === "port"
  ), [kumaMonitors]);
  const lprEventsMemo = useMemo(() => hikEvents.events.filter(
    (e: any) => e.eventType === "anpr"
  ), [hikEvents.events]);

  const [timeBlurPulse, setTimeBlurPulse] = useState(0);
  const [colorPickerNodeId, setColorPickerNodeId] = useState<string>("");

  // ── Toolbar dropdown states ──
  // ── Toolbar dropdown — only one open at a time (saves 3 useState) ──
  const [activeDropdown, setActiveDropdown] = useState<"nodos" | "dibujar" | "mapa" | "brillo" | null>(null);
  const ddNodos = activeDropdown === "nodos";
  const ddDibujar = activeDropdown === "dibujar";
  const ddMapa = activeDropdown === "mapa";
  const ddBrillo = activeDropdown === "brillo";
  const [tbSearch, setTbSearch] = useState("");
  const [tbSearchResults, setTbSearchResults] = useState<Array<{ id: string; label: string; x: number; y: number }>>([]);
  const [tbSearchFocused, setTbSearchFocused] = useState(false);
  const closeAllDropdowns = useCallback(() => { setActiveDropdown(null); }, []);
  const [lensPickerOpen, setLensPickerOpen] = useState(false);
  const [lensPickerNodeId, setLensPickerNodeId] = useState<string>("");

  // ── Undo history (extracted hook) ──
  const { pushUndo, performUndo } = useUndoHistory<SavedNode, SavedEdge>(
    nodesRef,
    edgesRef,
    () => {
      if (LRef.current && mapRef.current) {
        renderNodes(LRef.current, mapRef.current);
        renderEdges(LRef.current, mapRef.current);
      }
    },
  );

  // Re-render nodes when editMode changes so draggable flag updates
  useEffect(() => {
    if (LRef.current && mapRef.current) {
      renderNodes(LRef.current, mapRef.current);
    }
  }, [editMode]);

  // Keep ref in sync with state for closures
  useEffect(() => { linkSourceRef.current = linkSource; }, [linkSource]);
  useEffect(() => {
    measureModeRef.current = measureMode;
    // Toggle crosshair cursor on the map container while measuring
    const container = containerRef.current;
    if (container) {
      if (measureMode) container.style.cursor = "crosshair";
      else container.style.cursor = "";
    }
  }, [measureMode]);

  // Visibility toggles + map rotation are handled by useMapVisibility hook

  // ── Keyboard shortcuts (extracted hook) ──
  useMapKeyboard({
    onEscape: () => {
      if (measureModeRef.current) { clearMeasurement(); setMeasureMode(false); }
      if (linkSourceRef.current) cancelLinkCreation();
      if (polygonPointsRef.current.length > 0) cancelPolygon();
      setPolygonMode(false);
      setCtxMenu(null);
    },
    onUndo: performUndo,
    onSave: () => handleSave(),
  });

  // ── Alert sound (extracted hook) ──
  const playAlertSound = useAlertSound();

  const handleTimeDragging = useCallback((d: boolean) => setTimeDragging(d), []);

  const handleTimeMachineFocusEvent = useCallback((monitorId: number, eventType: "down" | "up") => {
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
      safeTimeout(() => {
        el.style.filter = `drop-shadow(0 0 10px ${flashColor}) brightness(1.2)`;
        el.style.transition = "filter 1.5s";
      }, 1500);
      safeTimeout(() => {
        el.style.filter = "";
        el.style.transition = "filter 1s";
        el.classList.remove("node-vibrate");
      }, 4000);
    }

    // Pulse rings around the node (visual only, don't move node)
    for (let i = 0; i < 2; i++) {
      safeTimeout(() => {
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

    // Open event popup AFTER a short delay (ensures map settled)
    safeTimeout(() => {
      const mon = kumaMonitors.find(m => m.id === monitorId);
      const existing = failPopupsRef.current.get(node.id);
      if (existing) { try { map.removeLayer(existing); } catch {} }

      // Colors based on event type
      const isDown = eventType === "down";
      const bgGrad = isDown ? "linear-gradient(135deg,#dc2626,#991b1b)" : "linear-gradient(135deg,#16a34a,#15803d)";
      const borderColor = isDown ? "#fca5a5" : "#86efac";
      const shadowColor = isDown ? "rgba(239,68,68" : "rgba(34,197,94";
      const statusText = isDown ? "▼ OFFLINE" : "▲ RECOVERED";
      const icon = isDown
        ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
        : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';

      const popup = L.popup({
        closeButton: false, autoClose: false, closeOnClick: false,
        className: "fail-popup-tm", offset: [0, -22], autoPan: false,
      })
        .setLatLng(nodeLatLng)
        .setContent(`
          <div style="background:${bgGrad};border:2px solid ${borderColor};border-radius:14px;padding:10px 16px;min-width:160px;box-shadow:0 8px 32px ${shadowColor},0.4),0 0 60px ${shadowColor},0.2),inset 0 1px 0 rgba(255,255,255,0.15);animation:failPopupIn 0.4s cubic-bezier(0.34,1.56,0.64,1);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;animation:failIconPulse 1.5s ease-in-out infinite;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">${icon}</svg>
              </div>
              <div>
                <div style="color:white;font-size:13px;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${node.label}</div>
                <div style="color:rgba(255,255,255,0.8);font-size:10px;font-weight:700;letter-spacing:0.05em;">${statusText}</div>
              </div>
            </div>
            ${mon?.msg ? `<div style="color:rgba(255,255,255,0.65);font-size:9px;margin-top:2px;">${mon.msg}</div>` : ""}
            <button onclick="window.__kumamap_showEventDetail(${monitorId})" style="margin-top:6px;width:100%;padding:4px 0;border-radius:8px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:white;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.2s;letter-spacing:0.05em;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">
              📋 Detalles
            </button>
          </div>
        `);
      popup.addTo(map);
      failPopupsRef.current.set(node.id, popup);

      // Global handler is now registered via useEffect above

      safeTimeout(() => { try { map.removeLayer(popup); failPopupsRef.current.delete(node.id); } catch {} }, 8000);
    }, 300);
  }, [kumaMonitors]);

  // ── Global handler so rack‑popup device rows can open EventReportModal ──
  useEffect(() => {
    (window as any).__kumamap_showEventDetail = (mid: number, label?: string) => {
      const m = kumaMonitors.find(km => km.id === mid);
      setEventDetail({
        nodeLabel: label || m?.name || "?",
        monitorId: mid,
        msg: m?.msg || "",
        time: new Date(),
        type: m?.type || "unknown",
        ping: m?.ping ?? null,
        status: m?.status ?? 0,
      });
    };
    return () => { delete (window as any).__kumamap_showEventDetail; };
  }, [kumaMonitors]);

  // Handler for clicking an event in AlertManagerPanel
  const handleAlertEventClick = useCallback((ev: TimelineEvent) => {
    const node = nodesRef.current.find(n => n.kuma_monitor_id === ev.monitorId);
    if (!mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    const isDown = ev.status === 0;
    const flashColor = isDown ? "#ef4444" : "#22c55e";

    // Open Time Machine and jump to event time
    setTimeMachineOpen(true);
    setTmFocusMonitorId(ev.monitorId);
    setTmJumpTo({ time: new Date(ev.time), monitorId: ev.monitorId });

    // If node found on map, fly to it + zoom
    if (node) {
      const nodeLatLng = L.latLng(node.x, node.y);
      // Always fly and zoom to a good level so node is centered and visible
      const targetZoom = Math.max(map.getZoom(), 17);
      map.flyTo(nodeLatLng, targetZoom, { animate: true, duration: 1 });

      // Flash marker after flyTo completes
      safeTimeout(() => {
        const marker = markersRef.current.get(node.id);
        if (marker?.getElement()) {
          const el = marker.getElement();
          el.style.filter = `drop-shadow(0 0 20px ${flashColor}) drop-shadow(0 0 40px ${flashColor}) brightness(1.8)`;
          el.style.transition = "filter 0.2s";
          el.classList.add("node-vibrate");
          safeTimeout(() => { el.style.filter = `drop-shadow(0 0 10px ${flashColor}) brightness(1.2)`; el.style.transition = "filter 1.5s"; }, 1500);
          safeTimeout(() => { el.style.filter = ""; el.style.transition = "filter 1s"; el.classList.remove("node-vibrate"); }, 4000);
        }

        // Pulse ring
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
      }, 600);

      // Show event tooltip popup on the node
      safeTimeout(() => {
        const existing = failPopupsRef.current.get(`alert-${ev.monitorId}`);
        if (existing) { try { map.removeLayer(existing); } catch {} }

        const statusLabel = isDown ? "▼ CAÍDO" : ev.status === 1 ? "▲ ACTIVO" : ev.status === 2 ? "● PENDIENTE" : "◆ MANT.";
        const bgGrad = isDown ? "linear-gradient(135deg,#dc2626,#991b1b)" : "linear-gradient(135deg,#16a34a,#15803d)";
        const borderColor = isDown ? "#fca5a5" : "#86efac";
        const shadowColor = isDown ? "rgba(239,68,68" : "rgba(34,197,94";
        const evDate = new Date(ev.time);
        const timeStr = evDate.toLocaleString("es-UY", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" });

        const popup = L.popup({
          closeButton: true, autoClose: false, closeOnClick: true,
          className: "fail-popup-tm", offset: [0, -22], autoPan: false,
        })
          .setLatLng(nodeLatLng)
          .setContent(`
            <div style="background:${bgGrad};border:2px solid ${borderColor};border-radius:14px;padding:10px 16px;min-width:180px;max-width:260px;box-shadow:0 8px 32px ${shadowColor},0.4),0 0 40px ${shadowColor},0.15);animation:failPopupIn 0.4s cubic-bezier(0.34,1.56,0.64,1);">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                </div>
                <div>
                  <div style="color:white;font-size:13px;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${ev.monitorName}</div>
                  <div style="color:rgba(255,255,255,0.8);font-size:10px;font-weight:700;letter-spacing:0.05em;">${statusLabel}</div>
                </div>
              </div>
              <div style="color:rgba(255,255,255,0.6);font-size:9px;font-family:monospace;margin-bottom:4px;">
                🕐 ${timeStr}
              </div>
              ${ev.msg ? `<div style="color:rgba(255,255,255,0.55);font-size:9px;word-break:break-word;line-height:1.3;">${ev.msg.substring(0, 120)}${ev.msg.length > 120 ? "…" : ""}</div>` : ""}
              ${ev.ping != null && ev.ping > 0 ? `<div style="color:rgba(255,255,255,0.4);font-size:9px;margin-top:3px;font-family:monospace;">ping: ${ev.ping}ms</div>` : ""}
            </div>
          `);
        popup.addTo(map);
        failPopupsRef.current.set(`alert-${ev.monitorId}`, popup);

        // Auto-remove after 12s
        safeTimeout(() => { try { map.removeLayer(popup); failPopupsRef.current.delete(`alert-${ev.monitorId}`); } catch {} }, 12000);
      }, 1000);
    }
  }, [kumaMonitors, readonly]);

  const handleTimeMachineChange = useCallback((time: Date | null, statuses: Map<number, number>) => {
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
      const ncd = safeJsonParse<NodeCustomData>(node.custom_data);
      marker.setIcon(createMarkerIcon(L, color, st === 0, false, ncd.nodeSize || 1.0, node.icon || "server"));

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
  }, [kumaMonitors]);

  // Map style
  const [mapStyle, setMapStyle] = useState<"dark" | "satellite" | "streets">(initialViewState?.mapStyle || "dark");
  const tileLayerRef = useRef<any>(null);
  const labelMarkersRef = useRef<Map<string, any>>(new Map());

  // MikroTik traffic polling data: edgeId → { current, history }
  const mikrotikDataRef = useRef<Map<string, { current: { rxBps: number; txBps: number } | null; history: { rxBps: number; txBps: number }[] }>>(new Map());

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

      if (imageBackground) {
        // ── IMAGE MODE: Leaflet CRS.Simple with photo background ──
        map = L.map(containerRef.current, {
          crs: L.CRS.Simple,
          minZoom: -10,   // temporary low value; overridden after image loads
          maxZoom: 5,
          zoomControl: false,
          attributionControl: false,
          maxBoundsViscosity: 1.0, // hard clamp — no rubber-band outside image
        });
        mapRef.current = map;

        const fitImageToContainer = (m: any, bounds: [[number,number],[number,number]]) => {
          // Recalculate size then fit — must happen in this order
          m.invalidateSize({ animate: false });
          m.fitBounds(bounds, { padding: [0, 0], animate: false });
          // Lock min zoom so user can never zoom out past the full-image view
          const fitZoom = m.getZoom();
          m.setMinZoom(fitZoom);
        };

        const img = new window.Image();
        img.onload = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          // bounds: top-left=[−h,0], bottom-right=[0,w] (y negated so top is y=0)
          const imgBounds: [[number,number],[number,number]] = [[-h, 0], [0, w]];
          L.imageOverlay(imageBackground, imgBounds, { opacity: 1 }).addTo(map);
          map.setMaxBounds(imgBounds);

          map.on("click", (e: any) => {
            if (measureModeRef.current) { handleMeasureClick(e.latlng); return; }
            if (polygonPointsRef.current !== undefined && document.querySelector("[data-polygon-active]")) {
              handlePolygonClick(e.latlng);
            }
            // Hide all label rotation handles when clicking on the map
            camHandlesRef.current.forEach((handle, key) => {
              if (key.endsWith("-labelrot")) {
                const el = handle.getElement();
                if (el) el.style.display = "none";
              }
            });
          });
          map.on("dblclick", (e: any) => {
            if (measureModeRef.current) { e.originalEvent?.preventDefault?.(); finishMeasurement(); return; }
            if (polygonPointsRef.current.length >= 3 && document.querySelector("[data-polygon-active]")) {
              e.originalEvent?.preventDefault?.();
              finishPolygon();
            }
          });
          map.on("contextmenu", (e: any) => {
            if (isLockedRef.current) {
              e.originalEvent?.preventDefault?.();
              toast.info("Activa el modo edición (icono lápiz) para modificar el mapa", { id: "edit-lock-hint" });
              return;
            }
            e.originalEvent?.preventDefault?.();
            // Defer so edge/node/polygon handlers (which fire synchronously on the
            // same event) have a chance to set ctxHandledRef before we act.
            setTimeout(() => {
              if (ctxHandledRef.current) { ctxHandledRef.current = false; return; }
              setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, latlng: [e.latlng.lat, e.latlng.lng] });
            }, 0);
          });

          // First fit — container may not have final size yet, so do it twice
          fitImageToContainer(map, imgBounds);

          setTimeout(() => {
            if (mapRef.current !== map) return;
            // Restore saved view OR refit to image after container settles
            if (initialViewState?.center && initialViewState?.zoom !== undefined) {
              map.invalidateSize({ animate: false });
              map.setView(initialViewState.center as [number, number], initialViewState.zoom, { animate: false });
              // Still recalculate minZoom in case container size changed
              const tmpFit = map.getBoundsZoom(imgBounds, false);
              map.setMinZoom(tmpFit);
            } else {
              fitImageToContainer(map, imgBounds);
            }
            renderNodes(L, map);
            renderEdges(L, map);
          }, 200);
        };
        img.onerror = () => {
          // Fallback — image missing; show dark canvas at default size
          const imgBounds: [[number,number],[number,number]] = [[-1080, 0], [0, 1920]];
          map.setMaxBounds(imgBounds);
          setTimeout(() => {
            if (mapRef.current !== map) return;
            fitImageToContainer(map, imgBounds);
            renderNodes(L, map);
            renderEdges(L, map);
          }, 200);
        };
        img.src = imageBackground;
      } else {
        // ── LIVEMAP MODE: OSM tiles ──
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

        mapRef.current = map;

        // General map click handler (for polygon drawing + measurement)
        map.on("click", (e: any) => {
          if (measureModeRef.current) { handleMeasureClick(e.latlng); return; }
          if (polygonPointsRef.current !== undefined && document.querySelector("[data-polygon-active]")) {
            handlePolygonClick(e.latlng);
          }
          // Hide all label rotation handles when clicking on the map
          camHandlesRef.current.forEach((handle, key) => {
            if (key.endsWith("-labelrot")) {
              const el = handle.getElement();
              if (el) el.style.display = "none";
            }
          });
        });
        map.on("dblclick", (e: any) => {
          if (measureModeRef.current) { e.originalEvent?.preventDefault?.(); finishMeasurement(); return; }
          if (polygonPointsRef.current.length >= 3 && document.querySelector("[data-polygon-active]")) {
            e.originalEvent?.preventDefault?.();
            finishPolygon();
          }
        });
        map.on("contextmenu", (e: any) => {
          if (isLockedRef.current) {
            e.originalEvent?.preventDefault?.();
            toast.info("Activa el modo edición (icono lápiz) para modificar el mapa", { id: "edit-lock-hint" });
            return;
          }
          e.originalEvent?.preventDefault?.();
          setTimeout(() => {
            if (ctxHandledRef.current) { ctxHandledRef.current = false; return; }
            setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, latlng: [e.latlng.lat, e.latlng.lng] });
          }, 0);
        });

        // Render initial nodes after map is ready
        map.whenReady(() => {
          // Delay render slightly to ensure map is fully settled (fixes label scatter bug)
          setTimeout(() => {
            if (mapRef.current !== map) return;
            map.invalidateSize();
            renderNodes(L, map);
            renderEdges(L, map);
            if (initialNodes.length > 0) {
              const bounds = initialNodes.map((n) => [n.x, n.y] as [number, number]);
              if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
            }
          // Expose kiosk handle when map + nodes are ready
          if (onMapReady) {
            onMapReady({
              flyTo: (lat, lng, zoom, dur = 1.5) => {
                if (dur <= 0) {
                  map.setView([lat, lng], zoom, { animate: false });
                } else {
                  map.flyTo([lat, lng], zoom, { animate: true, duration: dur });
                }
              },
              fitAll: () => {
                const b = nodesRef.current.map(n => [n.x, n.y] as [number, number]);
                if (b.length) map.fitBounds(b, { padding: [50, 50], animate: true });
              },
              getNodes: () => nodesRef.current,
              openPopup: (nodeId: string) => {
                const node = nodesRef.current.find(n => n.id === nodeId);
                const marker = markersRef.current.get(nodeId);
                if (!node || !marker) return;
                const popup = L.popup({ className: "leaflet-popup-dark", maxWidth: 280 })
                  .setLatLng(marker.getLatLng())
                  .setContent(createPopupContent(node));
                popup.openOn(map);
              },
              closePopup: () => {
                map.closePopup();
              },
              getNodeScreenPos: (nodeId: string) => {
                const node = nodesRef.current.find(n => n.id === nodeId);
                if (!node) return null;
                const pt = map.latLngToContainerPoint([node.x, node.y]);
                return { x: pt.x, y: pt.y };
              },
            });
          }
          }, 300);
        });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Switch tile layer (livemap mode only)
  useEffect(() => {
    if (isImageMode) return;
    if (!mapRef.current || !LRef.current || !tileLayerRef.current) return;
    const tile = tileUrls[mapStyle];
    mapRef.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = LRef.current.tileLayer(tile.url, { maxZoom: tile.maxZoom, maxNativeZoom: tile.maxNativeZoom }).addTo(mapRef.current);
  }, [mapStyle]);

  // ── Restore persisted camera windows ──
  useEffect(() => {
    if (camerasRestored.current) return;
    camerasRestored.current = true;
    const saved = loadCameraWindows(mapId);
    if (saved.length > 0) {
      // Validate that saved nodeIds still exist in the current map
      const nodeIds = new Set(initialNodes.map(n => n.id));
      const valid = saved.filter(s => nodeIds.has(s.nodeId));
      if (valid.length > 0) {
        // Populate window states ref
        valid.forEach(s => cameraWindowStates.current.set(s.nodeId, s));
        // Open the viewers
        setStreamViewers(valid.map(s => ({ nodeId: s.nodeId, mode: "pip" as const })));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers when kuma data changes
  useEffect(() => {
    if (!mapRef.current || !LRef.current) return;
    updateMarkerStatus();
  }, [kumaMonitors]);

  // Downtime counter interval — update every second
  useEffect(() => {
    downtimeIntervalRef.current = setInterval(() => {
      if (mapRef.current && LRef.current) {
        updateDowntimeCounters();
      }
    }, 1000);
    return () => {
      if (downtimeIntervalRef.current) clearInterval(downtimeIntervalRef.current);
    };
  }, []);

  // Performance: index monitors by ID for O(1) lookup instead of O(n) .find()
  const monitorIndex = useMemo(() => {
    const map = new Map<number, KumaMonitor>();
    kumaMonitors.forEach((m) => map.set(m.id, m));
    return map;
  }, [kumaMonitors]);

  function getStatusColor(monitorId: number | null): string {
    return _getStatusColor(monitorId, monitorIndexRef.current);
  }

  function getMonitorData(monitorId: number | null): KumaMonitor | undefined {
    return _getMonitorData(monitorId, monitorIndexRef.current);
  }

  // ── Rack aggregated status ────────────────────────────────────────────────────
  // Returns the worst status across all monitored devices inside a rack node.
  function getRackStatus(node: SavedNode): {
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
      const m = getMonitorData(d.monitorId!);
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

  // buildSparkline imported from ./map-utils

  // Ping history cache
  const pingHistoryRef = useRef<Map<number, number[]>>(new Map());

  function createPopupContent(node: SavedNode): string {
    const cd = safeJsonParse<NodeCustomData>(node.custom_data);

    // ── Rack popup — aggregated status from all device monitors ──────────────
    if (node.icon === "_rack" && cd.type === "rack") {
      const rack = getRackStatus(node);
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

    const m = getMonitorData(node.kuma_monitor_id);
    const color = getStatusColor(node.kuma_monitor_id);
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
    const history = node.kuma_monitor_id ? (pingHistoryRef.current.get(node.kuma_monitor_id) || []) : [];
    const sparkline = history.length >= 3 ? buildSparkline(history) : "";

    // Async fetch history (updates for next popup open)
    if (node.kuma_monitor_id) {
      safeFetch<{ ping: number | null }[]>(apiUrl(`/api/kuma/history/${node.kuma_monitor_id}`), undefined, "PingHistory").then(data => {
        if (!data) return;
        const pings = data.filter(h => h.ping != null).map(h => h.ping!).slice(-30);
        pingHistoryRef.current.set(node.kuma_monitor_id!, pings);
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

  function renderNodes(L: any, map: any) {
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
      if (!isLabel && !isWaypoint) {
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
        if (isWaypoint || isPolygon) return;
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

  // Trace a route through waypoints to find the REAL endpoint nodes (with kuma_monitor_id)
  // Waypoints (icon === "waypoint" or no kuma_monitor_id and connected to exactly 2 edges) are transparent
  function findRealEndpoints(edgeId: string, edge?: SavedEdge): { srcStatus: number | undefined; tgtStatus: number | undefined } {
    const e = edge || edgesRef.current.find((e) => e.id === edgeId);
    if (!e) return { srcStatus: undefined, tgtStatus: undefined };

    const nodeIdx = nodeByIdRef.current;   // O(1) node lookup
    const edgeAdj = edgesByNodeRef.current; // O(1) adjacent edges lookup

    // Walk from source side to find real node
    function walkToRealNode(startNodeId: string, fromEdgeId: string, visited: Set<string>): number | undefined {
      const node = nodeIdx.get(startNodeId);
      if (!node) return undefined;

      // If this node has a kuma monitor, it's a real node — return its status
      // Return -1 for paused monitors so link popup shows "PAUSADO" instead of wrong color
      if (node.kuma_monitor_id) {
        const mon = monitorIndexRef.current.get(node.kuma_monitor_id);
        if (mon && !mon.active) return -1;
        return mon?.status;
      }

      // If this is a waypoint/blind node (not a label, camera, polygon), follow the chain
      const isWaypoint = node.icon === "_waypoint" || (node.icon !== "_textLabel" && node.icon !== "_camera" && node.icon !== "_polygon" && !node.kuma_monitor_id);
      if (!isWaypoint) return undefined;

      visited.add(fromEdgeId);

      // Find other edges connected to this waypoint via adjacency index (O(1) lookup)
      const adjacent = edgeAdj.get(startNodeId) || [];
      for (const nextEdge of adjacent) {
        if (visited.has(nextEdge.id)) continue;
        const nextNodeId = nextEdge.source_node_id === startNodeId ? nextEdge.target_node_id : nextEdge.source_node_id;
        const result = walkToRealNode(nextNodeId, nextEdge.id, visited);
        if (result !== undefined) return result;
      }

      return undefined; // dead end — no real node found
    }

    const srcStatus = walkToRealNode(e.source_node_id, edgeId, new Set([edgeId]));
    const tgtStatus = walkToRealNode(e.target_node_id, edgeId, new Set([edgeId]));

    return { srcStatus, tgtStatus };
  }

  function renderEdges(L: any, map: any) {
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

      // SNMP traffic widget — draggable with mini sparkline
      if (cd.snmpMonitorId && !cd.hideTraffic) {
        const snmpMon = kumaMonitors.find((m) => m.id === cd.snmpMonitorId);
        if (snmpMon) {
          const savedPos = cd.trafficLabelPos;
          const posLat = savedPos ? savedPos[0] : (srcNode.x + tgtNode.x) / 2;
          const posLng = savedPos ? savedPos[1] : (srcNode.y + tgtNode.y) / 2;
          const statusColor = !snmpMon.active ? "#6b7280" : snmpMon.status === 1 ? "#22c55e" : snmpMon.status === 0 ? "#ef4444" : "#f59e0b";

          // Extract SNMP counter value from msg: "comparing NNNN >= YYYY"
          const extractCounter = (msg: string): number | null => {
            const m = msg.match(/comparing\s+(\d+)/);
            return m ? parseInt(m[1]) : null;
          };

          // Use cached throughput data (computed from SNMP counter deltas)
          const hbKey = `traffic-hb-${cd.snmpMonitorId}`;
          const cachedData: { throughputs: number[]; lastValue: string } = (window as any)[hbKey] || { throughputs: [], lastValue: "" };
          const monInterval = snmpMon.interval || 60; // monitor polling interval in seconds

          // Compute current throughput from cached data
          let currentThroughput = cachedData.throughputs.length > 0
            ? cachedData.throughputs[cachedData.throughputs.length - 1]
            : null;
          const formattedValue = currentThroughput != null ? formatTraffic(currentThroughput) : "N/A";

          // Build a mini SVG sparkline from throughput history
          let sparkSvg = "";
          if (cachedData.throughputs.length >= 2) {
            const pts = cachedData.throughputs.slice(-30);
            const maxV = Math.max(...pts, 1);
            const w = 80, h = 22;
            const pathParts = pts.map((v, i) => {
              const x = (i / (pts.length - 1)) * w;
              const y = h - (v / maxV) * (h - 2);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            });
            const fillParts = [...pathParts, `L${w},${h}`, `L0,${h}`, "Z"];
            sparkSvg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:2px">
              <path d="${fillParts.join(" ")}" fill="${statusColor}15" />
              <path d="${pathParts.join(" ")}" fill="none" stroke="${statusColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
          }

          // Fetch heartbeat data and compute throughput from SNMP counter deltas
          if (!cachedData.throughputs.length || cachedData.lastValue !== snmpMon.msg) {
            safeFetch<{ msg?: string }[]>(apiUrl(`/api/kuma/history/${cd.snmpMonitorId}`), undefined, "SNMPHistory")
              .then((beats) => {
                if (!beats) return;
                // Extract counter values from each heartbeat msg
                const counters: number[] = [];
                for (const b of beats) {
                  const val = extractCounter(b.msg || "");
                  if (val !== null) counters.push(val);
                }
                // Compute throughput deltas (bytes/s → bits/s) between consecutive readings
                const throughputs: number[] = [];
                for (let i = 1; i < counters.length; i++) {
                  let delta = counters[i] - counters[i - 1];
                  // Handle 32-bit counter wrap (4294967296 = 2^32)
                  if (delta < 0) delta += 4294967296;
                  const bps = (delta * 8) / monInterval; // bits per second
                  if (bps >= 0 && bps < 100_000_000_000) throughputs.push(bps); // sanity: < 100Gbps
                }
                if (throughputs.length > 0) {
                  (window as any)[hbKey] = {
                    throughputs: throughputs.slice(-30),
                    lastValue: snmpMon.msg || "",
                  };
                }
              })
              .catch(() => {});
          }

          const trafficLabel = L.marker([posLat, posLng], {
            draggable: !isLocked,
            icon: L.divIcon({
              className: "traffic-label",
              html: `<div style="
                background:rgba(6,6,10,0.92);
                border:1px solid ${statusColor}44;
                color:${statusColor};
                font-size:10px;font-weight:800;
                font-family:ui-monospace,monospace;
                padding:4px 8px;border-radius:8px;
                white-space:nowrap;
                box-shadow:0 4px 16px rgba(0,0,0,0.6), 0 0 12px ${statusColor}15;
                cursor:${isLockedRef.current ? "default" : "grab"};
                min-width:80px;
              ">
                <div style="display:flex;align-items:center;gap:4px;">
                  <span style="font-size:7px;opacity:0.6">▲▼</span>
                  <span>${formattedValue}</span>
                </div>
                ${sparkSvg}
              </div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 14],
            }),
            interactive: true,
          });

          // Save position after drag
          trafficLabel.on("dragend", () => {
            const pos = trafficLabel.getLatLng();
            const idx = edgesRef.current.findIndex((e) => e.id === edge.id);
            if (idx >= 0) {
              const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
              oldCd.trafficLabelPos = [pos.lat, pos.lng];
              edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
            }
          });

          // Right-click to hide
          trafficLabel.on("contextmenu", (e: any) => {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
            ctxHandledRef.current = true;
            setCtxMenu({
              x: e.originalEvent.clientX,
              y: e.originalEvent.clientY,
              edgeId: edge.id,
            });
          });

          trafficLabel.addTo(map);
          labelMarkersRef.current.set(`${edge.id}-traffic`, trafficLabel);
        }
      }

      // MikroTik direct traffic widget — polls router REST API for live TX/RX
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

  // Format elapsed downtime: "00:34:21" or "1d 02:15:30"
  // formatElapsed, formatSince imported from ./map-utils

  // Update downtime counter labels on the map (called every second)
  // Counters appear ABOVE the DOWN node, not on the link.
  function updateDowntimeCounters() {
    if (!LRef.current || !mapRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    const now = Date.now();

    // Build set of currently-down node IDs
    const downNodeIds = new Set<string>();
    nodesRef.current.forEach((node) => {
      if (node.icon === "_textLabel" || node.icon === "_waypoint" || node.icon === "_camera" || node.icon === "_polygon") return;
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
            <div style="
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

  function updateMarkerStatus() {
    if (!LRef.current || !mapRef.current) return;
    const L = LRef.current;

    // Track DOWN timestamps — DB query (/api/kuma/down-since) is authoritative.
    // Only clear entries for recovered monitors; new DOWN entries come from the DB fetch.
    nodesRef.current.forEach((node) => {
      if (!node.kuma_monitor_id) return;
      const m = getMonitorData(node.kuma_monitor_id);
      if (m?.status !== 0) {
        // Recovered — remove tracking
        downSinceRef.current.delete(node.kuma_monitor_id);
      }
      // Note: we do NOT set downSinceRef here for DOWN monitors.
      // The DB fetch in the kumaMonitors useEffect provides the real streak start time.
    });

    nodesRef.current.forEach((node) => {
      // Skip special node types — they have their own rendering in renderNodes
      if (node.icon === "_textLabel" || node.icon === "_waypoint" || node.icon === "_camera" || node.icon === "_polygon") return;

      const marker = markersRef.current.get(node.id);
      if (!marker) return;

      let color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      let pulse = (m?.status === 0 || m?.status === 2) && m?.active !== false;
      const cd = safeJsonParse<NodeCustomData>(node.custom_data);
      const ns: number = cd.nodeSize || 1.0;

      // Rack nodes: aggregate status from all device monitors
      if (node.icon === "_rack") {
        const rackInfo = getRackStatus(node);
        if (rackInfo.monitoredCount > 0) { color = rackInfo.color; pulse = rackInfo.pulse; }
      }

      const hasLinkedMapRefresh = Array.isArray(cd.linkedMaps) && cd.linkedMaps.length > 0;
      marker.setIcon(createMarkerIcon(L, color, pulse, linkSource === node.id, ns, node.icon, hasLinkedMapRefresh));
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
        const ncd = safeJsonParse<NodeCustomData>(node?.custom_data);
        marker.setIcon(createMarkerIcon(LRef.current, color, false, true, ncd.nodeSize || 1.0, node?.icon || "server"));
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

    const srcNode = nodesRef.current.find(n => n.id === linkSource);
    const tgtNode = nodesRef.current.find(n => n.id === targetId);
    const srcIsRack = srcNode?.icon === "_rack";
    const tgtIsRack = tgtNode?.icon === "_rack";

    // If source is a rack → pick source device first
    if (srcIsRack) {
      setRackPickerState({ rackNodeId: linkSource, side: "source", pendingSourceId: linkSource, pendingTargetId: targetId });
      return;
    }
    // If only target is a rack → pick target device
    if (tgtIsRack) {
      setRackPickerState({ rackNodeId: targetId, side: "target", pendingSourceId: linkSource, pendingTargetId: targetId });
      return;
    }

    // Normal flow — no rack involved
    setLinkModalData({ sourceId: linkSource, targetId });
    setLinkModalOpen(true);
  }

  function handleRackPickerSelect(interfaceHint: string) {
    if (!rackPickerState) return;
    const { side, pendingSourceId, pendingTargetId, pendingSourceInterface } = rackPickerState;

    if (side === "source") {
      // Source device chosen — check if target is also a rack
      const tgtNode = nodesRef.current.find(n => n.id === pendingTargetId);
      if (tgtNode?.icon === "_rack") {
        // Chain: now pick target device
        setRackPickerState({ rackNodeId: pendingTargetId, side: "target", pendingSourceId, pendingTargetId, pendingSourceInterface: interfaceHint });
      } else {
        setRackPickerState(null);
        setLinkModalData({ sourceId: pendingSourceId, targetId: pendingTargetId, initial: { sourceInterface: interfaceHint } });
        setLinkModalOpen(true);
      }
    } else {
      // Target device chosen
      setRackPickerState(null);
      setLinkModalData({
        sourceId: pendingSourceId,
        targetId: pendingTargetId,
        initial: { sourceInterface: pendingSourceInterface || "", targetInterface: interfaceHint },
      });
      setLinkModalOpen(true);
    }
  }

  function handleLinkModalSubmit(data: LinkFormData) {
    const { sourceId, targetId, edgeId } = linkModalData;
    const existingCd = edgeId
      ? safeJsonParse<EdgeCustomData>(edgesRef.current.find((e) => e.id === edgeId)?.custom_data)
      : {};
    const customData: EdgeCustomData = {
      ...existingCd,
      sourceInterface: data.sourceInterface,
      targetInterface: data.targetInterface,
      snmpMonitorId: data.snmpMonitorId ?? undefined,
      mikrotikTraffic: data.mikrotikTraffic ?? undefined,
    };
    // Clean up: remove the field not in use
    if (!customData.snmpMonitorId) delete customData.snmpMonitorId;
    if (!customData.mikrotikTraffic) delete customData.mikrotikTraffic;

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

  // ─── Measurement / ruler tool ───────────────────────────────────────────────

  /** Format a distance value for display */
  function formatDistance(meters: number): string {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    if (meters >= 1) return `${meters.toFixed(1)} m`;
    return `${(meters * 100).toFixed(0)} cm`;
  }

  /** Calculate distance between two points — meters for geo, pixels for image */
  function calcDistance(p1: [number, number], p2: [number, number]): number {
    const map = mapRef.current;
    if (!map) return 0;
    if (isImageMode) {
      // Image mode: Euclidean pixel distance, convertida a metros si el plano está calibrado
      const px = Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
      const mpu = scaleMPerUnitRef.current;
      return (mpu != null && mpu > 0) ? px * mpu : px;
    }
    // Geo mode: use Leaflet's haversine distance → meters
    return map.distance(p1, p2);
  }

  /** Handle click on map while in measure mode */
  function handleMeasureClick(latlng: { lat: number; lng: number }) {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    const point: [number, number] = [latlng.lat, latlng.lng];
    measurePointsRef.current.push(point);
    const pts = measurePointsRef.current;

    // Dot marker at clicked point
    const dot = L.circleMarker(point, {
      radius: 4, color: "#f97316", fillColor: "#f97316", fillOpacity: 1, weight: 2,
      interactive: false,
    }).addTo(map);
    measureLayersRef.current.push(dot);

    if (pts.length >= 2) {
      const prev = pts[pts.length - 2];
      const curr = pts[pts.length - 1];

      // Segment line
      const line = L.polyline([prev, curr], {
        color: "#f97316", weight: 2, dashArray: "6,6", opacity: 0.9,
        interactive: false,
      }).addTo(map);
      measureLayersRef.current.push(line);

      // Segment distance label
      const segDist = calcDistance(prev, curr);
      const midLat = (prev[0] + curr[0]) / 2;
      const midLng = (prev[1] + curr[1]) / 2;
      const uncal = isImageMode && !(scaleMPerUnitRef.current != null && scaleMPerUnitRef.current > 0);
      const labelText = uncal ? `${segDist.toFixed(0)} px` : formatDistance(segDist);
      const label = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "measure-label",
          html: `<div style="background:rgba(0,0,0,0.85);color:#f97316;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;font-family:ui-monospace,monospace;white-space:nowrap;border:1px solid #f9731644;pointer-events:none;">${labelText}</div>`,
          iconAnchor: [0, -8],
        }),
        interactive: false,
      }).addTo(map);
      measureLayersRef.current.push(label);

      // Total distance label (updated at last point)
      if (pts.length >= 3) {
        // Remove previous total label (always the last layer if it was a total)
        const prevTotal = measureLayersRef.current.find((l: any) => l._isMeasureTotal);
        if (prevTotal) {
          try { map.removeLayer(prevTotal); } catch {}
          measureLayersRef.current = measureLayersRef.current.filter((l: any) => l !== prevTotal);
        }
      }
      // Compute total
      let totalDist = 0;
      for (let i = 1; i < pts.length; i++) totalDist += calcDistance(pts[i - 1], pts[i]);
      if (pts.length >= 3) {
        const uncalT = isImageMode && !(scaleMPerUnitRef.current != null && scaleMPerUnitRef.current > 0);
        const totalText = uncalT ? `Total: ${totalDist.toFixed(0)} px` : `Total: ${formatDistance(totalDist)}`;
        const totalLabel = L.marker(curr, {
          icon: L.divIcon({
            className: "measure-total-label",
            html: `<div style="background:rgba(0,0,0,0.9);color:#22c55e;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:800;font-family:ui-monospace,monospace;white-space:nowrap;border:1px solid #22c55e44;pointer-events:none;">${totalText}</div>`,
            iconAnchor: [0, 14],
          }),
          interactive: false,
        }).addTo(map);
        (totalLabel as any)._isMeasureTotal = true;
        measureLayersRef.current.push(totalLabel);
      }
    }
  }

  /** Handle double-click to finish measurement */
  function finishMeasurement() {
    const pts = measurePointsRef.current;
    if (pts.length >= 2) {
      let totalDist = 0;
      for (let i = 1; i < pts.length; i++) totalDist += calcDistance(pts[i - 1], pts[i]);
      const uncalF = isImageMode && !(scaleMPerUnitRef.current != null && scaleMPerUnitRef.current > 0);
      const totalText = uncalF ? `${totalDist.toFixed(0)} px` : formatDistance(totalDist);
      toast.success(`Distancia total: ${totalText}`, { duration: 8000 });
    }
    setMeasureMode(false);
    // Layers stay visible until clearMeasurement is called or new measure starts
  }

  /** Clear all measurement overlays */
  function clearMeasurement() {
    const map = mapRef.current;
    if (map) {
      measureLayersRef.current.forEach((layer) => {
        try { map.removeLayer(layer); } catch {}
      });
    }
    measureLayersRef.current = [];
    measurePointsRef.current = [];
  }

  // ─── Context menu items ─────────────────────
  // ── Map-level context menu (no node/edge selected) ───────────────────────────
  function getMapCtxItems(latlng?: [number, number]) {
    if (!latlng) return [];
    let clipboard: {
      label: string | null;
      icon: string;
      kuma_monitor_id: number | null;
      x: number;
      y: number;
      width?: number;
      height?: number;
      color?: string | null;
      custom_data: string | null;
    } | null = null;
    try { const s = localStorage.getItem("kumamap_node_clipboard"); clipboard = s ? JSON.parse(s) : null; } catch { clipboard = null; }
    if (!clipboard) return [];
    return [
      {
        label: `Pegar: ${clipboard.label || clipboard.icon}`,
        icon: menuIcons.Clipboard,
        onClick: () => {
          pushUndo();
          const newId = `node-${Date.now()}`;
          nodesRef.current = [...nodesRef.current, {
            id: newId,
            kuma_monitor_id: clipboard!.kuma_monitor_id ?? null,
            label: clipboard!.label ?? "",
            icon: clipboard!.icon,
            x: clipboard!.x,
            y: clipboard!.y,
            ...(clipboard!.width  != null ? { width:  clipboard!.width  } : {}),
            ...(clipboard!.height != null ? { height: clipboard!.height } : {}),
            ...(clipboard!.color  != null ? { color:  clipboard!.color  } : {}),
            custom_data: clipboard!.custom_data || null,
          }];
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success(`"${clipboard!.label || clipboard!.icon}" pegado`);
        },
      },
    ];
  }

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

    // Labels: edit text, description, font size, color, rotation, delete
    if (isLabel) {
      const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
      const labelSizes = [
        { label: "Pequeño (10px)", value: 10 },
        { label: "Normal (13px)", value: 13 },
        { label: "Grande (18px)", value: 18 },
        { label: "Muy grande (24px)", value: 24 },
        { label: "Título (32px)", value: 32 },
      ];
      const labelColors = [
        { label: "Blanco", hex: "#ededed" },
        { label: "Azul", hex: "#60a5fa" },
        { label: "Verde", hex: "#4ade80" },
        { label: "Rojo", hex: "#f87171" },
        { label: "Amarillo", hex: "#fbbf24" },
        { label: "Naranja", hex: "#fb923c" },
        { label: "Gris", hex: "#888888" },
      ];
      const currentColor = cd.color || "#ededed";
      const currentSize = cd.fontSize || 13;

      const updateLabelCd = (updates: Record<string, any>) => {
        const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
        if (idx >= 0) {
          const prev = nodesRef.current[idx];
          const prevCd = safeJsonParse<NodeCustomData>(prev.custom_data);
          nodesRef.current[idx] = { ...prev, custom_data: JSON.stringify({ ...prevCd, type: "textLabel", ...updates }) };
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
        }
      };

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
          label: cd.description ? "Editar descripción" : "Agregar descripción",
          icon: menuIcons.AlignLeft,
          onClick: () => {
            const desc = prompt("Descripción (se muestra al hacer clic):", cd.description || "");
            if (desc !== null) {
              updateLabelCd({ description: desc.trim() || undefined });
            }
          },
        },
        // Font size submenu
        {
          label: `Tamaño (${currentSize}px)`,
          icon: menuIcons.Scaling,
          onClick: () => {},
          children: labelSizes.map(s => ({
            label: s.label,
            icon: menuIcons.Type,
            active: s.value === currentSize,
            onClick: () => updateLabelCd({ fontSize: s.value }),
          })),
        },
        // Color submenu
        {
          label: "Color",
          icon: menuIcons.Palette,
          onClick: () => {},
          children: labelColors.map(c => ({
            label: c.label,
            icon: menuIcons.Palette,
            colorDot: c.hex,
            active: c.hex === currentColor,
            onClick: () => updateLabelCd({ color: c.hex }),
          })),
        },
        // Rotation
        {
          label: "Rotar etiqueta",
          icon: menuIcons.RotateCcw,
          onClick: () => {
            // Show the rotation handle for this label
            camHandlesRef.current.forEach((handle, key) => {
              if (key.endsWith("-labelrot")) {
                const el = handle.getElement();
                if (el) el.style.display = "none";
              }
            });
            const thisHandle = camHandlesRef.current.get(nodeId + "-labelrot");
            if (thisHandle) {
              const el = thisHandle.getElement();
              if (el) el.style.display = "";
            }
            toast("Arrastrá el punto violeta para rotar", { icon: "↻" });
          },
        },
        // Reset rotation if rotated
        ...(cd.rotation ? [{
          label: "Restablecer rotación",
          icon: menuIcons.RotateCcw,
          onClick: () => {
            const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
            if (idx >= 0) {
              const prev = nodesRef.current[idx];
              const prevCd = safeJsonParse<NodeCustomData>(prev.custom_data);
              delete prevCd.rotation;
              nodesRef.current[idx] = { ...prev, custom_data: JSON.stringify(prevCd) };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            }
          },
        }] : []),
        // Duplicate label
        {
          label: "Duplicar etiqueta",
          icon: menuIcons.Copy,
          divider: true,
          onClick: () => {
            pushUndo();
            const newId = `label-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, {
              id: newId,
              kuma_monitor_id: null,
              label: node?.label || "Etiqueta",
              x: (node?.x || 0) + (isImageMode ? 30 : 0.0003),
              y: (node?.y || 0) + (isImageMode ? 30 : 0.0003),
              icon: "_textLabel",
              custom_data: node?.custom_data || null,
            }];
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Etiqueta duplicada");
          },
        },
        {
          label: "Eliminar etiqueta",
          icon: menuIcons.Trash2,
          danger: true,
          onClick: () => {
            pushUndo();
            nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Etiqueta eliminada");
          },
        },
      ];
    }

    if (node?.icon === "_rack") {
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
          label: "Diseñador de Rack",
          icon: menuIcons.Server,
          onClick: () => setRackDrawerNodeId(nodeId),
        },
        {
          label: "Editar Nombre",
          icon: menuIcons.Pencil,
          onClick: () => {
            const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
            setInputModalConfig({ nodeId, initial: node?.label || "", mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "", nodeType: cd.type, kumaMonitorId: node?.kuma_monitor_id ?? null });
            setInputModalOpen(true);
          },
        },
        {
          label: "Copiar Rack",
          icon: menuIcons.Copy,
          divider: true,
          onClick: () => {
            try {
              localStorage.setItem("kumamap_node_clipboard", JSON.stringify({
                label: node?.label ?? null,
                icon: node?.icon || "_rack",
                kuma_monitor_id: node?.kuma_monitor_id ?? null,
                x: node?.x ?? 0,
                y: node?.y ?? 0,
                width:  node?.width  ?? undefined,
                height: node?.height ?? undefined,
                color:  node?.color  ?? null,
                custom_data: node?.custom_data || null,
              }));
              toast.success(`"${node?.label}" copiado al portapapeles`);
            } catch { toast.error("No se pudo copiar"); }
          },
        },
        {
          label: "Duplicar Rack",
          icon: menuIcons.Plus,
          onClick: () => {
            if (!node) return;
            const newNodeId = `rack-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, {
              id: newNodeId,
              kuma_monitor_id: node.kuma_monitor_id ?? null,
              label: node.label,
              icon: node.icon,
              x: node.x + 0.0001,
              y: node.y + 0.0001,
              custom_data: node.custom_data,
            }];
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Rack duplicado");
          },
        },
        ...(() => {
          const ncd = safeJsonParse<NodeCustomData>(node?.custom_data);
          const linked: { id: string; name: string }[] = ncd.linkedMaps || [];
          const items: any[] = [];
          linked.forEach(lm => {
            items.push({
              label: `Abrir: ${lm.name}`,
              icon: menuIcons.ExternalLink,
              divider: items.length === 0,
              onClick: () => {
                if (readonly) window.open(apiUrl(`/view/${lm.id}`), "_blank");
                else if (onOpenMap) onOpenMap(lm.id);
                else window.open(apiUrl(`/map/${lm.id}`), "_blank");
              },
            });
          });
          items.push({
            label: linked.length > 0 ? "Gestionar submapas" : "Asignar submapa",
            icon: menuIcons.FolderOpen,
            divider: linked.length === 0,
            onClick: () => setNodeMapModalNodeId(nodeId),
          });
          return items;
        })(),
        {
          label: "Eliminar Rack",
          icon: menuIcons.Trash2,
          danger: true,
          divider: true,
          onClick: () => {
            pushUndo();
            nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Rack eliminado");
          },
        },
      ];
    }

    // ── Build normal/camera node context menu (consolidated) ──
    const isCamera = node?.icon === "_camera";
    const isSpecial = node?.icon === "_waypoint" || node?.icon === "_polygon";
    const ncd = safeJsonParse<NodeCustomData>(node?.custom_data);
    const linked: { id: string; name: string }[] = ncd.linkedMaps || [];

    return [
      // ── Primary actions ──
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
          const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
          setInputModalConfig({ nodeId, initial: node?.label || "", mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "", nodeType: cd.type, kumaMonitorId: node?.kuma_monitor_id ?? null });
          setInputModalOpen(true);
        },
      },
      // ── Monitor ──
      {
        label: node?.kuma_monitor_id ? "Reasignar monitor" : "Asignar monitor",
        icon: menuIcons.Signal,
        onClick: () => {
          setAssignNodeId(nodeId);
          setAssignSearch("");
          setAssignModalOpen(true);
        },
      },
      // Quick-create monitor from node data
      ...(!node?.kuma_monitor_id && ncd.ip ? [{
        label: "Crear monitor rápido",
        icon: menuIcons.Plus,
        onClick: async () => {
          const ip = ncd.ip || "";
          const label = node?.label || ip;
          // Detect best monitor type from node icon
          const icon = node?.icon || "";
          let monType = "ping";
          let monData: Record<string, unknown> = { name: label, type: "ping", hostname: ip, interval: 60 };
          if (icon === "server" || icon === "_server") {
            monType = "http";
            monData = { name: label, type: "http", url: `http://${ip}`, interval: 60 };
          } else if (icon === "router" || icon === "_router" || icon === "switch" || icon === "_switch") {
            monType = "ping";
            monData = { name: label, type: "ping", hostname: ip, interval: 60 };
          } else if (ncd.streamUrl || icon === "camera" || icon === "_camera") {
            monType = "port";
            monData = { name: label, type: "port", hostname: ip, port: 554, interval: 60 };
          }
          try {
            const res = await safeFetch<{ ok: boolean; monitorID?: number; msg?: string }>(
              apiUrl("/api/kuma/monitors"),
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(monData) },
              "QuickCreateMonitor"
            );
            if (res?.ok && res.monitorID) {
              const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
              if (idx >= 0) {
                nodesRef.current[idx] = { ...nodesRef.current[idx], kuma_monitor_id: res.monitorID };
                if (LRef.current && mapRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
              }
              toast.success(`Monitor "${label}" creado (${monType})`, { description: `ID: ${res.monitorID}` });
            } else {
              toast.error(res?.msg || "Error al crear monitor");
            }
          } catch (e: any) {
            toast.error("Error al crear monitor: " + e.message);
          }
        },
      }] : []),
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
      // ── Appearance (submenu) ──
      ...(!isSpecial ? [{
        label: "Apariencia",
        icon: menuIcons.Palette,
        onClick: () => {},
        children: [
          {
            label: "Cambiar icono",
            icon: menuIcons.Palette,
            onClick: () => setIconPickerNodeId(nodeId),
          },
          {
            label: "Tamaño",
            icon: menuIcons.Scaling,
            onClick: () => setSizePickerNodeId(nodeId),
          },
          ...(isCamera ? [{
            label: "Color y estilo",
            icon: menuIcons.Palette,
            onClick: () => {
              setColorPickerNodeId(nodeId);
              setColorPickerOpen(true);
            },
          }] : []),
        ],
      }] : []),
      // ── Camera-specific (submenu) ──
      ...(isCamera ? [{
        label: "Cámara",
        icon: menuIcons.Signal,
        divider: true,
        onClick: () => {},
        children: [
          {
            label: "Configurar stream",
            icon: menuIcons.Signal,
            onClick: () => setStreamConfigNodeId(nodeId),
          },
          {
            label: "Tipo: IP estándar",
            icon: menuIcons.Signal,
            active: !ncd.cameraType,
            onClick: () => {
              const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
              if (idx >= 0) {
                const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                delete nc.cameraType;
                delete nc.eventEndpoint;
                nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Tipo: IP estándar");
              }
            },
          },
          {
            label: "Tipo: LPR (Matrícula)",
            icon: menuIcons.Signal,
            active: ncd.cameraType === "lpr",
            onClick: () => {
              const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
              if (idx >= 0) {
                const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                nc.cameraType = "lpr";
                nc.eventEndpoint = `/api/hik/events/${nodeId}`;
                nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Tipo: LPR", { description: `Endpoint: ${nc.eventEndpoint}` });
              }
            },
          },
          {
            label: "Tipo: Face Recognition",
            icon: menuIcons.Signal,
            active: ncd.cameraType === "face",
            onClick: () => {
              const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
              if (idx >= 0) {
                const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                nc.cameraType = "face";
                nc.eventEndpoint = `/api/hik/events/${nodeId}`;
                nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Tipo: Face Recognition", { description: `Endpoint: ${nc.eventEndpoint}` });
              }
            },
          },
          // Show endpoint URL for copying (only for LPR/Face)
          ...(ncd.cameraType === "lpr" || ncd.cameraType === "face" ? [{
            label: "Copiar endpoint",
            icon: menuIcons.Copy,
            divider: true,
            onClick: () => {
              const endpoint = ncd.eventEndpoint || `/api/hik/events/${nodeId}`;
              navigator.clipboard.writeText(`${window.location.origin}${endpoint}`).then(
                () => toast.success("Endpoint copiado al portapapeles", { description: `${window.location.origin}${endpoint}` }),
                () => toast.error("Error al copiar")
              );
            },
          }] : []),
          ...(ncd.streamUrl ? [{
            label: "Ver stream",
            icon: menuIcons.Signal,
            onClick: () => setStreamViewers(prev => {
              if (prev.some(v => v.nodeId === nodeId)) return prev;
              if (prev.length >= MAX_STREAMS) return prev;
              return [...prev, { nodeId, mode: "pip" }];
            }),
          }] : []),
          {
            label: "Lente / FOV",
            icon: menuIcons.Maximize2,
            onClick: () => {
              setLensPickerNodeId(nodeId);
              setLensPickerOpen(true);
            },
          },
          {
            label: isImageMode ? "Alcance (px)" : "Distancia focal",
            icon: menuIcons.Maximize2,
            onClick: () => {
              const camCd = safeJsonParse<NodeCustomData>(node?.custom_data);
              if (isImageMode) {
                const rawR = camCd.fovRange ?? 200;
                const currentPx = rawR < 1 ? Math.round(rawR * 100000) : Math.round(rawR);
                const input = prompt("Alcance (píxeles):\n• 50 = cerca\n• 200 = normal\n• 500 = lejos", String(currentPx));
                if (input) {
                  const px = parseFloat(input);
                  if (!isNaN(px) && px > 0) {
                    const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
                    if (idx >= 0) {
                      const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                      nc.fovRange = px;
                      nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
                      if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
                    }
                  }
                }
              } else {
                const current = camCd.fovRange || 0.002;
                const input = prompt("Distancia focal (metros):\n• 50 = cerca\n• 200 = normal\n• 500+ = lejos", String(Math.round(current * 100000)));
                if (input) {
                  const meters = parseFloat(input);
                  if (!isNaN(meters) && meters > 0) {
                    const newRange = Math.max(0.00005, meters / 100000);
                    const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
                    if (idx >= 0) {
                      const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                      nc.fovRange = parseFloat(newRange.toFixed(6));
                      nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
                      if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
                    }
                  }
                }
              }
            },
          },
          {
            label: "Descubrir ONVIF",
            icon: menuIcons.Signal,
            divider: true,
            onClick: () => setOnvifModalOpen(true),
          },
        ],
      }] : []),
      // ── Antenna-specific ──
      ...(node?.icon === "_antenna" ? [{
        label: "Antena",
        icon: menuIcons.Signal,
        divider: true,
        onClick: () => {},
        children: [
          {
            label: "Configurar antena",
            icon: menuIcons.Signal,
            onClick: () => setAntennaConfigNodeId(nodeId),
          },
          {
            label: "SNMP Wireless",
            icon: menuIcons.Signal,
            onClick: () => {
              const antCd = safeJsonParse<NodeCustomData>(node?.custom_data);
              if (antCd.ip) {
                setAntennaSnmpNodeId(nodeId);
              } else {
                toast.info("Configura una IP en la antena para usar SNMP", { id: "antenna-snmp-noip" });
              }
            },
          },
        ],
      }] : []),
      // ── UPS-specific ──
      ...(node?.icon === "ups" ? [
        {
          label: "Monitor UPS",
          icon: menuIcons.Activity,
          onClick: () => {
            const upsCd = safeJsonParse<NodeCustomData>(node?.custom_data);
            if (upsCd.ip) {
              const cx = ctxMenu?.x ?? 400;
              const cy = ctxMenu?.y ?? 200;
              setUpsPanelState({ nodeId, x: cx, y: cy });
            } else {
              toast.info("Configura la UPS (IP o host NUT) para monitorearla", { id: "ups-noip" });
              setUpsConfigNodeId(nodeId);
            }
          },
        },
        {
          label: "Configurar UPS",
          icon: menuIcons.Settings,
          divider: true,
          onClick: () => setUpsConfigNodeId(nodeId),
        },
      ] : []),
      // ── Copiar / Duplicar ──
      {
        label: "Copiar nodo",
        icon: menuIcons.Copy,
        divider: true,
        onClick: () => {
          try {
            localStorage.setItem("kumamap_node_clipboard", JSON.stringify({
              label: node?.label ?? null,
              icon: node?.icon || "server",
              kuma_monitor_id: node?.kuma_monitor_id ?? null,
              x: node?.x ?? 0, y: node?.y ?? 0,
              width: node?.width ?? undefined, height: node?.height ?? undefined,
              color: node?.color ?? null, custom_data: node?.custom_data || null,
            }));
            toast.success(`"${node?.label || node?.icon}" copiado`);
          } catch { toast.error("No se pudo copiar"); }
        },
      },
      {
        label: "Duplicar nodo",
        icon: menuIcons.Plus,
        onClick: () => {
          pushUndo();
          const newId = `node-${Date.now()}`;
          const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
          nodesRef.current = [...nodesRef.current, {
            id: newId,
            kuma_monitor_id: isCamera ? node?.kuma_monitor_id : null,
            label: (node?.label || "Nodo") + " (copia)",
            x: (node?.x || 0) + 0.0003,
            y: (node?.y || 0) + 0.0003,
            icon: node?.icon || "server",
            custom_data: node?.custom_data || null,
          }];
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Nodo duplicado");
        },
      },
      // ── TimeMachine ──
      ...(node?.kuma_monitor_id ? [{
        label: "TimeMachine",
        icon: menuIcons.Clock,
        divider: true,
        onClick: () => {
          setTmFocusMonitorId(node!.kuma_monitor_id!);
          setTimeMachineOpen(true);
        },
      }] : []),
      // ── Linked maps ──
      ...(() => {
        const items: any[] = [];
        linked.forEach(lm => {
          items.push({
            label: `Abrir: ${lm.name}`,
            icon: menuIcons.ExternalLink,
            divider: items.length === 0,
            onClick: () => {
              if (readonly) window.open(apiUrl(`/view/${lm.id}`), "_blank");
              else if (onOpenMap) onOpenMap(lm.id);
              else window.open(apiUrl(`/map/${lm.id}`), "_blank");
            },
          });
        });
        items.push({
          label: linked.length > 0 ? "Gestionar mapas" : "Asignar mapa",
          icon: menuIcons.FolderOpen,
          divider: linked.length === 0,
          onClick: () => setNodeMapModalNodeId(nodeId),
        });
        return items;
      })(),
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
    const cd = safeJsonParse<EdgeCustomData>(edge?.custom_data);
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
            initial: { sourceInterface: cd.sourceInterface || "", targetInterface: cd.targetInterface || "", label: edge?.label || "", snmpMonitorId: cd.snmpMonitorId ?? null, mikrotikTraffic: cd.mikrotikTraffic ?? null },
          });
          setLinkModalOpen(true);
        },
      },
      ...[
        { type: "fiber", label: "Fibra", color: "#3b82f6" },
        { type: "copper", label: "Cobre", color: "#22c55e" },
        { type: "wireless", label: "Wireless", color: "#f97316" },
        { type: "vpn", label: "VPN", color: "#3b82f6" },
      ].filter(t => t.type !== (cd.linkType || "copper")).map(t => ({
        label: `→ ${t.label}`,
        icon: menuIcons.Link2,
        onClick: () => {
          const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
          if (idx >= 0) {
            const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
            oldCd.linkType = t.type;
            edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
            if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
            toast.success(`Enlace: ${t.label}`);
          }
        },
      })),
      {
        label: "Separación (pared / canalización)",
        icon: menuIcons.Link2,
        divider: true,
        onClick: () => {},
        children: Object.entries(SEPARATION_TYPES).map(([key, s]) => ({
          label: s.label,
          icon: menuIcons.Link2,
          active: cd.linkType === "separation" && cd.sepType === key,
          onClick: () => {
            const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
            if (idx >= 0) {
              const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
              oldCd.linkType = "separation";
              oldCd.sepKind = s.kind;
              oldCd.sepType = key;
              edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
              if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
              toast.success(s.label);
            }
          },
        })),
      },
      // Toggle traffic widget visibility
      ...(cd.snmpMonitorId ? [{
        label: cd.hideTraffic ? "Mostrar tráfico" : "Ocultar tráfico",
        icon: menuIcons.Activity,
        onClick: () => {
          const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
          if (idx >= 0) {
            const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
            oldCd.hideTraffic = !oldCd.hideTraffic;
            edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
            if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
            toast.success(oldCd.hideTraffic ? "Tráfico oculto" : "Tráfico visible");
          }
        },
      }] : []),
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

    const monitor = safeJsonParse<KumaMonitor>(raw);

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
      straightEdges,
      showNodes,
      showLabels,
    };
    onSave(nodesRef.current, edgesRef.current, viewState);
    setSaving(false);
  }, [onSave, mapStyle, overlayOpacity, straightEdges, showNodes, showLabels]);

  // Auto-save every 60s (if enabled)
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const interval = setInterval(() => {
      if (nodesRef.current.length > 0) handleSave();
    }, 60000);
    return () => clearInterval(interval);
  }, [handleSave, autoSaveEnabled]);

  // ── Update camera tooltip anchor on map move/zoom ──
  const tooltipViewer = streamViewers.find(v => v.mode === "tooltip");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tooltipViewer) return;
    const updateAnchor = () => {
      const node = nodesRef.current.find((n) => n.id === tooltipViewer.nodeId);
      if (!node) return;
      const pt = map.latLngToContainerPoint([node.x, node.y]);
      const rect = containerRef.current?.getBoundingClientRect();
      setTooltipAnchor({
        x: (rect?.left ?? 0) + pt.x,
        y: (rect?.top ?? 0) + pt.y,
      });
    };
    map.on("move", updateAnchor);
    map.on("zoom", updateAnchor);
    return () => {
      map.off("move", updateAnchor);
      map.off("zoom", updateAnchor);
    };
  }, [tooltipViewer]);

  // Search logic moved to MapSearchPanel component

  // Old export handlers (PNG, Print, XLSX) removed — replaced by single ZIP export

  // ── Export all racks as ZIP (Word + Excel per rack) ──
  const [zipExporting, setZipExporting] = useState(false);
  const handleExportZip = useCallback(async () => {
    setZipExporting(true);
    toast.info("Generando ZIP con todos los racks...", { duration: 5000 });
    try {
      const res = await fetch(apiUrl("/api/map-export-zip"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (mapName || "kumamap").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.download = `${safeName}-racks-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP exportado con éxito");
    } catch (err: any) {
      toast.error(`Error al exportar ZIP: ${err.message}`);
    } finally {
      setZipExporting(false);
    }
  }, [mapId, mapName]);

  return (
    <div className="relative h-full w-full transition-all duration-300 kumamap-print-area" style={{ marginRight: `${sidebarWidth}px` }}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ zIndex: 0 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

      {/* ── Puntero láser (editor + kiosko) ── */}
      <LaserPointer containerRef={containerRef} active={laserActive} onToggle={setLaserActive} />

      {/* ── Calibración: overlay que captura clicks para dibujar la referencia ── */}
      {calibrateMode && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ zIndex: 1200 }}
          onClick={(e) => {
            const m = mapRef.current; const cont = containerRef.current;
            if (!m || !cont) return;
            const rect = cont.getBoundingClientRect();
            const ll = m.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top] as any);
            setRulerPts((prev) => (calibrateMode && prev.length >= 2) ? [[ll.lat, ll.lng]] : [...prev, [ll.lat, ll.lng]]);
          }}
          onContextMenu={(e) => { e.preventDefault(); setRulerPts([]); }}
        >
          <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
            {(() => {
              const m = mapRef.current;
              if (!m) return null;
              const cpts = rulerPts.map((p) => m.latLngToContainerPoint(p as any));
              return (
                <>
                  {cpts.length >= 2 && (
                    <polyline points={cpts.map((c) => `${c.x},${c.y}`).join(" ")} fill="none" stroke={calibrateMode ? "#38bdf8" : "#f59e0b"} strokeWidth="2.5" strokeDasharray="6,5" />
                  )}
                  {cpts.map((c, i) => (
                    <circle key={i} cx={c.x} cy={c.y} r={4.5} fill={calibrateMode ? "#38bdf8" : "#f59e0b"} stroke="#000" strokeWidth="1.5" />
                  ))}
                </>
              );
            })()}
          </svg>
        </div>
      )}

      {/* ── Badge de calibración (los controles viven en el menú Dibujar) ── */}
      {calibrateMode && (
        <div className="absolute left-3 bottom-16 rounded-lg px-3 py-2" style={{ zIndex: 1300, background: "rgba(17,24,39,0.94)", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 4px 16px rgba(0,0,0,0.5)", maxWidth: 260 }}>
          {(() => {
            const m = mapRef.current;
            let firstRaw: number | null = null;
            if (m && rulerPts.length >= 2) firstRaw = m.distance(rulerPts[0] as any, rulerPts[1] as any);
            if (rulerPts.length < 2) {
              return <div style={{ fontSize: 11 }}>🎯 Dibujá una referencia de <b>largo conocido</b> — 2 clics sobre el plano.</div>;
            }
            return (
              <div style={{ fontSize: 11 }}>
                <div style={{ marginBottom: 6 }}>Largo real de la referencia:</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={calibMeters} onChange={(e) => setCalibMeters(e.target.value)} placeholder="metros" inputMode="decimal"
                    style={{ width: 70, padding: "3px 6px", borderRadius: 6, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 12 }} />
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>m</span>
                  <button
                    onClick={() => {
                      const meters = parseFloat(calibMeters.replace(",", "."));
                      const mpu = firstRaw != null ? calibrationFromReference(firstRaw, meters) : null;
                      if (mpu == null) { toast.error("Valor inválido"); return; }
                      onSaveScale?.(mpu);
                      setCalibrateMode(false); setRulerPts([]); setCalibMeters("");
                    }}
                    style={{ padding: "3px 10px", borderRadius: 6, background: "#38bdf8", color: "#04283a", fontWeight: 700, fontSize: 11 }}
                  >Guardar</button>
                  <button onClick={() => { setCalibrateMode(false); setRulerPts([]); }} title="Cancelar" style={{ fontSize: 12, color: "#9ca3af" }}>✕</button>
                </div>
                <button onClick={() => setRulerPts([])} style={{ marginTop: 6, fontSize: 10, color: "#9ca3af" }}>↺ rehacer</button>
              </div>
            );
          })()}
        </div>
      )}

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

      {/* ── Global Map styles ── */}
      <style>{`
        ${!isImageMode ? `.leaflet-tile-pane { filter: brightness(${1 - overlayOpacity}); transition: filter 0.3s; }` : `.leaflet-image-layer { filter: brightness(${1 - overlayOpacity}); transition: filter 0.3s; }`}
        @media print {
          @page { margin: 0; size: landscape; }
          html, body { background: #0a0a0a !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .kumamap-print-area, .kumamap-print-area * { visibility: visible !important; }
          .kumamap-print-area {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            z-index: 99999 !important;
            background: #0a0a0a !important;
          }
          /* Hide ALL UI controls — toolbar, sidebar, overlays, tooltips on hover, context menus */
          .kumamap-no-print,
          .kumamap-toolbar,
          [class*="toolbar"],
          [class*="sidebar"],
          [class*="panel"],
          [class*="overlay"],
          [class*="ctx-menu"],
          [class*="export-menu"],
          [class*="search"],
          .leaflet-control-container,
          .leaflet-top,
          .leaflet-bottom { display: none !important; }
          /* Keep tiles dark — prevent browser from overriding with white */
          .leaflet-tile-pane { filter: none !important; }
          /* Ensure node labels and markers render */
          .leaflet-marker-pane,
          .leaflet-overlay-pane,
          .leaflet-tooltip-pane { visibility: visible !important; }
        }
        /* Etiquetas tipo label se manejan via JS en el effect de visibilidad */
        
        /* Custom scrollbar for some UI elements */
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

      {/* ── Floating Top Bar ── */}
      {!readonly && !rackDrawerNodeId && <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0 kumamap-no-print"
        id="leaflet-toolbar"
        style={{ zIndex: 10000, pointerEvents: "auto" }}
      >
        {/* ── Main toolbar row ── */}
        <div
          className="flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5"
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          {/* ═══ LEFT SIDE ═══ */}
          {/* Back */}
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Mapas
          </button>

          <div className="h-5 w-px mx-0.5" style={{ background: "var(--glass-border)" }} />

          {/* Map name + live status */}
          <div className="flex items-center gap-2 px-1">
            {mapName && (
              <span className="text-[12px] font-bold truncate max-w-[140px]" style={{ color: "var(--text-primary)" }}>
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

          <div className="h-5 w-px mx-0.5" style={{ background: "var(--glass-border)" }} />

          {/* ── Compact inline search ── */}
          <div className="relative">
            <div className="flex items-center rounded-lg px-2 py-1" style={{ background: "var(--surface-card)", border: "1px solid var(--glass-border)", width: 150 }}>
              <Search className="h-3 w-3 shrink-0" style={{ color: "var(--text-tertiary)" }} />
              <input
                type="text"
                placeholder="Buscar..."
                value={tbSearch}
                onChange={(e) => {
                  const q = e.target.value;
                  setTbSearch(q);
                  if (!q.trim()) { setTbSearchResults([]); return; }
                  const lower = q.toLowerCase();
                  const matches = nodesRef.current
                    .filter(n => n.icon !== "_waypoint" && n.icon !== "_polygon" && n.label?.toLowerCase().includes(lower))
                    .slice(0, 6)
                    .map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y }));
                  setTbSearchResults(matches);
                }}
                onFocus={() => setTbSearchFocused(true)}
                onBlur={() => setTimeout(() => setTbSearchFocused(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setTbSearch(""); setTbSearchResults([]); (e.target as HTMLInputElement).blur(); }
                  if (e.key === "Enter" && tbSearchResults.length > 0) {
                    const r = tbSearchResults[0];
                    if (mapRef.current) {
                      mapRef.current.setView([r.x, r.y], Math.max(mapRef.current.getZoom(), isImageMode ? mapRef.current.getZoom() : 16), { animate: true });
                      toast.success("Encontrado", { description: r.label.substring(0, 60) });
                    }
                    setTbSearch(""); setTbSearchResults([]);
                  }
                }}
                className="ml-1.5 w-full bg-transparent text-[10px] outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {tbSearch && (
                <button onClick={() => { setTbSearch(""); setTbSearchResults([]); }} style={{ color: "var(--text-tertiary)" }}>
                  <XIcon className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Search results dropdown */}
            {tbSearchFocused && tbSearchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-1 rounded-xl shadow-2xl py-1 z-[99999] min-w-[200px]"
                style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", backdropFilter: "blur(20px)" }}>
                {tbSearchResults.map(r => (
                  <button key={r.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (mapRef.current) {
                        mapRef.current.setView([r.x, r.y], Math.max(mapRef.current.getZoom(), isImageMode ? mapRef.current.getZoom() : 16), { animate: true });
                        // Flash marker
                        const marker = markersRef.current.get(r.id);
                        if (marker?.getElement()) {
                          const el = marker.getElement();
                          el.style.filter = "drop-shadow(0 0 20px #3b82f6) drop-shadow(0 0 40px #3b82f6) brightness(1.8)";
                          el.style.transition = "filter 0.2s";
                          setTimeout(() => { el.style.filter = "drop-shadow(0 0 8px #3b82f688) brightness(1.1)"; el.style.transition = "filter 1.5s"; }, 1500);
                        }
                        toast.success("Encontrado", { description: r.label.substring(0, 60) });
                      }
                      setTbSearch(""); setTbSearchResults([]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition-all"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.08)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                  >
                    <Search className="h-3 w-3 shrink-0" style={{ color: "#3b82f6" }} />
                    <span className="truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ═══ CENTER: EDIT MODE DROPDOWN MENUS ═══ */}
          {editMode && <>
          <div className="h-5 w-px mx-0.5" style={{ background: "var(--glass-border)" }} />

          {/* ── "Nodos" dropdown ── */}
          <ToolbarDropdown
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>}
            label="Nodos"
            open={ddNodos}
            onToggle={() => setActiveDropdown(v => v === "nodos" ? null : "nodos")}
          >
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="8" x2="16" y1="10" y2="10"/><line x1="8" x2="16" y1="14" y2="14"/><line x1="8" x2="16" y1="18" y2="18"/></svg>}
              label="Rack"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `rack-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Rack", x: center.lat, y: center.lng, icon: "_rack", custom_data: JSON.stringify({ type: "rack", totalUnits: 42, devices: [] }) }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Rack creado — doble clic para editar");
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>}
              label="Dispositivo"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `node-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Nuevo equipo", x: center.lat, y: center.lng, icon: "server" }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="16" x="3" y="4" rx="2"/><path d="M3 12h4l2-5 3 9 2-4h5"/></svg>}
              label="Servidor (monitor-ng)"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `mng-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, {
                  id, kuma_monitor_id: null, label: "Servidor", x: center.lat, y: center.lng, icon: "server",
                  custom_data: JSON.stringify({ type: "monitorng" }),
                }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Servidor monitor-ng agregado — doble clic para vincularlo a un dispositivo adoptado");
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>}
              label="Cámara"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `cam-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Camara", x: center.lat, y: center.lng, icon: "_camera", custom_data: JSON.stringify({ type: "camera", rotation: 0, fov: 60, fovRange: isImageMode ? 200 : 0.002 }) }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Camara agregada — clic derecho para rotar");
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12 7 2"/><path d="m7 12 5-10"/><path d="m12 12 5-10"/><path d="m17 12 5-10"/><path d="M4.5 7h15"/><path d="M12 16v6"/></svg>}
              label="Antena PTP"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `antenna-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, {
                  id, kuma_monitor_id: null, label: "Antena", x: center.lat, y: center.lng, icon: "_antenna",
                  custom_data: JSON.stringify({
                    type: "antenna", antennaType: "ptp", frequency: "5.8 GHz", antennaGain: 23,
                    beamWidth: 30, beamRange: isImageMode ? 300 : 0.003, beamColor: "#3b82f6",
                    protocol: "AirMax", bandwidth: "40 MHz",
                  }),
                }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Antena agregada — clic derecho para configurar");
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="10" x="4" y="7" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m12 10-1.5 3h3L12 16"/></svg>}
              label="UPS"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `ups-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, {
                  id, kuma_monitor_id: null, label: "UPS", x: center.lat, y: center.lng, icon: "ups",
                  custom_data: JSON.stringify({ type: "ups", upsProtocol: "snmp", upsSnmpCommunity: "public" }),
                }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
                setUpsConfigNodeId(id);
                toast.success("UPS agregada — configurá la conexión");
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><circle cx="12" cy="4" r="2"/></svg>}
              label="Columna"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `node-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Poste", x: center.lat, y: center.lng, icon: "_pole" }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>}
              label="Etiqueta"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const text = prompt("Texto de la etiqueta:");
                if (!text) return;
                const center = mapRef.current.getCenter();
                const id = `label-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: text, x: center.lat, y: center.lng, icon: "_textLabel" }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Etiqueta creada");
              }}
            />
          </ToolbarDropdown>

          {/* ── "Dibujar" dropdown ── */}
          <ToolbarDropdown
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>}
            label="Dibujar"
            open={ddDibujar}
            onToggle={() => setActiveDropdown(v => v === "dibujar" ? null : "dibujar")}
          >
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/></svg>}
              label="Punto"
              onClick={() => {
                setActiveDropdown(null);
                if (!mapRef.current) return;
                const center = mapRef.current.getCenter();
                const id = `wp-${Date.now()}`;
                nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "", x: center.lat, y: center.lng, icon: "_waypoint" }];
                if (LRef.current) renderNodes(LRef.current, mapRef.current);
                toast.success("Punto de ruta agregado");
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
              label={linkSource ? "Cancelar link" : "Link"}
              active={!!linkSource}
              onClick={() => {
                setActiveDropdown(null);
                if (linkSource) { cancelLinkCreation(); return; }
                if (nodesRef.current.length === 0) { toast.error("Agrega nodos primero"); return; }
                toast.info("Clic derecho en un nodo → Nuevo link", { duration: 4000 });
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/></svg>}
              label={polygonMode ? "Terminar zona" : "Zona"}
              active={polygonMode}
              onClick={() => {
                setActiveDropdown(null);
                if (polygonMode) {
                  if (polygonPointsRef.current.length >= 3) finishPolygon();
                  else { cancelPolygon(); setPolygonMode(false); }
                } else {
                  setPolygonMode(true);
                  toast.info("Clic en el mapa para agregar puntos. Doble clic para terminar.", { duration: 5000 });
                }
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22 22 2"/><path d="m15 2 7 0 0 7"/><path d="m2 15 0 7 7 0"/></svg>}
              label={measureMode ? "Terminar medición" : "Medir"}
              active={measureMode}
              onClick={() => {
                setActiveDropdown(null);
                if (measureMode) {
                  finishMeasurement();
                } else {
                  clearMeasurement(); // clear previous measurement if any
                  setMeasureMode(true);
                  toast.info("Clic en el mapa para medir distancias. Doble clic para terminar. Esc para cancelar.", { duration: 5000 });
                }
              }}
            />
            <DropdownItem
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>}
              label={laserActive ? "Apagar láser" : "Puntero láser (L)"}
              active={laserActive}
              onClick={() => { setActiveDropdown(null); setLaserActive(v => !v); }}
            />
            {!readonly && onSaveScale && backgroundType !== "livemap" && (
              <DropdownItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>}
                label={calibrateMode ? "Cancelar calibración" : (scaleMPerUnit ? "Recalibrar escala" : "Calibrar escala")}
                active={calibrateMode}
                onClick={() => {
                  setActiveDropdown(null);
                  if (calibrateMode) { setCalibrateMode(false); setRulerPts([]); return; }
                  if (measureMode) finishMeasurement();
                  setRulerPts([]); setCalibrateMode(true);
                  toast.info("Dibujá una referencia de largo conocido (2 clics) y poné los metros.", { duration: 5000 });
                }}
              />
            )}
          </ToolbarDropdown>

          {/* ── "Mapa" dropdown ── */}
          <ToolbarDropdown
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>}
            label="Mapa"
            open={ddMapa}
            onToggle={() => setActiveDropdown(v => v === "mapa" ? null : "mapa")}
          >
            {!isImageMode && <>
              <DropdownItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>}
                label="Satélite"
                active={mapStyle === "satellite"}
                onClick={() => { setMapStyle("satellite"); setActiveDropdown(null); }}
              />
              <DropdownItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>}
                label="Calles"
                active={mapStyle === "streets"}
                onClick={() => { setMapStyle("streets"); setActiveDropdown(null); }}
              />
              <DropdownItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>}
                label="Oscuro"
                active={mapStyle === "dark"}
                onClick={() => { setMapStyle("dark"); setActiveDropdown(null); }}
              />
              <DropdownSeparator />
            </>}
            {isImageMode && (
              <DropdownItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>}
                label="Imagen de fondo"
                onClick={() => { setActiveDropdown(null); onUploadBackground?.(); }}
              />
            )}
            {!isImageMode && (
              <DropdownItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>}
                label="Imagen de fondo"
                onClick={() => { setActiveDropdown(null); onUploadBackground?.(); }}
              />
            )}
            {isImageMode && (
              <DropdownItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>}
                label="Mapa real"
                onClick={() => { setActiveDropdown(null); onSetLiveMap?.(); }}
              />
            )}
          </ToolbarDropdown>

          {/* ── Brillo button (toggle slider panel below) ── */}
          <Tooltip content="Ajustar brillo" placement="bottom">
          <button
            onClick={() => setActiveDropdown(v => v === "brillo" ? null : "brillo")}
            className="flex items-center justify-center rounded-xl p-1.5 transition-all"
            style={{
              color: ddBrillo || overlayOpacity > 0 ? "#60a5fa" : "var(--text-secondary)",
              background: ddBrillo ? "var(--surface-elevated)" : "transparent",
            }}
            onMouseEnter={(e) => { if (!ddBrillo) { (e.currentTarget as HTMLElement).style.background = "var(--surface-elevated)"; }}}
            onMouseLeave={(e) => { if (!ddBrillo) { (e.currentTarget as HTMLElement).style.background = "transparent"; }}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
          </button>
          </Tooltip>

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
          <div className="h-5 w-px mx-0.5" style={{ background: "var(--glass-border)" }} />

          {/* Straight/Curved edges toggle */}
          <Tooltip content={straightEdges ? "Links rectos (clic para curvas)" : "Links curvos (clic para rectas)"} placement="bottom">
          <button onClick={() => {
            setStraightEdges(v => !v);
            setTimeout(() => { if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current); }, 0);
          }}
            className="rounded-lg p-1.5 transition-all"
            style={{ color: straightEdges ? "#f59e0b" : "var(--text-tertiary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {straightEdges
                ? <line x1="4" y1="20" x2="20" y2="4" />
                : <path d="M4 20 C 10 20, 14 4, 20 4" />}
            </svg>
          </button>
          </Tooltip>

          {/* Auto-save toggle */}
          <Tooltip content={autoSaveEnabled ? "Auto-save ON (clic para desactivar)" : "Auto-save OFF (clic para activar)"} placement="bottom">
          <button onClick={() => setAutoSaveEnabled(v => !v)}
            className="rounded-lg p-1.5 transition-all"
            style={{ color: autoSaveEnabled ? "#4ade80" : "var(--text-tertiary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {autoSaveEnabled ? <><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></> : <><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></>}
            </svg>
          </button>
          </Tooltip>

          {/* ─── Import (icon only) – only in edit mode, near Save ─── */}
          {editMode && availableMaps.length > 0 && (
            <div className="relative">
              <Tooltip content="Importar nodos de otro mapa" placement="bottom">
              <button onClick={() => setImportMapPickerOpen(v => !v)}
                disabled={importingMapId !== null}
                className="rounded-xl p-2 transition-all"
                style={{ color: importMapPickerOpen ? "#34d399" : "var(--text-secondary)", background: importMapPickerOpen ? "rgba(52,211,153,0.1)" : "transparent" }}
                onMouseEnter={(e) => { if (!importMapPickerOpen) { (e.currentTarget as HTMLElement).style.background = "var(--surface-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}}
                onMouseLeave={(e) => { if (!importMapPickerOpen) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>
                </svg>
              </button>
              </Tooltip>
              {importMapPickerOpen && (
                <div className="fixed inset-0 z-[99998]" onClick={() => setImportMapPickerOpen(false)} />
              )}
              {importMapPickerOpen && (
                <div className="absolute top-full right-0 mt-1 rounded-xl shadow-2xl py-1 z-[99999] min-w-[200px]"
                  style={{ background: "var(--glass-bg)", border: "1px solid rgba(52,211,153,0.25)", backdropFilter: "blur(20px)" }}>
                  <div className="px-3 py-1 pb-2">
                    <input type="text" autoFocus placeholder="Buscar mapa..." value={importMapSearch} onChange={(e) => setImportMapSearch(e.target.value)} className="w-full rounded px-2 py-1 text-xs focus:outline-none focus:border-[#34d399]" style={{ background: "var(--surface-card)", border: "1px solid var(--glass-border)", color: "var(--text-primary)" }} />
                  </div>
                  <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Importar nodos de (hasta 5)</div>
                  {availableMaps.filter(m => m.id !== mapId && m.name.toLowerCase().includes(importMapSearch.toLowerCase())).slice(0, 5).map(m => (
                    <button key={m.id} onClick={async () => {
                      setImportMapPickerOpen(false);
                      setImportingMapId(m.id);
                      try {
                        const data = await safeFetch<Record<string, any>>(apiUrl(`/api/maps/${m.id}/export`), undefined, "ImportNodes");
                        if (!data) throw new Error("Export failed");
                        const ts = Date.now();
                        const idMap: Record<string, string> = {};
                        const importedNodes = (data.nodes || []).map((n: any) => {
                          const newId = `imp-${ts}-${n.id}`;
                          idMap[n.id] = newId;
                          return { ...n, id: newId };
                        });
                        const importedEdges = (data.edges || []).map((e: any) => ({
                          ...e,
                          id: `imp-${ts}-${e.id}`,
                          source_node_id: idMap[e.source_node_id] || e.source_node_id,
                          target_node_id: idMap[e.target_node_id] || e.target_node_id,
                        }));
                        nodesRef.current = [...nodesRef.current, ...importedNodes];
                        edgesRef.current = [...edgesRef.current, ...importedEdges];
                        if (LRef.current && mapRef.current) {
                          renderNodes(LRef.current, mapRef.current);
                          renderEdges(LRef.current, mapRef.current);
                        }
                        toast.success(`Mapa "${m.name}" importado`, { description: `${importedNodes.length} nodos, ${importedEdges.length} links` });
                      } catch {
                        toast.error("Error al importar el mapa");
                      } finally {
                        setImportingMapId(null);
                      }
                    }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-all"
                      style={{ color: "var(--text-secondary)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.08)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}
                  {availableMaps.filter(m => m.id !== mapId).length === 0 && (
                    <div className="px-3 py-2 text-[10px]" style={{ color: "var(--text-tertiary)" }}>No hay otros mapas disponibles</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Grouped Global Actions (Export, Edit, Save) ─── */}
          <div className="flex items-center gap-0.5 rounded-xl px-1.5 py-1 ml-0.5"
            style={{ background: "var(--surface-card)", border: "1px solid var(--glass-border)" }}>

            {/* WhatsApp settings */}
            <Tooltip content="WhatsApp" placement="bottom">
              <button
                onClick={() => setWhatsappOpen(v => !v)}
                className="flex items-center justify-center rounded-lg p-1.5 transition-all hover:bg-white/5 active:scale-95"
                style={{
                  color: whatsappOpen ? "#25d366" : "var(--text-secondary)",
                  background: whatsappOpen ? "rgba(37,211,102,0.1)" : "transparent",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </button>
            </Tooltip>

            <div className="h-4 w-px mx-0.5" style={{ background: "var(--glass-border)" }} />

            {/* Export — single ZIP button (no dropdown) */}
            <Tooltip content="Exportar Mapa (ZIP)" placement="bottom">
              <button
                onClick={handleExportZip}
                disabled={zipExporting}
                className="flex items-center justify-center rounded-lg p-1.5 transition-all outline-none disabled:opacity-50"
                style={{ color: zipExporting ? "#f97316" : "var(--text-secondary)", background: zipExporting ? "rgba(249,115,22,0.1)" : "transparent" }}
              >
                {zipExporting
                  ? <div className="h-4 w-4 border-2 border-t-transparent border-orange-400 rounded-full animate-spin" />
                  : <Download className="h-4 w-4" />}
              </button>
            </Tooltip>

            <div className="h-4 w-px mx-0.5" style={{ background: "var(--glass-border)" }} />

            {/* Edit mode toggle (Pencil for edit, Lock for lock/view) */}
            <Tooltip content={editMode ? "Bloquear Mapa (Vista)" : "Modo Edición"} placement="bottom">
            <button
              onClick={() => { setEditMode(v => !v); closeAllDropdowns(); }}
              className="flex items-center justify-center rounded-lg p-1.5 transition-all hover:bg-white/5 active:scale-95"
              style={{
                color: editMode ? "#f59e0b" : "var(--muted-foreground)",
                background: editMode ? "rgba(245,158,11,0.1)" : "transparent",
              }}
            >
              {editMode ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4 opacity-50" />}
            </button>
            </Tooltip>

            {/* Save */}
            <Tooltip content="Guardar Cambios" placement="bottom">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center rounded-lg p-1.5 transition-all disabled:opacity-30 active:scale-95"
              style={{
                color: saving ? "#60a5fa" : "#60a5fa",
                background: saving ? "rgba(59,130,246,0.1)" : "transparent",
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </button>
            </Tooltip>
          </div>
        </div>

        {/* ── Brightness slider panel (below toolbar) ── */}
        {editMode && ddBrillo && (
          <div
            className="mt-1.5 rounded-xl px-3 py-2 flex items-center gap-2"
            style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={overlayOpacity > 0 ? "#60a5fa" : "var(--text-tertiary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            <span className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>Brillo</span>
            <input
              type="range" min="0" max={isImageMode ? "0.85" : "0.7"} step="0.05" value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-28 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #3b82f6 ${(overlayOpacity / (isImageMode ? 0.85 : 0.7)) * 100}%, #333 0%)` }}
            />
            <span className="text-[9px] font-mono w-6 text-right" style={{ color: "var(--text-tertiary)" }}>{Math.round(overlayOpacity * 100)}%</span>
          </div>
        )}
      </div>}

      {/* Context Menu */}
      {!isLocked && ctxMenu && (() => {
        const items = ctxMenu.nodeId
          ? getNodeCtxItems(ctxMenu.nodeId)
          : ctxMenu.edgeId
          ? getEdgeCtxItems(ctxMenu.edgeId)
          : getMapCtxItems(ctxMenu.latlng);
        if (items.length === 0) return null;
        return (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={items}
            onClose={() => setCtxMenu(null)}
          />
        );
      })()}

      {/* ── VERTICAL SIDEBAR CONTROLS (Right Side) ── */}
      {!rackDrawerNodeId && <VisualizationPanel
        mapRef={mapRef}
        nodesRef={nodesRef}
        LRef={LRef}
        sidebarWidth={sidebarWidth}
        showNodes={showNodes}
        setShowNodes={setShowNodes}
        showLinks={showLinks}
        setShowLinks={setShowLinks}
        showCameras={showCameras}
        setShowCameras={setShowCameras}
        showFOV={showFOV}
        setShowFOV={setShowFOV}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        panelCollapsed={panelCollapsed}
        onTogglePanel={!readonly ? () => {
          if (alertOpen) setAlertOpen(false); // close alerts when opening monitors
          if (whatsappOpen) setWhatsappOpen(false); // close whatsapp when opening monitors
          onTogglePanel?.();
        } : undefined}
        alertCount={alertCount}
        alertOpen={alertOpen}
        onToggleAlerts={!readonly ? () => {
          setAlertOpen(v => {
            if (!v && !panelCollapsed) onTogglePanel?.(); // close monitors when opening alerts
            if (!v) setWhatsappOpen(false); // close whatsapp when opening alerts
            return !v;
          });
        } : undefined}
      />}

      {/* MapSearchPanel removed — search is now inline in the toolbar */}

      {/* Alert Manager Panel */}
      <AlertManagerPanel
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        sidebarWidth={sidebarWidth}
        onCountChange={setLiveAlertCount}
        onEventClick={handleAlertEventClick}
        mapMonitorIds={mapMonitorIds}
      />

      {/* WhatsApp Settings Modal */}
      <WhatsAppSettingsPanel
        open={whatsappOpen}
        onClose={() => setWhatsappOpen(false)}
      />

      {/* Link Modal */}
      <LinkModal
        open={linkModalOpen}
        onClose={() => { setLinkModalOpen(false); cancelLinkCreation(); }}
        onSubmit={handleLinkModalSubmit}
        sourceName={nodesRef.current.find((n) => n.id === linkModalData.sourceId)?.label}
        targetName={nodesRef.current.find((n) => n.id === linkModalData.targetId)?.label}
        initial={linkModalData.initial}
        title={linkModalData.edgeId ? "Editar conexion" : "Nueva conexion"}
        snmpMonitors={snmpMonitorsMemo}
      />


      {/* ═══ Subnet Discovery Modal ═══ */}
      {discoveryModalOpen && (
        <SubnetDiscoveryModal
          existingIps={new Set(nodesRef.current.map((n) => { const cd = safeJsonParse<NodeCustomData>(n.custom_data); return cd.ip; }).filter(Boolean) as string[])}
          onAddNodes={(nodes) => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const offset = 0.001; // slight spread so nodes don't stack
            nodes.forEach((n, i) => {
              const angle = (2 * Math.PI * i) / nodes.length;
              const spread = Math.min(nodes.length * 0.0003, 0.005);
              const id = `disc-${Date.now()}-${i}`;
              const cd: Record<string, unknown> = { ...n.customData };
              if (n.color) cd.nodeColor = n.color;
              if (n.size !== 1.0) cd.nodeSize = n.size;
              nodesRef.current = [...nodesRef.current, {
                id, kuma_monitor_id: null, label: n.label,
                x: center.lat + Math.sin(angle) * spread,
                y: center.lng + Math.cos(angle) * spread,
                icon: n.icon,
                custom_data: Object.keys(cd).length > 0 ? JSON.stringify(cd) : undefined,
              }];
            });
            if (LRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
          }}
          onClose={() => setDiscoveryModalOpen(false)}
        />
      )}

      {/* ═══ ONVIF Discovery Modal ═══ */}
      {onvifModalOpen && (
        <OnvifDiscoveryModal
          onClose={() => setOnvifModalOpen(false)}
          existingIps={nodesRef.current.map((n) => { const cd = safeJsonParse<NodeCustomData>(n.custom_data); return cd.ip; }).filter(Boolean) as string[]}
          onAddCamera={(dev) => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const offsetLat = (Math.random() - 0.5) * 0.001;
            const offsetLng = (Math.random() - 0.5) * 0.001;
            const label = [dev.manufacturer, dev.model].filter(Boolean).join(" ") || `Cámara ${dev.ip}`;
            const cd: NodeCustomData = {
              ip: dev.ip,
              streamType: dev.streamUri ? "rtsp" : undefined,
              streamUrl: dev.streamUri || undefined,
              description: [dev.manufacturer, dev.model].filter(Boolean).join(" "),
            };
            const id = `onvif-${Date.now()}-${dev.ip.replace(/\./g, "")}`;
            nodesRef.current = [...nodesRef.current, {
              id, kuma_monitor_id: null, label,
              x: center.lat + offsetLat,
              y: center.lng + offsetLng,
              icon: "_camera",
              custom_data: JSON.stringify(cd),
            }];
            if (LRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
            toast.success(`Cámara agregada: ${label}`);
          }}
        />
      )}

      {/* ═══ Node Edit Modal ═══ */}
      {inputModalOpen && (
        <NodeEditModal
          config={inputModalConfig}
          showPass={showPass}
          onConfigChange={(updater) => setInputModalConfig(updater)}
          onShowPassToggle={() => setShowPass(!showPass)}
          onSubmit={(values) => {
            const idx = nodesRef.current.findIndex((n) => n.id === inputModalConfig.nodeId);
            if (idx >= 0) {
              const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
              ncd.mac = values.mac; ncd.ip = values.ip;
              ncd.credUser = values.credUser; ncd.credPass = values.credPass; ncd.credPort = values.credPort;
              ncd.labelHidden = values.labelHidden; ncd.labelSize = values.labelSize;
              ncd.nodeColor = values.nodeColor;
              const patch: Partial<typeof nodesRef.current[number]> = { label: values.name, custom_data: JSON.stringify(ncd) };
              if (values.kumaMonitorId !== undefined) patch.kuma_monitor_id = values.kumaMonitorId;
              nodesRef.current[idx] = { ...nodesRef.current[idx], ...patch };
              if (LRef.current && mapRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
            }
          }}
          onClose={() => { setInputModalOpen(false); setShowPass(false); }}
        />
      )}


      {/* Assign Monitor Modal */}
      {assignModalOpen && (
        <AssignMonitorModal
          monitors={kumaMonitors}
          usedMonitorIds={new Set(nodesRef.current.filter((n) => n.kuma_monitor_id && n.id !== assignNodeId).map((n) => n.kuma_monitor_id!))}
          search={assignSearch}
          onSearchChange={setAssignSearch}
          onAssign={(monitorId, monitorName) => {
            const idx = nodesRef.current.findIndex((n) => n.id === assignNodeId);
            if (idx >= 0) {
              nodesRef.current[idx] = { ...nodesRef.current[idx], kuma_monitor_id: monitorId, label: monitorName };
              if (LRef.current && mapRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
              toast.success("Monitor asignado", { description: monitorName });
            }
            setAssignModalOpen(false);
          }}
          onClose={() => setAssignModalOpen(false)}
        />
      )}

      {/* Color Picker Modal */}
      <FOVColorPickerModal
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        currentColor={(() => { const n = nodesRef.current.find(n => n.id === colorPickerNodeId); const cd = safeJsonParse<NodeCustomData>(n?.custom_data); return cd.fovColor || "#22c55e"; })()}
        currentOpacity={(() => { const n = nodesRef.current.find(n => n.id === colorPickerNodeId); const cd = safeJsonParse<NodeCustomData>(n?.custom_data); return cd.fovOpacity ?? 0.18; })()}
        onChangeColor={(color) => {
          const idx = nodesRef.current.findIndex((n) => n.id === colorPickerNodeId);
          if (idx >= 0) {
            const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
            ncd.fovColor = color;
            nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          }
        }}
        onChangeOpacity={(opacity) => {
          const idx = nodesRef.current.findIndex((n) => n.id === colorPickerNodeId);
          if (idx >= 0) {
            const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
            ncd.fovOpacity = opacity;
            nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          }
        }}
      />

      {/* Lens Picker Modal */}
      <LensPickerModal
        open={lensPickerOpen}
        onClose={() => setLensPickerOpen(false)}
        currentFov={(() => { const n = nodesRef.current.find(n => n.id === lensPickerNodeId); const cd = safeJsonParse<NodeCustomData>(n?.custom_data); return cd.fov || 60; })()}
        onSelectFov={(fov) => {
          const idx = nodesRef.current.findIndex((n) => n.id === lensPickerNodeId);
          if (idx >= 0) {
            const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
            ncd.fov = fov;
            nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          }
        }}
      />


      {/* ── Map Clock ── */}
      {!rackDrawerNodeId && <MapClock timeMachineTime={timeMachineTime} timeMachineOpen={timeMachineOpen} />}

      {/* ── Status bar bottom ── */}
      {!readonly && !rackDrawerNodeId && (() => {
        const total = nodesRef.current.filter(n => n.kuma_monitor_id && n.icon !== "_textLabel" && n.icon !== "_waypoint").length;
        const up = nodesRef.current.filter(n => { const m = getMonitorData(n.kuma_monitor_id); return m?.status === 1; }).length;
        const down = nodesRef.current.filter(n => { const m = getMonitorData(n.kuma_monitor_id); return m?.status === 0; }).length;
        const pending = total - up - down;
        return (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 rounded-2xl px-4 py-1.5 kumamap-no-print"
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

      {/* Time Machine — day/night solar overlay */}
      {!readonly && (() => {
        // Calcula oscuridad según hora del d: 0 = mediodía (sin overlay), 1 = medianoche (máximo)
        const getSkyDarkness = (date: Date): number => {
          const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
          // Curva coseno: 0 en mediodía (h=12), 1 en medianoche (h=0 o h=24)
          const dark = (1 - Math.cos(Math.PI / 12 * (h - 12))) / 2;
          return dark * 0.72; // máximo 72% de oscuridad a medianoche
        };

        const skyOpacity = (timeMachineTime && timeMachineOpen) ? getSkyDarkness(timeMachineTime) : 0;
        const overlayColor = `rgba(0, 8, 35, ${skyOpacity})`;

        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 999,
              background: overlayColor,
              // Sin transición al arrastrar (respuesta inmediata), suave al soltar
              transition: timeDragging ? "none" : "background 1.2s ease-out",
            }}
          />
        );
      })()}

      {/* Time Machine */}
      {!readonly && !rackDrawerNodeId && <TimeMachine
        open={timeMachineOpen}
        onToggle={() => setTimeMachineOpen((v) => !v)}
        onDragging={handleTimeDragging}
        mapMonitorIds={mapMonitorIds}
        initialFocusMonitorId={tmFocusMonitorId}
        jumpTo={tmJumpTo}
        onFocusEvent={handleTimeMachineFocusEvent}
        onTimeChange={handleTimeMachineChange}
        monitors={tmMonitors}
      />}

      {/* ── Event Report Modal ── */}
      {eventDetail && (
        <EventReportModal
          monitorId={eventDetail.monitorId}
          nodeLabel={eventDetail.nodeLabel}
          onClose={() => setEventDetail(null)}
        />
      )}

      {/* ── Hikvision Detection Popup (LPR / Face) ── */}
      {hikPopup && (
        <HikDetectionPopup
          event={hikPopup.event}
          anchorX={hikPopup.x}
          anchorY={hikPopup.y}
          onClose={() => setHikPopup(null)}
        />
      )}

      {/* ── LPR Access Feed Panel (bottom bar) ── */}
      <LprFeedPanel
        events={lprEventsMemo}
        mapId={mapId}
        nodeLabels={hikNodeLabels}
        onOpenStream={handleOpenStreamFromFeed}
      />

      {/* ── Camera Stream Config Modal ── */}
      {streamConfigNodeId && (() => {
        const camNode = nodesRef.current.find((n) => n.id === streamConfigNodeId);
        const camCd = safeJsonParse<NodeCustomData>(camNode?.custom_data);
        const currentCfg: CameraStreamConfig = {
          streamType: (camCd.streamType || "") as CameraStreamConfig["streamType"],
          streamUrl: camCd.streamUrl || "",
          snapshotInterval: camCd.snapshotInterval,
          rtspFps: camCd.rtspFps,
        };
        return (
          <CameraStreamConfigModal
            currentConfig={currentCfg}
            cameraName={camNode?.label || "Cámara"}
            onSave={(config) => {
              const idx = nodesRef.current.findIndex((n) => n.id === streamConfigNodeId);
              if (idx >= 0) {
                const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                ncd.streamType = config.streamType || undefined;
                ncd.streamUrl = config.streamUrl || undefined;
                ncd.snapshotInterval = config.snapshotInterval || undefined;
                ncd.rtspFps = config.rtspFps || undefined;
                // Clean empty fields
                if (!ncd.streamType) { delete ncd.streamType; delete ncd.streamUrl; delete ncd.snapshotInterval; delete ncd.rtspFps; }
                nodesRef.current[idx] = {
                  ...nodesRef.current[idx],
                  custom_data: JSON.stringify(ncd),
                };
              }
              setStreamConfigNodeId(null);
              toast.success(config.streamUrl ? "Stream configurado" : "Stream eliminado");
            }}
            onClose={() => setStreamConfigNodeId(null)}
          />
        );
      })()}

      {/* ── Antenna Config Modal ── */}
      {antennaConfigNodeId && (() => {
        const antNode = nodesRef.current.find((n) => n.id === antennaConfigNodeId);
        const antCd = safeJsonParse<NodeCustomData>(antNode?.custom_data);
        const currentCfg: AntennaConfig = {
          antennaType: (antCd.antennaType || "ptp") as AntennaConfig["antennaType"],
          frequency: antCd.frequency || "5.8 GHz",
          antennaGain: antCd.antennaGain ?? 23,
          txPower: antCd.txPower ?? 20,
          beamWidth: antCd.beamWidth ?? 30,
          beamRange: antCd.beamRange ?? (isImageMode ? 300 : 0.003),
          beamColor: antCd.beamColor || "#f59e0b",
          ssid: antCd.ssid || "",
          bandwidth: antCd.bandwidth || "40 MHz",
          protocol: antCd.protocol || "",
          peerNodeId: antCd.peerNodeId || "",
          ip: (antCd.ip as string) || "",
          snmpCommunity: (antCd.snmpCommunity as string) || "public",
        };
        // Get other antenna nodes for peer selection
        const antennaNodes = nodesRef.current
          .filter((n) => n.icon === "_antenna" && n.id !== antennaConfigNodeId)
          .map((n) => ({ id: n.id, label: n.label || "Antena" }));
        return (
          <AntennaConfigModal
            currentConfig={currentCfg}
            antennaName={antNode?.label || "Antena"}
            availableNodes={antennaNodes}
            onSave={(config) => {
              const idx = nodesRef.current.findIndex((n) => n.id === antennaConfigNodeId);
              if (idx >= 0) {
                const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                ncd.antennaType = config.antennaType;
                ncd.frequency = config.frequency;
                ncd.antennaGain = config.antennaGain;
                ncd.txPower = config.txPower;
                ncd.beamWidth = config.beamWidth;
                ncd.beamRange = config.beamRange;
                ncd.beamColor = config.beamColor;
                ncd.ssid = config.ssid || undefined;
                ncd.bandwidth = config.bandwidth;
                ncd.protocol = config.protocol || undefined;
                ncd.peerNodeId = config.peerNodeId || undefined;
                ncd.ip = config.ip || undefined;
                ncd.snmpCommunity = config.snmpCommunity || undefined;
                nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
                // Re-render to update beam
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              }
              setAntennaConfigNodeId(null);
              toast.success("Antena configurada");
            }}
            onClose={() => setAntennaConfigNodeId(null)}
          />
        );
      })()}

      {/* ── Antenna SNMP Wireless Panel ── */}
      {antennaSnmpNodeId && (() => {
        const antNode = nodesRef.current.find((n) => n.id === antennaSnmpNodeId);
        const antCd = safeJsonParse<NodeCustomData>(antNode?.custom_data);
        if (!antCd.ip) return null;
        return (
          <AntennaStatusPanel
            ip={antCd.ip as string}
            community={(antCd.snmpCommunity as string) || "public"}
            antennaName={antNode?.label || "Antena"}
            onClose={() => setAntennaSnmpNodeId(null)}
          />
        );
      })()}

      {/* ── UPS Panel ── */}
      {upsPanelState && (() => {
        const upsNode = nodesRef.current.find((n) => n.id === upsPanelState.nodeId);
        const upsCd = safeJsonParse<NodeCustomData>(upsNode?.custom_data);
        if (!upsCd.ip) return null;
        return (
          <UpsPanel
            nodeId={upsPanelState.nodeId}
            ip={upsCd.ip as string}
            upsName={upsNode?.label || "UPS"}
            anchorX={upsPanelState.x}
            anchorY={upsPanelState.y}
            onClose={() => setUpsPanelState(null)}
            onConfigure={() => setUpsConfigNodeId(upsPanelState.nodeId)}
          />
        );
      })()}

      {/* ── UPS Config Modal ── */}
      {upsConfigNodeId && (() => {
        const upsNode = nodesRef.current.find((n) => n.id === upsConfigNodeId);
        const upsCd = safeJsonParse<NodeCustomData>(upsNode?.custom_data);
        const currentCfg: UpsConfig = {
          protocol: (upsCd.upsProtocol || "snmp") as UpsConfig["protocol"],
          ip: (upsCd.ip as string) || "",
          snmpCommunity: (upsCd.upsSnmpCommunity as string) || (upsCd.snmpCommunity as string) || "public",
          nutPort: upsCd.nutPort ?? 3493,
          nutUpsName: upsCd.nutUpsName || "",
          nutUser: upsCd.nutUser || "",
          nutPassword: upsCd.nutPassword || "",
          kumaMonitorId: upsCd.kumaMonitorId ?? null,
          alertChargeBelow: upsCd.alertChargeBelow ?? 30,
          alertLoadAbove: upsCd.alertLoadAbove ?? 90,
          alertRuntimeBelow: upsCd.alertRuntimeBelow ?? 5,
        };
        return (
          <UpsConfigModal
            currentConfig={currentCfg}
            upsName={upsNode?.label || "UPS"}
            availableMonitors={kumaMonitors.map((m) => ({ id: m.id, name: m.name }))}
            onSave={(config) => {
              const idx = nodesRef.current.findIndex((n) => n.id === upsConfigNodeId);
              if (idx >= 0) {
                const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                // Field names must match what /api/ups/poll reads from custom_data.
                ncd.type = "ups";
                ncd.upsProtocol = config.protocol || "snmp";
                ncd.ip = config.ip || undefined;
                ncd.upsSnmpCommunity = config.snmpCommunity || undefined;
                ncd.nutPort = config.nutPort ?? undefined;
                ncd.nutUpsName = config.nutUpsName || undefined;
                ncd.nutUser = config.nutUser || undefined;
                ncd.nutPassword = config.nutPassword || undefined;
                ncd.kumaMonitorId = config.kumaMonitorId ?? null;
                ncd.alertChargeBelow = config.alertChargeBelow;
                ncd.alertLoadAbove = config.alertLoadAbove;
                ncd.alertRuntimeBelow = config.alertRuntimeBelow;
                nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              }
              setUpsConfigNodeId(null);
              toast.success("UPS configurada");
            }}
            onClose={() => setUpsConfigNodeId(null)}
          />
        );
      })()}

      {/* ── Camera Stream Viewers (multi-view, up to 4) ── */}
      {streamViewers.map((viewer, idx) => {
        const camNode = nodesRef.current.find((n) => n.id === viewer.nodeId);
        const camCd = safeJsonParse<NodeCustomData>(camNode?.custom_data);
        if (!camCd.streamUrl) return null;
        const viewCfg: CameraStreamConfig & { streamRef?: string } = {
          streamType: (camCd.streamType || "mjpeg") as CameraStreamConfig["streamType"],
          streamUrl: camCd.streamUrl,
          streamRef: camCd.streamRef,
          snapshotInterval: camCd.snapshotInterval,
          rtspFps: camCd.rtspFps,
        };
        const closeViewer = () => {
          setStreamViewers(prev => prev.filter(v => v.nodeId !== viewer.nodeId));
          cameraWindowStates.current.delete(viewer.nodeId);
          removeCameraWindow(mapId, viewer.nodeId);
        };
        if (viewer.mode === "tooltip") {
          return (
            <CameraTooltipViewer
              key={viewer.nodeId}
              config={viewCfg}
              cameraName={camNode?.label || "Cámara"}
              anchorX={tooltipAnchor.x}
              anchorY={tooltipAnchor.y}
              onClose={closeViewer}
              onExpand={() => setStreamViewers(prev => prev.map(v => v.nodeId === viewer.nodeId ? { ...v, mode: "pip" } : v))}
            />
          );
        }
        return (
          <CameraStreamViewer
            key={viewer.nodeId}
            config={viewCfg}
            cameraName={camNode?.label || "Cámara"}
            nodeId={viewer.nodeId}
            mapId={mapId}
            onClose={closeViewer}
            initialState={cameraWindowStates.current.get(viewer.nodeId)}
            initialOffset={idx}
            zLayer={focusedViewer === viewer.nodeId ? 10 : idx}
            onFocus={() => setFocusedViewer(viewer.nodeId)}
            onStateChange={(state) => {
              cameraWindowStates.current.set(viewer.nodeId, state);
              updateCameraWindow(mapId, state);
            }}
          />
        );
      })}

      {/* ── Icon Picker Modal (Leaflet) ── */}
      {iconPickerNodeId && (() => {
        const pickerNode = nodesRef.current.find((n) => n.id === iconPickerNodeId);
        return (
          <IconPickerModal
            currentIcon={pickerNode?.icon || "server"}
            onSelect={(icon) => {
              const idx = nodesRef.current.findIndex((n) => n.id === iconPickerNodeId);
              if (idx >= 0) {
                nodesRef.current[idx] = { ...nodesRef.current[idx], icon };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              }
              setIconPickerNodeId(null);
            }}
            onClose={() => setIconPickerNodeId(null)}
          />
        );
      })()}

      {/* ── Node Size Modal (Leaflet) ── */}
      {sizePickerNodeId && (() => {
        const sizeNode = nodesRef.current.find((n) => n.id === sizePickerNodeId);
        const scd = safeJsonParse<NodeCustomData>(sizeNode?.custom_data);
        return (
          <NodeSizeModal
            currentSize={scd.nodeSize || 1.0}
            nodeName={sizeNode?.label || "Nodo"}
            onSelect={(size) => {
              const idx = nodesRef.current.findIndex((n) => n.id === sizePickerNodeId);
              if (idx >= 0) {
                const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                ncd.nodeSize = size;
                nodesRef.current[idx] = {
                  ...nodesRef.current[idx],
                  custom_data: JSON.stringify(ncd),
                };
                if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              }
              setSizePickerNodeId(null);
            }}
            onClose={() => setSizePickerNodeId(null)}
          />
        );
      })()}

      {/* ═══ Linked Maps Modal ═══ */}
      {nodeMapModalNodeId && (() => {
        const node = nodesRef.current.find(n => n.id === nodeMapModalNodeId);
        if (!node) { setNodeMapModalNodeId(null); return null; }
        const cd = safeJsonParse<NodeCustomData>(node.custom_data);
        const linked: { id: string; name: string }[] = cd.linkedMaps || [];
        return (
          <LinkedMapsModal
            nodeLabel={node.label}
            linkedMaps={linked}
            availableMaps={availableMaps}
            currentMapId={mapId}
            onAddMap={(targetMapId, mapName) => {
              const idx = nodesRef.current.findIndex(n => n.id === nodeMapModalNodeId);
              if (idx < 0) return;
              const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
              const existing: { id: string; name: string }[] = ncd.linkedMaps || [];
              if (existing.some(m => m.id === targetMapId)) { toast.info("Este mapa ya está vinculado"); return; }
              ncd.linkedMaps = [...existing, { id: targetMapId, name: mapName }];
              nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              toast.success("Mapa vinculado", { description: mapName });
              setNodeMapModalNodeId(null);
            }}
            onRemoveMap={(targetMapId) => {
              const idx = nodesRef.current.findIndex(n => n.id === nodeMapModalNodeId);
              if (idx < 0) return;
              const ncd = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
              ncd.linkedMaps = (ncd.linkedMaps || []).filter((m: any) => m.id !== targetMapId);
              nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(ncd) };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              toast.success("Mapa desvinculado");
            }}
            onOpenMap={(id) => { if (onOpenMap) onOpenMap(id); else window.open(apiUrl(`/map/${id}`), "_blank"); }}
            onClose={() => setNodeMapModalNodeId(null)}
          />
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
          background: rgba(10,10,10,0.96) !important;
          backdrop-filter: blur(24px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          border-radius: 16px !important;
          box-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        .leaflet-popup-dark .leaflet-popup-content {
          margin: 0 !important;
          line-height: 1.4 !important;
        }
        .leaflet-popup-dark .leaflet-popup-tip {
          background: rgba(10,10,10,0.96) !important;
          box-shadow: none !important;
        }
        .leaflet-popup-close-button {
          color: rgba(255,255,255,0.35) !important;
          font-size: 18px !important;
          top: 8px !important;
          right: 10px !important;
          z-index: 10 !important;
          transition: color 0.15s !important;
        }
        .leaflet-popup-close-button:hover {
          color: rgba(255,255,255,0.7) !important;
        }
        @keyframes sileo-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes sileo-ring { 0%{r:4;opacity:0.6} 100%{r:10;opacity:0} }
        @keyframes sileo-check-draw { 0%{stroke-dashoffset:14} 100%{stroke-dashoffset:0} }
        @keyframes sileo-circle-draw { 0%{stroke-dashoffset:50} 100%{stroke-dashoffset:0} }
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
        @keyframes vpnFlow {
          to { stroke-dashoffset: -28; }
        }
        .link-vpn {
          animation: vpnFlow 1.5s linear infinite;
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
        @keyframes ping-badge {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(239,68,68,0.7), 0 0 20px rgba(239,68,68,0.3); }
          50% { transform: scale(1.18); box-shadow: 0 0 16px rgba(239,68,68,0.9), 0 0 32px rgba(239,68,68,0.5); }
        }
        /* Tooltip downtime bubble — subtle scale + glow pulse */
        @keyframes kuma-tip-pulse {
          0%   { box-shadow: 0 0 0 1px rgba(239,68,68,0.15), 0 0 14px rgba(239,68,68,0.35), 0 6px 16px rgba(0,0,0,0.75); }
          50%  { box-shadow: 0 0 0 1px rgba(239,68,68,0.35), 0 0 24px rgba(239,68,68,0.65), 0 8px 20px rgba(0,0,0,0.8); }
          100% { box-shadow: 0 0 0 1px rgba(239,68,68,0.15), 0 0 14px rgba(239,68,68,0.35), 0 6px 16px rgba(0,0,0,0.75); }
        }
        /* Make sure downtime counter sits above all other layers */
        .downtime-counter { z-index: 6000 !important; }
      `}</style>
      <NewMonitorModal
        open={newMonitorModalOpen}
        onClose={() => setNewMonitorModalOpen(false)}
        onCreated={(mid) => {
          // Monitor created! It will eventually arrive via WebSocket
          // but we can provide immediate feedback
          toast.info("Sensor creado y sincronizando...");
        }}
      />
      {/* ── Rack Device Picker — shown when linking from/to a rack node ── */}
      {rackPickerState && (() => {
        const rackNode = nodesRef.current.find(n => n.id === rackPickerState.rackNodeId);
        const cd = safeJsonParse<NodeCustomData>(rackNode?.custom_data);
        const devices: any[] = (cd.devices || []).sort((a: any, b: any) => b.unit - a.unit);
        return (
          <RackDevicePickerModal
            devices={devices}
            rackName={rackNode?.label || "Rack"}
            isSrc={rackPickerState.side === "source"}
            onSelect={handleRackPickerSelect}
            onCancel={() => { setRackPickerState(null); cancelLinkCreation(); }}
            getMonitorData={getMonitorData}
          />
        );
      })()}

      <RackDesignerDrawer
        open={rackDrawerNodeId !== null}
        onClose={() => setRackDrawerNodeId(null)}
        nodeId={rackDrawerNodeId}
        nodes={nodesRef.current}
        monitors={monitorsRef.current}
        readonly={isLocked}
        onSave={(nodeId, cd) => {
          const idx = nodesRef.current.findIndex(n => n.id === nodeId);
          if (idx >= 0) {
            nodesRef.current[idx].custom_data = JSON.stringify(cd);
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            pushUndo();
            handleSave();
            toast.success("Rack guardado");
          }
        }}
      />
    </div>
  );
}
