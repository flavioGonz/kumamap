import { NextRequest, NextResponse } from "next/server";
import { traficoDeEnlace } from "@/lib/kuma-traffic";

export const dynamic = "force-dynamic";

/**
 * GET /api/kuma/traffic/[monitorId]?minutos=60
 *
 * Trafico en vivo del enlace: las dos direcciones si existen, con la velocidad ya
 * calculada a partir del tiempo real entre lecturas. El navegador solo dibuja.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  try {
    const { monitorId } = await params;
    const id = parseInt(monitorId, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "monitor inválido" }, { status: 400 });
    const min = Number(req.nextUrl.searchParams.get("minutos"));
    const datos = await traficoDeEnlace(id, min >= 5 && min <= 1440 ? min : 60);
    return NextResponse.json(datos);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "no se pudo leer el tráfico" }, { status: 500 });
  }
}
