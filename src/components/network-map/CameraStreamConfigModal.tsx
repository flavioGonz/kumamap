"use client";

import { useState } from "react";
import { X, Camera, Globe, Image, Video, Info } from "lucide-react";

export interface CameraStreamConfig {
  streamType: "mjpeg" | "snapshot" | "iframe" | "";
  streamUrl: string;
  snapshotInterval?: number; // seconds for auto-refresh in snapshot mode
}

interface CameraStreamConfigModalProps {
  currentConfig: CameraStreamConfig;
  cameraName: string;
  onSave: (config: CameraStreamConfig) => void;
  onClose: () => void;
}

const streamTypes = [
  {
    value: "mjpeg" as const,
    label: "MJPEG Stream",
    icon: Video,
    desc: "Stream MJPEG directo del dispositivo",
    placeholder: "http://192.168.1.100:8080/video",
    help: "URL del stream MJPEG de la cámara. Compatible con la mayoría de cámaras IP.",
  },
  {
    value: "snapshot" as const,
    label: "Snapshot (imagen)",
    icon: Image,
    desc: "Captura estática con refresco automático",
    placeholder: "http://192.168.1.100/snapshot.jpg",
    help: "URL de captura JPEG. Se refresca automáticamente cada N segundos.",
  },
  {
    value: "iframe" as const,
    label: "Web / Embebido",
    icon: Globe,
    desc: "Interfaz web de la cámara o stream HLS/WebRTC",
    placeholder: "http://192.168.1.100/live.html",
    help: "URL de la interfaz web de la cámara, stream HLS, o cualquier página con video.",
  },
];

export default function CameraStreamConfigModal({
  currentConfig,
  cameraName,
  onSave,
  onClose,
}: CameraStreamConfigModalProps) {
  const [streamType, setStreamType] = useState<CameraStreamConfig["streamType"]>(currentConfig.streamType || "");
  const [streamUrl, setStreamUrl] = useState(currentConfig.streamUrl || "");
  const [snapshotInterval, setSnapshotInterval] = useState(currentConfig.snapshotInterval || 2);

  const selectedType = streamTypes.find((t) => t.value === streamType);

  const handleSave = () => {
    onSave({
      streamType,
      streamUrl: streamUrl.trim(),
      snapshotInterval: streamType === "snapshot" ? snapshotInterval : undefined,
    });
  };

  const handleClear = () => {
    onSave({ streamType: "", streamUrl: "" });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-[420px] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(12,12,12,0.99))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-bold text-[#eee]">Configurar Stream</h3>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Camera name */}
          <div className="text-[10px] text-[#666] uppercase tracking-wider font-bold">{cameraName}</div>

          {/* Stream type selector */}
          <div className="space-y-2">
            <label className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Tipo de stream</label>
            <div className="grid grid-cols-3 gap-1.5">
              {streamTypes.map((type) => {
                const active = streamType === type.value;
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    onClick={() => setStreamType(type.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-center transition-all ${
                      active
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                        : "bg-white/3 text-[#777] border border-transparent hover:bg-white/8 hover:text-[#aaa]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[9px] font-bold leading-tight">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* URL input */}
          {streamType && (
            <>
              <div className="space-y-2">
                <label className="text-[10px] text-[#555] font-bold uppercase tracking-wider">URL del stream</label>
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder={selectedType?.placeholder || "http://..."}
                  className="w-full px-3 py-2 rounded-xl text-sm text-[#ddd] placeholder-[#444] outline-none transition-all focus:ring-1 focus:ring-blue-500/40"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  autoFocus
                />
              </div>

              {/* Snapshot interval */}
              {streamType === "snapshot" && (
                <div className="space-y-2">
                  <label className="text-[10px] text-[#555] font-bold uppercase tracking-wider">
                    Intervalo de refresco (seg)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="30"
                      step="1"
                      value={snapshotInterval}
                      onChange={(e) => setSnapshotInterval(parseInt(e.target.value))}
                      className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <span className="text-xs text-[#888] font-mono w-8 text-right">{snapshotInterval}s</span>
                  </div>
                </div>
              )}

              {/* Help text */}
              <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.1)" }}>
                <Info className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-[#666] leading-relaxed">{selectedType?.help}</p>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {currentConfig.streamUrl && (
              <button
                onClick={handleClear}
                className="px-3 py-2 rounded-xl text-[11px] font-bold text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
              >
                Quitar stream
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#666] hover:text-[#aaa] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={streamType !== "" && !streamUrl.trim()}
              className="px-4 py-2 rounded-xl text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
