import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";

export async function GET() {
  const maps = mapsDb.getAll();
  const enriched = maps.map((m) => {
    const nodes = mapsDb.getNodes(m.id);
    return {
      ...m,
      node_count: nodes.length,
      edge_count: mapsDb.getEdges(m.id).length,
      // Live monitor IDs so the frontend can compute UP/DOWN
      monitor_ids: nodes
        .filter((n: any) => n.kuma_monitor_id !== null)
        .map((n: any) => n.kuma_monitor_id as number),
    };
  });
  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const map = mapsDb.create({
    name: body.name,
    background_type: body.background_type,
    kuma_group_id: body.kuma_group_id,
    width: body.width,
    height: body.height,
  });
  return NextResponse.json(map, { status: 201 });
}
