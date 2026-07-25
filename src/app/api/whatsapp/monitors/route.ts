import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfig, setMonitorMuted, setMonitorPhone } from "@/lib/whatsapp-config";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/monitors — List all monitors with notify state + custom phone
 */
export async function GET() {
  const cfg = getWhatsAppConfig();
  const muted = new Set(cfg.mutedMonitorIds);
  const monitors = getKumaClient()
    .getMonitors()
    .map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      status: m.status,
      notify: !muted.has(m.id),
      customPhone: cfg.monitorPhones[String(m.id)] || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json(monitors);
}

/**
 * PUT /api/whatsapp/monitors — Update notify state and/or custom phone
 * Body: { monitorId: number, notify?: boolean, customPhone?: string }
 */
export async function PUT(req: NextRequest) {
  try {
    const { monitorId, notify, customPhone } = await req.json();
    if (typeof monitorId !== "number") {
      return NextResponse.json({ error: "monitorId requerido" }, { status: 400 });
    }
    if (typeof notify === "boolean") {
      setMonitorMuted(monitorId, !notify);
    }
    if (typeof customPhone === "string") {
      setMonitorPhone(monitorId, customPhone);
    }
    return NextResponse.json({ ok: true, monitorId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
