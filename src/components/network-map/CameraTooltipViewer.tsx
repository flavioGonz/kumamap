"use client";

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { X, Maximize2, Camera, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { CameraStreamConfig } from "./CameraStreamConfigModal";

interface CameraTooltipViewerProps {
  config: CameraStreamConfig;
  cameraName: string;
  /** Screen-space position of the camera marker (x, y relative to viewport) */
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  /** Called when user clicks expand — parent switches to floating PiP mode */
  onExpand: () => void;
}

const TOOLTIP_W = 320;
const TOOLTIP_H_VIDEO = 200;
const ARROW_H = 8;

/** Build proxy URL for snapshot mode */
function proxySnapshotUrl(cameraUrl: string, cacheBust: number): string {
  return apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(cameraUrl)}&_t=${cacheBust}`);
}

export default function CameraTooltipViewer({
  config,
  cameraName,
  anchorX,
  anchorY,
  onClose,
  onExpand,
}: CameraTooltipViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Double-buffer for flicker-free snapshots
  const [bufferA, setBufferA] = useState<string>("");
  const [bufferB, setBufferB] = useState<string>("");
  const [activeBuffer, setActiveBuffer] = useState<"a" | "b">("a");
  const loadingNextRef = useRef(false);

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
      img.onerror = () => { loadingNextRef.current = false; setError(true); };
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

  // Position: place tooltip above the marker, centered horizontally
  // If it would go off-screen, flip below or adjust horizontally
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;

  const totalH = TOOLTIP_H_VIDEO + 36 + ARROW_H; // video + header + arrow
  let top = anchorY - totalH - 10;
  let left = anchorX - TOOLTIP_W / 2;
  let arrowOnTop = false; // arrow pointing down (tooltip above marker)

  // Flip below if no room above
  if (top < 8) {
    top = anchorY + 20;
    arrowOnTop = true;
  }
  // Clamp horizontal
  if (left < 8) left = 8;
  if (left + TOOLTIP_W > vw - 8) left = vw - TOOLTIP_W - 8;

  // Arrow position relative to tooltip
  const arrowLeft = Math.max(12, Math.min(TOOLTIP_W - 12, anchorX - left));

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left,
        top,
        width: TOOLTIP_W,
        zIndex: 9998,
        borderRadius: 12,
        overflow: "visible",
        filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.85))",
        pointerEvents: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Arrow */}
      <div
        style={{
          position: "absolute",
          left: arrowLeft - 6,
          [arrowOnTop ? "top" : "bottom"]: -ARROW_H,
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          [arrowOnTop ? "borderBottom" : "borderTop"]: `${ARROW_H}px solid rgba(12,12,12,0.98)`,
        }}
      />

      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          background: "linear-gradient(180deg, rgba(12,12,12,0.98), rgba(8,8,8,0.99))",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "5px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ef4444",
                animation: "tt-pulse 2s infinite",
                flexShrink: 0,
              }}
            />
            <Camera style={{ width: 12, height: 12, color: "#666", flexShrink: 0 }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#ccc",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {cameraName}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            {config.streamType === "snapshot" && (
              <button onClick={handleRefresh} title="Refrescar" style={btnStyle}>
                <RefreshCw style={{ width: 12, height: 12 }} />
              </button>
            )}
            <button onClick={onExpand} title="Expandir ventana" style={btnStyle}>
              <Maximize2 style={{ width: 12, height: 12 }} />
            </button>
            <button onClick={onClose} title="Cerrar" style={{ ...btnStyle, color: "#888" }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>

        {/* Stream content */}
        <div
          style={{
            position: "relative",
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: TOOLTIP_H_VIDEO,
            overflow: "hidden",
          }}
        >
          {/* Loading spinner */}
          {loading && !error && (
            <div style={centerOverlay}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "2px solid rgba(96,165,250,0.3)",
                  borderTopColor: "#60a5fa",
                  animation: "tt-spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: 9, color: "#555", marginTop: 6 }}>Conectando...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ ...centerOverlay, gap: 8, textAlign: "center", padding: "0 16px" }}>
              <Camera style={{ width: 28, height: 28, color: "rgba(239,68,68,0.4)" }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: "#888" }}>Error de conexión</div>
              <button onClick={handleRefresh} style={retryBtn}>
                Reintentar
              </button>
            </div>
          )}

          {/* MJPEG — single img */}
          {config.streamType === "mjpeg" && (
            <img
              src={config.streamUrl}
              alt={cameraName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: error ? "none" : "block",
              }}
              onLoad={() => { setLoading(false); setError(false); }}
              onError={() => { setLoading(false); setError(true); }}
            />
          )}

          {/* Snapshot — double-buffered for flicker-free transitions */}
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

          {/* RTSP via ffmpeg proxy — renders as MJPEG multipart stream */}
          {config.streamType === "rtsp" && (
            <img
              src={apiUrl(`/api/camera/rtsp-stream?url=${encodeURIComponent(config.streamUrl)}&fps=${config.rtspFps || 2}`)}
              alt={cameraName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: error ? "none" : "block",
              }}
              onLoad={() => { setLoading(false); setError(false); }}
              onError={() => { setLoading(false); setError(true); }}
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
              onLoad={() => {
                setLoading(false);
                setError(false);
              }}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              allow="autoplay"
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes tt-spin { to { transform: rotate(360deg); } }
        @keyframes tt-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

// ── Micro-styles ──
const btnStyle: React.CSSProperties = {
  padding: "3px 4px",
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
  marginTop: 4,
  padding: "4px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  color: "#888",
  fontSize: 9,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};
