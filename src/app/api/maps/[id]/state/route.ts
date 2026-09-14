import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";
import { saveMapStateSchema } from "@/lib/validation";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const map = mapsDb.getById(id);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const parsed = saveMapStateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { nodes, edges, view_state } = parsed.data;
    mapsDb.saveState(id, nodes, edges);
    if (view_state !== undefined) {
      mapsDb.update(id, { view_state: typeof view_state === "string" ? view_state : JSON.stringify(view_state) } as any);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/maps/[id]/state error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
