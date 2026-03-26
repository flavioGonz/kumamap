"use client";

import {
  Pencil, Trash2, Copy, Link2, Maximize2,
  Palette, Plus, Server, RotateCcw, Type, Signal,
} from "lucide-react";

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />

      {/* Menu */}
      <div
        className="fixed z-50 min-w-[180px] rounded-xl py-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
        style={{
          left: x,
          top: y,
          background: "rgba(18,18,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
        }}
      >
        {items.map((item, i) => {
          // Divider-only separator
          if (item.divider && !item.label) {
            return <div key={i} className="my-1 mx-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />;
          }
          const isLink = item.label.startsWith("Link →");
          return (
            <div key={i}>
              {item.divider && (
                <div className="my-1 mx-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
              )}
              <button
                onClick={() => { item.onClick(); onClose(); }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-all rounded-md mx-0"
                style={{ color: item.danger ? "#ef4444" : isLink ? "#60a5fa" : "#a0a0a0" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = item.danger
                    ? "rgba(239,68,68,0.1)"
                    : isLink
                    ? "rgba(59,130,246,0.1)"
                    : "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLElement).style.color = item.danger ? "#f87171" : "#ededed";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = item.danger ? "#ef4444" : isLink ? "#60a5fa" : "#a0a0a0";
                }}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span className="truncate max-w-[180px]">{item.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Helper to build common menu items
export const menuIcons = { Pencil, Trash2, Copy, Link2, Maximize2, Palette, Plus, Server, RotateCcw, Type, Signal };
