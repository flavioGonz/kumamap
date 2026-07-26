import { NextRequest, NextResponse } from "next/server";
import { getAdoptStatus } from "@/lib/monitorng";

export const dynamic = "force-dynamic";

/**
 * Device polls its adoption status (authenticated by deviceKey in the body, not
 * the URL, to keep the secret out of logs). Once adopted, the response carries
 * the per-device report token the device then uses on /report.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = getAdoptStatus(String(body?.deviceId || ""), String(body?.deviceKey || ""));
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
