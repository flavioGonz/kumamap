"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipForward, AlertTriangle, MapPin, Clock } from "lucide-react";
import type { KioskMapHandle } from "./LeafletMapView";
import type { SavedNode, KumaMonitor, NodeCustomData, RackDeviceSummary } from "@/lib/types";
import { safeJsonParse } from "@/lib/error-handler";
import { apiUrl } from "@/lib/api";
import KioskTourTooltip, { type KioskTooltipData } from "./KioskTourTooltip";
import type { UpsResult } from "@/lib/ups";

/**
 * KioskAutoTour — floating controls for kiosk mode
 *
 * Behaviour:
 *  1. Press Play → flyTo each monitored node one by one (overview tour)
 *  2. After the full tour, zoom out to fit-all for a brief pause
 *  3. Then enter "alert rotation" — only cycle through DOWN nodes, pausing
 *     longer on each. If no nodes are down, loop back to step 1.
 *  4. The cycle repeats INDEFINITELY until the user pauses.
 *  5. Pause stops the cycle; Skip jumps to the next node immediately.
 *  6. Dwell time and playing state are persisted in localStorage per mapId.
 */

interface KioskAutoTourProps {
  mapHandle: KioskMapHandle | null;
  monitors: KumaMonitor[];
  mapId: string;
}

const DWELL_OPTIONS = [3, 5, 8, 10, 15, 20, 30]; // seconds
const FLY_ZOOM     = 18;     // zoom level when visiting a node
const STORAGE_KEY  = "kumamap_tour";

/* ── Persistence helpers ── */
interface TourConfig {
  dwellSec: number;
  playing: boolean;
}

function loadTourConfig(mapId: string): TourConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dwellSec: 5, playing: false };
    const data = JSON.parse(raw);
    const cfg = data[mapId];
    if (!cfg) return { dwellSec: 5, playing: false };
    return {
      dwellSec: typeof cfg.dwellSec === "number" ? cfg.dwellSec : 5,
      playing: !!cfg.playing,
    };
  } catch { return { dwellSec: 5, playing: false }; }
}

function saveTourConfig(mapId: string, cfg: Partial<TourConfig>): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[mapId] = { ...(data[mapId] || {}), ...cfg };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* silently fail */ }
}

type Phase = "idle" | "tour" | "fitall" | "alerts";

export default function KioskAutoTour({ mapHandle, monitors, mapId }: KioskAutoTourProps) {
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentLabel, setCurrentLabel] = useState("");
  const [downCount, setDownCount] = useState(0);
  const [dwellSec, setDwellSec] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const restoredRef = useRef(false);
  const autoStarted = useRef(false);

  // Tour tooltip overlay state (rack / UPS enriched tooltips)
  const [tooltipData, setTooltipData] = useState<KioskTooltipData | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const playingRef = useRef(false);
  const skipRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellRef = useRef(dwellSec);

  // Keep ref in sync with state
  useEffect(() => { dwellRef.current = dwellSec; }, [dwellSec]);

  // ── Restore persisted config on mount ──
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const cfg = loadTourConfig(mapId);
    setDwellSec(cfg.dwellSec);
    dwellRef.current = cfg.dwellSec;
    if (cfg.playing) {
      // Mark that we want to auto-start once mapHandle is ready
      autoStarted.current = false;
      setPlaying(true);
      playingRef.current = true;
    }
  }, [mapId]);

  // Build monitor index for fast lookup
  const monitorIndex = useRef<Map<number, KumaMonitor>>(new Map());
  useEffect(() => {
    const idx = new Map<number, KumaMonitor>();
    monitors.forEach(m => idx.set(m.id, m));
    monitorIndex.current = idx;
    let dc = 0;
    idx.forEach(m => { if (m.status === 0) dc++; });
    setDownCount(dc);
  }, [monitors]);

  const sleep = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };
      const poll = setInterval(() => {
        if (!playingRef.current) { clearInterval(poll); done(); }
        else if (skipRef.current) { skipRef.current = false; clearInterval(poll); done(); }
      }, 200);
      timerRef.current = setTimeout(() => { clearInterval(poll); done(); }, ms);
    });
  }, []);

  const getMonitoredNodes = useCallback((): SavedNode[] => {
    if (!mapHandle) return [];
    const nodes = mapHandle.getNodes();
    return nodes.filter(n => {
      // Skip decorative nodes
      if (n.icon === "_textLabel" || n.icon === "_waypoint" || n.icon === "_polygon") return false;
      // Include nodes with direct monitor (but skip Kuma "group" monitors — they're folders, not real devices)
      if (n.kuma_monitor_id != null && n.kuma_monitor_id > 0) {
        const m = monitorIndex.current.get(n.kuma_monitor_id);
        if (m?.type === "group") return false;
        return true;
      }
      // Include rack nodes with monitored devices (even without their own monitor)
      if (n.icon === "_rack") {
        const cd = safeJsonParse<NodeCustomData>(n.custom_data);
        if (cd.type === "rack" && cd.devices?.some(d => d.monitorId)) return true;
      }
      // Include UPS nodes with IP (even without their own monitor)
      if (n.icon === "ups") {
        const cd = safeJsonParse<NodeCustomData>(n.custom_data);
        if (cd.ip) return true;
      }
      return false;
    });
  }, [mapHandle]);

  const getDownNodes = useCallback((): SavedNode[] => {
    return getMonitoredNodes().filter(n => {
      const m = monitorIndex.current.get(n.kuma_monitor_id!);
      return m?.status === 0;
    });
  }, [getMonitoredNodes]);

  /* ── Pixelate-dissolve transition helpers (GPU-accelerated CSS filter) ──
   *  Applied to #kiosk-map-wrap during flyTo to fully mask the camera movement.
   *  Phase 1 (dissolveOut): heavy blur + brightness drop + opacity fade → hides current view
   *  Phase 2 (dissolveIn):  starts blurred, animates to crisp → cinematic focus-in reveal
   *  The map moves while fully hidden (opacity 0), so no movement is visible. */
  const dissolveOut = useCallback(() => {
    const el = document.getElementById("kiosk-map-wrap");
    if (!el) return;
    el.style.transition = "filter 0.35s cubic-bezier(0.4, 0, 1, 1), opacity 0.35s cubic-bezier(0.4, 0, 1, 1)";
    el.style.filter = "blur(28px) brightness(0.3) saturate(0.5)";
    el.style.opacity = "0";
  }, []);

  const dissolveIn = useCallback(() => {
    const el = document.getElementById("kiosk-map-wrap");
    if (!el) return;
    // Start blurred but visible
    el.style.transition = "none";
    el.style.filter = "blur(18px) brightness(0.6) saturate(0.7)";
    el.style.opacity = "1";
    // Force reflow to apply the starting state
    void el.offsetWidth;
    // Animate to crisp — smooth cinematic focus-in
    el.style.transition = "filter 0.7s cubic-bezier(0, 0, 0.2, 1)";
    el.style.filter = "none";
  }, []);

  const dissolveReset = useCallback(() => {
    const el = document.getElementById("kiosk-map-wrap");
    if (!el) return;
    el.style.transition = "none";
    el.style.filter = "none";
    el.style.opacity = "1";
  }, []);

  // ── Status colors (matching LeafletMapView) ──
  const statusColors: Record<number, string> = { [-1]: "#6b7280", 0: "#ef4444", 1: "#22c55e", 2: "#f59e0b", 3: "#a855f7" };

  // ── Node type detection helpers ──
  const isRackNode = useCallback((node: SavedNode): boolean => {
    if (node.icon !== "_rack") return false;
    const cd = safeJsonParse<NodeCustomData>(node.custom_data);
    return cd.type === "rack";
  }, []);

  const isUpsNode = useCallback((node: SavedNode): boolean => {
    return node.icon === "ups";
  }, []);

  // ── Build rack tooltip data from node + monitor index ──
  const buildRackTooltipData = useCallback((node: SavedNode): KioskTooltipData => {
    const cd = safeJsonParse<NodeCustomData>(node.custom_data);
    const devices: RackDeviceSummary[] = cd.devices || [];
    const monitored = devices.filter(d => d.monitorId);
    const deviceStatuses = monitored.map(d => {
      const m = monitorIndex.current.get(d.monitorId!);
      const isPaused = m ? !m.active : false;
      const s = isPaused ? -1 : (m?.status ?? 2);
      return {
        label: d.label || "Equipo",
        type: d.type || "other",
        status: s,
        color: isPaused ? "#6b7280" : (statusColors[s] || "#6b7280"),
        ping: m?.ping ?? null,
        monitorId: d.monitorId ?? null,
      };
    });
    return {
      node,
      type: "rack",
      rackDevices: deviceStatuses,
      rackTotalDevices: devices.length,
    };
  }, [statusColors]);

  // ── Fetch UPS data and build tooltip ──
  const buildUpsTooltipData = useCallback(async (node: SavedNode): Promise<KioskTooltipData> => {
    const cd = safeJsonParse<NodeCustomData>(node.custom_data);
    if (!cd.ip) {
      return { node, type: "ups", upsData: null };
    }
    try {
      // Credentials stay server-side; the kiosk is unauthenticated and may only poll by nodeId.
      const resp = await fetch(apiUrl(`/api/ups/poll?nodeId=${encodeURIComponent(node.id)}`));
      if (!resp.ok) return { node, type: "ups", upsData: null };
      const upsData: UpsResult = await resp.json();
      return { node, type: "ups", upsData };
    } catch {
      return { node, type: "ups", upsData: null };
    }
  }, []);

  // ── Show / hide tooltip helpers ──
  const showTooltip = useCallback((data: KioskTooltipData, pos: { x: number; y: number } | null) => {
    setTooltipData(data);
    setTooltipPos(pos);
    setTooltipVisible(true);
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltipVisible(false);
    // Clear data after animation
    setTimeout(() => { setTooltipData(null); setTooltipPos(null); }, 300);
  }, []);

  /** Show the correct tooltip/popup for a node: rack → enriched tooltip, UPS → SNMP tooltip, else → Leaflet popup */
  const showNodeInfo = useCallback(async (node: SavedNode) => {
    if (isRackNode(node)) {
      const pos = mapHandle?.getNodeScreenPos(node.id) ?? null;
      const data = buildRackTooltipData(node);
      showTooltip(data, pos);
    } else if (isUpsNode(node)) {
      const pos = mapHandle?.getNodeScreenPos(node.id) ?? null;
      const data = await buildUpsTooltipData(node);
      showTooltip(data, pos);
    } else {
      // Regular nodes (including group monitors) use the standard Leaflet popup
      mapHandle?.openPopup(node.id);
    }
  }, [isRackNode, isUpsNode, buildRackTooltipData, buildUpsTooltipData, showTooltip, mapHandle]);

  /** Close any active tooltip or Leaflet popup */
  const closeNodeInfo = useCallback(() => {
    hideTooltip();
    mapHandle?.closePopup();
  }, [hideTooltip, mapHandle]);

  /** Dissolve-transition to a node: fade out → move map (invisible) → fade in with focus */
  const transitionToNode = useCallback(async (lat: number, lng: number, zoom: number) => {
    if (!mapHandle) return;
    // 1. Dissolve out (pixelate + fade to black)
    dissolveOut();
    await sleep(400);                       // wait for dissolve-out to finish
    if (!playingRef.current) { dissolveReset(); return; }
    // 2. Move map while hidden (instant, no animation)
    mapHandle.flyTo(lat, lng, zoom, 0);
    await sleep(500);                       // allow tiles to load while hidden
    if (!playingRef.current) { dissolveReset(); return; }
    // 3. Dissolve in (focus reveal)
    dissolveIn();
    await sleep(750);                       // wait for focus-in animation
  }, [mapHandle, dissolveOut, dissolveIn, dissolveReset, sleep]);

  /** Dissolve-transition to fit-all view */
  const transitionToFitAll = useCallback(async () => {
    if (!mapHandle) return;
    dissolveOut();
    await sleep(400);
    if (!playingRef.current) { dissolveReset(); return; }
    mapHandle.fitAll();
    await sleep(500);
    if (!playingRef.current) { dissolveReset(); return; }
    dissolveIn();
    await sleep(750);
  }, [mapHandle, dissolveOut, dissolveIn, dissolveReset, sleep]);

  const runCycle = useCallback(async () => {
    if (!mapHandle) return;

    // ── Infinite loop — repeats until user pauses ──
    while (playingRef.current) {
      const dwellMs = dwellRef.current * 1000;

      // ── Phase 1: Full tour ──
      setPhase("tour");
      const allNodes = getMonitoredNodes();
      for (let i = 0; i < allNodes.length; i++) {
        if (!playingRef.current) return;
        const node = allNodes[i];
        setCurrentLabel(node.label || `Nodo ${i + 1}`);
        closeNodeInfo();
        await transitionToNode(node.x, node.y, FLY_ZOOM);
        if (!playingRef.current) return;
        await showNodeInfo(node);
        await sleep(dwellMs);
        if (!playingRef.current) return;
      }

      // ── Phase 2: Fit all overview ──
      if (!playingRef.current) return;
      closeNodeInfo();
      setPhase("fitall");
      setCurrentLabel("Vista general");
      await transitionToFitAll();
      if (!playingRef.current) return;
      await sleep(1600);
      if (!playingRef.current) return;

      // ── Phase 3: Alert rotation (only down nodes) ──
      const downNodes = getDownNodes();
      if (downNodes.length > 0) {
        setPhase("alerts");
        const currentDown = getDownNodes();
        for (const node of currentDown) {
          if (!playingRef.current) return;
          setCurrentLabel(`⚠ ${node.label || "?"}`);
          closeNodeInfo();
          await transitionToNode(node.x, node.y, FLY_ZOOM);
          if (!playingRef.current) return;
          await showNodeInfo(node);
          await sleep(dwellMs * 2);
          if (!playingRef.current) return;
        }
        if (!playingRef.current) return;
        closeNodeInfo();
        setCurrentLabel("Vista general");
        await transitionToFitAll();
        if (!playingRef.current) return;
        await sleep(1600);
      }

      // Loop continues — back to phase 1
    }
  }, [mapHandle, getMonitoredNodes, getDownNodes, sleep, transitionToNode, transitionToFitAll, showNodeInfo, closeNodeInfo]);

  // ── Auto-start when mapHandle becomes available (restored playing state) ──
  useEffect(() => {
    if (mapHandle && playingRef.current && !autoStarted.current) {
      autoStarted.current = true;
      runCycle();
    }
  }, [mapHandle, runCycle]);

  const handlePlay = useCallback(() => {
    if (playing) {
      playingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      dissolveReset();
      closeNodeInfo();
      setPlaying(false);
      setPhase("idle");
      setCurrentLabel("");
      saveTourConfig(mapId, { playing: false });
    } else {
      playingRef.current = true;
      autoStarted.current = true;
      setPlaying(true);
      setShowSettings(false);
      saveTourConfig(mapId, { playing: true });
      runCycle();
    }
  }, [playing, runCycle, mapId, dissolveReset, closeNodeInfo]);

  const handleSkip = useCallback(() => {
    skipRef.current = true;
  }, []);

  const handleDwellChange = useCallback((sec: number) => {
    setDwellSec(sec);
    setShowSettings(false);
    saveTourConfig(mapId, { dwellSec: sec });
  }, [mapId]);

  // Cleanup on unmount — also clear any lingering blur and tooltip
  useEffect(() => {
    return () => {
      playingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      const el = document.getElementById("kiosk-map-wrap");
      if (el) { el.style.filter = "none"; el.style.opacity = "1"; }
      setTooltipVisible(false);
      setTooltipData(null);
    };
  }, []);

  // Close settings on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-tour-settings]")) setShowSettings(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings]);

  if (!mapHandle) return null;

  const phaseLabel = phase === "tour" ? "Recorrido" : phase === "alerts" ? "Alertas" : phase === "fitall" ? "General" : "";
  const phaseColor = phase === "alerts" ? "#ef4444" : phase === "tour" ? "#3b82f6" : "#22c55e";

  return (
    <>
    <div
      className="absolute top-4 right-4 z-[10001] flex items-center gap-2 rounded-2xl px-3 py-2"
      style={{
        background: "rgba(10,10,10,0.85)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {/* Play / Pause */}
      <button
        onClick={handlePlay}
        className="flex items-center justify-center rounded-xl transition-all cursor-pointer"
        style={{
          width: 36, height: 36,
          background: playing ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
          border: `1px solid ${playing ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
          color: playing ? "#ef4444" : "#22c55e",
        }}
        title={playing ? "Pausar recorrido" : "Iniciar recorrido"}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" style={{ marginLeft: 2 }} />}
      </button>

      {/* Skip */}
      {playing && (
        <button
          onClick={handleSkip}
          className="flex items-center justify-center rounded-xl transition-all cursor-pointer"
          style={{
            width: 32, height: 32,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.4)",
          }}
          title="Siguiente nodo"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Dwell time config */}
      <div className="relative" data-tour-settings>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1 rounded-xl transition-all cursor-pointer"
          style={{
            height: 32, padding: "0 8px",
            background: showSettings ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${showSettings ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.08)"}`,
            color: showSettings ? "#f59e0b" : "rgba(255,255,255,0.4)",
          }}
          title="Tiempo por nodo"
        >
          <Clock className="w-3 h-3" />
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>{dwellSec}s</span>
        </button>

        {/* Dropdown */}
        {showSettings && (
          <div
            className="absolute top-full right-0 mt-2 rounded-xl py-1 shadow-2xl"
            style={{
              background: "rgba(14,14,14,0.97)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
              minWidth: 130,
            }}
          >
            <div style={{ padding: "4px 10px 6px", fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Tiempo por nodo
            </div>
            {DWELL_OPTIONS.map(sec => (
              <button
                key={sec}
                onClick={() => handleDwellChange(sec)}
                className="flex w-full items-center gap-2 px-3 py-1.5 transition-all cursor-pointer"
                style={{
                  fontSize: 12,
                  fontFamily: "monospace",
                  fontWeight: sec === dwellSec ? 800 : 500,
                  color: sec === dwellSec ? "#f59e0b" : "rgba(255,255,255,0.4)",
                  background: sec === dwellSec ? "rgba(245,158,11,0.08)" : "transparent",
                  border: "none",
                }}
                onMouseEnter={e => { if (sec !== dwellSec) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#ededed"; } }}
                onMouseLeave={e => { if (sec !== dwellSec) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; } }}
              >
                <span>{sec} segundos</span>
                {sec === dwellSec && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </button>
            ))}
            <div style={{ margin: "4px 10px 2px", borderTop: "1px solid rgba(255,255,255,0.06)" }} />
            <div style={{ padding: "4px 10px 4px", fontSize: 8, color: "rgba(255,255,255,0.15)" }}>
              Alertas usan 2× este tiempo
            </div>
          </div>
        )}
      </div>

      {/* Status label */}
      {playing && (
        <div className="flex items-center gap-2 pl-1">
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase"
            style={{
              background: `${phaseColor}15`,
              color: phaseColor,
              border: `1px solid ${phaseColor}30`,
              letterSpacing: "0.04em",
            }}
          >
            {phase === "alerts" ? <AlertTriangle className="w-2.5 h-2.5" /> : <MapPin className="w-2.5 h-2.5" />}
            {phaseLabel}
          </span>
          <span className="text-[11px] font-semibold text-[#aaa] max-w-[180px] truncate">
            {currentLabel}
          </span>
        </div>
      )}

      {/* Down count badge (when paused) */}
      {!playing && downCount > 0 && (
        <div className="flex items-center gap-1.5 pl-1">
          <AlertTriangle className="w-3 h-3" style={{ color: "#ef4444" }} />
          <span className="text-[10px] font-bold" style={{ color: "#ef4444" }}>
            {downCount} caído{downCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {!playing && downCount === 0 && (
        <span className="text-[10px] font-medium pl-1" style={{ color: "rgba(255,255,255,0.25)" }}>
          Auto-tour
        </span>
      )}

    </div>

      {/* Tour tooltip overlay for rack / UPS nodes — OUTSIDE the controls div to avoid backdropFilter containing-block bug */}
      <KioskTourTooltip data={tooltipData} visible={tooltipVisible} anchorPos={tooltipPos} />
    </>
  );
}
