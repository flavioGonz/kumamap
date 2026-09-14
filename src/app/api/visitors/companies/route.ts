import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitors/companies?mapId=xxx[&q=search]
 * Get unique company names for autocomplete, sorted by frequency.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() || "";

  const registry = getVisitorRegistry();
  const visitors = registry.getVisitors(mapId);

  // Count company occurrences
  const companyCounts = new Map<string, number>();
  for (const v of visitors) {
    if (v.company) {
      const key = v.company.trim();
      if (key && (!q || key.toLowerCase().includes(q))) {
        companyCounts.set(key, (companyCounts.get(key) || 0) + 1);
      }
    }
  }

  // Sort by frequency descending
  const companies = [...companyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({ companies });
}
