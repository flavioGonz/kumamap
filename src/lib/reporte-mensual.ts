/**
 * Reporte mensual por cliente (N2).
 *
 * Es el único informe que se le manda al cliente y el que respalda la factura,
 * así que lo que dice tiene que poder defenderse línea por línea.
 *
 * De dónde sale cada número:
 *  - El porcentaje de disponibilidad sale de `stat_daily`, NO de `stat_hourly`.
 *    Medido en producción: para agosto, `stat_hourly` tenía 437 de las 744 horas
 *    del mes y `stat_daily` los 31 días completos. Con las horas, Mecsegur daba
 *    95,24 %; con los días, 86,7 %. La tabla por hora sirve para las ventanas
 *    rodantes de /sla —que nunca miran más de 30 días atrás— pero un mes cerrado
 *    calculado sobre ella informa de menos, que es el peor error posible en algo
 *    que se factura.
 *  - Los cortes salen de `heartbeat` con `important = 1`, que son las
 *    transiciones reales con su hora exacta y el mensaje del monitor. No se
 *    estiman multiplicando latidos por el intervalo: se leen los dos extremos.
 *  - El mantenimiento programado sale de esas mismas transiciones (estado 3).
 *    Kuma no cuenta esos latidos ni como arriba ni como abajo, así que el
 *    porcentaje ya los excluye; se listan aparte para que se vea por qué hubo
 *    un corte de servicio que no figura como indisponibilidad.
 *
 * Sobre el día y la hora: los cortes se ubican en hora de Uruguay (UTC-3 desde
 * 2015, sin horario de verano) porque es la que le sirve a quien lee el informe.
 * Los días de disponibilidad, en cambio, son los que cierra Uptime Kuma, que
 * corta a las 00:00 UTC — las 21:00 de acá. Se elige eso y no recortar a mano
 * porque el día ya viene agregado: rearmarlo desde los latidos sería recorrer
 * medio millón de filas para mover tres horas un promedio mensual. La hoja lo
 * dice explícitamente en vez de disimularlo.
 */
import { getKumaDb, isKumaDbConfigured } from "./kuma-db";
import db from "./db";
import { getKumaClient } from "./kuma";

const DESFASE_MIN = parseInt(process.env.SLA_TZ_OFFSET_MIN || "-180", 10);
const BASE_VIRTUAL = 900000;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

export interface RangoMes {
  anio: number; mes: number;             // mes 1..12
  desdeUnix: number; hastaUnix: number;  // límites en epoch (UTC), mes local
  /** Límites en días UTC, que es como `stat_daily` cierra su día. */
  desdeDia: number; hastaDia: number;
  desdeSql: string; hastaSql: string;    // "YYYY-MM-DD HH:mm:ss" en UTC, para heartbeat
  etiqueta: string;                      // "agosto de 2026"
  dias: number;
}

function aSql(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

export function rangoMes(anio: number, mes: number): RangoMes {
  // Medianoche local del 1° = 00:00 local − desfase. Con UTC-3, 03:00 UTC.
  const desdeMs = Date.UTC(anio, mes - 1, 1) - DESFASE_MIN * 60_000;
  const hastaMs = Date.UTC(anio, mes, 1) - DESFASE_MIN * 60_000;
  return {
    anio, mes,
    desdeUnix: Math.floor(desdeMs / 1000),
    hastaUnix: Math.floor(hastaMs / 1000),
    desdeDia: Math.floor(Date.UTC(anio, mes - 1, 1) / 1000),
    hastaDia: Math.floor(Date.UTC(anio, mes, 1) / 1000),
    desdeSql: aSql(desdeMs),
    hastaSql: aSql(hastaMs),
    etiqueta: `${MESES[mes - 1]} de ${anio}`,
    dias: Math.round((hastaMs - desdeMs) / 86_400_000),
  };
}

/** El mes cerrado más reciente: es el que se factura. */
export function mesAnterior(): { anio: number; mes: number } {
  const ahora = new Date(Date.now() + DESFASE_MIN * 60_000);
  let mes = ahora.getUTCMonth();        // 0..11 → ya es el mes anterior en base 1
  let anio = ahora.getUTCFullYear();
  if (mes === 0) { mes = 12; anio -= 1; }
  return { anio, mes };
}

export interface DiaReporte {
  fecha: string;        // YYYY-MM-DD local
  up: number; down: number;
  pct: number | null;
  ping: number | null;
  mant: number;
}

export interface Corte {
  monitorId: number;
  inicio: string;       // "YYYY-MM-DD HH:mm:ss" local
  fin: string | null;   // null = seguía caído al cerrar el mes
  segundos: number;
  motivo: string;       // el msg del monitor al caer
  /** true cuando lo que empezó fue una ventana de mantenimiento, no una falla. */
  programado: boolean;
}

export interface MonitorReporte {
  id: number; nombre: string; tipo: string;
  up: number; down: number; mant: number;
  /** Días del mes con registro. Menos que los del mes = el mes está incompleto. */
  dias: number;
  pct: number | null;
  ping: number | null; pingMin: number | null; pingMax: number | null;
  intervalo: number;
  cortes: number;
  segundosCaido: number;
  serie: DiaReporte[];
}

export interface Reporte {
  cliente: string;
  mapaId: string;
  rango: RangoMes;
  generado: string;         // fecha local de emisión
  monitores: MonitorReporte[];
  /** Del cliente entero: la suma de latidos, no el promedio de porcentajes. */
  pct: number | null;
  up: number; down: number; mant: number;
  /** Suma de los cortes de cada enlace. Cuenta dos veces lo que cayó junto. */
  segundosCaido: number;
  /**
   * Tiempo en que hubo AL MENOS un enlace caído: la unión de los intervalos.
   * Es el número honesto para la tapa del informe — sumar los cortes de un
   * grupo y los de sus hijos cuenta el mismo corte dos y tres veces.
   */
  segundosAlgunoCaido: number;
  cortes: Corte[];
  mantenimientos: Corte[];
  /** Días del mes con el total del cliente. */
  serie: DiaReporte[];
  /** Monitores del mapa que Kuma ya no tiene. */
  huerfanos: number[];
  datosDesde: string | null;
  /** Proporción de los días del mes que tienen registro (0..1). */
  cobertura: number | null;
}

function pct(up: number, down: number): number | null {
  const t = up + down;
  return t > 0 ? (up / t) * 100 : null;
}

function redondear(v: unknown, d = 1): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** d) / 10 ** d;
}

/** epoch en segundos del día UTC → "YYYY-MM-DD" */
function fechaDeDia(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** "2026-08-03 14:22:10" UTC → la misma hora en local */
function aLocal(sql: string): string {
  const ms = Date.parse(sql.replace(" ", "T") + "Z") + DESFASE_MIN * 60_000;
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Reconstruye cortes y mantenimientos caminando las transiciones.
 *
 * Se piden siete días extra hacia atrás para no cortar al medio un evento que
 * ya venía de antes: un corte que empezó el 31 a las 23:50 es parte del mes que
 * se informa, aunque su transición esté fuera del rango.
 */
function armarEventos(
  filas: Array<{ monitor_id: number; status: number; time: unknown; msg: string }>,
  rango: RangoMes
): { cortes: Corte[]; mantenimientos: Corte[] } {
  // mysql2 devuelve DATETIME como Date salvo que se pida formateado. La consulta
  // ya lo pide con DATE_FORMAT, pero normalizar acá evita que un cambio de
  // consulta rompa el reporte en silencio.
  const enTexto = (v: unknown): string =>
    v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 19) : String(v ?? "");
  type Fila = { monitor_id: number; status: number; time: string; msg: string };
  const porMonitor = new Map<number, Fila[]>();
  for (const f of filas) {
    const l = porMonitor.get(Number(f.monitor_id)) || [];
    l.push({ monitor_id: Number(f.monitor_id), status: Number(f.status), time: enTexto(f.time), msg: String(f.msg ?? "") });
    porMonitor.set(Number(f.monitor_id), l);
  }

  const cortes: Corte[] = [];
  const mantenimientos: Corte[] = [];
  const desdeMs = rango.desdeUnix * 1000;
  const hastaMs = rango.hastaUnix * 1000;

  for (const [id, lista] of porMonitor) {
    lista.sort((a, b) => a.time.localeCompare(b.time));
    let abierto: { desde: number; msg: string; programado: boolean } | null = null;

    for (const f of lista) {
      const t = Date.parse(f.time.replace(" ", "T") + "Z");
      const malo = f.status === 0 || f.status === 2;
      const mant = f.status === 3;

      if ((malo || mant) && (!abierto || abierto.programado !== mant)) {
        if (abierto) cerrar(id, abierto, t);
        abierto = { desde: t, msg: String(f.msg || ""), programado: mant };
      } else if (!malo && !mant && abierto) {
        cerrar(id, abierto, t);
        abierto = null;
      }
    }
    if (abierto) cerrar(id, abierto, hastaMs, true);
  }

  function cerrar(id: number, a: { desde: number; msg: string; programado: boolean }, finMs: number, abiertoAlCierre = false) {
    // Recorte al mes: lo que pasó antes del 1° o después del último día no es de este mes.
    const ini = Math.max(a.desde, desdeMs);
    const fin = Math.min(finMs, hastaMs);
    if (fin <= ini) return;
    const ev: Corte = {
      monitorId: id,
      inicio: aLocal(aSql(ini)),
      fin: abiertoAlCierre && finMs >= hastaMs ? null : aLocal(aSql(fin)),
      segundos: Math.round((fin - ini) / 1000),
      motivo: a.msg,
      programado: a.programado,
    };
    (a.programado ? mantenimientos : cortes).push(ev);
  }

  const porFecha = (a: Corte, b: Corte) => a.inicio.localeCompare(b.inicio);
  return { cortes: cortes.sort(porFecha), mantenimientos: mantenimientos.sort(porFecha) };
}

/** Devuelve los días del mes en orden, con null donde no hubo registro. */
function rellenarMes(porDia: Map<string, DiaReporte>, rango: RangoMes): DiaReporte[] {
  const salida: DiaReporte[] = [];
  for (let i = 0; i < rango.dias; i++) {
    const fecha = new Date(Date.UTC(rango.anio, rango.mes - 1, 1 + i)).toISOString().slice(0, 10);
    salida.push(porDia.get(fecha) || { fecha, up: 0, down: 0, pct: null, ping: null, mant: 0 });
  }
  return salida;
}

/** Unión de intervalos: cuánto tiempo hubo algo caído, sin contar dos veces. */
function unir(cortes: Corte[]): number {
  if (!cortes.length) return 0;
  const tramos = cortes
    .map((c) => ({
      a: Date.parse(c.inicio.replace(" ", "T") + "Z"),
      b: Date.parse((c.fin || c.inicio).replace(" ", "T") + "Z") + (c.fin ? 0 : c.segundos * 1000),
    }))
    .sort((x, y) => x.a - y.a);
  let total = 0, ini = tramos[0].a, fin = tramos[0].b;
  for (const t of tramos.slice(1)) {
    if (t.a > fin) { total += fin - ini; ini = t.a; fin = t.b; }
    else if (t.b > fin) fin = t.b;
  }
  total += fin - ini;
  return Math.round(total / 1000);
}

export async function armarReporte(
  mapa: { id: string; nombre: string; ids: number[] },
  nombres: Map<number, { nombre: string; tipo: string; intervalo: number }>,
  anio: number, mes: number
): Promise<Reporte> {
  const rango = rangoMes(anio, mes);
  const vivos = mapa.ids.filter((id) => id < BASE_VIRTUAL && nombres.has(id));
  const huerfanos = mapa.ids.filter((id) => id < BASE_VIRTUAL && !nombres.has(id));

  const vacio: Reporte = {
    cliente: mapa.nombre, mapaId: mapa.id, rango,
    generado: aLocal(aSql(Date.now())),
    monitores: [], pct: null, up: 0, down: 0, mant: 0, segundosCaido: 0, segundosAlgunoCaido: 0,
    cortes: [], mantenimientos: [], serie: [], huerfanos, datosDesde: null,
    cobertura: null,
  };
  if (!isKumaDbConfigured() || vivos.length === 0) return vacio;

  const pool = getKumaDb();
  const marcas = vivos.map(() => "?").join(",");

  // Totales del mes por monitor, de la tabla diaria: es la única que guarda el
  // año entero. La horaria se purga y deja meses cerrados a medio contar.
  const [tot] = await pool.query(
    `SELECT monitor_id AS id, SUM(up) AS up, SUM(down) AS dn, COUNT(*) AS dias,
            AVG(NULLIF(ping,0)) AS p, MIN(NULLIF(ping_min,0)) AS pmin, MAX(NULLIF(ping_max,0)) AS pmax,
            SUM(COALESCE(JSON_EXTRACT(extras,'$.maintenance'),0)) AS mant
       FROM stat_daily
      WHERE timestamp >= ? AND timestamp < ? AND monitor_id IN (${marcas})
      GROUP BY monitor_id`,
    [rango.desdeDia, rango.hastaDia, ...vivos]
  ) as any;

  // La serie ya viene por día: una fila por monitor y día.
  const [dia] = await pool.query(
    `SELECT monitor_id AS id, timestamp AS d, up, down AS dn, NULLIF(ping,0) AS p,
            COALESCE(JSON_EXTRACT(extras,'$.maintenance'),0) AS mant
       FROM stat_daily
      WHERE timestamp >= ? AND timestamp < ? AND monitor_id IN (${marcas})
      ORDER BY timestamp`,
    [rango.desdeDia, rango.hastaDia, ...vivos]
  ) as any;

  // Transiciones, con una semana de colchón hacia atrás.
  const colchon = aSql(rango.desdeUnix * 1000 - 7 * 86_400_000);
  const [hb] = await pool.query(
    `SELECT monitor_id, status, msg,
            DATE_FORMAT(time, '%Y-%m-%d %H:%i:%s') AS time
       FROM heartbeat
      WHERE important = 1 AND time >= ? AND time < ? AND monitor_id IN (${marcas})
      ORDER BY monitor_id, time`,
    [colchon, rango.hastaSql, ...vivos]
  ) as any;

  const { cortes, mantenimientos } = armarEventos(hb as any[], rango);

  const seriePorMonitor = new Map<number, DiaReporte[]>();
  for (const f of dia as any[]) {
    const l = seriePorMonitor.get(Number(f.id)) || [];
    l.push({
      fecha: fechaDeDia(Number(f.d)),
      up: Number(f.up) || 0, down: Number(f.dn) || 0,
      pct: pct(Number(f.up) || 0, Number(f.dn) || 0),
      ping: redondear(f.p),
      mant: Number(f.mant) || 0,
    });
    seriePorMonitor.set(Number(f.id), l);
  }

  const cortesPorMonitor = new Map<number, Corte[]>();
  for (const c of cortes) {
    const l = cortesPorMonitor.get(c.monitorId) || [];
    l.push(c);
    cortesPorMonitor.set(c.monitorId, l);
  }

  const porId = new Map<number, any>();
  for (const f of tot as any[]) porId.set(Number(f.id), f);

  const monitores: MonitorReporte[] = vivos.map((id) => {
    const f = porId.get(id);
    const n = nombres.get(id)!;
    const propios = cortesPorMonitor.get(id) || [];
    return {
      id, nombre: n.nombre, tipo: n.tipo, intervalo: n.intervalo,
      up: Number(f?.up) || 0, down: Number(f?.dn) || 0, mant: Number(f?.mant) || 0,
      dias: Number(f?.dias) || 0,
      pct: pct(Number(f?.up) || 0, Number(f?.dn) || 0),
      ping: redondear(f?.p), pingMin: redondear(f?.pmin), pingMax: redondear(f?.pmax),
      cortes: propios.length,
      segundosCaido: propios.reduce((a, c) => a + c.segundos, 0),
      serie: seriePorMonitor.get(id) || [],
    };
  }).sort((a, b) => {
    if (a.pct == null && b.pct == null) return a.nombre.localeCompare(b.nombre);
    if (a.pct == null) return 1;
    if (b.pct == null) return -1;
    return a.pct - b.pct || a.nombre.localeCompare(b.nombre);
  });

  // El total del cliente es la suma de latidos, no el promedio de porcentajes:
  // un enlace con 4 latidos al 50 % no vale lo mismo que uno con 40.000 al 100 %.
  const up = monitores.reduce((a, m) => a + m.up, 0);
  const down = monitores.reduce((a, m) => a + m.down, 0);
  const mant = monitores.reduce((a, m) => a + m.mant, 0);

  const porDia = new Map<string, DiaReporte>();
  for (const m of monitores) for (const d of m.serie) {
    const acc = porDia.get(d.fecha) || { fecha: d.fecha, up: 0, down: 0, pct: null, ping: null, mant: 0 };
    acc.up += d.up; acc.down += d.down; acc.mant += d.mant;
    porDia.set(d.fecha, acc);
  }
  // El ping del día del cliente es el promedio de los monitores que respondieron.
  for (const [fecha, acc] of porDia) {
    const pings = monitores.map((m) => m.serie.find((d) => d.fecha === fecha)?.ping)
      .filter((p): p is number => p != null);
    acc.ping = pings.length ? Math.round((pings.reduce((a, b) => a + b, 0) / pings.length) * 10) / 10 : null;
    acc.pct = pct(acc.up, acc.down);
  }

  const [alc] = await pool.query(
    "SELECT MIN(timestamp) AS min FROM stat_daily WHERE monitor_id IN (" + marcas + ")",
    vivos
  ) as any;
  const min = (alc as any[])[0]?.min;

  return {
    cliente: mapa.nombre, mapaId: mapa.id, rango,
    generado: aLocal(aSql(Date.now())),
    monitores, pct: pct(up, down), up, down, mant,
    segundosCaido: cortes.reduce((a, c) => a + c.segundos, 0),
    segundosAlgunoCaido: unir(cortes),
    cortes, mantenimientos,
    // El mes entero, con los días sin registro presentes y en null: un hueco
    // dibujado como hueco dice la verdad; un eje que se comprime la esconde.
    serie: rellenarMes(porDia, rango),
    huerfanos,
    datosDesde: min ? aLocal(aSql(Number(min) * 1000)) : null,
    // Un mes con registro parcial no puede informarse como si estuviera completo:
    // el porcentaje saldría de los días que hay, no de los del mes.
    cobertura: monitores.length
      ? Math.min(1, monitores.reduce((a, m) => a + m.dias, 0) / (monitores.length * rango.dias))
      : null,
  };
}

/* ── de dónde salen los clientes y los nombres ── */

/** Un mapa es un cliente: sus monitores son los que cuelgan de sus nodos. */
export function monitoresPorMapa(): Array<{ id: string; nombre: string; ids: number[] }> {
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

export function catalogoMonitores(): Map<number, { nombre: string; tipo: string; intervalo: number }> {
  const m = new Map<number, { nombre: string; tipo: string; intervalo: number }>();
  try {
    for (const x of getKumaClient().getMonitors()) {
      m.set(x.id, {
        nombre: x.name,
        tipo: (x as any).type || "",
        intervalo: Number((x as any).interval) || 60,
      });
    }
  } catch { /* sin Kuma no hay reporte */ }
  return m;
}

/** Los meses que tienen datos, del más nuevo al más viejo. */
export async function mesesDisponibles(): Promise<Array<{ anio: number; mes: number; etiqueta: string }>> {
  if (!isKumaDbConfigured()) return [];
  const pool = getKumaDb();
  const [f] = await pool.query("SELECT MIN(timestamp) AS min, MAX(timestamp) AS max FROM stat_daily") as any;
  const min = Number((f as any[])[0]?.min), max = Number((f as any[])[0]?.max);
  if (!min || !max) return [];
  const salida: Array<{ anio: number; mes: number; etiqueta: string }> = [];
  const fin = new Date(max * 1000);
  let a = fin.getUTCFullYear(), m = fin.getUTCMonth() + 1;
  for (let i = 0; i < 36; i++) {
    const r = rangoMes(a, m);
    if (r.hastaUnix <= min) break;
    salida.push({ anio: a, mes: m, etiqueta: r.etiqueta });
    m -= 1; if (m === 0) { m = 12; a -= 1; }
  }
  return salida;
}

/**
 * Todos los clientes del mes en una sola consulta.
 *
 * Es para la pantalla que muestra la tabla antes de emitir: treinta reportes
 * completos serían noventa consultas y varios segundos. Acá se piden los
 * agregados de todos los monitores de una vez y se agrupan por mapa en memoria.
 */
export async function resumenMensual(anio: number, mes: number): Promise<{
  rango: RangoMes;
  clientes: Array<{
    id: string; nombre: string; monitores: number; huerfanos: number;
    up: number; down: number; mant: number; pct: number | null;
    cobertura: number | null;
    peor: { id: number; nombre: string; pct: number } | null;
  }>;
}> {
  const rango = rangoMes(anio, mes);
  const mapas = monitoresPorMapa();
  const nombres = catalogoMonitores();
  const todos = [...new Set(mapas.flatMap((m) => m.ids))].filter((id) => id < BASE_VIRTUAL && nombres.has(id));
  if (!isKumaDbConfigured() || todos.length === 0) {
    return { rango, clientes: mapas.map((m) => ({
      id: m.id, nombre: m.nombre, monitores: 0, huerfanos: 0,
      up: 0, down: 0, mant: 0, pct: null, cobertura: null, peor: null,
    })) };
  }

  const pool = getKumaDb();
  const [f] = await pool.query(
    `SELECT monitor_id AS id, SUM(up) AS up, SUM(down) AS dn, COUNT(*) AS dias,
            SUM(COALESCE(JSON_EXTRACT(extras,'$.maintenance'),0)) AS mant
       FROM stat_daily
      WHERE timestamp >= ? AND timestamp < ? AND monitor_id IN (${todos.map(() => "?").join(",")})
      GROUP BY monitor_id`,
    [rango.desdeDia, rango.hastaDia, ...todos]
  ) as any;

  const porId = new Map<number, { up: number; down: number; mant: number; dias: number }>();
  for (const x of f as any[]) {
    porId.set(Number(x.id), {
      up: Number(x.up) || 0, down: Number(x.dn) || 0,
      mant: Number(x.mant) || 0, dias: Number(x.dias) || 0,
    });
  }

  const clientes = mapas.map((m) => {
    const vivos = m.ids.filter((id) => id < BASE_VIRTUAL && nombres.has(id));
    let up = 0, down = 0, mant = 0, dias = 0;
    let peor: { id: number; nombre: string; pct: number } | null = null;
    for (const id of vivos) {
      const v = porId.get(id);
      if (!v) continue;
      up += v.up; down += v.down; mant += v.mant; dias += v.dias;
      const p = pct(v.up, v.down);
      if (p != null && (!peor || p < peor.pct)) peor = { id, nombre: nombres.get(id)!.nombre, pct: p };
    }
    return {
      id: m.id, nombre: m.nombre,
      monitores: vivos.length,
      huerfanos: m.ids.filter((id) => id < BASE_VIRTUAL && !nombres.has(id)).length,
      up, down, mant, pct: pct(up, down), peor,
      cobertura: vivos.length ? Math.min(1, dias / (vivos.length * rango.dias)) : null,
    };
  }).filter((c) => c.monitores > 0)
    .sort((a, b) => {
      if (a.pct == null && b.pct == null) return a.nombre.localeCompare(b.nombre);
      if (a.pct == null) return 1;
      if (b.pct == null) return -1;
      return a.pct - b.pct || a.nombre.localeCompare(b.nombre);
    });

  return { rango, clientes };
}

/* ── formato, compartido por la API y la hoja imprimible ── */

export function fmtDuracion(s: number): string {
  if (s <= 0) return "—";
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
}

export function fmtPct(p: number | null): string {
  if (p == null) return "—";
  if (p >= 99.995) return "100,00";
  return p.toFixed(2).replace(".", ",");
}
