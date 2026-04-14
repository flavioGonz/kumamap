"use client";

import React, { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { safeJsonParse } from "@/lib/error-handler";
import type { NodeCustomData } from "@/lib/types";

function MobileCameraViewer() {
  const searchParams = useSearchParams();
  const mapId = searchParams.get("mapId") || "";
  const nodeId = searchParams.get("nodeId") || "";

  const [cameraName, setCameraName] = useState("");
  const [streamType, setStreamType] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [snapshotInterval, setSnapshotInterval] = useState(2);
  const [rtspFps, setRtspFps] = useState(2);
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Double-buffer for flicker-free snapshots
  const [bufferA, setBufferA] = useState("");
  const [bufferB, setBufferB] = useState("");
  const [activeBuffer, setActiveBuffer] = useState<"a" | "b">("a");
  const loadingNextRef = useRef(false);

  // Fetch camera config from map data
  const fetchData = useCallback(async () => {
    if (!mapId || !nodeId) return;
    try {
      const res = await fetch(apiUrl(`/api/maps/${mapId}`));
      if (res.ok) {
        const data = await res.json();
        const node = (data.nodes || []).find((n: any) => n.id === nodeId);
        if (node) {
          const cd = safeJsonParse<NodeCustomData>(node.custom_data);
          setCameraName(node.label || "Cámara");
          setStreamType(cd.streamType || "");
          setStreamUrl(cd.streamUrl || "");
          setSnapshotInterval(cd.snapshotInterval || 2);
          setRtspFps(cd.rtspFps || 2);
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, [mapId, nodeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build the actual src URL for the stream
  const getStreamSrc = useCallback((): string => {
    if (!streamUrl) return "";
    switch (streamType) {
      case "rtsp":
        return apiUrl(`/api/camera/rtsp-stream?url=${encodeURIComponent(streamUrl)}&fps=${rtspFps}`);
      case "snapshot":
        return apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(streamUrl)}&_t=${Date.now()}`);
      case "mjpeg":
        return streamUrl;
      default:
        return streamUrl;
    }
  }, [streamUrl, streamType, rtspFps]);

  // Snapshot polling with double-buffer
  useEffect(() => {
    if (streamType !== "snapshot" || !streamUrl) return;
    const ms = snapshotInterval * 1000;

    const firstUrl = apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(streamUrl)}&_t=${Date.now()}`);
    setBufferA(firstUrl);
    setActiveBuffer("a");

    const id = setInterval(() => {
      if (loadingNextRef.current) return;
      loadingNextRef.current = true;
      const nextUrl = apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(streamUrl)}&_t=${Date.now()}`);
      const img = new Image();
      img.onload = () => {
        loadingNextRef.current = false;
        setActiveBuffer((prev) => {
          if (prev === "a") { setBufferB(nextUrl); return "b"; }
          else { setBufferA(nextUrl); return "a"; }
        });
        setStreamLoading(false);
        setError(false);
      };
      img.onerror = () => {
        loadingNextRef.current = false;
        setError(true);
      };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [streamType, streamUrl, snapshotInterval]);

  // Toggle fullscreen
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleFullscreen = useCallback(() => {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setFullscreen(!fullscreen);
  }, [fullscreen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </div>
    );
  }

  if (!streamUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" className="mb-3">
          <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
        </svg>
        <p className="text-sm text-[#888]">Cámara sin stream configurado</p>
        <Link href={mapId ? `/mobile/map?id=${mapId}` : "/mobile"} className="mt-4 text-xs text-blue-400">Volver al mapa</Link>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-screen bg-black">
      {/* Header */}
      <header className="sticky top-0 z-50 px-3 py-2 flex items-center gap-2" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}>
        <Link
          href={mapId ? `/mobile/map?id=${mapId}` : "/mobile"}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] active:scale-95"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500" style={{ animation: "cam-pulse 2s ease-in-out infinite" }} />
            <h1 className="text-xs font-bold text-[#ededed] truncate">{cameraName}</h1>
          </div>
          <span className="text-[9px] text-[#555] uppercase">{streamType}</span>
        </div>
        <button
          onClick={toggleFullscreen}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] active:scale-95"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {fullscreen ? (
              <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
            ) : (
              <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>
            )}
          </svg>
        </button>
      </header>

      {/* Stream */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Loading */}
        {streamLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin mb-2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
            </svg>
            <span className="text-[10px] text-[#555]">Conectando...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-8 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" className="mb-3">
              <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
              <line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.5)" strokeWidth="2" />
            </svg>
            <p className="text-xs text-[#888] mb-3">Error de conexión</p>
            <button
              onClick={() => { setError(false); setStreamLoading(true); }}
              className="px-4 py-2 rounded-xl text-[10px] font-bold active:scale-95"
              style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* RTSP / MJPEG — single img tag */}
        {(streamType === "rtsp" || streamType === "mjpeg") && (
          <img
            src={getStreamSrc()}
            alt={cameraName}
            className="w-full h-full object-contain"
            style={{ display: error ? "none" : "block" }}
            onLoad={() => { setStreamLoading(false); setError(false); }}
            onError={() => { setStreamLoading(false); setError(true); }}
          />
        )}

        {/* Snapshot — double-buffered */}
        {streamType === "snapshot" && (
          <div className="relative w-full h-full">
            {bufferA && (
              <img
                src={bufferA}
                alt={cameraName}
                className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
                style={{ opacity: activeBuffer === "a" ? 1 : 0 }}
                onLoad={() => { setStreamLoading(false); setError(false); }}
              />
            )}
            {bufferB && (
              <img
                src={bufferB}
                alt={cameraName}
                className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
                style={{ opacity: activeBuffer === "b" ? 1 : 0 }}
                onLoad={() => { setStreamLoading(false); setError(false); }}
              />
            )}
          </div>
        )}

        {/* iFrame */}
        {streamType === "iframe" && (
          <iframe
            src={streamUrl}
            className="w-full h-full border-none"
            style={{ display: error ? "none" : "block" }}
            onLoad={() => { setStreamLoading(false); setError(false); }}
            onError={() => { setStreamLoading(false); setError(true); }}
            allow="autoplay; fullscreen"
          />
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: "rgba(0,0,0,0.85)" }}>
        <span className="text-[9px] text-[#444]">
          {streamType === "rtsp" ? `RTSP → MJPEG · ${rtspFps} fps` :
           streamType === "snapshot" ? `Snapshot · cada ${snapshotInterval}s` :
           streamType === "mjpeg" ? "MJPEG directo" :
           streamType === "iframe" ? "Embebido" : streamType}
        </span>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: error ? "#ef4444" : streamLoading ? "#f59e0b" : "#22c55e" }} />
          <span className="text-[9px] text-[#555]">
            {error ? "Error" : streamLoading ? "Conectando" : "En vivo"}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes cam-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}

export default function MobileCameraPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-black">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </div>
    }>
      <MobileCameraViewer />
    </Suspense>
  );
}
