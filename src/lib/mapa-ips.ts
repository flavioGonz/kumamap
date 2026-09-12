/**
 * Índice de direcciones IP del mapa.
 *
 * Cuando llega un trap sabemos de qué IP vino y nada más. Este índice contesta la
 * pregunta que importa: **qué equipo es y de qué cliente**.
 *
 * Se arma de tres fuentes, en este orden de confianza:
 *   1. La IP que el nodo tiene cargada a mano (`custom_data.ip`).
 *   2. El `hostname` del monitor de Uptime Kuma al que el nodo está vinculado,
 *      cuando ya es una IP.
 *   3. Ese mismo hostname resuelto por DNS. Acá está la mayor parte de la flota:
 *      los MikroTik se monitorean por su nombre de nube (`*.sn.mynetname.net`),
 *      que apunta a la IP pública desde la que van a salir los traps.
 *
 * El índice se rearma solo cada cinco minutos. Es a propósito que la resolución
 * DNS no ocurra al recibir el trap: un nombre sin respuesta colgaría el receptor.
 *
 * Se guarda en SQLite y no en memoria porque el receptor vive en el proceso del
 * servidor y las rutas de Next corren en otro: en memoria cada uno tendría el
 * suyo, y el de las rutas estaría siempre vacío.
 */
import dnsp from "dns/promises";
import Database from "better-sqlite3";
import path from "path";
import { getKumaClient } from "./kuma";

export interface NodoIp {
  nodeId: string;
  etiqueta: string;
  mapId: string;
  mapa: string;
  monitorId: number | null;
  via: "nodo" | "monitor" | "dns";
  /** Cuántos otros nodos comparten esta IP: el mismo equipo dibujado en varios mapas. */
  otros: number;
}

const REFRESCO_MS = 5 * 60_000;
const DNS_TIMEOUT_MS = 2500;
const DNS_A_LA_VEZ = 8;

let armando: Promise<void> | null = null;

/* ──────────────────────────────────────────── tabla ── */

let db: any = null;

function conn(): any {
  if (db) return db;
  db = new Database(path.join(process.cwd(), "data", "kumamap.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS mapa_ips (
      ip         TEXT PRIMARY KEY,
      nodo_id    TEXT NOT NULL,
      etiqueta   TEXT NOT NULL DEFAULT '',
      mapa_id    TEXT NOT NULL DEFAULT '',
      mapa       TEXT NOT NULL DEFAULT '',
      monitor_id INTEGER,
      via        TEXT NOT NULL DEFAULT 'nodo',
      otros      INTEGER NOT NULL DEFAULT 0,
      at         INTEGER NOT NULL
    );
  `);
  return db;
}

function ultimoArmadoDeLaBase(): number {
  try {
    const f: any = conn().prepare("SELECT MAX(at) a FROM mapa_ips").get();
    return Number(f?.a) || 0;
  } catch { return 0; }
}

/* ────────────────────────────────────────── utilidades ── */

const ES_IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function esIp(v: string): boolean {
  return ES_IPV4.test(v.trim());
}

/** Saca el host de una url o de un "host:puerto". Devuelve "" si no hay nada usable. */
function hostDe(v: string): string {
  const s = String(v || "").trim();
  if (!s) return "";
  try {
    if (/^[a-z]+:\/\//i.test(s)) return new URL(s).hostname;
  } catch { /* sigue abajo */ }
  const sinPuerto = s.replace(/^\[|\]$/g, "").split("/")[0];
  const m = /^([^:]+)(:\d+)?$/.exec(sinPuerto);
  return m ? m[1] : "";
}

async function resolver(nombre: string): Promise<string[]> {
  try {
    const carrera = Promise.race([
      dnsp.resolve4(nombre),
      new Promise<string[]>((_, no) => setTimeout(() => no(new Error("timeout")), DNS_TIMEOUT_MS)),
    ]);
    return await carrera;
  } catch {
    return [];
  }
}

/* ──────────────────────────────────────────── armado ── */

function nodosDelMapa(): Array<{ nodeId: string; etiqueta: string; mapId: string; mapa: string; ip: string; monitorId: number | null }> {
  const db = conn();
  {
    const filas = db.prepare(
      `SELECT n.id, n.label, n.custom_data, n.kuma_monitor_id, m.id AS mapId, m.name AS mapa
       FROM network_map_nodes n JOIN network_maps m ON m.id = n.map_id
       ORDER BY m.name, n.label`
    ).all() as any[];
    return filas.map((f) => {
      let cd: any = {};
      try { cd = JSON.parse(f.custom_data || "{}"); } catch { cd = {}; }
      return {
        nodeId: f.id,
        etiqueta: f.label || "(sin nombre)",
        mapId: f.mapId,
        mapa: f.mapa,
        ip: String(cd?.ip || "").trim(),
        monitorId: f.kuma_monitor_id != null ? Number(f.kuma_monitor_id) : null,
      };
    });
  }
}

function anotar(mapa: Map<string, NodoIp>, ip: string, n: Omit<NodoIp, "otros">): void {
  const k = ip.trim();
  if (!k) return;
  const ya = mapa.get(k);
  // Gana el primero: el orden de las fuentes es el orden de confianza.
  if (ya) { ya.otros++; return; }
  mapa.set(k, { ...n, otros: 0 });
}

async function armar(): Promise<void> {
  const nuevo = new Map<string, NodoIp>();
  const nodos = nodosDelMapa();

  // Monitores de Kuma, para poder ir del nodo a su hostname.
  const monitores = new Map<number, { hostname: string; url: string }>();
  try {
    for (const m of getKumaClient().getMonitors()) {
      monitores.set(m.id, { hostname: String(m.hostname || ""), url: String(m.url || "") });
    }
  } catch { /* si Kuma no responde, quedan las IPs cargadas a mano */ }
  // El indice se arma al arrancar, y ahi Kuma todavia puede no haber autenticado.
  // Si volvemos con las manos vacias, no vale marcar el indice como fresco.
  const sinMonitores = monitores.size === 0;

  // 1 · la IP escrita en el nodo
  const porResolver = new Map<string, Omit<NodoIp, "otros">>();
  for (const n of nodos) {
    const base = { nodeId: n.nodeId, etiqueta: n.etiqueta, mapId: n.mapId, mapa: n.mapa, monitorId: n.monitorId };
    if (n.ip && esIp(n.ip)) anotar(nuevo, n.ip, { ...base, via: "nodo" });
    else if (n.ip && !porResolver.has(n.ip)) porResolver.set(n.ip, { ...base, via: "dns" });
  }

  // 2 · el hostname del monitor, si ya es una IP
  for (const n of nodos) {
    if (n.monitorId == null) continue;
    const m = monitores.get(n.monitorId);
    if (!m) continue;
    const base = { nodeId: n.nodeId, etiqueta: n.etiqueta, mapId: n.mapId, mapa: n.mapa, monitorId: n.monitorId };
    for (const cand of [m.hostname, hostDe(m.url)]) {
      const h = hostDe(cand);
      if (!h) continue;
      if (esIp(h)) anotar(nuevo, h, { ...base, via: "monitor" });
      else if (!porResolver.has(h)) porResolver.set(h, { ...base, via: "dns" });
    }
  }

  // 3 · lo que quede, por DNS, de a ocho
  const nombres = [...porResolver.keys()];
  for (let i = 0; i < nombres.length; i += DNS_A_LA_VEZ) {
    const tanda = nombres.slice(i, i + DNS_A_LA_VEZ);
    const res = await Promise.all(tanda.map((h) => resolver(h)));
    tanda.forEach((h, j) => {
      const quien = porResolver.get(h)!;
      for (const ip of res[j]) anotar(nuevo, ip, quien);
    });
  }

  const at = Date.now();
  const c = conn();
  const borrar = c.prepare("DELETE FROM mapa_ips");
  const meter = c.prepare(
    `INSERT INTO mapa_ips (ip, nodo_id, etiqueta, mapa_id, mapa, monitor_id, via, otros, at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  c.transaction(() => {
    borrar.run();
    for (const [ip, n] of nuevo) {
      meter.run(ip, n.nodeId, n.etiqueta, n.mapId, n.mapa, n.monitorId, n.via, n.otros, at);
    }
  })();

  const porVia = { nodo: 0, monitor: 0, dns: 0 } as Record<NodoIp["via"], number>;
  for (const n of nuevo.values()) porVia[n.via]++;
  console.log(`[MapaIPs] ${nuevo.size} direcciones de ${nodos.length} nodos ` +
    `(${porVia.nodo} del nodo, ${porVia.monitor} del monitor, ${porVia.dns} por DNS)` +
    (sinMonitores ? " — Kuma todavia no habia respondido, se reintenta en 30 s" : ""));
  reintentoCorto = sinMonitores ? Date.now() + 5 * 60_000 : 0;
}

/** Rearma el índice si está viejo. Nunca lanza: es información de apoyo. */
let reintentoCorto = 0;

export function refrescarSiHaceFalta(): void {
  if (armando) return;
  const ultimo = ultimoArmadoDeLaBase();
  const espera = reintentoCorto > Date.now() ? 30_000 : REFRESCO_MS;
  if (ultimo && Date.now() - ultimo < espera) return;
  armando = armar()
    .catch((e) => console.error("[MapaIPs] no pude armar el índice:", e?.message || e))
    .finally(() => { armando = null; });
}

export async function refrescarAhora(): Promise<void> {
  if (armando) { await armando; return; }
  armando = armar()
    .catch((e) => console.error("[MapaIPs] no pude armar el índice:", e?.message || e))
    .finally(() => { armando = null; });
  await armando;
}

/** Búsqueda sincrónica: se usa en el camino caliente del receptor de traps. */
export function buscarPorIp(ip: string): NodoIp | null {
  refrescarSiHaceFalta();
  const k = String(ip || "").trim();
  if (!k) return null;
  try {
    const f: any = conn().prepare("SELECT * FROM mapa_ips WHERE ip = ?").get(k);
    if (!f) return null;
    return {
      nodeId: f.nodo_id, etiqueta: f.etiqueta, mapId: f.mapa_id, mapa: f.mapa,
      monitorId: f.monitor_id ?? null, via: f.via, otros: f.otros,
    };
  } catch { return null; }
}

export function estadoIndice(): { direcciones: number; armadoEn: number; porVia: Record<string, number> } {
  try {
    const c = conn();
    const t: any = c.prepare("SELECT COUNT(*) n, MAX(at) a FROM mapa_ips").get();
    const v: any[] = c.prepare("SELECT via, COUNT(*) n FROM mapa_ips GROUP BY via").all();
    const porVia: Record<string, number> = {};
    for (const x of v) porVia[x.via] = x.n;
    return { direcciones: Number(t?.n) || 0, armadoEn: Number(t?.a) || 0, porVia };
  } catch {
    return { direcciones: 0, armadoEn: 0, porVia: {} };
  }
}
