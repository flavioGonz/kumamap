import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const map = mapsDb.getById(id);
  if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { nodes, edges } = await req.json();
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return NextResponse.json(
      { error: "nodes and edges arrays required" },
      { status: 400 }
    );
  }

  mapsDb.saveState(id, nodes, edges);
  return NextResponse.json({ success: true });
}
