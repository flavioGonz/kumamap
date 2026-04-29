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

interface MapInfo { mapId: string; mapName: string; cameraCount: number; nvrCount: number; totalNodes: number; }

interface MapWithCameras { mapId: string; mapName: string; cameras: CameraInfo[]; cameraCount: number; nvrCount: number; totalNodes: number; }

interface RackNvrChannel { channel: number; label: string; enabled: boolean; connectedCamera?: string; cameraIp?: string; recording?: string; }

interface RackNvrInfo { rackNodeId: string; rackLabel: string; deviceId: string; deviceLabel: string; deviceIp: string; mapId: string; mapName: string; channels: RackNvrChannel[]; }

type GridLayout = "1x1" | "2x2" | "3x3" | "4x4";
const GRID_COLS: Record<GridLayout, number> = { "1x1": 1, "2x2": 2, "3x3": 3, "4x4": 4 };

// ─── Find which NVR records this camera ────────
function findRecordingNvr(camera: CameraInfo, rackNvrs: RackNvrInfo[]): { nvr: RackNvrInfo; ch: RackNvrChannel } | null {
  for (const nvr of rackNvrs) {
    for (const ch of nvr.channels) {
      if (ch.cameraIp && ch.cameraIp === camera.ip) return { nvr, ch };
      if (ch.connectedCamera && ch.connectedCamera === camera.label) return { nvr, ch };
    }
  }
  return null;
}

// ─── Capture snapshot as blob ──────────────────
async function captureSnapshot(camera: CameraInfo): Promise<Blob | null> {
  try {
    const url = camera.streamType === "rtsp"
      ? apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`)
      : camera.streamType === "snapshot"
        ? apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`)
        : camera.streamType === "mjpeg"
          ? apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(camera.streamUrl)}&_t=${Date.now()}`)
          : null;
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch { return null; }
}

// ─── NVR Camera Cell with Overlay ─────────────
function NvrCell({
  camera, index, gridLabel,
  onDoubleClick, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  rackNvrs, onAssociateNvr,
}: {
  camera: CameraInfo;
  index: number;
  gridLabel: string;
  onDoubleClick: () => void;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  rackNvrs: RackNvrInfo[];
  onAssociateNvr: (camera: CameraInfo) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bufA, setBufA] = useState("");
  const [bufB, setBufB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const loadingRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const hasStream = camera.streamUrl && camera.streamType && camera.streamType !== "nvr";

  const recording = findRecordingNvr(camera, rackNvrs);

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
      img.onload = () => { loadingRef.current = false; setActiveBuf((prev) => { if (prev === "a") { setBufB(nextUrl); return "b"; } else { setBufA(nextUrl); return "a"; } }); setLoading(false); setError(false); };
      img.onerror = () => { loadingRef.current = false; };
      img.src = nextUrl;
    }, ms);
    return () => clearInterval(id);
  }, [camera, hasStream]);

  // Screenshot handler
  const handleCapture = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCapturing(true);
    try {
      const blob = await captureSnapshot(camera);
      if (!blob) { setCapturing(false); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${camera.label.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setCapturing(false);
  };

  // WhatsApp share handler
  const handleWhatsApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSendingWa(true);
    try {
      const blob = await captureSnapshot(camera);
      if (!blob) { setSendingWa(false); return; }
      // Try Web Share API first (mobile / modern browsers)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `${camera.label}.jpg`, { type: "image/jpeg" });
        const shareData = { title: camera.label, text: `📹 ${camera.label} — ${camera.ip}\n${new Date().toLocaleString()}`, files: [file] };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          setSendingWa(false);
          return;
        }
      }
      // Fallback: open WhatsApp web with text (can't attach image via URL scheme)
      const text = encodeURIComponent(`📹 ${camera.label} — ${camera.ip}\nCaptura: ${new Date().toLocaleString()}`);
      window.open(`https://wa.me/?text=${text}`, "_blank");
    } catch {}
    setSendingWa(false);
  };

  const isPlaceholder = !hasStream;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDoubleClick={hasStream ? onDoubleClick : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative overflow-hidden select-none"
      style={{
        background: "#000",
        border: isDragOver ? "2px solid #06b6d4" : "1px solid #1a1a1a",
        cursor: hasStream ? "grab" : "default",
        transition: "border-color 0.15s",
      }}
    >
      {/* Channel badge — top-left */}
      <div className="absolute top-0 left-0 z-30 flex items-center gap-0.5">
        <span className="text-[10px] font-bold px-1.5 py-0.5" style={{ background: "rgba(0,0,0,0.7)", color: "#06b6d4", fontFamily: "monospace" }}>
          {gridLabel}
        </span>
        {/* NVR recording indicator */}
        {recording && (
          <span className="text-[8px] font-bold px-1 py-0.5 flex items-center gap-0.5" style={{ background: "rgba(0,0,0,0.7)", color: "#a78bfa", fontFamily: "monospace" }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>
            {recording.nvr.deviceLabel}
          </span>
        )}
      </div>

      {/* Status — top-right */}
      <div className="absolute top-1.5 right-2 z-30">
        {hasStream && !error && !loading && (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: recording ? "#ef4444" : "#22c55e", boxShadow: `0 0 4px ${recording ? "rgba(239,68,68,0.6)" : "rgba(34,197,94,0.6)"}`, animation: "nvr-rec 2s ease-in-out infinite" }} />
            <span className="text-[8px] font-bold" style={{ color: recording ? "#ef4444" : "#22c55e", fontFamily: "monospace" }}>{recording ? "REC" : "LIVE"}</span>
          </div>
        )}
        {hasStream && error && <span className="text-[8px] font-bold text-red-500 font-mono">NO SIGNAL</span>}
      </div>

      {/* ═══ HOVER OVERLAY — controls ═══ */}
      {hovered && hasStream && !loading && (
        <div className="absolute inset-0 z-40 flex flex-col justify-between pointer-events-none" style={{ background: "rgba(0,0,0,0.4)" }}>
          {/* Top: NVR info */}
          <div className="p-2 pointer-events-auto">
            {recording && (
              <div className="inline-flex items-center gap-1.5 px-2 py-1" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>
                <span className="text-[9px] font-bold text-purple-300 font-mono">
                  {recording.nvr.deviceLabel} · CH{recording.ch.channel} · {recording.ch.recording || "N/A"}
                </span>
              </div>
            )}
          </div>

          {/* Center: action buttons */}
          <div className="flex items-center justify-center gap-2 pointer-events-auto">
            {/* Screenshot */}
            <button onClick={handleCapture} disabled={capturing} title="Capturar imagen"
              className="h-9 w-9 flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(6,182,212,0.2)", border: "1px solid rgba(6,182,212,0.4)" }}>
              {capturing ? (
                <div className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              )}
            </button>

            {/* WhatsApp share */}
            <button onClick={handleWhatsApp} disabled={sendingWa} title="Enviar por WhatsApp"
              className="h-9 w-9 flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(37,211,102,0.2)", border: "1px solid rgba(37,211,102,0.4)" }}>
              {sendingWa ? (
                <div className="h-4 w-4 rounded-full border-2 border-green-400/30 border-t-green-400 animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              )}
            </button>

            {/* Associate to NVR */}
            <button onClick={(e) => { e.stopPropagation(); onAssociateNvr(camera); }} title="Asociar a NVR"
              className="h-9 w-9 flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" />
                <circle cx="8" cy="14" r="1" fill="#a78bfa" /><circle cx="16" cy="14" r="1" fill="#a78bfa" />
              </svg>
            </button>

            {/* Fullscreen */}
            <button onClick={(e) => { e.stopPropagation(); onDoubleClick(); }} title="Pantalla completa"
              className="h-9 w-9 flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>

          {/* Bottom: camera details */}
          <div />
        </div>
      )}

      {/* Loading */}
      {hasStream && loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="h-6 w-6 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
        </div>
      )}

      {/* Placeholder */}
      {isPlaceholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "#0a0a0a" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            <line x1="2" y1="2" x2="22" y2="22" stroke="#333" strokeWidth="1.5" />
          </svg>
          <p className="text-[9px] text-white/15 mt-1.5 font-mono">SIN SEÑAL</p>
        </div>
      )}

      {/* Error */}
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
        <img src={getStreamSrc()} alt={camera.label} draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}

      {/* Snapshot double-buffer */}
      {hasStream && camera.streamType === "snapshot" && (
        <>
          {bufA && <img src={bufA} alt={camera.label} draggable={false} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500" style={{ opacity: activeBuf === "a" ? 1 : 0 }} onLoad={() => { setLoading(false); setError(false); }} />}
          {bufB && <img src={bufB} alt={camera.label} draggable={false} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />}
        </>
      )}

      {/* Iframe */}
      {hasStream && camera.streamType === "iframe" && (
        <iframe src={camera.streamUrl} className="absolute inset-0 w-full h-full border-none"
          style={{ display: error ? "none" : "block" }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
          allow="autoplay; fullscreen"
        />
      )}

      {/* Bottom info bar */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-2 py-1"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>
        <span className="text-[10px] font-semibold text-white/70 truncate font-mono">{camera.label}</span>
        <span className="text-[9px] text-white/30 shrink-0 font-mono">{camera.ip}</span>
      </div>
    </div>
  );
}

// ─── NVR Association Modal ─────────────────────
function NvrAssociationModal({
  camera, rackNvrs, onClose, onSave,
}: {
  camera: CameraInfo;
  rackNvrs: RackNvrInfo[];
  onClose: () => void;
  onSave: (rackNodeId: string, deviceId: string, channel: number) => Promise<void>;
}) {
  const [selectedNvr, setSelectedNvr] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Filter NVRs from same map
  const mapNvrs = rackNvrs.filter((n) => n.mapId === camera.mapId);

  const currentNvr = mapNvrs.find((n) => `${n.rackNodeId}::${n.deviceId}` === selectedNvr);

  const handleSave = async () => {
    if (!currentNvr || !selectedChannel) return;
    setSaving(true);
    await onSave(currentNvr.rackNodeId, currentNvr.deviceId, selectedChannel);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }}>
      <div className="flex flex-col" style={{ background: "#111", border: "1px solid #333", width: "min(480px, 92vw)", maxHeight: "80vh" }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #222" }}>
          <div className="flex items-center gap-2 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>
            <span className="text-sm font-bold text-white font-mono truncate">ASOCIAR A NVR</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-white/40 hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Camera info */}
        <div className="px-4 py-2 flex items-center gap-3" style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
          <div className="min-w-0">
            <span className="text-xs font-bold text-white/80 font-mono">{camera.label}</span>
            <span className="text-[10px] text-white/30 font-mono ml-2">{camera.ip}</span>
          </div>
        </div>

        <div className="px-4 py-3 flex-1 overflow-y-auto space-y-3">
          {mapNvrs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>
              <p className="text-xs text-white/25 mt-2 font-mono">No hay NVR/DVR en los racks de este mapa</p>
              <p className="text-[10px] text-white/15 mt-1">Agrega un dispositivo NVR al rack primero</p>
            </div>
          ) : (
            <>
              {/* NVR selector */}
              <div>
                <label className="text-[10px] text-white/30 font-mono block mb-1">NVR / DVR</label>
                <select
                  value={selectedNvr}
                  onChange={(e) => { setSelectedNvr(e.target.value); setSelectedChannel(0); }}
                  className="w-full px-3 py-2 text-xs text-white font-mono focus:outline-none"
                  style={{ background: "#0a0a0a", border: "1px solid #333" }}
                >
                  <option value="" style={{ background: "#0a0a0a" }}>Seleccionar NVR...</option>
                  {mapNvrs.map((nvr) => (
                    <option key={`${nvr.rackNodeId}::${nvr.deviceId}`} value={`${nvr.rackNodeId}::${nvr.deviceId}`} style={{ background: "#0a0a0a" }}>
                      {nvr.deviceLabel} — {nvr.rackLabel} ({nvr.deviceIp || "sin IP"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Channel selector */}
              {currentNvr && (
                <div>
                  <label className="text-[10px] text-white/30 font-mono block mb-1">CANAL</label>
                  <div className="space-y-0.5 max-h-[200px] overflow-y-auto" style={{ border: "1px solid #222" }}>
                    {currentNvr.channels.map((ch) => {
                      const isTaken = ch.connectedCamera && ch.connectedCamera !== camera.label;
                      return (
                        <button
                          key={ch.channel}
                          onClick={() => !isTaken && setSelectedChannel(ch.channel)}
                          className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                          style={{
                            background: selectedChannel === ch.channel ? "rgba(139,92,246,0.15)" : "transparent",
                            borderLeft: selectedChannel === ch.channel ? "2px solid #a78bfa" : "2px solid transparent",
                            opacity: isTaken ? 0.4 : 1,
                            cursor: isTaken ? "not-allowed" : "pointer",
                          }}
                        >
                          <span className="text-[10px] font-bold text-white/50 font-mono w-8">CH{ch.channel}</span>
                          <span className="text-[10px] text-white/70 font-mono flex-1 truncate">{ch.label}</span>
                          {ch.connectedCamera && (
                            <span className="text-[8px] px-1 py-0.5 font-mono" style={{
                              background: ch.connectedCamera === camera.label ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                              color: ch.connectedCamera === camera.label ? "#22c55e" : "#f59e0b",
                            }}>
                              {ch.connectedCamera === camera.label ? "ACTUAL" : ch.connectedCamera}
                            </span>
                          )}
                          {ch.recording && (
                            <span className="text-[8px] text-red-400/50 font-mono">{ch.recording}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid #222" }}>
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold font-mono text-white/50 hover:text-white transition-colors" style={{ border: "1px solid #333" }}>
            CANCELAR
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedChannel || saving}
            className="px-4 py-1.5 text-xs font-bold font-mono transition-all"
            style={{
              background: selectedChannel ? "#a78bfa" : "#333",
              color: selectedChannel ? "#000" : "#555",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "GUARDANDO..." : "ASOCIAR"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fullscreen Viewer ─────────────────────────
function FullscreenViewer({ camera, onClose, onPrev, onNext, label, rackNvrs }: {
  camera: CameraInfo; onClose: () => void; onPrev?: () => void; onNext?: () => void; label: string; rackNvrs: RackNvrInfo[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bufA, setBufA] = useState("");
  const [bufB, setBufB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const loadingRef = useRef(false);
  const recording = findRecordingNvr(camera, rackNvrs);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ background: "#111", borderBottom: "1px solid #222" }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold px-2 py-0.5" style={{ background: "#06b6d4", color: "#000", fontFamily: "monospace" }}>{label}</span>
          <span className="text-xs font-semibold text-white/80 font-mono">{camera.label}</span>
          <span className="text-[10px] text-white/25 font-mono">{camera.ip}</span>
          {recording && (
            <div className="flex items-center gap-1 ml-2 px-1.5 py-0.5" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
              <div className="h-1.5 w-1.5 rounded-full bg-red-500" style={{ animation: "nvr-rec 2s ease-in-out infinite" }} />
              <span className="text-[9px] font-bold text-purple-300 font-mono">REC · {recording.nvr.deviceLabel} CH{recording.ch.channel}</span>
            </div>
          )}
          {!recording && !error && !loading && (
            <div className="flex items-center gap-1 ml-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" style={{ animation: "nvr-rec 2s ease-in-out infinite" }} />
              <span className="text-[9px] font-bold text-green-500 font-mono">LIVE</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onPrev && <button onClick={onPrev} className="p-1.5 hover:bg-white/10 text-white/40 hover:text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>}
          {onNext && <button onClick={onNext} className="p-1.5 hover:bg-white/10 text-white/40 hover:text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18" /></svg></button>}
          <button onClick={onClose} className="p-1.5 ml-2 hover:bg-white/10 text-white/40 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {loading && !error && <div className="absolute inset-0 flex items-center justify-center z-10"><div className="h-10 w-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" /></div>}
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
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /><line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="2" /></svg>
            <p className="text-sm text-white/20 mt-3 font-mono">NO SIGNAL</p>
            <button onClick={() => { setError(false); setLoading(true); }} className="mt-4 px-4 py-1.5 text-xs font-mono text-cyan-400/60 hover:text-cyan-400" style={{ border: "1px solid rgba(6,182,212,0.2)" }}>RETRY</button>
          </div>
        )}
      </div>
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
function OnvifScanModal({ onClose, onFound, cameras }: { onClose: () => void; onFound: () => void; cameras: CameraInfo[] }) {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [timeout, setTimeout_] = useState(5);
  const [configuring, setConfiguring] = useState<Record<string, "loading" | "done" | "error">>({});

  const scan = useCallback(async () => {
    setScanning(true); setError(null); setDevices([]); setConfiguring({});
    try {
      const res = await fetch(apiUrl("/api/onvif/discover"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeout: timeout * 1000, user, pass }) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setDevices(data.devices || []);
      setScanned(true);
    } catch (err: any) { setError(err.message || "Error de conexion"); setScanned(true); }
    finally { setScanning(false); }
  }, [user, pass, timeout]);

  // Find matching camera node by IP
  const findCameraByIp = (ip: string) => cameras.find((c) => c.ip === ip && c.source === "camera");

  // Auto-configure stream on a camera node
  const autoConfigStream = async (dev: any) => {
    const cam = findCameraByIp(dev.ip);
    if (!cam || !dev.streamUri) return;

    setConfiguring((p) => ({ ...p, [dev.ip]: "loading" }));
    try {
      // Inject credentials into the RTSP URL if not already present
      let rtspUrl = dev.streamUri;
      if (user && pass && !rtspUrl.includes("@")) {
        rtspUrl = rtspUrl.replace("rtsp://", `rtsp://${user}:${pass}@`);
      }

      const res = await fetch(apiUrl("/api/cameras"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: cam.nodeId,
          streamUrl: rtspUrl,
          streamType: "rtsp",
          manufacturer: [dev.manufacturer, dev.model].filter(Boolean).join(" "),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfiguring((p) => ({ ...p, [dev.ip]: "done" }));
        onFound(); // refresh camera list
      } else {
        setConfiguring((p) => ({ ...p, [dev.ip]: "error" }));
      }
    } catch {
      setConfiguring((p) => ({ ...p, [dev.ip]: "error" }));
    }
  };

  // Auto-configure ALL matching cameras at once
  const autoConfigAll = async () => {
    const matchable = devices.filter((d) => d.connected && d.streamUri && findCameraByIp(d.ip) && !configuring[d.ip]);
    for (const dev of matchable) {
      await autoConfigStream(dev);
    }
  };

  const matchableCount = devices.filter((d) => d.connected && d.streamUri && findCameraByIp(d.ip) && configuring[d.ip] !== "done").length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }}>
      <div className="relative overflow-hidden flex flex-col" style={{ background: "#111", border: "1px solid #333", width: "min(620px, 94vw)", maxHeight: "85vh" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #222" }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg>
            <span className="text-sm font-bold text-white font-mono">ONVIF DISCOVERY</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-white/40 hover:text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
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
          <button onClick={scan} disabled={scanning} className="px-4 py-1.5 text-xs font-bold font-mono" style={{ background: scanning ? "#0a3a3a" : "#06b6d4", color: scanning ? "#06b6d4" : "#000", opacity: scanning ? 0.7 : 1 }}>
            {scanning ? "SCANNING..." : "SCAN"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ minHeight: "180px" }}>
          {!scanned && !scanning && <div className="flex flex-col items-center justify-center py-12 text-white/15"><p className="text-xs font-mono">Press SCAN to discover</p></div>}
          {scanning && <div className="flex flex-col items-center justify-center py-12"><div className="h-8 w-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" /><p className="text-xs text-white/30 mt-3 font-mono">Searching...</p></div>}
          {error && <div className="p-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}><p className="text-xs text-red-400 font-mono">{error}</p></div>}
          {scanned && !scanning && devices.length === 0 && !error && <div className="flex flex-col items-center justify-center py-10"><p className="text-xs text-white/20 font-mono">No devices found</p></div>}
          {devices.map((dev: any, i: number) => {
            const matchedCam = findCameraByIp(dev.ip);
            const cfgState = configuring[dev.ip];
            const hasStream = dev.connected && dev.streamUri;
            const alreadyConfigured = matchedCam && matchedCam.streamUrl && matchedCam.streamType === "rtsp";

            return (
              <div key={`${dev.ip}-${i}`} className="p-2.5 flex items-start gap-3" style={{ background: "#0a0a0a", border: `1px solid ${cfgState === "done" ? "rgba(34,197,94,0.3)" : matchedCam ? "rgba(6,182,212,0.15)" : "#1a1a1a"}` }}>
                <div className="h-8 w-8 flex items-center justify-center shrink-0 mt-0.5" style={{ background: dev.connected ? "rgba(34,197,94,0.1)" : "#111" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dev.connected ? "#22c55e" : "#555"} strokeWidth="1.8"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white font-mono">{dev.ip}</span>
                    {dev.port !== 80 && <span className="text-[10px] text-white/20 font-mono">:{dev.port}</span>}
                    {dev.connected && <span className="text-[8px] px-1 py-0.5 font-bold font-mono" style={{ background: "#22c55e", color: "#000" }}>ONLINE</span>}
                    {matchedCam && <span className="text-[8px] px-1 py-0.5 font-bold font-mono" style={{ background: "rgba(6,182,212,0.2)", color: "#06b6d4" }}>NODO: {matchedCam.label}</span>}
                    {cfgState === "done" && <span className="text-[8px] px-1 py-0.5 font-bold font-mono" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>CONFIGURADO</span>}
                  </div>
                  <div className="text-[10px] text-white/30 mt-0.5 truncate font-mono">{[dev.manufacturer, dev.model].filter(Boolean).join(" · ") || "ONVIF Device"}</div>
                  {dev.streamUri && (
                    <div className="text-[9px] text-cyan-400/40 font-mono mt-0.5 truncate">{dev.streamUri}</div>
                  )}
                  {dev.snapshotUri && (
                    <div className="text-[9px] text-amber-400/30 font-mono mt-0.5 truncate">SNAP: {dev.snapshotUri}</div>
                  )}
                </div>
                {/* Auto-config button */}
                <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
                  {hasStream && matchedCam && !alreadyConfigured && cfgState !== "done" && (
                    <button
                      onClick={() => autoConfigStream(dev)}
                      disabled={cfgState === "loading"}
                      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold font-mono transition-all"
                      style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", color: "#06b6d4" }}
                    >
                      {cfgState === "loading" ? (
                        <div className="h-3 w-3 rounded-full border border-cyan-400/30 border-t-cyan-400 animate-spin" />
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                      AUTO-CONFIG
                    </button>
                  )}
                  {hasStream && matchedCam && alreadyConfigured && cfgState !== "done" && (
                    <button
                      onClick={() => autoConfigStream(dev)}
                      disabled={cfgState === "loading"}
                      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold font-mono transition-all"
                      style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
                    >
                      {cfgState === "loading" ? (
                        <div className="h-3 w-3 rounded-full border border-amber-400/30 border-t-amber-400 animate-spin" />
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                      )}
                      RE-CONFIG
                    </button>
                  )}
                  {cfgState === "done" && (
                    <span className="text-[9px] font-bold font-mono text-green-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="inline mr-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      OK
                    </span>
                  )}
                  {cfgState === "error" && (
                    <span className="text-[9px] font-bold font-mono text-red-400">ERROR</span>
                  )}
                  {!matchedCam && hasStream && (
                    <span className="text-[8px] text-white/20 font-mono">Sin nodo en mapa</span>
                  )}
                  {!hasStream && dev.connected && (
                    <span className="text-[8px] text-white/20 font-mono">Sin stream URI</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {scanned && (
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid #222" }}>
            <span className="text-[10px] text-white/20 font-mono">{devices.length} device{devices.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2">
              {matchableCount > 0 && (
                <button
                  onClick={autoConfigAll}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold font-mono transition-all"
                  style={{ background: "#06b6d4", color: "#000" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  AUTO-CONFIG ALL ({matchableCount})
                </button>
              )}
              <button onClick={onClose} className="px-3 py-1 text-xs font-bold font-mono text-white/50 hover:text-white" style={{ border: "1px solid #333" }}>CLOSE</button>
            </div>
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isEmpty ? "#333" : "#06b6d4"} strokeWidth="1.5" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`text-[13px] font-bold truncate font-mono ${isEmpty ? "text-white/30" : "text-white/85"}`}>{map.mapName}</h3>
        <div className="flex items-center gap-3 mt-0.5">
          {totalCams > 0 && <span className="text-[10px] text-cyan-400/60 font-mono">{totalCams} LIVE</span>}
          {nvrCams > 0 && <span className="text-[10px] text-purple-400/50 font-mono">{nvrCams} NVR</span>}
          {isEmpty && <span className="text-[10px] text-white/15 font-mono">NO CAMERAS</span>}
        </div>
      </div>
      {!isEmpty && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18" /></svg>}
    </div>
  );

  if (isEmpty) return <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", opacity: 0.5 }}>{content}</div>;

  return (
    <button onClick={onSelect} className="w-full text-left transition-all duration-150 hover:bg-[#0d1a1a]" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#164e4e"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1a1a1a"; }}>
      {content}
    </button>
  );
}

// ─── Main Page ─────────────────────────────────
export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [allMaps, setAllMaps] = useState<MapInfo[]>([]);
  const [rackNvrs, setRackNvrs] = useState<RackNvrInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState<MapWithCameras | null>(null);
  const [layout, setLayout] = useState<GridLayout>("2x2");
  const [fullscreenIdx, setFullscreenIdx] = useState<number | null>(null);
  const [showOnvif, setShowOnvif] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [associatingCamera, setAssociatingCamera] = useState<CameraInfo | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [autoCycle, setAutoCycle] = useState(false);
  const autoCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drag & drop
  const [cameraOrder, setCameraOrder] = useState<CameraInfo[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => { setIsAuthenticated(!!localStorage.getItem("kumamap_user")); }, []);

  const fetchCameras = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/cameras"));
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setCameras(data.cameras || []);
        setAllMaps(data.maps || []);
        setRackNvrs(data.rackNvrs || []);
      }
    } catch (err: any) { setError(err.message || "Error cargando cámaras"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) fetchCameras(); }, [isAuthenticated, fetchCameras]);
  useEffect(() => {
    if (selectedMap) {
      // Sort: cameras with live streams first, then without
      const sorted = [...selectedMap.cameras].sort((a, b) => {
        const aHas = a.streamUrl && a.streamType && a.streamType !== "nvr" ? 0 : 1;
        const bHas = b.streamUrl && b.streamType && b.streamType !== "nvr" ? 0 : 1;
        return aHas - bHas;
      });
      setCameraOrder(sorted);
      setCurrentPage(0);
    }
  }, [selectedMap]);

  // Reset page when layout changes
  useEffect(() => { setCurrentPage(0); }, [layout]);

  // Auto-cycle pages
  useEffect(() => {
    if (autoCycleRef.current) clearInterval(autoCycleRef.current);
    if (!autoCycle || cameraOrder.length === 0) return;
    const cols = GRID_COLS[layout];
    const perPage = cols * cols;
    const totalPages = Math.ceil(cameraOrder.length / perPage);
    if (totalPages <= 1) return;
    autoCycleRef.current = setInterval(() => {
      setCurrentPage((p) => (p + 1) % totalPages);
    }, 10000); // 10 seconds per page
    return () => { if (autoCycleRef.current) clearInterval(autoCycleRef.current); };
  }, [autoCycle, cameraOrder.length, layout]);

  if (isAuthenticated === null) return <div className="min-h-screen flex items-center justify-center bg-black"><div className="h-8 w-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" /></div>;
  if (!isAuthenticated) { if (typeof window !== "undefined") window.location.href = "/"; return null; }

  const mapsWithCameras: MapWithCameras[] = allMaps.map((m) => ({ ...m, cameras: cameras.filter((c) => c.mapId === m.mapId) }));
  mapsWithCameras.sort((a, b) => { const d = (a.cameras.length > 0 ? 0 : 1) - (b.cameras.length > 0 ? 0 : 1); return d || a.mapName.localeCompare(b.mapName); });

  const cols = GRID_COLS[layout];
  const perPage = cols * cols;
  const totalStreams = cameras.filter((c) => c.streamUrl && c.streamType !== "nvr").length;
  const totalNvr = cameras.filter((c) => c.source === "nvr").length;

  // Drag handlers — adjusted for page-local indices
  const handleDragStart = (globalIdx: number) => (e: React.DragEvent) => { setDragIdx(globalIdx); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (globalIdx: number) => (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(globalIdx); };
  const handleDrop = (targetGlobalIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetGlobalIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const n = [...cameraOrder]; const [m] = n.splice(dragIdx, 1); n.splice(targetGlobalIdx, 0, m);
    setCameraOrder(n); setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const activeForFullscreen = cameraOrder.filter((c) => c.streamUrl && c.streamType !== "nvr");
  const openFullscreen = (cam: CameraInfo) => { const i = activeForFullscreen.findIndex((c) => c.nodeId === cam.nodeId); setFullscreenIdx(i >= 0 ? i : 0); };

  // Associate camera to NVR channel
  const handleAssociateNvr = async (rackNodeId: string, deviceId: string, channel: number) => {
    if (!associatingCamera) return;
    try {
      await fetch(apiUrl("/api/cameras"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rackNodeId, deviceId, channel, cameraLabel: associatingCamera.label, cameraIp: associatingCamera.ip }),
      });
      await fetchCameras();
    } catch {}
  };

  // ── Map Selector ──
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
          <button onClick={() => setShowOnvif(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold font-mono" style={{ background: "#06b6d4", color: "#000" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
            DISCOVER
          </button>
          <button onClick={fetchCameras} className="h-8 w-8 flex items-center justify-center text-white/25 hover:text-white/60" title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
        </header>
        <main className="max-w-3xl mx-auto px-5 py-5">
          {!loading && !error && (
            <div className="flex items-center gap-4 mb-4 px-1">
              <span className="text-[11px] text-white/25 font-mono">{allMaps.length} MAP{allMaps.length !== 1 ? "S" : ""}</span>
              {totalStreams > 0 && <><div className="h-3 w-px bg-white/10" /><span className="text-[11px] text-cyan-400/50 font-mono">{totalStreams} LIVE</span></>}
              {totalNvr > 0 && <><div className="h-3 w-px bg-white/10" /><span className="text-[11px] text-purple-400/50 font-mono">{totalNvr} NVR CH</span></>}
            </div>
          )}
          {loading && <div className="flex items-center justify-center py-20"><div className="h-8 w-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" /></div>}
          {error && !loading && <div className="flex flex-col items-center justify-center py-20"><p className="text-sm text-red-400/60 font-mono">{error}</p></div>}
          {!loading && !error && mapsWithCameras.length === 0 && <div className="flex flex-col items-center justify-center py-20"><p className="text-sm text-white/30 font-mono">NO MAPS CONFIGURED</p></div>}
          {!loading && !error && mapsWithCameras.length > 0 && <div className="space-y-1">{mapsWithCameras.map((m) => <MapCard key={m.mapId} map={m} onSelect={() => setSelectedMap(m)} />)}</div>}
        </main>
        {showOnvif && <OnvifScanModal onClose={() => setShowOnvif(false)} onFound={fetchCameras} cameras={cameras} />}
      </div>
    );
  }

  // ── Camera Grid — NVR Style with Pagination ──
  const totalPages = Math.ceil(cameraOrder.length / perPage);
  const pageStart = currentPage * perPage;
  const pageCameras = cameraOrder.slice(pageStart, pageStart + perPage);

  // Keyboard navigation
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && currentPage > 0) setCurrentPage(currentPage - 1);
    if (e.key === "ArrowRight" && currentPage < totalPages - 1) setCurrentPage(currentPage + 1);
  };

  // Time display
  const now = new Date();
  const timeStr = now.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden" onKeyDown={handleGridKeyDown} tabIndex={0}>
      {/* ── NVR Header Bar ── */}
      <header className="shrink-0 flex items-center gap-2 px-3 py-1" style={{ background: "linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)", borderBottom: "1px solid #2a2a3e" }}>
        {/* Back + Map name */}
        <button onClick={() => setSelectedMap(null)} className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="h-3.5 w-px" style={{ background: "#2a2a3e" }} />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
        <h1 className="text-[11px] font-bold text-white/85 truncate font-mono tracking-wide">{selectedMap.mapName}</h1>
        <span className="text-[9px] px-1.5 py-0.5 font-bold font-mono" style={{ background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.2)" }}>
          {cameraOrder.filter((c) => c.streamUrl && c.streamType !== "nvr").length} LIVE
        </span>

        <div className="flex-1" />

        {/* Page indicator */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="h-6 w-6 flex items-center justify-center transition-colors"
              style={{ color: currentPage === 0 ? "#333" : "#888" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            </button>

            {/* Page dots */}
            <div className="flex items-center gap-0.5">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i)}
                  className="transition-all"
                  style={{
                    width: currentPage === i ? "16px" : "6px",
                    height: "6px",
                    borderRadius: "3px",
                    background: currentPage === i ? "#06b6d4" : "#333",
                    boxShadow: currentPage === i ? "0 0 6px rgba(6,182,212,0.5)" : "none",
                  }}
                />
              ))}
            </div>

            <button
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage === totalPages - 1}
              className="h-6 w-6 flex items-center justify-center transition-colors"
              style={{ color: currentPage === totalPages - 1 ? "#333" : "#888" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 6 15 12 9 18" /></svg>
            </button>

            <span className="text-[9px] font-mono text-white/25 ml-1">{currentPage + 1}/{totalPages}</span>
          </div>
        )}

        {/* Auto-cycle toggle */}
        {totalPages > 1 && (
          <>
            <div className="h-3.5 w-px ml-1" style={{ background: "#2a2a3e" }} />
            <button
              onClick={() => setAutoCycle(!autoCycle)}
              title={autoCycle ? "Detener auto-rotación" : "Auto-rotar páginas (10s)"}
              className="flex items-center gap-1 px-1.5 py-0.5 transition-all"
              style={{
                background: autoCycle ? "rgba(6,182,212,0.15)" : "transparent",
                border: `1px solid ${autoCycle ? "rgba(6,182,212,0.3)" : "transparent"}`,
              }}
            >
              {autoCycle ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#06b6d4" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
              <span className="text-[8px] font-mono" style={{ color: autoCycle ? "#06b6d4" : "#555" }}>SEQ</span>
            </button>
          </>
        )}

        <div className="h-3.5 w-px ml-1" style={{ background: "#2a2a3e" }} />

        {/* ONVIF Discovery */}
        <button onClick={() => setShowOnvif(true)} className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold font-mono transition-all hover:bg-cyan-400/10" style={{ color: "#06b6d4", border: "1px solid rgba(6,182,212,0.2)" }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
          ONVIF
        </button>

        {/* Layout selector */}
        <div className="flex items-center" style={{ border: "1px solid #2a2a3e", borderRadius: "2px" }}>
          {(["1x1", "2x2", "3x3", "4x4"] as GridLayout[]).map((g) => (
            <button key={g} onClick={() => setLayout(g)} className="px-2 py-0.5 text-[9px] font-bold font-mono transition-all"
              style={{
                background: layout === g ? "#06b6d4" : "transparent",
                color: layout === g ? "#000" : "#555",
                borderRight: g !== "4x4" ? "1px solid #2a2a3e" : "none",
              }}>
              {g}
            </button>
          ))}
        </div>
      </header>

      {/* ── Camera Grid ── */}
      <main className="flex-1 overflow-hidden relative" style={{ background: "#0a0a0f" }}>
        {cameraOrder.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="1.5"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>
            <p className="text-sm text-white/15 mt-3 font-mono">SIN CÁMARAS CONFIGURADAS</p>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setShowOnvif(true)} className="px-3 py-1.5 text-xs font-bold font-mono" style={{ background: "#06b6d4", color: "#000" }}>DISCOVER ONVIF</button>
              <Link href={`/?map=${selectedMap.mapId}`} className="px-3 py-1.5 text-xs font-mono text-white/40" style={{ border: "1px solid #333" }}>ABRIR MAPA</Link>
            </div>
          </div>
        ) : (
          <div
            className="w-full h-full grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${cols}, 1fr)`,
              gap: "2px",
              padding: "2px",
              background: "#0a0a0f",
            }}
          >
            {pageCameras.map((cam, localIdx) => {
              const globalIdx = pageStart + localIdx;
              return (
                <NvrCell
                  key={cam.nodeId}
                  camera={cam}
                  index={globalIdx}
                  gridLabel={`CH${String(globalIdx + 1).padStart(2, "0")}`}
                  onDoubleClick={() => openFullscreen(cam)}
                  isDragOver={dragOverIdx === globalIdx && dragIdx !== globalIdx}
                  onDragStart={handleDragStart(globalIdx)}
                  onDragOver={handleDragOver(globalIdx)}
                  onDrop={handleDrop(globalIdx)}
                  onDragEnd={handleDragEnd}
                  rackNvrs={rackNvrs}
                  onAssociateNvr={setAssociatingCamera}
                />
              );
            })}
            {/* Fill empty cells if page is not full */}
            {pageCameras.length < perPage && Array.from({ length: perPage - pageCameras.length }, (_, i) => (
              <div key={`empty-${i}`} style={{ background: "#0a0a0f", border: "1px solid #141420" }}>
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round">
                    <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── NVR Status Bar ── */}
      <footer className="shrink-0 flex items-center justify-between px-3 py-0.5" style={{ background: "linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)", borderTop: "1px solid #2a2a3e" }}>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-white/20">{cameraOrder.length} CH</span>
          <div className="h-2.5 w-px" style={{ background: "#2a2a3e" }} />
          <span className="text-[9px] font-mono text-white/20">
            CH{String(pageStart + 1).padStart(2, "0")}–CH{String(Math.min(pageStart + perPage, cameraOrder.length)).padStart(2, "0")}
          </span>
          {autoCycle && (
            <>
              <div className="h-2.5 w-px" style={{ background: "#2a2a3e" }} />
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#06b6d4", animation: "nvr-rec 2s ease-in-out infinite" }} />
                <span className="text-[8px] font-mono text-cyan-400/50">SEQ 10s</span>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-white/15">{dateStr}</span>
          <span className="text-[10px] font-mono font-bold text-white/30">{timeStr}</span>
        </div>
      </footer>

      {fullscreenIdx !== null && activeForFullscreen[fullscreenIdx] && (
        <FullscreenViewer
          camera={activeForFullscreen[fullscreenIdx]}
          label={`CH${String(cameraOrder.findIndex((c) => c.nodeId === activeForFullscreen[fullscreenIdx].nodeId) + 1).padStart(2, "0")}`}
          onClose={() => setFullscreenIdx(null)}
          onPrev={fullscreenIdx > 0 ? () => setFullscreenIdx(fullscreenIdx - 1) : undefined}
          onNext={fullscreenIdx < activeForFullscreen.length - 1 ? () => setFullscreenIdx(fullscreenIdx + 1) : undefined}
          rackNvrs={rackNvrs}
        />
      )}

      {associatingCamera && (
        <NvrAssociationModal
          camera={associatingCamera}
          rackNvrs={rackNvrs}
          onClose={() => setAssociatingCamera(null)}
          onSave={handleAssociateNvr}
        />
      )}

      {showOnvif && <OnvifScanModal onClose={() => setShowOnvif(false)} onFound={fetchCameras} cameras={cameras} />}
      <style>{`@keyframes nvr-rec { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
