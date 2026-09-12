import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { listarTraps, resumenTraps, borrarTraps, estadoReceptor, reubicarPendientes } from "@/lib/traps";
import { estadoIndice, refrescarAhora } from "@/lib/mapa-ips";

export const dynamic = "force-dynamic";

/** GET /api/traps?horas=24&origen=&gravedad=&q=&mapaId=&limite= */
export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const sp = req.nextUrl.searchParams;
    const horas = Number(sp.get("horas") || 0);
    const traps = listarTraps({
      limite: Number(sp.get("limite") || 300),
      desde: horas > 0 ? Date.now() - horas * 3600_000 : undefined,
      origen: sp.get("origen") || undefined,
      gravedad: sp.get("gravedad") || undefined,
      mapaId: sp.get("mapaId") || undefined,
      texto: sp.get("q") || undefined,
    });
    return NextResponse.json({
      traps,
      resumen: resumenTraps(),
      receptor: estadoReceptor(),
      indice: estadoIndice(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

/**
 * POST /api/traps  { accion: "reubicar" }
 * Rearma el índice de IPs del mapa y vuelve a intentar ubicar los avisos que
 * quedaron sin equipo. Es lo que se usa después de cargarle la IP a un nodo.
 */
export async function POST(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const b = await req.json().catch(() => ({}));
    if (b?.accion !== "reubicar") {
      return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
    }
    await refrescarAhora();
    const ubicados = reubicarPendientes();
    return NextResponse.json({ ok: true, ubicados, indice: estadoIndice() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

/** DELETE /api/traps?dias=7 — sin parámetro, borra todo. Sólo administradores. */
export async function DELETE(req: NextRequest) {
  const s = requireAdmin(req);
  if (s instanceof NextResponse) return s;
  try {
    const dias = Number(req.nextUrl.searchParams.get("dias") || 0);
    const borrados = borrarTraps(dias > 0 ? Date.now() - dias * 86400_000 : undefined);
    return NextResponse.json({ ok: true, borrados });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
