import { NextRequest, NextResponse } from "next/server";
import { ingestSignedReport } from "@/lib/monitorng";

export const dynamic = "force-dynamic";

/**
 * Signed health report from an ADOPTED device. The per-device report token
 * travels in the Authorization header (Bearer). Body is the same sensor payload
 * as the legacy route plus `deviceId`. A compromised device can be revoked
 * individually (de-adopt / regen token) without touching the others.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = req.headers.get("authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    const rec = ingestSignedReport(String(body?.deviceId || ""), bearer, body);
    return NextResponse.json({ ok: true, node: rec.node, monitorId: rec.monitorId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
