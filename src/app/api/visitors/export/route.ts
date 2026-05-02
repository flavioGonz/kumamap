import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitors/export?mapId=xxx[&from=date][&to=date][&format=csv|json]
 * Export visitor records.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const format = req.nextUrl.searchParams.get("format") || "csv";
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;

  const registry = getVisitorRegistry();

  if (format === "json") {
    const visitors = registry.getVisitors(mapId, { from, to });
    return NextResponse.json({ mapId, count: visitors.length, visitors });
  }

  // CSV export
  const csv = registry.exportCSV(mapId, { from, to });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bitacora-${mapId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
