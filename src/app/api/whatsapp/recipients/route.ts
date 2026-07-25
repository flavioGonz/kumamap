import { NextRequest, NextResponse } from "next/server";
import {
  getWhatsAppConfig,
  addRecipient,
  removeRecipient,
  toggleRecipient,
} from "@/lib/whatsapp-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/recipients — List all recipients
 */
export async function GET() {
  const cfg = getWhatsAppConfig();
  return NextResponse.json(cfg.recipients);
}

/**
 * POST /api/whatsapp/recipients — Add a recipient
 * Body: { name: string, phone: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { name, phone } = await req.json();
    if (!name || !phone) {
      return NextResponse.json({ error: "name y phone requeridos" }, { status: 400 });
    }
    const cfg = addRecipient(name, phone);
    return NextResponse.json(cfg.recipients);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

/**
 * PUT /api/whatsapp/recipients — Toggle recipient enabled/disabled
 * Body: { id: string, enabled: boolean }
 */
export async function PUT(req: NextRequest) {
  try {
    const { id, enabled } = await req.json();
    if (!id || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "id y enabled requeridos" }, { status: 400 });
    }
    const cfg = toggleRecipient(id, enabled);
    return NextResponse.json(cfg.recipients);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

/**
 * DELETE /api/whatsapp/recipients — Remove a recipient
 * Body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }
    const cfg = removeRecipient(id);
    return NextResponse.json(cfg.recipients);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
