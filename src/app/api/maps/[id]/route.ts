import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const map = mapsDb.getById(id);
  if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nodes = mapsDb.getNodes(id);
  const edges = mapsDb.getEdges(id);
  return NextResponse.json({ ...map, nodes, edges });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const map = mapsDb.update(id, body);
  if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(map);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = mapsDb.delete(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
