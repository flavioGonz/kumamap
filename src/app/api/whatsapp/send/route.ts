import { NextResponse } from "next/server";
import { getWhatsAppConfig, getEnabledRecipients } from "@/lib/whatsapp-config";
import { sendToMany } from "@/lib/openwa-client";
import { buildStatusReport } from "@/lib/whatsapp-sender";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/send — Send a manual status report to all enabled recipients
 */
export async function POST() {
  try {
    const cfg = getWhatsAppConfig();
    if (!cfg.enabled) {
      return NextResponse.json({ error: "WhatsApp deshabilitado" }, { status: 400 });
    }
    if (!cfg.reportEnabled) {
      return NextResponse.json({ error: "Envío de reportes deshabilitado" }, { status: 400 });
    }

    const recipients = getEnabledRecipients();
    if (recipients.length === 0) {
      return NextResponse.json({ error: "No hay destinatarios habilitados" }, { status: 400 });
    }

    // Get current monitors
    const monitors = getKumaClient().getMonitors();
    const monitorList = monitors.map((m) => ({
      name: m.name,
      status: m.status ?? -1,
      ping: m.ping,
      msg: m.msg,
    }));

    const report = buildStatusReport(monitorList);
    const phones = recipients.map((r) => r.phone);
    const results = await sendToMany(phones, report);

    const sent = results.filter((r) => r.result.ok).length;
    const failed = results.filter((r) => !r.result.ok).length;

    return NextResponse.json({
      ok: sent > 0,
      sent,
      failed,
      total: results.length,
      details: results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
