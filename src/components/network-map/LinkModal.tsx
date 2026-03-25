"use client";

import { useState, useEffect, useRef } from "react";
import {
  Link2, Cable, ArrowRight, X, Plug, Tag, Network, Check,
} from "lucide-react";

export interface LinkFormData {
  sourceInterface: string;
  targetInterface: string;
  label: string;
}

interface LinkModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: LinkFormData) => void;
  sourceName?: string;
  targetName?: string;
  initial?: Partial<LinkFormData>;
  title?: string;
}

export default function LinkModal({
  open,
  onClose,
  onSubmit,
  sourceName,
  targetName,
  initial,
  title = "Nueva conexion",
}: LinkModalProps) {
  const [srcIf, setSrcIf] = useState(initial?.sourceInterface || "");
  const [tgtIf, setTgtIf] = useState(initial?.targetInterface || "");
  const [label, setLabel] = useState(initial?.label || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSrcIf(initial?.sourceInterface || "");
      setTgtIf(initial?.targetInterface || "");
      setLabel(initial?.label || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ sourceInterface: srcIf, targetInterface: tgtIf, label });
  };

  const presets = [
    "eth0", "eth1", "Gi0/0", "Gi0/1", "Fa0/1", "Fa0/24",
    "Te1/1", "wan", "lan", "trunk", "po1",
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[2000] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="relative w-full max-w-md rounded-2xl p-0 shadow-2xl"
          style={{
            background: "linear-gradient(180deg, rgba(22,22,22,0.98), rgba(14,14,14,0.99))",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))",
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              <Link2 className="h-4 w-4 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-[#ededed]">{title}</h3>
              {sourceName && targetName && (
                <div className="flex items-center gap-1.5 text-[10px] text-[#737373] mt-0.5">
                  <Network className="h-3 w-3 text-blue-400" />
                  <span className="text-blue-300 font-semibold">{sourceName}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="text-purple-300 font-semibold">{targetName}</span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#737373] hover:text-[#ededed] hover:bg-white/5 transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            {/* Source interface */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-400">
                <Plug className="h-3 w-3" />
                Interfaz origen
                {sourceName && (
                  <span className="normal-case tracking-normal text-[#737373] font-normal">({sourceName})</span>
                )}
              </label>
              <input
                ref={inputRef}
                type="text"
                value={srcIf}
                onChange={(e) => setSrcIf(e.target.value)}
                placeholder="ej: eth0, Gi0/1, puerto 24..."
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(59,130,246,0.2)" }}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {presets.slice(0, 6).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSrcIf(p)}
                    className="rounded-md px-2 py-0.5 text-[9px] font-semibold transition-all"
                    style={{
                      background: srcIf === p ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${srcIf === p ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                      color: srcIf === p ? "#60a5fa" : "#666",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Arrow divider */}
            <div className="flex items-center justify-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="flex items-center gap-1 text-[#555]">
                <Cable className="h-3.5 w-3.5" />
                <ArrowRight className="h-3 w-3" />
              </div>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>

            {/* Target interface */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-400">
                <Plug className="h-3 w-3" />
                Interfaz destino
                {targetName && (
                  <span className="normal-case tracking-normal text-[#737373] font-normal">({targetName})</span>
                )}
              </label>
              <input
                type="text"
                value={tgtIf}
                onChange={(e) => setTgtIf(e.target.value)}
                placeholder="ej: eth1, Gi0/2, puerto 1..."
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139,92,246,0.2)" }}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {presets.slice(0, 6).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTgtIf(p)}
                    className="rounded-md px-2 py-0.5 text-[9px] font-semibold transition-all"
                    style={{
                      background: tgtIf === p ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${tgtIf === p ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                      color: tgtIf === p ? "#a78bfa" : "#666",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Cable label */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                <Tag className="h-3 w-3" />
                Etiqueta del cable
                <span className="normal-case tracking-normal text-[#555] font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ej: fibra, cat6, 10Gbps..."
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {["fibra", "cat6", "cat5e", "coaxial", "10G", "1G", "100M", "wireless"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setLabel(p)}
                    className="rounded-md px-2 py-0.5 text-[9px] font-semibold transition-all"
                    style={{
                      background: label === p ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${label === p ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}`,
                      color: label === p ? "#ccc" : "#666",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div
              className="rounded-xl p-3 text-center"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="text-[9px] text-[#555] uppercase font-semibold tracking-wider mb-1.5">Vista previa</div>
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="rounded-md px-2 py-0.5 font-bold"
                  style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>
                  {srcIf || "..."}
                </span>
                <div className="flex items-center gap-1 text-[#555]">
                  <div className="w-6 h-px bg-[#333]" />
                  {label && (
                    <span className="text-[9px] text-[#888] font-medium">{label}</span>
                  )}
                  <div className="w-6 h-px bg-[#333]" />
                  <ArrowRight className="h-3 w-3" />
                </div>
                <span className="rounded-md px-2 py-0.5 font-bold"
                  style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}>
                  {tgtIf || "..."}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all"
                style={{
                  background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))",
                  border: "1px solid rgba(59,130,246,0.35)",
                  color: "#60a5fa",
                }}
              >
                <Check className="h-3.5 w-3.5" />
                {initial?.sourceInterface !== undefined ? "Guardar" : "Crear enlace"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
