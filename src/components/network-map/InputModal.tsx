"use client";

import { useState, useEffect, useRef } from "react";
import { X, Check } from "lucide-react";

interface InputModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  label?: string;
  placeholder?: string;
  initial?: string;
  icon?: React.ReactNode;
}

export default function InputModal({
  open,
  onClose,
  onSubmit,
  title,
  label,
  placeholder,
  initial = "",
  icon,
}: InputModalProps) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initial);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initial]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl"
        style={{
          background: "linear-gradient(180deg, rgba(22,22,22,0.98), rgba(14,14,14,0.99))",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
              {icon}
            </div>
          )}
          <h3 className="text-sm font-bold text-[#ededed] flex-1">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#737373] hover:text-[#ededed] hover:bg-white/5 transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}
          className="px-5 py-4 space-y-3"
        >
          {label && (
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">{label}</label>
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl py-2 text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}>
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold"
              style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>
              <Check className="h-3.5 w-3.5" /> Aceptar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
