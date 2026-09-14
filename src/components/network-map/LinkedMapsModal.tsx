"use client";

import React from "react";
import Tooltip from "./Tooltip";

export interface LinkedMap {
  id: string;
  name: string;
}

export interface LinkedMapsModalProps {
  nodeLabel: string;
  linkedMaps: LinkedMap[];
  availableMaps: LinkedMap[];
  /** Current map ID — excluded from the "add" list */
  currentMapId: string;
  onAddMap: (mapId: string, mapName: string) => void;
  onRemoveMap: (mapId: string) => void;
  onOpenMap: (mapId: string) => void;
  onClose: () => void;
}

export default function LinkedMapsModal({
  nodeLabel,
  linkedMaps,
  availableMaps,
  currentMapId,
  onAddMap,
  onRemoveMap,
  onOpenMap,
  onClose,
}: LinkedMapsModalProps) {
  const unlinkedMaps = availableMaps.filter(
    (m) => m.id !== currentMapId && !linkedMaps.some((lm) => lm.id === m.id)
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: "rgba(14,14,14,0.99)", border: "1px solid rgba(99,102,241,0.25)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#ededed]">Mapas del nodo</h3>
            <p className="text-[10px] text-[#666]">{nodeLabel}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-[#555] hover:text-[#ededed] text-xl leading-none">
            &times;
          </button>
        </div>

        {/* Linked maps list */}
        <div className="px-5 py-3 space-y-1.5" style={{ minHeight: "80px" }}>
          {linkedMaps.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-[#555]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-30">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-[11px]">Sin mapas vinculados</p>
              <p className="text-[10px] text-[#444] mt-0.5">Seleccioná un mapa abajo para vincular</p>
            </div>
          ) : (
            linkedMaps.map((lm) => (
              <div
                key={lm.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 group"
                style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="flex-1 text-xs font-semibold text-[#a5b4fc] truncate">{lm.name}</span>
                <Tooltip content="Abrir mapa">
                  <button
                    className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[#60a5fa] hover:bg-blue-500/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      onOpenMap(lm.id);
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" x2="21" y1="14" y2="3" />
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip content="Desvincular">
                  <button
                    onClick={() => onRemoveMap(lm.id)}
                    className="rounded-lg p-1 text-[#555] hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" x2="6" y1="6" y2="18" />
                      <line x1="6" x2="18" y1="6" y2="18" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            ))
          )}
        </div>

        {/* Add map section */}
        {unlinkedMaps.length > 0 && (
          <div className="px-5 pb-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#555] pt-3 pb-2">Vincular mapa</p>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {unlinkedMaps.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onAddMap(m.id, m.name)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-[#888] transition-all"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.08)";
                    (e.currentTarget as HTMLElement).style.color = "#ededed";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#888";
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" x2="12" y1="8" y2="16" />
                    <line x1="8" x2="16" y1="12" y2="12" />
                  </svg>
                  <span className="flex-1 text-left truncate">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Close */}
        <div className="px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2 text-xs font-semibold text-[#888] transition-all hover:bg-white/5"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
