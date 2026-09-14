import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

/** GET /api/kuma/heartbeats?count=50
 *  Returns last N heartbeats for every monitor (in-memory, very fast).
 */
export async function GET(req: NextRequest) {
  const count = parseInt(req.nextUrl.searchParams.get("count") || "50", 10);
  const kuma = getKumaClient();
  const heartbeats = kuma.getAllHistory(Math.min(Math.max(count, 10), 200));
  return NextResponse.json({ heartbeats });
}
