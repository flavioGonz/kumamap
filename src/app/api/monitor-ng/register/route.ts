import { NextRequest, NextResponse } from "next/server";
import { registerDevice } from "@/lib/monitorng";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0] || "";
  return first.trim() || req.headers.get("x-real-ip") || "";
}

/**
 * Device self-registration (adoption model). Public: authenticated by the
 * device's own deviceKey, not the operator session. The device sends its
 * generated deviceId (5 digits) + deviceKey (256-bit) once; the controller
 * keeps it PENDING until an admin adopts it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = registerDevice({
      deviceId: body?.deviceId,
      deviceKey: body?.deviceKey,
      name: body?.name,
      fingerprint: body?.fingerprint,
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
