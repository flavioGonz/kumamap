/**
 * WhatsApp / OpenWA Configuration — Persistent connection settings + recipients.
 *
 * Stores OpenWA URL, API key, session info, recipients, and alert toggles
 * in data/whatsapp-config.json. Used by openwa-client.ts and whatsapp-sender.ts.
 */

import fs from "fs";
import path from "path";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface WhatsAppRecipient {
  id: string;          // UUID
  name: string;        // Display name
  phone: string;       // E.164 without "+" (e.g. "59891716502")
  enabled: boolean;    // Whether to send auto-alerts to this recipient
}

export interface WhatsAppConfig {
  enabled: boolean;            // Master switch
  openwaUrl: string;           // e.g. "http://192.168.99.22:2886"
  apiKey: string;              // Bearer token
  sessionId: string;           // OpenWA session UUID
  alertsEnabled: boolean;      // Send auto-alerts on monitor status change
  reportEnabled: boolean;      // Allow manual report sending
  throttleMinutes: number;     // Minimum minutes between auto-alerts per monitor
  recipients: WhatsAppRecipient[];
  /** Monitor IDs that do NOT send auto-alerts. Default: empty (all notify). */
  mutedMonitorIds: number[];
  /** Per-monitor custom phone (client number). Alerts go to general recipients + this. */
  monitorPhones: Record<string, string>;
}

/* ── Defaults ──────────────────────────────────────────────────────── */

const CONFIG_PATH = path.join(process.cwd(), "data", "whatsapp-config.json");

const DEFAULTS: WhatsAppConfig = {
  enabled: false,
  openwaUrl: "",
  apiKey: "",
  sessionId: "",
  alertsEnabled: true,
  reportEnabled: true,
  throttleMinutes: 5,
  recipients: [],
  mutedMonitorIds: [],
  monitorPhones: {},
};

/* ── Cache ─────────────────────────────────────────────────────────── */

let cached: WhatsAppConfig | null = null;

export function getWhatsAppConfig(): WhatsAppConfig {
  if (cached) return cached;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      cached = { ...DEFAULTS, ...JSON.parse(raw) };
      return cached!;
    }
  } catch (err) {
    console.error("[WhatsApp] Error loading config:", err);
  }
  cached = { ...DEFAULTS };
  return cached;
}

export function saveWhatsAppConfig(update: Partial<WhatsAppConfig>): WhatsAppConfig {
  const current = getWhatsAppConfig();
  const updated = { ...current, ...update };
  try {
    const dir = path.dirname(CONFIG_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("[WhatsApp] Error saving config:", err);
  }
  cached = updated;
  return updated;
}

export function reloadWhatsAppConfig(): WhatsAppConfig {
  cached = null;
  return getWhatsAppConfig();
}

/* ── Recipient helpers ─────────────────────────────────────────────── */

import crypto from "crypto";

export function addRecipient(name: string, phone: string): WhatsAppConfig {
  const cfg = getWhatsAppConfig();
  const cleaned = phone.replace(/[^0-9]/g, "");
  // Avoid duplicates by phone
  if (cfg.recipients.some((r) => r.phone === cleaned)) {
    // Update existing
    cfg.recipients = cfg.recipients.map((r) =>
      r.phone === cleaned ? { ...r, name, enabled: true } : r
    );
  } else {
    cfg.recipients.push({ id: crypto.randomUUID(), name, phone: cleaned, enabled: true });
  }
  return saveWhatsAppConfig({ recipients: cfg.recipients });
}

export function removeRecipient(id: string): WhatsAppConfig {
  const cfg = getWhatsAppConfig();
  cfg.recipients = cfg.recipients.filter((r) => r.id !== id);
  return saveWhatsAppConfig({ recipients: cfg.recipients });
}

export function toggleRecipient(id: string, enabled: boolean): WhatsAppConfig {
  const cfg = getWhatsAppConfig();
  cfg.recipients = cfg.recipients.map((r) =>
    r.id === id ? { ...r, enabled } : r
  );
  return saveWhatsAppConfig({ recipients: cfg.recipients });
}

export function getEnabledRecipients(): WhatsAppRecipient[] {
  return getWhatsAppConfig().recipients.filter((r) => r.enabled);
}

/* ── Per-monitor mute helpers ──────────────────────────────────────── */

export function isMonitorMuted(monitorId: number): boolean {
  return getWhatsAppConfig().mutedMonitorIds.includes(monitorId);
}

export function setMonitorMuted(monitorId: number, muted: boolean): WhatsAppConfig {
  const cfg = getWhatsAppConfig();
  const set = new Set(cfg.mutedMonitorIds);
  if (muted) set.add(monitorId);
  else set.delete(monitorId);
  return saveWhatsAppConfig({ mutedMonitorIds: Array.from(set) });
}

/* ── Per-monitor custom phone (client number) ──────────────────────── */

export function getMonitorPhone(monitorId: number): string | null {
  const phone = getWhatsAppConfig().monitorPhones[String(monitorId)];
  return phone || null;
}

export function setMonitorPhone(monitorId: number, phone: string): WhatsAppConfig {
  const cfg = getWhatsAppConfig();
  const phones = { ...cfg.monitorPhones };
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned) phones[String(monitorId)] = cleaned;
  else delete phones[String(monitorId)];
  return saveWhatsAppConfig({ monitorPhones: phones });
}
