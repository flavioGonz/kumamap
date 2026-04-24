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

  // Snapshot double-buffer
  const [bufA, setBufA] = useState("");
  const [bufB, setBufB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const loadingRef = useRef(false);

  const getStreamSrc = useCallback((): string => {
    if (!camera.streamUrl) return "";
    switch (camera.streamType) {
      case "rtsp":
        return apiUrl(
          `/api/camera/rtsp-stream?url=${encodeURIComponent(camera.streamUrl)}&fps=${camera.rtspFps || 2}`
        );
      case "snapshot":
        return apiUrl(
          `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
        );
      case "mjpeg":
        return camera.streamUrl;
      default:
        return camera.streamUrl;
    }
  }, [camera]);

  // Snapshot polling
  useEffect(() => {
    if (camera.streamType !== "snapshot" || !camera.streamUrl) return;
    const ms = (camera.snapshotInterval || 2) * 1000;

    const firstUrl = apiUrl(
      `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
    );
    setBufA(firstUrl);
    setActiveBuf("a");

    const id = setInterval(() => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const nextUrl = apiUrl(
        `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
      );
      const img = new Image();
      img.onload = () => {
        loadingRef.current = false;
        setActiveBuf((prev) => {
          if (prev === "a") {
            setBufB(nextUrl);
            return "b";
          } else {
            setBufA(nextUrl);
            return "a";
          }
        });
        setLoading(false);
        setError(false);
      };
      img.onerror = () => {
        loadingRef.current = false;
      };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera]);

  return (
    <div
      className="relative group overflow-hidden rounded-2xl"
      style={{
        background: "#0d0d0d",
        border: "1px solid rgba(255,255,255,0.06)",
        aspectRatio: "16/9",
      }}
    >
      {/* Loading spinner */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            className="animate-spin mb-1"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          <span className="text-[9px] text-[#555]">Conectando...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(239,68,68,0.5)"
            strokeWidth="1.5"
            className="mb-2"
          >
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.5)" strokeWidth="2" />
          </svg>
          <p className="text-[10px] text-[#666]">Sin conexion</p>
        </div>
      )}

      {/* RTSP / MJPEG */}
      {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
        <img
          src={getStreamSrc()}
          alt={camera.label}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => {
            setLoading(false);
            setError(false);
          }}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      )}

      {/* Snapshot */}
      {camera.streamType === "snapshot" && (
        <>
          {bufA && (
            <img
              src={bufA}
              alt={camera.label}
              className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
              style={{ opacity: activeBuf === "a" ? 1 : 0 }}
              onLoad={() => {
                setLoading(false);
                setError(false);
              }}
            />
          )}
          {bufB && (
            <img
              src={bufB}
              alt={camera.label}
              className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
              style={{ opacity: activeBuf === "b" ? 1 : 0 }}
            />
          )}
        </>
      )}

      {/* iframe */}
      {camera.streamType === "iframe" && (
        <iframe
          src={camera.streamUrl}
          className="absolute inset-0 w-full h-full border-none"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => {
            setLoading(false);
            setError(false);
          }}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          allow="autoplay; fullscreen"
        />
      )}

      {/* Overlay: label + info */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 px-3 py-2 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          background: "linear-gradient(transparent 0%, rgba(0,0,0,0.85) 100%)",
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{
                background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e",
                boxShadow: error
                  ? "0 0 6px rgba(239,68,68,0.5)"
                  : loading
                    ? "0 0 6px rgba(245,158,11,0.5)"
                    : "0 0 6px rgba(34,197,94,0.5)",
                animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none",
              }}
            />
            <span className="text-[11px] font-bold text-white truncate">{camera.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-white/40 font-mono">{camera.ip}</span>
            <span className="text-[9px] text-white/30 uppercase">{camera.streamType}</span>
          </div>
        </div>

        {/* Fullscreen button */}
        <button
          onClick={() => onFullscreen(camera)}
          className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Pantalla completa"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* Always-visible label (top-left) */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 group-hover:opacity-0 transition-opacity">
        <div
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e",
            animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none",
          }}
        />
        <span
          className="text-[10px] font-semibold truncate max-w-[140px]"
          style={{ color: "rgba(255,255,255,0.7)", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
        >
          {camera.label}
        </span>
      </div>
    </div>
  );
}

// ─── Fullscreen Viewer ─────────────────────────
function FullscreenViewer({
  camera,
  onClose,
}: {
  camera: CameraInfo;
  onClose: () => void;
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
        return apiUrl(
          `/api/camera/rtsp-stream?url=${encodeURIComponent(camera.streamUrl)}&fps=${camera.rtspFps || 2}`
        );
      case "snapshot":
        return apiUrl(
          `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
        );
      case "mjpeg":
        return camera.streamUrl;
      default:
        return camera.streamUrl;
    }
  }, [camera]);

  useEffect(() => {
    if (camera.streamType !== "snapshot" || !camera.streamUrl) return;
    const ms = (camera.snapshotInterval || 2) * 1000;
    const firstUrl = apiUrl(
      `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
    );
    setBufA(firstUrl);
    setActiveBuf("a");

    const id = setInterval(() => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const nextUrl = apiUrl(
        `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
      );
      const img = new Image();
      img.onload = () => {
        loadingRef.current = false;
        setActiveBuf((prev) => {
          if (prev === "a") {
            setBufB(nextUrl);
            return "b";
          } else {
            setBufA(nextUrl);
            return "a";
          }
        });
        setLoading(false);
        setError(false);
      };
      img.onerror = () => {
        loadingRef.current = false;
      };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(0,0,0,0.9)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: error ? "#ef4444" : loading ? "#f59e0b" : "#22c55e",
              animation: !error && !loading ? "cam-pulse 2s ease-in-out infinite" : "none",
            }}
          />
          <div>
            <span className="text-sm font-bold text-white">{camera.label}</span>
            <span className="text-xs text-white/30 ml-3 font-mono">{camera.ip}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Stream */}
      <div className="flex-1 relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </div>
        )}

        {(camera.streamType === "rtsp" || camera.streamType === "mjpeg") && (
          <img
            src={getStreamSrc()}
            alt={camera.label}
            className="max-w-full max-h-full object-contain"
            style={{ display: error ? "none" : "block" }}
            onLoad={() => { setLoading(false); setError(false); }}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}

        {camera.streamType === "snapshot" && (
          <div className="relative w-full h-full flex items-center justify-center">
            {bufA && (
              <img src={bufA} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "a" ? 1 : 0, position: activeBuf === "a" ? "relative" : "absolute" }} onLoad={() => { setLoading(false); setError(false); }} />
            )}
            {bufB && (
              <img src={bufB} alt={camera.label} className="max-w-full max-h-full object-contain transition-opacity duration-300" style={{ opacity: activeBuf === "b" ? 1 : 0, position: activeBuf === "b" ? "relative" : "absolute" }} />
            )}
          </div>
        )}

        {camera.streamType === "iframe" && (
          <iframe src={camera.streamUrl} className="w-full h-full border-none" allow="autoplay; fullscreen" onLoad={() => { setLoading(false); setError(false); }} onError={() => { setLoading(false); setError(true); }} />
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" className="mb-3">
              <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
              <line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.5)" strokeWidth="2" />
            </svg>
            <p className="text-sm text-[#888]">Error de conexion</p>
            <button
              onClick={() => { setError(false); setLoading(true); }}
              className="mt-3 px-4 py-2 rounded-xl text-xs font-bold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: "rgba(0,0,0,0.9)" }}>
        <span className="text-[10px] text-[#444]">
          {camera.streamType === "rtsp" ? `RTSP · ${camera.rtspFps || 2} fps` :
            camera.streamType === "snapshot" ? `Snapshot · cada ${camera.snapshotInterval || 2}s` :
              camera.streamType === "mjpeg" ? "MJPEG directo" :
                camera.streamType === "iframe" ? "Embebido" : camera.streamType}
        </span>
        <span className="text-[10px] text-[#444]">{camera.mapName}</span>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────
export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<GridLayout>("2x2");
  const [fullscreenCam, setFullscreenCam] = useState<CameraInfo | null>(null);
  const [filterMap, setFilterMap] = useState<string>("all");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Check session
  useEffect(() => {
    const user = localStorage.getItem("kumamap_user");
    setIsAuthenticated(!!user);
  }, []);

  // Fetch cameras
  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/cameras"));
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCameras(data.cameras || []);
      }
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
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }

  // Unique map names for filter
  const mapNames = Array.from(new Set(cameras.map((c) => c.mapName)));
  const filtered = filterMap === "all" ? cameras : cameras.filter((c) => c.mapName === filterMap);
  const cols = GRID_COLS[layout];

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 px-6 py-4 flex items-center gap-4"
        style={{
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-[#888] hover:text-[#ededed] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-xs font-medium">Mapas</span>
        </Link>

        <div className="h-4 w-px bg-white/10" />

        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
          </svg>
          <h1 className="text-sm font-bold text-[#ededed]">Camaras</h1>
          {!loading && (
            <span className="text-[10px] text-[#555] font-mono ml-1">
              {filtered.length} de {cameras.length}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Map filter */}
        {mapNames.length > 1 && (
          <select
            value={filterMap}
            onChange={(e) => setFilterMap(e.target.value)}
            className="h-8 rounded-xl px-3 text-[11px] text-[#ededed] focus:outline-none cursor-pointer"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <option value="all" style={{ background: "#141414" }}>Todos los mapas</option>
            {mapNames.map((name) => (
              <option key={name} value={name} style={{ background: "#141414" }}>{name}</option>
            ))}
          </select>
        )}

        {/* Grid layout selector */}
        <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          {(["1x1", "2x2", "3x3", "4x4"] as GridLayout[]).map((g) => (
            <button
              key={g}
              onClick={() => setLayout(g)}
              className="px-3 py-1.5 text-[10px] font-bold transition-all"
              style={{
                background: layout === g ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.02)",
                color: layout === g ? "#60a5fa" : "#666",
                borderRight: g !== "4x4" ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={() => {
            setLoading(true);
            fetchCameras();
          }}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-[#666] hover:text-[#ededed] hover:bg-white/5 transition-all"
          title="Actualizar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </header>

      {/* ── Content ── */}
      <main className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" className="mb-3">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
            <p className="text-sm text-[#888]">{error}</p>
          </div>
        )}

        {!loading && !error && cameras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" className="mb-3">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
            <p className="text-sm text-[#666] mb-1">No hay camaras configuradas</p>
            <p className="text-xs text-[#444]">
              Agrega camaras desde el editor de mapas con el icono de camara y configura un stream
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
            }}
          >
            {filtered.map((cam) => (
              <CameraCell
                key={`${cam.mapId}-${cam.nodeId}`}
                camera={cam}
                onFullscreen={setFullscreenCam}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Fullscreen ── */}
      {fullscreenCam && (
        <FullscreenViewer
          camera={fullscreenCam}
          onClose={() => setFullscreenCam(null)}
        />
      )}

      <style>{`
        @keyframes cam-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}
