/**
 * File-backed store for push notification subscriptions.
 * Persists to data/push-subscriptions.json so subscriptions survive pm2 restarts.
 */

import type { PushSubscription as WebPushSubscription } from "web-push";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "push-subscriptions.json");

// In-memory cache — loaded from disk on first access
let subscriptions: Map<string, WebPushSubscription> | null = null;

function ensureDir(): void {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function load(): Map<string, WebPushSubscription> {
  if (subscriptions) return subscriptions;
  subscriptions = new Map();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      if (Array.isArray(raw)) {
        for (const sub of raw) {
          if (sub?.endpoint) subscriptions.set(sub.endpoint, sub);
        }
      }
    }
  } catch {
    subscriptions = new Map();
  }
  return subscriptions;
}

function save(): void {
  try {
    ensureDir();
    fs.writeFileSync(STORE_FILE, JSON.stringify(Array.from(load().values()), null, 2));
  } catch (err) {
    console.error("[push-store] save error:", err);
  }
}

export function addSubscription(sub: WebPushSubscription): void {
  load().set(sub.endpoint, sub);
  save();
}

export function removeSubscription(endpoint: string): boolean {
  const result = load().delete(endpoint);
  if (result) save();
  return result;
}

export function getAllSubscriptions(): WebPushSubscription[] {
  return Array.from(load().values());
}

export function getSubscriptionCount(): number {
  return load().size;
}
