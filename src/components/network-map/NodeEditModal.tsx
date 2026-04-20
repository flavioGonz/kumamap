"use client";

import React, { useState as useReactState } from "react";
import { Pencil } from "lucide-react";
import Tooltip from "./Tooltip";
import MikrotikStatusPanel from "./rack/MikrotikStatusPanel";

const NODE_COLORS = [
  { color: "", name: "Auto" },
  { color: "#22c55e", name: "Verde" },
  { color: "#3b82f6", name: "Azul" },
  { color: "#ef4444", name: "Rojo" },
  { color: "#f59e0b", name: "Naranja" },
  { color: "#8b5cf6", name: "Violeta" },
  { color: "#ec4899", name: "Rosa" },
  { color: "#06b6d4", name: "Cyan" },
  { color: "#facc15", name: "Amarillo" },
  { color: "#ffffff", name: "Blanco" },
];

export interface NodeEditConfig {
  nodeId: string;
  initial: string;
  mac?: string;
  ip?: string;
  credUser?: string;
  credPass?: string;
  labelHidden?: boolean;
  labelSize?: number;
  nodeColor?: string;
}

export interface NodeEditModalProps {
  config: NodeEditConfig;
  showPass: boolean;
  /** Called when any field in the config changes */
  onConfigChange: (updater: (prev: NodeEditConfig) => NodeEditConfig) => void;
  onShowPassToggle: () => void;
  /** Called with the final form values when the user clicks "Guardar" */
  onSubmit: (values: {
    name: string;
    mac?: string;
    ip?: string;
    credUser?: string;
    credPass?: string;
    labelHidden?: boolean;
    labelSize?: number;
    nodeColor?: string;
  }) => void;
  onClose: () => void;
}

export default function NodeEditModal({
  config,
  showPass,
  onConfigChange,
  onShowPassToggle,
  onSubmit,
  onClose,
}: NodeEditModalProps) {
  const editName = config.initial;
  const setEditName = (v: string) => onConfigChange((c) => ({ ...c, initial: v }));
  const editMac = config.mac || "";
  const setEditMac = (v: string) => onConfigChange((c) => ({ ...c, mac: v }));
  const editIp = config.ip || "";
  const setEditIp = (v: string) => onConfigChange((c) => ({ ...c, ip: v }));
  const editUser = config.credUser || "";
  const setEditUser = (v: string) => onConfigChange((c) => ({ ...c, credUser: v }));
  const editPass = config.credPass || "";
  const setEditPass = (v: string) => onConfigChange((c) => ({ ...c, credPass: v }));
  const editLabelHidden = config.labelHidden ?? false;
  const setEditLabelHidden = (v: boolean) => onConfigChange((c) => ({ ...c, labelHidden: v }));
  const editLabelSize = config.labelSize ?? 12;
  const setEditLabelSize = (v: number) => onConfigChange((c) => ({ ...c, labelSize: v }));
  const editNodeColor = config.nodeColor || "";
  const setEditNodeColor = (v: string) => onConfigChange((c) => ({ ...c, nodeColor: v }));

  const handleSubmit = () => {
    if (editName.trim()) {
      onSubmit({
        name: editName.trim(),
        mac: editMac.trim() || undefined,
        ip: editIp.trim() || undefined,
        credUser: editUser.trim() || undefined,
        credPass: editPass.trim() || undefined,
        labelHidden: editLabelHidden || undefined,
        labelSize: editLabelSize !== 12 ? editLabelSize : undefined,
        nodeColor: editNodeColor || undefined,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, rgba(18,18,18,0.99), rgba(10,10,10,0.99))",
          border: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}
          >
            <Pencil className="h-4 w-4 text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-[#ededed] flex-1">Editar Nodo</h3>
          <button onClick={onClose} className="text-[#555] hover:text-[#ededed] text-lg">
            &times;
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto"
        >
          {/* Nombre */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#666] block mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nombre del nodo..."
              autoFocus
              className="w-full rounded-xl px-3.5 py-2 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          {/* Etiqueta */}
          <div
            className="rounded-xl p-3 space-y-2.5"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-1">
              Etiqueta en mapa
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#aaa]">Mostrar etiqueta</span>
              <button
                type="button"
                onClick={() => setEditLabelHidden(!editLabelHidden)}
                className="relative h-5 w-9 rounded-full transition-colors"
                style={{ background: editLabelHidden ? "rgba(255,255,255,0.08)" : "rgba(59,130,246,0.5)" }}
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full transition-all bg-white shadow-sm"
                  style={{ left: editLabelHidden ? "2px" : "20px" }}
                />
              </button>
            </div>
            {!editLabelHidden && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-[#aaa]">Tamaño de fuente</span>
                  <span className="text-[11px] font-mono text-[#60a5fa]">{editLabelSize}px</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="24"
                  step="1"
                  value={editLabelSize}
                  onChange={(e) => setEditLabelSize(parseInt(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 ${((editLabelSize - 8) / 16) * 100}%, #333 0%)`,
                  }}
                />
                <div className="flex justify-between text-[9px] text-[#444] mt-0.5">
                  <span>8px</span>
                  <span>16px</span>
                  <span>24px</span>
                </div>
              </div>
            )}
          </div>

          {/* Color del nodo */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#666] block mb-2">
              Color del nodo
            </label>
            <div className="flex flex-wrap gap-2">
              {NODE_COLORS.map((c) => (
                <Tooltip key={c.color} content={c.name}>
                  <button
                    type="button"
                    onClick={() => setEditNodeColor(c.color)}
                    className="relative h-7 w-7 rounded-lg transition-all hover:scale-110"
                    style={{
                      background: c.color || "rgba(255,255,255,0.08)",
                      border: editNodeColor === c.color ? "2px solid #fff" : "2px solid rgba(255,255,255,0.1)",
                      boxShadow: editNodeColor === c.color ? `0 0 10px ${c.color || "#fff"}88` : "none",
                    }}
                  >
                    {!c.color && (
                      <span className="text-[8px] font-bold text-[#888] flex items-center justify-center h-full">
                        AUTO
                      </span>
                    )}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Red */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#666] block mb-1">
                MAC Address
              </label>
              <input
                type="text"
                value={editMac}
                onChange={(e) => setEditMac(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#666] block mb-1">
                IP Address
              </label>
              <input
                type="text"
                value={editIp}
                onChange={(e) => setEditIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          </div>

          {/* Credenciales */}
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-1">
              Credenciales del dispositivo
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#666] block mb-1">Usuario</label>
                <input
                  type="text"
                  value={editUser}
                  onChange={(e) => setEditUser(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
              <div>
                <label className="text-[10px] text-[#666] block mb-1">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={editPass}
                    onChange={(e) => setEditPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl px-3 py-2 pr-8 text-xs text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <button
                    type="button"
                    onClick={onShowPassToggle}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#aaa]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showPass ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[9px] text-[#444] leading-relaxed">
              Las credenciales se guardan localmente en el mapa. No se envían a ningún servidor externo.
            </p>
          </div>

          {/* MikroTik live panel — only shows when IP + credentials are present */}
          {editIp && editUser && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)" }}
            >
              <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(139,92,246,0.08)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#8b5cf6" }}>MikroTik REST API</span>
              </div>
              <MikrotikStatusPanel ip={editIp} user={editUser} password={editPass} compact />
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl py-2 text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl py-2 text-xs font-bold"
              style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
