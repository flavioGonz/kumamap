/**
 * Trafico en vivo de un enlace, calculado a partir del historial de Uptime Kuma.
 *
 * Por que del lado del servidor y no en el navegador, que es como estaba:
 *
 *  - El bps se calculaba dividiendo el delta del contador por el intervalo NOMINAL
 *    del monitor. Si un latido se pierde, o Kuma se atrasa, el intervalo real no es
 *    ese y el numero sale mal. Aca se usa el tiempo real entre lectura y lectura.
 *  - Un enlace tiene dos sentidos. El mapa mostraba uno solo. Aca se busca el monitor
 *    hermano (misma IP, misma interfaz, el OID del sentido contrario) y se devuelven
 *    los dos, sin tener que tocar como esta guardado el enlace.
 *  - La velocidad del puerto y el nombre real de la interfaz se le preguntan al equipo
 *    por SNMP una vez cada diez minutos, asi el grafico puede decir "12 Mbps de 100"
 *    en vez de un numero suelto sin escala.
 */
import { getKumaDb } from "@/lib/kuma-db";
import { leer, type Version } from "@/lib/snmp-walk";

/** Contadores de octetos de IF-MIB, por sentido y por tamano. */
const OID_IN_32 = "1.3.6.1.2.1.2.2.1.10.";
const OID_OUT_32 = "1.3.6.1.2.1.2.2.1.16.";
const OID_IN_64 = "1.3.6.1.2.1.31.1.1.1.6.";
const OID_OUT_64 = "1.3.6.1.2.1.31.1.1.1.10.";

const OID_IF_NAME = "1.3.6.1.2.1.31.1.1.1.1.";
const OID_IF_ALIAS = "1.3.6.1.2.1.31.1.1.1.18.";
const OID_IF_HIGH_SPEED = "1.3.6.1.2.1.31.1.1.1.15.";
const OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5.";
const OID_IF_OPER = "1.3.6.1.2.1.2.2.1.8.";

const WRAP_32 = 4294967296;
const WRAP_64 = 18446744073709551616;

export interface Punto { t: number; bps: number }
export interface Serie {
  monitorId: number;
  nombre: string;
  sentido: "entrada" | "salida";
  puntos: Punto[];
  actual: number | null;
  pico: number;
  promedio: number;
  ultimaLectura: number | null;
}
export interface Trafico {
  interfaz: { indice: string; nombre?: string; alias?: string; arriba?: boolean } | null;
  capacidadBps: number | null;
  entrada: Serie | null;
  salida: Serie | null;
  /** Explica por que no hay datos, cuando no los hay. */
  aviso?: string;
}

interface FilaMonitor {
  id: number; name: string; hostname: string; port: number;
  snmp_oid: string; snmp_version: string; radius_password: string; interval: number;
}

/** De un OID de octetos saca el sentido y el indice de interfaz. */
function leerOid(oid: string): { sentido: "entrada" | "salida"; indice: string; bits: 32 | 64 } | null {
  const t = String(oid || "");
  for (const [pre, sentido, bits] of [
    [OID_IN_32, "entrada", 32], [OID_OUT_32, "salida", 32],
    [OID_IN_64, "entrada", 64], [OID_OUT_64, "salida", 64],
  ] as const) {
    if (t.startsWith(pre)) {
      const indice = t.slice(pre.length);
      if (/^\d+$/.test(indice)) return { sentido, indice, bits };
    }
  }
  return null;
}

function oidHermano(oid: string): string | null {
  const d = leerOid(oid);
  if (!d) return null;
  if (d.bits === 32) return (d.sentido === "entrada" ? OID_OUT_32 : OID_IN_32) + d.indice;
  return (d.sentido === "entrada" ? OID_OUT_64 : OID_IN_64) + d.indice;
}

/** El valor del contador viaja dentro del mensaje que escribe Kuma. */
function contadorDeMensaje(msg: string): number | null {
  const m = /comparing\s+(\d+)/.exec(String(msg || ""));
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

async function filaMonitor(id: number): Promise<FilaMonitor | null> {
  const db = getKumaDb();
  const [rows] = await db.query(
    `SELECT id, name, hostname, port, snmp_oid, snmp_version, radius_password, \`interval\`
     FROM monitor WHERE id = ? AND type = 'snmp' LIMIT 1`, [id]
  ) as any[];
  return (rows as FilaMonitor[])[0] || null;
}

async function hermano(m: FilaMonitor): Promise<FilaMonitor | null> {
  const oid = oidHermano(m.snmp_oid);
  if (!oid) return null;
  const db = getKumaDb();
  const [rows] = await db.query(
    `SELECT id, name, hostname, port, snmp_oid, snmp_version, radius_password, \`interval\`
     FROM monitor WHERE type='snmp' AND hostname = ? AND snmp_oid = ? AND active = 1 LIMIT 1`,
    [m.hostname, oid]
  ) as any[];
  return (rows as FilaMonitor[])[0] || null;
}

/**
 * Convierte el historial de un monitor en una serie de bits por segundo.
 * El contador es acumulado: lo que interesa es cuanto subio entre dos lecturas,
 * dividido por el tiempo real que paso entre ellas.
 */
async function serieDe(m: FilaMonitor, minutos: number, bits: 32 | 64): Promise<Serie> {
  const db = getKumaDb();
  const [rows] = await db.query(
    `SELECT time, msg FROM heartbeat
     WHERE monitor_id = ? AND time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
     ORDER BY time ASC`, [m.id, Math.min(minutos, 1440)]
  ) as any[];

  const lecturas: Array<{ t: number; v: number }> = [];
  for (const r of rows as { time: Date | string; msg: string }[]) {
    const v = contadorDeMensaje(r.msg);
    if (v === null) continue;
    const t = r.time instanceof Date ? r.time.getTime() : Date.parse(String(r.time).replace(" ", "T") + "Z");
    if (Number.isFinite(t)) lecturas.push({ t, v });
  }

  const wrap = bits === 64 ? WRAP_64 : WRAP_32;
  const nominal = (m.interval || 60) * 1000;
  const puntos: Punto[] = [];
  for (let i = 1; i < lecturas.length; i++) {
    const dt = (lecturas[i].t - lecturas[i - 1].t) / 1000;
    // Un hueco grande (el monitor estuvo caido, o pausado) no es un promedio valido:
    // repartir el delta sobre media hora dibujaria una meseta que nunca existio.
    if (dt <= 0 || dt > (nominal / 1000) * 3) continue;
    let delta = lecturas[i].v - lecturas[i - 1].v;
    if (delta < 0) delta += wrap;                 // el contador dio la vuelta
    if (delta > wrap / 2) continue;               // salto imposible: reinicio del equipo
    const bps = (delta * 8) / dt;
    if (bps < 0 || bps > 400e9) continue;
    puntos.push({ t: lecturas[i].t, bps });
  }

  const valores = puntos.map((p) => p.bps);
  return {
    monitorId: m.id,
    nombre: m.name,
    sentido: leerOid(m.snmp_oid)?.sentido || "entrada",
    puntos,
    actual: valores.length ? valores[valores.length - 1] : null,
    pico: valores.length ? Math.max(...valores) : 0,
    promedio: valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0,
    ultimaLectura: lecturas.length ? lecturas[lecturas.length - 1].t : null,
  };
}

/* Datos de la interfaz: se le preguntan al equipo, pero no en cada refresco. */
const cacheIfaz = new Map<string, { at: number; datos: Trafico["interfaz"]; capacidad: number | null }>();
const TTL_IFAZ = 10 * 60 * 1000;

async function datosInterfaz(m: FilaMonitor, indice: string) {
  const clave = `${m.hostname}#${indice}`;
  const c = cacheIfaz.get(clave);
  if (c && Date.now() - c.at < TTL_IFAZ) return c;

  let datos: Trafico["interfaz"] = { indice };
  let capacidad: number | null = null;
  try {
    const ver: Version = m.snmp_version === "1" ? "1" : "2c";
    const r = await leer(m.hostname, m.radius_password || "public", ver, [
      OID_IF_NAME + indice, OID_IF_ALIAS + indice,
      OID_IF_HIGH_SPEED + indice, OID_IF_SPEED + indice, OID_IF_OPER + indice,
    ], m.port || 161);
    const alta = Number(r[OID_IF_HIGH_SPEED + indice]);
    const baja = Number(r[OID_IF_SPEED + indice]);
    capacidad = alta > 0 ? alta * 1e6 : (baja > 0 ? baja : null);
    datos = {
      indice,
      nombre: r[OID_IF_NAME + indice] || undefined,
      alias: r[OID_IF_ALIAS + indice] || undefined,
      arriba: r[OID_IF_OPER + indice] === "1",
    };
  } catch {
    /* si el equipo no contesta, el grafico igual se dibuja sin escala */
  }
  const entrada = { at: Date.now(), datos, capacidad };
  cacheIfaz.set(clave, entrada);
  return entrada;
}

export async function traficoDeEnlace(monitorId: number, minutos = 60): Promise<Trafico> {
  const m = await filaMonitor(monitorId);
  if (!m) return { interfaz: null, capacidadBps: null, entrada: null, salida: null, aviso: "El monitor no existe o no es de tipo SNMP." };

  const d = leerOid(m.snmp_oid);
  if (!d) {
    // Es un monitor SNMP, pero no de un contador de octetos: no hay trafico que graficar.
    return { interfaz: null, capacidadBps: null, entrada: null, salida: null,
             aviso: "Ese sensor no lee un contador de tráfico de interfaz." };
  }

  const h = await hermano(m);
  const [s1, s2, ifaz] = await Promise.all([
    serieDe(m, minutos, d.bits),
    h ? serieDe(h, minutos, leerOid(h.snmp_oid)?.bits || d.bits) : Promise.resolve(null),
    datosInterfaz(m, d.indice),
  ]);

  const entrada = s1.sentido === "entrada" ? s1 : (s2 && s2.sentido === "entrada" ? s2 : null);
  const salida = s1.sentido === "salida" ? s1 : (s2 && s2.sentido === "salida" ? s2 : null);

  let aviso: string | undefined;
  if (!entrada?.puntos.length && !salida?.puntos.length) {
    aviso = "Todavía no hay dos lecturas seguidas para calcular una velocidad.";
  } else if ((entrada?.pico || 0) === 0 && (salida?.pico || 0) === 0) {
    aviso = "El contador no se movió: esa interfaz no está pasando tráfico.";
  } else if (!salida) {
    aviso = "Solo se está midiendo un sentido. Creá el sensor del sentido contrario para ver los dos.";
  }

  return { interfaz: ifaz.datos, capacidadBps: ifaz.capacidad, entrada, salida, aviso };
}
