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

// ---- Corte global anti-saturacion --------------------------------------
// Agrupa alertas y envia como maximo 1 mensaje de WhatsApp por ventana
// (default 5 min, configurable con globalThrottleMinutes en whatsapp-config).
let lastGlobalSend = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAlerts: { name: string; isDown: boolean; msg: string; time: string; phones: string[] }[] = [];

function flushAlerts(): void {
  flushTimer = null;
  if (pendingAlerts.length === 0) return;
  lastGlobalSend = Date.now();
  const items = pendingAlerts.splice(0);
  const phones = Array.from(new Set(items.flatMap((a) => a.phones)));
  if (phones.length === 0) return;
  let text: string;
  if (items.length === 1) {
    const a = items[0];
    text = `${a.isDown ? "\u{1F534}" : "\u{1F7E2}"} *${a.name}* - ${a.isDown ? "CAIDO" : "RECUPERADO"}${a.isDown && a.msg ? `\nDetalle: ${a.msg}` : ""}\n\u{1F550} ${a.time}`;
  } else {
    const down = items.filter((i) => i.isDown);
    const up = items.filter((i) => !i.isDown);
    const lines = [`\u{26A0}\u{FE0F} *${items.length} cambios de estado* (agrupados)`];
    if (down.length) { lines.push("", `\u{1F534} *Caidos (${down.length}):*`); down.forEach((d) => lines.push(`   ${d.name}${d.msg ? " - " + d.msg : ""}`)); }
    if (up.length) { lines.push("", `\u{1F7E2} *Recuperados (${up.length}):*`); up.forEach((u) => lines.push(`   ${u.name}`)); }
    lines.push("", `\u{1F550} ${items[items.length - 1].time}`);
    text = lines.join("\n");
  }
  sendToMany(phones, text)
    .then((results) => {
      const sent = results.filter((r) => r.result.ok).length;
      console.log(`[WhatsApp] Envio agrupado: ${items.length} alerta(s), ${sent}/${results.length} destinatarios OK`);
    })
    .catch((err) => console.error("[WhatsApp] Error en envio agrupado:", err));
}

function enqueueAlert(alert: { name: string; isDown: boolean; msg: string; time: string; phones: string[] }, windowMinutes: number): void {
  pendingAlerts.push(alert);
  const winMs = Math.max(1, windowMinutes) * 60_000;
  const now = Date.now();
  if (now - lastGlobalSend >= winMs) {
    flushAlerts();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushAlerts, lastGlobalSend + winMs - now);
  }
}

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

  // Salir de una ventana de mantenimiento no es una recuperación: el servicio
  // no falló, lo bajamos nosotros. Avisar "recuperado" ahí es una falsa alarma.
  if (prev === 3) return;

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
  // Corte global anti-saturacion: agrupa y envia max 1 mensaje por ventana
  void text;
  enqueueAlert({ name: monitorName, isDown, msg: isDown ? (msg || "") : "", time, phones }, (cfg as any).globalThrottleMinutes || 5);
  return;
  // envio directo legacy (inalcanzable; reemplazado por el corte global)
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
