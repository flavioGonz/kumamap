"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";

// ─── Types ─────────────────────────────────────
interface CameraInfo {
  nodeId: string;
  mapId: string;
  mapName: string;
  label: string;
  ip: string;
  streamType: string;
  streamUrl: string;
  snapshotInterval?: number;
  rtspFps?: number;
  manufacturer: string;
  source?: "camera" | "nvr";
  nvrNodeId?: string;
  nvrChannel?: number;
}

interface MapInfo {
  mapId: string;
  mapName: string;
  cameraCount: number;
  nvrCount: number;
  totalNodes: number;
}

interface MapWithCameras {
  mapId: string;
  mapName: string;
  cameras: CameraInfo[];
  cameraCount: number;
  nvrCount: number;
  totalNodes: number;
}

type GridLayout = "1x1" | "2x2" | "3x3" | "4x4";
const GRID_COLS: Record<GridLayout, number> = { "1x1": 1, "2x2": 2, "3x3": 3, "4x4": 4 };

// ─── NVR Camera Cell ──────────────────────────
function NvrCell({
  camera,
  index,
  onDoubleClick,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  gridLabel,
}: {
  camera: CameraInfo;
  index: number;
  onDoubleClick: () => void;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  gridLabel: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bufA, setBufA] = useState("");
  const [bufB, setBufB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const loadingRef = useRef(false);
  const hasStream = camera.streamUrl && camera.streamType && camera.streamType !== "nvr";

  const getStreamSrc = useCallback((): string => {
    if (!camera.streamUrl) return "";
    switch (camera.streamType) {
      case "rtsp":
        return apiUrl(`/api/camera/rtsp-stream?url=${encodeURIComponent(camera.streamUrl)}&fps=${camera.rtspFps || 2}`);
      case "snapshot":
        return apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`);
      case "mjpeg":
        return camera.streamUrl;
      default:
        return camera.streamUrl;
    }
  }, [camera]);

  // Snapshot double-buffer polling
  useEffect(() => {
    if (!hasStream) { setLoading(false); return; }
    if (camera.streamType !== "snapshot" || !camera.streamUrl) return;
    const ms = (camera.snapshotInterval || 2) * 1000;
    const firstUrl = apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`);
    setBufA(firstUrl);
    setActiveBuf("a");
    const id = setInterval(() => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const nextUrl = apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`);
      const img = new Image();
      img.onload = () => {
        loadingRef.current = false;
        setActiveBuf((prev) => {
          if (prev === "a") { setBufB(nextUrl); return "b"; }
          else { setBufA(nextUrl); return "a"; }
        });
        setLoading(false);
        setError(false);
      };
      img.onerror = () => { loadingRef.current = false; };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera, hasStream]);

  const isPlaceholder = !hasStream;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDoubleClick={hasStream ? onDoubleClick : undefined}
      className="relative overflow-hidden select-none"
      style={{
        background: "#000",
        border: isDragOver ? "2px solid #06b6d4" : "1px solid #1a1a1a",
        cursor: hasStream ? "grab" : "default",
        transition: "border-color 0.15s",
      }}
    >
      {/* Channel number badge — top-left like NVR */}
      <div className="absolute top-0 left-0 z-30 flex items-center">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5"
          style={{ background: "rgba(0,0,0,0.7)", color: "#06b6d4", fontFamily: "monospace" }}
        >
          {gridLabel}
        </span>
      </div>

      {/* Status indicator — top-right */}
      <div className="absolute top-1.5 right-2 z-30">
        {hasStream && !error && !loading && (
          <div className="flex items-center gap-1">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "#22c55e", boxShadow: "0 0 4px rgba(34,197,94,0.6)", animation: "nvr-rec 2s ease-in-out infinite" }}
            />
            <span className="text-[8px] font-bold" style={{ color: "#22c55e", fontFamily: "monospace" }}>REC</span>
          </div>
        )}
        {hasStream && error && (
          <span className="text-[8px] font-bold" style={{ color: "#ef4444", fontFamily: "monospace" }}>NO SIGNAL</span>
        )}
      </div>

      {/* Loading spinner */}
      {hasStream && loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="h-6 w-6 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
        </div>
      )}

      {/* Placeholder — no stream */}
      {isPlaceholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "#0a0a0a" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="#333" strokeWidth="1.5" />
          </svg>
          <p className="text-[9px] text-white/15 mt-1.5 font-mono">SIN SEÑAL</p>
        </div>
      )}

      {/* Error state */}
      {hasStream && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "#0a0a0a" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* Stream: RTSP / MJPEG */}
      {hasStream && (camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
        <img
          src={getStreamSrc()}
          alt={camera.label}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}

      {/* Stream: Snapshot double-buffer */}
      {hasStream && camera.streamType === "snapshot" && (
        <>
          {bufA && (
            <img src={bufA} alt={camera.label} draggable={false}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
              style={{ opacity: activeBuf === "a" ? 1 : 0 }}
              onLoad={() => { setLoading(false); setError(false); }}
            />
          )}
          {bufB && (
            <img src={bufB} alt={camera.label} draggable={false}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
              style={{ opacity: activeBuf === "b" ? 1 : 0 }}
            />
          )}
        </>
      )}

      {/* Stream: Iframe */}
      {hasStream && camera.streamType === "iframe" && (
        <iframe
          src={camera.streamUrl}
          className="absolute inset-0 w-full h-full border-none"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
          allow="autoplay; fullscreen"
        />
      )}

      {/* Bottom info bar — camera name + IP, NVR style */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-2 py-1"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold text-white/70 truncate" style={{ fontFamily: "monospace" }}>
            {camera.label}
          </span>
        </div>
        <span className="text-[9px] text-white/30 shrink-0" style={{ fontFamily: "monospace" }}>
          {camera.ip}
        </span>
      </div>
    </div>
  );
}

// ─── Fullscreen Viewer ─────────────────────────
function FullscreenViewer({ camera, onClose, onPrev, onNext, label }: {
  camera: CameraInfo;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  label: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bufA, setBufA] = useState("");
  const [bufB, setBufB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const loadingRef = useRef(false);

  const getStreamSrc = useCallback((): string => {
    if (!camera.streamUrl) return "";
    switch (camera.streamType) {
      case "rtsp": return apiUrl(`/api/camera/rtsp-stream?url=${encodeURIComponent(camera.streamUrl)}&fps=${camera.rtspFps || 2}`);
      case "snapshot": return apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`);
      case "mjpeg": return camera.streamUrl;
      default: return camera.streamUrl;
    }
  }, [camera]);

  useEffect(() => {
    if (camera.streamType !== "snapshot" || !camera.streamUrl) return;
    const ms = (camera.snapshotInterval || 2) * 1000;
    setBufA(apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`));
    setActiveBuf("a");
    const id = setInterval(() => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const nextUrl = apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`);
      const img = new Image();
      img.onload = () => {
        loadingRef.current = false;
        setActiveBuf((p) => { if (p === "a") { setBufB(nextUrl); return "b"; } else { setBufA(nextUrl); return "a"; } });
        setLoading(false); setError(false);
      };
      img.onerror = () => { loadingRef.current = false; };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "#000" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ background: "#111", borderBottom: "1px solid #222" }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold px-2 py-0.5" style={{ background: "#06b6d4", color: "#000", fontFamily: "monospace" }}>
            {label}
          </span>
          <span className="text-xs font-semibold text-white/80" style={{ fontFamily: "monospace" }}>{camera.label}</span>
          <span className="text-[10px] text-white/25 font-mono">{camera.ip}</span>
          {!error && !loading && (
            <div className="flex items-center gap-1 ml-2">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#22c55e", animation: "nvr-rec 2s ease-in-out infinite" }} />
              <span className="text-[9px] font-bold text-green-500 font-mono">LIVE</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onPrev && (
            <button onClick={onPrev} className="p-1.5 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          {onNext && (
            <button onClick={onNext} className="p-1.5 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18" /></svg>
            </button>
          )}
          <button onClick={onClose} className="p-1.5 ml-2 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* Video */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="h-10 w-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
          </div>
        )}
        {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
          <img src={getStreamSrc()} alt={camera.label} className="max-w-full max-h-full object-contain"
            style={{ display: error ? "none" : "block" }}
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
        {camera.streamType === "snapshot" && (
          <div className="relative w-full h-full flex items-center justify-center">
            {bufA && <img src={bufA} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-500"
              style={{ opacity: activeBuf === "a" ? 1 : 0, position: activeBuf === "a" ? "relative" : "absolute" }}
              onLoad={() => { setLoading(false); setError(false); }}
            />}
            {bufB && <img src={bufB} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-500"
              style={{ opacity: activeBuf === "b" ? 1 : 0, position: activeBuf === "b" ? "relative" : "absolute" }}
            />}
          </div>
        )}
        {camera.streamType === "iframe" && (
          <iframe src={camera.streamUrl} className="w-full h-full border-none" allow="autoplay; fullscreen"
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
              <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
              <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="2" />
            </svg>
            <p className="text-sm text-white/20 mt-3 font-mono">NO SIGNAL</p>
            <button onClick={() => { setError(false); setLoading(true); }}
              className="mt-4 px-4 py-1.5 text-xs font-mono text-cyan-400/60 hover:text-cyan-400 transition-colors"
              style={{ border: "1px solid rgba(6,182,212,0.2)" }}
            >
              RETRY
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="px-4 py-1.5 flex items-center justify-between shrink-0" style={{ background: "#111", borderTop: "1px solid #222" }}>
        <span className="text-[10px] text-white/20 font-mono">
          {camera.streamType === "rtsp" ? `RTSP · ${camera.rtspFps || 2} FPS` : camera.streamType === "snapshot" ? `SNAPSHOT · ${camera.snapshotInterval || 2}s` : camera.streamType?.toUpperCase()}
        </span>
        <span className="text-[10px] text-white/20 font-mono">{camera.mapName}</span>
      </div>
    </div>
  );
}

// ─── ONVIF Discovery Modal ────────────────────
function OnvifScanModal({ onClose, onFound }: { onClose: () => void; onFound: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [timeout, setTimeout_] = useState(5);

  const scan = useCallback(async () => {
    setScanning(true); setError(null); setDevices([]);
    try {
      const res = await fetch(apiUrl("/api/onvif/discover"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeout: timeout * 1000, user, pass }) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setDevices(data.devices || []);
      setScanned(true);
    } catch (err: any) { setError(err.message || "Error de conexion"); setScanned(true); }
    finally { setScanning(false); }
  }, [user, pass, timeout]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }}>
      <div className="relative overflow-hidden flex flex-col" style={{ background: "#111", border: "1px solid #333", width: "min(560px, 92vw)", maxHeight: "80vh" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #222" }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
            <span className="text-sm font-bold text-white font-mono">ONVIF DISCOVERY</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-white/40 hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="px-4 py-3 flex gap-3 items-end" style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div className="flex-1">
            <label className="text-[10px] text-white/30 block mb-1 font-mono">USER</label>
            <input type="text" value={user} onChange={(e) => setUser(e.target.value)} className="w-full px-2 py-1.5 text-xs text-white font-mono focus:outline-none" style={{ background: "#0a0a0a", border: "1px solid #333" }} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-white/30 block mb-1 font-mono">PASS</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="w-full px-2 py-1.5 text-xs text-white font-mono focus:outline-none" style={{ background: "#0a0a0a", border: "1px solid #333" }} />
          </div>
          <div className="w-20">
            <label className="text-[10px] text-white/30 block mb-1 font-mono">TIMEOUT</label>
            <select value={timeout} onChange={(e) => setTimeout_(parseInt(e.target.value))} className="w-full px-2 py-1.5 text-xs text-white font-mono focus:outline-none" style={{ background: "#0a0a0a", border: "1px solid #333" }}>
              <option value={3} style={{ background: "#0a0a0a" }}>3s</option>
              <option value={5} style={{ background: "#0a0a0a" }}>5s</option>
              <option value={10} style={{ background: "#0a0a0a" }}>10s</option>
            </select>
          </div>
          <button onClick={scan} disabled={scanning} className="px-4 py-1.5 text-xs font-bold font-mono transition-all" style={{ background: scanning ? "#0a3a3a" : "#06b6d4", color: scanning ? "#06b6d4" : "#000", opacity: scanning ? 0.7 : 1 }}>
            {scanning ? "SCANNING..." : "SCAN"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ minHeight: "180px" }}>
          {!scanned && !scanning && (
            <div className="flex flex-col items-center justify-center py-12 text-white/15">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
              <p className="text-xs font-mono">Press SCAN to discover</p>
            </div>
          )}
          {scanning && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
              <p className="text-xs text-white/30 mt-3 font-mono">Searching...</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="text-xs text-red-400 font-mono">{error}</p>
            </div>
          )}
          {scanned && !scanning && devices.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-10 text-white/20">
              <p className="text-xs font-mono">No devices found</p>
            </div>
          )}
          {devices.map((dev: any, i: number) => (
            <div key={`${dev.ip}-${i}`} className="p-2 flex items-center gap-3" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
              <div className="h-8 w-8 flex items-center justify-center shrink-0" style={{ background: dev.connected ? "rgba(34,197,94,0.1)" : "#111" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dev.connected ? "#22c55e" : "#555"} strokeWidth="1.8"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white font-mono">{dev.ip}</span>
                  {dev.connected && <span className="text-[8px] px-1 py-0.5 font-bold font-mono" style={{ background: "#22c55e", color: "#000" }}>ONLINE</span>}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5 truncate font-mono">{[dev.manufacturer, dev.model].filter(Boolean).join(" · ") || "ONVIF Device"}</div>
              </div>
            </div>
          ))}
        </div>
        {scanned && (
          <div className="px-4 py-2 flex items-center justify-between" style={{ borderTop: "1px solid #222" }}>
            <span className="text-[10px] text-white/20 font-mono">{devices.length} device{devices.length !== 1 ? "s" : ""}</span>
            <button onClick={onClose} className="px-3 py-1 text-xs font-bold font-mono text-white/50 hover:text-white transition-colors" style={{ border: "1px solid #333" }}>CLOSE</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Map Selector Card ─────────────────────────
function MapCard({ map, onSelect }: { map: MapWithCameras; onSelect: () => void }) {
  const totalCams = map.cameras.filter((c) => c.streamUrl && c.streamType !== "nvr").length;
  const nvrCams = map.cameras.filter((c) => c.source === "nvr").length;
  const isEmpty = map.cameras.length === 0;

  const content = (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="h-10 w-10 flex items-center justify-center shrink-0" style={{ background: isEmpty ? "#111" : "#0a2a2a", border: `1px solid ${isEmpty ? "#1a1a1a" : "#164e4e"}` }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isEmpty ? "#333" : "#06b6d4"} strokeWidth="1.5" strokeLinecap="round">
          <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`text-[13px] font-bold truncate font-mono ${isEmpty ? "text-white/30" : "text-white/85"}`}>{map.mapName}</h3>
        <div className="flex items-center gap-3 mt-0.5">
          {totalCams > 0 && <span className="text-[10px] text-cyan-400/60 font-mono">{totalCams} LIVE</span>}
          {nvrCams > 0 && <span className="text-[10px] text-purple-400/50 font-mono">{nvrCams} NVR</span>}
          {isEmpty && <span className="text-[10px] text-white/15 font-mono">NO CAMERAS</span>}
        </div>
      </div>
      {!isEmpty && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" className="shrink-0">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      )}
    </div>
  );

  if (isEmpty) {
    return <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", opacity: 0.5 }}>{content}</div>;
  }

  return (
    <button
      onClick={onSelect}
      className="w-full text-left transition-all duration-150 hover:bg-[#0d1a1a]"
      style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#164e4e"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1a1a1a"; }}
    >
      {content}
    </button>
  );
}

// ─── Main Page ─────────────────────────────────
export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [allMaps, setAllMaps] = useState<MapInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState<MapWithCameras | null>(null);
  const [layout, setLayout] = useState<GridLayout>("2x2");
  const [fullscreenIdx, setFullscreenIdx] = useState<number | null>(null);
  const [showOnvif, setShowOnvif] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Drag & drop state
  const [cameraOrder, setCameraOrder] = useState<CameraInfo[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    const user = localStorage.getItem("kumamap_user");
    setIsAuthenticated(!!user);
  }, []);

  const fetchCameras = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/cameras"));
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setCameras(data.cameras || []);
        setAllMaps(data.maps || []);
      }
    } catch (err: any) { setError(err.message || "Error cargando cámaras"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchCameras();
  }, [isAuthenticated, fetchCameras]);

  // When selecting a map, initialize camera order
  useEffect(() => {
    if (selectedMap) {
      setCameraOrder(selectedMap.cameras);
    }
  }, [selectedMap]);

  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center bg-black"><div className="h-8 w-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" /></div>;
  }
  if (!isAuthenticated) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  const mapsWithCameras: MapWithCameras[] = allMaps.map((m) => ({
    ...m,
    cameras: cameras.filter((c) => c.mapId === m.mapId),
  }));
  mapsWithCameras.sort((a, b) => {
    const aHas = a.cameras.length > 0 ? 0 : 1;
    const bHas = b.cameras.length > 0 ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.mapName.localeCompare(b.mapName);
  });

  const cols = GRID_COLS[layout];
  const totalStreams = cameras.filter((c) => c.streamUrl && c.streamType !== "nvr").length;
  const totalNvr = cameras.filter((c) => c.source === "nvr").length;

  // Drag handlers
  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    // Ghost image
    const el = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
  };
  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const handleDrop = (targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const newOrder = [...cameraOrder];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    setCameraOrder(newOrder);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // Fullscreen navigation
  const activeForFullscreen = cameraOrder.filter((c) => c.streamUrl && c.streamType !== "nvr");
  const openFullscreen = (cam: CameraInfo) => {
    const idx = activeForFullscreen.findIndex((c) => c.nodeId === cam.nodeId);
    setFullscreenIdx(idx >= 0 ? idx : 0);
  };

  // ── Map Selector View ──
  if (!selectedMap) {
    return (
      <div className="min-h-screen bg-black">
        <header className="sticky top-0 z-50 px-5 py-3 flex items-center gap-3" style={{ background: "#0a0a0a", borderBottom: "1px solid #1a1a1a" }}>
          <Link href="/" className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            <span className="text-xs font-mono">MAPS</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            <h1 className="text-sm font-bold text-white/90 font-mono">CAMERAS</h1>
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowOnvif(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold font-mono transition-all" style={{ background: "#06b6d4", color: "#000" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
            DISCOVER
          </button>
          <button onClick={fetchCameras} className="h-8 w-8 flex items-center justify-center text-white/25 hover:text-white/60 transition-all" title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
        </header>

        <main className="max-w-3xl mx-auto px-5 py-5">
          {!loading && !error && (
            <div className="flex items-center gap-4 mb-4 px-1">
              <span className="text-[11px] text-white/25 font-mono">{allMaps.length} MAP{allMaps.length !== 1 ? "S" : ""}</span>
              {totalStreams > 0 && (
                <>
                  <div className="h-3 w-px bg-white/10" />
                  <span className="text-[11px] text-cyan-400/50 font-mono">{totalStreams} LIVE</span>
                </>
              )}
              {totalNvr > 0 && (
                <>
                  <div className="h-3 w-px bg-white/10" />
                  <span className="text-[11px] text-purple-400/50 font-mono">{totalNvr} NVR CH</span>
                </>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-sm text-red-400/60 font-mono">{error}</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-sm text-white/30 font-mono">NO MAPS CONFIGURED</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length > 0 && (
            <div className="space-y-1">
              {mapsWithCameras.map((m) => (
                <MapCard key={m.mapId} map={m} onSelect={() => setSelectedMap(m)} />
              ))}
            </div>
          )}
        </main>

        {showOnvif && <OnvifScanModal onClose={() => setShowOnvif(false)} onFound={fetchCameras} />}
      </div>
    );
  }

  // ── Camera Grid View — NVR Style ──
  const rows = Math.ceil(cameraOrder.length / cols);

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden">
      {/* NVR-style top bar */}
      <header className="shrink-0 px-4 py-1.5 flex items-center gap-3" style={{ background: "#111", borderBottom: "1px solid #222" }}>
        <button onClick={() => setSelectedMap(null)} className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span className="text-[10px] font-mono">BACK</span>
        </button>
        <div className="h-3 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
          <h1 className="text-xs font-bold text-white/85 truncate font-mono">{selectedMap.mapName}</h1>
        </div>
        <span className="text-[10px] text-cyan-400/50 font-mono ml-1">
          {cameraOrder.filter((c) => c.streamUrl && c.streamType !== "nvr").length} live
        </span>
        <div className="flex-1" />

        {/* ONVIF */}
        <button onClick={() => setShowOnvif(true)} className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold font-mono transition-all" style={{ background: "#06b6d4", color: "#000" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
          Descubrir
        </button>

        {/* Layout selector — NVR style */}
        <div className="flex items-center" style={{ border: "1px solid #333" }}>
          {(["1x1", "2x2", "3x3", "4x4"] as GridLayout[]).map((g) => (
            <button
              key={g}
              onClick={() => setLayout(g)}
              className="px-2 py-0.5 text-[10px] font-bold font-mono transition-all"
              style={{
                background: layout === g ? "#06b6d4" : "transparent",
                color: layout === g ? "#000" : "#555",
                borderRight: g !== "4x4" ? "1px solid #333" : "none",
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </header>

      {/* Grid — fills remaining viewport */}
      <main className="flex-1 overflow-hidden">
        {cameraOrder.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round">
              <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
            <p className="text-sm text-white/20 mt-3 font-mono">NO CAMERAS</p>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setShowOnvif(true)} className="px-3 py-1.5 text-xs font-bold font-mono" style={{ background: "#06b6d4", color: "#000" }}>DISCOVER ONVIF</button>
              <Link href={`/?map=${selectedMap.mapId}`} className="px-3 py-1.5 text-xs font-mono text-white/40" style={{ border: "1px solid #333" }}>OPEN MAP</Link>
            </div>
          </div>
        ) : (
          <div
            className="w-full h-full grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gap: "1px",
              background: "#1a1a1a",
            }}
          >
            {cameraOrder.map((cam, idx) => (
              <NvrCell
                key={cam.nodeId}
                camera={cam}
                index={idx}
                gridLabel={`CH${String(idx + 1).padStart(2, "0")}`}
                onDoubleClick={() => openFullscreen(cam)}
                isDragOver={dragOverIdx === idx && dragIdx !== idx}
                onDragStart={handleDragStart(idx)}
                onDragOver={handleDragOver(idx)}
                onDrop={handleDrop(idx)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}
      </main>

      {/* Fullscreen viewer */}
      {fullscreenIdx !== null && activeForFullscreen[fullscreenIdx] && (
        <FullscreenViewer
          camera={activeForFullscreen[fullscreenIdx]}
          label={`CH${String(cameraOrder.findIndex((c) => c.nodeId === activeForFullscreen[fullscreenIdx].nodeId) + 1).padStart(2, "0")}`}
          onClose={() => setFullscreenIdx(null)}
          onPrev={fullscreenIdx > 0 ? () => setFullscreenIdx(fullscreenIdx - 1) : undefined}
          onNext={fullscreenIdx < activeForFullscreen.length - 1 ? () => setFullscreenIdx(fullscreenIdx + 1) : undefined}
        />
      )}

      {showOnvif && <OnvifScanModal onClose={() => setShowOnvif(false)} onFound={fetchCameras} />}
      <style>{`@keyframes nvr-rec { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
