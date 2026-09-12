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
import { buscarPorIp, refrescarSiHaceFalta } from "./mapa-ips";

export interface Varbind { oid: string; tipo: string; valor: string }

export interface Trap {
  id: number;
  ts: number;
  origen: string;
  /** De qué equipo del mapa vino, cuando la IP se pudo ubicar. */
  nodoId: string | null;
  mapaId: string | null;
  etiqueta: string | null;
  mapa: string | null;
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

  // Columnas agregadas después: el trap ahora sabe de qué equipo del mapa vino.
  const cols = new Set((db.prepare("PRAGMA table_info(traps)").all() as any[]).map((c: any) => c.name));
  for (const col of ["nodo_id", "mapa_id", "etiqueta", "mapa"]) {
    if (!cols.has(col)) db.exec(`ALTER TABLE traps ADD COLUMN ${col} TEXT`);
  }
  db.exec("CREATE INDEX IF NOT EXISTS traps_mapa ON traps(mapa_id)");
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
  return {
    id: f.id, ts: f.ts, origen: f.origen, version: f.version, comunidad: f.comunidad,
    tipo: f.tipo, oid: f.oid, nombre: f.nombre, gravedad: f.gravedad, resumen: f.resumen,
    nodoId: f.nodo_id ?? null, mapaId: f.mapa_id ?? null,
    etiqueta: f.etiqueta ?? null, mapa: f.mapa ?? null,
    varbinds: vb,
  };
}

export function listarTraps(opciones: {
  limite?: number; desde?: number; origen?: string; gravedad?: string; texto?: string; mapaId?: string;
} = {}): Trap[] {
  const limite = Math.min(Math.max(opciones.limite || 300, 1), 2000);
  const cond: string[] = [];
  const args: any[] = [];
  if (opciones.desde) { cond.push("ts >= ?"); args.push(opciones.desde); }
  if (opciones.origen) { cond.push("origen = ?"); args.push(opciones.origen); }
  if (opciones.gravedad) { cond.push("gravedad = ?"); args.push(opciones.gravedad); }
  if (opciones.mapaId) { cond.push("mapa_id = ?"); args.push(opciones.mapaId); }
  if (opciones.texto) {
    cond.push("(nombre LIKE ? OR resumen LIKE ? OR oid LIKE ? OR origen LIKE ? OR varbinds LIKE ? " +
              "OR etiqueta LIKE ? OR mapa LIKE ?)");
    const t = `%${opciones.texto}%`;
    args.push(t, t, t, t, t, t, t);
  }
  const donde = cond.length ? "WHERE " + cond.join(" AND ") : "";
  args.push(limite);
  return conn().prepare(`SELECT * FROM traps ${donde} ORDER BY ts DESC, id DESC LIMIT ?`).all(...args).map(aTrap);
}

export interface Origen { origen: string; etiqueta: string | null; mapa: string | null; mapaId: string | null; n: number; ultimo: number }

export function resumenTraps(): {
  total: number; alarmas24h: number; sinUbicar: number;
  origenes: Origen[]; mapas: Array<{ mapaId: string; mapa: string; n: number }>;
} {
  const c = conn();
  const t: any = c.prepare("SELECT COUNT(*) n FROM traps").get();
  const a: any = c.prepare("SELECT COUNT(*) n FROM traps WHERE gravedad = 'alarma' AND ts >= ?").get(Date.now() - 86400000);
  const su: any = c.prepare("SELECT COUNT(*) n FROM traps WHERE nodo_id IS NULL").get();
  const o: any[] = c.prepare(
    `SELECT origen, MAX(etiqueta) etiqueta, MAX(mapa) mapa, MAX(mapa_id) mapa_id,
            COUNT(*) n, MAX(ts) ultimo
     FROM traps GROUP BY origen ORDER BY n DESC LIMIT 40`
  ).all();
  const m: any[] = c.prepare(
    "SELECT mapa_id, MAX(mapa) mapa, COUNT(*) n FROM traps WHERE mapa_id IS NOT NULL GROUP BY mapa_id ORDER BY n DESC LIMIT 40"
  ).all();
  return {
    total: t?.n || 0, alarmas24h: a?.n || 0, sinUbicar: su?.n || 0,
    origenes: o.map((x) => ({ origen: x.origen, etiqueta: x.etiqueta ?? null, mapa: x.mapa ?? null, mapaId: x.mapa_id ?? null, n: x.n, ultimo: x.ultimo })),
    mapas: m.map((x) => ({ mapaId: x.mapa_id, mapa: x.mapa, n: x.n })),
  };
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
    `INSERT INTO traps (ts, origen, version, comunidad, tipo, oid, nombre, gravedad, resumen, varbinds,
                        nodo_id, mapa_id, etiqueta, mapa)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(t.ts, t.origen, t.version, t.comunidad, t.tipo, t.oid, t.nombre, t.gravedad, t.resumen,
        JSON.stringify(t.varbinds), t.nodoId, t.mapaId, t.etiqueta, t.mapa);

  // Podado cada tanto: un equipo con un puerto que aletea manda miles por hora.
  if (++desdeElUltimoPodado >= 100) {
    desdeElUltimoPodado = 0;
    c.prepare("DELETE FROM traps WHERE id NOT IN (SELECT id FROM traps ORDER BY ts DESC, id DESC LIMIT ?)").run(TOPE);
  }
  return { ...t, id: Number(r.lastInsertRowid) } as Trap;
}

/* ──────────────────────────────────────────── ubicación ── */

/**
 * Le pone nombre y cliente al aviso. Si la IP no está en el índice queda sin
 * ubicar, que no es un error: puede ser un equipo que todavía no está en ningún
 * mapa, o que sale por una IP distinta a la que se monitorea.
 */
export function ubicar<T extends { origen: string }>(t: T): T & {
  nodoId: string | null; mapaId: string | null; etiqueta: string | null; mapa: string | null;
} {
  const n = buscarPorIp(t.origen);
  return {
    ...t,
    nodoId: n?.nodeId ?? null,
    mapaId: n?.mapId ?? null,
    etiqueta: n?.etiqueta ?? null,
    mapa: n?.mapa ?? null,
  };
}

/**
 * Vuelve a intentar ubicar los avisos que quedaron sin equipo. Sirve cuando llega
 * un trap antes de que el índice esté armado, o cuando recién ahora se cargó la IP
 * en el nodo del mapa.
 */
export function reubicarPendientes(limite = 500): number {
  const c = conn();
  const filas: any[] = c.prepare(
    "SELECT id, origen FROM traps WHERE nodo_id IS NULL ORDER BY ts DESC LIMIT ?"
  ).all(limite);
  const act = c.prepare("UPDATE traps SET nodo_id=?, mapa_id=?, etiqueta=?, mapa=? WHERE id=?");
  let n = 0;
  const tx = c.transaction((xs: any[]) => {
    for (const f of xs) {
      const u = buscarPorIp(f.origen);
      if (!u) continue;
      act.run(u.nodeId, u.mapId, u.etiqueta, u.mapa, f.id);
      n++;
    }
  });
  tx(filas);
  return n;
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
let vigilante: ReturnType<typeof setInterval> | null = null;
let alLlegarGuardado: ((t: Trap) => void) | undefined;

/** Deja el autorizador con exactamente las comunidades configuradas. */
function sincronizarComunidades(): string[] {
  const { comunidades } = configTraps();
  try {
    const aut = receptor?.getAuthorizer?.();
    if (!aut) return comunidades;
    const tiene: string[] = aut.getCommunities?.() || [];
    for (const c of tiene) if (!comunidades.includes(c)) aut.deleteCommunity?.(c);
    for (const c of comunidades) if (!tiene.includes(c)) aut.addCommunity?.(c);
  } catch { /* si el autorizador cambia de forma, no vale tirar el receptor abajo */ }
  return comunidades;
}

/**
 * Mira si cambió la configuración. Las comunidades se aplican en caliente; abrir
 * o cerrar el receptor obliga a rehacerlo, porque eso se decide al crearlo.
 */
function revisarConfig(): void {
  try {
    const cfg = configTraps();
    const est = estadoReceptor();
    if (!est || !est.ok) return;
    if (!!est.abierto !== cfg.abierto) {
      console.log(`[Traps] cambio el modo de autorizacion, rehago el receptor`);
      cerrarReceptor();
      iniciarReceptorDeTraps(alLlegarGuardado);
      return;
    }
    const mismas =
      est.comunidades?.length === cfg.comunidades.length &&
      cfg.comunidades.every((c) => est.comunidades!.includes(c));
    if (!mismas) {
      sincronizarComunidades();
      guardarEstado({ ...est, comunidades: cfg.comunidades, detalle: detalleDe(cfg) });
      console.log(`[Traps] comunidades ahora: ${cfg.comunidades.join(", ") || "(ninguna)"}`);
    }
  } catch { /* es mantenimiento de fondo */ }
}

function detalleDe(cfg: ConfigTraps): string {
  return cfg.abierto ? "acepta cualquier comunidad" : `comunidades: ${cfg.comunidades.join(", ")}`;
}

function cerrarReceptor(): void {
  try { receptor?.close?.(); } catch { /* ya estaba cerrado */ }
  receptor = null;
}

/**
 * El receptor vive en el proceso del servidor, no en los chunks de las rutas de
 * Next: cada uno tiene su propia instancia de este módulo. Por eso el estado se
 * anota en la base, que es lo único que comparten.
 */
/* ─────────────────────────────────────── configuración ── */

export interface ConfigTraps {
  comunidades: string[];
  /** Acepta cualquier comunidad: sirve para descubrir qué manda un equipo nuevo. */
  abierto: boolean;
}

/** Una comunidad es un texto imprimible sin comas ni espacios. */
export function comunidadValida(c: string): boolean {
  return /^[\x21-\x7e]{1,64}$/.test(c) && !c.includes(",");
}

function configPorDefecto(): ConfigTraps {
  const delEntorno = (process.env.TRAP_COMMUNITIES || "public")
    .split(",").map((x) => x.trim()).filter(comunidadValida);
  return {
    comunidades: delEntorno.length ? delEntorno : ["public"],
    abierto: process.env.TRAP_ANY_COMMUNITY === "1",
  };
}

/**
 * La configuración vive en la base y no en el entorno: cambiarla no puede exigir
 * entrar al servidor por SSH y reiniciar. El entorno queda como semilla, para el
 * primer arranque.
 */
export function configTraps(): ConfigTraps {
  try {
    const f: any = conn().prepare("SELECT valor FROM traps_meta WHERE clave = 'config'").get();
    if (!f) return configPorDefecto();
    const g = JSON.parse(f.valor);
    const comunidades = Array.isArray(g?.comunidades) ? g.comunidades.filter(comunidadValida) : [];
    return {
      comunidades: comunidades.length ? comunidades : configPorDefecto().comunidades,
      abierto: !!g?.abierto,
    };
  } catch {
    return configPorDefecto();
  }
}

export function guardarConfigTraps(entrada: { comunidades?: unknown; abierto?: unknown }): ConfigTraps {
  const actual = configTraps();
  let comunidades = actual.comunidades;
  if (Array.isArray(entrada.comunidades)) {
    const limpias = [...new Set(entrada.comunidades.map((x) => String(x).trim()))].filter(Boolean);
    const mala = limpias.find((c) => !comunidadValida(c));
    if (mala) throw new Error(`«${mala}» no sirve como comunidad: sin comas, sin espacios, hasta 64 caracteres.`);
    comunidades = limpias;
  }
  const abierto = entrada.abierto === undefined ? actual.abierto : !!entrada.abierto;
  if (!comunidades.length && !abierto) {
    throw new Error("Hace falta al menos una comunidad, o marcar que acepte cualquiera.");
  }
  const nueva: ConfigTraps = { comunidades, abierto };
  conn().prepare(
    "INSERT INTO traps_meta (clave, valor) VALUES ('config', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
  ).run(JSON.stringify(nueva));
  return nueva;
}

interface EstadoReceptor {
  puerto: number; ok: boolean; detalle: string; desde: number;
  comunidades: string[]; abierto: boolean;
  /** Paquetes que llegaron y se descartaron: casi siempre, comunidad equivocada. */
  rechazados: number; ultimoRechazo: string | null; ultimoRechazoEn: number | null;
}

function guardarEstado(e: EstadoReceptor): void {
  try {
    conn().prepare("INSERT INTO traps_meta (clave, valor) VALUES ('receptor', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor")
      .run(JSON.stringify(e));
  } catch { /* si falla, el panel muestra "desconocido" */ }
}

export function estadoReceptor(): EstadoReceptor | null {
  try {
    const f: any = conn().prepare("SELECT valor FROM traps_meta WHERE clave = 'receptor'").get();
    return f ? JSON.parse(f.valor) : null;
  } catch { return null; }
}

/**
 * Un paquete descartado no se pierde en silencio: se cuenta y se guarda el motivo.
 * Sin esto, cerrar el receptor por comunidad sería una forma elegante de dejar de
 * recibir avisos sin que nadie se entere.
 */
function anotarRechazo(motivo: string): void {
  const e = estadoReceptor();
  if (!e) return;
  e.rechazados = (e.rechazados || 0) + 1;
  e.ultimoRechazo = motivo.slice(0, 200);
  e.ultimoRechazoEn = Date.now();
  guardarEstado(e);
}

export function receptorActivo(): boolean {
  return !!receptor;
}

/**
 * Levanta el receptor. `alLlegar` se usa para avisar por socket; si el puerto
 * está tomado o no hay permiso, no se cae la aplicación: se registra y sigue.
 */
export function iniciarReceptorDeTraps(alLlegar?: (t: Trap) => void): void {
  if (alLlegar) alLlegarGuardado = alLlegar;
  if (receptor) return;
  const puerto = parseInt(process.env.TRAP_PORT || "162", 10);
  const { comunidades, abierto } = configTraps();

  try {
    receptor = snmp.createReceiver(
      { port: puerto, disableAuthorization: abierto, includeAuthentication: true, transport: "udp4" },
      (error: any, notificacion: any) => {
        if (error) {
          const motivo = String(error?.message || error);
          console.error("[Traps] paquete descartado:", motivo);
          anotarRechazo(motivo);
          return;
        }
        try {
          const t = ubicar(interpretar(notificacion));
          const guardado = guardarTrap(t);
          alLlegar?.(guardado);
        } catch (e: any) {
          console.error("[Traps] no pude interpretar la notificación:", e?.message || e);
        }
      }
    );
    sincronizarComunidades();
    // La configuración se puede cambiar desde la pantalla, y eso ocurre en otro
    // proceso: el receptor mira la base cada diez segundos en vez de enterarse
    // por un evento que no le llega.
    if (!vigilante) vigilante = setInterval(revisarConfig, 10_000);
    const anterior = estadoReceptor();
    guardarEstado({
      puerto, ok: true, desde: Date.now(), comunidades, abierto,
      detalle: detalleDe({ comunidades, abierto }),
      rechazados: anterior?.rechazados || 0,
      ultimoRechazo: anterior?.ultimoRechazo || null,
      ultimoRechazoEn: anterior?.ultimoRechazoEn || null,
    });
    // El índice de IPs se arma en segundo plano: cuando llegue el primer trap ya
    // tiene con qué contestar de qué equipo vino.
    refrescarSiHaceFalta();
    console.log(`[Traps] escuchando en ${puerto}/udp — ${abierto ? "abierto a cualquier comunidad" : "comunidades: " + comunidades.join(", ")}`);
  } catch (e: any) {
    receptor = null;
    guardarEstado({
      puerto, ok: false, desde: Date.now(), comunidades, abierto,
      detalle: String(e?.message || e), rechazados: 0, ultimoRechazo: null, ultimoRechazoEn: null,
    });
    console.error(`[Traps] no pude escuchar en ${puerto}/udp: ${e?.message || e}. ` +
      `Por debajo de 1024 hace falta root, o se puede usar otro puerto con TRAP_PORT.`);
  }
}

/** Convierte lo que entrega net-snmp en algo que se pueda leer y guardar. */
export function interpretar(n: any): Omit<Trap, "id" | "nodoId" | "mapaId" | "etiqueta" | "mapa"> {
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
