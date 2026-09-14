"use client";

import React from "react";
import {
  Server, Network, Zap, Settings, Phone, Inbox, Router, Cable, Video,
} from "lucide-react";

// ── Device type metadata ──────────────────────────────────────────────────────

export const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  server:            { label: "Servidor",            icon: React.createElement(Server, { className: "w-4 h-4" }),   color: "#3b82f6" },
  switch:            { label: "Switch",              icon: React.createElement(Network, { className: "w-4 h-4" }),  color: "#10b981" },
  patchpanel:        { label: "Patch Panel",         icon: React.createElement(Cable, { className: "w-4 h-4" }),    color: "#8b5cf6" },
  ups:               { label: "UPS / Energía",       icon: React.createElement(Zap, { className: "w-4 h-4" }),      color: "#f59e0b" },
  router:            { label: "Router",              icon: React.createElement(Router, { className: "w-4 h-4" }),   color: "#ef4444" },
  pdu:               { label: "PDU",                 icon: React.createElement(Zap, { className: "w-4 h-4" }),      color: "#f97316" },
  pbx:               { label: "PBX / Telefonía",    icon: React.createElement(Phone, { className: "w-4 h-4" }),    color: "#06b6d4" },
  nvr:               { label: "NVR / Grabador",      icon: React.createElement(Video, { className: "w-4 h-4" }),   color: "#e11d48" },
  "tray-fiber":      { label: "Bandeja de Fibra",    icon: React.createElement(Inbox, { className: "w-4 h-4" }),   color: "#d946ef" },
  "tray-1u":         { label: "Bandeja 1U",          icon: React.createElement(Inbox, { className: "w-4 h-4" }),   color: "#52525b" },
  "tray-2u":         { label: "Bandeja 2U",          icon: React.createElement(Inbox, { className: "w-4 h-4" }),   color: "#52525b" },
  "cable-organizer": { label: "Organizador de Cable", icon: React.createElement(Cable, { className: "w-4 h-4" }),  color: "#78716c" },
  other:             { label: "Otro",                icon: React.createElement(Settings, { className: "w-4 h-4" }), color: "#6b7280" },
};

// ── Option lists ──────────────────────────────────────────────────────────────

export const UNIT_OPTIONS = [3, 6, 9, 12, 18, 22, 24, 42, 45, 48];
export const CABLE_LENGTHS = ["0.5m", "1m", "1.5m", "2m", "3m", "5m", "7m", "10m", "15m", "20m"];
export const CABLE_PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#a8a8a8", "#f5f5f5"];
export const SWITCH_SPEEDS = ["10", "100", "1G", "10G"] as const;
export const POE_TYPES = ["802.3af", "802.3at", "802.3bt"] as const;
export const ROUTER_IF_TYPES = ["WAN", "LAN", "MGMT", "DMZ", "VPN", "other"] as const;
export const NVR_CODECS = ["H.264", "H.265", "H.265+", "MJPEG", "other"] as const;
export const NVR_PROTOCOLS = ["ONVIF", "RTSP", "proprietary", "other"] as const;
export const NVR_RECORDINGS = ["continuous", "motion", "schedule", "alarm", "off"] as const;
export const NVR_DISK_STATUSES = ["healthy", "degraded", "failed", "empty"] as const;
export const NVR_RESOLUTIONS = ["4K (3840×2160)", "5MP (2592×1944)", "4MP (2560×1440)", "1080p (1920×1080)", "720p (1280×720)", "D1 (704×480)"] as const;

// ── Color maps ────────────────────────────────────────────────────────────────

export const SPEED_COLOR: Record<string, string> = {
  "10": "#52525b", "100": "#3b82f6", "1G": "#10b981", "10G": "#f59e0b",
};

export const DISK_STATUS_COLOR: Record<string, string> = {
  healthy: "#22c55e", degraded: "#f59e0b", failed: "#ef4444", empty: "#52525b",
};

export const RECORDING_COLOR: Record<string, string> = {
  continuous: "#22c55e", motion: "#3b82f6", schedule: "#f59e0b", alarm: "#ef4444", off: "#52525b",
};

export const IF_TYPE_COLOR: Record<string, string> = {
  WAN: "#ef4444", LAN: "#22c55e", MGMT: "#f59e0b", DMZ: "#f97316", VPN: "#8b5cf6", other: "#6b7280",
};

// ── Shared inline styles ──────────────────────────────────────────────────────

export const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: "7px 12px",
  fontSize: 13,
  color: "rgba(255,255,255,0.85)",
  outline: "none",
};

export const miniFieldStyle: React.CSSProperties = {
  ...fieldStyle,
  padding: "4px 8px",
  fontSize: 11,
};

export const toggleTrack = (on: boolean, accentColor = "#22c55e"): React.CSSProperties => ({
  width: 36,
  height: 20,
  borderRadius: 10,
  background: on ? accentColor : "#333",
  position: "relative",
  cursor: "pointer",
  transition: "background 0.2s",
  flexShrink: 0,
  border: "none",
  padding: 0,
});

export const toggleThumb = (on: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 2,
  left: on ? "calc(100% - 18px)" : 2,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  transition: "left 0.2s",
});
