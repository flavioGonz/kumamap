import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";
import { updateMapSchema } from "@/lib/validation";
import { mintStreamRef } from "@/lib/stream-token";
import { publicSafe } from "@/lib/redact";

/**
 * Node `custom_data` is a JSON blob that carries device credentials
 * (mgmtPassword, snmpCommunity, RTSP URLs with user:pass@, …). This route is
 * readable WITHOUT a session because the public kiosk renders maps.
 *
 * So before returning nodes we:
 *   1. mint a signed `streamRef` for any camera node that has a streamUrl, so
 *      the kiosk can still pull frames through the proxy without ever seeing
 *      the credentials;
 *   2. hand the payload to `publicSafe`, which strips every secret field for
 *      anonymous callers (authenticated operators get the real values).
 */
function withStreamRefs(nodes: ReturnType<typeof mapsDb.getNodes>) {
  return nodes.map((node: any) => {
    if (!node.custom_data || typeof node.custom_data !== "string") return node;
    try {
      const cd = JSON.parse(node.custom_data);
      if (!cd?.streamUrl) return node;
      cd.streamRef = mintStreamRef(cd.streamUrl);
      return { ...node, custom_data: JSON.stringify(cd) };
    } catch {
      return node; // malformed custom_data — leave untouched
    }
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const map = mapsDb.getById(id);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nodes = withStreamRefs(mapsDb.getNodes(id));
    const edges = mapsDb.getEdges(id);
    return NextResponse.json(publicSafe(req.headers, { ...map, nodes, edges }));
  } catch (err) {
    console.error("GET /api/maps/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateMapSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const map = mapsDb.update(id, parsed.data);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(map);
  } catch (err) {
    console.error("PUT /api/maps/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = mapsDb.delete(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/maps/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
