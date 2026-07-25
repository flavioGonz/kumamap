import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfig, saveWhatsAppConfig } from "@/lib/whatsapp-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/config — Return current WhatsApp configuration
 * (strips apiKey for security — returns masked version)
 */
export async function GET() {
  const cfg = getWhatsAppConfig();
  return NextResponse.json({
    ...cfg,
    apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 8)}...` : "",
  });
}

/**
 * PUT /api/whatsapp/config — Update WhatsApp configuration
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    // Don't allow overwriting recipients through this endpoint
    const { recipients: _r, ...safeUpdate } = body;
    const updated = saveWhatsAppConfig(safeUpdate);
    return NextResponse.json({
      ...updated,
      apiKey: updated.apiKey ? `${updated.apiKey.slice(0, 8)}...` : "",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
