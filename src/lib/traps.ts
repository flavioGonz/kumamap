/**
 * Receptor de traps SNMP.
 *
 * Un trap es el equipo avisando por su cuenta: no hay que preguntarle nada, él
 * manda el aviso cuando le pasa algo. Es lo único que llega en el momento exacto
 * del evento — un sondeo cada 30 s se pierde un corte de 10 segundos.
 *
 * Escucha en 162/udp (configurable con TRAP_PORT), guarda en SQLite y avisa por
 * socket. La decodificación es en castellano: un trap crudo es una lista de OIDs
 * y nadie lee eso a las tres de la mañana.
 */
import Database from "better-sqlite3";
import path from "path";
import snmp from "net-snmp";

export interface Varbind { oid: string; tipo: string; valor: string }

export interface Trap {
  id: number;
  ts: number;
  origen: string;
  version: string;
  comunidad: string;
  tipo: string;
  oid: string;
  nombre: string;
  gravedad: "alarma" | "aviso" | "info";
  resumen: string;
  varbinds: Varbind[];
}

/* ─────────────────────────────────────────────── base ── */

let db: any = null;
const TOPE = 5000;

function conn(): any {
  if (db) return db;
  db = new Database(path.join(process.cwd(), "data", "kumamap.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS traps (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        INTEGER NOT NULL,
      origen    TEXT NOT NULL,
      version   TEXT NOT NULL DEFAULT '',
      comunidad TEXT NOT NULL DEFAULT '',
      tipo      TEXT NOT NULL DEFAULT 'trap',
      oid       TEXT NOT NULL DEFAULT '',
      nombre    TEXT NOT NULL DEFAULT '',
      gravedad  TEXT NOT NULL DEFAULT 'info',
      resumen   TEXT NOT NULL DEFAULT '',
      varbinds  TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS traps_ts ON traps(ts DESC);
    CREATE INDEX IF NOT EXISTS traps_origen ON traps(origen);
    CREATE TABLE IF NOT EXISTS traps_meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);
  return db;
}

/* ───────────────────────────────────────── diccionario ── */

/** Traps de la MIB-II: los que manda cualquier equipo, sea de quien sea. */
const ESTANDAR: Record<string, { n: string; g: Trap["gravedad"]; q: string }> = {
  "1.3.6.1.6.3.1.1.5.1": { n: "Arranque en frío", g: "aviso", q: "El equipo se reinicializó por completo — se apagó y volvió, o le hicieron un reset." },
  "1.3.6.1.6.3.1.1.5.2": { n: "Arranque en caliente", g: "aviso", q: "El equipo reinició su software sin cortar la alimentación." },
  "1.3.6.1.6.3.1.1.5.3": { n: "Enlace caído", g: "alarma", q: "Una interfaz pasó a estado inactivo: se desconectó el cable, se apagó el otro extremo o cayó el puerto." },
  "1.3.6.1.6.3.1.1.5.4": { n: "Enlace levantado", g: "info", q: "Una interfaz volvió a estado activo." },
  "1.3.6.1.6.3.1.1.5.5": { n: "Fallo de autenticación", g: "alarma", q: "Alguien consultó al equipo por SNMP con una comunidad o credencial que no corresponde. Un par sueltos es una herramienta mal configurada; muchos, un barrido." },
  "1.3.6.1.6.3.1.1.5.6": { n: "Pérdida de vecino EGP", g: "aviso", q: "Se perdió una adyacencia de ruteo EGP. En redes actuales casi no se ve." },
};

/** Traps de UPS de APC (PowerNet, empresa 318): los que importan acá. */
const APC: Record<string, { n: string; g: Trap["gravedad"]; q: string }> = {
  "1.3.6.1.4.1.318.0.1":  { n: "UPS: pasó a batería", g: "alarma", q: "Se cortó la alimentación de red y la UPS está sosteniendo la carga." },
  "1.3.6.1.4.1.318.0.2":  { n: "UPS: volvió la red", g: "info", q: "La alimentación se normalizó y la UPS dejó de consumir batería." },
  "1.3.6.1.4.1.318.0.3":  { n: "UPS: batería baja", g: "alarma", q: "Queda poca autonomía. A partir de acá el apagado ordenado es cuestión de minutos." },
  "1.3.6.1.4.1.318.0.4":  { n: "UPS: batería recuperada", g: "info", q: "La batería salió del estado bajo." },
  "1.3.6.1.4.1.318.0.5":  { n: "UPS: sobrecarga", g: "alarma", q: "La carga conectada supera lo que la UPS puede entregar." },
  "1.3.6.1.4.1.318.0.6":  { n: "UPS: sobrecarga resuelta", g: "info", q: "La carga volvió a estar dentro de lo admitido." },
  "1.3.6.1.4.1.318.0.7":  { n: "UPS: reemplazar batería", g: "alarma", q: "La autoprueba dio que la batería ya no sostiene la carga. Hay que cambiarla." },
  "1.3.6.1.4.1.318.0.9":  { n: "UPS: comunicación perdida", g: "alarma", q: "La tarjeta de red dejó de hablar con la UPS." },
  "1.3.6.1.4.1.318.0.11": { n: "UPS: apagado inminente", g: "alarma", q: "La UPS va a cortar la salida. Lo que esté conectado se apaga." },
  "1.3.6.1.4.1.318.0.12": { n: "UPS: autoprueba fallida", g: "alarma", q: "La prueba periódica de batería no pasó." },
  "1.3.6.1.4.1.318.0.19": { n: "UPS: temperatura alta", g: "alarma", q: "La UPS o su batería están por encima del umbral de temperatura." },
};

/** Traps genéricos de SNMPv1, que no viajan como OID sino como número. */
const GENERICO_V1 = [
  "1.3.6.1.6.3.1.1.5.1", "1.3.6.1.6.3.1.1.5.2", "1.3.6.1.6.3.1.1.5.3",
  "1.3.6.1.6.3.1.1.5.4", "1.3.6.1.6.3.1.1.5.5", "1.3.6.1.6.3.1.1.5.6",
];

export function explicar(oid: string): { n: string; g: Trap["gravedad"]; q: string } | null {
  return ESTANDAR[oid] || APC[oid] || null;
}

/* ──────────────────────────────────────────── lectura ── */

function aTrap(f: any): Trap {
  let vb: Varbind[] = [];
  try { vb = JSON.parse(f.varbinds); } catch { vb = []; }
  return { ...f, varbinds: vb };
}

export function listarTraps(opciones: {
  limite?: number; desde?: number; origen?: string; gravedad?: string; texto?: string;
} = {}): Trap[] {
  const limite = Math.min(Math.max(opciones.limite || 300, 1), 2000);
  const cond: string[] = [];
  const args: any[] = [];
  if (opciones.desde) { cond.push("ts >= ?"); args.push(opciones.desde); }
  if (opciones.origen) { cond.push("origen = ?"); args.push(opciones.origen); }
  if (opciones.gravedad) { cond.push("gravedad = ?"); args.push(opciones.gravedad); }
  if (opciones.texto) {
    cond.push("(nombre LIKE ? OR resumen LIKE ? OR oid LIKE ? OR origen LIKE ? OR varbinds LIKE ?)");
    const t = `%${opciones.texto}%`;
    args.push(t, t, t, t, t);
  }
  const donde = cond.length ? "WHERE " + cond.join(" AND ") : "";
  args.push(limite);
  return conn().prepare(`SELECT * FROM traps ${donde} ORDER BY ts DESC, id DESC LIMIT ?`).all(...args).map(aTrap);
}

export function resumenTraps(): { total: number; alarmas24h: number; origenes: Array<{ origen: string; n: number; ultimo: number }> } {
  const c = conn();
  const t: any = c.prepare("SELECT COUNT(*) n FROM traps").get();
  const a: any = c.prepare("SELECT COUNT(*) n FROM traps WHERE gravedad = 'alarma' AND ts >= ?").get(Date.now() - 86400000);
  const o: any[] = c.prepare("SELECT origen, COUNT(*) n, MAX(ts) ultimo FROM traps GROUP BY origen ORDER BY n DESC LIMIT 40").all();
  return { total: t?.n || 0, alarmas24h: a?.n || 0, origenes: o.map((x) => ({ origen: x.origen, n: x.n, ultimo: x.ultimo })) };
}

export function borrarTraps(antesDe?: number): number {
  const c = conn();
  const r = antesDe
    ? c.prepare("DELETE FROM traps WHERE ts < ?").run(antesDe)
    : c.prepare("DELETE FROM traps").run();
  return r.changes || 0;
}

/* ──────────────────────────────────────────── ingreso ── */

let desdeElUltimoPodado = 0;

export function guardarTrap(t: Omit<Trap, "id">): Trap {
  const c = conn();
  const r = c.prepare(
    "INSERT INTO traps (ts, origen, version, comunidad, tipo, oid, nombre, gravedad, resumen, varbinds) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(t.ts, t.origen, t.version, t.comunidad, t.tipo, t.oid, t.nombre, t.gravedad, t.resumen, JSON.stringify(t.varbinds));

  // Podado cada tanto: un equipo con un puerto que aletea manda miles por hora.
  if (++desdeElUltimoPodado >= 100) {
    desdeElUltimoPodado = 0;
    c.prepare("DELETE FROM traps WHERE id NOT IN (SELECT id FROM traps ORDER BY ts DESC, id DESC LIMIT ?)").run(TOPE);
  }
  return { ...t, id: Number(r.lastInsertRowid) } as Trap;
}

/* ──────────────────────────────────────────── receptor ── */

const OID_SYSUPTIME = "1.3.6.1.2.1.1.3.0";
const OID_TRAPOID = "1.3.6.1.6.3.1.1.4.1.0";
const OID_IFINDEX = "1.3.6.1.2.1.2.2.1.1";
const OID_IFDESCR = "1.3.6.1.2.1.2.2.1.2";

function valorLegible(vb: any): string {
  const v = vb?.value;
  if (v == null) return "";
  if (Buffer.isBuffer(v)) {
    const txt = v.toString("utf8");
    // Un OCTET STRING puede ser texto o bytes; si es imprimible, se muestra como texto.
    return /^[\x20-\x7e\s]*$/.test(txt) ? txt : v.toString("hex");
  }
  return String(v);
}

function nombreDeTipo(t: any): string {
  try {
    const nombres: Record<number, string> = (snmp as any).ObjectType || {};
    for (const k of Object.keys(nombres)) {
      if ((nombres as any)[k] === t) return k;
    }
  } catch { /* da igual */ }
  return String(t);
}

let receptor: any = null;

/**
 * El receptor vive en el proceso del servidor, no en los chunks de las rutas de
 * Next: cada uno tiene su propia instancia de este módulo. Por eso el estado se
 * anota en la base, que es lo único que comparten.
 */
function anotarEstado(puerto: number, ok: boolean, detalle: string): void {
  try {
    conn().prepare("INSERT INTO traps_meta (clave, valor) VALUES ('receptor', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor")
      .run(JSON.stringify({ puerto, ok, detalle, desde: Date.now() }));
  } catch { /* si falla, el panel muestra "desconocido" */ }
}

export function estadoReceptor(): { puerto: number; ok: boolean; detalle: string; desde: number } | null {
  try {
    const f: any = conn().prepare("SELECT valor FROM traps_meta WHERE clave = 'receptor'").get();
    return f ? JSON.parse(f.valor) : null;
  } catch { return null; }
}

export function receptorActivo(): boolean {
  return !!receptor;
}

/**
 * Levanta el receptor. `alLlegar` se usa para avisar por socket; si el puerto
 * está tomado o no hay permiso, no se cae la aplicación: se registra y sigue.
 */
export function iniciarReceptorDeTraps(alLlegar?: (t: Trap) => void): void {
  if (receptor) return;
  const puerto = parseInt(process.env.TRAP_PORT || "162", 10);
  const comunidades = (process.env.TRAP_COMMUNITIES || "public")
    .split(",").map((x) => x.trim()).filter(Boolean);

  try {
    receptor = snmp.createReceiver(
      { port: puerto, disableAuthorization: true, includeAuthentication: true, transport: "udp4" },
      (error: any, notificacion: any) => {
        if (error) { console.error("[Traps] error recibiendo:", error?.message || error); return; }
        try {
          const t = interpretar(notificacion);
          const guardado = guardarTrap(t);
          alLlegar?.(guardado);
        } catch (e: any) {
          console.error("[Traps] no pude interpretar la notificación:", e?.message || e);
        }
      }
    );
    try {
      const aut = receptor.getAuthorizer?.();
      for (const c of comunidades) aut?.addCommunity?.(c);
    } catch { /* con disableAuthorization alcanza */ }
    anotarEstado(puerto, true, `comunidades: ${comunidades.join(", ")}`);
    console.log(`[Traps] escuchando en ${puerto}/udp (comunidades: ${comunidades.join(", ")})`);
  } catch (e: any) {
    receptor = null;
    anotarEstado(puerto, false, String(e?.message || e));
    console.error(`[Traps] no pude escuchar en ${puerto}/udp: ${e?.message || e}. ` +
      `Por debajo de 1024 hace falta root, o se puede usar otro puerto con TRAP_PORT.`);
  }
}

/** Convierte lo que entrega net-snmp en algo que se pueda leer y guardar. */
export function interpretar(n: any): Omit<Trap, "id"> {
  const pdu = n?.pdu || {};
  const origen = n?.rinfo?.address || "desconocido";
  const comunidad = n?.community || pdu?.community || "";
  const esV1 = pdu.type === (snmp as any).PduType?.Trap;
  const esInform = pdu.type === (snmp as any).PduType?.InformRequest;

  const crudas: any[] = pdu.varbinds || [];
  const varbinds: Varbind[] = crudas.map((vb) => ({
    oid: String(vb.oid || ""), tipo: nombreDeTipo(vb.type), valor: valorLegible(vb),
  }));

  let oid = "";
  let version = esV1 ? "v1" : "v2c";
  if (esV1) {
    const gen = Number(pdu.generic ?? pdu["generic-trap"] ?? -1);
    if (gen >= 0 && gen <= 5) oid = GENERICO_V1[gen];
    else if (gen === 6) oid = `${pdu.enterprise || ""}.0.${pdu.specificTrap ?? pdu.specific ?? 0}`;
  } else {
    const vb = crudas.find((v) => String(v.oid) === OID_TRAPOID);
    oid = vb ? String(valorLegible(vb)) : "";
    if (n?.pdu?.version === 3 || n?.version === 3) version = "v3";
  }

  const conocido = explicar(oid);
  let nombre = conocido?.n || (oid ? `Trap ${oid}` : "Trap sin identificar");
  const gravedad: Trap["gravedad"] = conocido?.g || "info";

  // Para enlace caído/levantado el dato útil es cuál interfaz.
  let resumen = conocido?.q || "";
  const idx = crudas.find((v) => String(v.oid).startsWith(OID_IFINDEX));
  const des = crudas.find((v) => String(v.oid).startsWith(OID_IFDESCR));
  if (idx || des) {
    const quien = des ? valorLegible(des) : `interfaz ${valorLegible(idx)}`;
    nombre = `${nombre} · ${quien}`;
  }
  if (!resumen) {
    const utiles = varbinds.filter((v) => v.oid !== OID_SYSUPTIME && v.oid !== OID_TRAPOID).slice(0, 3);
    resumen = utiles.length
      ? utiles.map((v) => `${v.oid} = ${v.valor}`).join(" · ")
      : "El equipo mandó un aviso sin datos adicionales.";
  }

  return {
    ts: Date.now(), origen, version, comunidad: String(comunidad || ""),
    tipo: esInform ? "inform" : "trap",
    oid, nombre, gravedad, resumen: resumen.slice(0, 500), varbinds: varbinds.slice(0, 30),
  };
}
