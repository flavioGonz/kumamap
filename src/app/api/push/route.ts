import { NextRequest, NextResponse } from "next/server";
import { addSubscription, removeSubscription, getSubscriptionCount } from "@/lib/push-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/push — Subscribe to push notifications
 * Body: PushSubscription JSON from browser
 */
export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    if (!sub?.endpoint) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    addSubscription(sub);
    return NextResponse.json({ ok: true, total: getSubscriptionCount() });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

/**
 * DELETE /api/push — Unsubscribe
 * Body: { endpoint: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

/**
 * GET /api/push — Get VAPID public key + subscription count
 */
export async function GET() {
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    subscriptions: getSubscriptionCount(),
  });
}
