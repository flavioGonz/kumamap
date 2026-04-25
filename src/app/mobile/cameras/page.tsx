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

// ─── NVR Cell (mobile) ─────────────────────────
function MobileNvrCell({ camera, label, onTap }: { camera: CameraInfo; label: string; onTap: () => void }) {
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

  return (
    <div
      className="relative overflow-hidden"
      onClick={hasStream ? onTap : undefined}
      style={{ background: "#000", border: "1px solid #1a1a1a" }}
    >
      {/* Channel label */}
      <div className="absolute top-0 left-0 z-30">
        <span className="text-[9px] font-bold px-1 py-0.5" style={{ background: "rgba(0,0,0,0.7)", color: "#06b6d4", fontFamily: "monospace" }}>
          {label}
        </span>
      </div>

      {/* Status */}
      <div className="absolute top-1 right-1.5 z-30">
        {hasStream && !error && !loading && (
          <div className="flex items-center gap-0.5">
            <div className="h-1 w-1 rounded-full" style={{ background: "#22c55e", animation: "nvr-rec 2s ease-in-out infinite" }} />
            <span className="text-[7px] font-bold text-green-500 font-mono">REC</span>
          </div>
        )}
        {hasStream && error && <span className="text-[7px] font-bold text-red-500 font-mono">ERR</span>}
      </div>

      {/* Loading */}
      {hasStream && loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="h-5 w-5 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
        </div>
      )}

      {/* Placeholder */}
      {isPlaceholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "#0a0a0a" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="#333" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* Error */}
      {hasStream && error && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: "#0a0a0a" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* Stream */}
      {hasStream && (camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
        <img src={getStreamSrc()} alt={camera.label} className="absolute inset-0 w-full h-full object-cover"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}
      {hasStream && camera.streamType === "snapshot" && (
        <>
          {bufA && <img src={bufA} alt={camera.label} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500" style={{ opacity: activeBuf === "a" ? 1 : 0 }} onLoad={() => { setLoading(false); setError(false); }} />}
          {bufB && <img src={bufB} alt={camera.label} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />}
        </>
      )}
      {hasStream && camera.streamType === "iframe" && (
        <iframe src={camera.streamUrl} className="absolute inset-0 w-full h-full border-none pointer-events-none" allow="autoplay"
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}

      {/* Bottom label */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-1.5 py-0.5" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>
        <span className="text-[9px] font-semibold text-white/60 truncate font-mono">{camera.label}</span>
        <span className="text-[8px] text-white/25 shrink-0 font-mono">{camera.ip}</span>
      </div>
    </div>
  );
}

// ─── Fullscreen Viewer (mobile) ────────────────
function MobileFullscreen({ camera, label, onClose }: { camera: CameraInfo; label: string; onClose: () => void }) {
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
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ background: "#111", borderBottom: "1px solid #222" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-1.5 py-0.5" style={{ background: "#06b6d4", color: "#000", fontFamily: "monospace" }}>{label}</span>
          <span className="text-xs font-bold text-white/80 font-mono truncate">{camera.label}</span>
          {!error && !loading && (
            <div className="flex items-center gap-0.5 ml-1">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#22c55e", animation: "nvr-rec 2s ease-in-out infinite" }} />
              <span className="text-[8px] font-bold text-green-500 font-mono">LIVE</span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 text-white/40 active:text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="flex-1 relative flex items-center justify-center">
        {loading && !error && <div className="absolute inset-0 flex items-center justify-center z-10"><div className="h-8 w-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" /></div>}
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
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
              <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
              <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="2" />
            </svg>
            <p className="text-xs text-white/20 mt-2 font-mono">NO SIGNAL</p>
          </div>
        )}
      </div>
      <div className="px-3 py-1 flex items-center justify-between shrink-0" style={{ background: "#111", borderTop: "1px solid #222" }}>
        <span className="text-[9px] text-white/20 font-mono">{camera.streamType?.toUpperCase()} · {camera.ip}</span>
      </div>
    </div>
  );
}

// ─── Map Card (mobile) ─────────────────────────
function MobileMapCard({ map, onSelect }: { map: MapWithCameras; onSelect: () => void }) {
  const activeStreams = map.cameras.filter((c) => c.streamUrl && c.streamType !== "nvr").length;
  const nvrCount = map.cameras.filter((c) => c.source === "nvr").length;
  const isEmpty = map.cameras.length === 0;

  const content = (
    <div className="px-3 py-2.5 flex items-center gap-3">
      <div className="h-9 w-9 flex items-center justify-center shrink-0" style={{ background: isEmpty ? "#111" : "#0a2a2a", border: `1px solid ${isEmpty ? "#1a1a1a" : "#164e4e"}` }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isEmpty ? "#333" : "#06b6d4"} strokeWidth="1.5" strokeLinecap="round">
          <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`text-[13px] font-bold truncate font-mono ${isEmpty ? "text-white/30" : "text-white/85"}`}>{map.mapName}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          {activeStreams > 0 && <span className="text-[10px] text-cyan-400/50 font-mono">{activeStreams} LIVE</span>}
          {nvrCount > 0 && <span className="text-[10px] text-purple-400/40 font-mono">{nvrCount} NVR</span>}
          {isEmpty && <span className="text-[10px] text-white/15 font-mono">NO CAMERAS</span>}
        </div>
      </div>
      {!isEmpty && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18" /></svg>}
    </div>
  );

  if (isEmpty) {
    return <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", opacity: 0.5 }}>{content}</div>;
  }

  return (
    <button onClick={onSelect} className="w-full text-left active:scale-[0.98] transition-transform" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
      {content}
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
  const [cameraOrder, setCameraOrder] = useState<CameraInfo[]>([]);
  const [fullscreenCam, setFullscreenCam] = useState<{ cam: CameraInfo; label: string } | null>(null);

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

  useEffect(() => {
    if (selectedMap) setCameraOrder(selectedMap.cameras);
  }, [selectedMap]);

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
      <div className="min-h-screen pb-28 bg-black">
        <header className="sticky top-0 z-50 px-4 py-2.5" style={{ background: "#0a0a0a", borderBottom: "1px solid #1a1a1a", paddingTop: "max(10px, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            <h1 className="text-sm font-bold text-white/90 font-mono flex-1">CAMERAS</h1>
            <button onClick={fetchCameras} className="h-7 w-7 flex items-center justify-center text-white/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
            </button>
          </div>
        </header>

        <main className="px-3 py-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-xs text-red-400/60 font-mono">{error}</p>
            </div>
          )}
          {!loading && !error && mapsWithCameras.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-xs text-white/25 font-mono">NO MAPS</p>
            </div>
          )}
          {!loading && !error && mapsWithCameras.length > 0 && (
            <div className="space-y-1">
              {mapsWithCameras.map((m) => (
                <MobileMapCard key={m.mapId} map={m} onSelect={() => setSelectedMap(m)} />
              ))}
            </div>
          )}
        </main>
        <style>{`@keyframes nvr-rec { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    );
  }

  // ── Camera Grid — NVR Style ──
  const gridCols = grid === "1" ? 1 : grid === "2" ? 1 : 2;
  const rows = Math.ceil(cameraOrder.length / gridCols);

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden">
      {/* NVR header */}
      <header className="shrink-0 px-3 py-1.5 flex items-center gap-2" style={{ background: "#111", borderBottom: "1px solid #222", paddingTop: "max(6px, env(safe-area-inset-top))" }}>
        <button onClick={() => setSelectedMap(null)} className="p-1 text-white/30 active:text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
        <h1 className="text-[11px] font-bold text-white/85 truncate font-mono flex-1">{selectedMap.mapName}</h1>
        <span className="text-[9px] text-cyan-400/50 font-mono">{cameraOrder.filter((c) => c.streamUrl && c.streamType !== "nvr").length} live</span>
        <div className="flex items-center ml-1" style={{ border: "1px solid #333" }}>
          {(["1", "2", "4"] as MobileGrid[]).map((g) => (
            <button key={g} onClick={() => setGrid(g)} className="px-1.5 py-0.5 text-[9px] font-bold font-mono transition-all"
              style={{ background: grid === g ? "#06b6d4" : "transparent", color: grid === g ? "#000" : "#555", borderRight: g !== "4" ? "1px solid #333" : "none" }}>
              {g === "1" ? "1" : g === "2" ? "2" : "4"}
            </button>
          ))}
        </div>
      </header>

      {/* Grid */}
      <main className="flex-1 overflow-hidden">
        {cameraOrder.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            <p className="text-xs text-white/20 mt-2 font-mono">NO CAMERAS</p>
          </div>
        ) : (
          <div
            className="w-full h-full grid"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gap: "1px",
              background: "#1a1a1a",
            }}
          >
            {cameraOrder.map((cam, idx) => (
              <MobileNvrCell
                key={cam.nodeId}
                camera={cam}
                label={`CH${String(idx + 1).padStart(2, "0")}`}
                onTap={() => setFullscreenCam({ cam, label: `CH${String(idx + 1).padStart(2, "0")}` })}
              />
            ))}
          </div>
        )}
      </main>

      {fullscreenCam && (
        <MobileFullscreen camera={fullscreenCam.cam} label={fullscreenCam.label} onClose={() => setFullscreenCam(null)} />
      )}
      <style>{`@keyframes nvr-rec { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
