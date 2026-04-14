/**
 * In-memory store for push notification subscriptions.
 * Subscriptions persist across requests but NOT across server restarts.
 * For a production setup, store in SQLite/DB.
 */

import type { PushSubscription as WebPushSubscription } from "web-push";

// Store subscriptions keyed by endpoint for dedup
const subscriptions = new Map<string, WebPushSubscription>();

export function addSubscription(sub: WebPushSubscription): void {
  subscriptions.set(sub.endpoint, sub);
}

export function removeSubscription(endpoint: string): boolean {
  return subscriptions.delete(endpoint);
}

export function getAllSubscriptions(): WebPushSubscription[] {
  return Array.from(subscriptions.values());
}

export function getSubscriptionCount(): number {
  return subscriptions.size;
}
