"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
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
  Server,
  Network,
  Cable,
  Zap,
  Router,
  PlugZap,
  HardDrive,
  Layers,
  Search,
  X as XIcon,
} from "lucide-react";
import Tooltip from "./Tooltip";
import TimeMachine from "./TimeMachine";
import EventReportModal from "./EventReportModal";
import CameraStreamConfigModal, { type CameraStreamConfig } from "./CameraStreamConfigModal";
import CameraStreamViewer from "./CameraStreamViewer";
import CameraTooltipViewer from "./CameraTooltipViewer";
import IconPickerModal from "./IconPickerModal";
import NodeSizeModal from "./NodeSizeModal";
import RackDesignerDrawer from "./RackDesignerDrawer";
import { safeJsonParse, safeFetch } from "@/lib/error-handler";
import type { NodeCustomData, EdgeCustomData, RackDeviceSummary } from "@/lib/types";
import { formatTraffic } from "@/utils/format";
import { statusColors, getStatusColor as _getStatusColor, getMonitorData as _getMonitorData } from "@/utils/status";
import { iconSvgPaths, getIconSvg, createMarkerIcon } from "@/utils/map-icons";
import { exportMapPng, printMap, exportNodesXlsx } from "@/utils/map-export";
import MapClock from "./MapClock";
import VisualizationPanel from "./VisualizationPanel";
import AlertManagerPanel, { useAlertCount, type TimelineEvent } from "./AlertManagerPanel";
import FOVColorPickerModal from "./FOVColorPickerModal";
import LensPickerModal from "./LensPickerModal";
import NewMonitorModal from "./NewMonitorModal";
import { useUndoHistory } from "@/hooks/useUndoHistory";
import { useAnimationTimers } from "@/hooks/useAnimationTimers";
import { useMapVisibility } from "@/hooks/useMapVisibility";
import { useAlertSound } from "@/hooks/useAlertSound";
import { useMapKeyboard } from "@/hooks/useMapKeyboard";
import { formatElapsed, formatSince, buildSparkline } from "./map-utils";
import NodeEditModal, { type NodeEditConfig } from "./NodeEditModal";
import AssignMonitorModal from "./AssignMonitorModal";
import LinkedMapsModal from "./LinkedMapsModal";
import NodeTemplateModal from "./NodeTemplateModal";
import SubnetDiscoveryModal from "./SubnetDiscoveryModal";
import type { NodeTemplate } from "@/lib/node-templates";


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
  /** Navigate to a linked map in the same window */
  onOpenMap?: (mapId: string) => void;
}



// ── Rack Device Picker Modal ─────────────────────────────────────────────────
// Must be a proper component (not IIFE) so React hooks are valid

import { STATUS_COLORS as STATUS_COLORS_RACK } from "@/constants/ui";

function RackDevicePickerModal({
  devices,
  rackName,
  isSrc,
  onSelect,
  onCancel,
  getMonitorData,
}: {
  devices: RackDeviceSummary[];
  rackName: string;
  isSrc: boolean;
  onSelect: (hint: string) => void;
  onCancel: () => void;
  getMonitorData: (id: number) => KumaMonitor | undefined;
}) {
  const [query, setQuery] = React.useState("");
  const [selectedDevice, setSelectedDevice] = React.useState<RackDeviceSummary | null>(null); // step 2

  const TYPE_ICON: Record<string, React.ReactNode> = {
    server:        <Server className="w-3.5 h-3.5" />,
    switch:        <Network className="w-3.5 h-3.5" />,
    patchpanel:    <Cable className="w-3.5 h-3.5" />,
    router:        <Router className="w-3.5 h-3.5" />,
    ups:           <Zap className="w-3.5 h-3.5" />,
    pdu:           <PlugZap className="w-3.5 h-3.5" />,
    "tray-fiber":  <HardDrive className="w-3.5 h-3.5" />,
    other:         <Layers className="w-3.5 h-3.5" />,
  };
  const TYPE_LABEL: Record<string, string> = {
    server: "Servidor", switch: "Switch", patchpanel: "Patch Panel",
    router: "Router", ups: "UPS", pdu: "PDU",
    "tray-fiber": "Fibra", "tray-1u": "Bandeja", "tray-2u": "Bandeja",
    "cable-organizer": "Org. Cable", other: "Otro",
  };
  const TYPE_COLOR: Record<string, string> = {
    server: "#3b82f6", switch: "#22c55e", patchpanel: "#f59e0b",
    router: "#8b5cf6", ups: "#ef4444", pdu: "#ec4899",
    "tray-fiber": "#06b6d4", other: "#6b7280",
  };

  const filtered = devices.filter((d) =>
    !query || d.label?.toLowerCase().includes(query.toLowerCase()) || TYPE_LABEL[d.type || ""]?.toLowerCase().includes(query.toLowerCase())
  );

  const deviceBaseHint = (d: RackDeviceSummary) => `${d.label} (U${d.unit}${(d.sizeUnits || 1) > 1 ? `-${(d.unit || 0) + (d.sizeUnits || 1) - 1}` : ""})`;

  // Determine if a device has selectable interfaces/ports
  const getDeviceInterfaces = (d: RackDeviceSummary): { id: string; label: string; sub: string; connected: boolean }[] => {
    if (d.type === "switch" && d.switchPorts?.length) {
      return d.switchPorts.map((p) => ({
        id: String(p.port),
        label: p.label && p.label !== String(p.port) ? `Puerto ${p.port} — ${p.label}` : `Puerto ${p.port}`,
        sub: [p.speed || "", p.connected ? "conectado" : "libre", p.vlan ? `VLAN ${p.vlan}` : ""].filter(Boolean).join(" · "),
        connected: !!p.connected,
      }));
    }
    if (d.type === "patchpanel" && d.ports?.length) {
      return d.ports.map((p) => ({
        id: String(p.port),
        label: p.label && p.label !== `P${p.port}` ? `Puerto ${p.port} — ${p.label}` : `Puerto ${p.port}`,
        sub: [p.connected ? "conectado" : "libre", p.destination || ""].filter(Boolean).join(" · "),
        connected: !!p.connected,
      }));
    }
    if (d.type === "router" && d.routerInterfaces?.length) {
      return d.routerInterfaces.map((iface) => ({
        id: iface.id,
        label: iface.name,
        sub: [iface.type, iface.ipAddress || "", iface.connected ? "conectado" : "libre"].filter(Boolean).join(" · "),
        connected: !!iface.connected,
      }));
    }
    return [];
  };

  const handleDeviceClick = (d: RackDeviceSummary) => {
    const ifaces = getDeviceInterfaces(d);
    if (ifaces.length === 0) {
      // No ports — select directly
      onSelect(deviceBaseHint(d));
    } else {
      setSelectedDevice(d);
    }
  };

  // ── Step 2: Port / Interface picker ─────────────────────────────────────────
  if (selectedDevice) {
    const ifaces = getDeviceInterfaces(selectedDevice);
    const col = TYPE_COLOR[selectedDevice.type || ""] || "#6b7280";
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#111", width: 420, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">
            <button onClick={() => setSelectedDevice(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all cursor-pointer">
              <XIcon className="w-3.5 h-3.5" style={{ transform: "rotate(45deg)" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-0.5">
                {isSrc ? "Interfaz de origen" : "Interfaz de destino"}
              </div>
              <div className="text-sm font-bold text-white/90 truncate">{selectedDevice.label}</div>
            </div>
            <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all cursor-pointer">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* "Sin interfaz específica" */}
          <div className="px-4 pt-3 pb-1">
            <button
              onClick={() => onSelect(deviceBaseHint(selectedDevice))}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all cursor-pointer text-xs border border-dashed border-white/[0.08]"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="italic">Sin interfaz específica</span>
            </button>
          </div>

          {/* Interface list */}
          <div className="overflow-y-auto px-4 pb-4 mt-1" style={{ maxHeight: 340, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
            {ifaces.map((iface) => (
              <button
                key={iface.id}
                onClick={() => onSelect(`${selectedDevice.label} > ${iface.label}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all cursor-pointer text-left"
                style={{ background: iface.connected ? `${col}12` : "rgba(255,255,255,0.025)" }}
                onMouseEnter={e => (e.currentTarget.style.background = `${col}22`)}
                onMouseLeave={e => (e.currentTarget.style.background = iface.connected ? `${col}12` : "rgba(255,255,255,0.025)")}
              >
                <div className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: iface.connected ? "#22c55e" : "#4b5563", boxShadow: iface.connected ? "0 0 5px #22c55e88" : "none" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white/85 truncate">{iface.label}</div>
                  {iface.sub && <div className="text-[10px] text-white/35 truncate">{iface.sub}</div>}
                </div>
              </button>
            ))}
          </div>
          <div className="px-5 py-2.5 border-t border-white/[0.05] text-[9px] text-white/20 text-center">
            La interfaz seleccionada se asociará al link
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Device picker ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
      <div
        className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "#111", width: 380, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-0.5">
              {isSrc ? "Equipo de origen" : "Equipo de destino"}
            </div>
            <div className="text-sm font-bold text-white/90 truncate">{rackName}</div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all cursor-pointer">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar equipo..."
              className="flex-1 bg-transparent text-xs text-white/80 placeholder-white/25 outline-none"
            />
          </div>
        </div>

        {/* "Sin equipo específico" option */}
        <div className="px-4 pb-1">
          <button
            onClick={() => onSelect("")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all cursor-pointer text-xs border border-dashed border-white/[0.08]"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="italic">Sin equipo específico</span>
          </button>
        </div>

        {/* Device list */}
        <div className="overflow-y-auto px-4 pb-4 mt-1" style={{ maxHeight: 320, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-white/25 italic">Sin equipos en este rack</div>
          )}
          {filtered.map((d: any) => {
            const col = TYPE_COLOR[d.type] || "#6b7280";
            const icon = TYPE_ICON[d.type] || TYPE_ICON.other;
            const typeLabel = TYPE_LABEL[d.type] || d.type;
            const monInfo = d.monitorId ? getMonitorData(d.monitorId) : null;
            const monColor = monInfo && monInfo.status != null ? (STATUS_COLORS_RACK[monInfo.status as number] || "#6b7280") : null;
            const hasInterfaces = getDeviceInterfaces(d).length > 0;

            return (
              <button
                key={d.id}
                onClick={() => handleDeviceClick(d)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all cursor-pointer group text-left"
                style={{ background: "rgba(255,255,255,0.025)" }}
                onMouseEnter={e => (e.currentTarget.style.background = `${col}18`)}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${col}22`, border: `1px solid ${col}44`, color: col }}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white/85 truncate">{d.label}</div>
                  <div className="text-[10px] text-white/35 flex items-center gap-1.5">
                    <span>{typeLabel}</span>
                    <span>·</span>
                    <span>U{d.unit}{d.sizeUnits > 1 ? `–${d.unit + d.sizeUnits - 1}` : ""}</span>
                    {d.portCount && <><span>·</span><span>{d.portCount}P</span></>}
                  </div>
                </div>
                {monColor && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: monColor, boxShadow: `0 0 6px ${monColor}` }} />}
                {/* Chevron if has interfaces */}
                {hasInterfaces && <div className="text-white/25 text-xs shrink-0">›</div>}
                <div className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
                  U{d.unit}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-white/[0.05] text-[9px] text-white/20 text-center">
          › indica que tiene puertos seleccionables
        </div>
      </div>
    </div>
  );
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
  onOpenMap,
}: LeafletMapViewProps) {
  const isImageMode = !!imageBackground;
  const [alertOpen, setAlertOpen] = useState(false);
  const polledAlertCount = useAlertCount(60000);
  const [liveAlertCount, setLiveAlertCount] = useState<number | null>(null);
  const alertCount = liveAlertCount ?? polledAlertCount;
  // Sync polled count when it updates (reset live override)
  useEffect(() => { setLiveAlertCount(null); }, [polledAlertCount]);
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
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
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
  const [streamViewers, setStreamViewers] = useState<{ nodeId: string; mode: "tooltip" | "pip" }[]>([]);
  const [focusedViewer, setFocusedViewer] = useState<string | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const MAX_STREAMS = 4;

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
  const edgeUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importMapPickerOpen, setImportMapPickerOpen] = useState(false);
  const [importMapSearch, setImportMapSearch] = useState("");
  const [importingMapId, setImportingMapId] = useState<string | null>(null);
  const [nodeMapModalNodeId, setNodeMapModalNodeId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
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
  const [timeBlurPulse, setTimeBlurPulse] = useState(0);
  const [colorPickerNodeId, setColorPickerNodeId] = useState<string>("");
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

  // Visibility toggles + map rotation are handled by useMapVisibility hook

  // ── Keyboard shortcuts (extracted hook) ──
  useMapKeyboard({
    onEscape: () => {
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

      // Register global handler
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

      safeTimeout(() => { try { map.removeLayer(popup); failPopupsRef.current.delete(node.id); } catch {} }, 8000);
    }, 300);
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

        // General map click handler (for polygon drawing)
        map.on("click", (e: any) => {
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
    deviceStatuses: Array<{ label: string; type: string; status: number; color: string; ping: number | null; uptime24: number | null }>;
  } {
    const cd = safeJsonParse<NodeCustomData>(node.custom_data);
    const devices: RackDeviceSummary[] = cd.devices || [];
    const monitored = devices.filter((d) => d.monitorId);
    if (monitored.length === 0) {
      return { status: -1, color: "#6b7280", pulse: false, monitoredCount: 0, totalDevices: devices.length, deviceStatuses: [] };
    }
    const deviceStatuses = monitored.map((d) => {
      const m = getMonitorData(d.monitorId!);
      const s = m?.status ?? 2;
      return { label: d.label || "Equipo", type: d.type || "other", status: s, color: statusColors[s] || "#6b7280", ping: m?.ping ?? null, uptime24: m?.uptime24 ?? null };
    });
    let worstStatus = 1;
    if (deviceStatuses.some(d => d.status === 0)) worstStatus = 0;
    else if (deviceStatuses.some(d => d.status === 2)) worstStatus = 2;
    else if (deviceStatuses.some(d => d.status === 3)) worstStatus = 3;
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
      const unmonitored = rack.totalDevices - rack.monitoredCount;
      const st = rack.status === 0 ? "DOWN" : rack.status === 2 ? "PENDING" : rack.status === 3 ? "MAINT" : rack.monitoredCount > 0 ? "OK" : "SIN SENSOR";
      const col = rack.color;
      const rows = rack.deviceStatuses.map(d => {
        const stT = d.status === 0 ? "DOWN" : d.status === 2 ? "PEND" : d.status === 3 ? "MAINT" : "UP";
        const pingT = d.ping != null ? `${d.ping}ms` : "";
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
          <div style="width:7px;height:7px;border-radius:50%;background:${d.color};box-shadow:0 0 5px ${d.color}88;flex-shrink:0;${d.status===0||d.status===2?"animation:ping-badge 1.5s ease-in-out infinite;":""}"></div>
          <span style="flex:1;font-size:10px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.label}</span>
          <span style="font-size:8px;font-weight:700;color:${d.color};background:${d.color}22;padding:1px 4px;border-radius:3px;">${stT}</span>
          ${pingT ? `<span style="font-size:8px;color:#666;font-family:monospace;">${pingT}</span>` : ""}
        </div>`;
      }).join("");
      return `<div style="background:#0f0f0f;color:#eee;padding:10px 14px;border-radius:12px;min-width:240px;max-width:300px;font-family:system-ui;border:1px solid ${col}44;">
        <div style="height:2px;background:linear-gradient(90deg,${col},${col}44);border-radius:1px;margin:-10px -14px 8px;"></div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${col};box-shadow:0 0 8px ${col};flex-shrink:0;"></div>
          <strong style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${node.label}</strong>
          <span style="color:${col};font-size:9px;font-weight:700;background:${col}22;padding:1px 6px;border-radius:4px;letter-spacing:0.5px;">${st}</span>
        </div>
        ${rack.monitoredCount > 0 ? `
        <div style="display:flex;gap:5px;margin-bottom:8px;">
          <div style="flex:1;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:6px;padding:4px 6px;text-align:center;">
            <div style="font-size:14px;font-weight:800;color:#22c55e;">${upCount}</div>
            <div style="font-size:8px;color:#555;letter-spacing:0.5px;">UP</div>
          </div>
          <div style="flex:1;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:4px 6px;text-align:center;">
            <div style="font-size:14px;font-weight:800;color:#ef4444;">${downCount}</div>
            <div style="font-size:8px;color:#555;letter-spacing:0.5px;">DOWN</div>
          </div>
          <div style="flex:1;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:6px;padding:4px 6px;text-align:center;">
            <div style="font-size:14px;font-weight:800;color:#f59e0b;">${pendCount}</div>
            <div style="font-size:8px;color:#555;letter-spacing:0.5px;">PEND</div>
          </div>
        </div>
        <div style="max-height:140px;overflow-y:auto;">${rows}</div>` : ""}
        <div style="font-size:9px;color:#555;margin-top:6px;display:flex;justify-content:space-between;">
          <span>${rack.totalDevices} equipos · ${cd.totalUnits || 42}U</span>
          ${unmonitored > 0 ? `<span>${unmonitored} sin sensor</span>` : ""}
        </div>
      </div>`;
    }

    const m = getMonitorData(node.kuma_monitor_id);
    const color = getStatusColor(node.kuma_monitor_id);
    const statusText = m ? (m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING") : "N/A";

    // Get tag info for display
    const tagBadges = (m?.tags || []).map((t: any) =>
      `<span style="background:${t.color}22;border:1px solid ${t.color}44;color:${t.color};padding:1px 5px;border-radius:4px;font-size:8px;font-weight:700;">${t.name}</span>`
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
            ${cd.ip ? `<a href="http://${cd.ip}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;"><span style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;padding:1px 6px;border-radius:6px;font-family:monospace;font-size:10px;cursor:pointer;">${cd.ip}</span></a>` : ""}
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
      const isWaypoint = node.icon === "_waypoint";
      const isPolygon = node.icon === "_polygon";
      const isRack = node.icon === "_rack";
      const cd = safeJsonParse<NodeCustomData>(node.custom_data);
      let color = getStatusColor(node.kuma_monitor_id);
      const m = getMonitorData(node.kuma_monitor_id);
      let pulse = !isLabel && (m?.status === 0 || m?.status === 2);
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
        nodeIcon = L.divIcon({
          className: "camera-marker",
          html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;transform:rotate(${rotation}deg);">
            <div style="width:${camSize}px;height:${camSize}px;border-radius:4px;background:${color};border:2px solid ${isSource ? "#60a5fa" : color};box-shadow:0 0 12px ${color}88;cursor:pointer;display:flex;align-items:center;justify-content:center;">
              <svg width="${camIcon}" height="${camIcon}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
            </div>
          </div>`,
          iconSize: [camSize, camSize],
          iconAnchor: [camSize / 2, camSize / 2],
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
            else window.open(apiUrl(`/?map=${linked[0].id}`), "_blank");
          } else if (linked.length > 1) {
            if (readonly) window.open(apiUrl(`/view/${linked[0].id}`), "_blank");
            else setNodeMapModalNodeId(node.id);
          } else if (!isLockedRef.current) {
            if (isCamera) {
              // Camera: open stream config modal
              setStreamConfigNodeId(node.id);
            } else {
              // Normal edit modal
              setInputModalConfig({ nodeId: node.id, initial: node.label, mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "" });
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

        if (isCamera) {
          const cd2 = safeJsonParse<NodeCustomData>(nodesRef.current[idx]?.custom_data);
          const rot = cd2.rotation ?? 0;
          const rawRange2 = cd2.fovRange ?? (isImageMode ? 200 : 0.003);
          const range = isImageMode && rawRange2 < 1 ? rawRange2 * 100000 : rawRange2;
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

      // If this is a waypoint/blind node (not a label, camera, polygon), follow the chain
      const isWaypoint = node.icon === "_waypoint" || (node.icon !== "_textLabel" && node.icon !== "_camera" && node.icon !== "_polygon" && !node.kuma_monitor_id);
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
    // Clear downtime counters (they'll be recreated by the interval)
    downtimeMarkersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    downtimeMarkersRef.current.clear();

    edgesRef.current.forEach((edge) => {
      const srcNode = nodesRef.current.find((n) => n.id === edge.source_node_id);
      const tgtNode = nodesRef.current.find((n) => n.id === edge.target_node_id);
      if (!srcNode || !tgtNode) return;

      const cd = safeJsonParse<EdgeCustomData>(edge.custom_data);

      // Find real endpoints through waypoint chains
      const { srcStatus, tgtStatus } = findRealEndpoints(edge.id);
      const isFiber = cd.linkType === "fiber";
      const isWireless = cd.linkType === "wireless";
      const isVPN = cd.linkType === "vpn";
      const isDown = srcStatus === 0 || tgtStatus === 0;
      const isBothDown = srcStatus === 0 && tgtStatus === 0;
      const isMaint = (srcStatus === 3 || tgtStatus === 3) && !isDown;
      const isPending = (srcStatus === 2 || tgtStatus === 2) && !isDown && !isMaint;

      let lineColor = isBothDown ? "#991b1b" : isDown ? "#ef4444" : isMaint ? "#8b5cf6" : isPending ? "#f59e0b" : isVPN ? "#3b82f6" : isFiber ? "#3b82f6" : isWireless ? "#f97316" : "#22c55e";
      let dashArray = isDown ? "8,6" : isVPN ? "1,14" : isWireless ? "6,8" : undefined;
      let lineCap: "round" | "butt" | "square" | undefined = isVPN ? "round" : undefined;
      let lineWeight = isDown ? 4 : isVPN ? 5 : 3;
      const lineOpacity = isBothDown ? 0.4 : isDown ? 0.9 : 0.9;

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

      // SNMP traffic widget — draggable with mini sparkline
      if (cd.snmpMonitorId && !cd.hideTraffic) {
        const snmpMon = kumaMonitors.find((m) => m.id === cd.snmpMonitorId);
        if (snmpMon) {
          const savedPos = cd.trafficLabelPos;
          const posLat = savedPos ? savedPos[0] : (srcNode.x + tgtNode.x) / 2;
          const posLng = savedPos ? savedPos[1] : (srcNode.y + tgtNode.y) / 2;
          const statusColor = snmpMon.status === 1 ? "#22c55e" : snmpMon.status === 0 ? "#ef4444" : "#f59e0b";

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

      // Invisible wider hit polyline for easier right-click on thin lines
      const hitLine = L.polyline(linePoints, {
        color: "transparent", weight: 16, opacity: 0, interactive: true,
      });
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
      let pulse = m?.status === 0 || m?.status === 2;
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
            setInputModalConfig({ nodeId, initial: node?.label || "", mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "" });
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
                else window.open(apiUrl(`/?map=${lm.id}`), "_blank");
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
          setInputModalConfig({ nodeId, initial: node?.label || "", mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "" });
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
        ],
      }] : []),
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
              else window.open(apiUrl(`/?map=${lm.id}`), "_blank");
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
            initial: { sourceInterface: cd.sourceInterface || "", targetInterface: cd.targetInterface || "", label: edge?.label || "", snmpMonitorId: cd.snmpMonitorId ?? null },
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

  // Node search — used by both image mode and livemap (nodes take priority over geocoding)
  const handleNodeSearch = useCallback((): boolean => {
    if (!searchQuery.trim() || !mapRef.current) return false;
    const q = searchQuery.toLowerCase();
    const match = nodesRef.current.find(n =>
      n.label?.toLowerCase().includes(q) ||
      (() => { const cd = safeJsonParse<NodeCustomData>(n.custom_data); return cd.ip?.includes(q) || cd.mac?.toLowerCase().includes(q); })()
    );
    if (match) {
      mapRef.current.setView([match.x, match.y], Math.max(mapRef.current.getZoom(), isImageMode ? mapRef.current.getZoom() : 16), { animate: true });
      toast.success("Nodo encontrado", { description: match.label });
      return true;
    }
    return false;
  }, [searchQuery, isImageMode]);

  // Search: nodes first, then geocoding (livemap only)
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapRef.current) return;
    // Always try node search first (works in both modes)
    if (handleNodeSearch()) return;
    // Livemap only: fall back to Nominatim geocoding
    if (isImageMode) { toast.error("No se encontró ningún nodo con ese nombre"); return; }
    try {
      const results = await safeFetch<{ lat: string; lon: string; display_name: string }[]>(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        { headers: { "User-Agent": "KumaMap/1.0" } },
        "Geocode"
      );
      if (results && results.length > 0) {
        const { lat, lon, display_name } = results[0];
        mapRef.current.setView([parseFloat(lat), parseFloat(lon)], 16, { animate: true });
        toast.success("Ubicacion encontrada", { description: display_name.substring(0, 60) });
      } else {
        toast.error("No se encontro la direccion ni nodo con ese nombre");
      }
    } catch {
      toast.error("Error buscando");
    }
  }, [searchQuery, handleNodeSearch, isImageMode]);

  // ── Export as PNG (html2canvas) ──
  const handleExportPng = useCallback(() => {
    if (containerRef.current) exportMapPng(containerRef.current, mapName || "kumamap");
  }, [mapName]);

  // ── Print map ──
  const handlePrint = useCallback(() => {
    printMap(mapRef.current, LRef.current, nodesRef.current, isImageMode);
  }, [isImageMode]);

  // ── Export node list as styled XLSX ──
  const handleExportCsv = useCallback(() => {
    exportNodesXlsx(nodesRef.current, kumaMonitors, mapName || "kumamap");
  }, [mapName, kumaMonitors]);

  return (
    <div className="relative h-full w-full transition-all duration-300 kumamap-print-area" style={{ marginRight: `${sidebarWidth}px` }}>
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
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 kumamap-no-print"
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

        {/* ═══ EDIT MODE TOOLS ═══ */}
        {editMode && <>
        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Node/Edge controls */}
        <div className="flex items-center gap-0.5">
          <Tooltip content="Agregar nodo" placement="bottom">
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `node-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Nuevo equipo", x: center.lat, y: center.lng, icon: "server" }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
          }}
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Nodo</span>
          </button>
          </Tooltip>
          <Tooltip content="Agregar desde plantilla" placement="bottom">
          <button onClick={() => setTemplateModalOpen(true)}
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Plantilla</span>
          </button>
          </Tooltip>
          <Tooltip content="Auto-descubrir dispositivos en subnet" placement="bottom">
          <button onClick={() => setDiscoveryModalOpen(true)}
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Descubrir</span>
          </button>
          </Tooltip>
          <Tooltip content="Agregar etiqueta" placement="bottom">
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `label-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Etiqueta", x: center.lat, y: center.lng, icon: "_textLabel" }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
          }}
            className="group flex items-center justify-center rounded-xl p-2 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
          </button>
          </Tooltip>
          <Tooltip content="Agregar cámara con campo de visión" placement="bottom">
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `cam-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Camara", x: center.lat, y: center.lng, icon: "_camera", custom_data: JSON.stringify({ type: "camera", rotation: 0, fov: 60, fovRange: isImageMode ? 200 : 0.002 }) }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Camara agregada — clic derecho para rotar");
          }}
            className="group flex items-center justify-center rounded-xl p-2 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
          </button>
          </Tooltip>
          <Tooltip content="Insertar Rack / Armario" placement="bottom">
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `rack-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "Rack", x: center.lat, y: center.lng, icon: "_rack", custom_data: JSON.stringify({ type: "rack", totalUnits: 42, devices: [] }) }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Rack creado — doble clic para editar");
          }}
            className="group flex items-center justify-center rounded-xl p-2 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="8" x2="16" y1="10" y2="10"/><line x1="8" x2="16" y1="14" y2="14"/><line x1="8" x2="16" y1="18" y2="18"/></svg>
          </button>
          </Tooltip>
        </div>

        {/* ─── Drawing tools separator ─── */}
        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="flex items-center gap-0.5" style={{ background: "rgba(255,255,255,0.02)", borderRadius: "12px", padding: "2px" }}>
          <Tooltip content="Waypoint para curvar links" placement="bottom">
          <button onClick={() => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `wp-${Date.now()}`;
            nodesRef.current = [...nodesRef.current, { id, kuma_monitor_id: null, label: "", x: center.lat, y: center.lng, icon: "_waypoint" }];
            if (LRef.current) renderNodes(LRef.current, mapRef.current);
            toast.success("Punto de ruta agregado");
          }}
            className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Punto</span>
          </button>
          </Tooltip>
          <Tooltip content={linkSource ? "Cancelar link" : "Crear link entre nodos"} placement="bottom">
          <button onClick={() => {
            if (linkSource) { cancelLinkCreation(); return; }
            if (nodesRef.current.length === 0) { toast.error("Agrega nodos primero"); return; }
            toast.info("Clic derecho en un nodo → Nuevo link", { duration: 4000 });
          }}
            className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-all ${linkSource ? "text-[#60a5fa]" : "text-[#888] hover:text-[#ededed] hover:bg-white/[0.06]"}`}
            style={linkSource ? { background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)" } : {}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">Link</span>
          </button>
          </Tooltip>
          <Tooltip content={polygonMode ? "Terminar polígono (doble clic)" : "Dibujar zona/polígono"} placement="bottom">
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
            className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-all ${polygonMode ? "text-[#4ade80]" : "text-[#888] hover:text-[#ededed] hover:bg-white/[0.06]"}`}
            style={polygonMode ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)" } : {}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/></svg>
            <span className="text-[10px] font-semibold hidden xl:inline">{polygonMode ? "Listo" : "Zona"}</span>
          </button>
          </Tooltip>
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

        {isImageMode ? (
          /* ── Image-mode right controls ── */
          <>
          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Node search */}
          {searchVisible ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                placeholder="Buscar nodo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNodeSearch();
                  if (e.key === "Escape") { setSearchVisible(false); setSearchQuery(""); }
                }}
                className="h-7 w-44 rounded-lg px-3 py-1 text-[11px] text-[#ededed] placeholder:text-[#555] focus:outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <button onClick={handleNodeSearch} className="rounded-lg p-1 transition-all text-[#60a5fa]"
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.12)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </button>
              <button onClick={() => { setSearchVisible(false); setSearchQuery(""); }}
                className="rounded-lg p-1 text-[#555] hover:text-[#ededed] transition-all">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          ) : (
            <Tooltip content="Buscar nodo" placement="bottom">
            <button onClick={() => setSearchVisible(true)} className="rounded-xl p-1.5 transition-all"
              style={{ color: "#888" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#ededed"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#888"; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
            </Tooltip>
          )}

          {/* Brightness + Rotation (only in edit mode) */}
          {editMode && <>
          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />
          {/* Brightness slider */}
          <Tooltip content="Oscurecer imagen de fondo" placement="bottom">
          <div className="flex items-center gap-1.5 rounded-xl px-2 py-1" style={{ background: "rgba(255,255,255,0.02)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={overlayOpacity > 0 ? "#60a5fa" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            <input type="range" min="0" max="0.85" step="0.05" value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-14 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #3b82f6 ${(overlayOpacity / 0.85) * 100}%, #333 0%)` }}
            />
          </div>
          </Tooltip>

          </>}

          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />
          {/* Upload + switch to livemap */}
          <div className="flex items-center gap-0.5 rounded-xl p-0.5" style={{ background: "rgba(255,255,255,0.02)" }}>
            <Tooltip content="Cambiar imagen de fondo" placement="bottom">
            <button onClick={onUploadBackground}
              className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            </button>
            </Tooltip>
            <Tooltip content="Cambiar a mapa real" placement="bottom">
            <button onClick={onSetLiveMap}
              className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </button>
            </Tooltip>
          </div>
          </>
        ) : (
          /* ── Livemap search ── */
          searchVisible ? (
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
            <Tooltip content="Buscar dirección" placement="bottom">
            <button
              onClick={() => setSearchVisible(true)}
              className="rounded-xl p-1.5 transition-all"
              style={{ color: "#888" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#ededed"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#888"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
            </Tooltip>
          )
        )}

        {/* ═══ EDIT MODE: Map controls (livemap only) ═══ */}
        {editMode && !isImageMode && <>
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
          />
        </div>



        </>}

        <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Straight/Curved edges toggle */}
        <Tooltip content={straightEdges ? "Links rectos (clic para curvas)" : "Links curvos (clic para rectas)"} placement="bottom">
        <button onClick={() => {
          setStraightEdges(v => !v);
          // Re-render edges immediately
          setTimeout(() => { if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current); }, 0);
        }}
          className="rounded-lg p-1.5 transition-all"
          style={{ color: straightEdges ? "#f59e0b" : "#555" }}>
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
          style={{ color: autoSaveEnabled ? "#4ade80" : "#555" }}>
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
              style={{ color: importMapPickerOpen ? "#34d399" : "#888", background: importMapPickerOpen ? "rgba(52,211,153,0.1)" : "transparent" }}
              onMouseEnter={(e) => { if (!importMapPickerOpen) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#ededed"; }}}
              onMouseLeave={(e) => { if (!importMapPickerOpen) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#888"; }}}>
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
                style={{ background: "rgba(12,12,12,0.98)", border: "1px solid rgba(52,211,153,0.25)", backdropFilter: "blur(20px)" }}>
                <div className="px-3 py-1 pb-2">
                  <input type="text" autoFocus placeholder="Buscar mapa..." value={importMapSearch} onChange={(e) => setImportMapSearch(e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-[#ededed] focus:outline-none focus:border-[#34d399]" />
                </div>
                <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-[#555]">Importar nodos de (hasta 5)</div>
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
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#a0a0a0] transition-all"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.08)"; (e.currentTarget as HTMLElement).style.color = "#ededed"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#a0a0a0"; }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
                {availableMaps.filter(m => m.id !== mapId).length === 0 && (
                  <div className="px-3 py-2 text-[10px] text-[#555]">No hay otros mapas disponibles</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Grouped Global Actions (Export, Edit, Save) ─── */}
        <div className="flex items-center gap-0.5 rounded-xl px-1.5 py-1 ml-0.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          
          {/* Export */}
          <div className="relative">
            <Tooltip content="Exportar Mapa" placement="bottom">
            <button
              onClick={() => setExportMenuOpen(v => !v)}
              className="flex items-center justify-center rounded-lg p-1.5 transition-all outline-none"
              style={{ color: exportMenuOpen ? "#ededed" : "#888", background: exportMenuOpen ? "rgba(255,255,255,0.08)" : "transparent" }}
            >
              <Download className="h-4 w-4" />
            </button>
            </Tooltip>
            {exportMenuOpen && (
              <div
                className="absolute top-full mt-2 right-0 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
                style={{ background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.1)", zIndex: 99999, minWidth: "190px", backdropFilter: "blur(20px)" }}
                onMouseLeave={() => setExportMenuOpen(false)}
              >
                <button onClick={() => { setExportMenuOpen(false); handleExportPng(); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[11px] text-left transition-all hover:bg-white/[0.05]"
                  style={{ color: "#ccc" }}>
                  <div className="h-6 w-6 rounded-lg flex items-center justify-center bg-blue-500/10 border border-blue-500/20">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  </div>
                  Exportar como PNG
                </button>
                <button onClick={() => { setExportMenuOpen(false); handlePrint(); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[11px] text-left transition-all hover:bg-white/[0.05]"
                  style={{ color: "#ccc" }}>
                  <div className="h-6 w-6 rounded-lg flex items-center justify-center bg-purple-500/10 border border-purple-500/20">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                  </div>
                  Imprimir mapa
                </button>
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />
                <button onClick={() => { setExportMenuOpen(false); handleExportCsv(); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[11px] text-left transition-all hover:bg-white/[0.05]"
                  style={{ color: "#ccc" }}>
                  <div className="h-6 w-6 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" x2="16" y1="13" y2="13"/><line x1="8" x2="16" y1="17" y2="17"/><line x1="8" x2="11" y1="9" y2="9"/></svg>
                  </div>
                  Exportar XLSX
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.08)" }} />

          {/* Edit mode toggle (Pencil for edit, Lock for lock/view) */}
          <Tooltip content={editMode ? "Bloquear Mapa (Vista)" : "Modo Edición"} placement="bottom">
          <button
            onClick={() => setEditMode(v => !v)}
            className="flex items-center justify-center rounded-lg p-1.5 transition-all hover:bg-white/5 active:scale-95"
            style={{
              color: editMode ? "#f59e0b" : "#666",
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
          onTogglePanel?.();
        } : undefined}
        alertCount={alertCount}
        alertOpen={alertOpen}
        onToggleAlerts={!readonly ? () => {
          setAlertOpen(v => {
            if (!v && !panelCollapsed) onTogglePanel?.(); // close monitors when opening alerts
            return !v;
          });
        } : undefined}
      />}

      {/* Alert Manager Panel */}
      <AlertManagerPanel
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        sidebarWidth={sidebarWidth}
        onCountChange={setLiveAlertCount}
        onEventClick={handleAlertEventClick}
        mapMonitorIds={mapMonitorIds}
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
        snmpMonitors={kumaMonitors.filter((m) => m.type === "snmp" || m.type === "push" || m.type === "port")}
      />

      {/* ═══ Node Template Modal ═══ */}
      {templateModalOpen && (
        <NodeTemplateModal
          onSelect={(template: NodeTemplate) => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            const id = `node-${Date.now()}`;
            const cd: Record<string, unknown> = { ...template.customData };
            if (template.color) cd.nodeColor = template.color;
            if (template.size !== 1.0) cd.nodeSize = template.size;
            nodesRef.current = [...nodesRef.current, {
              id, kuma_monitor_id: null, label: template.defaultLabel,
              x: center.lat, y: center.lng, icon: template.icon,
              custom_data: Object.keys(cd).length > 0 ? JSON.stringify(cd) : undefined,
            }];
            if (LRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
            setTemplateModalOpen(false);
            toast.success(`${template.name} agregado`);
          }}
          onClose={() => setTemplateModalOpen(false)}
        />
      )}

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
              nodesRef.current[idx] = { ...nodesRef.current[idx], label: values.name, custom_data: JSON.stringify(ncd) };
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
        monitors={kumaMonitors.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          status: m.status,
          parent: m.parent,
        }))}
      />}

      {/* ── Event Report Modal ── */}
      {eventDetail && (
        <EventReportModal
          monitorId={eventDetail.monitorId}
          nodeLabel={eventDetail.nodeLabel}
          onClose={() => setEventDetail(null)}
        />
      )}

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

      {/* ── Camera Stream Viewers (multi-view, up to 4) ── */}
      {streamViewers.map((viewer, idx) => {
        const camNode = nodesRef.current.find((n) => n.id === viewer.nodeId);
        const camCd = safeJsonParse<NodeCustomData>(camNode?.custom_data);
        if (!camCd.streamUrl) return null;
        const viewCfg: CameraStreamConfig = {
          streamType: (camCd.streamType || "mjpeg") as CameraStreamConfig["streamType"],
          streamUrl: camCd.streamUrl,
          snapshotInterval: camCd.snapshotInterval,
          rtspFps: camCd.rtspFps,
        };
        const closeViewer = () => setStreamViewers(prev => prev.filter(v => v.nodeId !== viewer.nodeId));
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
            onClose={closeViewer}
            initialOffset={idx}
            zLayer={focusedViewer === viewer.nodeId ? 10 : idx}
            onFocus={() => setFocusedViewer(viewer.nodeId)}
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
            onOpenMap={(id) => { if (onOpenMap) onOpenMap(id); else window.open(apiUrl(`/?map=${id}`), "_blank"); }}
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
          background: rgba(14,14,14,0.95) !important;
          backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 12px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
          padding: 10px 14px !important;
        }
        .leaflet-popup-dark .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-dark .leaflet-popup-tip {
          background: rgba(14,14,14,0.95) !important;
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
