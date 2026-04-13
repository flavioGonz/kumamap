"use client";

import { useEffect } from "react";

interface MapKeyboardCallbacks {
  onEscape: () => void;
  onUndo: () => void;
  onSave: () => void;
}

/**
 * Global keyboard shortcuts for the map editor:
 * - Escape: cancel current action (link, polygon, context menu)
 * - Ctrl+Z / Cmd+Z: undo
 * - Ctrl+S / Cmd+S: save
 */
export function useMapKeyboard({ onEscape, onUndo, onSave }: MapKeyboardCallbacks) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        onUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onEscape, onUndo, onSave]);
}
