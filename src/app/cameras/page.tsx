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
}

interface MapWithCameras {
  mapId: string;
  mapName: string;
  cameras: CameraInfo[];
}

type GridLayout = "2x2" | "3x3" | "4x4" | "1x1";
const GRID_COLS: Record<GridLayout, number> = { "1x1": 1, "2x2": 2, "3x3": 3, "4x4": 4 };

// ─── Camera Cell ───────────────────────────────
function CameraCell({
  camera,
  onFullscreen,
}: {
  camera: CameraInfo;
  onFullscreen: (cam: CameraInfo) => void;
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
  }, [camera]);

  return (
    <div
      className="relative group overflow-hidden rounded-2xl"
      style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", aspectRatio: "16/9" }}
    >
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin mb-1">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
          </svg>
          <span className="text-[9px] text-[#555]">Conectando...</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" className="mb-2">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.5)" strokeWidth="2" />
          </svg>
          <p className="text-[10px] text-[#666]">Sin conexion</p>
        </div>
      )}

      {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
        <img src={getStreamSrc()} alt={camera.label} className="absolute inset-0 w-full h-full object-contain"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}

      {camera.streamType === "snapshot" && (
        <>
          {bufA && <img src={bufA} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "a" ? 1 : 0 }} onLoad={() => { setLoading(false); setError(false); }} />}
          {bufB && <img src={bufB} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />}
        </>
      )}

      {camera.streamType === "iframe" && (
        <iframe src={camera.streamUrl} className="absolute inset-0 w-full h-full border-none" style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
          allow="autoplay; fullscreen"
        />
      )}

      {/* Overlay hover */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-3 py-2 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: "linear-gradient(transparent 0%, rgba(0,0,0,0.85) 100%)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full shrink-0" style={{
              background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e",
              boxShadow: `0 0 6px ${error ? "rgba(239,68,68,0.5)" : loading ? "rgba(245,158,11,0.5)" : "rgba(34,197,94,0.5)"}`,
              animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none",
            }} />
            <span className="text-[11px] font-bold text-white truncate">{camera.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-white/40 font-mono">{camera.ip}</span>
            <span className="text-[9px] text-white/30 uppercase">{camera.streamType}</span>
          </div>
        </div>
        <button onClick={() => onFullscreen(camera)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Pantalla completa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* Always-visible label */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 group-hover:opacity-0 transition-opacity">
        <div className="h-1.5 w-1.5 rounded-full" style={{
          background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e",
          animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none",
        }} />
        <span className="text-[10px] font-semibold truncate max-w-[140px]" style={{ color: "rgba(255,255,255,0.7)", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
          {camera.label}
        </span>
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
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(0,0,0,0.9)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e", animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none" }} />
          <div><span className="text-sm font-bold text-white">{camera.label}</span><span className="text-xs text-white/30 ml-3 font-mono">{camera.ip}</span></div>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="flex-1 relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </div>
        )}
        {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
          <img src={getStreamSrc()} alt={camera.label} className="max-w-full max-h-full object-contain" style={{ display: error ? "none" : "block" }} onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />
        )}
        {camera.streamType === "snapshot" && (
          <div className="relative w-full h-full flex items-center justify-center">
            {bufA && <img src={bufA} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "a" ? 1 : 0, position: activeBuf === "a" ? "relative" : "absolute" }} onLoad={() => { setLoading(false); setError(false); }} />}
            {bufB && <img src={bufB} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "b" ? 1 : 0, position: activeBuf === "b" ? "relative" : "absolute" }} />}
          </div>
        )}
        {camera.streamType === "iframe" && <iframe src={camera.streamUrl} className="w-full h-full border-none" allow="autoplay; fullscreen" onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" className="mb-3"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.5)" strokeWidth="2" /></svg>
            <p className="text-sm text-[#888]">Error de conexion</p>
            <button onClick={() => { setError(false); setLoading(true); }} className="mt-3 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}>Reintentar</button>
          </div>
        )}
      </div>
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: "rgba(0,0,0,0.9)" }}>
        <span className="text-[10px] text-[#444]">{camera.streamType === "rtsp" ? `RTSP · ${camera.rtspFps || 2} fps` : camera.streamType === "snapshot" ? `Snapshot · cada ${camera.snapshotInterval || 2}s` : camera.streamType === "mjpeg" ? "MJPEG directo" : camera.streamType === "iframe" ? "Embebido" : camera.streamType}</span>
        <span className="text-[10px] text-[#444]">{camera.mapName}</span>
      </div>
    </div>
  );
}

// ─── ONVIF Discovery Modal (inline) ────────────
function OnvifScanModal({ onClose, onFound }: { onClose: () => void; onFound: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [timeout, setTimeout_] = useState(5);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setDevices([]);
    try {
      const res = await fetch(apiUrl("/api/onvif/discover"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeout: timeout * 1000, user, pass }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setDevices(data.devices || []);
      setScanned(true);
    } catch (err: any) {
      setError(err.message || "Error de conexion");
      setScanned(true);
    } finally {
      setScanning(false);
    }
  }, [user, pass, timeout]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="relative rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", border: "1px solid rgba(255,255,255,0.08)", width: "min(560px, 90vw)", maxHeight: "80vh" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.12)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Descubrir Camaras ONVIF</h2>
              <p className="text-[10px] text-white/40">Escanear la red en busca de camaras</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#666" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="px-5 py-3 flex gap-3 items-end" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex-1">
            <label className="text-[10px] text-white/40 block mb-1">Usuario</label>
            <input type="text" value={user} onChange={(e) => setUser(e.target.value)} placeholder="admin" className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/20 focus:outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-white/40 block mb-1">Contrasena</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••" className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/20 focus:outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
          <div className="w-20">
            <label className="text-[10px] text-white/40 block mb-1">Timeout</label>
            <select value={timeout} onChange={(e) => setTimeout_(parseInt(e.target.value))} className="w-full rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <option value={3} style={{ background: "#1a1a2e" }}>3s</option>
              <option value={5} style={{ background: "#1a1a2e" }}>5s</option>
              <option value={10} style={{ background: "#1a1a2e" }}>10s</option>
            </select>
          </div>
          <button onClick={scan} disabled={scanning} className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2" style={{ background: "rgba(6,182,212,0.2)", border: "1px solid rgba(6,182,212,0.3)", color: "#06b6d4", opacity: scanning ? 0.6 : 1 }}>
            {scanning ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>}
            {scanning ? "Escaneando..." : "Escanear"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2" style={{ minHeight: "180px" }}>
          {!scanned && !scanning && (
            <div className="flex flex-col items-center justify-center py-10 text-white/20">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
              <p className="text-xs">Presiona "Escanear" para buscar camaras ONVIF</p>
            </div>
          )}
          {scanning && (
            <div className="flex flex-col items-center justify-center py-10">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" className="animate-pulse" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
              <p className="text-xs text-white/40 mt-3">Buscando dispositivos ONVIF...</p>
              <p className="text-[10px] text-white/20 mt-1">Hasta {timeout} segundos</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
          {scanned && !scanning && devices.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-8 text-white/25">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              <p className="text-xs">No se encontraron dispositivos ONVIF</p>
            </div>
          )}
          {devices.map((dev: any, i: number) => (
            <div key={`${dev.ip}-${i}`} className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="p-2 rounded-lg shrink-0" style={{ background: dev.connected ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dev.connected ? "#22c55e" : "#666"} strokeWidth="1.8" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white font-mono">{dev.ip}</span>
                  {dev.port !== 80 && <span className="text-[10px] text-white/30 font-mono">:{dev.port}</span>}
                  {dev.connected && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>Conectado</span>}
                </div>
                <div className="text-[10px] text-white/40 mt-0.5 truncate">{[dev.manufacturer, dev.model].filter(Boolean).join(" — ") || "Dispositivo ONVIF"}</div>
                {dev.streamUri && <div className="text-[9px] text-cyan-400/60 font-mono mt-0.5 truncate">{dev.streamUri}</div>}
              </div>
            </div>
          ))}
        </div>

        {scanned && (
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[10px] text-white/30">{devices.length} dispositivo{devices.length !== 1 ? "s" : ""} encontrado{devices.length !== 1 ? "s" : ""}</span>
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa" }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Map Selector Card ─────────────────────────
function MapCard({ map, onSelect }: { map: MapWithCameras; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="group relative rounded-2xl p-5 text-left transition-all duration-200 w-full"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,0.06)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(6,182,212,0.2)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(6,182,212,0.1)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[#ededed] truncate">{map.mapName}</h3>
          <p className="text-[11px] text-[#666] mt-0.5">
            {map.cameras.length} camara{map.cameras.length !== 1 ? "s" : ""} con stream
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {map.cameras.slice(0, 5).map((c) => (
              <span key={c.nodeId} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "#888" }}>
                {c.label}
              </span>
            ))}
            {map.cameras.length > 5 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "#555" }}>
                +{map.cameras.length - 5}
              </span>
            )}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" className="shrink-0 group-hover:translate-x-1 transition-transform">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────
export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/cameras"));
      const data = await res.json();
      if (data.error) setError(data.error);
      else setCameras(data.cameras || []);
    } catch (err: any) {
      setError(err.message || "Error cargando camaras");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchCameras();
  }, [isAuthenticated, fetchCameras]);

  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }
  if (!isAuthenticated) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  // Group cameras by map
  const mapsWithCameras: MapWithCameras[] = [];
  const mapIndex = new Map<string, MapWithCameras>();
  for (const cam of cameras) {
    let m = mapIndex.get(cam.mapId);
    if (!m) {
      m = { mapId: cam.mapId, mapName: cam.mapName, cameras: [] };
      mapIndex.set(cam.mapId, m);
      mapsWithCameras.push(m);
    }
    m.cameras.push(cam);
  }

  const cols = GRID_COLS[layout];

  // ── Map Selector View ──
  if (!selectedMap) {
    return (
      <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
        <header className="sticky top-0 z-50 px-6 py-4 flex items-center gap-4" style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Link href="/" className="flex items-center gap-2 text-[#888] hover:text-[#ededed] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            <span className="text-xs font-medium">Mapas</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            <h1 className="text-sm font-bold text-[#ededed]">Camaras</h1>
          </div>
          <div className="flex-1" />

          {/* ONVIF Discover button */}
          <button
            onClick={() => setShowOnvif(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
            style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", color: "#06b6d4" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,0.18)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,0.1)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
            Descubrir ONVIF
          </button>

          <button onClick={fetchCameras} className="h-8 w-8 rounded-xl flex items-center justify-center text-[#666] hover:text-[#ededed] hover:bg-white/5 transition-all" title="Actualizar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-8">
          <p className="text-sm text-[#666] mb-6">Selecciona un mapa para ver sus camaras en vivo</p>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" className="mb-3"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              <p className="text-sm text-[#888]">{error}</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" className="mb-3"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              <p className="text-sm text-[#666] mb-1">No hay camaras configuradas</p>
              <p className="text-xs text-[#444]">Agrega camaras desde el editor de mapas y configura un stream</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length > 0 && (
            <div className="space-y-3">
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
  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      <header className="sticky top-0 z-50 px-6 py-4 flex items-center gap-4" style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => setSelectedMap(null)} className="flex items-center gap-2 text-[#888] hover:text-[#ededed] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span className="text-xs font-medium">Clientes</span>
        </button>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
          <h1 className="text-sm font-bold text-[#ededed]">{selectedMap.mapName}</h1>
          <span className="text-[10px] text-[#555] font-mono ml-1">{selectedMap.cameras.length} camara{selectedMap.cameras.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex-1" />

        {/* ONVIF */}
        <button
          onClick={() => setShowOnvif(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
          style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", color: "#06b6d4" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,0.18)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,0.1)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
          Descubrir
        </button>

        {/* Grid layout */}
        <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          {(["1x1", "2x2", "3x3", "4x4"] as GridLayout[]).map((g) => (
            <button key={g} onClick={() => setLayout(g)} className="px-3 py-1.5 text-[10px] font-bold transition-all" style={{ background: layout === g ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.02)", color: layout === g ? "#60a5fa" : "#666", borderRight: g !== "4x4" ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              {g}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {selectedMap.cameras.map((cam) => (
            <CameraCell key={`${cam.mapId}-${cam.nodeId}`} camera={cam} onFullscreen={setFullscreenCam} />
          ))}
        </div>
      </main>

      {fullscreenCam && <FullscreenViewer camera={fullscreenCam} onClose={() => setFullscreenCam(null)} />}
      {showOnvif && <OnvifScanModal onClose={() => setShowOnvif(false)} onFound={fetchCameras} />}
      <style>{`@keyframes cam-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
