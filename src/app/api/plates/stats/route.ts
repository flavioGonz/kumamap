import { NextRequest, NextResponse } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/plates/stats?mapId=xxx[&days=7]
 * Access statistics for a map.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const days = parseInt(req.nextUrl.searchParams.get("days") || "7");
  const registry = getPlateRegistry();
  const stats = registry.getStats(mapId, days);

  return NextResponse.json({ mapId, days, ...stats });
}
