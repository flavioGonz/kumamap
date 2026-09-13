/**
 * A quién le llega cada aviso (K3).
 *
 * Antes: `sendPushToAll`. Cualquiera que tocara la campanita en el móvil recibía
 * TODAS las caídas de TODOS los clientes — el técnico de un cliente enterándose
 * de que se cayó un enlace de otro. Eso no escala ni es correcto: con 30 mapas,
 * el aviso útil se ahoga entre los que no le tocan a uno.
 *
 * Y había un problema más feo: el push salía por DOS caminos a la vez. `server.ts`
 * lo mandaba desde su sondeo de 2 s y `push-sender.ts` desde el latido de Kuma,
 * así que cada caída producía dos notificaciones. No se notaba porque no había
 * ni una suscripción registrada; el día que alguien se suscribiera, todo doble.
 * Peor: sólo uno de los dos caminos tenía el filtro de mantenimiento que se
 * agregó en K2, así que al cerrar una ventana salía igual un "recuperado" falso.
 *
 * Acá vive la única decisión: los dos caminos ahora sólo REPORTAN el estado, y
 * este módulo resuelve si corresponde avisar, a quién, y una sola vez.
 */
import webpush from "web-push";
import db from "./db";
import fs from "fs";
import path from "path";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@kumamap.local";

/** Dos avisos del mismo monitor y el mismo estado dentro de esta ventana: uno solo. */
const VENTANA_REPETIDO_MS = 60_000;
/** El índice monitor→mapas se rearma cada tanto; los mapas no cambian a menudo. */
const CACHE_MAPAS_MS = 60_000;

let vapidListo = false;
function prepararVapid(): boolean {
  if (vapidListo) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidListo = true;
    return true;
  } catch (err) {
    console.error("[Avisos] VAPID mal configurado:", err);
    return false;
  }
}

export interface Destino {
  id: number;
  canal: "push";
  /** El endpoint del navegador. Identifica al dispositivo, no a la persona. */
  destino: string;
  etiqueta: string;
  usuario: string;
  /** Mapas que le interesan. Vacío = todos, que es el comportamiento de siempre. */
  mapas: string[];
  activo: boolean;
  creado: number;
  ultimoEnvio: number | null;
  fallos: number;
}

/* ── Esquema ─────────────────────────────────────────────────────────────── */

let esquemaListo = false;
function prepararEsquema() {
  if (esquemaListo) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS avisos_destinos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      canal       TEXT    NOT NULL DEFAULT 'push',
      destino     TEXT    NOT NULL UNIQUE,
      datos       TEXT    NOT NULL,
      etiqueta    TEXT    NOT NULL DEFAULT '',
      usuario     TEXT    NOT NULL DEFAULT '',
      mapas       TEXT    NOT NULL DEFAULT '[]',
      activo      INTEGER NOT NULL DEFAULT 1,
      creado      INTEGER NOT NULL,
      ultimoEnvio INTEGER,
      fallos      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_avisos_activo ON avisos_destinos (activo);
  `);
  esquemaListo = true;
  importarArchivoViejo();
}

/**
 * Las suscripciones vivían en `data/push-subscriptions.json`, sin dueño ni
 * mapas. Se importan una vez con "todos los mapas", que es exactamente lo que
 * recibían antes: nadie pierde avisos por el cambio.
 */
function importarArchivoViejo() {
  const ruta = path.join(process.cwd(), "data", "push-subscriptions.json");
  try {
    if (!fs.existsSync(ruta)) return;
    const crudo = JSON.parse(fs.readFileSync(ruta, "utf-8"));
    if (!Array.isArray(crudo) || crudo.length === 0) return;
    let n = 0;
    for (const sub of crudo) {
      if (!sub?.endpoint) continue;
      const ya = db.prepare("SELECT 1 FROM avisos_destinos WHERE destino = ?").get(sub.endpoint);
      if (ya) continue;
      db.prepare(
        `INSERT INTO avisos_destinos (canal, destino, datos, etiqueta, usuario, mapas, creado)
         VALUES ('push', ?, ?, 'importado', '', '[]', ?)`
      ).run(sub.endpoint, JSON.stringify(sub), Date.now());
      n++;
    }
    if (n > 0) {
      fs.renameSync(ruta, ruta + ".importado");
      console.log(`[Avisos] ${n} suscripción(es) importada(s) del archivo viejo`);
    }
  } catch (err) {
    console.error("[Avisos] No se pudo importar el archivo viejo:", err);
  }
}

/* ── Alta y baja ─────────────────────────────────────────────────────────── */

export function registrarDestino(
  sub: { endpoint: string; [k: string]: unknown },
  opciones: { usuario?: string; mapas?: string[]; etiqueta?: string } = {}
): void {
  prepararEsquema();
  const mapas = JSON.stringify(Array.isArray(opciones.mapas) ? opciones.mapas : []);
  db.prepare(
    `INSERT INTO avisos_destinos (canal, destino, datos, etiqueta, usuario, mapas, creado)
     VALUES ('push', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(destino) DO UPDATE SET
       datos = excluded.datos,
       etiqueta = CASE WHEN excluded.etiqueta != '' THEN excluded.etiqueta ELSE avisos_destinos.etiqueta END,
       usuario = CASE WHEN excluded.usuario != '' THEN excluded.usuario ELSE avisos_destinos.usuario END,
       mapas = excluded.mapas,
       activo = 1`
  ).run(sub.endpoint, JSON.stringify(sub), opciones.etiqueta || "", opciones.usuario || "", mapas, Date.now());
}

export function bajaDestino(endpoint: string): boolean {
  prepararEsquema();
  return db.prepare("DELETE FROM avisos_destinos WHERE destino = ?").run(endpoint).changes > 0;
}

export function actualizarDestino(
  id: number, cambios: { mapas?: string[]; etiqueta?: string; activo?: boolean }
): boolean {
  prepararEsquema();
  const partes: string[] = [];
  const vals: unknown[] = [];
  if (cambios.mapas !== undefined) { partes.push("mapas = ?"); vals.push(JSON.stringify(cambios.mapas)); }
  if (cambios.etiqueta !== undefined) { partes.push("etiqueta = ?"); vals.push(cambios.etiqueta); }
  if (cambios.activo !== undefined) { partes.push("activo = ?"); vals.push(cambios.activo ? 1 : 0); }
  if (!partes.length) return false;
  vals.push(id);
  return db.prepare(`UPDATE avisos_destinos SET ${partes.join(", ")} WHERE id = ?`).run(...vals).changes > 0;
}

function aDestino(f: any): Destino {
  let mapas: string[] = [];
  try { const v = JSON.parse(f.mapas || "[]"); if (Array.isArray(v)) mapas = v.map(String); } catch { /* queda vacío = todos */ }
  return {
    id: Number(f.id), canal: "push", destino: String(f.destino),
    etiqueta: String(f.etiqueta || ""), usuario: String(f.usuario || ""),
    mapas, activo: !!f.activo, creado: Number(f.creado),
    ultimoEnvio: f.ultimoEnvio != null ? Number(f.ultimoEnvio) : null,
    fallos: Number(f.fallos) || 0,
  };
}

export function listarDestinos(): Destino[] {
  prepararEsquema();
  return (db.prepare("SELECT * FROM avisos_destinos ORDER BY creado DESC").all() as any[]).map(aDestino);
}

export function contarDestinos(): number {
  prepararEsquema();
  return Number((db.prepare("SELECT COUNT(*) c FROM avisos_destinos WHERE activo = 1").get() as any).c) || 0;
}

/* ── Qué mapa es cada monitor ────────────────────────────────────────────── */

let cacheMapas: Map<number, string[]> | null = null;
let cacheMapasAl = 0;

function indiceMonitorMapas(): Map<number, string[]> {
  if (cacheMapas && Date.now() - cacheMapasAl < CACHE_MAPAS_MS) return cacheMapas;
  const idx = new Map<number, string[]>();
  try {
    const filas = db.prepare(
      "SELECT map_id, kuma_monitor_id FROM network_map_nodes WHERE kuma_monitor_id IS NOT NULL"
    ).all() as any[];
    for (const f of filas) {
      const id = Number(f.kuma_monitor_id);
      const lista = idx.get(id) || [];
      if (!lista.includes(f.map_id)) lista.push(f.map_id);
      idx.set(id, lista);
    }
  } catch (err) {
    console.error("[Avisos] No se pudo armar el índice de mapas:", err);
  }
  cacheMapas = idx;
  cacheMapasAl = Date.now();
  return idx;
}

/** Un monitor puede estar en varios mapas: alcanza con que le interese uno. */
export function mapasDeMonitor(monitorId: number): string[] {
  return indiceMonitorMapas().get(monitorId) || [];
}

/** El índice se rearma solo, pero al guardar un mapa conviene no esperar. */
export function olvidarIndice() { cacheMapas = null; }

/** El mapa donde vive un nodo, para los avisos que no salen de un monitor. */
export function mapaDeNodo(nodoId: string): string | null {
  try {
    const f = db.prepare("SELECT map_id FROM network_map_nodes WHERE id = ?").get(nodoId) as any;
    return f?.map_id ? String(f.map_id) : null;
  } catch {
    return null;
  }
}

/**
 * Los destinos que deben recibir un aviso de estos mapas.
 *
 * Un destino sin mapas elegidos recibe todo — es el comportamiento de siempre y
 * el que tiene sentido para quien mira la red entera. Un monitor que no está en
 * ningún mapa (no debería pasar, pero pasa) también va a todos: es preferible un
 * aviso de más que perder una caída por un nodo mal vinculado.
 */
export function destinosPara(mapas: string[]): Destino[] {
  const todos = listarDestinos().filter((d) => d.activo);
  if (mapas.length === 0) return todos;
  return todos.filter((d) => d.mapas.length === 0 || d.mapas.some((m) => mapas.includes(m)));
}

/* ── El envío ────────────────────────────────────────────────────────────── */

export interface Aviso {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

async function enviar(destinos: Destino[], aviso: Aviso): Promise<{ ok: number; falló: number }> {
  if (!prepararVapid() || destinos.length === 0) return { ok: 0, falló: 0 };
  const cuerpo = JSON.stringify(aviso);

  const resultados = await Promise.allSettled(
    destinos.map(async (d) => {
      const sub = JSON.parse(
        (db.prepare("SELECT datos FROM avisos_destinos WHERE id = ?").get(d.id) as any)?.datos || "{}"
      );
      try {
        await webpush.sendNotification(sub, cuerpo);
        db.prepare("UPDATE avisos_destinos SET ultimoEnvio = ?, fallos = 0 WHERE id = ?").run(Date.now(), d.id);
      } catch (err: any) {
        // 404/410 = el navegador ya no existe. Borrarla es lo correcto: si no,
        // la lista se llena de fantasmas y no se entiende a cuántos se avisa.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          db.prepare("DELETE FROM avisos_destinos WHERE id = ?").run(d.id);
          console.log(`[Avisos] Suscripción vencida dada de baja (${d.etiqueta || d.id})`);
        } else {
          db.prepare("UPDATE avisos_destinos SET fallos = fallos + 1 WHERE id = ?").run(d.id);
        }
        throw err;
      }
    })
  );
  const ok = resultados.filter((r) => r.status === "fulfilled").length;
  return { ok, falló: resultados.length - ok };
}

/** Aviso suelto (una UPS, un trap) que ya sabe a qué mapa pertenece. */
export async function avisarAMapa(mapaId: string | null, aviso: Aviso) {
  prepararEsquema();
  const destinos = destinosPara(mapaId ? [mapaId] : []);
  const r = await enviar(destinos, aviso);
  if (r.ok || r.falló) console.log(`[Avisos] ${aviso.title} → ${r.ok}/${destinos.length}`);
}

/* ── La decisión, en un solo lugar ───────────────────────────────────────── */

const estadoPrevio = new Map<number, number>();
const ultimoAviso = new Map<string, number>();

/**
 * Los dos caminos —el latido de Kuma y el sondeo de server.ts— llaman acá.
 * El primero que llega manda el aviso; el segundo se encuentra la marca puesta y
 * no hace nada. Antes cada uno mandaba el suyo.
 */
export async function reportarEstado(
  monitorId: number, nombre: string, estado: number, msg: string, ping: number | null
): Promise<void> {
  prepararEsquema();

  const previo = estadoPrevio.get(monitorId);
  estadoPrevio.set(monitorId, estado);

  if (previo === undefined) return;        // primer latido: sólo se anota
  if (previo === estado) return;           // no cambió nada
  if (previo === 3) return;                // salir de mantenimiento no es recuperarse
  if (estado !== 0 && estado !== 1) return; // sólo caída y vuelta

  const clave = `${monitorId}:${estado}`;
  const ahora = Date.now();
  if (ahora - (ultimoAviso.get(clave) || 0) < VENTANA_REPETIDO_MS) return;
  ultimoAviso.set(clave, ahora);

  const caido = estado === 0;
  const mapas = mapasDeMonitor(monitorId);
  const destinos = destinosPara(mapas);
  if (destinos.length === 0) return;

  const r = await enviar(destinos, {
    title: caido ? `🔴 ${nombre}` : `🟢 ${nombre}`,
    body: caido
      ? `Monitor caído${msg ? `: ${msg}` : ""}`
      : `Monitor recuperado${ping ? ` — ${ping} ms` : ""}`,
    tag: `monitor-${monitorId}`,
    data: { url: "/mobile/alerts", monitorId },
  });
  console.log(
    `[Avisos] ${nombre} ${caido ? "CAÍDO" : "recuperado"} → ${r.ok}/${destinos.length}` +
    (mapas.length ? ` (mapas: ${mapas.length})` : " (sin mapa: va a todos)")
  );
}

/** Para la pantalla: probar que el aviso llega a un dispositivo concreto. */
export async function probarDestino(id: number): Promise<boolean> {
  prepararEsquema();
  const d = listarDestinos().find((x) => x.id === id);
  if (!d) return false;
  const r = await enviar([d], {
    title: "🔔 Prueba de aviso",
    body: d.mapas.length
      ? `Este dispositivo recibe avisos de ${d.mapas.length} cliente(s)`
      : "Este dispositivo recibe avisos de todos los clientes",
    tag: "prueba",
    data: { url: "/avisos" },
  });
  return r.ok > 0;
}
