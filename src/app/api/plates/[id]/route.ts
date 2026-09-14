import { NextRequest, NextResponse } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * PUT /api/plates/[id]?mapId=xxx
 * Update a plate record.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const registry = getPlateRegistry();
    const updated = registry.updatePlate(mapId, id, body);

    if (!updated) {
      return NextResponse.json({ error: "Plate not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/plates/[id]?mapId=xxx
 * Remove a plate from the registry.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const registry = getPlateRegistry();
  const deleted = registry.deletePlate(mapId, id);

  if (!deleted) {
    return NextResponse.json({ error: "Plate not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
