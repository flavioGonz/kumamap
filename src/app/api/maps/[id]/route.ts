import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";
import { updateMapSchema } from "@/lib/validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const map = mapsDb.getById(id);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nodes = mapsDb.getNodes(id);
    const edges = mapsDb.getEdges(id);
    return NextResponse.json({ ...map, nodes, edges });
  } catch (err) {
    console.error("GET /api/maps/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateMapSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const map = mapsDb.update(id, parsed.data);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(map);
  } catch (err) {
    console.error("PUT /api/maps/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = mapsDb.delete(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/maps/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
