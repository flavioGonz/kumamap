import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitors/persons?mapId=xxx[&q=search]
 * Get unique "person to visit" names for autocomplete.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() || "";

  const registry = getVisitorRegistry();
  const visitors = registry.getVisitors(mapId);

  const personCounts = new Map<string, number>();
  for (const v of visitors) {
    if (v.personToVisit) {
      const key = v.personToVisit.trim();
      if (key && (!q || key.toLowerCase().includes(q))) {
        personCounts.set(key, (personCounts.get(key) || 0) + 1);
      }
    }
  }

  const persons = [...personCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({ persons });
}
