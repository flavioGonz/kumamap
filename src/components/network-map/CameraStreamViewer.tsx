"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Maximize2, Minimize2, Camera, RefreshCw, ExternalLink } from "lucide-react";
import type { CameraStreamConfig } from "./CameraStreamConfigModal";

interface CameraStreamViewerProps {
  config: CameraStreamConfig;
  cameraName: string;
  onClose: () => void;
}

export default function CameraStreamViewer({ config, cameraName, onClose }: CameraStreamViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh for snapshot mode
  useEffect(() => {
    if (config.streamType === "snapshot" && config.snapshotInterval) {
      intervalRef.current = setInterval(() => {
        setSnapshotKey((k) => k + 1);
      }, config.snapshotInterval * 1000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [config.streamType, config.snapshotInterval]);

  const handleRefresh = useCallback(() => {
    setSnapshotKey((k) => k + 1);
    setLoading(true);
    setError(false);
  }, []);

  const handleOpenExternal = useCallback(() => {
    window.open(config.streamUrl, "_blank");
  }, [config.streamUrl]);

  // Build src with cache buster for snapshots
  const streamSrc = config.streamType === "snapshot"
    ? `${config.streamUrl}${config.streamUrl.includes("?") ? "&" : "?"}_t=${snapshotKey}`
    : config.streamUrl;

  const containerClass = fullscreen
    ? "fixed inset-0 z-[99999]"
    : "fixed inset-0 z-[9999] flex items-center justify-center";

  return (
    <div className={containerClass} onClick={onClose}>
      {/* Backdrop */}
      {!fullscreen && <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />}

      {/* Viewer */}
      <div
        className={`relative flex flex-col overflow-hidden ${
          fullscreen ? "w-full h-full" : "w-[720px] max-w-[90vw] max-h-[85vh] rounded-2xl"
        }`}
        style={{
          background: fullscreen ? "#000" : "linear-gradient(180deg, rgba(12,12,12,0.99), rgba(8,8,8,0.99))",
          border: fullscreen ? "none" : "1px solid rgba(255,255,255,0.06)",
          boxShadow: fullscreen ? "none" : "0 30px 100px rgba(0,0,0,0.9)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0"
          style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <Camera className="h-3.5 w-3.5 text-[#666]" />
            <span className="text-xs font-bold text-[#ccc]">{cameraName}</span>
            <span className="text-[9px] text-[#555] uppercase">{config.streamType}</span>
          </div>
          <div className="flex items-center gap-1">
            {config.streamType === "snapshot" && (
              <button onClick={handleRefresh} className="p-1.5 rounded-lg text-[#555] hover:text-white hover:bg-white/10 transition-all" title="Refrescar">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={handleOpenExternal} className="p-1.5 rounded-lg text-[#555] hover:text-white hover:bg-white/10 transition-all" title="Abrir en navegador">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-lg text-[#555] hover:text-white hover:bg-white/10 transition-all" title="Pantalla completa">
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-red-500/10 transition-all" title="Cerrar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Stream content */}
        <div className="flex-1 relative bg-black flex items-center justify-center min-h-[300px]">
          {/* Loading spinner */}
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                <span className="text-[10px] text-[#555]">Conectando...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3 text-center px-8">
                <Camera className="h-10 w-10 text-red-500/40" />
                <div className="text-sm font-bold text-[#888]">No se pudo cargar el stream</div>
                <div className="text-[10px] text-[#555] max-w-[300px] break-all">{config.streamUrl}</div>
                <button onClick={handleRefresh} className="mt-2 px-4 py-1.5 rounded-xl text-[10px] font-bold bg-white/5 text-[#888] hover:text-white hover:bg-white/10 transition-all">
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* MJPEG or Snapshot: use img tag */}
          {(config.streamType === "mjpeg" || config.streamType === "snapshot") && (
            <img
              key={config.streamType === "snapshot" ? snapshotKey : "mjpeg"}
              src={streamSrc}
              alt={cameraName}
              className="w-full h-full object-contain"
              style={{ display: error ? "none" : "block" }}
              onLoad={() => { setLoading(false); setError(false); }}
              onError={() => { setLoading(false); setError(true); }}
            />
          )}

          {/* Iframe: web interface or HLS player */}
          {config.streamType === "iframe" && (
            <iframe
              src={config.streamUrl}
              className="w-full h-full border-0"
              style={{ minHeight: fullscreen ? "100%" : "400px", display: error ? "none" : "block" }}
              onLoad={() => { setLoading(false); setError(false); }}
              onError={() => { setLoading(false); setError(true); }}
              allow="autoplay; fullscreen"
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </div>

        {/* Footer info */}
        {config.streamType === "snapshot" && config.snapshotInterval && (
          <div className="px-3 py-1.5 border-t border-white/5 shrink-0" style={{ background: "rgba(0,0,0,0.3)" }}>
            <span className="text-[9px] text-[#444]">Refresco cada {config.snapshotInterval}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
