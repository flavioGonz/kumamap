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

type GridLayout = "2x2" | "3x3" | "4x4" | "1x1";
const GRID_COLS: Record<GridLayout, number> = { "1x1": 1, "2x2": 2, "3x3": 3, "4x4": 4 };

// ─── Camera Cell ───────────────────────────────
function CameraCell({
  camera,
  onFullscreen,
  compact,
}: {
  camera: CameraInfo;
  onFullscreen: (cam: CameraInfo) => void;
  compact?: boolean;
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
      img.onload = () => { loadingRef.current = false; setActiveBuf((prev) => { if (prev === "a") { setBufB(nextUrl); return "b"; } else { setBufA(nextUrl); return "a"; } }); setLoading(false); setError(false); };
      img.onerror = () => { loadingRef.current = false; };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera, hasStream]);

  const isNvrPlaceholder = camera.source === "nvr" && !camera.streamUrl;
  const isNoCameraConfig = !camera.streamUrl && !camera.streamType;

  return (
    <div
      className="relative group overflow-hidden"
      style={{
        background: "linear-gradient(145deg, #111318 0%, #0c0e12 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "12px",
        aspectRatio: "16/9",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Status LED - always visible top-left */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full"
          style={{
            background: isNvrPlaceholder || isNoCameraConfig ? "#555" : error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e",
            boxShadow: `0 0 8px ${isNvrPlaceholder || isNoCameraConfig ? "transparent" : error ? "rgba(239,68,68,0.4)" : loading ? "rgba(245,158,11,0.4)" : "rgba(34,197,94,0.4)"}`,
            animation: hasStream && !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none",
          }}
        />
        {camera.source === "nvr" && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa", letterSpacing: "0.05em" }}>
            {camera.nvrChannel ? `NVR CH${camera.nvrChannel}` : "NVR"}
          </span>
        )}
      </div>

      {/* Loading state */}
      {hasStream && loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="relative">
            <div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
          </div>
          <span className="text-[9px] text-white/20 mt-2 font-medium tracking-wide">CONECTANDO</span>
        </div>
      )}

      {/* No stream / NVR placeholder */}
      {(isNvrPlaceholder || isNoCameraConfig) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="p-3 rounded-xl mb-2" style={{ background: "rgba(255,255,255,0.03)" }}>
            {isNvrPlaceholder ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" /><path d="M2 10h20" /></svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            )}
          </div>
          <p className="text-[10px] text-white/25 font-medium">
            {isNvrPlaceholder ? "Canales no descubiertos" : "Sin stream configurado"}
          </p>
          <p className="text-[9px] text-white/15 mt-0.5">
            {isNvrPlaceholder ? "Configure desde el rack" : "Asigne un stream RTSP"}
          </p>
        </div>
      )}

      {/* Error state */}
      {hasStream && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="p-3 rounded-xl mb-2" style={{ background: "rgba(239,68,68,0.06)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5">
              <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
              <line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.4)" strokeWidth="2" />
            </svg>
          </div>
          <p className="text-[10px] text-white/30">Sin señal</p>
        </div>
      )}

      {/* Stream rendering */}
      {hasStream && (camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
        <img src={getStreamSrc()} alt={camera.label} className="absolute inset-0 w-full h-full object-contain"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}

      {hasStream && camera.streamType === "snapshot" && (
        <>
          {bufA && <img src={bufA} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-500" style={{ opacity: activeBuf === "a" ? 1 : 0 }} onLoad={() => { setLoading(false); setError(false); }} />}
          {bufB && <img src={bufB} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-500" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />}
        </>
      )}

      {hasStream && camera.streamType === "iframe" && (
        <iframe src={camera.streamUrl} className="absolute inset-0 w-full h-full border-none" style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
          allow="autoplay; fullscreen"
        />
      )}

      {/* Bottom info bar — always visible, hover reveals actions */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 transition-all duration-200"
        style={{ background: "linear-gradient(transparent 0%, rgba(0,0,0,0.9) 100%)" }}
      >
        <div className="px-3 py-2.5 flex items-end justify-between">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-white/80 truncate block">{camera.label}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-white/30 font-mono">{camera.ip}</span>
              {camera.streamType && camera.streamType !== "nvr" && (
                <span className="text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider" style={{
                  background: camera.streamType === "rtsp" ? "rgba(59,130,246,0.15)" : camera.streamType === "mjpeg" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                  color: camera.streamType === "rtsp" ? "#60a5fa" : camera.streamType === "mjpeg" ? "#4ade80" : "#888",
                }}>
                  {camera.streamType}
                </span>
              )}
              {camera.manufacturer && (
                <span className="text-[8px] text-white/20 truncate max-w-[100px]">{camera.manufacturer}</span>
              )}
            </div>
          </div>
          {hasStream && (
            <button
              onClick={() => onFullscreen(camera)}
              className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-white/10"
              title="Pantalla completa"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fullscreen Viewer ─────────────────────────
function FullscreenViewer({ camera, onClose }: { camera: CameraInfo; onClose: () => void }) {
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
      img.onload = () => { loadingRef.current = false; setActiveBuf((p) => { if (p === "a") { setBufB(nextUrl); return "b"; } else { setBufA(nextUrl); return "a"; } }); setLoading(false); setError(false); };
      img.onerror = () => { loadingRef.current = false; };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "#000" }} onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ background: "rgba(0,0,0,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e", boxShadow: `0 0 8px ${error ? "rgba(239,68,68,0.4)" : loading ? "rgba(245,158,11,0.4)" : "rgba(34,197,94,0.4)"}`, animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none" }} />
          <div>
            <span className="text-sm font-semibold text-white">{camera.label}</span>
            <span className="text-xs text-white/25 ml-3 font-mono">{camera.ip}</span>
            {camera.source === "nvr" && camera.nvrChannel && (
              <span className="text-[9px] text-purple-400/60 ml-2 font-semibold">NVR CH{camera.nvrChannel}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="h-10 w-10 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
          </div>
        )}
        {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
          <img src={getStreamSrc()} alt={camera.label} className="max-w-full max-h-full object-contain" style={{ display: error ? "none" : "block" }} onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />
        )}
        {camera.streamType === "snapshot" && (
          <div className="relative w-full h-full flex items-center justify-center">
            {bufA && <img src={bufA} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-500" style={{ opacity: activeBuf === "a" ? 1 : 0, position: activeBuf === "a" ? "relative" : "absolute" }} onLoad={() => { setLoading(false); setError(false); }} />}
            {bufB && <img src={bufB} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-500" style={{ opacity: activeBuf === "b" ? 1 : 0, position: activeBuf === "b" ? "relative" : "absolute" }} />}
          </div>
        )}
        {camera.streamType === "iframe" && <iframe src={camera.streamUrl} className="w-full h-full border-none" allow="autoplay; fullscreen" onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="p-4 rounded-2xl mb-3" style={{ background: "rgba(239,68,68,0.06)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.4)" strokeWidth="2" /></svg>
            </div>
            <p className="text-sm text-white/30">Sin señal</p>
            <button onClick={() => { setError(false); setLoading(true); }} className="mt-3 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-white/10" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}>Reintentar</button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="px-5 py-2 flex items-center justify-between shrink-0" style={{ background: "rgba(0,0,0,0.95)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-[10px] text-white/20 font-medium tracking-wide">
          {camera.streamType === "rtsp" ? `RTSP · ${camera.rtspFps || 2} FPS` : camera.streamType === "snapshot" ? `SNAPSHOT · ${camera.snapshotInterval || 2}s` : camera.streamType === "mjpeg" ? "MJPEG" : camera.streamType === "iframe" ? "EMBEBIDO" : camera.streamType?.toUpperCase()}
        </span>
        <span className="text-[10px] text-white/20">{camera.mapName}</span>
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
      <div className="relative overflow-hidden flex flex-col" style={{ background: "#14161a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", width: "min(560px, 92vw)", maxHeight: "80vh", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,182,212,0.1)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Descubrir ONVIF</h2>
              <p className="text-[10px] text-white/30">Escanear red en busca de dispositivos</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 flex gap-3 items-end" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex-1">
            <label className="text-[10px] text-white/30 block mb-1 font-medium">Usuario</label>
            <input type="text" value={user} onChange={(e) => setUser(e.target.value)} placeholder="admin" className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-cyan-500/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-white/30 block mb-1 font-medium">Contraseña</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••" className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-cyan-500/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
          </div>
          <div className="w-20">
            <label className="text-[10px] text-white/30 block mb-1 font-medium">Timeout</label>
            <select value={timeout} onChange={(e) => setTimeout_(parseInt(e.target.value))} className="w-full rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <option value={3} style={{ background: "#14161a" }}>3s</option>
              <option value={5} style={{ background: "#14161a" }}>5s</option>
              <option value={10} style={{ background: "#14161a" }}>10s</option>
            </select>
          </div>
          <button onClick={scan} disabled={scanning} className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2" style={{ background: scanning ? "rgba(6,182,212,0.08)" : "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.25)", color: "#06b6d4", opacity: scanning ? 0.6 : 1 }}>
            {scanning ? <div className="h-3.5 w-3.5 rounded-full border border-cyan-500/30 border-t-cyan-500 animate-spin" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>}
            {scanning ? "Escaneando..." : "Escanear"}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2" style={{ minHeight: "180px" }}>
          {!scanned && !scanning && (
            <div className="flex flex-col items-center justify-center py-12 text-white/15">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
              <p className="text-xs">Presiona Escanear para buscar dispositivos</p>
            </div>
          )}
          {scanning && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-10 w-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
              <p className="text-xs text-white/30 mt-4">Buscando dispositivos ONVIF...</p>
              <p className="text-[10px] text-white/15 mt-1">Hasta {timeout}s</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.1)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              <p className="text-xs text-red-400/80">{error}</p>
            </div>
          )}
          {scanned && !scanning && devices.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-10 text-white/20">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              <p className="text-xs">No se encontraron dispositivos</p>
            </div>
          )}
          {devices.map((dev: any, i: number) => (
            <div key={`${dev.ip}-${i}`} className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: dev.connected ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dev.connected ? "#22c55e" : "#555"} strokeWidth="1.8" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white font-mono">{dev.ip}</span>
                  {dev.port !== 80 && <span className="text-[10px] text-white/20 font-mono">:{dev.port}</span>}
                  {dev.connected && <span className="text-[8px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>ONLINE</span>}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5 truncate">{[dev.manufacturer, dev.model].filter(Boolean).join(" · ") || "Dispositivo ONVIF"}</div>
                {dev.streamUri && <div className="text-[9px] text-cyan-400/40 font-mono mt-0.5 truncate">{dev.streamUri}</div>}
              </div>
            </div>
          ))}
        </div>

        {scanned && (
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[10px] text-white/20">{devices.length} dispositivo{devices.length !== 1 ? "s" : ""}</span>
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}>Cerrar</button>
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
  const unconfigured = map.cameras.filter((c) => !c.streamUrl || c.streamType === "nvr").length;
  const isEmpty = map.cameras.length === 0;

  return (
    <button
      onClick={onSelect}
      className="group relative text-left transition-all duration-200 w-full overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "14px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = isEmpty ? "rgba(255,255,255,0.03)" : "rgba(6,182,212,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = isEmpty ? "rgba(255,255,255,0.08)" : "rgba(6,182,212,0.15)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.015)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.05)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      <div className="p-4 flex items-center gap-4">
        {/* Icon */}
        <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{
          background: isEmpty ? "rgba(255,255,255,0.03)" : totalCams > 0 ? "rgba(6,182,212,0.08)" : "rgba(139,92,246,0.08)",
        }}>
          {isEmpty ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8m-4-4h8" /></svg>
          ) : nvrCams > 0 && totalCams === 0 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" /><path d="M2 10h20" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-white/85 truncate">{map.mapName}</h3>
          <div className="flex items-center gap-3 mt-1">
            {totalCams > 0 && (
              <span className="text-[10px] text-white/35 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
                {totalCams} stream{totalCams !== 1 ? "s" : ""}
              </span>
            )}
            {nvrCams > 0 && (
              <span className="text-[10px] text-purple-400/50 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>
                {nvrCams} NVR
              </span>
            )}
            {isEmpty && (
              <span className="text-[10px] text-white/20">Sin cámaras — planificar instalación</span>
            )}
            {!isEmpty && unconfigured > 0 && (
              <span className="text-[10px] text-amber-400/40">{unconfigured} sin stream</span>
            )}
          </div>
          {/* Camera names preview */}
          {map.cameras.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {map.cameras.filter(c => c.streamUrl).slice(0, 4).map((c) => (
                <span key={c.nodeId} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.03)", color: "#666" }}>
                  {c.label}
                </span>
              ))}
              {map.cameras.filter(c => c.streamUrl).length > 4 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.03)", color: "#444" }}>
                  +{map.cameras.filter(c => c.streamUrl).length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Arrow */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" className="shrink-0 group-hover:translate-x-0.5 transition-transform">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
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
  const [fullscreenCam, setFullscreenCam] = useState<CameraInfo | null>(null);
  const [showOnvif, setShowOnvif] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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

  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}><div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" /></div>;
  }
  if (!isAuthenticated) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  // Build maps with cameras — include ALL maps
  const mapsWithCameras: MapWithCameras[] = allMaps.map((m) => ({
    ...m,
    cameras: cameras.filter((c) => c.mapId === m.mapId),
  }));

  // Sort: maps with cameras first, then by name
  mapsWithCameras.sort((a, b) => {
    const aHas = a.cameras.length > 0 ? 0 : 1;
    const bHas = b.cameras.length > 0 ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.mapName.localeCompare(b.mapName);
  });

  const cols = GRID_COLS[layout];

  // Stats
  const totalStreams = cameras.filter((c) => c.streamUrl && c.streamType !== "nvr").length;
  const totalNvr = cameras.filter((c) => c.source === "nvr").length;
  const totalMapsWithCams = mapsWithCameras.filter((m) => m.cameras.length > 0).length;

  // ── Map Selector View ──
  if (!selectedMap) {
    return (
      <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
        <header className="sticky top-0 z-50 px-6 py-3.5 flex items-center gap-4" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <Link href="/" className="flex items-center gap-2 text-white/30 hover:text-white/60 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            <span className="text-xs font-medium">Mapas</span>
          </Link>
          <div className="h-4 w-px bg-white/8" />
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            <h1 className="text-sm font-semibold text-white/90">Cámaras</h1>
          </div>
          <div className="flex-1" />

          {/* ONVIF discover */}
          <button
            onClick={() => setShowOnvif(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:bg-cyan-500/15"
            style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)", color: "#06b6d4" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
            Descubrir
          </button>

          <button onClick={fetchCameras} className="h-8 w-8 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/5 transition-all" title="Actualizar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-6">
          {/* Stats bar */}
          {!loading && !error && (
            <div className="flex items-center gap-4 mb-5 px-1">
              <span className="text-[11px] text-white/25">{allMaps.length} mapa{allMaps.length !== 1 ? "s" : ""}</span>
              {totalStreams > 0 && (
                <>
                  <div className="h-3 w-px bg-white/8" />
                  <span className="text-[11px] text-cyan-400/40">{totalStreams} stream{totalStreams !== 1 ? "s" : ""} activos</span>
                </>
              )}
              {totalNvr > 0 && (
                <>
                  <div className="h-3 w-px bg-white/8" />
                  <span className="text-[11px] text-purple-400/40">{totalNvr} canal{totalNvr !== 1 ? "es" : ""} NVR</span>
                </>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 rounded-2xl mb-3" style={{ background: "rgba(239,68,68,0.06)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              </div>
              <p className="text-sm text-white/30">{error}</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 rounded-2xl mb-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              </div>
              <p className="text-sm text-white/30 mb-1">No hay mapas configurados</p>
              <p className="text-xs text-white/15">Crea un mapa desde la página principal</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length > 0 && (
            <div className="space-y-2">
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

  // ── Camera Grid View ──
  const activeCameras = selectedMap.cameras.filter((c) => c.streamUrl && c.streamType !== "nvr");
  const inactiveCameras = selectedMap.cameras.filter((c) => !c.streamUrl || c.streamType === "nvr");

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      <header className="sticky top-0 z-50 px-5 py-3 flex items-center gap-3" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={() => setSelectedMap(null)} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span className="text-xs font-medium">Clientes</span>
        </button>
        <div className="h-4 w-px bg-white/8" />
        <div className="flex items-center gap-2 min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
          <h1 className="text-sm font-semibold text-white/85 truncate">{selectedMap.mapName}</h1>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {activeCameras.length > 0 && <span className="text-[10px] text-cyan-400/40 font-medium">{activeCameras.length} live</span>}
          {inactiveCameras.length > 0 && <span className="text-[10px] text-white/20 font-medium">{inactiveCameras.length} offline</span>}
        </div>
        <div className="flex-1" />

        {/* ONVIF */}
        <button
          onClick={() => setShowOnvif(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:bg-cyan-500/15"
          style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)", color: "#06b6d4" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
          Descubrir
        </button>

        {/* Grid layout selector */}
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["1x1", "2x2", "3x3", "4x4"] as GridLayout[]).map((g) => (
            <button key={g} onClick={() => setLayout(g)} className="px-2.5 py-1 text-[10px] font-semibold transition-all" style={{
              background: layout === g ? "rgba(6,182,212,0.12)" : "transparent",
              color: layout === g ? "#06b6d4" : "#555",
              borderRight: g !== "4x4" ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              {g}
            </button>
          ))}
        </div>
      </header>

      <main className="p-3">
        {/* Empty state - map with no cameras */}
        {selectedMap.cameras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="p-5 rounded-2xl mb-4" style={{ background: "rgba(255,255,255,0.02)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><path d="M12 10v4m-2-2h4" /></svg>
            </div>
            <p className="text-sm text-white/35 mb-1">Sin cámaras en este mapa</p>
            <p className="text-xs text-white/20 mb-4">Agrega cámaras o NVR/DVR desde el editor de mapas</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowOnvif(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-cyan-500/15"
                style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", color: "#06b6d4" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
                Descubrir ONVIF
              </button>
              <Link
                href={`/?map=${selectedMap.mapId}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-white/5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}
              >
                Abrir mapa
              </Link>
            </div>
          </div>
        )}

        {/* Active streams grid */}
        {activeCameras.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {activeCameras.map((cam) => (
              <CameraCell key={cam.nodeId} camera={cam} onFullscreen={setFullscreenCam} />
            ))}
          </div>
        )}

        {/* Inactive / unconfigured cameras */}
        {inactiveCameras.length > 0 && activeCameras.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-[10px] text-white/20 font-medium">Sin stream ({inactiveCameras.length})</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(cols, 3)}, 1fr)` }}>
              {inactiveCameras.map((cam) => (
                <CameraCell key={cam.nodeId} camera={cam} onFullscreen={setFullscreenCam} compact />
              ))}
            </div>
          </div>
        )}

        {/* Only inactive cameras */}
        {inactiveCameras.length > 0 && activeCameras.length === 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {inactiveCameras.map((cam) => (
              <CameraCell key={cam.nodeId} camera={cam} onFullscreen={setFullscreenCam} />
            ))}
          </div>
        )}
      </main>

      {fullscreenCam && <FullscreenViewer camera={fullscreenCam} onClose={() => setFullscreenCam(null)} />}
      {showOnvif && <OnvifScanModal onClose={() => setShowOnvif(false)} onFound={fetchCameras} />}
      <style>{`@keyframes cam-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
