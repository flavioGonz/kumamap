/**
 * WhatsApp Alert Sender
 * Watches Kuma heartbeats and sends WhatsApp messages on status changes.
 * Called from the KumaClient heartbeat listener (alongside push-sender).
 */

import { getWhatsAppConfig, getEnabledRecipients, isMonitorMuted, getMonitorPhone } from "./whatsapp-config";
import { sendToMany } from "./openwa-client";

// Track previous status per monitor to detect transitions
const prevStatus = new Map<number, number>();

// Throttle: don't re-notify for the same monitor within configured minutes
const lastNotified = new Map<number, number>();

/**
 * Called on every heartbeat. Detects UP↔DOWN transitions and sends WhatsApp.
 */
export function onHeartbeat(
  monitorId: number,
  monitorName: string,
  status: number,
  msg: string,
  _ping: number | null
): void {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled || !cfg.alertsEnabled) return;

  // Per-monitor mute (default: all monitors notify)
  if (isMonitorMuted(monitorId)) return;

  const prev = prevStatus.get(monitorId);
  prevStatus.set(monitorId, status);

  // First heartbeat for this monitor — just record, don't notify
  if (prev === undefined) return;

  // No change → no notification
  if (prev === status) return;

  // Only notify on DOWN (0) or recovery to UP (1)
  if (status !== 0 && status !== 1) return;

  // Throttle
  const now = Date.now();
  const throttleMs = (cfg.throttleMinutes || 5) * 60_000;
  const last = lastNotified.get(monitorId) || 0;
  if (now - last < throttleMs) return;
  lastNotified.set(monitorId, now);

  // General recipients (admin) + per-monitor custom phone (end client), deduped
  const recipients = getEnabledRecipients();
  const customPhone = getMonitorPhone(monitorId);
  const phones = Array.from(
    new Set([...recipients.map((r) => r.phone), ...(customPhone ? [customPhone] : [])])
  );
  if (phones.length === 0) return;

  const isDown = status === 0;
  const emoji = isDown ? "🔴" : "🟢";
  const statusText = isDown ? "CAÍDO" : "RECUPERADO";
  const detail = isDown && msg ? `\nDetalle: ${msg}` : "";
  const time = new Date().toLocaleString("es-UY", { timeZone: "America/Montevideo" });

  const text = `${emoji} *${monitorName}* — ${statusText}${detail}\n🕐 ${time}`;

  // Fire-and-forget — don't block the heartbeat loop
  sendToMany(phones, text)
    .then((results) => {
      const sent = results.filter((r) => r.result.ok).length;
      const failed = results.filter((r) => !r.result.ok).length;
      if (sent > 0 || failed > 0) {
        console.log(
          `[WhatsApp] Alert for ${monitorName}: ${sent}/${results.length} sent (${failed} failed)`
        );
      }
    })
    .catch((err) => {
      console.error("[WhatsApp] Alert send error:", err);
    });
}

/**
 * Generate a text report of current monitor statuses.
 */
export function buildStatusReport(
  monitors: Array<{ name: string; status: number; ping?: number | null; msg?: string }>
): string {
  const time = new Date().toLocaleString("es-UY", { timeZone: "America/Montevideo" });
  const lines = [`📊 *Reporte de Estado KumaMap*`, `🕐 ${time}`, ""];

  const down = monitors.filter((m) => m.status === 0);
  const up = monitors.filter((m) => m.status === 1);
  const other = monitors.filter((m) => m.status !== 0 && m.status !== 1);

  if (down.length > 0) {
    lines.push(`🔴 *Caídos (${down.length}):*`);
    for (const m of down) {
      lines.push(`  • ${m.name}${m.msg ? ` — ${m.msg}` : ""}`);
    }
    lines.push("");
  }

  if (up.length > 0) {
    lines.push(`🟢 *Activos (${up.length}):*`);
    for (const m of up) {
      const ping = m.ping != null ? ` (${m.ping}ms)` : "";
      lines.push(`  • ${m.name}${ping}`);
    }
    lines.push("");
  }

  if (other.length > 0) {
    lines.push(`⚪ *Otros (${other.length}):*`);
    for (const m of other) {
      const label = m.status === 2 ? "Pendiente" : m.status === 3 ? "Mantenimiento" : `Estado ${m.status}`;
      lines.push(`  • ${m.name} — ${label}`);
    }
    lines.push("");
  }

  lines.push(`Total: ${monitors.length} monitores`);
  return lines.join("\n");
}
