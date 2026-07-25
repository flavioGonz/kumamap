/**
 * OpenWA REST API client.
 *
 * Wraps the OpenWA HTTP API for sending WhatsApp messages.
 * API base: {openwaUrl}/api/sessions/{sessionId}/...
 *
 * Endpoints used:
 *   GET  /api/sessions                     → list sessions
 *   GET  /api/sessions/:id                 → session status
 *   POST /api/sessions/:id/messages/send-text → send text message
 */

import { getWhatsAppConfig } from "./whatsapp-config";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface OpenWASession {
  id: string;
  phone: string;
  pushName: string;
  status: string;
}

export interface OpenWASendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface OpenWAStatus {
  online: boolean;
  session?: OpenWASession;
  error?: string;
}

/* ── Internal helpers ──────────────────────────────────────────────── */

function headers(): Record<string, string> {
  const cfg = getWhatsAppConfig();
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
}

function baseUrl(): string {
  const cfg = getWhatsAppConfig();
  return cfg.openwaUrl.replace(/\/+$/, "");
}

function sessionId(): string {
  return getWhatsAppConfig().sessionId;
}

/* ── Public API ────────────────────────────────────────────────────── */

/**
 * Check if the OpenWA instance is reachable and the session is ready.
 */
export async function checkStatus(): Promise<OpenWAStatus> {
  const cfg = getWhatsAppConfig();
  if (!cfg.openwaUrl || !cfg.apiKey || !cfg.sessionId) {
    return { online: false, error: "OpenWA no configurado" };
  }

  try {
    const res = await fetch(`${baseUrl()}/api/sessions/${sessionId()}`, {
      headers: headers(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { online: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    // OpenWA returns different shapes; adapt to most common
    const session: OpenWASession = {
      id: data.id || sessionId(),
      phone: data.phone || data.me?.user || "",
      pushName: data.pushName || data.pushname || "",
      status: data.status || "unknown",
    };

    return { online: session.status === "ready", session };
  } catch (err: any) {
    return { online: false, error: err.message };
  }
}

/**
 * Send a text message to a phone number via OpenWA.
 * @param phone Phone number without "+" (e.g. "59891716502")
 * @param text  Message text
 */
export async function sendText(phone: string, text: string): Promise<OpenWASendResult> {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "WhatsApp deshabilitado" };
  }
  if (!cfg.openwaUrl || !cfg.apiKey || !cfg.sessionId) {
    return { ok: false, error: "OpenWA no configurado" };
  }

  const chatId = `${phone.replace(/[^0-9]/g, "")}@c.us`;

  try {
    const res = await fetch(
      `${baseUrl()}/api/sessions/${sessionId()}/messages/send-text`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ chatId, text }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body}` };
    }

    const data = await res.json();
    return { ok: true, messageId: data.id || data._serialized || "sent" };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Send the same text to multiple phone numbers.
 * Returns per-recipient results.
 */
export async function sendToMany(
  phones: string[],
  text: string
): Promise<{ phone: string; result: OpenWASendResult }[]> {
  const results = await Promise.allSettled(
    phones.map(async (phone) => ({
      phone,
      result: await sendText(phone, text),
    }))
  );
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { phone: "", result: { ok: false, error: "Promise rejected" } }
  );
}

/**
 * List available sessions on the OpenWA instance.
 */
export async function listSessions(): Promise<OpenWASession[]> {
  try {
    const res = await fetch(`${baseUrl()}/api/sessions`, {
      headers: headers(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : data.sessions || []).map((s: any) => ({
      id: s.id,
      phone: s.phone || s.me?.user || "",
      pushName: s.pushName || s.pushname || "",
      status: s.status || "unknown",
    }));
  } catch {
    return [];
  }
}
