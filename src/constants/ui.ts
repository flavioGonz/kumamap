/**
 * Centralized UI constants — colors, status mappings, device types
 * Import from here instead of defining locally in each component.
 */

// ── Monitor Status Colors ──
// 0=down(red), 1=up(green), 2=pending(yellow), 3=maintenance(purple)
export const STATUS_COLORS: Record<number, string> = {
  0: "#ef4444",
  1: "#22c55e",
  2: "#f59e0b",
  3: "#8b5cf6",
};

// ── Status Labels & UI Metadata ──
// Used by AlertManagerPanel, alerts page, and timeline components
export const STATUS_MAP: Record<number, { label: string; color: string; bg: string; icon: string }> = {
  0: { label: "CAÍDO",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",  icon: "▼" },
  1: { label: "ACTIVO",    color: "#22c55e", bg: "rgba(34,197,94,0.10)",  icon: "▲" },
  2: { label: "PENDIENTE", color: "#f59e0b", bg: "rgba(245,158,11,0.10)", icon: "●" },
  3: { label: "MANT.",     color: "#6366f1", bg: "rgba(99,102,241,0.10)", icon: "◆" },
};

// ── Default gray for unknown status ──
export const STATUS_COLOR_DEFAULT = "#6b7280";

// ── Rack Device Status Colors ──
export const RACK_STATUS_COLORS: Record<string, string> = {
  active: "#059669",
  inactive: "#DC2626",
  backup: "#D97706",
};
