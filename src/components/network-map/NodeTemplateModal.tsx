"use client";

import React, { useState, useMemo } from "react";
import { Search, X as XIcon } from "lucide-react";
import { DEFAULT_TEMPLATES, NODE_TEMPLATE_CATEGORIES, type NodeTemplate } from "@/lib/node-templates";
import { getIconSvg } from "@/utils/map-icons";

export interface NodeTemplateModalProps {
  onSelect: (template: NodeTemplate) => void;
  onClose: () => void;
}

export default function NodeTemplateModal({ onSelect, onClose }: NodeTemplateModalProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = DEFAULT_TEMPLATES;
    if (activeCategory) list = list.filter((t) => t.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.defaultLabel.toLowerCase().includes(q)
      );
    }
    return list;
  }, [search, activeCategory]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, NodeTemplate[]>();
    for (const t of filtered) {
      const group = map.get(t.category) || [];
      group.push(t);
      map.set(t.category, group);
    }
    return map;
  }, [filtered]);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col"
        style={{
          background: "rgba(14,14,14,0.99)",
          border: "1px solid rgba(255,255,255,0.08)",
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M12 8v8" />
              <path d="M8 12h8" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[#ededed]">Agregar desde plantilla</h3>
            <p className="text-[10px] text-[#666]">Seleccioná un tipo de dispositivo</p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-[#ededed] text-xl leading-none">&times;</button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#555]" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar plantilla..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl pl-9 pr-8 py-2 text-xs text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#aaa]"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category chips */}
        <div className="flex gap-1.5 px-4 py-2 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <button
            onClick={() => setActiveCategory(null)}
            className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all"
            style={{
              background: !activeCategory ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${!activeCategory ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}`,
              color: !activeCategory ? "#60a5fa" : "#888",
            }}
          >
            Todas
          </button>
          {Object.entries(NODE_TEMPLATE_CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(activeCategory === key ? null : key)}
              className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all"
              style={{
                background: activeCategory === key ? `${cat.color}22` : "rgba(255,255,255,0.04)",
                border: `1px solid ${activeCategory === key ? `${cat.color}55` : "rgba(255,255,255,0.06)"}`,
                color: activeCategory === key ? cat.color : "#888",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-8 text-[#555]">
              <Search className="h-6 w-6 mb-2 opacity-30" />
              <p className="text-[11px]">Sin resultados</p>
            </div>
          )}

          {Array.from(grouped.entries()).map(([category, templates]) => {
            const cat = NODE_TEMPLATE_CATEGORIES[category];
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: cat.color }}>
                    {cat.label}
                  </span>
                  <div className="flex-1 h-px" style={{ background: `${cat.color}22` }} />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onSelect(t)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all group"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = `${cat.color}11`;
                        (e.currentTarget as HTMLElement).style.borderColor = `${cat.color}33`;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.05)";
                      }}
                    >
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                        style={{
                          background: t.color ? `${t.color}22` : "rgba(255,255,255,0.06)",
                          border: `1px solid ${t.color ? `${t.color}44` : "rgba(255,255,255,0.1)"}`,
                        }}
                        dangerouslySetInnerHTML={{ __html: getIconSvg(t.icon, 14) }}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#ededed] truncate">{t.name}</div>
                        <div className="text-[9px] text-[#555] truncate">{t.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-[9px] text-[#444]">{filtered.length} plantillas disponibles</span>
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-1.5 text-[10px] font-semibold text-[#888] hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
