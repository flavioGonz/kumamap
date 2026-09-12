/**
 * monitor-ng — relevamiento (survey) y encargos remotos (jobs).
 *
 * REGLA DE ORO DE LA ARQUITECTURA: el controlador NO puede hacer nada sobre el
 * equipo remoto. No lo alcanza por red, no tiene credenciales, no ejecuta nada.
 * Lo unico que puede hacer es DEJAR TRABAJO en una cola; el agente lo levanta
 * en la bajada de su proximo push y devuelve el resultado en el push siguiente.
 *
 * De ahi el ciclo de vida de un encargo:
 *   pendiente -> enviado (el agente lo recibio) -> listo | error
 *                        \-> reintento si no volvio en RETRY_MS
 *                        \-> expirado tras MAX_INTENTOS
 *
 * Todo vive en el mismo SQLite que monitorng.ts (WAL, conexion aparte).
 */
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { ultimoInstalador, shaInstalador, comparar, type Release } from "./agent-release";

const DB_PATH = path.join(process.cwd(), "data", "kumamap.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS monitorng_survey (
    node TEXT PRIMARY KEY,
    at INTEGER DEFAULT 0,
    recibido INTEGER DEFAULT 0,
    os TEXT DEFAULT '{}',
    roles TEXT DEFAULT '[]',
    volumenes TEXT DEFAULT '[]',
    productos TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS monitorng_jobs (
    id TEXT PRIMARY KEY,
    node TEXT NOT NULL,
    tipo TEXT NOT NULL,
    destino TEXT DEFAULT '',
    params TEXT DEFAULT '{}',
    estado TEXT DEFAULT 'pendiente',
    creado INTEGER DEFAULT 0,
    enviado INTEGER DEFAULT 0,
    cerrado INTEGER DEFAULT 0,
    ms INTEGER DEFAULT 0,
    intentos INTEGER DEFAULT 0,
    resultado TEXT,
    autor TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_mngjobs_node ON monitorng_jobs(node, estado);
  CREATE INDEX IF NOT EXISTS idx_mngjobs_creado ON monitorng_jobs(creado DESC);

  CREATE TABLE IF NOT EXISTS monitorng_detalle (
    node TEXT NOT NULL,
    tipo TEXT NOT NULL,
    at INTEGER DEFAULT 0,
    recibido INTEGER DEFAULT 0,
    datos TEXT DEFAULT '{}',
    PRIMARY KEY (node, tipo)
  );

  CREATE TABLE IF NOT EXISTS monitorng_agentes (
    node TEXT PRIMARY KEY,
    version TEXT DEFAULT '',
    visto INTEGER DEFAULT 0,
    objetivo TEXT DEFAULT '',
    estado TEXT DEFAULT 'al-dia',
    intentos INTEGER DEFAULT 0,
    ofrecido INTEGER DEFAULT 0,
    error TEXT DEFAULT ''
  );
`);

/** Cuantos encargos le mandamos como maximo en una misma bajada. */
const MAX_POR_BAJADA = 4;
/** Si el agente no devolvio el resultado en este tiempo, se lo volvemos a mandar. */
const RETRY_MS = 5 * 60 * 1000;
const MAX_INTENTOS = 3;
/** Historial que guardamos por servidor. */
const MAX_HISTORIAL = 200;

export type JobTipo = "ping" | "tcp" | "http" | "dns" | "traceroute" | "scan" | "sensor";
export const JOB_TIPOS: JobTipo[] = ["ping", "tcp", "http", "dns", "traceroute", "scan", "sensor"];
/** Los agentes anteriores a esta version no saben ejecutar el encargo "sensor". */
export const VERSION_SENSOR = "6.1.2";

export interface Job {
  id: string;
  node: string;
  tipo: JobTipo;
  destino: string;
  params: Record<string, any>;
  estado: "pendiente" | "enviado" | "listo" | "error" | "expirado";
  creado: number;
  enviado: number;
  cerrado: number;
  ms: number;
  intentos: number;
  resultado: any;
  autor: string;
  resumen: string;
}

export interface Survey {
  node: string;
  at: number;
  recibido: number;
  os: any;
  roles: string[];
  volumenes: any[];
  productos: Array<{ clave: string; nombre: string; version?: string; via?: string; sensores?: string[] }>;
}

function jparse<T>(s: string, fb: T): T {
  try {
    const v = JSON.parse(s || "");
    return v === null || v === undefined ? fb : (v as T);
  } catch {
    return fb;
  }
}

function httpErr(status: number, msg: string): Error {
  const e: any = new Error(msg);
  e.status = status;
  return e;
}

/* ------------------------------------------------------------------ survey */

const upSurvey = db.prepare(`
  INSERT INTO monitorng_survey (node, at, recibido, os, roles, volumenes, productos)
  VALUES (@node, @at, @recibido, @os, @roles, @volumenes, @productos)
  ON CONFLICT(node) DO UPDATE SET
    at = excluded.at, recibido = excluded.recibido, os = excluded.os,
    roles = excluded.roles, volumenes = excluded.volumenes, productos = excluded.productos
`);

/** El agente manda el relevamiento solo cuando cambia; lo pisamos entero. */
export function guardarSurvey(node: string, s: any): void {
  if (!node || !s || typeof s !== "object") return;
  upSurvey.run({
    node,
    at: Number(s.at) || Date.now(),
    recibido: Date.now(),
    os: JSON.stringify(s.os || {}).slice(0, 8000),
    roles: JSON.stringify(Array.isArray(s.roles) ? s.roles.slice(0, 40) : []).slice(0, 4000),
    volumenes: JSON.stringify(Array.isArray(s.volumenes) ? s.volumenes.slice(0, 32) : []).slice(0, 8000),
    productos: JSON.stringify(Array.isArray(s.productos) ? s.productos.slice(0, 40) : []).slice(0, 12000),
  });
}

function rowToSurvey(r: any): Survey {
  return {
    node: r.node,
    at: r.at || 0,
    recibido: r.recibido || 0,
    os: jparse<any>(r.os, {}),
    roles: jparse<string[]>(r.roles, []),
    volumenes: jparse<any[]>(r.volumenes, []),
    productos: jparse<any[]>(r.productos, []),
  };
}

export function getSurvey(node: string): Survey | null {
  const r = db.prepare("SELECT * FROM monitorng_survey WHERE node = ?").get(node) as any;
  return r ? rowToSurvey(r) : null;
}

export function listSurveys(): Survey[] {
  const rows = db.prepare("SELECT * FROM monitorng_survey ORDER BY recibido DESC").all() as any[];
  return rows.map(rowToSurvey);
}

/* ------------------------------------------------------------------ encargos */

function resumir(tipo: string, resultado: any, estado: string): string {
  if (!resultado) {
    if (estado === "pendiente") return "en cola, esperando al agente";
    if (estado === "enviado") return "el agente lo esta ejecutando";
    if (estado === "expirado") return "el agente nunca devolvio el resultado";
    return "";
  }
  if (resultado.error) return "error: " + String(resultado.error).slice(0, 120);
  if (tipo === "scan") {
    const v = Array.isArray(resultado.vivos) ? resultado.vivos.length : 0;
    return v + " equipos vivos de " + (resultado.probados || 0) + " direcciones";
  }
  if (tipo === "traceroute") return (resultado.saltos || []).length + " saltos";
  if (tipo === "dns") {
    const d = resultado.direcciones || resultado.nombres || [];
    return Array.isArray(d) ? d.join(", ").slice(0, 120) : "";
  }
  if (resultado.ok) return resultado.detail || (resultado.ms !== undefined ? resultado.ms + " ms" : "ok");
  return "sin respuesta" + (resultado.detail ? " — " + resultado.detail : "");
}

function rowToJob(r: any): Job {
  const resultado = r.resultado ? jparse<any>(r.resultado, null) : null;
  return {
    id: r.id,
    node: r.node,
    tipo: r.tipo,
    destino: r.destino || "",
    params: jparse<Record<string, any>>(r.params, {}),
    estado: r.estado,
    creado: r.creado || 0,
    enviado: r.enviado || 0,
    cerrado: r.cerrado || 0,
    ms: r.ms || 0,
    intentos: r.intentos || 0,
    resultado,
    autor: r.autor || "",
    resumen: resumir(r.tipo, resultado, r.estado),
  };
}

/** Valida y normaliza lo que llega del panel. Tira 400 con un mensaje util. */
function normalizar(input: any): { tipo: JobTipo; destino: string; params: Record<string, any> } {
  const tipo = String(input?.tipo || "").toLowerCase() as JobTipo;
  if (!JOB_TIPOS.includes(tipo)) throw httpErr(400, "tipo invalido (ping|tcp|http|dns|traceroute|scan|sensor)");
  const params: Record<string, any> = {};
  const to = Number(input?.timeoutMs);
  if (to >= 500 && to <= 30000) params.timeoutMs = Math.round(to);

  if (tipo === "scan") {
    const rango = String(input?.rango || input?.destino || "").trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2}|\.\d{1,3}-\d{1,3})?$/.test(rango) && !/^\d{1,3}(\.\d{1,3}){2}\.\d{1,3}-\d{1,3}$/.test(rango)) {
      throw httpErr(400, "rango invalido: usar a.b.c.d/24 o a.b.c.10-200");
    }
    params.rango = rango;
    if (Array.isArray(input?.puertos)) {
      params.puertos = input.puertos.map((p: any) => Number(p)).filter((p: number) => p > 0 && p < 65536).slice(0, 12);
    }
    return { tipo, destino: rango, params };
  }

  // Encender un sensor del propio agente. El destino es la clave del modulo, y
  // por eso no pasa por la validacion de destinos de red de mas abajo.
  if (tipo === "sensor") {
    const clave = String(input?.sensor || input?.destino || "").trim().toLowerCase();
    if (!/^[a-z]{2,20}$/.test(clave)) throw httpErr(400, "sensor invalido");
    return { tipo, destino: clave, params };
  }

  if (tipo === "http") {
    const url = String(input?.url || input?.destino || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw httpErr(400, "url invalida (http:// o https://)");
    params.url = url;
    if (input?.texto) params.texto = String(input.texto).slice(0, 120);
    return { tipo, destino: url, params };
  }

  const destino = String(input?.destino || "").trim();
  if (!destino || destino.length > 200 || /[\s;|&`$<>"']/.test(destino)) throw httpErr(400, "destino invalido");
  if (tipo === "tcp") {
    const puerto = Number(input?.puerto);
    if (!(puerto > 0 && puerto < 65536)) throw httpErr(400, "puerto invalido");
    params.puerto = puerto;
  }
  if (tipo === "traceroute") {
    const s = Number(input?.saltos);
    params.saltos = s >= 3 && s <= 30 ? Math.round(s) : 15;
  }
  return { tipo, destino, params };
}

/** Deja un encargo en la cola de ese servidor. No ejecuta nada: el agente lo busca. */
export function encargar(node: string, input: any, autor = ""): Job {
  if (!node) throw httpErr(400, "node requerido");
  const { tipo, destino, params } = normalizar(input);
  const pend = db
    .prepare("SELECT COUNT(*) AS n FROM monitorng_jobs WHERE node = ? AND estado IN ('pendiente','enviado')")
    .get(node) as any;
  if ((pend?.n || 0) >= 20) throw httpErr(429, "ese servidor ya tiene 20 encargos sin terminar");

  const id = "j-" + Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
  db.prepare(
    `INSERT INTO monitorng_jobs (id, node, tipo, destino, params, estado, creado, autor)
     VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)`
  ).run(id, node, tipo, destino.slice(0, 200), JSON.stringify(params), Date.now(), String(autor || "").slice(0, 80));
  podar(node);
  return rowToJob(db.prepare("SELECT * FROM monitorng_jobs WHERE id = ?").get(id));
}

/**
 * Bajada: lo que le devolvemos al agente en la respuesta de su push.
 * Marca los encargos como enviados y reintenta los que quedaron colgados.
 */
export function jobsParaBajada(node: string): any[] {
  const ahora = Date.now();

  // los que se mandaron y nunca volvieron: reintento o expiran
  db.prepare(
    `UPDATE monitorng_jobs SET estado = 'expirado', cerrado = ?
      WHERE node = ? AND estado = 'enviado' AND enviado < ? AND intentos >= ?`
  ).run(ahora, node, ahora - RETRY_MS, MAX_INTENTOS);
  db.prepare(
    `UPDATE monitorng_jobs SET estado = 'pendiente'
      WHERE node = ? AND estado = 'enviado' AND enviado < ?`
  ).run(node, ahora - RETRY_MS);

  const rows = db
    .prepare("SELECT * FROM monitorng_jobs WHERE node = ? AND estado = 'pendiente' ORDER BY creado ASC LIMIT ?")
    .all(node, MAX_POR_BAJADA) as any[];
  if (!rows.length) return [];

  const marcar = db.prepare(
    "UPDATE monitorng_jobs SET estado = 'enviado', enviado = ?, intentos = intentos + 1 WHERE id = ?"
  );
  const tx = db.transaction((rs: any[]) => {
    for (const r of rs) marcar.run(ahora, r.id);
  });
  tx(rows);

  // el agente espera el encargo plano: { id, tipo, destino, ...params }
  return rows.map((r) => Object.assign({ id: r.id, tipo: r.tipo, destino: r.destino }, jparse<any>(r.params, {})));
}

/** Subida: resultados que el agente cosecho de los encargos anteriores. */
export function guardarResultados(node: string, lista: any): number {
  if (!Array.isArray(lista) || !lista.length) return 0;
  const upd = db.prepare(
    `UPDATE monitorng_jobs SET estado = ?, cerrado = ?, ms = ?, resultado = ?
      WHERE id = ? AND node = ? AND estado IN ('pendiente','enviado','expirado')`
  );
  let n = 0;
  const tx = db.transaction((rs: any[]) => {
    for (const r of rs.slice(0, 32)) {
      if (!r || !r.id) continue;
      const estado = r.estado === "error" ? "error" : "listo";
      const info = upd.run(
        estado,
        Number(r.fin) || Date.now(),
        Number(r.ms) || 0,
        JSON.stringify(r.resultado === undefined ? null : r.resultado).slice(0, 200000),
        String(r.id),
        node
      );
      if (info.changes) n++;
    }
  });
  tx(lista);
  if (n) podar(node);
  return n;
}

function podar(node: string) {
  db.prepare(
    `DELETE FROM monitorng_jobs WHERE node = ? AND id NOT IN (
       SELECT id FROM monitorng_jobs WHERE node = ? ORDER BY creado DESC LIMIT ?
     )`
  ).run(node, node, MAX_HISTORIAL);
}

export function listJobs(node?: string, limite = 60): Job[] {
  const rows = node
    ? (db.prepare("SELECT * FROM monitorng_jobs WHERE node = ? ORDER BY creado DESC LIMIT ?").all(node, limite) as any[])
    : (db.prepare("SELECT * FROM monitorng_jobs ORDER BY creado DESC LIMIT ?").all(limite) as any[]);
  return rows.map(rowToJob);
}

export function getJob(id: string): Job | null {
  const r = db.prepare("SELECT * FROM monitorng_jobs WHERE id = ?").get(String(id || "")) as any;
  return r ? rowToJob(r) : null;
}

export function cancelarJob(id: string): { ok: true } {
  const info = db
    .prepare("UPDATE monitorng_jobs SET estado = 'expirado', cerrado = ? WHERE id = ? AND estado = 'pendiente'")
    .run(Date.now(), String(id || ""));
  if (!info.changes) throw httpErr(409, "solo se puede cancelar un encargo que todavia no salio");
  return { ok: true };
}

/** Resumen por servidor para el panel: cuantos encargos hay y en que estado. */
export function resumenJobs(node: string): { pendientes: number; enviados: number; ultimo: Job | null } {
  const c = db
    .prepare(
      `SELECT
         SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS p,
         SUM(CASE WHEN estado = 'enviado' THEN 1 ELSE 0 END) AS e
       FROM monitorng_jobs WHERE node = ?`
    )
    .get(node) as any;
  const u = db.prepare("SELECT * FROM monitorng_jobs WHERE node = ? ORDER BY creado DESC LIMIT 1").get(node) as any;
  return { pendientes: c?.p || 0, enviados: c?.e || 0, ultimo: u ? rowToJob(u) : null };
}

/* ────────────────────────────────────── actualizacion del agente ── */

/**
 * Actualizacion automatica de agentes.
 *
 * Igual que los encargos, esto no es "el controlador actualiza el servidor": el
 * controlador solo ofrece la actualizacion en la bajada del reporte y el agente
 * decide, la baja, verifica el sha256 y se reinstala solo.
 *
 * Los frenos importan porque del otro lado hay servidores de produccion:
 *  - se ofrece una sola vez cada OFRECER_CADA_MS, no en cada push;
 *  - a los 3 intentos fallidos con la misma version, se deja de ofrecer y queda
 *    marcado en rojo en el panel para mirarlo a mano;
 *  - si el agente vuelve reportando la version nueva, se da por hecho y se limpia.
 */
const MAX_INTENTOS_UPD = 3;
const OFRECER_CADA_MS = 20 * 60 * 1000;

export interface AgenteVersion {
  node: string;
  version: string;
  visto: number;
  objetivo: string;
  estado: "al-dia" | "hay-nueva" | "actualizando" | "fallo" | "desconocida";
  intentos: number;
  error: string;
}

const upAgente = db.prepare(`
  INSERT INTO monitorng_agentes (node, version, visto)
  VALUES (?, ?, ?)
  ON CONFLICT(node) DO UPDATE SET version = excluded.version, visto = excluded.visto
`);

/** El agente dice que version es en cada push. */
export function guardarVersion(node: string, version: any): void {
  const v = String(version || "").trim().slice(0, 20);
  if (!node || !/^\d+\.\d+\.\d+$/.test(v)) return;
  upAgente.run(node, v, Date.now());
  // llego a destino: se acabo la actualizacion
  db.prepare(
    `UPDATE monitorng_agentes
        SET estado = 'al-dia', objetivo = '', intentos = 0, error = '', ofrecido = 0
      WHERE node = ? AND objetivo != '' AND version = objetivo`
  ).run(node);
}

/** El agente avisa como le fue con la actualizacion que se llevo. */
export function estadoActualizacion(node: string, est: any): void {
  if (!node || !est || typeof est !== "object") return;
  const fase = String(est.fase || "");
  if (fase === "error") {
    db.prepare(
      "UPDATE monitorng_agentes SET estado = 'fallo', error = ? WHERE node = ?"
    ).run(String(est.error || "sin detalle").slice(0, 300), node);
  } else if (fase === "bajando" || fase === "instalando") {
    db.prepare("UPDATE monitorng_agentes SET estado = 'actualizando', error = '' WHERE node = ?").run(node);
  }
}

/**
 * Lo que le ofrecemos a este agente en la bajada, o null si no hay nada que hacer.
 * La URL se arma con el origen que pidio el agente, nunca con un host que venga en datos.
 */
export function actualizacionParaBajada(node: string, origen: string): any | null {
  const rel: Release | null = ultimoInstalador();
  if (!rel) return null;
  const r = db.prepare("SELECT * FROM monitorng_agentes WHERE node = ?").get(node) as any;
  if (!r || !r.version) return null;                       // todavia no sabemos que version tiene
  if (comparar(r.version, rel.version) >= 0) return null;   // ya esta al dia (o mas nuevo)
  if (r.objetivo === rel.version && r.intentos >= MAX_INTENTOS_UPD) return null;
  const ahora = Date.now();
  if (r.objetivo === rel.version && r.ofrecido && ahora - r.ofrecido < OFRECER_CADA_MS) return null;

  const sha = shaInstalador(rel);
  if (!sha) return null;                                    // sin hash no se ofrece nada

  const intentos = r.objetivo === rel.version ? r.intentos + 1 : 1;
  db.prepare(
    `UPDATE monitorng_agentes
        SET objetivo = ?, estado = 'actualizando', intentos = ?, ofrecido = ?, error = ''
      WHERE node = ?`
  ).run(rel.version, intentos, ahora, node);

  const base = String(origen || "").replace(/\/+$/, "");
  return {
    version: rel.version,
    url: base + rel.url,
    bytes: rel.bytes,
    sha256: sha,
    desde: r.version,
    intento: intentos,
  };
}

function rowToAgente(r: any, ultima: string): AgenteVersion {
  let estado = r.estado || "al-dia";
  if (!r.version) estado = "desconocida";
  else if (estado !== "actualizando" && estado !== "fallo") {
    estado = comparar(r.version, ultima) < 0 ? "hay-nueva" : "al-dia";
  }
  return {
    node: r.node,
    version: r.version || "",
    visto: r.visto || 0,
    objetivo: r.objetivo || "",
    estado: estado as AgenteVersion["estado"],
    intentos: r.intentos || 0,
    error: r.error || "",
  };
}

export function listAgentes(): { ultima: Release | null; agentes: AgenteVersion[] } {
  const rel = ultimoInstalador();
  const rows = db.prepare("SELECT * FROM monitorng_agentes").all() as any[];
  return { ultima: rel, agentes: rows.map((r) => rowToAgente(r, rel?.version || "0.0.0")) };
}

export function getAgente(node: string): AgenteVersion | null {
  const rel = ultimoInstalador();
  const r = db.prepare("SELECT * FROM monitorng_agentes WHERE node = ?").get(node) as any;
  return r ? rowToAgente(r, rel?.version || "0.0.0") : null;
}

/** Volver a intentar una actualizacion que quedo marcada como fallida. */
export function reintentarActualizacion(node: string): { ok: true } {
  db.prepare(
    "UPDATE monitorng_agentes SET intentos = 0, ofrecido = 0, estado = 'hay-nueva', error = '' WHERE node = ?"
  ).run(node);
  return { ok: true };
}

/* ──────────────────────── detalle operativo (Veeam, eventos) ── */

/**
 * Hay cosas que el controlador no puede averiguar solo: si el backup de anoche salio
 * bien, o que dijo el visor de eventos a las 3 de la manana. El agente las manda con
 * firma (solo cuando cambian) y aca quedan guardadas para verlas sin entrar al servidor.
 */
const upDetalle = db.prepare(`
  INSERT INTO monitorng_detalle (node, tipo, at, recibido, datos)
  VALUES (@node, @tipo, @at, @recibido, @datos)
  ON CONFLICT(node, tipo) DO UPDATE SET
    at = excluded.at, recibido = excluded.recibido, datos = excluded.datos
`);

const MAX_DETALLE = 200000;

export function guardarDetalle(node: string, tipo: "veeam" | "eventos", d: any): void {
  if (!node || !d || typeof d !== "object") return;
  const txt = JSON.stringify(d);
  if (txt.length > MAX_DETALLE) return;
  upDetalle.run({ node, tipo, at: Number(d.at) || Date.now(), recibido: Date.now(), datos: txt });
}

export function getDetalle(node: string, tipo: "veeam" | "eventos"): any | null {
  const r = db.prepare("SELECT * FROM monitorng_detalle WHERE node = ? AND tipo = ?").get(node, tipo) as any;
  if (!r) return null;
  return { at: r.at, recibido: r.recibido, ...jparse<any>(r.datos, {}) };
}

/** Todos los jobs de Veeam de todos los servidores, para una vista global de respaldos. */
export function respaldosDeTodos(): Array<{ node: string; at: number; recibido: number; jobs: any[] }> {
  const rows = db.prepare("SELECT * FROM monitorng_detalle WHERE tipo = 'veeam'").all() as any[];
  return rows.map((r) => {
    const d = jparse<any>(r.datos, {});
    return { node: r.node, at: r.at || 0, recibido: r.recibido || 0, jobs: Array.isArray(d.jobs) ? d.jobs : [] };
  });
}
