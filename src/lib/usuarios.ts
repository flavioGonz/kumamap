/**
 * Usuarios de KumaMap.
 *
 * Hasta ahora la aplicación tenía un solo usuario, el de las variables de entorno
 * KUMA_USER / KUMA_PASS. Esto agrega una tabla propia sin sacar esa puerta: si la
 * tabla queda vacía —o si alguien se borra a sí mismo— el usuario del entorno
 * sigue entrando. Es la válvula de escape para no quedarse afuera del sistema.
 *
 * Las claves se guardan con scrypt, que viene en Node: no hace falta dependencia
 * nueva y es el algoritmo que la propia documentación de Node recomienda para esto.
 */
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

export type Rol = "admin" | "operador" | "lector";

export const ROLES: Record<Rol, { nombre: string; puede: string }> = {
  admin: { nombre: "Administrador", puede: "Todo, incluido crear y borrar usuarios." },
  operador: { nombre: "Operador", puede: "Edita mapas, adopta servidores y deja encargos. No toca usuarios." },
  lector: { nombre: "Lector", puede: "Mira mapas y paneles. No modifica nada." },
};

export interface Usuario {
  usuario: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  creado: number;
  ultimoAcceso: number | null;
  creadoPor: string;
}

// El tipo del handle lo deja en any a proposito: las tipificaciones de
// better-sqlite3 usan export = y el namespace no viaja con el import por defecto.
let db: any = null;

function conn(): any {
  if (db) return db;
  const ruta = path.join(process.cwd(), "data", "kumamap.db");
  db = new Database(ruta);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      usuario      TEXT PRIMARY KEY,
      nombre       TEXT NOT NULL DEFAULT '',
      clave        TEXT NOT NULL,
      rol          TEXT NOT NULL DEFAULT 'lector',
      activo       INTEGER NOT NULL DEFAULT 1,
      creado       INTEGER NOT NULL,
      ultimoAcceso INTEGER,
      creadoPor    TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}

/* ───────────────────────────────────────────── claves ── */

const N = 16384, R = 8, P = 1;

export function hashear(clave: string): string {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(clave, sal, 64, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, R, P, sal.toString("base64"), h.toString("base64")].join("$");
}

function verificarHash(clave: string, guardado: string): boolean {
  try {
    const p = guardado.split("$");
    if (p.length !== 6 || p[0] !== "scrypt") return false;
    const sal = Buffer.from(p[4], "base64");
    const esperado = Buffer.from(p[5], "base64");
    const h = crypto.scryptSync(clave, sal, esperado.length,
      { N: Number(p[1]), r: Number(p[2]), p: Number(p[3]), maxmem: 64 * 1024 * 1024 });
    return h.length === esperado.length && crypto.timingSafeEqual(h, esperado);
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────── validación ── */

/** Un nombre de usuario tiene que poder escribirse sin pensar: minúsculas y punto. */
export function validarUsuario(u: string): string | null {
  if (!u || u.length < 3) return "El usuario necesita al menos 3 caracteres.";
  if (u.length > 32) return "El usuario no puede pasar de 32 caracteres.";
  if (!/^[a-z0-9._-]+$/.test(u)) return "Sólo minúsculas, números, punto, guion y guion bajo.";
  return null;
}

export function validarClave(c: string): string | null {
  if (!c || c.length < 8) return "La contraseña necesita al menos 8 caracteres.";
  if (c.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

function esRol(r: any): r is Rol {
  return r === "admin" || r === "operador" || r === "lector";
}

/* ─────────────────────────────────────────── consultas ── */

function aUsuario(f: any): Usuario {
  return {
    usuario: f.usuario, nombre: f.nombre || "", rol: esRol(f.rol) ? f.rol : "lector",
    activo: !!f.activo, creado: f.creado, ultimoAcceso: f.ultimoAcceso ?? null,
    creadoPor: f.creadoPor || "",
  };
}

export function listarUsuarios(): Usuario[] {
  return conn().prepare(
    "SELECT usuario, nombre, rol, activo, creado, ultimoAcceso, creadoPor FROM usuarios ORDER BY usuario"
  ).all().map(aUsuario);
}

export function getUsuario(usuario: string): Usuario | null {
  const f: any = conn().prepare(
    "SELECT usuario, nombre, rol, activo, creado, ultimoAcceso, creadoPor FROM usuarios WHERE usuario = ?"
  ).get(usuario);
  return f ? aUsuario(f) : null;
}

export function hayUsuarios(): boolean {
  const f: any = conn().prepare("SELECT COUNT(*) n FROM usuarios").get();
  return (f?.n || 0) > 0;
}

function adminsActivos(excepto?: string): number {
  const f: any = conn().prepare(
    "SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND usuario <> ?"
  ).get(excepto || "");
  return f?.n || 0;
}

/* ──────────────────────────────────────────── escritura ── */

export function crearUsuario(datos: {
  usuario: string; clave: string; nombre?: string; rol?: Rol; creadoPor?: string;
}): Usuario {
  const usuario = String(datos.usuario || "").trim().toLowerCase();
  const eU = validarUsuario(usuario); if (eU) throw new Error(eU);
  const eC = validarClave(datos.clave); if (eC) throw new Error(eC);
  if (getUsuario(usuario)) throw new Error("Ya existe un usuario con ese nombre.");
  const rol: Rol = esRol(datos.rol) ? datos.rol : "lector";
  conn().prepare(
    "INSERT INTO usuarios (usuario, nombre, clave, rol, activo, creado, creadoPor) VALUES (?,?,?,?,1,?,?)"
  ).run(usuario, String(datos.nombre || "").slice(0, 80), hashear(datos.clave), rol, Date.now(), datos.creadoPor || "");
  return getUsuario(usuario)!;
}

export function editarUsuario(usuario: string, cambios: { nombre?: string; rol?: Rol; activo?: boolean }): Usuario {
  const u = getUsuario(usuario);
  if (!u) throw new Error("No existe ese usuario.");
  const rol: Rol = esRol(cambios.rol) ? cambios.rol : u.rol;
  const activo = cambios.activo === undefined ? u.activo : !!cambios.activo;
  // El sistema no se queda sin administrador: es la forma de no quedar afuera.
  if ((u.rol === "admin" && rol !== "admin") || (u.activo && !activo)) {
    if (u.rol === "admin" && adminsActivos(usuario) === 0) {
      throw new Error("Es el único administrador activo. Nombrá otro antes de cambiarlo.");
    }
  }
  conn().prepare("UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE usuario = ?")
    .run(cambios.nombre === undefined ? u.nombre : String(cambios.nombre).slice(0, 80), rol, activo ? 1 : 0, usuario);
  return getUsuario(usuario)!;
}

export function cambiarClave(usuario: string, clave: string): void {
  if (!getUsuario(usuario)) throw new Error("No existe ese usuario.");
  const e = validarClave(clave); if (e) throw new Error(e);
  conn().prepare("UPDATE usuarios SET clave = ? WHERE usuario = ?").run(hashear(clave), usuario);
}

export function borrarUsuario(usuario: string): void {
  const u = getUsuario(usuario);
  if (!u) throw new Error("No existe ese usuario.");
  if (u.rol === "admin" && u.activo && adminsActivos(usuario) === 0) {
    throw new Error("Es el único administrador activo. No se puede borrar.");
  }
  conn().prepare("DELETE FROM usuarios WHERE usuario = ?").run(usuario);
}

/* ────────────────────────────────────────────── entrada ── */

export interface Credencial { usuario: string; rol: Rol; origen: "tabla" | "entorno" }

/**
 * Verifica usuario y clave. Primero la tabla; si no hay coincidencia, el usuario
 * del entorno. Ese último no se puede borrar desde la interfaz: es la llave de
 * repuesto del sistema.
 */
export function verificarCredenciales(usuario: string, clave: string): Credencial | null {
  const u = String(usuario || "").trim().toLowerCase();

  const f: any = conn().prepare("SELECT usuario, clave, rol, activo FROM usuarios WHERE usuario = ?").get(u);
  if (f) {
    if (!f.activo) return null;
    if (!verificarHash(clave, f.clave)) return null;
    conn().prepare("UPDATE usuarios SET ultimoAcceso = ? WHERE usuario = ?").run(Date.now(), u);
    return { usuario: f.usuario, rol: esRol(f.rol) ? f.rol : "lector", origen: "tabla" };
  }

  const envU = (process.env.KUMA_USER || "").trim();
  const envP = process.env.KUMA_PASS || "";
  if (envU && envP && usuario === envU && clave === envP) {
    return { usuario: envU, rol: "admin", origen: "entorno" };
  }
  return null;
}

/** El usuario del entorno, para mostrarlo en la lista aunque no esté en la tabla. */
export function usuarioDeEntorno(): string {
  return (process.env.KUMA_USER || "").trim();
}
