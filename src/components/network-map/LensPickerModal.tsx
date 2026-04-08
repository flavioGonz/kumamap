"use client";

import { toast } from "sonner";

interface LensPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentFov: number;
  onSelectFov: (fov: number) => void;
}

const lensPresets = [
  { name: "Ojo de pez", fov: 180, mm: "1.2mm", desc: "Vista 180° panoramica" },
  { name: "Super gran angular", fov: 120, mm: "2.8mm", desc: "Cobertura amplia 120°" },
  { name: "Gran angular", fov: 90, mm: "3.6mm", desc: "Estandar de vigilancia 90°" },
  { name: "Normal", fov: 60, mm: "6mm", desc: "Angulo medio 60°" },
  { name: "Teleobjetivo", fov: 35, mm: "12mm", desc: "Enfoque selectivo 35°" },
  { name: "Tele largo", fov: 18, mm: "25mm", desc: "Lectura de placas 18°" },
  { name: "PTZ Zoom", fov: 8, mm: "50mm", desc: "Detalle maximo 8°" },
  { name: "Personalizado", fov: 0, mm: "custom", desc: "Define tu propio FOV" },
];

export default function LensPickerModal({ open, onClose, currentFov, onSelectFov }: LensPickerModalProps) {
  if (!open) return null;

  // Override the "Personalizado" preset fov with the current value
  const presets = lensPresets.map((l) => l.mm === "custom" ? { ...l, fov: currentFov } : l);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="rounded-2xl w-[380px] overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: "rgba(16,16,16,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          <span className="text-sm font-bold text-[#ededed]">Seleccionar Lente</span>
          <span className="text-[10px] text-[#555] ml-1">Actual: {currentFov}°</span>
          <button onClick={onClose} className="ml-auto text-[#555] hover:text-[#ededed] text-lg leading-none">&times;</button>
        </div>

        <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
          {presets.map((lens) => {
            const isActive = currentFov === lens.fov;
            const isCustom = lens.mm === "custom";
            return (
              <div key={lens.name}>
                <button
                  onClick={() => {
                    if (!isCustom) {
                      onSelectFov(lens.fov);
                      toast.success(`Lente: ${lens.name}`, { description: `${lens.fov}° (${lens.mm})` });
                    }
                  }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: isActive ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isActive ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)"}`,
                  }}
                >
                  {/* FOV visual indicator */}
                  <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
                    <svg width="40" height="40" viewBox="0 0 40 40">
                      <path
                        d={(() => {
                          const cx = 20, cy = 20, r = 16;
                          const startAngle = -lens.fov / 2;
                          const endAngle = lens.fov / 2;
                          const x1 = cx + r * Math.cos(startAngle * Math.PI / 180 - Math.PI / 2);
                          const y1 = cy + r * Math.sin(startAngle * Math.PI / 180 - Math.PI / 2);
                          const x2 = cx + r * Math.cos(endAngle * Math.PI / 180 - Math.PI / 2);
                          const y2 = cy + r * Math.sin(endAngle * Math.PI / 180 - Math.PI / 2);
                          const largeArc = lens.fov > 180 ? 1 : 0;
                          return `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
                        })()}
                        fill={isActive ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)"}
                        stroke={isActive ? "#60a5fa" : "#555"}
                        strokeWidth="1"
                      />
                      <circle cx="20" cy="20" r="3" fill={isActive ? "#60a5fa" : "#888"} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-[#ededed]">{lens.name}</span>
                      {!isCustom && <span className="text-[10px] font-mono text-[#666]">{lens.mm}</span>}
                    </div>
                    <div className="text-[10px] text-[#777]">{lens.desc}</div>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: isActive ? "#60a5fa" : "#666" }}>
                    {lens.fov}°
                  </span>
                </button>
                {/* Custom FOV slider */}
                {isCustom && (
                  <div className="mt-2 px-3 pb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[#666] shrink-0">5°</span>
                      <input
                        type="range" min="5" max="360" step="1" value={currentFov}
                        onChange={(e) => onSelectFov(parseInt(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, #3b82f6 ${((currentFov - 5) / 355) * 100}%, #333 0%)` }}
                      />
                      <span className="text-[10px] text-[#666] shrink-0">360°</span>
                    </div>
                    <div className="text-center text-[10px] text-[#888] mt-1 font-mono">{currentFov}°</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
