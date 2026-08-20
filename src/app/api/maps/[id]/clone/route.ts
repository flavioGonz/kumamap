import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";

/**
 * POST /api/maps/:id/clone
 *
 * Clona un mapa completo server-side: fondo (blob + mime + escala + offsets +
 * calibracion), view_state, nodos y links. Reemplaza al clonado viejo por
 * export→import, que perdia la imagen de fondo y dejaba los mapas tipo foto
 * en blanco.
 *
 * Body opcional: { name?: string, parent_id?: string | null }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* sin body: se usan los defaults */
    }

    const opts: { name?: string; parentId?: string | null } = {};
    if (typeof body?.name === "string" && body.name.trim()) opts.name = body.name;
    if (body && Object.prototype.hasOwnProperty.call(body, "parent_id")) {
      opts.parentId = body.parent_id ?? null;
    }

    const clone = mapsDb.cloneMap(id, opts);
    if (!clone) {
      return NextResponse.json({ error: "Mapa no encontrado" }, { status: 404 });
    }

    const nodes = mapsDb.getNodes(clone.id);
    const edges = mapsDb.getEdges(clone.id);

    return NextResponse.json(
      {
        success: true,
        map: clone,
        mapId: clone.id,
        name: clone.name,
        nodesCount: nodes.length,
        edgesCount: edges.length,
        background_copied: Boolean(clone.background_image),
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/maps/[id]/clone error:", err);
    return NextResponse.json(
      { error: "Error al clonar el mapa: " + (err?.message || "desconocido") },
      { status: 500 }
    );
  }
}
