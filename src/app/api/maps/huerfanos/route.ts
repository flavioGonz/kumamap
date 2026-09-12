/**
 * Nodos que apuntan a monitores que Uptime Kuma ya no tiene (A7).
 *
 * Pasa cuando se borra un monitor en Kuma y nadie toca el mapa: el nodo queda
 * vinculado a un id que no existe. No pinta estado, no suma a ninguna
 * disponibilidad y no da error — simplemente no está, que es la peor forma de
 * fallar. En producción había 16, y seis de ellos eran todos los switches de un
 * cliente.
 *
 * Desvincular no borra el nodo: lo deja como un nodo sin sensor, visible en el
 * mapa y listo para volver a vincularlo al monitor correcto.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import db from "@/lib/db";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

const BASE_VIRTUAL = 900000;   // los virtuales de monitor-ng no viven en Kuma

interface Huerfano {
  nodoId: string; mapaId: string; mapa: string; etiqueta: string; monitorId: number;
}

function buscar(): { huerfanos: Huerfano[]; conocidos: number } {
  const filas = db.prepare(`
    SELECT n.id AS nodoId, n.map_id AS mapaId, m.name AS mapa,
           n.label AS etiqueta, n.kuma_monitor_id AS monitorId
      FROM network_map_nodes n
      JOIN network_maps m ON m.id = n.map_id
     WHERE n.kuma_monitor_id IS NOT NULL
     ORDER BY m.name, n.label
  `).all() as any[];

  const vivos = new Set<number>();
  try { for (const m of getKumaClient().getMonitors()) vivos.add(m.id); } catch { /* sin Kuma */ }
  // Sin lista de monitores no se puede decidir nada: mejor no acusar a nadie.
  if (vivos.size === 0) return { huerfanos: [], conocidos: 0 };

  const huerfanos = filas
    .filter((f) => Number(f.monitorId) < BASE_VIRTUAL && !vivos.has(Number(f.monitorId)))
    .map((f) => ({
      nodoId: String(f.nodoId), mapaId: String(f.mapaId), mapa: String(f.mapa),
      etiqueta: String(f.etiqueta || "").replace(/<[^>]*>/g, " ").trim() || `nodo ${f.nodoId}`,
      monitorId: Number(f.monitorId),
    }));
  return { huerfanos, conocidos: vivos.size };
}

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { huerfanos, conocidos } = buscar();
    return NextResponse.json({ huerfanos, monitoresConocidos: conocidos });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { nodos } = (await req.json()) as { nodos?: string[] };
    if (!Array.isArray(nodos) || nodos.length === 0) {
      return NextResponse.json({ error: "No vino ningún nodo" }, { status: 400 });
    }
    // Sólo se desvincula lo que de verdad está huérfano: si mientras tanto el
    // monitor volvió a existir, el nodo se queda como está.
    const validos = new Set(buscar().huerfanos.map((h) => h.nodoId));
    const aTocar = nodos.filter((n) => validos.has(String(n)));
    if (aTocar.length === 0) {
      return NextResponse.json({ ok: true, desvinculados: 0, nota: "ya no había huérfanos" });
    }
    const stmt = db.prepare("UPDATE network_map_nodes SET kuma_monitor_id = NULL WHERE id = ?");
    const tx = db.transaction((lista: string[]) => { for (const id of lista) stmt.run(id); });
    tx(aTocar);
    return NextResponse.json({ ok: true, desvinculados: aTocar.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
