import type { KumaMonitor } from "@/components/network-map/MonitorPanel";

export const statusColors: Record<number, string> = {
  0: "#ef4444",
  1: "#22c55e",
  2: "#f59e0b",
  3: "#8b5cf6",
};

export function getStatusColor(
  monitorId: number | null,
  monitorIndex: Map<number, KumaMonitor>,
): string {
  if (monitorId == null) return "#6b7280";
  const m = monitorIndex.get(monitorId);
  if (!m) return "#6b7280";
  if (!m.active) return "#6b7280";
  if (m.status == null) return "#6b7280";
  if (m.status === 0) return "#ef4444";
  if (m.status === 2) return "#f59e0b";
  if (m.status === 3) return "#8b5cf6";
  return "#22c55e";
}

export function getMonitorData(
  monitorId: number | null,
  monitorIndex: Map<number, KumaMonitor>,
): KumaMonitor | undefined {
  if (monitorId == null) return undefined;
  return monitorIndex.get(monitorId);
}
