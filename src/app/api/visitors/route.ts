import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitors?mapId=xxx[&q=search][&from=date][&to=date][&activeOnly=true][&limit=50][&offset=0]
 * List/search visitor records.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const registry = getVisitorRegistry();
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);

  const visitors = registry.getVisitors(mapId, { q, from, to, activeOnly, limit, offset });
  const total = registry.countVisitors(mapId, { q, from, to, activeOnly });

  return NextResponse.json({ mapId, total, count: visitors.length, offset, visitors });
}

/**
 * POST /api/visitors
 * Register a new visitor (check-in).
 * Body: { mapId, cedula, name, personToVisit, company?, vehiclePlate?, vehicleDesc?, reason?, observations?, guardName? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mapId, cedula, name, personToVisit, ...rest } = body;

    if (!mapId || !cedula || !name || !personToVisit) {
      return NextResponse.json(
        { error: "mapId, cedula, name, and personToVisit are required" },
        { status: 400 }
      );
    }

    const registry = getVisitorRegistry();

    // Check if already checked in
    const existing = registry.isCheckedIn(mapId, cedula);
    if (existing) {
      return NextResponse.json(
        {
          error: "already_checked_in",
          message: `${existing.name} ya está registrado/a (entrada: ${existing.checkIn})`,
          visitor: existing,
        },
        { status: 409 }
      );
    }

    const record = registry.checkIn(mapId, { cedula, name, personToVisit, ...rest });
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("[visitors] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
