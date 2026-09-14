"use client";

import { useState, useMemo } from "react";
import { X, Search } from "lucide-react";
import { iconRegistry, type IconDef } from "./KumaMonitorNode";

const categoryLabels: Record<string, string> = {
  red: "Red",
  seguridad: "Seguridad",
  dispositivos: "Dispositivos",
  infra: "Infraestructura",
  compute: "Compute / Storage",
  general: "General",
};

const categoryOrder = ["red", "seguridad", "dispositivos", "infra", "compute", "general"];

interface IconPickerModalProps {
  currentIcon: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
}

export default function IconPickerModal({ currentIcon, onSelect, onClose }: IconPickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const entries = Object.entries(iconRegistry);
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(([key, def]) =>
      key.includes(q) || def.label.toLowerCase().includes(q) || def.category.includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const groups: Record<string, [string, IconDef][]> = {};
    for (const entry of filtered) {
      const cat = entry[1].category;
      if (activeCategory && cat !== activeCategory) continue;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }
    return groups;
  }, [filtered, activeCategory]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-[480px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(12,12,12,0.99))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h3 className="text-sm font-bold text-[#eee]">Seleccionar Icono</h3>
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#555]" />
            <input
              type="text"
              placeholder="Buscar icono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/8 rounded-lg text-xs text-white placeholder-[#555] outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-4 pb-2 flex gap-1 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
              !activeCategory ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-[#666] hover:text-[#aaa] border border-transparent"
            }`}
          >
            Todos
          </button>
          {categoryOrder.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                activeCategory === cat ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-[#666] hover:text-[#aaa] border border-transparent"
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>

        {/* Icons grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
          {categoryOrder.map((cat) => {
            const items = grouped[cat];
            if (!items?.length) return null;
            return (
              <div key={cat}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#555] mb-2">
                  {categoryLabels[cat]}
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {items.map(([key, def]) => {
                    const Icon = def.component;
                    const isActive = currentIcon === key;
                    return (
                      <button
                        key={key}
                        onClick={() => onSelect(key)}
                        title={def.label}
                        className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl transition-all ${
                          isActive
                            ? "bg-blue-500/20 border border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                            : "bg-white/3 border border-transparent hover:bg-white/8 hover:border-white/10"
                        }`}
                      >
                        <Icon
                          className="h-5 w-5"
                          style={{ color: isActive ? "#60a5fa" : "#aaa" }}
                        />
                        <span className={`text-[8px] leading-tight text-center ${isActive ? "text-blue-400 font-bold" : "text-[#777]"}`}>
                          {def.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {Object.keys(grouped).length === 0 && (
            <div className="text-center text-[#555] text-xs py-8">
              No se encontraron iconos para &quot;{search}&quot;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
