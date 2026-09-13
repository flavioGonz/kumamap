"use client";

/**
 * A quién le llega cada aviso.
 *
 * Antes esta pantalla no existía porque no hacía falta: el push iba a todos los
 * dispositivos suscriptos, sin distinción. Con treinta clientes eso significa que
 * el técnico de uno se entera de las caídas de los otros veintinueve, y el aviso
 * que sí le toca se pierde entre los que no.
 *
 * Acá se ve cada dispositivo registrado y se elige qué clientes sigue. Vacío =
 * todos, que es el comportamiento de siempre para quien mira la red entera.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";

interface Destino {
  id: number; destino: string; etiqueta: string; usuario: string;
  mapas: string[]; activo: boolean; creado: number;
  ultimoEnvio: number | null; fallos: number;
}
interface Cliente { id: string; nombre: string; monitores: number }

const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const GRIS = "#8493a8";

const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  campana: sv(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>, 22),
  probar: sv(<><path d="m22 2-7 20-4-9-9-4z" /></>, 14),
  tacho: sv(<><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /></>, 14),
  chevron: sv(<path d="m9 18 6-6-6-6" />, 14),
  alerta: sv(<><path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /><path d="M12 9v4M12 17h.01" /></>, 14),
  ok: sv(<path d="M20 6 9 17l-5-5" />, 14),
};

function haceCuanto(ts: number | null): string {
  if (!ts) return "nunca";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

/** Un endpoint no le dice nada a nadie; su origen, sí. */
function origen(endpoint: string): string {
  try {
    const h = new URL(endpoint).hostname;
    if (h.includes("google")) return "Chrome / Android";
    if (h.includes("mozilla")) return "Firefox";
    if (h.includes("apple") || h.includes("push.apple")) return "Safari / iPhone";
    if (h.includes("windows") || h.includes("microsoft")) return "Edge / Windows";
    return h;
  } catch { return "desconocido"; }
}

export default function AvisosPage() {
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vapid, setVapid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/avisos"), { credentials: "include" });
      const b = await r.json();
      if (!r.ok) { setError(b?.error || `HTTP ${r.status}`); setCargando(false); return; }
      setDestinos(b.destinos || []); setClientes(b.clientes || []); setVapid(!!b.vapid);
      setError(null);
    } catch (e: any) { setError(e?.message || "Error de red"); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (id: number, cambios: Partial<{ mapas: string[]; etiqueta: string; activo: boolean }>) => {
    setOcupado(id);
    setDestinos((p) => p.map((d) => (d.id === id ? { ...d, ...cambios } as Destino : d)));
    await fetch(apiUrl("/api/avisos"), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...cambios }),
    });
    setOcupado(null);
  };

  const probar = async (id: number) => {
    setOcupado(id); setNota(null);
    try {
      const r = await fetch(apiUrl("/api/avisos"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const b = await r.json();
      setNota(r.ok ? "Aviso de prueba enviado." : (b?.error || "No se pudo enviar."));
    } catch (e: any) { setNota(e?.message || "Error de red"); }
    setOcupado(null);
    await cargar();
  };

  const borrar = async (d: Destino) => {
    if (!confirm(`¿Dar de baja "${d.etiqueta || origen(d.destino)}"?\n\nDeja de recibir avisos hasta que vuelva a suscribirse desde ese navegador.`)) return;
    await fetch(apiUrl(`/api/avisos?id=${d.id}`), { method: "DELETE", credentials: "include" });
    await cargar();
  };

  const alternarMapa = (d: Destino, mapaId: string) => {
    const nuevos = d.mapas.includes(mapaId) ? d.mapas.filter((m) => m !== mapaId) : [...d.mapas, mapaId];
    guardar(d.id, { mapas: nuevos });
  };

  const activos = destinos.filter((d) => d.activo);
  const conFiltro = destinos.filter((d) => d.mapas.length > 0);
  const totalMonitores = useMemo(() => clientes.reduce((a, c) => a + c.monitores, 0), [clientes]);

  return (
    <div className="av-envoltura">
      <style>{CSS}</style>

      <header className="av-cab">
        <div className="av-logo">{I.campana("#fff")}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>Avisos</h1>
          <p>
            Qué dispositivo recibe las caídas de qué cliente. Un dispositivo sin clientes
            elegidos los recibe todos — que es lo que corresponde para quien mira la red
            entera, y lo que recibían todos hasta ahora.
          </p>
        </div>
        <div className="av-kpis">
          <div className="av-kpi"><b>{activos.length}</b><span>Dispositivos</span></div>
          <div className="av-kpi"><b>{conFiltro.length}</b><span>Con filtro</span></div>
          <div className="av-kpi"><b>{clientes.length}</b><span>Clientes</span></div>
        </div>
      </header>

      {error && <div className="av-error">{error}</div>}
      {nota && <div className="av-nota-envio">{I.ok(VERDE)} {nota}</div>}

      {!vapid && (
        <div className="av-aviso">
          <span style={{ color: AMBAR, display: "inline-flex", marginTop: 2 }}>{I.alerta(AMBAR)}</span>
          <span>
            <b>Falta la clave VAPID en el entorno.</b> Sin <code>VAPID_PUBLIC_KEY</code> y
            <code> VAPID_PRIVATE_KEY</code> no se puede mandar ninguna notificación, por más
            dispositivos que estén registrados.
          </span>
        </div>
      )}

      {cargando ? (
        <p className="av-gris">Cargando…</p>
      ) : destinos.length === 0 ? (
        <div className="av-vacio">
          <p><b>Todavía no hay ningún dispositivo suscripto.</b></p>
          <p>
            Se registran desde el móvil, activando las notificaciones. Hasta que haya al
            menos uno, ninguna caída avisa a nadie — el sistema las detecta y las guarda,
            pero no las empuja a ningún lado.
          </p>
        </div>
      ) : (
        <div className="av-lista">
          {destinos.map((d) => {
            const todos = d.mapas.length === 0;
            return (
              <div key={d.id} className={`av-item${d.activo ? "" : " apagado"}`}>
                <div className="av-item-cab">
                  <button className={`av-chevron${abierto === d.id ? " abajo" : ""}`}
                          onClick={() => setAbierto(abierto === d.id ? null : d.id)}
                          aria-label="Ver clientes">{I.chevron(GRIS)}</button>
                  <span className="av-punto" style={{ background: d.activo ? VERDE : GRIS }} />
                  <div className="av-item-nom">
                    <input className="av-input av-nombre" value={d.etiqueta}
                           placeholder={origen(d.destino)}
                           onChange={(e) => setDestinos((p) => p.map((x) => x.id === d.id ? { ...x, etiqueta: e.target.value } : x))}
                           onBlur={(e) => guardar(d.id, { etiqueta: e.target.value })} />
                    <span className="av-sub">
                      {origen(d.destino)}
                      {d.usuario && <> · {d.usuario}</>}
                      {" · último aviso "}{haceCuanto(d.ultimoEnvio)}
                      {d.fallos > 0 && <span className="av-fallos"> · {d.fallos} fallo{d.fallos === 1 ? "" : "s"}</span>}
                    </span>
                  </div>
                  <span className={`av-etq${todos ? " av-etq-todos" : ""}`}>
                    {todos ? "todos los clientes" : `${d.mapas.length} cliente${d.mapas.length === 1 ? "" : "s"}`}
                  </span>
                  <div className="av-acc">
                    <button className="av-btn" onClick={() => probar(d.id)} disabled={ocupado === d.id}>
                      {I.probar()} Probar
                    </button>
                    <button className="av-btn" onClick={() => guardar(d.id, { activo: !d.activo })} disabled={ocupado === d.id}>
                      {d.activo ? "Silenciar" : "Activar"}
                    </button>
                    <button className="av-btn av-peligro" onClick={() => borrar(d)} title="Dar de baja">{I.tacho()}</button>
                  </div>
                </div>

                {abierto === d.id && (
                  <div className="av-clientes">
                    <div className="av-clientes-cab">
                      <span>Clientes que sigue este dispositivo</span>
                      <button className="av-btn av-chico" onClick={() => guardar(d.id, { mapas: [] })}>
                        Todos
                      </button>
                    </div>
                    <div className="av-chips">
                      {clientes.map((c) => (
                        <button key={c.id}
                                className={`av-chip${d.mapas.includes(c.id) ? " act" : ""}`}
                                onClick={() => alternarMapa(d, c.id)}
                                title={`${c.monitores} monitores`}>
                          {c.nombre} <small>{c.monitores}</small>
                        </button>
                      ))}
                    </div>
                    <p className="av-nota">
                      {todos
                        ? `Sin ninguno elegido recibe los ${totalMonitores} monitores de los ${clientes.length} clientes.`
                        : "Un monitor que está en varios mapas avisa si alguno de ellos está elegido."}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="av-pie">
        Los avisos de caída salen una sola vez por evento, aunque el sistema lo detecte por
        dos caminos distintos. Salir de una ventana de mantenimiento no cuenta como
        recuperación: el servicio no falló, lo bajamos nosotros.
      </p>
    </div>
  );
}

const CSS = `
.av-envoltura{max-width:1180px;margin:0 auto;padding:26px 20px 70px;color:var(--foreground)}
.av-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.av-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${AZUL},#0f3f9e);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${AZUL}45;flex:none}
.av-cab h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px}
.av-cab p{color:var(--muted-foreground);margin:3px 0 0;font-size:13px;max-width:72ch;line-height:1.55}
.av-kpis{display:flex;gap:8px;flex-wrap:wrap}
.av-kpi{text-align:center;padding:7px 15px;border-radius:10px;background:var(--surface-card);border:1px solid var(--border);min-width:88px}
.av-kpi b{display:block;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.av-kpi span{font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.5px}
.av-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:9px;margin-bottom:12px;font-size:13px}
.av-nota-envio{display:flex;align-items:center;gap:8px;border:1px solid ${VERDE}55;background:${VERDE}0e;border-radius:10px;padding:9px 13px;margin-bottom:12px;font-size:13px;color:var(--text-secondary)}
.av-aviso{display:flex;align-items:flex-start;gap:9px;border:1px solid ${AMBAR}55;background:${AMBAR}0e;border-radius:11px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:var(--text-secondary)}
.av-aviso code{font-size:11.5px;background:rgba(255,255,255,.06);padding:1px 5px;border-radius:4px}
.av-gris{color:var(--muted-foreground)}

.av-vacio{border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--muted-foreground);font-size:13px;line-height:1.6}
.av-vacio p{margin:0 0 6px;max-width:64ch;margin-inline:auto}
.av-vacio b{color:var(--foreground)}

.av-lista{display:flex;flex-direction:column;gap:9px}
.av-item{border:1px solid var(--border);border-radius:13px;background:var(--card);overflow:hidden}
.av-item.apagado{opacity:.6}
.av-item-cab{display:flex;align-items:center;gap:10px;padding:10px 13px;flex-wrap:wrap}
.av-chevron{background:transparent;border:none;display:inline-flex;color:var(--muted-foreground);cursor:pointer;padding:2px;transition:transform .14s}
.av-chevron.abajo{transform:rotate(90deg)}
.av-punto{width:8px;height:8px;border-radius:99px;flex:none}
.av-item-nom{flex:1;min-width:180px;display:flex;flex-direction:column;gap:1px}
.av-input{background:var(--surface-card);border:1px solid transparent;color:var(--foreground);border-radius:7px;padding:3px 7px;font:inherit;font-size:13.5px;font-weight:600;outline:none;width:100%;max-width:280px}
.av-input:hover{border-color:var(--border)}
.av-input:focus{border-color:${AZUL_CLARO};background:var(--card)}
.av-sub{font-size:11px;color:var(--muted-foreground);padding-left:7px}
.av-fallos{color:${AMBAR}}
.av-etq{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${AZUL_CLARO};border:1px solid ${AZUL}55;background:${AZUL}12;border-radius:5px;padding:2px 8px;white-space:nowrap}
.av-etq-todos{color:var(--muted-foreground);border-color:var(--border);background:transparent}
.av-acc{display:flex;gap:5px;flex:none}
.av-btn{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);color:var(--foreground);font:inherit;font-size:12px;font-weight:600;padding:5px 10px;border-radius:8px;cursor:pointer;white-space:nowrap}
.av-btn:hover{background:var(--surface-hover)}
.av-btn:disabled{opacity:.55;cursor:default}
.av-chico{font-size:11.5px;padding:4px 9px}
.av-peligro:hover{background:${ROJO}1a;border-color:${ROJO}66;color:#f87171}

.av-clientes{border-top:1px solid var(--border);padding:11px 13px 13px}
.av-clientes-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground)}
.av-chips{display:flex;gap:5px;flex-wrap:wrap}
.av-chip{background:var(--surface-card);border:1px solid var(--border);color:var(--text-secondary);font:inherit;font-size:12px;padding:4px 10px;border-radius:99px;cursor:pointer;white-space:nowrap}
.av-chip small{opacity:.5;margin-left:4px;font-variant-numeric:tabular-nums}
.av-chip:hover{background:var(--surface-hover)}
.av-chip.act{background:${AZUL};border-color:${AZUL};color:#fff;font-weight:600}
.av-chip.act small{opacity:.7}
.av-nota{font-size:11.5px;color:var(--muted-foreground);margin:8px 0 0;line-height:1.55}
.av-pie{color:var(--muted-foreground);font-size:12px;line-height:1.6;max-width:86ch;margin-top:16px}

@media(max-width:640px){
  .av-envoltura{padding:18px 14px 60px}
  .av-kpis{width:100%}
  .av-kpi{flex:1}
  .av-acc{width:100%;justify-content:flex-end}
}
`;
