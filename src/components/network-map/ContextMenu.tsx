"use client";

import { useState, useRef, useEffect } from "react";
import {
  Pencil, Trash2, Copy, Link2, Maximize2,
  Palette, Plus, Server, RotateCcw, Type, Signal, Scaling, Clock, ExternalLink, FolderOpen,
  Clipboard, Activity, ChevronRight, AlignLeft,
} from "lucide-react";

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  colorDot?: string;
  submenu?: boolean;        // signals this is a submenu opener (visual hint)
  children?: MenuItem[];    // nested submenu items
  active?: boolean;         // highlight current selection in a group
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let nx = x, ny = y;
      if (x + rect.width > window.innerWidth - 8) nx = window.innerWidth - rect.width - 8;
      if (y + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8;
      if (nx < 4) nx = 4;
      if (ny < 4) ny = 4;
      setAdjustedPos({ x: nx, y: ny });
    }
  }, [x, y]);

  const renderItem = (item: MenuItem, i: number) => {
    if (item.divider && !item.label) {
      return <div key={i} className="my-1 mx-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />;
    }
    const isLink = item.label.startsWith("Link →") || item.label.startsWith("Abrir:");
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={i} className="relative">
        {item.divider && (
          <div className="my-1 mx-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
        )}
        <button
          onClick={() => {
            if (hasChildren) {
              setOpenSub(openSub === i ? null : i);
              return;
            }
            item.onClick();
            onClose();
          }}
          onMouseEnter={(e) => {
            if (hasChildren) setOpenSub(i);
            (e.currentTarget as HTMLElement).style.background = item.danger
              ? "rgba(239,68,68,0.1)"
              : isLink
              ? "rgba(59,130,246,0.1)"
              : "rgba(255,255,255,0.05)";
            (e.currentTarget as HTMLElement).style.color = item.danger ? "#f87171" : "#ededed";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = item.danger ? "#ef4444" : isLink ? "#60a5fa" : item.active ? "#ededed" : "#a0a0a0";
          }}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-all rounded-md mx-0"
          style={{ color: item.danger ? "#ef4444" : isLink ? "#60a5fa" : item.active ? "#ededed" : "#a0a0a0" }}
        >
          {item.colorDot ? (
            <span
              className="inline-block h-3 w-3 rounded-full flex-shrink-0"
              style={{ background: item.colorDot, border: "1px solid rgba(255,255,255,0.2)" }}
            />
          ) : (
            <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="truncate max-w-[180px] flex-1 text-left">{item.label}</span>
          {hasChildren && <ChevronRight className="h-3 w-3 opacity-40 flex-shrink-0" />}
        </button>
        {/* Submenu flyout */}
        {hasChildren && openSub === i && (
          <div
            className="absolute left-full top-0 ml-1 min-w-[160px] rounded-xl py-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
            style={{
              background: "rgba(18,18,18,0.98)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
            }}
            onMouseLeave={() => setOpenSub(null)}
          >
            {item.children!.map((child, ci) => (
              <button
                key={ci}
                onClick={() => { child.onClick(); onClose(); }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-all rounded-md mx-0"
                style={{ color: child.active ? "#ededed" : "#a0a0a0" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLElement).style.color = "#ededed";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = child.active ? "#ededed" : "#a0a0a0";
                }}
              >
                {child.colorDot ? (
                  <span
                    className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                    style={{ background: child.colorDot, border: child.active ? "2px solid #ededed" : "1px solid rgba(255,255,255,0.2)" }}
                  />
                ) : (
                  <child.icon className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                <span className="truncate max-w-[140px]">{child.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[180px] rounded-xl py-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
        style={{
          left: adjustedPos.x,
          top: adjustedPos.y,
          background: "rgba(18,18,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
        }}
      >
        {items.map(renderItem)}
      </div>
    </>
  );
}

// Helper to build common menu items
export const menuIcons = { Pencil, Trash2, Copy, Link2, Maximize2, Palette, Plus, Server, RotateCcw, Type, Signal, Scaling, Clock, ExternalLink, FolderOpen, Clipboard, Activity, AlignLeft };
