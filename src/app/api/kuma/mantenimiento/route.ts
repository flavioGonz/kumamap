/**
 * API de ventanas de mantenimiento (K2).
 *
 * Leer es contra la base de Kuma; escribir es por su socket, que es lo que hace
 * que la ventana empiece a correr en el momento y no al próximo reinicio.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import db from "@/lib/db";
import { getKumaClient } from "@/lib/kuma";
import {
  listarVentanas, payloadKuma, revisarAlta, ZONA, ahoraEn,
  type AltaVentana,
} from "@/lib/mantenimiento";

export const dynamic = "force-dynamic";

/** Los monitores que cada mapa tiene colgados de sus nodos. */
function monitoresPorMapa(): Array<{ id: string; nombre: string; ids: number[] }> {
  const mapas = db.prepare("SELECT id, name FROM network_maps ORDER BY name").all() as any[];
  const nodos = db.prepare(
    "SELECT map_id, kuma_monitor_id FROM network_map_nodes WHERE kuma_monitor_id IS NOT NULL"
  ).all() as any[];
  const porMapa = new Map<string, Set<number>>();
  for (const n of nodos) {
    const s = porMapa.get(n.map_id) || new Set<number>();
    s.add(Number(n.kuma_monitor_id));
    porMapa.set(n.map_id, s);
  }
  return mapas.map((m) => ({ id: m.id, nombre: m.name, ids: [...(porMapa.get(m.id) || [])] }));
}

function catalogoMonitores() {
  const salida = new Map<number, { nombre: string; tipo: string; estado: number | null }>();
  try {
    for (const m of getKumaClient().getMonitors()) {
      salida.set(m.id, {
        nombre: m.name,
        tipo: (m as any).type || "",
        estado: typeof m.status === "number" ? m.status : null,
      });
    }
  } catch { /* sin Kuma se muestran los ids pelados */ }
  return salida;
}

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const ventanas = await listarVentanas();
    const nombres = catalogoMonitores();

    const mapas = monitoresPorMapa().map((m) => ({
      id: m.id,
      nombre: m.nombre,
      // Los virtuales de monitor-ng no viven en Kuma: no se pueden mantener desde acá.
      monitores: m.ids
        .filter((id) => id < 900000 && nombres.has(id))
        .map((id) => ({ id, nombre: nombres.get(id)!.nombre, tipo: nombres.get(id)!.tipo }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre)),
    })).filter((m) => m.monitores.length > 0);

    const enMapas = new Set(mapas.flatMap((m) => m.monitores.map((x) => x.id)));
    const sueltos = [...nombres.entries()]
      .filter(([id]) => id < 900000 && !enMapas.has(id))
      .map(([id, v]) => ({ id, nombre: v.nombre, tipo: v.tipo }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre));

    return NextResponse.json({
      ventanas: ventanas.map((v) => ({
        ...v,
        nombresMonitores: v.monitores.map((id) => nombres.get(id)?.nombre || `monitor ${id}`),
      })),
      mapas,
      sueltos,
      zona: ZONA,
      ahora: ahoraEn(ZONA),
      conexion: getKumaClient().isConnected,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const body = (await req.json()) as AltaVentana & { monitores?: number[] };
    const problema = revisarAlta(body);
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });

    const monitores = (body.monitores || []).map(Number).filter((x) => Number.isFinite(x) && x < 900000);
    if (monitores.length === 0) {
      return NextResponse.json({ error: "Elegí al menos un monitor" }, { status: 400 });
    }

    const kuma = getKumaClient();
    const alta = await kuma.crearMantenimiento(payloadKuma(body));
    if (!alta.ok || !alta.id) {
      return NextResponse.json({ error: alta.msg || "Kuma rechazó la ventana" }, { status: 502 });
    }

    const vinculo = await kuma.asignarMonitores(alta.id, monitores);
    if (!vinculo.ok) {
      // Una ventana sin monitores no mantiene nada: mejor deshacerla que dejarla colgada.
      await kuma.borrarMantenimiento(alta.id);
      return NextResponse.json(
        { error: vinculo.msg || "No se pudieron asignar los monitores" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, id: alta.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { id, accion, monitores } = (await req.json()) as {
      id: number; accion: "pausar" | "reanudar" | "monitores"; monitores?: number[];
    };
    if (!Number.isFinite(Number(id))) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }
    const kuma = getKumaClient();

    if (accion === "pausar") {
      const r = await kuma.pausarMantenimiento(Number(id));
      return r.ok ? NextResponse.json({ ok: true })
                  : NextResponse.json({ error: r.msg || "no se pudo pausar" }, { status: 502 });
    }
    if (accion === "reanudar") {
      const r = await kuma.reanudarMantenimiento(Number(id));
      return r.ok ? NextResponse.json({ ok: true })
                  : NextResponse.json({ error: r.msg || "no se pudo reanudar" }, { status: 502 });
    }
    if (accion === "monitores") {
      const ids = (monitores || []).map(Number).filter((x) => Number.isFinite(x) && x < 900000);
      const r = await kuma.asignarMonitores(Number(id), ids);
      return r.ok ? NextResponse.json({ ok: true })
                  : NextResponse.json({ error: r.msg || "no se pudieron asignar" }, { status: 502 });
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  const r = await getKumaClient().borrarMantenimiento(id);
  return r.ok ? NextResponse.json({ ok: true })
              : NextResponse.json({ error: r.msg || "no se pudo borrar" }, { status: 502 });
}
