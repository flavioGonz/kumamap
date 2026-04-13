/**
 * Centralized type definitions for KumaMap
 * Single source of truth for shared interfaces used across client & server code.
 */

// ── Kuma Monitor Types ──

export interface KumaMonitor {
  id: number;
  name: string;
  type: string;
  url: string;
  hostname: string;
  port?: number;
  interval?: number;
  active: boolean;
  parent?: number | null;
  tags?: { name: string; color: string }[];
  status?: number; // 0=down, 1=up, 2=pending, 3=maintenance
  ping?: number | null;
  msg?: string;
  uptime24?: number;
  downTime?: string; // ISO timestamp of when this monitor first went DOWN in the current streak
}

export interface KumaHeartbeat {
  monitorID: number;
  status: number;
  time: string;
  msg: string;
  ping: number | null;
  duration: number;
}

// ── Map Data Types ──

export interface SavedNode {
  id: string;
  kuma_monitor_id?: number | null;
  label: string;
  x: number;
  y: number;
  icon: string;
  custom_data?: string | null;
}

export interface SavedEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  label?: string;
  color?: string;
  custom_data?: string;
}

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

// ── Timeline / Alert Types ──

export interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  status: number;
  prevStatus: number;
  time: string;
  msg: string;
  ping: number | null;
  duration: number;
}
