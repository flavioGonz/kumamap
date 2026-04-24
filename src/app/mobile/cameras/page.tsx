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

type MobileGrid = "1" | "2" | "4";

// ─── Camera Cell ───────────────────────────────
function MobileCameraCell({ camera }: { camera: CameraInfo }) {
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

  return (
    <Link
      href={`/mobile/camera?mapId=${camera.mapId}&nodeId=${camera.nodeId}`}
      className="relative block overflow-hidden rounded-2xl active:scale-[0.98] transition-transform"
      style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", aspectRatio: "16/9" }}
    >
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.5)" strokeWidth="2" /></svg>
          <p className="text-[9px] text-[#555] mt-1">Sin conexion</p>
        </div>
      )}
      {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
        <img src={getStreamSrc()} alt={camera.label} className="absolute inset-0 w-full h-full object-contain" style={{ display: error ? "none" : "block" }} onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />
      )}
      {camera.streamType === "snapshot" && (
        <>
          {bufA && <img src={bufA} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "a" ? 1 : 0 }} onLoad={() => { setLoading(false); setError(false); }} />}
          {bufB && <img src={bufB} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />}
        </>
      )}
      {camera.streamType === "iframe" && (
        <iframe src={camera.streamUrl} className="absolute inset-0 w-full h-full border-none pointer-events-none" allow="autoplay" onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />
      )}
      <div className="absolute inset-x-0 bottom-0 z-20 px-2.5 py-2" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e", animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none" }} />
          <span className="text-[10px] font-bold text-white truncate">{camera.label}</span>
          <span className="text-[8px] text-white/30 uppercase ml-auto shrink-0">{camera.streamType}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Map Card (mobile) ─────────────────────────
function MobileMapCard({ map, onSelect }: { map: MapWithCameras; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(6,182,212,0.1)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[#ededed] truncate">{map.mapName}</h3>
          <p className="text-[10px] text-[#666] mt-0.5">{map.cameras.length} camara{map.cameras.length !== 1 ? "s" : ""}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" className="shrink-0"><polyline points="9 18 15 12 9 6" /></svg>
      </div>
      {map.cameras.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5 ml-[52px]">
          {map.cameras.slice(0, 4).map((c) => (
            <span key={c.nodeId} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "#888" }}>{c.label}</span>
          ))}
          {map.cameras.length > 4 && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "#555" }}>+{map.cameras.length - 4}</span>}
        </div>
      )}
    </button>
  );
}

// ─── Main Page ─────────────────────────────────
export default function MobileCamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState<MapWithCameras | null>(null);
  const [grid, setGrid] = useState<MobileGrid>("2");

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/cameras"));
      const data = await res.json();
      if (data.error) setError(data.error);
      else setCameras(data.cameras || []);
    } catch (err: any) {
      setError(err.message || "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCameras(); }, [fetchCameras]);

  // Group by map
  const mapsWithCameras: MapWithCameras[] = [];
  const mapIndex = new Map<string, MapWithCameras>();
  for (const cam of cameras) {
    let m = mapIndex.get(cam.mapId);
    if (!m) { m = { mapId: cam.mapId, mapName: cam.mapName, cameras: [] }; mapIndex.set(cam.mapId, m); mapsWithCameras.push(m); }
    m.cameras.push(cam);
  }

  // ── Map Selector ──
  if (!selectedMap) {
    return (
      <div className="min-h-screen pb-28" style={{ background: "#0a0a0a" }}>
        <header className="sticky top-0 z-50 px-4 pt-3 pb-2" style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,182,212,0.1)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            </div>
            <div className="flex-1">
              <h1 className="text-sm font-bold text-[#ededed]">Camaras</h1>
              <span className="text-[10px] text-[#555]">Selecciona un cliente</span>
            </div>
            <button onClick={fetchCameras} className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", color: "#666" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
            </button>
          </div>
        </header>

        <main className="px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" className="mb-2"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              <p className="text-xs text-[#888]">{error}</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" className="mb-2"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              <p className="text-xs text-[#666]">No hay camaras configuradas</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length > 0 && (
            <div className="space-y-2.5">
              {mapsWithCameras.map((m) => (
                <MobileMapCard key={m.mapId} map={m} onSelect={() => setSelectedMap(m)} />
              ))}
            </div>
          )}
        </main>

        <style>{`@keyframes cam-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    );
  }

  // ── Camera Grid ──
  return (
    <div className="min-h-screen pb-28" style={{ background: "#0a0a0a" }}>
      <header className="sticky top-0 z-50 px-4 pt-3 pb-2" style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setSelectedMap(null)} className="h-8 w-8 rounded-xl flex items-center justify-center active:scale-95" style={{ background: "rgba(255,255,255,0.04)", color: "#888" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-[#ededed] truncate">{selectedMap.mapName}</h1>
            <span className="text-[10px] text-[#555]">{selectedMap.cameras.length} camara{selectedMap.cameras.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Grid selector */}
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            {(["1", "2", "4"] as MobileGrid[]).map((g) => (
              <button key={g} onClick={() => setGrid(g)} className="px-2.5 py-1 text-[9px] font-bold transition-all" style={{ background: grid === g ? "rgba(6,182,212,0.15)" : "transparent", color: grid === g ? "#06b6d4" : "#555", borderRight: g !== "4" ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                {g === "1" ? "1x1" : g === "2" ? "1x2" : "2x2"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="px-3 py-3">
        <div className="grid gap-2.5" style={{ gridTemplateColumns: grid === "1" ? "1fr" : grid === "2" ? "1fr" : "1fr 1fr" }}>
          {selectedMap.cameras.map((cam) => (
            <MobileCameraCell key={`${cam.mapId}-${cam.nodeId}`} camera={cam} />
          ))}
        </div>
      </main>

      <style>{`@keyframes cam-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
