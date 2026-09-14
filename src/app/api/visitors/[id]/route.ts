import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitors/[id]?mapId=xxx
 * Get a single visitor record.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const registry = getVisitorRegistry();
  const visitor = registry.getVisitor(mapId, id);
  if (!visitor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(visitor);
}

/**
 * PUT /api/visitors/[id]?mapId=xxx
 * Update a visitor record.
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
    const registry = getVisitorRegistry();
    const updated = registry.updateVisitor(mapId, id, body);

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[visitors] PUT error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/visitors/[id]?mapId=xxx
 * Delete a visitor record.
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

  const registry = getVisitorRegistry();
  const deleted = registry.deleteVisitor(mapId, id);

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
