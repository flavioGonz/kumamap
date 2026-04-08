"use client";

import { useState } from "react";
import { X, Camera, Globe, Image, Video, Info, ChevronDown } from "lucide-react";

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

// ── Manufacturer URL templates ─────────────────────────────────────────────────
// Credentials are represented as {user} and {pass} placeholders
// IP is represented as {ip}

interface ManufacturerTemplate {
  id: string;
  label: string;
  templates: Partial<Record<CameraStreamConfig["streamType"], { url: string; desc: string }>>;
}

const MANUFACTURERS: ManufacturerTemplate[] = [
  {
    id: "hikvision",
    label: "Hikvision",
    templates: {
      snapshot: {
        url: "http://{user}:{pass}@{ip}/ISAPI/Streaming/channels/101/picture",
        desc: "Canal 101 = mainstream, 102 = substream",
      },
      mjpeg: {
        url: "http://{user}:{pass}@{ip}/ISAPI/Streaming/channels/102/httpPreview",
        desc: "Preview MJPEG del canal seleccionado",
      },
      iframe: {
        url: "http://{ip}/doc/page/preview.asp",
        desc: "Interfaz web nativa de la cámara",
      },
    },
  },
  {
    id: "dahua",
    label: "Dahua",
    templates: {
      snapshot: {
        url: "http://{user}:{pass}@{ip}/cgi-bin/snapshot.cgi?channel=1",
        desc: "Canal 1 = principal",
      },
      mjpeg: {
        url: "http://{user}:{pass}@{ip}/cgi-bin/mjpg/video.cgi?channel=1&subtype=1",
        desc: "subtype=0 mainstream, subtype=1 substream",
      },
    },
  },
  {
    id: "axis",
    label: "Axis",
    templates: {
      snapshot: {
        url: "http://{user}:{pass}@{ip}/axis-cgi/jpg/image.cgi?resolution=1280x720",
        desc: "Resolución configurable",
      },
      mjpeg: {
        url: "http://{user}:{pass}@{ip}/axis-cgi/mjpg/video.cgi?fps=10",
        desc: "FPS configurable en la URL",
      },
    },
  },
  {
    id: "custom",
    label: "Otro / manual",
    templates: {},
  },
];

const streamTypes = [
  {
    value: "mjpeg" as const,
    label: "MJPEG Stream",
    icon: Video,
    desc: "Stream MJPEG directo del dispositivo",
    placeholder: "http://user:pass@192.168.1.100:8080/video",
    help: "URL del stream MJPEG de la cámara. Compatible con la mayoría de cámaras IP.",
  },
  {
    value: "snapshot" as const,
    label: "Snapshot (imagen)",
    icon: Image,
    desc: "Captura estática con refresco automático",
    placeholder: "http://user:pass@192.168.1.100/snapshot.jpg",
    help: "URL de captura JPEG. Se refresca automáticamente cada N segundos. Autenticación Digest soportada (Hikvision, etc).",
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
  const [manufacturer, setManufacturer] = useState<string>("");
  const [showMfgPicker, setShowMfgPicker] = useState(false);

  const selectedType = streamTypes.find((t) => t.value === streamType);
  const selectedMfg = MANUFACTURERS.find((m) => m.id === manufacturer);

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

  const applyTemplate = (mfg: ManufacturerTemplate) => {
    setManufacturer(mfg.id);
    setShowMfgPicker(false);
    if (mfg.id === "custom") return;
    // If current stream type has a template for this manufacturer, suggest it
    const tpl = streamType ? mfg.templates[streamType] : undefined;
    if (tpl) {
      setStreamUrl(tpl.url);
    } else {
      // Pick first available template
      const firstKey = Object.keys(mfg.templates)[0] as CameraStreamConfig["streamType"];
      if (firstKey && mfg.templates[firstKey]) {
        setStreamType(firstKey);
        setStreamUrl(mfg.templates[firstKey]!.url);
      }
    }
  };

  // When stream type changes, update URL if manufacturer is selected
  const handleStreamTypeChange = (type: CameraStreamConfig["streamType"]) => {
    setStreamType(type);
    if (selectedMfg && selectedMfg.id !== "custom") {
      const tpl = selectedMfg.templates[type];
      if (tpl) setStreamUrl(tpl.url);
    }
  };

  // Get hint for current mfg + type combo
  const mfgHint = selectedMfg && streamType ? selectedMfg.templates[streamType]?.desc : undefined;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-[440px] rounded-2xl overflow-hidden flex flex-col"
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

          {/* Manufacturer selector */}
          <div className="space-y-2">
            <label className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Fabricante</label>
            <div className="relative">
              <button
                onClick={() => setShowMfgPicker((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: showMfgPicker ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  color: manufacturer ? "#ddd" : "#555",
                }}
              >
                <span>{selectedMfg?.label || "Seleccionar fabricante..."}</span>
                <ChevronDown className="h-3.5 w-3.5" style={{ color: "#555", transform: showMfgPicker ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {showMfgPicker && (
                <div
                  className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-xl"
                  style={{ background: "rgba(18,18,18,0.98)", border: "1px solid rgba(255,255,255,0.1)", zIndex: 10 }}
                >
                  {MANUFACTURERS.map((mfg) => (
                    <button
                      key={mfg.id}
                      onClick={() => applyTemplate(mfg)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5 transition-all"
                      style={{ color: manufacturer === mfg.id ? "#60a5fa" : "#aaa", borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                    >
                      <span className="font-medium">{mfg.label}</span>
                      {mfg.id !== "custom" && (
                        <span className="text-[9px] text-[#555]">
                          {Object.keys(mfg.templates).join(" · ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stream type selector */}
          <div className="space-y-2">
            <label className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Tipo de stream</label>
            <div className="grid grid-cols-3 gap-1.5">
              {streamTypes.map((type) => {
                const active = streamType === type.value;
                const Icon = type.icon;
                const hasMfgTemplate = selectedMfg && selectedMfg.id !== "custom" && selectedMfg.templates[type.value];
                return (
                  <button
                    key={type.value}
                    onClick={() => handleStreamTypeChange(type.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-center transition-all ${
                      active
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                        : "bg-white/3 text-[#777] border border-transparent hover:bg-white/8 hover:text-[#aaa]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[9px] font-bold leading-tight">{type.label}</span>
                    {hasMfgTemplate && !active && (
                      <span className="text-[7px] text-emerald-500/70">URL disponible</span>
                    )}
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
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                  autoFocus
                />
                {/* URL template hint */}
                {streamUrl.includes("{") && (
                  <p className="text-[9px] text-amber-400/70 mt-1">
                    Reemplazá <code className="bg-white/5 px-1 rounded">{"{user}"}</code>, <code className="bg-white/5 px-1 rounded">{"{pass}"}</code> y <code className="bg-white/5 px-1 rounded">{"{ip}"}</code> con los datos reales de tu cámara
                  </p>
                )}
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
                <div>
                  <p className="text-[10px] text-[#666] leading-relaxed">{selectedType?.help}</p>
                  {mfgHint && <p className="text-[10px] text-emerald-400/70 mt-1">{selectedMfg?.label}: {mfgHint}</p>}
                </div>
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
