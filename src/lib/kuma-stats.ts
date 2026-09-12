/**
 * Disponibilidad (SLA) leída de las estadísticas que Uptime Kuma ya calculó.
 *
 * Kuma agrega los latidos en `stat_minutely`, `stat_hourly` y `stat_daily` con
 * `up`, `down`, `ping`, `ping_min` y `ping_max` por monitor. Nosotros no
 * recorremos los 250.000 latidos: leemos esos agregados, que es lo que hace que
 * esto salga en milisegundos y no en segundos.
 *
 * Se usa `stat_hourly` para todo — 24 h, 7 d y 30 d — en vez de `stat_daily`,
 * por dos razones: las ventanas quedan exactas (rodantes, no por día calendario)
 * y el día local se puede armar corriendo el timestamp. La base guarda todo en
 * UTC y Uruguay está en UTC-3: si se agrupara por el día de `stat_daily`, cada
 * "día" del reporte empezaría a las 21:00 del día anterior.
 */
import mysql from "mysql2/promise";
import { getKumaDb } from "./kuma-db";

/** Uruguay no cambia de hora desde 2015. Configurable por si se usa en otro lado. */
const DESFASE_SEG = parseInt(process.env.SLA_TZ_OFFSET_MIN || "-180", 10) * 60;

/** Los monitores virtuales de monitor-ng viven arriba de este id y no están en Kuma. */
const BASE_VIRTUAL = 900000;

export interface Tramo {
  up: number;
  down: number;
  /** Porcentaje de disponibilidad, o null si no hubo ni un latido en la ventana. */
  pct: number | null;
  ping: number | null;
  pingMin: number | null;
  pingMax: number | null;
}

export interface Ventanas { h24: Tramo; d7: Tramo; d30: Tramo }

export interface DiaSla {
  fecha: string;   // YYYY-MM-DD en hora local
  up: number;
  down: number;
  pct: number | null;
  ping: number | null;
}

const VACIO: Tramo = { up: 0, down: 0, pct: null, ping: null, pingMin: null, pingMax: null };

function tramo(up: number, down: number, ping: number | null, min: number | null, max: number | null): Tramo {
  const total = up + down;
  return {
    up, down,
    pct: total > 0 ? (up / total) * 100 : null,
    ping: ping != null && isFinite(ping) ? Math.round(ping * 10) / 10 : null,
    pingMin: min != null && isFinite(min) ? Math.round(min * 10) / 10 : null,
    pingMax: max != null && isFinite(max) ? Math.round(max * 10) / 10 : null,
  };
}

/** Suma varios tramos en uno: es el SLA de un mapa entero. */
export function sumarTramos(ts: Tramo[]): Tramo {
  let up = 0, down = 0, pings: number[] = [];
  let min: number | null = null, max: number | null = null;
  for (const t of ts) {
    up += t.up; down += t.down;
    if (t.ping != null) pings.push(t.ping);
    if (t.pingMin != null) min = min == null ? t.pingMin : Math.min(min, t.pingMin);
    if (t.pingMax != null) max = max == null ? t.pingMax : Math.max(max, t.pingMax);
  }
  const prom = pings.length ? pings.reduce((a, b) => a + b, 0) / pings.length : null;
  return tramo(up, down, prom, min, max);
}

/* ─────────────────────────────────────────── caché ── */

interface Entrada<T> { valor: T; hasta: number }
const cache = new Map<string, Entrada<any>>();
const TTL_MS = 30_000;

async function conCache<T>(clave: string, produce: () => Promise<T>): Promise<T> {
  const e = cache.get(clave);
  if (e && e.hasta > Date.now()) return e.valor as T;
  const valor = await produce();
  cache.set(clave, { valor, hasta: Date.now() + TTL_MS });
  // La caché no crece sola: sólo hay un puñado de claves posibles.
  if (cache.size > 64) for (const [k, v] of cache) if (v.hasta < Date.now()) cache.delete(k);
  return valor;
}

/* ─────────────────────────────────────── consultas ── */

function esReal(id: number): boolean {
  return Number.isFinite(id) && id > 0 && id < BASE_VIRTUAL;
}

export function hayEstadisticas(): boolean {
  return !!(process.env.KUMA_DB_HOST || process.env.KUMA_DB_SOCKET);
}

/**
 * Disponibilidad de 24 h, 7 d y 30 d por monitor, en una sola consulta.
 * Sin `ids` devuelve todos los monitores que Kuma tenga.
 */
export async function ventanasDe(ids?: number[]): Promise<Map<number, Ventanas>> {
  const filtrados = ids ? ids.filter(esReal) : null;
  if (filtrados && filtrados.length === 0) return new Map();
  if (!hayEstadisticas()) return new Map();

  const clave = "vent:" + (filtrados ? filtrados.slice().sort((a, b) => a - b).join(",") : "todos");
  return conCache(clave, async () => {
    const ahora = Math.floor(Date.now() / 1000);
    const t24 = ahora - 86400, t7 = ahora - 7 * 86400, t30 = ahora - 30 * 86400;
    const db = getKumaDb();
    const donde = filtrados ? ` AND monitor_id IN (${filtrados.map(() => "?").join(",")})` : "";
    const args: any[] = [t24, t24, t24, t24, t24, t7, t7, t7, t7, t7, t30];
    if (filtrados) args.push(...filtrados);

    const [filas] = await db.query<mysql.RowDataPacket[]>(
      `SELECT monitor_id AS id,
         SUM(CASE WHEN timestamp >= ? THEN up ELSE 0 END)              AS u24,
         SUM(CASE WHEN timestamp >= ? THEN down ELSE 0 END)            AS d24,
         AVG(CASE WHEN timestamp >= ? THEN NULLIF(ping,0) END)         AS p24,
         MIN(CASE WHEN timestamp >= ? THEN NULLIF(ping_min,0) END)     AS n24,
         MAX(CASE WHEN timestamp >= ? THEN NULLIF(ping_max,0) END)     AS x24,
         SUM(CASE WHEN timestamp >= ? THEN up ELSE 0 END)              AS u7,
         SUM(CASE WHEN timestamp >= ? THEN down ELSE 0 END)            AS d7,
         AVG(CASE WHEN timestamp >= ? THEN NULLIF(ping,0) END)         AS p7,
         MIN(CASE WHEN timestamp >= ? THEN NULLIF(ping_min,0) END)     AS n7,
         MAX(CASE WHEN timestamp >= ? THEN NULLIF(ping_max,0) END)     AS x7,
         SUM(up) AS u30, SUM(down) AS d30,
         AVG(NULLIF(ping,0)) AS p30, MIN(NULLIF(ping_min,0)) AS n30, MAX(NULLIF(ping_max,0)) AS x30
       FROM stat_hourly
       WHERE timestamp >= ?${donde}
       GROUP BY monitor_id`,
      args
    );

    const out = new Map<number, Ventanas>();
    for (const f of filas as any[]) {
      out.set(Number(f.id), {
        h24: tramo(Number(f.u24) || 0, Number(f.d24) || 0, f.p24 != null ? Number(f.p24) : null, f.n24 != null ? Number(f.n24) : null, f.x24 != null ? Number(f.x24) : null),
        d7:  tramo(Number(f.u7)  || 0, Number(f.d7)  || 0, f.p7  != null ? Number(f.p7)  : null, f.n7  != null ? Number(f.n7)  : null, f.x7  != null ? Number(f.x7)  : null),
        d30: tramo(Number(f.u30) || 0, Number(f.d30) || 0, f.p30 != null ? Number(f.p30) : null, f.n30 != null ? Number(f.n30) : null, f.x30 != null ? Number(f.x30) : null),
      });
    }
    return out;
  });
}

/** Un tramo vacío, para los monitores de los que todavía no hay estadística. */
export function ventanasVacias(): Ventanas {
  return { h24: { ...VACIO }, d7: { ...VACIO }, d30: { ...VACIO } };
}

/**
 * Serie por día local (no por día UTC) para la tira del reporte.
 * `dias` se cuenta hacia atrás desde hoy.
 */
export async function serieDiaria(ids: number[], dias = 30): Promise<Map<number, DiaSla[]>> {
  const filtrados = ids.filter(esReal);
  if (!filtrados.length || !hayEstadisticas()) return new Map();

  const clave = `serie:${dias}:${filtrados.slice().sort((a, b) => a - b).join(",")}`;
  return conCache(clave, async () => {
    const desde = Math.floor(Date.now() / 1000) - dias * 86400;
    const db = getKumaDb();
    const [filas] = await db.query<mysql.RowDataPacket[]>(
      `SELECT monitor_id AS id,
              FLOOR((timestamp + ?) / 86400) AS dia,
              SUM(up) AS u, SUM(down) AS d, AVG(NULLIF(ping,0)) AS p
       FROM stat_hourly
       WHERE timestamp >= ? AND monitor_id IN (${filtrados.map(() => "?").join(",")})
       GROUP BY monitor_id, dia
       ORDER BY dia ASC`,
      [DESFASE_SEG, desde, ...filtrados]
    );

    const out = new Map<number, DiaSla[]>();
    for (const f of filas as any[]) {
      const id = Number(f.id);
      const lista = out.get(id) || [];
      const up = Number(f.u) || 0, down = Number(f.d) || 0;
      lista.push({
        // dia * 86400 cae en la medianoche local expresada como si fuera UTC:
        // tomar los 10 primeros caracteres del ISO da la fecha local correcta.
        fecha: new Date(Number(f.dia) * 86400 * 1000).toISOString().slice(0, 10),
        up, down,
        pct: up + down > 0 ? (up / (up + down)) * 100 : null,
        ping: f.p != null ? Math.round(Number(f.p) * 10) / 10 : null,
      });
      out.set(id, lista);
    }
    return out;
  });
}

/** Cuántos días de estadística hay guardados, para poder decirlo en pantalla. */
export async function alcance(): Promise<{ desde: string | null; horas: number }> {
  if (!hayEstadisticas()) return { desde: null, horas: 0 };
  return conCache("alcance", async () => {
    const db = getKumaDb();
    const [f] = await db.query<mysql.RowDataPacket[]>(
      "SELECT MIN(timestamp) AS min, COUNT(*) AS n FROM stat_hourly"
    );
    const min = (f as any[])[0]?.min;
    return {
      desde: min ? new Date(Number(min) * 1000).toISOString() : null,
      horas: min ? Math.floor((Date.now() / 1000 - Number(min)) / 3600) : 0,
    };
  });
}
