import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitors/stats?mapId=xxx
 * Get visitor statistics.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const registry = getVisitorRegistry();
  const stats = registry.getStats(mapId);

  return NextResponse.json({ mapId, ...stats });
}
