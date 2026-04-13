"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search } from "lucide-react";
import { fieldStyle, miniFieldStyle } from "./rack-constants";

// ── Monitor searchable combobox ───────────────────────────────────────────────

interface MonitorSelectProps {
  monitors?: any[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
}

export default function MonitorSelect({ monitors, value, onChange }: MonitorSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = monitors?.find((m: any) => m.id === value) ?? null;

  const filtered = useMemo(() => {
    if (!monitors) return [];
    const q = query.toLowerCase();
    return monitors.filter((m: any) =>
      m.name?.toLowerCase().includes(q) || m.type?.toLowerCase().includes(q)
    );
  }, [monitors, query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className="w-full flex items-center justify-between cursor-pointer"
        style={{ ...fieldStyle, textAlign: "left", paddingRight: 32 }}
      >
        <span style={{ color: selected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}>
          {selected ? `${selected.name} (${selected.type})` : "— Sin sensor —"}
        </span>
        <Search style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10000,
          background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)", maxHeight: 220, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Search input */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar monitor..."
              style={{ ...miniFieldStyle, width: "100%", background: "rgba(255,255,255,0.06)" }}
            />
          </div>
          {/* Options */}
          <div className="rack-scroll" style={{ overflowY: "auto", flex: 1 }}>
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="w-full text-left cursor-pointer"
              style={{ padding: "7px 12px", fontSize: 12, color: !value ? "#60a5fa" : "rgba(255,255,255,0.4)", background: !value ? "rgba(59,130,246,0.08)" : "transparent", border: "none", display: "block" }}
              onMouseEnter={e => { if (value) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              — Sin sensor —
            </button>
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                No hay resultados
              </div>
            )}
            {filtered.map((m: any) => {
              const isSel = m.id === value;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m.id)}
                  className="w-full text-left cursor-pointer"
                  style={{
                    padding: "7px 12px", fontSize: 12, color: isSel ? "#60a5fa" : "rgba(255,255,255,0.75)",
                    background: isSel ? "rgba(59,130,246,0.1)" : "transparent", border: "none", display: "flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", flexShrink: 0,
                  }}>
                    {m.type}
                  </span>
                  <span className="truncate">{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
