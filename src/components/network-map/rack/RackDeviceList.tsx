"use client";

import React from "react";
import { motion } from "framer-motion";
import { Plus, Server, Trash2, Inbox } from "lucide-react";
import { TYPE_META } from "./rack-constants";
import { RackDevice, StatusInfo } from "./rack-types";

export function EmptySlotPanel({
  unit, onAdd, onClose,
}: {
  unit: number;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.16 }}
      className="flex-1 flex flex-col items-center justify-center p-8 gap-6"
    >
      {/* Icon + label */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1.5px dashed rgba(255,255,255,0.12)",
          }}
        >
          <Inbox className="w-7 h-7" style={{ color: "rgba(255,255,255,0.2)" }} />
        </div>

        <div className="text-center">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono font-bold mb-2"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>U</span>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{unit}</span>
          </div>
          <p className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>
            Slot vacío — sin asignación
          </p>
          <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
            Este espacio del rack está disponible
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="flex flex-col items-center gap-2 w-full max-w-[220px]">
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all cursor-pointer"
          style={{
            background: "linear-gradient(135deg,#2563eb,#4f46e5)",
            boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
          }}
        >
          <Plus className="w-4 h-4" />
          Agregar equipo en U{unit}
        </button>
        <button
          onClick={onClose}
          className="text-xs cursor-pointer transition-colors"
          style={{ color: "rgba(255,255,255,0.25)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
        >
          ← Volver a la lista
        </button>
      </div>
    </motion.div>
  );
}

export default function DeviceList({
  devices, selectedDeviceId, isLocked, onSelect, onAdd, onDelete, getStatusInfo, onWizard,
}: {
  devices: RackDevice[];
  selectedDeviceId: string | null;
  isLocked: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  getStatusInfo: (monitorId?: number | null) => { color: string; name: string };
  onWizard?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.16 }}
      className="flex-1 overflow-y-auto rack-scroll p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white/70">Equipos en el Rack</h3>
          {!isLocked && onWizard && (
            <button
              onClick={onWizard}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110 cursor-pointer"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
              title="Asistente de configuración"
            >
              {/* Wizard hat icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L9 10H3L12 22L21 10H15L12 2Z" fill="rgba(99,102,241,0.3)" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 2L10 7L12 6L14 7L12 2Z" fill="#818cf8" />
                <path d="M6 18H18" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="5" r="1" fill="#c4b5fd" />
                <circle cx="10" cy="12" r="0.7" fill="#c4b5fd" opacity="0.6" />
                <circle cx="14" cy="14" r="0.7" fill="#c4b5fd" opacity="0.6" />
              </svg>
            </button>
          )}
        </div>
        {!isLocked && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all cursor-pointer"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }}
          >
            <Plus className="w-3.5 h-3.5" /> Agregar Equipo
          </button>
        )}
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 gap-3" style={{ color: "rgba(255,255,255,0.2)" }}>
          <Server className="w-12 h-12" />
          <p className="text-sm text-center">Haz clic en un slot del rack<br />para agregar equipos</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {[...devices].sort((a, b) => b.unit - a.unit).map(d => {
            const meta = TYPE_META[d.type] || TYPE_META.other;
            const si = getStatusInfo(d.monitorId);
            const isSel = selectedDeviceId === d.id;
            return (
              <div
                key={d.id}
                onClick={() => onSelect(d.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer border transition-all group"
                style={{
                  background: isSel ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                  border: isSel ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: d.color || meta.color }}
                >
                  <span className="text-white/90">{meta.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>{d.label}</span>
                    {d.model && <span className="text-[10px] text-white/30 truncate">{d.model}</span>}
                    {d.monitorId && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: si.color, boxShadow: `0 0 6px ${si.color}88` }}
                        title={si.name}
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-white/35">
                    {meta.label} · U{d.unit}{d.sizeUnits > 1 ? `–U${d.unit + d.sizeUnits - 1}` : ""} · {d.sizeUnits}U
                    {d.managementIp && <span className="ml-1.5 font-mono text-white/25">{d.managementIp}</span>}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(d.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
