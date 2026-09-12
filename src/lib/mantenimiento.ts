/**
 * Ventanas de mantenimiento (K2).
 *
 * Uptime Kuma ya sabe de mantenimiento: mientras una ventana corre marca los
 * latidos de esos monitores como MAINTENANCE (3) y su agregador NO los suma ni
 * a `up` ni a `down` — los guarda aparte, en el JSON `extras` de `stat_hourly`.
 * Eso quiere decir que una intervención programada deja de contar como caída en
 * el SLA sin tocar una línea del cálculo, y que ni push-sender ni
 * whatsapp-sender avisan (los dos ignoran todo lo que no sea 0 o 1).
 *
 * Acá hacemos dos cosas:
 *  - leer las ventanas desde la base de Kuma (determinista, sin depender de que
 *    el socket esté autenticado en ese instante);
 *  - contar los latidos que quedaron en mantenimiento, para poder mostrar al
 *    lado del SLA cuánto tiempo se excluyó y por qué.
 *
 * Las altas, bajas y pausas van por socket (ver `kuma.ts`): es lo que hace que
 * Kuma programe el trabajo en el momento y no al próximo reinicio.
 */
import { getKumaDb, isKumaDbConfigured } from "./kuma-db";

/** Uruguay. Kuma guarda la ventana en hora de pared de esta zona, no en UTC. */
export const ZONA = process.env.MANT_TZ || "America/Montevideo";

export type EstadoVentana = "activa" | "programada" | "terminada" | "pausada";

/** Las estrategias de Kuma que exponemos. Las demás se leen pero no se editan. */
export type Estrategia = "manual" | "single" | "recurring-weekday";

export interface Ventana {
  id: number;
  titulo: string;
  descripcion: string;
  estrategia: string;
  activa: boolean;
  /** "YYYY-MM-DD HH:mm:ss" en hora de `zona`, o null. */
  inicio: string | null;
  fin: string | null;
  /** "HH:mm:ss" para las recurrentes. */
  horaInicio: string | null;
  horaFin: string | null;
  diasSemana: number[];
  cron: string | null;
  zona: string;
  monitores: number[];
  estado: EstadoVentana;
}

/** "2026-09-12 18:27:16" — hora de pared en la zona pedida. */
export function ahoraEn(zona: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: zona,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date()).replace("T", " ");
}

/** 0 = domingo, como los weekdays de Kuma. */
function diaDeSemanaEn(zona: string): number {
  const corto = new Intl.DateTimeFormat("en-US", { timeZone: zona, weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(corto);
}

function listaNumeros(crudo: unknown): number[] {
  if (!crudo) return [];
  try {
    const v = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
    return Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : [];
  } catch { return []; }
}

/**
 * El mismo criterio que usa Kuma en `Maintenance.getStatus()`, reescrito acá
 * para las estrategias que ofrecemos. Lo importante es que "activa" signifique
 * exactamente lo mismo de los dos lados: si no, la página diría una cosa y los
 * monitores harían otra.
 */
function calcularEstado(v: Omit<Ventana, "estado">): EstadoVentana {
  if (!v.activa) return "pausada";
  const ahora = ahoraEn(v.zona);
  if (v.inicio && ahora < v.inicio) return "programada";
  if (v.fin && ahora > v.fin) return "terminada";
  if (v.estrategia === "manual" || v.estrategia === "single") return "activa";

  if (v.estrategia.startsWith("recurring-")) {
    if (!v.horaInicio || !v.horaFin) return "programada";
    if (v.estrategia === "recurring-weekday" && v.diasSemana.length > 0) {
      if (!v.diasSemana.includes(diaDeSemanaEn(v.zona))) return "programada";
    }
    const hora = ahora.slice(11);
    const dentro = v.horaInicio <= v.horaFin
      ? hora >= v.horaInicio && hora <= v.horaFin
      : hora >= v.horaInicio || hora <= v.horaFin;   // ventana que cruza medianoche
    return dentro ? "activa" : "programada";
  }
  return "programada";
}

/** Todas las ventanas, con sus monitores. Lista corta: no hace falta cachear. */
export async function listarVentanas(): Promise<Ventana[]> {
  if (!isKumaDbConfigured()) return [];
  const pool = getKumaDb();

  const [filas] = await pool.query(
    `SELECT id, title, description, strategy, active,
            DATE_FORMAT(start_date, '%Y-%m-%d %H:%i:%s') AS inicio,
            DATE_FORMAT(end_date,   '%Y-%m-%d %H:%i:%s') AS fin,
            TIME_FORMAT(start_time, '%H:%i:%s') AS h_ini,
            TIME_FORMAT(end_time,   '%H:%i:%s') AS h_fin,
            weekdays, cron, timezone
       FROM maintenance
      ORDER BY id DESC`
  ) as any;

  const [vinculos] = await pool.query(
    "SELECT maintenance_id, monitor_id FROM monitor_maintenance"
  ) as any;

  const porVentana = new Map<number, number[]>();
  for (const v of vinculos as any[]) {
    const lista = porVentana.get(Number(v.maintenance_id)) || [];
    lista.push(Number(v.monitor_id));
    porVentana.set(Number(v.maintenance_id), lista);
  }

  return (filas as any[]).map((f) => {
    const zona = f.timezone && f.timezone !== "SAME_AS_SERVER" ? String(f.timezone) : ZONA;
    const base = {
      id: Number(f.id),
      titulo: String(f.title || ""),
      descripcion: String(f.description || ""),
      estrategia: String(f.strategy || "single"),
      activa: !!f.active,
      inicio: f.inicio || null,
      fin: f.fin || null,
      horaInicio: f.h_ini || null,
      horaFin: f.h_fin || null,
      diasSemana: listaNumeros(f.weekdays),
      cron: f.cron || null,
      zona,
      monitores: porVentana.get(Number(f.id)) || [],
    };
    return { ...base, estado: calcularEstado(base) };
  });
}

/** Los monitores que están bajo una ventana corriendo en este momento. */
export function monitoresEnMantenimiento(ventanas: Ventana[]): Set<number> {
  const s = new Set<number>();
  for (const v of ventanas) if (v.estado === "activa") for (const id of v.monitores) s.add(id);
  return s;
}

/**
 * Latidos que quedaron marcados como mantenimiento por monitor en las últimas
 * `horas`. Kuma los guarda en `extras` de `stat_hourly` como {"maintenance": n}.
 * Multiplicados por el intervalo del monitor dan el tiempo excluido del SLA.
 */
export async function latidosEnMantenimiento(
  ids: number[],
  horas: number
): Promise<Map<number, number>> {
  const salida = new Map<number, number>();
  const reales = ids.filter((id) => id < 900000);
  if (!isKumaDbConfigured() || reales.length === 0) return salida;
  const desde = Math.floor(Date.now() / 1000) - horas * 3600;
  try {
    const pool = getKumaDb();
    const [filas] = await pool.query(
      `SELECT monitor_id AS id,
              SUM(COALESCE(JSON_EXTRACT(extras, '$.maintenance'), 0)) AS n
         FROM stat_hourly
        WHERE timestamp >= ? AND monitor_id IN (${reales.map(() => "?").join(",")})
        GROUP BY monitor_id`,
      [desde, ...reales]
    ) as any;
    for (const f of filas as any[]) {
      const n = Number(f.n) || 0;
      if (n > 0) salida.set(Number(f.id), n);
    }
  } catch {
    /* Una base sin JSON_EXTRACT no debe tumbar el SLA: se muestra sin la columna. */
  }
  return salida;
}

/** Arma el payload que espera `addMaintenance` de Kuma desde el formulario. */
export interface AltaVentana {
  titulo: string;
  descripcion?: string;
  tipo: Estrategia;
  /** "YYYY-MM-DDTHH:mm" o "YYYY-MM-DD HH:mm" en hora local. */
  inicio?: string | null;
  fin?: string | null;
  horaInicio?: string | null;   // "HH:mm"
  horaFin?: string | null;      // "HH:mm"
  diasSemana?: number[];
}

function aFechaKuma(v?: string | null): string | null {
  if (!v) return null;
  const s = v.replace("T", " ").trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return null;
  return s.length === 16 ? `${s}:00` : s.slice(0, 19);
}

function aHoraObjeto(v?: string | null): { hours: number; minutes: number } | null {
  if (!v) return null;
  const [h, m] = v.split(":");
  const hours = parseInt(h, 10), minutes = parseInt(m || "0", 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

export function payloadKuma(a: AltaVentana): Record<string, unknown> {
  const inicio = aFechaKuma(a.inicio);
  const fin = aFechaKuma(a.fin);

  const base: Record<string, unknown> = {
    title: (a.titulo || "").trim().slice(0, 150) || "Mantenimiento",
    description: (a.descripcion || "").trim(),
    strategy: a.tipo,
    active: true,
    intervalDay: 1,
    // Explícita a propósito: el contenedor corre en UTC, así que SAME_AS_SERVER
    // correría las ventanas tres horas antes de lo que dice la pantalla.
    timezoneOption: ZONA,
    dateRange: [inicio, fin],
    timeRange: [{ hours: 0, minutes: 0 }, { hours: 0, minutes: 0 }],
    weekdays: [],
    daysOfMonth: [],
    cron: "",
    durationMinutes: 60,
  };

  if (a.tipo === "manual") {
    // Sin fechas: corre hasta que alguien la cierre. Es el "estoy trabajando acá ahora".
    base.dateRange = [null, null];
  }

  if (a.tipo === "recurring-weekday") {
    base.timeRange = [
      aHoraObjeto(a.horaInicio) || { hours: 2, minutes: 0 },
      aHoraObjeto(a.horaFin) || { hours: 4, minutes: 0 },
    ];
    base.weekdays = (a.diasSemana || []).filter((d) => d >= 0 && d <= 6);
    // La recurrente necesita una fecha de arranque; si no vino, desde hoy.
    base.dateRange = [inicio || `${ahoraEn(ZONA).slice(0, 10)} 00:00:00`, fin];
  }

  return base;
}

/** Valida lo que el formulario no puede garantizar solo. */
export function revisarAlta(a: AltaVentana): string | null {
  if (!a.titulo || !a.titulo.trim()) return "Falta el título";
  if (!["manual", "single", "recurring-weekday"].includes(a.tipo)) return "Tipo de ventana desconocido";
  if (a.tipo === "single") {
    const i = aFechaKuma(a.inicio), f = aFechaKuma(a.fin);
    if (!i || !f) return "Una ventana programada necesita inicio y fin";
    if (f <= i) return "El fin tiene que ser posterior al inicio";
  }
  if (a.tipo === "recurring-weekday") {
    if (!a.horaInicio || !a.horaFin) return "Falta la franja horaria";
    if (!a.diasSemana || a.diasSemana.length === 0) return "Elegí al menos un día de la semana";
  }
  return null;
}
