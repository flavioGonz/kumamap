"use client";

import {
  Save,
  Image,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Trash2,
  Link2,
  LayoutGrid,
  ArrowLeft,
  Search,
  X,
  Globe,
} from "lucide-react";
import { useState } from "react";

interface MapToolbarProps {
  mapName: string;
  onSave: () => void;
  onUploadBackground: () => void;
  onSetGrid: () => void;
  onSetLiveMap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
  onAddNode: () => void;
  onDeleteSelected: () => void;
  onToggleConnectMode: () => void;
  onBack: () => void;
  onSearch: (query: string) => void;
  connectMode: boolean;
  saving: boolean;
  hasSelection: boolean;
  mapNavMode?: boolean;
  onToggleMapNav?: () => void;
  isLiveMap?: boolean;
}

function ToolButton({
  onClick,
  title,
  active,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
      style={{
        background: active
          ? "rgba(59,130,246,0.2)"
          : "rgba(255,255,255,0.04)",
        border: `1px solid ${
          active ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"
        }`,
        color: danger ? "#ef4444" : active ? "#60a5fa" : "#a0a0a0",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.04)";
      }}
    >
      {children}
    </button>
  );
}

export default function MapToolbar({
  mapName,
  onSave,
  onUploadBackground,
  onSetGrid,
  onSetLiveMap,
  onZoomIn,
  onZoomOut,
  onFitView,
  onAutoLayout,
  onAddNode,
  onDeleteSelected,
  onToggleConnectMode,
  onBack,
  onSearch,
  connectMode,
  saving,
  hasSelection,
  mapNavMode,
  onToggleMapNav,
  isLiveMap,
}: MapToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div
      className="absolute top-0 left-0 right-80 z-10 flex items-center gap-2 px-3 py-2"
      style={{
        background: "rgba(10,10,10,0.9)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#a0a0a0] hover:text-[#ededed] hover:bg-white/5 transition-all"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Mapas
      </button>

      <div
        className="h-5 w-px"
        style={{ background: "rgba(255,255,255,0.08)" }}
      />

      <span className="text-sm font-bold text-[#ededed] truncate max-w-[180px]">
        {mapName}
      </span>

      <div
        className="h-5 w-px"
        style={{ background: "rgba(255,255,255,0.08)" }}
      />

      {/* Search */}
      {searchOpen ? (
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#737373]" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar nodo..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                  onSearch("");
                }
              }}
              className="h-8 w-48 rounded-lg pl-7 pr-2 text-xs text-[#ededed] placeholder:text-[#737373] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </div>
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
              onSearch("");
            }}
            className="text-[#737373] hover:text-[#ededed]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <ToolButton
          onClick={() => setSearchOpen(true)}
          title="Buscar nodo (Ctrl+F)"
        >
          <Search className="h-3.5 w-3.5" />
        </ToolButton>
      )}

      <div
        className="h-5 w-px"
        style={{ background: "rgba(255,255,255,0.08)" }}
      />

      {/* Canvas controls */}
      <div className="flex items-center gap-1">
        <ToolButton onClick={onZoomIn} title="Zoom In">
          <ZoomIn className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton onClick={onZoomOut} title="Zoom Out">
          <ZoomOut className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton onClick={onFitView} title="Ajustar vista">
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolButton>
      </div>

      <div
        className="h-5 w-px"
        style={{ background: "rgba(255,255,255,0.08)" }}
      />

      {/* Node/Edge controls */}
      <div className="flex items-center gap-1">
        <ToolButton onClick={onAddNode} title="Agregar nodo">
          <Plus className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          onClick={onToggleConnectMode}
          title="Modo conexion"
          active={connectMode}
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolButton>
        {hasSelection && (
          <ToolButton onClick={onDeleteSelected} title="Eliminar" danger>
            <Trash2 className="h-3.5 w-3.5" />
          </ToolButton>
        )}
      </div>

      <div
        className="h-5 w-px"
        style={{ background: "rgba(255,255,255,0.08)" }}
      />

      {/* Background */}
      <div className="flex items-center gap-1">
        <ToolButton onClick={onUploadBackground} title="Subir fondo">
          <Image className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton onClick={onSetGrid} title="Fondo grilla">
          <Grid3X3 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton onClick={onSetLiveMap} title="Mapa real (OpenStreetMap)">
          <Globe className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton onClick={onAutoLayout} title="Auto layout">
          <LayoutGrid className="h-3.5 w-3.5" />
        </ToolButton>
      </div>

      <div className="flex-1" />

      {/* Navigate Map toggle (only for livemap) */}
      {isLiveMap && onToggleMapNav && (
        <button
          onClick={onToggleMapNav}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: mapNavMode ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${mapNavMode ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.08)"}`,
            color: mapNavMode ? "#4ade80" : "#a0a0a0",
          }}
          title={mapNavMode ? "Volver a editar nodos" : "Navegar y hacer zoom en el mapa de fondo"}
        >
          <Globe className="h-3.5 w-3.5" />
          {mapNavMode ? "Editando Mapa" : "Navegar Mapa"}
        </button>
      )}

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all"
        style={{
          background: saving
            ? "rgba(59,130,246,0.1)"
            : "rgba(59,130,246,0.15)",
          border: "1px solid rgba(59,130,246,0.3)",
          color: "#60a5fa",
        }}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? "Guardando..." : "Guardar"}
      </button>
    </div>
  );
}
