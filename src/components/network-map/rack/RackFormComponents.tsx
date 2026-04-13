"use client";

import React from "react";
import { X } from "lucide-react";
import { miniFieldStyle, toggleTrack, toggleThumb } from "./rack-constants";

// ── Toggle ────────────────────────────────────────────────────────────────────

export function Toggle({ label, value, color = "#22c55e", onChange }: {
  label: string; value: boolean; color?: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <button onClick={() => onChange(!value)} style={toggleTrack(value, color)}>
        <div style={toggleThumb(value)} />
      </button>
    </div>
  );
}

// ── MiniInput ─────────────────────────────────────────────────────────────────

export function MiniInput({ label, value, placeholder, mono, onChange }: {
  label: string; value: string; placeholder?: string; mono?: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ ...miniFieldStyle, fontFamily: mono ? "monospace" : undefined }}
      />
    </div>
  );
}

// ── MiniSelect ────────────────────────────────────────────────────────────────

export function MiniSelect({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={miniFieldStyle}>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#1a1a1a" }}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── MiniTextarea ──────────────────────────────────────────────────────────────

export function MiniTextarea({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} style={{ ...miniFieldStyle, resize: "none" }} />
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </span>
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

// ── FieldLabel ────────────────────────────────────────────────────────────────

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block mb-1.5" style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
      {children}
    </label>
  );
}

// ── PortDetailPanel ───────────────────────────────────────────────────────────

export function PortDetailPanel({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{title}</span>
        <button onClick={onClose} className="transition-colors cursor-pointer" style={{ color: "rgba(255,255,255,0.3)" }}>
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>
      <div className="p-3 flex flex-col gap-2.5 overflow-y-auto" style={{ maxHeight: 420 }}>
        {children}
      </div>
    </div>
  );
}
