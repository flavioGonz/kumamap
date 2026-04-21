"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Maximize2, Minimize2, Camera, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { CameraStreamConfig } from "./CameraStreamConfigModal";

interface CameraStreamViewerProps {
  config: CameraStreamConfig;
  cameraName: string;
  onClose: () => void;
  /** Initial position offset for multi-view stacking */
  initialOffset?: number;
  /** Z-index layer for stacking order */
  zLayer?: number;
  /** Called when user interacts (brings to front) */
  onFocus?: () => void;
}

const MIN_W = 320;
const MIN_H = 240;

/** Build proxy URL for snapshot mode — avoids CORS / Basic-Auth browser restrictions */
function proxySnapshotUrl(cameraUrl: string, cacheBust: number): string {
  return apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(cameraUrl)}&_t=${cacheBust}`);
}

export default function CameraStreamViewer({ config, cameraName, onClose, initialOffset = 0, zLayer = 0, onFocus }: CameraStreamViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(Date.now());
  // Double-buffer for flicker-free snapshot transitions
  const [bufferA, setBufferA] = useState<string>("");
  const [bufferB, setBufferB] = useState<string>("");
  const [activeBuffer, setActiveBuffer] = useState<"a" | "b">("a");
  const loadingNextRef = useRef(false);

  // Draggable PiP position
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizing = useRef<string | null>(null);
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialise position — place in quadrants for multi-view
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(480, vw * 0.42);
    const h = Math.round(w * 0.625); // ~16:10 aspect
    const gap = 10;
    // 4 quadrant positions: top-left, top-right, bottom-left, bottom-right
    const positions = [
      { x: vw - w - gap, y: vh - h - gap - 40 },        // bottom-right (default)
      { x: gap, y: vh - h - gap - 40 },                  // bottom-left
      { x: vw - w - gap, y: gap },                       // top-right
      { x: gap, y: gap },                                // top-left
    ];
    const p = positions[initialOffset % 4];
    setSize({ w, h });
    setPos(p);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot double-buffer
  useEffect(() => {
    if (config.streamType !== "snapshot") return;
    const ms = config.snapshotInterval ? config.snapshotInterval * 1000 : 1000;
    const firstUrl = proxySnapshotUrl(config.streamUrl, Date.now());
    setBufferA(firstUrl);
    setActiveBuffer("a");

    const id = setInterval(() => {
      if (loadingNextRef.current) return;
      loadingNextRef.current = true;
      const nextUrl = proxySnapshotUrl(config.streamUrl, Date.now());
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
      img.onerror = () => {
        loadingNextRef.current = false;
        setError(true);
      };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [config.streamType, config.snapshotInterval, config.streamUrl]);

  const handleRefresh = useCallback(() => {
    const url = proxySnapshotUrl(config.streamUrl, Date.now());
    setActiveBuffer(prev => {
      if (prev === "a") { setBufferB(url); return "b"; }
      else { setBufferA(url); return "a"; }
    });
    setError(false);
  }, [config.streamUrl]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (fullscreen) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [fullscreen, pos]);

  // ── Resize handlers ────────────────────────────────────────────────────────
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

  // ── Stream source ──────────────────────────────────────────────────────────
  const rtspProxyUrl = config.streamType === "rtsp"
    ? apiUrl(`/api/camera/rtsp-stream?url=${encodeURIComponent(config.streamUrl)}&fps=${config.rtspFps || 2}`)
    : "";

  // ── Styles ──────────────────────────────────────────────────────────────────
  const wrapStyle: React.CSSProperties = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 99999 }
    : {
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: 9990 + zLayer,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 30px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(12,12,12,0.99), rgba(8,8,8,0.99))",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
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
    <div ref={containerRef} style={wrapStyle} onMouseDown={() => onFocus?.()}>
      {/* ── Resize handles ── */}
      {!fullscreen && resizeEdges.map(({ edge, style }) => (
        <div key={edge} style={style} onMouseDown={(e) => onResizeStart(edge, e)} />
      ))}

      {/* ── Header / drag handle ── */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.4)",
          cursor: fullscreen ? "default" : "grab",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite", flexShrink: 0 }} />
          <Camera style={{ width: 12, height: 12, color: "#666", flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cameraName}</span>
          <span style={{ fontSize: 8, color: "#555", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>
            {config.streamType}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          {config.streamType === "snapshot" && (
            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleRefresh} title="Refrescar" style={btnStyle}>
              <RefreshCw style={{ width: 13, height: 13 }} />
            </button>
          )}
          <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setFullscreen(!fullscreen)} title="Pantalla completa" style={btnStyle}>
            {fullscreen ? <Minimize2 style={{ width: 13, height: 13 }} /> : <Maximize2 style={{ width: 13, height: 13 }} />}
          </button>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onClose} title="Cerrar" style={{ ...btnStyle, color: "#888" }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>

      {/* ── Stream content ── */}
      <div style={{
        position: "relative",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        overflow: "hidden",
      }}>
        {/* Loading */}
        {loading && !error && (
          <div style={centerOverlay}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              border: "2px solid rgba(96,165,250,0.3)",
              borderTopColor: "#60a5fa",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 9, color: "#555", marginTop: 6 }}>Conectando...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ ...centerOverlay, gap: 8, textAlign: "center", padding: "0 24px" }}>
            <Camera style={{ width: 32, height: 32, color: "rgba(239,68,68,0.4)" }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>No se pudo cargar el stream</div>
            <div style={{ fontSize: 9, color: "#555", maxWidth: 240, wordBreak: "break-all" }}>
              {config.streamUrl}
            </div>
            <button onClick={handleRefresh} style={retryBtn}>Reintentar</button>
          </div>
        )}

        {/* MJPEG */}
        {config.streamType === "mjpeg" && (
          <img
            src={config.streamUrl}
            alt={cameraName}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: error ? "none" : "block" }}
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}

        {/* Snapshot — double-buffered */}
        {config.streamType === "snapshot" && (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {bufferA && (
              <img
                src={bufferA}
                alt={cameraName}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "contain",
                  opacity: activeBuffer === "a" ? 1 : 0,
                  transition: "opacity 0.3s ease-in-out",
                }}
                onLoad={() => { setLoading(false); setError(false); }}
              />
            )}
            {bufferB && (
              <img
                src={bufferB}
                alt={cameraName}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "contain",
                  opacity: activeBuffer === "b" ? 1 : 0,
                  transition: "opacity 0.3s ease-in-out",
                }}
                onLoad={() => { setLoading(false); setError(false); }}
              />
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
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: error ? "none" : "block",
            }}
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
            allow="autoplay; fullscreen"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>

      {/* Footer */}
      {(config.streamType === "snapshot" || config.streamType === "rtsp") && (
        <div style={{ padding: "3px 8px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
          <span style={{ fontSize: 8, color: "#444" }}>
            {config.streamType === "rtsp"
              ? `RTSP → MJPEG · ${config.rtspFps || 2} fps (ffmpeg)`
              : config.snapshotInterval ? `Refresco cada ${config.snapshotInterval}s` : "~2 fps (vía proxy)"}
          </span>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

// ── RTSP with snapshot preload ───────────────────────────────────────────────

function RtspWithPreload({
  rtspUrl, cameraName, originalRtspUrl, onLoad, onError, hasError,
}: {
  rtspUrl: string; cameraName: string; originalRtspUrl: string;
  onLoad: () => void; onError: () => void; hasError: boolean;
}) {
  const [streamReady, setStreamReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Build a snapshot URL from the RTSP URL for instant preview
  // Detects manufacturer by RTSP path pattern to generate the correct HTTP snapshot URL
  useEffect(() => {
    try {
      const parsed = new URL(originalRtspUrl);
      const creds = `${parsed.username}:${parsed.password}`;
      const host = parsed.hostname;
      const path = parsed.pathname;
      let snapshotUrl = "";

      if (path.match(/^\/\d+\/\d+$/)) {
        // Tiandy format: rtsp://user:pass@ip:554/<channel>/<stream>
        // Tiandy doesn't reliably support HTTP snapshots, skip preview
      } else if (path.includes("/Streaming/Channels/") || path.includes("/ISAPI/")) {
        // Hikvision format
        snapshotUrl = `http://${creds}@${host}/ISAPI/Streaming/channels/101/picture`;
      } else if (path.includes("/cam/realmonitor")) {
        // Dahua format
        snapshotUrl = `http://${creds}@${host}/cgi-bin/snapshot.cgi?channel=1`;
      } else if (path.includes("/axis-media/")) {
        // Axis format
        snapshotUrl = `http://${creds}@${host}/axis-cgi/jpg/image.cgi`;
      }

      if (snapshotUrl) {
        const proxied = apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(snapshotUrl)}&_t=${Date.now()}`);
        setPreviewUrl(proxied);
      }
    } catch {
      // Can't build preview — just show loading
    }
  }, [originalRtspUrl]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {previewUrl && !streamReady && (
        <img
          src={previewUrl}
          alt={cameraName}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "contain", zIndex: 1,
            opacity: streamReady ? 0 : 1,
            transition: "opacity 0.5s ease-out",
          }}
          onLoad={onLoad}
          onError={() => { /* Preview failed, wait for RTSP */ }}
        />
      )}
      <img
        src={rtspUrl}
        alt={cameraName}
        style={{
          position: streamReady ? "relative" : "absolute",
          inset: 0, width: "100%", height: "100%",
          objectFit: "contain", zIndex: 2,
          display: hasError && !streamReady ? "none" : "block",
        }}
        onLoad={() => {
          if (!streamReady) setStreamReady(true);
          onLoad();
        }}
        onError={() => {
          if (!streamReady) onError();
        }}
      />
    </div>
  );
}

// ── Shared micro-styles ──────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  padding: "3px 5px",
  borderRadius: 6,
  background: "transparent",
  border: "none",
  color: "#555",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
};

const centerOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10,
};

const retryBtn: React.CSSProperties = {
  marginTop: 6,
  padding: "5px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  color: "#888",
  fontSize: 9,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};
