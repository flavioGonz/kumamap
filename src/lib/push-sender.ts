/**
 * Push Notification Sender
 * Watches Kuma heartbeats and sends push notifications on status changes.
 * Called from the KumaClient heartbeat listener.
 */

import webpush from "web-push";
import { getAllSubscriptions, removeSubscription } from "./push-store";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@kumamap.local";

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidConfigured = true;
    console.log("[push] VAPID configured successfully");
    return true;
  } catch (err) {
    console.error("[push] VAPID config error:", err);
    return false;
  }
}

// Track previous status per monitor to detect transitions
const prevStatus = new Map<number, number>();

// Throttle: don't re-notify for the same monitor within 60s
const lastNotified = new Map<number, number>();
const THROTTLE_MS = 60_000;

/**
 * Called on every heartbeat. Detects UP↔DOWN transitions and sends push.
 */
export function onHeartbeat(
  monitorId: number,
  monitorName: string,
  status: number,
  msg: string,
  ping: number | null,
): void {
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
  const last = lastNotified.get(monitorId) || 0;
  if (now - last < THROTTLE_MS) return;
  lastNotified.set(monitorId, now);

  const isDown = status === 0;
  const title = isDown ? `🔴 ${monitorName}` : `🟢 ${monitorName}`;
  const body = isDown
    ? `Monitor caído${msg ? `: ${msg}` : ""}`
    : `Monitor recuperado${ping ? ` — ${ping}ms` : ""}`;

  sendToAll({
    title,
    body,
    tag: `monitor-${monitorId}`,
    data: { url: "/mobile/alerts", monitorId },
  });
}

async function sendToAll(payload: Record<string, unknown>): Promise<void> {
  if (!ensureVapid()) return;

  const subs = getAllSubscriptions();
  if (subs.length === 0) return;

  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(sub, payloadStr).catch((err: any) => {
        // 410 Gone or 404 = subscription expired — remove it
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          removeSubscription(sub.endpoint);
          console.log("[push] Removed expired subscription");
        }
        throw err;
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (sent > 0 || failed > 0) {
    console.log(`[push] Sent ${sent}/${subs.length} notifications (${failed} failed)`);
  }
}
