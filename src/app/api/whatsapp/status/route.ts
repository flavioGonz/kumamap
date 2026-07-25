import { NextResponse } from "next/server";
import { checkStatus } from "@/lib/openwa-client";
import { getWhatsAppConfig } from "@/lib/whatsapp-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/status — Check OpenWA connection status
 */
export async function GET() {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    return NextResponse.json({
      enabled: false,
      online: false,
      error: "WhatsApp deshabilitado",
    });
  }

  const status = await checkStatus();
  return NextResponse.json({
    enabled: cfg.enabled,
    alertsEnabled: cfg.alertsEnabled,
    reportEnabled: cfg.reportEnabled,
    recipientCount: cfg.recipients.filter((r) => r.enabled).length,
    ...status,
  });
}
