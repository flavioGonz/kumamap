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

  // ── Imagen de fondo (mapas tipo foto/plano) ──
  // Se embebe en base64 para que el JSON exportado sea autocontenido y el
  // importado NO quede en blanco. Se omite si supera el limite razonable.
  const MAX_EMBED_BYTES = 12 * 1024 * 1024; // 12 MB
  let backgroundData: string | null = null;
  let backgroundTruncated = false;
  if (map.background_type === "image") {
    const bg = mapsDb.getBackgroundBlob(id);
    if (bg?.blob) {
      if (bg.blob.length <= MAX_EMBED_BYTES) {
        backgroundData = bg.blob.toString("base64");
      } else {
        backgroundTruncated = true;
      }
    }
  }

  const exportData = {
    _format: "kumamap-v1",
    _exportedAt: new Date().toISOString(),
    map: {
      name: map.name,
      background_type: map.background_type,
      background_image: map.background_image,
      background_mime: (map as any).background_mime || null,
      background_scale: map.background_scale ?? 1,
      background_offset_x: map.background_offset_x ?? 0,
      background_offset_y: map.background_offset_y ?? 0,
      scale_m_per_unit: (map as any).scale_m_per_unit ?? null,
      /** Imagen de fondo embebida (base64, sin prefijo data:) */
      background_data: backgroundData,
      background_omitted: backgroundTruncated || undefined,
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
