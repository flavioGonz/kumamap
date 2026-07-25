import { NextRequest, NextResponse } from "next/server";
import { checkStatus, sendText } from "@/lib/openwa-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/test — Test OpenWA connection or send a test message
 * Body (optional): { phone?: string }
 * - Without phone: just checks connection status
 * - With phone: sends a test message to that number
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = body?.phone as string | undefined;

    // Always check status first
    const status = await checkStatus();

    if (!phone) {
      return NextResponse.json(status);
    }

    // If connection is not online, don't try sending
    if (!status.online) {
      return NextResponse.json({
        ...status,
        sendResult: { ok: false, error: "OpenWA no está conectado" },
      });
    }

    // Send test message
    const result = await sendText(
      phone,
      "✅ *Test KumaMap*\nConexión WhatsApp configurada correctamente."
    );

    return NextResponse.json({ ...status, sendResult: result });
  } catch (err: any) {
    return NextResponse.json({ online: false, error: err.message }, { status: 500 });
  }
}
