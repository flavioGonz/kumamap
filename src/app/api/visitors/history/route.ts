import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitors/history?mapId=xxx&cedula=12345678
 * Get visit history for a specific cédula.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  const cedula = req.nextUrl.searchParams.get("cedula");

  if (!mapId || !cedula) {
    return NextResponse.json({ error: "mapId and cedula required" }, { status: 400 });
  }

  const registry = getVisitorRegistry();
  const history = registry.getVisitorHistory(mapId, cedula);

  return NextResponse.json({ mapId, cedula, count: history.length, visits: history });
}
