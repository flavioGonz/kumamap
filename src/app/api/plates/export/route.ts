import { NextRequest } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/plates/export?mapId=xxx[&from=][&until=]
 * Export access log as CSV.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return new Response("mapId required", { status: 400 });
  }

  const registry = getPlateRegistry();
  const csv = registry.exportCsv(mapId, {
    from: req.nextUrl.searchParams.get("from") || undefined,
    until: req.nextUrl.searchParams.get("until") || undefined,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="accesos_${mapId}_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
