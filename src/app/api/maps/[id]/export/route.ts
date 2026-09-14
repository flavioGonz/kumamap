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

  const exportData = {
    _format: "kumamap-v1",
    _exportedAt: new Date().toISOString(),
    map: {
      name: map.name,
      background_type: map.background_type,
      kuma_group_id: map.kuma_group_id,
      width: map.width,
      height: map.height,
      view_state: (map as any).view_state || null,
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      kuma_monitor_id: n.kuma_monitor_id,
      label: n.label,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      icon: n.icon,
      color: n.color,
      custom_data: n.custom_data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source_node_id: e.source_node_id,
      target_node_id: e.target_node_id,
      label: e.label,
      style: e.style,
      color: e.color,
      animated: e.animated,
      custom_data: (e as any).custom_data || null,
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="kumamap-${map.name.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.json"`,
    },
  });
}
