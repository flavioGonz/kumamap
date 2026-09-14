import { NextRequest, NextResponse } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/plates/history?mapId=xxx&plate=ABC1234[&limit=100]
 * Get full access history for a specific plate.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  const plate = req.nextUrl.searchParams.get("plate");
  if (!mapId || !plate) {
    return NextResponse.json({ error: "mapId and plate required" }, { status: 400 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");
  const registry = getPlateRegistry();

  // Get plate record if registered
  const match = registry.matchPlate(mapId, plate);
  const history = registry.getPlateHistory(mapId, plate, limit);

  // Calculate summary
  const firstSeen = history.length > 0 ? history[history.length - 1].timestamp : null;
  const lastSeen = history.length > 0 ? history[0].timestamp : null;

  // Cameras this plate has been seen at
  const cameras = [...new Set(history.map((e) => e.nodeLabel || e.nodeId))];

  return NextResponse.json({
    plate: plate.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    registration: match.record || null,
    status: match.result,
    summary: {
      totalAccesses: history.length,
      firstSeen,
      lastSeen,
      cameras,
    },
    history,
  });
}
