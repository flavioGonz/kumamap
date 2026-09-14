"use client";

import { useState } from "react";
import { X, Server } from "lucide-react";

const sizePresets = [
  { label: "Muy pequeño", value: 0.6 },
  { label: "Pequeño", value: 0.8 },
  { label: "Normal", value: 1.0 },
  { label: "Grande", value: 1.4 },
  { label: "Muy grande", value: 1.8 },
  { label: "Extra grande", value: 2.4 },
];

interface NodeSizeModalProps {
  currentSize: number;
  nodeName: string;
  onSelect: (size: number) => void;
  onClose: () => void;
}

export default function NodeSizeModal({ currentSize, nodeName, onSelect, onClose }: NodeSizeModalProps) {
  const [customSize, setCustomSize] = useState(currentSize);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-[340px] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(12,12,12,0.99))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h3 className="text-sm font-bold text-[#eee]">Tamaño del nodo</h3>
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Node name */}
          <div className="text-[10px] text-[#666] uppercase tracking-wider font-bold">{nodeName}</div>

          {/* Preview */}
          <div className="flex items-center justify-center py-4">
            <div
              className="rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                width: 28 * customSize,
                height: 28 * customSize,
                background: "radial-gradient(circle, rgba(34,197,94,0.27), rgba(34,197,94,0.07))",
                border: "2px solid #22c55e",
                boxShadow: "0 0 12px rgba(34,197,94,0.4), 0 0 30px rgba(34,197,94,0.15)",
              }}
            >
              <Server
                style={{
                  width: 14 * customSize,
                  height: 14 * customSize,
                  color: "#22c55e",
                }}
              />
            </div>
          </div>

          {/* Presets grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {sizePresets.map((preset) => {
              const isActive = Math.abs(customSize - preset.value) < 0.05;
              return (
                <button
                  key={preset.value}
                  onClick={() => { setCustomSize(preset.value); onSelect(preset.value); }}
                  className={`py-2 px-2 rounded-xl text-[10px] font-bold transition-all ${
                    isActive
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                      : "bg-white/3 text-[#777] border border-transparent hover:bg-white/8 hover:text-[#aaa]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[#555] font-bold uppercase tracking-wider">Personalizado</span>
              <span className="text-[10px] text-[#888] font-mono">{customSize.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="3.0"
              step="0.1"
              value={customSize}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setCustomSize(v);
              }}
              onMouseUp={() => onSelect(customSize)}
              onTouchEnd={() => onSelect(customSize)}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
