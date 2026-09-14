import { NextRequest, NextResponse } from "next/server";
import { getHikEventStore } from "@/lib/hik-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/hik/search?plate=ABC123&limit=50
 *
 * Search events by license plate.
 */
export async function GET(req: NextRequest) {
  const plate = req.nextUrl.searchParams.get("plate") || "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const store = getHikEventStore();

  if (!plate) {
    return NextResponse.json({ error: "plate parameter required" }, { status: 400 });
  }

  const results = store.searchPlates(plate, limit);
  return NextResponse.json({ query: plate, count: results.length, events: results });
}
