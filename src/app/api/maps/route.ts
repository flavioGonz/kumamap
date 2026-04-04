import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";
import { createMapSchema } from "@/lib/validation";

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
  const parsed = createMapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const map = mapsDb.create({
    name: parsed.data.name,
    background_type: parsed.data.background_type,
    kuma_group_id: parsed.data.kuma_group_id,
    parent_id: parsed.data.parent_id ?? null,
    width: parsed.data.width,
    height: parsed.data.height,
  });
  return NextResponse.json(map, { status: 201 });
}
