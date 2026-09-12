"use client";

/**
 * Usuarios de KumaMap.
 *
 * La regla que ordena la pantalla: nadie se queda afuera del sistema. Por eso
 * el usuario del entorno aparece en la lista aunque no esté en la tabla (no se
 * puede borrar, es la llave de repuesto), no se puede sacar el último
 * administrador activo, y uno no puede desactivarse ni borrarse a sí mismo.
 */

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/api";

type Rol = "admin" | "operador" | "lector";

interface Usuario {
  usuario: string; nombre: string; rol: Rol; activo: boolean;
  creado: number; ultimoAcceso: number | null; creadoPor: string;
}

const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const GRIS = "#8493a8";

const ROL_TXT: Record<Rol, { t: string; c: string; puede: string }> = {
  admin: { t: "Administrador", c: AZUL_CLARO, puede: "Todo, incluido crear y borrar usuarios." },
  operador: { t: "Operador", c: VERDE, puede: "Edita mapas, adopta servidores y deja encargos. No toca usuarios." },
  lector: { t: "Lector", c: GRIS, puede: "Mira mapas y paneles. No modifica nada." },
};

function reloj(ms?: number | null): string {
  if (!ms) return "nunca";
  return new Date(ms).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function ago(ms?: number | null): string {
  if (!ms) return "nunca";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  gente: sv(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, 22),
  mas: sv(<><path d="M12 5v14" /><path d="M5 12h14" /></>, 15),
  llave: sv(<><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>, 14),
  lapiz: sv(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>, 14),
  tacho: sv(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 14),
  ojo: sv(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>, 14),
  x: sv(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 15),
  escudo: sv(<><path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.6 3.8 17 5 19 5a1 1 0 0 1 1 1z" /></>, 14),
};

export default function UsuariosPage() {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [entorno, setEntorno] = useState("");
  const [yo, setYo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [prohibido, setProhibido] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [clavePara, setClavePara] = useState<Usuario | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(apiUrl("/api/usuarios"), { credentials: "include" });
    if (r.status === 403) { setProhibido(true); setCargando(false); return; }
    const b = await r.json().catch(() => null);
    if (!r.ok) { setError(b?.error || `HTTP ${r.status}`); setCargando(false); return; }
    setLista(b.usuarios || []); setEntorno(b.entorno || ""); setYo(b.yo || "");
    setError(null); setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const mandar = useCallback(async (cuerpo: any, exito: string) => {
    setError(null);
    const r = await fetch(apiUrl("/api/usuarios"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const b = await r.json().catch(() => null);
    if (!r.ok) { setError(b?.error || `HTTP ${r.status}`); return false; }
    setAviso(exito);
    setTimeout(() => setAviso(null), 3500);
    await cargar();
    return true;
  }, [cargar]);

  if (prohibido) {
    return (
      <div className="usr-envoltura">
        <style>{CSS}</style>
        <div className="usr-card usr-vacio">
          {I.escudo(GRIS)}
          <h2>Esta sección es de administradores</h2>
          <p>Tu cuenta puede usar la aplicación, pero no administrar usuarios. Pedile a un administrador que te cambie el rol si lo necesitás.</p>
        </div>
      </div>
    );
  }

  const admins = lista.filter((u) => u.rol === "admin" && u.activo).length;

  return (
    <div className="usr-envoltura">
      <style>{CSS}</style>

      <header className="usr-cab">
        <div className="usr-logo">{I.gente("#fff")}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>Usuarios</h1>
          <p>Quién puede entrar a KumaMap y con qué alcance. Las contraseñas se guardan con scrypt; nadie, ni acá, puede volver a verlas.</p>
        </div>
        <button className="usr-btn-primario" onClick={() => setNuevo(true)}>{I.mas("#fff")} Nuevo usuario</button>
      </header>

      {error && <div className="usr-error">{error}</div>}
      {aviso && <div className="usr-ok">{aviso}</div>}

      <div className="usr-tabla-wrap">
        <table className="usr-tabla">
          <thead>
            <tr>
              <th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th>
              <th>Último acceso</th><th>Creado</th><th className="usr-th-acc">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => {
              const r = ROL_TXT[u.rol];
              const soyYo = u.usuario === yo;
              return (
                <tr key={u.usuario} className={u.activo ? "" : "usr-inactivo"}>
                  <td>
                    <div className="usr-nom">
                      <code>{u.usuario}</code>
                      {soyYo && <span className="usr-tag">vos</span>}
                    </div>
                  </td>
                  <td>{u.nombre || <span className="usr-gris">—</span>}</td>
                  <td>
                    <span className="usr-pill" style={{ color: r.c, borderColor: r.c + "55", background: r.c + "12" }} title={r.puede}>
                      {r.t}
                    </span>
                  </td>
                  <td>
                    <span className="usr-pill" style={u.activo
                      ? { color: VERDE, borderColor: VERDE + "55", background: VERDE + "12" }
                      : { color: AMBAR, borderColor: AMBAR + "55", background: AMBAR + "12" }}>
                      {u.activo ? "activo" : "desactivado"}
                    </span>
                  </td>
                  <td title={reloj(u.ultimoAcceso)}>{ago(u.ultimoAcceso)}</td>
                  <td title={u.creadoPor ? `creado por ${u.creadoPor}` : undefined}>{reloj(u.creado)}</td>
                  <td className="usr-acciones">
                    <button className="usr-btn-fantasma" onClick={() => setEditando(u)} title="Editar">{I.lapiz()}</button>
                    <button className="usr-btn-fantasma" onClick={() => setClavePara(u)} title="Cambiar contraseña">{I.llave()}</button>
                    <button className="usr-btn-fantasma usr-peligro" disabled={soyYo}
                      title={soyYo ? "No podés borrar tu propia cuenta" : "Borrar"}
                      onClick={() => { if (window.confirm(`¿Borrar al usuario "${u.usuario}"?\n\nNo se puede deshacer.`)) mandar({ accion: "borrar", usuario: u.usuario }, `Se borró ${u.usuario}.`); }}>
                      {I.tacho()}
                    </button>
                  </td>
                </tr>
              );
            })}

            {entorno && !lista.some((u) => u.usuario === entorno) && (
              <tr className="usr-entorno">
                <td><div className="usr-nom"><code>{entorno}</code><span className="usr-tag usr-tag-azul">del entorno</span></div></td>
                <td><span className="usr-gris">llave de repuesto</span></td>
                <td><span className="usr-pill" style={{ color: AZUL_CLARO, borderColor: AZUL_CLARO + "55", background: AZUL_CLARO + "12" }}>Administrador</span></td>
                <td><span className="usr-pill" style={{ color: VERDE, borderColor: VERDE + "55", background: VERDE + "12" }}>activo</span></td>
                <td colSpan={3}><span className="usr-gris">Vive en <code>.env</code> (KUMA_USER / KUMA_PASS). No se administra desde acá: es lo que te deja entrar si la tabla queda vacía.</span></td>
              </tr>
            )}

            {cargando && <tr><td colSpan={7}><span className="usr-gris">Cargando…</span></td></tr>}
            {!cargando && lista.length === 0 && (
              <tr><td colSpan={7}><span className="usr-gris">Todavía no creaste ningún usuario propio. Hasta que lo hagas, se entra con el del entorno.</span></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="usr-roles">
        {(Object.keys(ROL_TXT) as Rol[]).map((k) => (
          <div key={k} className="usr-rol">
            <span className="usr-pill" style={{ color: ROL_TXT[k].c, borderColor: ROL_TXT[k].c + "55", background: ROL_TXT[k].c + "12" }}>{ROL_TXT[k].t}</span>
            <p>{ROL_TXT[k].puede}</p>
          </div>
        ))}
      </div>
      <p className="usr-nota">
        Hay {admins} administrador{admins === 1 ? "" : "es"} activo{admins === 1 ? "" : "s"} en la tabla.
        El sistema no deja quedarse sin ninguno: si es el último, no se puede desactivar, borrar ni bajarle el rol.
      </p>

      {nuevo && <Dialogo titulo="Nuevo usuario" onCerrar={() => setNuevo(false)}
        onGuardar={async (d) => { const ok = await mandar({ accion: "crear", ...d }, `Se creó ${d.usuario}.`); if (ok) setNuevo(false); }} />}

      {editando && <Dialogo titulo={`Editar ${editando.usuario}`} inicial={editando} soloEditar onCerrar={() => setEditando(null)}
        onGuardar={async (d) => { const ok = await mandar({ accion: "editar", usuario: editando.usuario, nombre: d.nombre, rol: d.rol, activo: d.activo }, `Se actualizó ${editando.usuario}.`); if (ok) setEditando(null); }} />}

      {clavePara && <DialogoClave usuario={clavePara.usuario} onCerrar={() => setClavePara(null)}
        onGuardar={async (clave) => { const ok = await mandar({ accion: "clave", usuario: clavePara.usuario, clave }, `Contraseña cambiada para ${clavePara.usuario}.`); if (ok) setClavePara(null); }} />}
    </div>
  );
}

/* ───────────────────────────────────────────── diálogos ── */

function Dialogo({ titulo, inicial, soloEditar, onCerrar, onGuardar }: {
  titulo: string; inicial?: Usuario; soloEditar?: boolean;
  onCerrar: () => void; onGuardar: (d: any) => void;
}) {
  const [usuario, setUsuario] = useState(inicial?.usuario || "");
  const [nombre, setNombre] = useState(inicial?.nombre || "");
  const [rol, setRol] = useState<Rol>(inicial?.rol || "lector");
  const [activo, setActivo] = useState(inicial ? inicial.activo : true);
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  return (
    <div className="usr-velo" onClick={onCerrar}>
      <div className="usr-dialogo" onClick={(e) => e.stopPropagation()}>
        <header><h2>{titulo}</h2><button className="usr-btn-fantasma" onClick={onCerrar}>{I.x()}</button></header>
        <div className="usr-campos">
          <label>
            <span>Usuario</span>
            <input className="usr-input" value={usuario} disabled={soloEditar} autoFocus={!soloEditar}
              onChange={(e) => setUsuario(e.target.value.toLowerCase())} placeholder="jperez" />
            {!soloEditar && <small>Minúsculas, números, punto, guion y guion bajo. Al menos 3 caracteres.</small>}
          </label>
          <label>
            <span>Nombre</span>
            <input className="usr-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" />
          </label>
          {!soloEditar && (
            <label>
              <span>Contraseña</span>
              <div className="usr-clave">
                <input className="usr-input" type={ver ? "text" : "password"} value={clave}
                  onChange={(e) => setClave(e.target.value)} placeholder="al menos 8 caracteres" />
                <button className="usr-btn-fantasma" type="button" onClick={() => setVer(!ver)} title={ver ? "Ocultar" : "Ver"}>{I.ojo()}</button>
              </div>
            </label>
          )}
          <label>
            <span>Rol</span>
            <select className="usr-input" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
              <option value="lector">Lector</option>
            </select>
            <small>{ROL_TXT[rol].puede}</small>
          </label>
          {soloEditar && (
            <label className="usr-check">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              <span>Cuenta activa</span>
              <small>Desactivar no borra nada: la cuenta deja de poder entrar y se puede volver a activar.</small>
            </label>
          )}
        </div>
        <footer>
          <button className="usr-btn-fantasma" onClick={onCerrar}>Cancelar</button>
          <button className="usr-btn-primario" onClick={() => onGuardar({ usuario, nombre, rol, activo, clave })}>Guardar</button>
        </footer>
      </div>
    </div>
  );
}

function DialogoClave({ usuario, onCerrar, onGuardar }: { usuario: string; onCerrar: () => void; onGuardar: (c: string) => void }) {
  const [clave, setClave] = useState("");
  const [otra, setOtra] = useState("");
  const [ver, setVer] = useState(false);
  const distintas = clave.length > 0 && otra.length > 0 && clave !== otra;

  return (
    <div className="usr-velo" onClick={onCerrar}>
      <div className="usr-dialogo" onClick={(e) => e.stopPropagation()}>
        <header><h2>Contraseña de {usuario}</h2><button className="usr-btn-fantasma" onClick={onCerrar}>{I.x()}</button></header>
        <div className="usr-campos">
          <label>
            <span>Contraseña nueva</span>
            <div className="usr-clave">
              <input className="usr-input" type={ver ? "text" : "password"} value={clave} autoFocus
                onChange={(e) => setClave(e.target.value)} placeholder="al menos 8 caracteres" />
              <button className="usr-btn-fantasma" type="button" onClick={() => setVer(!ver)}>{I.ojo()}</button>
            </div>
          </label>
          <label>
            <span>Repetir</span>
            <input className="usr-input" type={ver ? "text" : "password"} value={otra} onChange={(e) => setOtra(e.target.value)} />
            {distintas && <small style={{ color: ROJO }}>No coinciden.</small>}
          </label>
          <p className="usr-nota">La sesión que ya tenga abierta ese usuario sigue valiendo hasta que expire; si querés cortarla ya, desactivá la cuenta y volvé a activarla.</p>
        </div>
        <footer>
          <button className="usr-btn-fantasma" onClick={onCerrar}>Cancelar</button>
          <button className="usr-btn-primario" disabled={!clave || distintas} onClick={() => onGuardar(clave)}>Cambiar</button>
        </footer>
      </div>
    </div>
  );
}

const CSS = `
.usr-envoltura{max-width:1080px;margin:0 auto;padding:26px 20px 70px;color:var(--foreground)}
.usr-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.usr-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${AZUL},#0f3f9e);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${AZUL}45;flex:none}
.usr-cab h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px}
.usr-cab p{color:var(--muted-foreground);margin:3px 0 0;font-size:13px;max-width:64ch}
.usr-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:9px;margin-bottom:14px;font-size:13px}
.usr-ok{background:rgba(22,163,74,.12);border:1px solid ${VERDE};color:#4ade80;padding:10px 14px;border-radius:9px;margin-bottom:14px;font-size:13px}
.usr-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px}
.usr-vacio{text-align:center;padding:44px 20px;display:flex;flex-direction:column;align-items:center;gap:8px}
.usr-vacio h2{font-size:16px;margin:6px 0 0}
.usr-vacio p{color:var(--muted-foreground);font-size:13px;margin:0;max-width:52ch}

.usr-tabla-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card)}
.usr-tabla{width:100%;min-width:820px;border-collapse:collapse;font-size:13px}
.usr-tabla th{text-align:left;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);padding:10px 14px;border-bottom:1px solid var(--border);white-space:nowrap}
.usr-tabla td{padding:11px 14px;border-top:1px solid var(--border);vertical-align:middle}
.usr-tabla tbody tr:first-child td{border-top:none}
.usr-tabla tbody tr:hover{background:var(--surface-hover)}
.usr-inactivo td{opacity:.55}
.usr-entorno td{background:${AZUL}08}
.usr-nom{display:flex;align-items:center;gap:7px}
.usr-nom code{font-family:ui-monospace,monospace;font-size:13px;font-weight:600}
.usr-tag{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;border:1px solid var(--border);border-radius:5px;padding:1px 5px;color:var(--muted-foreground)}
.usr-tag-azul{border-color:${AZUL}55;color:${AZUL_CLARO};background:${AZUL}12}
.usr-pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;border:1px solid var(--border);border-radius:99px;padding:3px 10px;white-space:nowrap}
.usr-gris{color:var(--muted-foreground)}
.usr-th-acc,.usr-acciones{text-align:right;white-space:nowrap}
.usr-acciones{display:flex;gap:5px;justify-content:flex-end}

.usr-roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:16px}
.usr-rol{border:1px solid var(--border);border-radius:11px;padding:11px 13px;background:var(--card)}
.usr-rol p{margin:7px 0 0;font-size:12.5px;color:var(--muted-foreground);line-height:1.5}
.usr-nota{font-size:12.5px;color:var(--muted-foreground);line-height:1.6;margin:12px 0 0;max-width:74ch}

.usr-velo{position:fixed;inset:0;background:rgba(4,10,22,.55);backdrop-filter:blur(2px);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px}
.usr-dialogo{width:min(460px,100%);background:var(--background);border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;max-height:90vh}
.usr-dialogo header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px;border-bottom:1px solid var(--border)}
.usr-dialogo header h2{font-size:15.5px;font-weight:700;margin:0}
.usr-dialogo footer{display:flex;gap:8px;justify-content:flex-end;padding:13px 18px;border-top:1px solid var(--border);background:var(--surface-card)}
.usr-campos{padding:18px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
.usr-campos label{display:flex;flex-direction:column;gap:5px}
.usr-campos label>span{font-size:11px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.6px}
.usr-campos small{font-size:11.5px;color:var(--muted-foreground);line-height:1.5}
.usr-check{flex-direction:row!important;align-items:center;flex-wrap:wrap;gap:8px!important}
.usr-check>span{font-size:13px!important;text-transform:none!important;letter-spacing:0!important;color:var(--foreground)!important}
.usr-check small{flex-basis:100%}
.usr-clave{display:flex;gap:6px}
.usr-clave .usr-input{flex:1;min-width:0}
.usr-input{background:var(--card);border:1px solid var(--border);color:var(--foreground);border-radius:9px;padding:9px 11px;font:inherit;font-size:13.5px;outline:none;width:100%}
.usr-input:focus{border-color:${AZUL_CLARO};box-shadow:0 0 0 3px ${AZUL}22}
.usr-input:disabled{opacity:.6}

.usr-btn-primario{display:inline-flex;align-items:center;gap:7px;background:${AZUL};color:#fff;border:none;border-radius:9px;padding:9px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;justify-content:center}
.usr-btn-primario:hover:not(:disabled){background:#1550bd}
.usr-btn-primario:disabled{opacity:.5;cursor:default}
.usr-btn-fantasma{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:34px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font:inherit;font-size:12.5px;cursor:pointer}
.usr-btn-fantasma:hover:not(:disabled){background:var(--surface-elevated);border-color:var(--muted-foreground)}
.usr-btn-fantasma:disabled{opacity:.4;cursor:default}
.usr-peligro{color:#f87171}
.usr-peligro:hover:not(:disabled){background:rgba(239,68,68,.1)!important;border-color:#7f1d1d!important}
`;
