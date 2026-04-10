"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Maximize2, Minimize2, Camera, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { CameraStreamConfig } from "./CameraStreamConfigModal";

interface CameraStreamViewerProps {
  config: CameraStreamConfig;
  cameraName: string;
  onClose: () => void;
}

/** Build proxy URL for snapshot mode — avoids CORS / Basic-Auth browser restrictions */
function proxySnapshotUrl(cameraUrl: string, cacheBust: number): string {
  return apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(cameraUrl)}&_t=${cacheBust}`);
}

export default function CameraStreamViewer({ config, cameraName, onClose }: CameraStreamViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(Date.now());
  // Double-buffer for flicker-free snapshot transitions
  const [bufferA, setBufferA] = useState<string>("");
  const [bufferB, setBufferB] = useState<string>("");
  const [activeBuffer, setActiveBuffer] = useState<"a" | "b">("a");
  const loadingNextRef = useRef(false);

  // Draggable PiP position — start at bottom-right
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialise position to bottom-right corner on mount
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(640, vw * 0.9);
    const h = 380;
    setPos({ x: vw - w - 20, y: vh - h - 20 });
  }, []);

  // Snapshot double-buffer: preload next frame off-screen, swap when ready
  useEffect(() => {
    if (config.streamType !== "snapshot") return;
    const ms = config.snapshotInterval ? config.snapshotInterval * 1000 : 1000;
    // Load first frame
    const firstUrl = proxySnapshotUrl(config.streamUrl, Date.now());
    setBufferA(firstUrl);
    setActiveBuffer("a");

    const id = setInterval(() => {
      if (loadingNextRef.current) return; // skip if previous still loading
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

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Stream source ──────────────────────────────────────────────────────────
  const streamSrc = config.streamType === "snapshot"
    ? proxySnapshotUrl(config.streamUrl, snapshotKey)
    : config.streamUrl;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const width = typeof window !== "undefined" ? Math.min(640, window.innerWidth * 0.9) : 600;

  const wrapStyle: React.CSSProperties = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 99999 }
    : {
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width,
        zIndex: 9999,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 30px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(12,12,12,0.99), rgba(8,8,8,0.99))",
        userSelect: "none",
      };

  return (
    <div ref={containerRef} style={wrapStyle}>
      {/* ── Header / drag handle ── */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.4)",
          cursor: fullscreen ? "default" : "grab",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite" }} />
          <Camera style={{ width: 14, height: 14, color: "#666" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#ccc" }}>{cameraName}</span>
          <span style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
            {config.streamType}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {config.streamType === "snapshot" && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleRefresh}
              title="Refrescar"
              style={btnStyle}
            >
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
          )}
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { setFullscreen(!fullscreen); }}
            title="Pantalla completa"
            style={btnStyle}
          >
            {fullscreen ? <Minimize2 style={{ width: 14, height: 14 }} /> : <Maximize2 style={{ width: 14, height: 14 }} />}
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            title="Cerrar"
            style={{ ...btnStyle, color: "#888" }}
          >
            <X style={{ width: 14, height: 14 }} />
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
        minHeight: fullscreen ? "calc(100vh - 36px)" : 340,
      }}>
        {/* Loading */}
        {loading && !error && (
          <div style={centerOverlay}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid rgba(96,165,250,0.3)",
              borderTopColor: "#60a5fa",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 10, color: "#555", marginTop: 8 }}>Conectando...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ ...centerOverlay, gap: 12, textAlign: "center", padding: "0 32px" }}>
            <Camera style={{ width: 40, height: 40, color: "rgba(239,68,68,0.4)" }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "#888" }}>No se pudo cargar el stream</div>
            <div style={{ fontSize: 10, color: "#555", maxWidth: 280, wordBreak: "break-all" }}>
              {config.streamUrl}
            </div>
            <button onClick={handleRefresh} style={retryBtn}>Reintentar</button>
          </div>
        )}

        {/* MJPEG — single img */}
        {config.streamType === "mjpeg" && (
          <img
            src={config.streamUrl}
            alt={cameraName}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: error ? "none" : "block" }}
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

        {/* Iframe */}
        {config.streamType === "iframe" && (
          <iframe
            src={config.streamUrl}
            style={{
              width: "100%",
              minHeight: fullscreen ? "100%" : 400,
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
      {config.streamType === "snapshot" && (
        <div style={{ padding: "4px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.3)" }}>
          <span style={{ fontSize: 9, color: "#444" }}>
            {config.snapshotInterval ? `Refresco cada ${config.snapshotInterval}s` : "~2 fps (vía proxy)"}
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

// ── Shared micro-styles ──────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderRadius: 8,
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
  marginTop: 8,
  padding: "6px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  color: "#888",
  fontSize: 10,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};
