"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { hapticTap } from "@/lib/haptics";

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

type GridLayout = "1x1" | "2x2" | "grid";

// ─── Camera Cell (UniFi Protect style) ────────────────
function CameraCell({
  camera,
  onTap,
  compact,
}: {
  camera: CameraInfo;
  onTap: () => void;
  compact: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bufA, setBufA] = useState("");
  const [bufB, setBufB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const loadingRef = useRef(false);
  const hasStream =
    camera.streamUrl && camera.streamType && camera.streamType !== "nvr";

  // On mobile, RTSP uses snapshot polling (Safari doesn't support MJPEG multipart/x-mixed-replace).
  // The /api/camera/snapshot endpoint already supports RTSP URLs via ffmpeg single-frame capture.
  const useSnapshotPolling = camera.streamType === "rtsp" || camera.streamType === "snapshot";

  const getSnapshotUrl = useCallback((): string => {
    if (!camera.streamUrl) return "";
    return apiUrl(
      `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
    );
  }, [camera]);

  const getStreamSrc = useCallback((): string => {
    if (!camera.streamUrl) return "";
    // For non-polled types (mjpeg, iframe) return direct URL
    if (camera.streamType === "mjpeg") return camera.streamUrl;
    return camera.streamUrl;
  }, [camera]);

  // Snapshot double-buffer polling — used for both "snapshot" AND "rtsp" on mobile
  useEffect(() => {
    if (!hasStream) {
      setLoading(false);
      return;
    }
    if (!useSnapshotPolling || !camera.streamUrl) return;
    // RTSP snapshots via ffmpeg take ~2-5s, so poll interval must be longer
    const ms = camera.streamType === "rtsp"
      ? Math.max((camera.snapshotInterval || 4) * 1000, 4000)
      : (camera.snapshotInterval || 2) * 1000;
    setBufA(getSnapshotUrl());
    setActiveBuf("a");
    const id = setInterval(() => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const nextUrl = getSnapshotUrl();
      const img = new Image();
      img.onload = () => {
        loadingRef.current = false;
        setActiveBuf((p) => {
          if (p === "a") {
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
        setError(true);
        setLoading(false);
      };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera, hasStream, useSnapshotPolling, getSnapshotUrl]);

  const isPlaceholder = !hasStream;

  return (
    <div
      className="relative overflow-hidden bg-black"
      onClick={hasStream ? onTap : undefined}
      style={{ aspectRatio: "16/9" }}
    >
      {/* Loading spinner */}
      {hasStream && loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
        </div>
      )}

      {/* Placeholder — no stream configured */}
      {isPlaceholder && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{ background: "#111" }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#333"
            strokeWidth="1.5"
          >
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
          </svg>
          {!compact && (
            <span className="text-[10px] text-white/20 mt-1.5">
              Sin stream
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {hasStream && error && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{ background: "#111" }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
          >
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="2" />
          </svg>
          {!compact && (
            <span className="text-[10px] text-red-400/60 mt-1.5">
              Sin señal
            </span>
          )}
        </div>
      )}

      {/* Snapshot-polled streams (RTSP + snapshot) — double-buffer crossfade */}
      {hasStream && useSnapshotPolling && (
        <>
          {bufA && (
            <img
              src={bufA}
              alt={camera.label}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
              style={{ opacity: activeBuf === "a" ? 1 : 0 }}
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
          {bufB && (
            <img
              src={bufB}
              alt={camera.label}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
              style={{ opacity: activeBuf === "b" ? 1 : 0 }}
            />
          )}
        </>
      )}

      {/* Direct MJPEG stream (works on desktop, may not work on all mobile browsers) */}
      {hasStream && camera.streamType === "mjpeg" && (
        <img
          src={getStreamSrc()}
          alt={camera.label}
          className="absolute inset-0 w-full h-full object-cover"
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

      {/* Iframe stream */}
      {hasStream && camera.streamType === "iframe" && (
        <iframe
          src={camera.streamUrl}
          className="absolute inset-0 w-full h-full border-none pointer-events-none"
          allow="autoplay"
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

      {/* Bottom gradient overlay with camera name — UniFi Protect style */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 px-2.5 pb-2 pt-6"
        style={{
          background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
        }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-semibold text-white/90 truncate"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
          >
            {camera.label}
          </span>
          {hasStream && !error && !loading && (
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "#22c55e",
                  boxShadow: "0 0 4px rgba(34,197,94,0.6)",
                  animation: "pulse-dot 2s ease-in-out infinite",
                }}
              />
              <span className="text-[9px] font-bold text-green-400/80">
                LIVE
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Top-right status for errors */}
      {hasStream && error && (
        <div className="absolute top-1.5 right-2 z-30">
          <span className="text-[8px] font-bold text-red-400 bg-black/60 px-1.5 py-0.5 rounded">
            OFFLINE
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Fullscreen Viewer ────────────────────────
function FullscreenViewer({
  camera,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  camera: CameraInfo;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bufA, setBufA] = useState("");
  const [bufB, setBufB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const loadingRef = useRef(false);
  const touchStartX = useRef<number | null>(null);

  const useSnapshotPolling = camera.streamType === "rtsp" || camera.streamType === "snapshot";

  const getSnapshotUrl = useCallback((): string => {
    if (!camera.streamUrl) return "";
    return apiUrl(
      `/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`
    );
  }, [camera]);

  const getStreamSrc = useCallback((): string => {
    if (!camera.streamUrl) return "";
    if (camera.streamType === "mjpeg") return camera.streamUrl;
    return camera.streamUrl;
  }, [camera]);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setBufA("");
    setBufB("");
    if (!useSnapshotPolling || !camera.streamUrl) return;
    // RTSP snapshots take longer, use 4s+ interval
    const ms = camera.streamType === "rtsp"
      ? Math.max((camera.snapshotInterval || 3) * 1000, 3000)
      : (camera.snapshotInterval || 2) * 1000;
    const firstUrl = getSnapshotUrl();
    setBufA(firstUrl);
    setActiveBuf("a");
    const id = setInterval(() => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const nextUrl = getSnapshotUrl();
      const img = new Image();
      img.onload = () => {
        loadingRef.current = false;
        setActiveBuf((p) => {
          if (p === "a") {
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
        setError(true);
        setLoading(false);
      };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera, useSnapshotPolling, getSnapshotUrl]);

  // Swipe left/right to navigate cameras
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0 && hasPrev) { hapticTap(); onPrev(); }
      if (diff < 0 && hasNext) { hapticTap(); onNext(); }
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingBottom: "8px",
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(12px)",
        }}
      >
        <button
          onClick={onClose}
          className="p-1.5 -ml-1.5 active:opacity-50"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="text-center flex-1 min-w-0 px-3">
          <p className="text-[13px] font-semibold text-white truncate">
            {camera.label}
          </p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            {!error && !loading && (
              <div className="flex items-center gap-1">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "#22c55e",
                    boxShadow: "0 0 6px rgba(34,197,94,0.5)",
                  }}
                />
                <span className="text-[10px] text-green-400/80 font-medium">
                  En vivo
                </span>
              </div>
            )}
            <span className="text-[10px] text-white/30">
              {camera.streamType?.toUpperCase()} · {camera.ip}
            </span>
          </div>
        </div>
        <div className="w-8" /> {/* Spacer for centering */}
      </div>

      {/* Stream area */}
      <div className="flex-1 relative flex items-center justify-center">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
          </div>
        )}
        {/* Snapshot-polled streams (RTSP + snapshot) — double-buffer */}
        {useSnapshotPolling && (
          <div className="relative w-full h-full flex items-center justify-center">
            {bufA && (
              <img
                src={bufA}
                alt={camera.label}
                className="max-w-full max-h-full object-contain transition-opacity duration-700"
                style={{
                  opacity: activeBuf === "a" ? 1 : 0,
                  position: activeBuf === "a" ? "relative" : "absolute",
                }}
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
            {bufB && (
              <img
                src={bufB}
                alt={camera.label}
                className="max-w-full max-h-full object-contain transition-opacity duration-700"
                style={{
                  opacity: activeBuf === "b" ? 1 : 0,
                  position: activeBuf === "b" ? "relative" : "absolute",
                }}
              />
            )}
          </div>
        )}
        {/* Direct MJPEG */}
        {camera.streamType === "mjpeg" && (
          <img
            src={getStreamSrc()}
            alt={camera.label}
            className="max-w-full max-h-full object-contain"
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
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#333"
              strokeWidth="1.5"
            >
              <path d="m22 8-6 4 6 4V8Z" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
              <line
                x1="2"
                y1="2"
                x2="22"
                y2="22"
                stroke="#ef4444"
                strokeWidth="2"
              />
            </svg>
            <p className="text-sm text-white/25 mt-3">Sin señal</p>
          </div>
        )}

        {/* Swipe arrows */}
        {hasPrev && (
          <button
            onClick={() => { hapticTap(); onPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full active:bg-white/10"
            style={{ background: "rgba(0,0,0,0.4)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => { hapticTap(); onNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full active:bg-white/10"
            style={{ background: "rgba(0,0,0,0.4)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18" /></svg>
          </button>
        )}
      </div>

      {/* Bottom info bar */}
      <div
        className="shrink-0 px-4 py-3 flex items-center justify-between"
        style={{
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(12px)",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30">{camera.manufacturer || "Cámara"}</span>
          <span className="text-[10px] text-white/15">·</span>
          <span className="text-[10px] text-white/30">{camera.ip}</span>
        </div>
        <span className="text-[10px] text-white/20">
          Deslizar para cambiar
        </span>
      </div>
    </div>
  );
}

// ─── Main Page — UniFi Protect Style ──────────
export default function MobileCamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [allMaps, setAllMaps] = useState<MapInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [grid, setGrid] = useState<GridLayout>("2x2");
  const [fullscreenIdx, setFullscreenIdx] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/cameras"));
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        const cams: CameraInfo[] = data.cameras || [];
        const maps: MapInfo[] = data.maps || [];
        setCameras(cams);
        setAllMaps(maps);
        // Auto-select first map with cameras
        if (!selectedMapId) {
          const firstWithCams = maps.find((m) =>
            cams.some((c) => c.mapId === m.mapId)
          );
          if (firstWithCams) setSelectedMapId(firstWithCams.mapId);
          else if (maps.length > 0) setSelectedMapId(maps[0].mapId);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [selectedMapId]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const selectedMap = allMaps.find((m) => m.mapId === selectedMapId);
  const mapCameras = cameras.filter((c) => c.mapId === selectedMapId);
  const activeCameras = mapCameras.filter(
    (c) => c.streamUrl && c.streamType !== "nvr"
  );
  const totalCameras = mapCameras.length;

  // Grid columns
  const gridCols = grid === "1x1" ? 1 : grid === "2x2" ? 2 : 3;

  // Maps with camera counts for dropdown
  const mapsForDropdown = allMaps
    .map((m) => ({
      ...m,
      camCount: cameras.filter((c) => c.mapId === m.mapId).length,
      liveCount: cameras.filter(
        (c) =>
          c.mapId === m.mapId && c.streamUrl && c.streamType !== "nvr"
      ).length,
    }))
    .sort((a, b) => b.camCount - a.camCount);

  const fullscreenCam =
    fullscreenIdx !== null ? mapCameras[fullscreenIdx] : null;

  return (
    <div className="min-h-screen flex flex-col bg-black pb-20">
      {/* ── Header — UniFi Protect style ── */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: "rgba(10,10,10,0.92)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingTop: "max(8px, env(safe-area-inset-top))",
        }}
      >
        <div className="px-4 py-2.5">
          {/* Map selector dropdown */}
          <button
            onClick={() => { setDropdownOpen(!dropdownOpen); hapticTap(); }}
            className="flex items-center gap-2 active:opacity-70 w-full"
          >
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{
                background:
                  activeCameras.length > 0 ? "#22c55e" : "#666",
                boxShadow:
                  activeCameras.length > 0
                    ? "0 0 6px rgba(34,197,94,0.5)"
                    : "none",
              }}
            />
            <span className="text-[15px] font-semibold text-white truncate">
              {selectedMap?.mapName || "Seleccionar sitio"}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={`shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <div className="flex-1" />
            <span className="text-[11px] text-white/40">
              {activeCameras.length}/{totalCameras} en vivo
            </span>
          </button>

          {/* Layout switcher row */}
          <div className="flex items-center justify-between mt-2.5">
            {/* Layout buttons */}
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {(["1x1", "2x2", "grid"] as GridLayout[]).map((g) => (
                <button
                  key={g}
                  onClick={() => { setGrid(g); hapticTap(); }}
                  className="px-3 py-1.5 transition-all"
                  style={{
                    background:
                      grid === g ? "rgba(255,255,255,0.12)" : "transparent",
                    color: grid === g ? "#fff" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {g === "1x1" && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {g === "2x2" && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  )}
                  {g === "grid" && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="6" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="11" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="1" y="6" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="6" y="6" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="11" y="6" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="1" y="11" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="6" y="11" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <rect x="11" y="11" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => { fetchCameras(); hapticTap(); }}
              className="p-2 active:opacity-50"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Dropdown overlay ── */}
      {dropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDropdownOpen(false)}
          />
          <div
            className="fixed left-3 right-3 z-50 rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto"
            style={{
              top: "calc(max(8px, env(safe-area-inset-top)) + 52px)",
              background: "rgba(20,20,20,0.98)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            }}
          >
            {mapsForDropdown.map((m) => (
              <button
                key={m.mapId}
                onClick={() => {
                  setSelectedMapId(m.mapId);
                  setDropdownOpen(false);
                  hapticTap();
                }}
                className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-white/5 transition-colors"
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background:
                    m.mapId === selectedMapId
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                }}
              >
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{
                    background:
                      m.liveCount > 0 ? "#22c55e" : "#444",
                    boxShadow:
                      m.liveCount > 0
                        ? "0 0 4px rgba(34,197,94,0.4)"
                        : "none",
                  }}
                />
                <span className="text-[13px] text-white/85 font-medium flex-1 truncate">
                  {m.mapName}
                </span>
                <span className="text-[11px] text-white/30 shrink-0">
                  {m.liveCount}/{m.camCount}
                </span>
                {m.mapId === selectedMapId && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Detection banner (like Protect's "Sin detecciones en las últimas 24 horas") ── */}
      {!loading && mapCameras.length > 0 && (
        <div
          className="mx-3 mt-3 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5"
          style={{
            background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.1)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-[11px] text-green-400/70">
            {activeCameras.length} cámara{activeCameras.length !== 1 ? "s" : ""}{" "}
            activa{activeCameras.length !== 1 ? "s" : ""} ·{" "}
            {totalCameras - activeCameras.length > 0
              ? `${totalCameras - activeCameras.length} sin stream`
              : "Todas operativas"}
          </span>
        </div>
      )}

      {/* ── Camera Grid ── */}
      <main className="flex-1 px-2 py-3">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#333"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-red-400/60 mt-3">{error}</p>
            <button
              onClick={fetchCameras}
              className="mt-3 px-4 py-1.5 rounded-lg text-xs text-white/60 active:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && mapCameras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#333"
              strokeWidth="1.5"
            >
              <path d="m22 8-6 4 6 4V8Z" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
            <p className="text-sm text-white/25 mt-3">
              No hay cámaras en este sitio
            </p>
          </div>
        )}

        {!loading && !error && mapCameras.length > 0 && (
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            }}
          >
            {mapCameras.map((cam, idx) => (
              <div key={cam.nodeId} className="rounded-lg overflow-hidden">
                <CameraCell
                  camera={cam}
                  compact={grid === "grid"}
                  onTap={() => {
                    setFullscreenIdx(idx);
                    hapticTap();
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Fullscreen viewer ── */}
      {fullscreenCam && fullscreenIdx !== null && (
        <FullscreenViewer
          camera={fullscreenCam}
          onClose={() => setFullscreenIdx(null)}
          onPrev={() =>
            setFullscreenIdx((i) =>
              i !== null && i > 0 ? i - 1 : i
            )
          }
          onNext={() =>
            setFullscreenIdx((i) =>
              i !== null && i < mapCameras.length - 1 ? i + 1 : i
            )
          }
          hasPrev={fullscreenIdx > 0}
          hasNext={fullscreenIdx < mapCameras.length - 1}
        />
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
