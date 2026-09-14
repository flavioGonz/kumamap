import { NextRequest } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/plates/export?mapId=xxx[&from=][&to=][&matchResult=][&format=csv|json]
 * Export access log as CSV or JSON with optional filters.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return new Response("mapId required", { status: 400 });
  }

  const from = req.nextUrl.searchParams.get("from") || undefined;
  const until = req.nextUrl.searchParams.get("to") || req.nextUrl.searchParams.get("until") || undefined;
  const matchResult = req.nextUrl.searchParams.get("matchResult") as any || undefined;
  const format = req.nextUrl.searchParams.get("format") || "csv";

  const registry = getPlateRegistry();

  if (format === "json") {
    const entries = registry.getAccessLog(mapId, { from, until, matchResult, limit: 50000 });
    const jsonStr = JSON.stringify({
      exported: new Date().toISOString(),
      mapId,
      filters: { from, until, matchResult },
      count: entries.length,
      entries,
    }, null, 2);

    return new Response(jsonStr, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="accesos_${mapId}_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  // CSV export with filters
  const csv = registry.exportCsv(mapId, { from, until, matchResult });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="accesos_${mapId}_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
