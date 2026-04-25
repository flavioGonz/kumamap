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
  const hasStream = camera.streamUrl && camera.streamType && camera.streamType !== "nvr";

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
    if (!hasStream) { setLoading(false); return; }
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
  }, [camera, hasStream]);

  const isPlaceholder = !hasStream;

  // Placeholder state
  if (isPlaceholder) {
    return (
      <div
        className="relative block overflow-hidden"
        style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "12px", aspectRatio: "16/9" }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" strokeLinecap="round">
            {camera.source === "nvr" ? (
              <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" /><path d="M2 10h20" /></>
            ) : (
              <><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></>
            )}
          </svg>
          <p className="text-[9px] text-white/20 mt-1">{camera.source === "nvr" ? "NVR sin canales" : "Sin stream"}</p>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-20 px-2.5 py-1.5" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#555]" />
            <span className="text-[9px] font-semibold text-white/50 truncate">{camera.label}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/mobile/camera?mapId=${camera.mapId}&nodeId=${camera.nodeId}`}
      className="relative block overflow-hidden active:scale-[0.98] transition-transform"
      style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "12px", aspectRatio: "16/9" }}
    >
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="h-6 w-6 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.4)" strokeWidth="2" /></svg>
          <p className="text-[8px] text-white/20 mt-1">Sin señal</p>
        </div>
      )}
      {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
        <img src={getStreamSrc()} alt={camera.label} className="absolute inset-0 w-full h-full object-contain" style={{ display: error ? "none" : "block" }} onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />
      )}
      {camera.streamType === "snapshot" && (
        <>
          {bufA && <img src={bufA} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-500" style={{ opacity: activeBuf === "a" ? 1 : 0 }} onLoad={() => { setLoading(false); setError(false); }} />}
          {bufB && <img src={bufB} alt={camera.label} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-500" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />}
        </>
      )}
      {camera.streamType === "iframe" && (
        <iframe src={camera.streamUrl} className="absolute inset-0 w-full h-full border-none pointer-events-none" allow="autoplay" onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />
      )}
      <div className="absolute inset-x-0 bottom-0 z-20 px-2.5 py-1.5" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e", animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none" }} />
          <span className="text-[9px] font-semibold text-white/70 truncate">{camera.label}</span>
          {camera.source === "nvr" && <span className="text-[7px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-300/60 font-bold shrink-0">NVR</span>}
          <span className="text-[7px] text-white/20 uppercase ml-auto shrink-0">{camera.streamType}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Map Card (mobile) ─────────────────────────
function MobileMapCard({ map, onSelect }: { map: MapWithCameras; onSelect: () => void }) {
  const activeStreams = map.cameras.filter((c) => c.streamUrl && c.streamType !== "nvr").length;
  const nvrCount = map.cameras.filter((c) => c.source === "nvr").length;
  const isEmpty = map.cameras.length === 0;

  const cardContent = (
    <div className="p-3.5 flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{
        background: isEmpty ? "rgba(255,255,255,0.03)" : activeStreams > 0 ? "rgba(6,182,212,0.08)" : "rgba(139,92,246,0.08)",
      }}>
        {isEmpty ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8m-4-4h8" /></svg>
        ) : nvrCount > 0 && activeStreams === 0 ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`text-[13px] font-semibold truncate ${isEmpty ? "text-white/40" : "text-white/85"}`}>{map.mapName}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          {activeStreams > 0 && <span className="text-[10px] text-cyan-400/40">{activeStreams} live</span>}
          {nvrCount > 0 && <span className="text-[10px] text-purple-400/40">{nvrCount} NVR</span>}
          {isEmpty && <span className="text-[10px] text-white/20">Sin cámaras</span>}
        </div>
      </div>
      {!isEmpty && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" className="shrink-0"><polyline points="9 18 15 12 9 6" /></svg>
      )}
    </div>
  );

  // Empty maps: non-clickable informational card with muted styling
  if (isEmpty) {
    return (
      <div
        className="w-full text-left"
        style={{ background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "14px", opacity: 0.6 }}
      >
        {cardContent}
      </div>
    );
  }

  // Maps with cameras: clickable with tap effect
  return (
    <button
      onClick={onSelect}
      className="w-full text-left active:scale-[0.98] transition-transform"
      style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "14px" }}
    >
      {cardContent}
    </button>
  );
}

// ─── Main Page ─────────────────────────────────
export default function MobileCamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [allMaps, setAllMaps] = useState<MapInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState<MapWithCameras | null>(null);
  const [grid, setGrid] = useState<MobileGrid>("2");

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
    } catch (err: any) { setError(err.message || "Error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCameras(); }, [fetchCameras]);

  // Build maps with cameras — include ALL maps
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

  // ── Map Selector ──
  if (!selectedMap) {
    return (
      <div className="min-h-screen pb-28" style={{ background: "#0a0a0a" }}>
        <header className="sticky top-0 z-50 px-4 pt-3 pb-2" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,182,212,0.08)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            </div>
            <div className="flex-1">
              <h1 className="text-sm font-semibold text-white/90">Cámaras</h1>
              <span className="text-[10px] text-white/25">Selecciona un cliente</span>
            </div>
            <button onClick={fetchCameras} className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)", color: "#555" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
            </button>
          </div>
        </header>

        <main className="px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" className="mb-2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              <p className="text-xs text-white/30">{error}</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" className="mb-2"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
              <p className="text-xs text-white/25">No hay mapas</p>
            </div>
          )}

          {!loading && !error && mapsWithCameras.length > 0 && (
            <div className="space-y-2">
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
  const activeCameras = selectedMap.cameras.filter((c) => c.streamUrl && c.streamType !== "nvr");
  const inactiveCameras = selectedMap.cameras.filter((c) => !c.streamUrl || c.streamType === "nvr");

  return (
    <div className="min-h-screen pb-28" style={{ background: "#0a0a0a" }}>
      <header className="sticky top-0 z-50 px-4 pt-3 pb-2" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setSelectedMap(null)} className="h-8 w-8 rounded-lg flex items-center justify-center active:scale-95 shrink-0" style={{ background: "rgba(255,255,255,0.03)", color: "#666" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-semibold text-white/85 truncate">{selectedMap.mapName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {activeCameras.length > 0 && <span className="text-[9px] text-cyan-400/40">{activeCameras.length} live</span>}
              {inactiveCameras.length > 0 && <span className="text-[9px] text-white/20">{inactiveCameras.length} offline</span>}
              {selectedMap.cameras.length === 0 && <span className="text-[9px] text-white/20">Sin cámaras</span>}
            </div>
          </div>
          {/* Grid selector */}
          <div className="flex items-center rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
            {(["1", "2", "4"] as MobileGrid[]).map((g) => (
              <button key={g} onClick={() => setGrid(g)} className="px-2 py-1 text-[9px] font-semibold transition-all" style={{ background: grid === g ? "rgba(6,182,212,0.12)" : "transparent", color: grid === g ? "#06b6d4" : "#555", borderRight: g !== "4" ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                {g === "1" ? "1x1" : g === "2" ? "1x2" : "2x2"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="px-3 py-3">
        {/* Empty map */}
        {selectedMap.cameras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" className="mb-3"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><path d="M12 10v4m-2-2h4" /></svg>
            <p className="text-xs text-white/30 mb-1">Sin cámaras</p>
            <p className="text-[10px] text-white/15">Agrega cámaras desde el editor de mapas</p>
          </div>
        )}

        {/* Active cameras grid */}
        {activeCameras.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: grid === "1" ? "1fr" : grid === "2" ? "1fr" : "1fr 1fr" }}>
            {activeCameras.map((cam) => (
              <MobileCameraCell key={cam.nodeId} camera={cam} />
            ))}
          </div>
        )}

        {/* Inactive cameras */}
        {inactiveCameras.length > 0 && activeCameras.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-[9px] text-white/15 font-medium">Sin stream ({inactiveCameras.length})</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {inactiveCameras.map((cam) => (
                <MobileCameraCell key={cam.nodeId} camera={cam} />
              ))}
            </div>
          </div>
        )}

        {inactiveCameras.length > 0 && activeCameras.length === 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: grid === "1" ? "1fr" : grid === "2" ? "1fr" : "1fr 1fr" }}>
            {inactiveCameras.map((cam) => (
              <MobileCameraCell key={cam.nodeId} camera={cam} />
            ))}
          </div>
        )}
      </main>

      <style>{`@keyframes cam-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
