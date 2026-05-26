import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    let raw: any;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: "JSON inválido — el archivo no contiene JSON válido" },
        { status: 400 }
      );
    }

    // Accept both kumamap-v1 format and plain map objects
    // Detect format: kumamap-v1 has _format field, plain has nodes/edges at top level
    let data: { map?: any; nodes?: any[]; edges?: any[] };

    if (raw._format === "kumamap-v1") {
      // Standard export format
      data = raw;
    } else if (raw.map && (raw.nodes || raw.edges)) {
      // Looks like kumamap format but missing _format tag — accept it
      data = raw;
    } else if (raw.name && typeof raw.name === "string") {
      // Plain map object (e.g. from older export or manual creation)
      data = {
        map: raw,
        nodes: raw.nodes || [],
        edges: raw.edges || [],
      };
    } else {
      return NextResponse.json(
        { error: "Formato no reconocido — el archivo debe ser un JSON exportado de KumaMap (con _format: \"kumamap-v1\")" },
        { status: 400 }
      );
    }

    // Validate minimum required data
    if (!data.map && (!data.nodes || data.nodes.length === 0)) {
      return NextResponse.json(
        { error: "El archivo no contiene datos de mapa ni nodos para importar" },
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
      const viewStateStr = typeof data.map.view_state === "string"
        ? data.map.view_state
        : JSON.stringify(data.map.view_state);
      mapsDb.update(map.id, { view_state: viewStateStr } as any);
    }

    // Build ID mapping (old → new) to preserve links
    const nodeIdMap = new Map<string, string>();
    const nodes = (data.nodes || []).map((n: any) => {
      const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      nodeIdMap.set(n.id, newId);
      return {
        id: newId,
        kuma_monitor_id: n.kuma_monitor_id ?? null,
        label: n.label ?? null,
        x: n.x ?? 0,
        y: n.y ?? 0,
        width: n.width || 120,
        height: n.height || 80,
        icon: n.icon || "server",
        color: n.color || null,
        custom_data: typeof n.custom_data === "string" ? n.custom_data
          : n.custom_data ? JSON.stringify(n.custom_data) : null,
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
        custom_data: typeof e.custom_data === "string" ? e.custom_data
          : e.custom_data ? JSON.stringify(e.custom_data) : null,
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
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Error al importar: " + (err?.message || "formato inválido") },
      { status: 500 }
    );
  }
}
