import { NextRequest, NextResponse } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/plates?mapId=xxx[&q=search][&category=authorized|visitor|blocked]
 * List/search plates for a map.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const registry = getPlateRegistry();
  const q = req.nextUrl.searchParams.get("q");
  const category = req.nextUrl.searchParams.get("category");

  let plates = q ? registry.searchPlates(mapId, q) : registry.getPlates(mapId);

  if (category) {
    plates = plates.filter((p) => p.category === category);
  }

  // Sort: blocked first, then authorized, then visitors
  const order = { blocked: 0, authorized: 1, visitor: 2 };
  plates.sort((a, b) => (order[a.category] ?? 3) - (order[b.category] ?? 3));

  return NextResponse.json({ mapId, count: plates.length, plates });
}

/**
 * POST /api/plates
 * Add a plate to the registry.
 * Body: { mapId, plate, category, ownerName, vehicleDesc?, notes?, validFrom?, validUntil? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mapId, plate, category, ownerName, ...rest } = body;

    if (!mapId || !plate || !category || !ownerName) {
      return NextResponse.json(
        { error: "mapId, plate, category, and ownerName are required" },
        { status: 400 }
      );
    }

    if (!["authorized", "visitor", "blocked"].includes(category)) {
      return NextResponse.json(
        { error: "category must be authorized, visitor, or blocked" },
        { status: 400 }
      );
    }

    const registry = getPlateRegistry();
    const record = registry.addPlate(mapId, { plate, category, ownerName, ...rest });

    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
