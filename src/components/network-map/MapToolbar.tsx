"use client";

import {
  Save,
  Image,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Trash2,
  Link2,
  LayoutGrid,
  Search,
  X,
  Globe,
  ChevronLeft,
  Pencil,
  Type,
  Radar,
} from "lucide-react";
import { useState } from "react";

interface MapToolbarProps {
  mapName: string;
  onSave: () => void;
  onUploadBackground: () => void;
  onSetLiveMap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
  onAddNode: () => void;
  onAddLabel?: () => void;
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
  isImageBg?: boolean;
  bgScale?: number;
  onScaleBg?: (delta: number) => void;
  onEditName?: () => void;
  onOnvifScan?: () => void;
}

function ToolButton({
  onClick,
  title,
  active,
  danger,
  children,
  label,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="group flex items-center gap-1.5 rounded-xl px-2 py-1.5 transition-all duration-150"
      style={{
        background: active
          ? "rgba(59,130,246,0.15)"
          : "transparent",
        border: `1px solid ${
          active ? "rgba(59,130,246,0.35)" : "transparent"
        }`,
        color: danger ? "#f87171" : active ? "#60a5fa" : "#888",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = danger
            ? "rgba(239,68,68,0.08)"
            : "rgba(255,255,255,0.06)";
          (e.currentTarget as HTMLElement).style.color = danger ? "#f87171" : "#ededed";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = danger ? "#f87171" : "#888";
        }
      }}
    >
      {children}
      {label && <span className="text-[10px] font-semibold hidden xl:inline">{label}</span>}
    </button>
  );
}

function Separator() {
  return <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />;
}

export default function MapToolbar({
  mapName,
  onSave,
  onUploadBackground,
  onSetLiveMap,
  onZoomIn,
  onZoomOut,
  onFitView,
  onAutoLayout,
  onAddNode,
  onAddLabel,
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
  isImageBg,
  bgScale,
  onScaleBg,
  onEditName,
  onOnvifScan,
}: MapToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div
      className="absolute top-3 left-3 z-[10000] flex items-center gap-1 rounded-2xl px-2 py-1.5"
      style={{
        right: "340px",
        background: "rgba(10,10,10,0.82)",
        border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
        pointerEvents: "auto",
      }}
    >
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all"
        style={{ color: "#888" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#ededed"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#888"; }}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Mapas
      </button>

      <Separator />

      {/* Map name */}
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[12px] font-bold text-[#ededed] truncate max-w-[160px]">
          {mapName}
        </span>
        {onEditName && (
          <button
            onClick={onEditName}
            className="rounded-md p-0.5 text-[#555] hover:text-[#ededed] hover:bg-white/5 transition-all"
            title="Renombrar mapa"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>

      <Separator />

      {/* Search */}
      {searchOpen ? (
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#555]" />
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
              className="h-7 w-44 rounded-lg pl-7 pr-2 text-[11px] text-[#ededed] placeholder:text-[#555] focus:outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </div>
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(""); onSearch(""); }}
            className="text-[#555] hover:text-[#ededed] p-1"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <ToolButton onClick={() => setSearchOpen(true)} title="Buscar nodo (Ctrl+F)">
          <Search className="h-3.5 w-3.5" />
        </ToolButton>
      )}

      <Separator />

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
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

      <Separator />

      {/* Node/Edge */}
      <div className="flex items-center gap-0.5">
        <ToolButton onClick={onAddNode} title="Agregar nodo" label="Nodo">
          <Plus className="h-3.5 w-3.5" />
        </ToolButton>
        {onAddLabel && (
          <ToolButton onClick={onAddLabel} title="Agregar etiqueta de texto" label="Etiqueta">
            <Type className="h-3.5 w-3.5" />
          </ToolButton>
        )}
        {onOnvifScan && (
          <ToolButton onClick={onOnvifScan} title="Escanear cámaras ONVIF en la red" label="ONVIF">
            <Radar className="h-3.5 w-3.5" />
          </ToolButton>
        )}
        <ToolButton onClick={onToggleConnectMode} title="Modo conexion" active={connectMode} label="Link">
          <Link2 className="h-3.5 w-3.5" />
        </ToolButton>
        {hasSelection && (
          <ToolButton onClick={onDeleteSelected} title="Eliminar seleccion" danger>
            <Trash2 className="h-3.5 w-3.5" />
          </ToolButton>
        )}
      </div>

      <Separator />

      {/* Background */}
      <div className="flex items-center gap-0.5">
        <ToolButton onClick={onUploadBackground} title="Subir imagen de fondo">
          <Image className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton onClick={onSetLiveMap} title="Mapa real (OpenStreetMap)">
          <Globe className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton onClick={onAutoLayout} title="Auto layout">
          <LayoutGrid className="h-3.5 w-3.5" />
        </ToolButton>
      </div>

      {/* Image scale */}
      {isImageBg && onScaleBg && (
        <>
          <Separator />
          <div className="flex items-center gap-0.5">
            <ToolButton onClick={() => onScaleBg(-0.1)} title="Reducir fondo">
              <span className="text-[10px] font-bold leading-none">−</span>
            </ToolButton>
            <span className="text-[9px] text-[#666] font-mono min-w-[30px] text-center">{Math.round((bgScale || 1) * 100)}%</span>
            <ToolButton onClick={() => onScaleBg(0.1)} title="Ampliar fondo">
              <span className="text-[10px] font-bold leading-none">+</span>
            </ToolButton>
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* Navigate Map toggle (livemap) */}
      {isLiveMap && onToggleMapNav && (
        <button
          onClick={onToggleMapNav}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all"
          style={{
            background: mapNavMode ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${mapNavMode ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.06)"}`,
            color: mapNavMode ? "#4ade80" : "#888",
          }}
        >
          <Globe className="h-3.5 w-3.5" />
          {mapNavMode ? "Editando" : "Navegar"}
        </button>
      )}

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[11px] font-bold transition-all"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))",
          border: "1px solid rgba(59,130,246,0.3)",
          color: "#60a5fa",
          boxShadow: "0 2px 12px rgba(59,130,246,0.1)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(59,130,246,0.2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(59,130,246,0.1)";
        }}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? "Guardando..." : "Guardar"}
      </button>
    </div>
  );
}
