import { NextResponse } from "next/server";
import webpush from "web-push";
import { getAllSubscriptions } from "@/lib/push-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/test — Send a test push notification to all subscribers
 */
export async function POST() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@kumamap.local";

  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (err: any) {
    return NextResponse.json({ error: `VAPID error: ${err.message}` }, { status: 500 });
  }

  const subs = getAllSubscriptions();
  if (subs.length === 0) {
    return NextResponse.json({ error: "No hay suscriptores registrados" }, { status: 404 });
  }

  const payload = JSON.stringify({
    title: "🔔 KumaMap — Test",
    body: "Las notificaciones push están funcionando correctamente.",
    tag: "test-push",
    data: { url: "/mobile/alerts" },
  });

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(sub, payload)
        .then(() => { sent++; })
        .catch(() => { failed++; })
    )
  );

  return NextResponse.json({ ok: true, sent, failed, total: subs.length });
}
