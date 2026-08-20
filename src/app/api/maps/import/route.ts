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
    const baseName = String(data.map?.name || "Mapa importado");
    const importedName = /\(copia\)\s*$/i.test(baseName) ? baseName : `${baseName} (importado)`;
    const map = mapsDb.create({
      name: importedName,
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

    // ── Imagen de fondo (mapas tipo foto/plano) ──
    // Sin esto el mapa importado/clonado quedaba EN BLANCO.
    let backgroundRestored = false;
    if (data.map?.background_data && typeof data.map.background_data === "string") {
      try {
        const raw = data.map.background_data.includes(",")
          && data.map.background_data.startsWith("data:")
          ? data.map.background_data.split(",", 2)[1]
          : data.map.background_data;
        const buf = Buffer.from(raw, "base64");
        if (buf.length > 0) {
          const srcName = String(data.map.background_image || "bg.png");
          const extMatch = /\.[a-z0-9]+$/i.exec(srcName);
          const ext = extMatch ? extMatch[0].toLowerCase() : ".png";
          const mimeByExt: Record<string, string> = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
            ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
          };
          const mime = String(data.map.background_mime || mimeByExt[ext] || "image/png");
          mapsDb.setBackground(map.id, `bg-${Date.now()}${ext}`, buf, mime);
          backgroundRestored = true;
        }
      } catch (bgErr) {
        console.warn("Import: no se pudo restaurar la imagen de fondo:", bgErr);
      }
    }

    // Geometria del fondo + calibracion de escala
    const geometry: Record<string, unknown> = {};
    if (typeof data.map?.background_scale === "number") geometry.background_scale = data.map.background_scale;
    if (typeof data.map?.background_offset_x === "number") geometry.background_offset_x = data.map.background_offset_x;
    if (typeof data.map?.background_offset_y === "number") geometry.background_offset_y = data.map.background_offset_y;
    if (typeof data.map?.scale_m_per_unit === "number") geometry.scale_m_per_unit = data.map.scale_m_per_unit;
    if (Object.keys(geometry).length) mapsDb.update(map.id, geometry as any);

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
      backgroundRestored,
    }, { status: 201 });
  } catch (err: any) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Error al importar: " + (err?.message || "formato inválido") },
      { status: 500 }
    );
  }
}
