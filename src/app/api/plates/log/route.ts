import { NextRequest, NextResponse } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/plates/log?mapId=xxx[&plate=][&from=][&until=][&nodeId=][&matchResult=][&limit=]
 * Query the access log.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const registry = getPlateRegistry();
  const entries = registry.getAccessLog(mapId, {
    plate: req.nextUrl.searchParams.get("plate") || undefined,
    from: req.nextUrl.searchParams.get("from") || undefined,
    until: req.nextUrl.searchParams.get("until") || undefined,
    nodeId: req.nextUrl.searchParams.get("nodeId") || undefined,
    matchResult: (req.nextUrl.searchParams.get("matchResult") as any) || undefined,
    limit: parseInt(req.nextUrl.searchParams.get("limit") || "200"),
  });

  return NextResponse.json({ mapId, count: entries.length, entries });
}
