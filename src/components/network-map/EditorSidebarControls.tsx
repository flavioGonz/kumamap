"use client";

import React from "react";
import { Plus } from "lucide-react";
import Tooltip from "./Tooltip";

interface EditorSidebarControlsProps {
  sidebarWidth: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  showNodes: boolean;
  setShowNodes: React.Dispatch<React.SetStateAction<boolean>>;
  showEdges: boolean;
  setShowEdges: React.Dispatch<React.SetStateAction<boolean>>;
  showCameras: boolean;
  setShowCameras: React.Dispatch<React.SetStateAction<boolean>>;
  showLabels: boolean;
  setShowLabels: React.Dispatch<React.SetStateAction<boolean>>;
  panelCollapsed: boolean;
  setPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  timeMachineOpen: boolean;
  setTimeMachineOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function EditorSidebarControls({
  sidebarWidth,
  onZoomIn,
  onZoomOut,
  onFitView,
  showNodes,
  setShowNodes,
  showEdges,
  setShowEdges,
  showCameras,
  setShowCameras,
  showLabels,
  setShowLabels,
  panelCollapsed,
  setPanelCollapsed,
  timeMachineOpen,
  setTimeMachineOpen,
}: EditorSidebarControlsProps) {
  return (
    <div className="fixed top-1/2 -translate-y-1/2 flex flex-col gap-1 rounded-xl p-1 shadow-2xl backdrop-blur-3xl shrink-0"
      style={{
        zIndex: 10000,
        right: sidebarWidth + 12,
        background: "rgba(10,10,10,0.85)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        transition: "right 0.3s ease",
      }}>
      <Tooltip content="Acercar" placement="left">
        <button onClick={onZoomIn}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-[#ededed] hover:bg-white/10 transition-all">
          <Plus className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content="Alejar" placement="left">
        <button onClick={onZoomOut}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-[#ededed] hover:bg-white/10 transition-all">
          <svg width="12" height="2" viewBox="0 0 24 2" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><line x1="2" y1="1" x2="22" y2="1"/></svg>
        </button>
      </Tooltip>
      <Tooltip content="Ajustar vista" placement="left">
        <button onClick={onFitView}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#ededed] hover:bg-white/10 transition-all">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/></svg>
        </button>
      </Tooltip>

      <div className="mx-1 h-px bg-white/10 my-0.5" />

      <Tooltip content={showNodes ? "Ocultar nodos" : "Mostrar nodos"} placement="left">
        <button onClick={() => setShowNodes(v => !v)}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all hover:bg-white/10" style={{ color: showNodes ? "#22c55e" : "#888" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
        </button>
      </Tooltip>
      <Tooltip content={showEdges ? "Ocultar links" : "Mostrar links"} placement="left">
        <button onClick={() => setShowEdges(v => !v)}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all hover:bg-white/10" style={{ color: showEdges ? "#3b82f6" : "#888" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
      </Tooltip>
      <Tooltip content={showCameras ? "Ocultar cámaras" : "Mostrar cámaras"} placement="left">
        <button onClick={() => setShowCameras(v => !v)}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all hover:bg-white/10" style={{ color: showCameras ? "#f59e0b" : "#888" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
        </button>
      </Tooltip>
      <Tooltip content={showLabels ? "Ocultar etiquetas" : "Mostrar etiquetas"} placement="left">
        <button onClick={() => setShowLabels(v => !v)}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all hover:bg-white/10" style={{ color: showLabels ? "#e2e8f0" : "#888" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
        </button>
      </Tooltip>

      <div className="mx-1 h-px bg-white/10 my-0.5" />

      <Tooltip content={panelCollapsed ? "Mostrar monitores" : "Ocultar monitores"} placement="left">
        <button onClick={() => setPanelCollapsed(v => !v)}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
          style={{ color: !panelCollapsed ? "#60a5fa" : "#888" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
        </button>
      </Tooltip>
      <Tooltip content={timeMachineOpen ? "Cerrar TimeMachine" : "Abrir TimeMachine"} placement="left">
        <button onClick={() => setTimeMachineOpen(v => !v)}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
          style={{ color: timeMachineOpen ? "#a78bfa" : "#888" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </button>
      </Tooltip>
    </div>
  );
}
