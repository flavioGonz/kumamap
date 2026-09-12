import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import db from "@/lib/db";
import { getKumaClient } from "@/lib/kuma";
import {
  ventanasDe, ventanasVacias, serieDiaria, sumarTramos, alcance, hayEstadisticas,
  type Ventanas, type Tramo,
} from "@/lib/kuma-stats";
import { latidosEnMantenimiento, listarVentanas } from "@/lib/mantenimiento";

export const dynamic = "force-dynamic";

interface FilaMonitor {
  id: number; nombre: string; tipo: string; activo: boolean; estado: number | null;
  /** Segundos entre latidos: con eso el conteo de caídos se convierte en tiempo. */
  intervalo: number;
  ventanas: Ventanas; serie?: any[];
  /** Latidos que Kuma marcó como mantenimiento en los últimos 30 días. */
  mant?: number;
}

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

function nombresDeMonitores() {
  const m = new Map<number, { nombre: string; tipo: string; activo: boolean; estado: number | null; intervalo: number }>();
  try {
    for (const x of getKumaClient().getMonitors()) {
      m.set(x.id, {
        nombre: x.name, tipo: (x as any).type || "", activo: (x as any).active !== false,
        estado: typeof x.status === "number" ? x.status : null,
        intervalo: Number((x as any).interval) || 60,
      });
    }
  } catch { /* si Kuma no está, se muestran los ids */ }
  return m;
}

/**
 * Un id vinculado que Uptime Kuma ya no conoce es un monitor borrado: el nodo del
 * mapa quedó apuntando al vacío y nadie se entera, porque simplemente no pinta.
 * Los virtuales de monitor-ng (>= 900000) no son huérfanos: viven en KumaMap.
 */
function separarHuerfanos(ids: number[], conocidos: Map<number, unknown>): { vivos: number[]; huerfanos: number[] } {
  const vivos: number[] = [], huerfanos: number[] = [];
  for (const id of ids) {
    if (id >= 900000 || conocidos.has(id)) vivos.push(id);
    else huerfanos.push(id);
  }
  return { vivos, huerfanos };
}

async function armarFilas(ids: number[], dias: number | null): Promise<FilaMonitor[]> {
  const ventanas = await ventanasDe(ids);
  const series = dias ? await serieDiaria(ids, dias) : null;
  const mant = await latidosEnMantenimiento(ids, 24 * 30);
  const nombres = nombresDeMonitores();
  return ids.map((id) => {
    const n = nombres.get(id);
    return {
      id,
      nombre: n?.nombre || `monitor ${id}`,
      tipo: n?.tipo || "",
      activo: n?.activo ?? true,
      estado: n?.estado ?? null,
      intervalo: n?.intervalo ?? 60,
      ventanas: ventanas.get(id) || ventanasVacias(),
      mant: mant.get(id) || 0,
      ...(series ? { serie: series.get(id) || [] } : {}),
    };
  }).sort((a, b) => {
    // Lo que peor está, arriba: es lo que uno vino a mirar.
    const pa = a.ventanas.d30.pct, pb = b.ventanas.d30.pct;
    if (pa == null && pb == null) return a.nombre.localeCompare(b.nombre);
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb || a.nombre.localeCompare(b.nombre);
  });
}

function peorDe(filas: FilaMonitor[]): { id: number; nombre: string; pct: number } | null {
  let peor: FilaMonitor | null = null;
  for (const f of filas) {
    if (f.ventanas.d30.pct == null) continue;
    if (!peor || f.ventanas.d30.pct < peor.ventanas.d30.pct!) peor = f;
  }
  return peor ? { id: peor.id, nombre: peor.nombre, pct: peor.ventanas.d30.pct! } : null;
}

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;

  if (!hayEstadisticas()) {
    return NextResponse.json({
      error: "No hay acceso a la base de Uptime Kuma. La disponibilidad sale de sus tablas de " +
             "estadística; hace falta KUMA_DB_SOCKET o KUMA_DB_HOST en el entorno.",
    }, { status: 503 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const dias = sp.get("dias") ? Math.min(Math.max(Number(sp.get("dias")), 1), 90) : null;

    // Un mapa en concreto, con el detalle de cada monitor.
    const mapId = sp.get("mapId");
    if (mapId) {
      const m = monitoresPorMapa().find((x) => x.id === mapId);
      if (!m) return NextResponse.json({ error: "No existe ese mapa" }, { status: 404 });
      const { vivos, huerfanos } = separarHuerfanos(m.ids, nombresDeMonitores());
      const filas = await armarFilas(vivos, dias ?? 30);
      return NextResponse.json({
        alcance: await alcance(),
        mapa: {
          id: m.id, nombre: m.nombre, monitores: vivos.length, huerfanos,
          sla: {
            h24: sumarTramos(filas.map((f) => f.ventanas.h24)),
            d7: sumarTramos(filas.map((f) => f.ventanas.d7)),
            d30: sumarTramos(filas.map((f) => f.ventanas.d30)),
          },
          peor: peorDe(filas),
        },
        monitores: filas,
      });
    }

    // Una lista suelta de monitores (la usa el globo del mapa).
    const idsParam = sp.get("ids");
    if (idsParam) {
      const ids = idsParam.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x > 0);
      return NextResponse.json({ alcance: await alcance(), monitores: await armarFilas(ids, dias) });
    }

    // Por defecto: un renglón por mapa. Es la tabla de la pantalla de disponibilidad.
    const mapas = monitoresPorMapa();
    const todos = [...new Set(mapas.flatMap((m) => m.ids))];
    const ventanas = await ventanasDe(todos);
    const nombres = nombresDeMonitores();

    const filas = mapas.map((m) => {
      const { vivos, huerfanos } = separarHuerfanos(m.ids, nombres);
      const vs = vivos.map((id) => ventanas.get(id) || ventanasVacias());
      const conDato = vivos
        .map((id) => ({ id, v: ventanas.get(id) }))
        .filter((x) => x.v?.d30.pct != null)
        .sort((x, y) => x.v!.d30.pct! - y.v!.d30.pct!);
      const peor = conDato[0];
      return {
        id: m.id, nombre: m.nombre, monitores: vivos.length, huerfanos: huerfanos.length,
        sla: {
          h24: sumarTramos(vs.map((v) => v.h24)),
          d7: sumarTramos(vs.map((v) => v.d7)),
          d30: sumarTramos(vs.map((v) => v.d30)),
        },
        peor: peor ? { id: peor.id, nombre: nombres.get(peor.id)?.nombre || `monitor ${peor.id}`, pct: peor.v!.d30.pct! } : null,
      };
    });

    const global: Tramo = sumarTramos(todos.map((id) => (ventanas.get(id) || ventanasVacias()).d30));

    return NextResponse.json({
      alcance: await alcance(),
      global,
      monitoresConDato: [...ventanas.keys()].length,
      huerfanosTotal: filas.reduce((a, f) => a + f.huerfanos, 0),
      mantenimiento: (await listarVentanas())
        .filter((v) => v.estado === "activa")
        .map((v) => ({ id: v.id, titulo: v.titulo, monitores: v.monitores.length })),
      mapas: filas,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
