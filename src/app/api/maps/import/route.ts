import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    if (data._format !== "kumamap-v1") {
      return NextResponse.json(
        { error: "Formato invalido. Se espera un archivo exportado de KumaMap." },
        { status: 400 }
      );
    }

    // Create the map
    const map = mapsDb.create({
      name: (data.map?.name || "Mapa importado") + " (importado)",
      background_type: data.map?.background_type || "grid",
      kuma_group_id: data.map?.kuma_group_id || null,
      width: data.map?.width || 1920,
      height: data.map?.height || 1080,
    });

    // Save view_state if present
    if (data.map?.view_state) {
      mapsDb.update(map.id, {
        view_state: typeof data.map.view_state === "string"
          ? data.map.view_state
          : JSON.stringify(data.map.view_state),
      } as any);
    }

    // Build ID mapping (old → new) to preserve links
    const nodeIdMap = new Map<string, string>();
    const nodes = (data.nodes || []).map((n: any) => {
      const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      nodeIdMap.set(n.id, newId);
      return {
        id: newId,
        kuma_monitor_id: n.kuma_monitor_id,
        label: n.label,
        x: n.x,
        y: n.y,
        width: n.width || 120,
        height: n.height || 80,
        icon: n.icon || "server",
        color: n.color || null,
        custom_data: n.custom_data || null,
      };
    });

    const edges = (data.edges || []).map((e: any) => {
      const newSourceId = nodeIdMap.get(e.source_node_id) || e.source_node_id;
      const newTargetId = nodeIdMap.get(e.target_node_id) || e.target_node_id;
      return {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source_node_id: newSourceId,
        target_node_id: newTargetId,
        label: e.label || null,
        style: e.style || "solid",
        color: e.color || "#6b7280",
        animated: e.animated || 0,
        custom_data: e.custom_data || null,
      };
    });

    mapsDb.saveState(map.id, nodes, edges);

    return NextResponse.json({
      success: true,
      mapId: map.id,
      name: map.name,
      nodesCount: nodes.length,
      edgesCount: edges.length,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error al importar: " + (err?.message || "formato invalido") },
      { status: 400 }
    );
  }
}
