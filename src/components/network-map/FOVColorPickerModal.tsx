"use client";

import Tooltip from "./Tooltip";

interface FOVColorPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentColor: string;
  currentOpacity: number;
  onChangeColor: (color: string) => void;
  onChangeOpacity: (opacity: number) => void;
}

const colorOptions = [
  { color: "#22c55e", name: "Verde" },
  { color: "#3b82f6", name: "Azul" },
  { color: "#ef4444", name: "Rojo" },
  { color: "#f59e0b", name: "Naranja" },
  { color: "#8b5cf6", name: "Violeta" },
  { color: "#ec4899", name: "Rosa" },
  { color: "#06b6d4", name: "Cyan" },
  { color: "#f97316", name: "Naranja fuerte" },
  { color: "#14b8a6", name: "Teal" },
  { color: "#a855f7", name: "Purpura" },
  { color: "#ffffff", name: "Blanco" },
  { color: "#facc15", name: "Amarillo" },
];

const opacityOptions = [
  { value: 0.08, name: "Sutil" },
  { value: 0.15, name: "Suave" },
  { value: 0.25, name: "Medio" },
  { value: 0.40, name: "Visible" },
  { value: 0.60, name: "Fuerte" },
  { value: 0.80, name: "Intenso" },
];

export default function FOVColorPickerModal({ open, onClose, currentColor, currentOpacity, onChangeColor, onChangeOpacity }: FOVColorPickerModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="rounded-2xl w-[340px] overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: "rgba(16,16,16,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="h-4 w-4 rounded" style={{ background: currentColor, opacity: currentOpacity + 0.3 }} />
          <span className="text-sm font-bold text-[#ededed]">Color y Transparencia</span>
          <button onClick={onClose} className="ml-auto text-[#555] hover:text-[#ededed] text-lg leading-none">&times;</button>
        </div>

        {/* Colors */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-[10px] text-[#666] font-bold uppercase tracking-wider mb-2">Color del area</div>
          <div className="grid grid-cols-6 gap-2">
            {colorOptions.map((c) => (
              <Tooltip key={c.color} content={c.name}>
              <button onClick={() => onChangeColor(c.color)}
                className="w-10 h-10 rounded-xl transition-all hover:scale-110"
                style={{
                  background: c.color,
                  border: currentColor === c.color ? "3px solid #fff" : "2px solid rgba(255,255,255,0.1)",
                  boxShadow: currentColor === c.color ? `0 0 12px ${c.color}88` : "none",
                }}
              />
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Opacity */}
        <div className="px-4 py-3">
          <div className="text-[10px] text-[#666] font-bold uppercase tracking-wider mb-2">Transparencia</div>
          <div className="grid grid-cols-3 gap-2">
            {opacityOptions.map((o) => (
              <button key={o.value} onClick={() => onChangeOpacity(o.value)}
                className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                style={{
                  background: currentOpacity === o.value ? `${currentColor}33` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${currentOpacity === o.value ? currentColor + "66" : "rgba(255,255,255,0.06)"}`,
                  color: currentOpacity === o.value ? currentColor : "#888",
                }}>
                <div className="h-3 rounded mb-1" style={{ background: currentColor, opacity: o.value }} />
                {o.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
