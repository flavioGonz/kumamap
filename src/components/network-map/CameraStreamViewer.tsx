"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { snapshotSrc, rtspSrc } from "@/lib/camera-url";
import type { CameraStreamConfig } from "./CameraStreamConfigModal";

/* ── Types ── */
export interface CameraWindowState {
  nodeId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The viewer only reads the stream; it prefers the signed `streamRef` over the raw URL. */
type CameraStreamView = CameraStreamConfig & { streamRef?: string };

interface CameraStreamViewerProps {
  config: CameraStreamView;
  cameraName: string;
  nodeId: string;
  mapId: string;
  onClose: () => void;
  /** Restored position/size from persistence */
  initialState?: CameraWindowState;
  /** Initial position offset for multi-view stacking */
  initialOffset?: number;
  /** Z-index layer for stacking order */
  zLayer?: number;
  /** Called when user interacts (brings to front) */
  onFocus?: () => void;
  /** Notify parent of position/size changes for persistence */
  onStateChange?: (state: CameraWindowState) => void;
}

const MIN_W = 280;
const MIN_H = 200;

/* ══════════════════════════════════════════════════════════════════════════════
   CameraStreamViewer — frameless PiP with overlay controls & skeleton loader
   ══════════════════════════════════════════════════════════════════════════════ */

export default function CameraStreamViewer({
  config, cameraName, nodeId, mapId, onClose,
  initialState, initialOffset = 0, zLayer = 0,
  onFocus, onStateChange,
}: CameraStreamViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Snapshot double-buffer
  const [bufferA, setBufferA] = useState<string>("");
  const [bufferB, setBufferB] = useState<string>("");
  const [activeBuffer, setActiveBuffer] = useState<"a" | "b">("a");
  const loadingNextRef = useRef(false);

  // PiP position & size
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizing = useRef<string | null>(null);
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // ── Initialise position ──
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (initialState) {
      // Restore from persistence
      setPos({ x: initialState.x, y: initialState.y });
      setSize({ w: initialState.w, h: initialState.h });
    } else {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(480, vw * 0.42);
      const h = Math.round(w * 0.5625); // 16:9 aspect
      const gap = 10;
      const positions = [
        { x: vw - w - gap, y: vh - h - gap - 40 },
        { x: gap, y: vh - h - gap - 40 },
        { x: vw - w - gap, y: gap },
        { x: gap, y: gap },
      ];
      const p = positions[initialOffset % 4];
      setSize({ w, h });
      setPos(p);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify parent of state changes for persistence ──
  const stateChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitStateChange = useCallback(() => {
    if (stateChangeTimer.current) clearTimeout(stateChangeTimer.current);
    stateChangeTimer.current = setTimeout(() => {
      onStateChange?.({
        nodeId,
        x: pos.x, y: pos.y,
        w: size.w, h: size.h,
      });
    }, 300);
  }, [nodeId, pos.x, pos.y, size.w, size.h, onStateChange]);

  useEffect(() => {
    if (initialized.current && (size.w > 0)) emitStateChange();
  }, [pos.x, pos.y, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Snapshot double-buffer ──
  useEffect(() => {
    if (config.streamType !== "snapshot") return;
    const ms = config.snapshotInterval ? config.snapshotInterval * 1000 : 1000;
    const firstUrl = snapshotSrc(config);
    setBufferA(firstUrl);
    setActiveBuffer("a");

    const id = setInterval(() => {
      if (loadingNextRef.current) return;
      loadingNextRef.current = true;
      const nextUrl = snapshotSrc(config);
      const img = new Image();
      img.onload = () => {
        loadingNextRef.current = false;
        setActiveBuffer(prev => {
          if (prev === "a") { setBufferB(nextUrl); return "b"; }
          else { setBufferA(nextUrl); return "a"; }
        });
        setLoading(false);
        setError(false);
      };
      img.onerror = () => { loadingNextRef.current = false; setError(true); };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [config.streamType, config.snapshotInterval, config.streamUrl, config.streamRef]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(false);
    if (config.streamType === "snapshot") {
      const url = snapshotSrc(config);
      setActiveBuffer(prev => {
        if (prev === "a") { setBufferB(url); return "b"; }
        else { setBufferA(url); return "a"; }
      });
    }
  }, [config]);

  // ── Hover management ──
  const onEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHovered(true);
  };
  const onLeave = () => {
    hoverTimeout.current = setTimeout(() => setHovered(false), 600);
  };

  // ── Drag handlers ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (fullscreen) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [fullscreen, pos]);

  // ── Resize handlers ──
  const onResizeStart = useCallback((edge: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = edge;
    resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h, x: pos.x, y: pos.y };
  }, [size, pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
        return;
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.mx;
        const dy = e.clientY - resizeStart.current.my;
        const edge = resizing.current;
        let newW = resizeStart.current.w;
        let newH = resizeStart.current.h;
        let newX = resizeStart.current.x;
        let newY = resizeStart.current.y;

        if (edge.includes("r")) newW = Math.max(MIN_W, resizeStart.current.w + dx);
        if (edge.includes("l")) { newW = Math.max(MIN_W, resizeStart.current.w - dx); newX = resizeStart.current.x + (resizeStart.current.w - newW); }
        if (edge.includes("b")) newH = Math.max(MIN_H, resizeStart.current.h + dy);
        if (edge.includes("t")) { newH = Math.max(MIN_H, resizeStart.current.h - dy); newY = resizeStart.current.y + (resizeStart.current.h - newH); }

        setSize({ w: newW, h: newH });
        setPos({ x: newX, y: newY });
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Stream source ──
  const rtspProxyUrl = config.streamType === "rtsp" ? rtspSrc(config) : "";

  // ── Controls visible? ──
  const showControls = hovered || dragging.current || loading || error;

  // ── Styles ──
  const wrapStyle: React.CSSProperties = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 99999, background: "#000" }
    : {
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: 9990 + zLayer,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        background: "#000",
        userSelect: "none",
      };

  const EDGE = 6;
  const resizeEdges: { edge: string; style: React.CSSProperties }[] = [
    { edge: "r", style: { position: "absolute", top: EDGE, right: 0, bottom: EDGE, width: EDGE, cursor: "ew-resize", zIndex: 20 } },
    { edge: "l", style: { position: "absolute", top: EDGE, left: 0, bottom: EDGE, width: EDGE, cursor: "ew-resize", zIndex: 20 } },
    { edge: "b", style: { position: "absolute", bottom: 0, left: EDGE, right: EDGE, height: EDGE, cursor: "ns-resize", zIndex: 20 } },
    { edge: "t", style: { position: "absolute", top: 0, left: EDGE, right: EDGE, height: EDGE, cursor: "ns-resize", zIndex: 20 } },
    { edge: "br", style: { position: "absolute", bottom: 0, right: 0, width: EDGE * 2, height: EDGE * 2, cursor: "nwse-resize", zIndex: 21 } },
    { edge: "bl", style: { position: "absolute", bottom: 0, left: 0, width: EDGE * 2, height: EDGE * 2, cursor: "nesw-resize", zIndex: 21 } },
    { edge: "tr", style: { position: "absolute", top: 0, right: 0, width: EDGE * 2, height: EDGE * 2, cursor: "nesw-resize", zIndex: 21 } },
    { edge: "tl", style: { position: "absolute", top: 0, left: 0, width: EDGE * 2, height: EDGE * 2, cursor: "nwse-resize", zIndex: 21 } },
  ];

  return (
    <div
      ref={containerRef}
      style={wrapStyle}
      onMouseDown={() => onFocus?.()}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* ── Resize handles (invisible, always active) ── */}
      {!fullscreen && resizeEdges.map(({ edge, style }) => (
        <div key={edge} style={style} onMouseDown={(e) => onResizeStart(edge, e)} />
      ))}

      {/* ── Full-bleed stream content ── */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>

        {/* ── Skeleton Loader ── */}
        {loading && !error && (
          <div style={skeletonOverlay}>
            <div style={skeletonShimmer} />
            <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {/* Animated camera SVG */}
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
                <rect x="2" y="6" width="15" height="12" rx="2" stroke="#555" strokeWidth="1.5">
                  <animate attributeName="stroke" values="#555;#888;#555" dur="2s" repeatCount="indefinite" />
                </rect>
                <path d="M17 9.5L21 7.5V16.5L17 14.5" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <animate attributeName="stroke" values="#555;#888;#555" dur="2s" repeatCount="indefinite" />
                </path>
                {/* Recording dot */}
                <circle cx="6" cy="10" r="1.5" fill="#ef4444">
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
                </circle>
              </svg>
              <span style={{ fontSize: 10, color: "#555", fontWeight: 600, letterSpacing: 0.5 }}>CONECTANDO</span>
              {/* Pulse bar */}
              <div style={{ width: 48, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{
                  width: "40%", height: "100%", borderRadius: 1,
                  background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.5), transparent)",
                  animation: "sileo-skeleton-bar 1.5s ease-in-out infinite",
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {error && (
          <div style={{ ...skeletonOverlay, background: "rgba(0,0,0,0.9)" }}>
            <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 24px", textAlign: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" />
                <line x1="15" y1="9" x2="9" y2="15" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="9" x2="15" y2="15" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>Sin señal</div>
              <div style={{ fontSize: 8, color: "#444", maxWidth: 200, wordBreak: "break-all" }}>{config.streamUrl.substring(0, 80)}</div>
              <button onClick={handleRefresh} style={retryBtnStyle}>Reintentar</button>
            </div>
          </div>
        )}

        {/* MJPEG */}
        {config.streamType === "mjpeg" && (
          <img
            src={config.streamUrl}
            alt={cameraName}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: error ? "none" : "block" }}
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}

        {/* Snapshot double-buffered */}
        {config.streamType === "snapshot" && (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {bufferA && (
              <img src={bufferA} alt={cameraName} style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: activeBuffer === "a" ? 1 : 0,
                transition: "opacity 0.3s ease-in-out",
              }} onLoad={() => { setLoading(false); setError(false); }} />
            )}
            {bufferB && (
              <img src={bufferB} alt={cameraName} style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: activeBuffer === "b" ? 1 : 0,
                transition: "opacity 0.3s ease-in-out",
              }} onLoad={() => { setLoading(false); setError(false); }} />
            )}
          </div>
        )}

        {/* RTSP via ffmpeg proxy */}
        {config.streamType === "rtsp" && (
          <RtspWithPreload
            rtspUrl={rtspProxyUrl}
            cameraName={cameraName}
            originalRtspUrl={config.streamUrl}
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
            hasError={error}
          />
        )}

        {/* Iframe */}
        {config.streamType === "iframe" && (
          <iframe
            src={config.streamUrl}
            style={{ width: "100%", height: "100%", border: "none", display: error ? "none" : "block" }}
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
            allow="autoplay; fullscreen"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>

      {/* ── Overlay Controls (appear on hover) ── */}
      {/* Top gradient + drag handle + name + buttons */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
          padding: "8px 10px 20px",
          background: showControls ? "linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)" : "transparent",
          cursor: fullscreen ? "default" : "grab",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          transition: "background 0.3s ease",
        }}
      >
        {/* Left: name + type badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          opacity: showControls ? 1 : 0, transition: "opacity 0.3s ease",
          overflow: "hidden",
        }}>
          {/* Live dot */}
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: error ? "#ef4444" : "#22c55e",
            boxShadow: error ? "0 0 6px rgba(239,68,68,0.6)" : "0 0 6px rgba(34,197,94,0.6)",
            flexShrink: 0,
            animation: error ? "none" : "sileo-live-pulse 2s infinite",
          }} />
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#fff",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            maxWidth: 160,
          }}>{cameraName}</span>
          <span style={{
            fontSize: 7, color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase", letterSpacing: 1, flexShrink: 0,
            padding: "1px 4px", borderRadius: 3,
            background: "rgba(255,255,255,0.08)",
          }}>{config.streamType}</span>
        </div>

        {/* Right: action buttons */}
        <div style={{
          display: "flex", alignItems: "center", gap: 2,
          opacity: showControls ? 1 : 0, transition: "opacity 0.3s ease",
          flexShrink: 0,
        }}>
          {/* Refresh */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={handleRefresh}
            title="Refrescar"
            style={overlayBtnStyle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
          {/* Fullscreen */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setFullscreen(!fullscreen)}
            title="Pantalla completa"
            style={overlayBtnStyle}
          >
            {fullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
          {/* Close */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            title="Cerrar"
            style={{ ...overlayBtnStyle, color: "rgba(255,255,255,0.7)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom gradient with stream info */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30,
        padding: "16px 10px 6px",
        background: showControls ? "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)" : "transparent",
        opacity: showControls ? 1 : 0,
        transition: "opacity 0.3s ease, background 0.3s ease",
        pointerEvents: "none",
      }}>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 0.3 }}>
          {config.streamType === "rtsp"
            ? `RTSP → MJPEG · ${config.rtspFps || 2} fps`
            : config.streamType === "snapshot"
              ? (config.snapshotInterval ? `Refresco cada ${config.snapshotInterval}s` : "~1 fps")
              : config.streamType.toUpperCase()}
        </span>
      </div>

      {/* ── Corner radius border glow on hover ── */}
      {!fullscreen && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 14, zIndex: 25,
          border: showControls ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
          transition: "border-color 0.3s ease",
          pointerEvents: "none",
        }} />
      )}

      <style>{`
        @keyframes sileo-skeleton-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes sileo-live-pulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

/* ── RTSP with snapshot preload ─────────────────────────────────────────────── */

function RtspWithPreload({
  rtspUrl, cameraName, originalRtspUrl, onLoad, onError, hasError,
}: {
  rtspUrl: string; cameraName: string; originalRtspUrl: string;
  onLoad: () => void; onError: () => void; hasError: boolean;
}) {
  const [streamReady, setStreamReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  useEffect(() => {
    try {
      const parsed = new URL(originalRtspUrl);
      const creds = `${parsed.username}:${parsed.password}`;
      const host = parsed.hostname;
      const path = parsed.pathname;
      let snapshotUrl = "";

      if (path.match(/^\/\d+\/\d+$/)) {
        // Tiandy — no reliable snapshot
      } else if (path.includes("/Streaming/Channels/") || path.includes("/ISAPI/")) {
        snapshotUrl = `http://${creds}@${host}/ISAPI/Streaming/channels/101/picture`;
      } else if (path.includes("/cam/realmonitor")) {
        snapshotUrl = `http://${creds}@${host}/cgi-bin/snapshot.cgi?channel=1`;
      } else if (path.includes("/axis-media/")) {
        snapshotUrl = `http://${creds}@${host}/axis-cgi/jpg/image.cgi`;
      }

      if (snapshotUrl) {
        // Derived HTTP snapshot endpoint — no signed ref exists for it, so it
        // goes through the proxy by raw URL (operator-only path).
        setPreviewUrl(snapshotSrc({ streamUrl: snapshotUrl }));
      }
    } catch { /* Can't build preview */ }
  }, [originalRtspUrl]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {previewUrl && !streamReady && (
        <img
          src={previewUrl}
          alt={cameraName}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", zIndex: 1,
            opacity: streamReady ? 0 : 1,
            transition: "opacity 0.5s ease-out",
          }}
          onLoad={onLoad}
          onError={() => {}}
        />
      )}
      <img
        src={rtspUrl}
        alt={cameraName}
        style={{
          position: streamReady ? "relative" : "absolute",
          inset: 0, width: "100%", height: "100%",
          objectFit: "cover", zIndex: 2,
          display: hasError && !streamReady ? "none" : "block",
        }}
        onLoad={() => {
          if (!streamReady) setStreamReady(true);
          onLoad();
        }}
        onError={() => { if (!streamReady) onError(); }}
      />
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────────────────────── */

const skeletonOverlay: React.CSSProperties = {
  position: "absolute", inset: 0, zIndex: 10,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "#0a0a0a",
  overflow: "hidden",
};

const skeletonShimmer: React.CSSProperties = {
  position: "absolute", inset: 0, zIndex: 1,
  background: "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.02) 37%, transparent 63%)",
  backgroundSize: "200% 100%",
  animation: "sileo-skeleton-bar 2s ease-in-out infinite",
};

const overlayBtnStyle: React.CSSProperties = {
  padding: 5,
  borderRadius: 8,
  background: "rgba(0,0,0,0.3)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.6)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  transition: "background 0.2s, color 0.2s",
};

const retryBtnStyle: React.CSSProperties = {
  marginTop: 4,
  padding: "5px 16px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.06)",
  color: "#888",
  fontSize: 9,
  fontWeight: 700,
  border: "1px solid rgba(255,255,255,0.06)",
  cursor: "pointer",
};
