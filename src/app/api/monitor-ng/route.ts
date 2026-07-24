import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ingestReport, getMonitorNgNodes } from "@/lib/monitorng";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = process.env.MONITORNG_TOKEN || "";
  if (!token) return true; // no token configured -> open (not recommended)
  const auth = req.headers.get("authorization") || "";
  const a = Buffer.from(auth);
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const rec = ingestReport(body);
    return NextResponse.json({ ok: true, node: rec.node, monitorId: rec.monitorId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ nodes: getMonitorNgNodes() });
}
