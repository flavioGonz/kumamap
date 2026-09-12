"use client";

/**
 * Traps SNMP recibidos.
 *
 * Un trap es el equipo avisando por su cuenta, en el momento exacto en que le
 * pasa algo. Un sondeo cada 30 segundos se pierde un corte de diez; un trap no.
 * Por eso la pantalla está ordenada por hora y lo primero que se ve es la
 * gravedad — y cada aviso se puede abrir para leer qué significa en castellano.
 */

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { apiUrl } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface Varbind { oid: string; tipo: string; valor: string }
interface Trap {
  id: number; ts: number; origen: string; version: string; comunidad: string;
  tipo: string; oid: string; nombre: string; gravedad: "alarma" | "aviso" | "info";
  resumen: string; varbinds: Varbind[];
  /** Equipo del mapa del que vino, cuando la IP se pudo ubicar. */
  nodoId: string | null; mapaId: string | null; etiqueta: string | null; mapa: string | null;
}
interface Resumen {
  total: number; alarmas24h: number; sinUbicar: number;
  origenes: Array<{ origen: string; etiqueta: string | null; mapa: string | null; mapaId: string | null; n: number; ultimo: number }>;
  mapas: Array<{ mapaId: string; mapa: string; n: number }>;
}
interface EstadoIndice { direcciones: number; armadoEn: number }
interface ConfigTraps { comunidades: string[]; abierto: boolean }
interface EstadoReceptor {
  puerto: number; ok: boolean; detalle: string; desde: number;
  comunidades?: string[]; abierto?: boolean;
  rechazados?: number; ultimoRechazo?: string | null; ultimoRechazoEn?: number | null;
}

const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const GRIS = "#8493a8";

const GRAVEDAD: Record<Trap["gravedad"], { t: string; c: string }> = {
  alarma: { t: "alarma", c: ROJO },
  aviso: { t: "aviso", c: AMBAR },
  info: { t: "info", c: GRIS },
};

const RANGOS: Array<{ k: string; t: string; horas: number }> = [
  { k: "1", t: "1 h", horas: 1 },
  { k: "6", t: "6 h", horas: 6 },
  { k: "24", t: "24 h", horas: 24 },
  { k: "168", t: "7 días", horas: 168 },
  { k: "0", t: "Todo", horas: 0 },
];

function reloj(ms: number): string {
  return new Date(ms).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  antena: sv(<><path d="M12 12v8" /><path d="M5 8a7 7 0 0 1 14 0" /><path d="M8.5 10a3.5 3.5 0 0 1 7 0" /><circle cx="12" cy="12" r="1.5" /></>, 22),
  lupa: sv(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, 15),
  chevron: sv(<path d="m9 18 6-6-6-6" />, 14),
  x: sv(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 15),
  tacho: sv(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 14),
};

export default function TrapsPage() {
  const [traps, setTraps] = useState<Trap[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [receptor, setReceptor] = useState<EstadoReceptor | null>(null);
  const [indice, setIndice] = useState<EstadoIndice | null>(null);
  const [config, setConfig] = useState<ConfigTraps | null>(null);
  const [editando, setEditando] = useState(false);
  const [reubicando, setReubicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [envivo, setEnvivo] = useState(true);

  const [rango, setRango] = useState("24");
  const [gravedad, setGravedad] = useState("todas");
  const [origen, setOrigen] = useState("");
  const [mapaId, setMapaId] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const filtroRef = useRef({ rango, gravedad, origen, mapaId });
  filtroRef.current = { rango, gravedad, origen, mapaId };

  const cargar = useCallback(async () => {
    const p = new URLSearchParams();
    const h = RANGOS.find((r) => r.k === rango)?.horas ?? 24;
    if (h > 0) p.set("horas", String(h));
    if (gravedad !== "todas") p.set("gravedad", gravedad);
    if (origen) p.set("origen", origen);
    if (mapaId) p.set("mapaId", mapaId);
    if (q.trim()) p.set("q", q.trim());
    p.set("limite", "500");
    try {
      const r = await fetch(apiUrl(`/api/traps?${p.toString()}`), { credentials: "include" });
      const b = await r.json();
      if (!r.ok) { setError(b?.error || `HTTP ${r.status}`); setCargando(false); return; }
      setTraps(b.traps || []); setResumen(b.resumen || null); setReceptor(b.receptor || null);
      setIndice(b.indice || null);
      setConfig(b.config || null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    }
    setCargando(false);
  }, [rango, gravedad, origen, mapaId, q]);

  useEffect(() => { cargar(); }, [cargar]);

  // Los traps llegan cuando pasan, no cuando uno recarga: el socket los pone arriba.
  useEffect(() => {
    if (!envivo) return;
    const socket = getSocket();
    const nuevo = (t: Trap) => {
      const f = filtroRef.current;
      if (f.gravedad !== "todas" && t.gravedad !== f.gravedad) return;
      if (f.origen && t.origen !== f.origen) return;
      if (f.mapaId && t.mapaId !== f.mapaId) return;
      setTraps((xs) => [t, ...xs].slice(0, 500));
    };
    socket.on("trap:nuevo", nuevo);
    return () => { socket.off("trap:nuevo", nuevo); };
  }, [envivo]);

  const porGravedad = useMemo(() => ({
    alarma: traps.filter((t) => t.gravedad === "alarma").length,
    aviso: traps.filter((t) => t.gravedad === "aviso").length,
    info: traps.filter((t) => t.gravedad === "info").length,
  }), [traps]);

  const hayFiltro = gravedad !== "todas" || !!origen || !!mapaId || !!q.trim();

  const reubicar = async () => {
    setReubicando(true);
    const r = await fetch(apiUrl("/api/traps"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "reubicar" }),
    });
    const b = await r.json().catch(() => null);
    setReubicando(false);
    if (!r.ok) { setError(b?.error || "No se pudo reubicar"); return; }
    cargar();
  };

  const limpiarViejos = async () => {
    if (!window.confirm("¿Borrar los traps de más de 7 días?")) return;
    const r = await fetch(apiUrl("/api/traps?dias=7"), { method: "DELETE", credentials: "include" });
    const b = await r.json().catch(() => null);
    if (!r.ok) { setError(b?.error || "No se pudo borrar"); return; }
    cargar();
  };

  return (
    <div className="trp-envoltura">
      <style>{CSS}</style>

      <header className="trp-cab">
        <div className="trp-logo">{I.antena("#fff")}</div>
        <div style={{ flex: 1, minWidth: 210 }}>
          <h1>Traps SNMP</h1>
          <p>Avisos que los equipos mandan solos cuando les pasa algo. No hay que preguntarles: llegan en el momento exacto del evento.</p>
        </div>
        <div className="trp-kpis">
          <div className="trp-kpi"><b style={{ color: porGravedad.alarma ? ROJO : "var(--foreground)" }}>{porGravedad.alarma}</b><span>alarmas</span></div>
          <div className="trp-kpi"><b style={{ color: porGravedad.aviso ? AMBAR : "var(--foreground)" }}>{porGravedad.aviso}</b><span>avisos</span></div>
          <div className="trp-kpi"><b>{traps.length}</b><span>en pantalla</span></div>
          <div className="trp-kpi"><b>{resumen?.origenes.length ?? 0}</b><span>equipos</span></div>
          <div className="trp-kpi"><b style={{ color: resumen?.sinUbicar ? AMBAR : "var(--foreground)" }}>{resumen?.sinUbicar ?? 0}</b><span>sin ubicar</span></div>
        </div>
      </header>

      {/* estado del receptor: sin esto nadie sabe si hay que abrir un puerto */}
      <div className={"trp-receptor" + (receptor?.ok ? " ok" : " mal")}>
        <span className="trp-punto" style={{ background: receptor?.ok ? VERDE : AMBAR }} />
        {receptor?.ok ? (
          <span>
            Escuchando en <b>{receptor.puerto}/udp</b> desde {reloj(receptor.desde)} · {receptor.detalle}.
            Apuntá los equipos a la IP de este controlador, puerto {receptor.puerto}.
            {receptor.abierto && " Está aceptando cualquier comunidad (TRAP_ANY_COMMUNITY=1)."}
            {(receptor.rechazados ?? 0) > 0 && (
              <>
                {" "}<b style={{ color: AMBAR }}>{receptor.rechazados} paquetes descartados</b>
                {receptor.ultimoRechazo ? ` — el último decía «${receptor.ultimoRechazo}»` : ""}.
                {!receptor.abierto && " Si es un equipo que manda con otra comunidad, agregala a TRAP_COMMUNITIES."}
              </>
            )}
          </span>
        ) : receptor ? (
          <span>El receptor no pudo levantar en <b>{receptor.puerto}/udp</b>: {receptor.detalle}. Por debajo de 1024 hace falta root, o se puede elegir otro puerto con <code>TRAP_PORT</code>.</span>
        ) : (
          <span>Todavía no hay noticias del receptor. Arranca junto con el servidor; si acabás de desplegar, esperá al próximo reinicio.</span>
        )}
      </div>

      {error && <div className="trp-error">{error}</div>}

      {config && (
        <Comunidades
          config={config}
          abierto={editando}
          onAbrir={() => setEditando(!editando)}
          onGuardado={(c) => { setConfig(c); setEditando(false); cargar(); }}
          onError={setError}
        />
      )}

      {(resumen?.sinUbicar ?? 0) > 0 && (
        <div className="trp-sinubicar">
          <span className="trp-punto" style={{ background: AMBAR, marginTop: 5 }} />
          <span style={{ flex: 1 }}>
            <b>{resumen!.sinUbicar} {resumen!.sinUbicar === 1 ? "aviso llegó" : "avisos llegaron"} de una IP
            que no está en ningún mapa.</b> El equipo puede no estar dibujado, o estar monitoreado por un
            nombre que sale a internet por otra dirección. El índice tiene {indice?.direcciones ?? 0}{" "}
            direcciones: las que están cargadas en los nodos, las de los monitores de Kuma y las que se
            resuelven por DNS.
          </span>
          <button className="trp-btn-fantasma" onClick={reubicar} disabled={reubicando}>
            {reubicando ? "Buscando…" : "Volver a ubicar"}
          </button>
        </div>
      )}

      {/* filtros */}
      <div className="trp-filtros">
        <div className="trp-segmentos" role="group" aria-label="Rango">
          {RANGOS.map((r) => (
            <button key={r.k} className={"trp-seg" + (rango === r.k ? " act" : "")} onClick={() => setRango(r.k)}>{r.t}</button>
          ))}
        </div>
        <select className="trp-input trp-select" value={gravedad} onChange={(e) => setGravedad(e.target.value)} aria-label="Gravedad">
          <option value="todas">Toda gravedad</option>
          <option value="alarma">Sólo alarmas</option>
          <option value="aviso">Sólo avisos</option>
          <option value="info">Sólo informativos</option>
        </select>
        <select className="trp-input trp-select" value={mapaId} onChange={(e) => setMapaId(e.target.value)} aria-label="Cliente">
          <option value="">Todos los clientes</option>
          {resumen?.mapas.map((m) => <option key={m.mapaId} value={m.mapaId}>{m.mapa} ({m.n})</option>)}
        </select>
        <select className="trp-input trp-select" value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label="Equipo">
          <option value="">Todos los equipos</option>
          {resumen?.origenes.map((o) => (
            <option key={o.origen} value={o.origen}>{o.etiqueta ? `${o.etiqueta} · ${o.origen}` : o.origen} ({o.n})</option>
          ))}
        </select>
        <div className="trp-buscador">
          {I.lupa("var(--muted-foreground)")}
          <input className="trp-input trp-limpio" placeholder="Buscar por texto, OID o valor…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {hayFiltro && (
          <button className="trp-btn-fantasma" onClick={() => { setGravedad("todas"); setOrigen(""); setMapaId(""); setQ(""); }}>{I.x()} Limpiar</button>
        )}
        <label className="trp-envivo" title="Los traps nuevos aparecen arriba sin recargar">
          <input type="checkbox" checked={envivo} onChange={(e) => setEnvivo(e.target.checked)} />
          <span className={"trp-punto" + (envivo ? " trp-late" : "")} style={{ background: envivo ? VERDE : GRIS }} />
          en vivo
        </label>
      </div>

      <div className="trp-tabla-wrap">
        <table className="trp-tabla">
          <thead>
            <tr>
              <th className="trp-th-p" />
              <th>Hora</th><th>Equipo</th><th>Evento</th><th>Versión</th><th className="trp-th-p" />
            </tr>
          </thead>
          <tbody>
            {traps.map((t) => {
              const g = GRAVEDAD[t.gravedad] || GRAVEDAD.info;
              const ab = abierto === t.id;
              return (
                <Fragment key={t.id}>
                  <tr className="trp-fila" onClick={() => setAbierto(ab ? null : t.id)}
                      tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setAbierto(ab ? null : t.id); }}>
                    <td className="trp-td-p"><span className="trp-punto" style={{ background: g.c }} /></td>
                    <td className="trp-hora" title={reloj(t.ts)}>{reloj(t.ts).slice(6)}<div className="trp-ago">{ago(t.ts)}</div></td>
                    <td>
                      {t.etiqueta ? (
                        <div className="trp-equipo">
                          <a className="trp-enlace-mapa" href={`/map/${t.mapaId}`} onClick={(e) => e.stopPropagation()}
                             title={`Abrir ${t.mapa}`}>{t.etiqueta}</a>
                          <span className="trp-equipo-sub">{t.mapa} · <code>{t.origen}</code></span>
                        </div>
                      ) : (
                        <div className="trp-equipo">
                          <code>{t.origen}</code>
                          <span className="trp-equipo-sub trp-gris">sin ubicar en el mapa</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="trp-evento">
                        <span className="trp-nivel" style={{ color: g.c, borderColor: g.c + "55", background: g.c + "12" }}>{g.t}</span>
                        <span className="trp-nombre">{t.nombre}</span>
                      </div>
                      <div className="trp-resumen">{t.resumen}</div>
                    </td>
                    <td><span className="trp-gris">{t.version}{t.tipo === "inform" ? " · inform" : ""}</span></td>
                    <td className="trp-td-p"><span className={"trp-chevron" + (ab ? " abajo" : "")}>{I.chevron()}</span></td>
                  </tr>
                  {ab && (
                    <tr className="trp-detalle">
                      <td />
                      <td colSpan={5}>
                        <div className="trp-det">
                          <div className="trp-det-datos">
                            <span><em>OID del trap</em> <code>{t.oid || "—"}</code></span>
                            <span><em>comunidad</em> <code>{t.comunidad || "—"}</code></span>
                            <span><em>recibido</em> {reloj(t.ts)}</span>
                            <span><em>origen</em> <code>{t.origen}</code></span>
                            {t.etiqueta && <span><em>equipo</em> {t.etiqueta} <em>en</em> {t.mapa}</span>}
                          </div>
                          {t.varbinds.length > 0 ? (
                            <table className="trp-vb">
                              <thead><tr><th>OID</th><th>Tipo</th><th>Valor</th></tr></thead>
                              <tbody>
                                {t.varbinds.map((v, i) => (
                                  <tr key={i}><td><code>{v.oid}</code></td><td className="trp-gris">{v.tipo}</td><td>{v.valor || <span className="trp-gris">—</span>}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <p className="trp-nota">El aviso llegó sin variables adjuntas.</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {cargando && <tr><td colSpan={6}><span className="trp-gris">Cargando…</span></td></tr>}
            {!cargando && traps.length === 0 && (
              <tr><td colSpan={6}>
                <div className="trp-vacio">
                  <strong>Todavía no llegó ningún trap{hayFiltro ? " con ese filtro" : ""}.</strong>
                  {!hayFiltro && (
                    <p>
                      En el equipo hay que configurar el destino de traps: la IP de este controlador,
                      puerto <b>{receptor?.puerto ?? 162}</b>, comunidad <code>public</code> (o la que pongas en <code>TRAP_COMMUNITIES</code>).
                      En un MikroTik es <code>/snmp set trap-target=… trap-community=public</code>; en una UPS APC, «SNMP Trap Receivers».
                      Si el controlador está detrás de un NAT o firewall, hay que dejar pasar ese puerto UDP.
                    </p>
                  )}
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="trp-pie">
        <span className="trp-nota">
          Se guardan los últimos 5.000 avisos. {resumen ? `${resumen.total} en la base, ${resumen.alarmas24h} alarmas en las últimas 24 h.` : ""}
        </span>
        <button className="trp-btn-fantasma" onClick={limpiarViejos}>{I.tacho()} Borrar los de más de 7 días</button>
      </div>
    </div>
  );
}

/* ───────────────────────────────── comunidades ── */

/**
 * Quién puede mandarnos avisos. Vive en la base, no en el `.env`: cambiarlo no
 * puede exigir entrar por SSH y reiniciar. El receptor mira la configuración cada
 * diez segundos, así que el cambio entra solo.
 */
function Comunidades({ config, abierto, onAbrir, onGuardado, onError }: {
  config: ConfigTraps; abierto: boolean;
  onAbrir: () => void; onGuardado: (c: ConfigTraps) => void; onError: (e: string | null) => void;
}) {
  const [lista, setLista] = useState<string[]>(config.comunidades);
  const [suelta, setSuelta] = useState(false);
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setLista(config.comunidades); setSuelta(config.abierto); }, [config]);

  const agregar = () => {
    const c = nueva.trim();
    if (!c) return;
    if (lista.includes(c)) { setNueva(""); return; }
    setLista([...lista, c]);
    setNueva("");
  };

  const guardar = async () => {
    setGuardando(true);
    onError(null);
    const r = await fetch(apiUrl("/api/traps"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "comunidades", comunidades: lista, abierto: suelta }),
    });
    const b = await r.json().catch(() => null);
    setGuardando(false);
    if (!r.ok) { onError(b?.error || "No se pudo guardar"); return; }
    onGuardado(b.config);
  };

  const cambio =
    suelta !== config.abierto ||
    lista.length !== config.comunidades.length ||
    lista.some((c, i) => c !== config.comunidades[i]);

  return (
    <div className="trp-comunidades">
      <div className="trp-com-cab">
        <span className="trp-com-titulo">Comunidades aceptadas</span>
        <div className="trp-chips">
          {config.abierto
            ? <span className="trp-nivel" style={{ color: AMBAR, borderColor: AMBAR + "66", background: AMBAR + "14" }}>cualquiera</span>
            : config.comunidades.map((c) => <code key={c} className="trp-com-chip">{c}</code>)}
        </div>
        <div style={{ flex: 1 }} />
        <button className="trp-btn-fantasma" onClick={onAbrir}>{abierto ? "Cerrar" : "Editar"}</button>
      </div>

      {abierto && (
        <div className="trp-com-editor">
          <div className="trp-chips">
            {lista.map((c) => (
              <span key={c} className="trp-com-chip trp-com-quitar">
                {c}
                <button onClick={() => setLista(lista.filter((x) => x !== c))} title={`Quitar ${c}`}>{I.x()}</button>
              </span>
            ))}
            {lista.length === 0 && <span className="trp-gris" style={{ fontSize: 12 }}>ninguna</span>}
          </div>

          <div className="trp-com-alta">
            <input className="trp-input" placeholder="comunidad nueva" value={nueva} maxLength={64}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }} />
            <button className="trp-btn-fantasma" onClick={agregar} disabled={!nueva.trim()}>Agregar</button>
          </div>

          <label className="trp-envivo" style={{ gap: 8 }}>
            <input type="checkbox" checked={suelta} onChange={(e) => setSuelta(e.target.checked)} />
            <span>Aceptar cualquier comunidad</span>
          </label>
          <p className="trp-nota" style={{ margin: 0 }}>
            Dejarlo abierto sirve para descubrir qué manda un equipo nuevo: el aviso entra igual y
            la pantalla muestra con qué comunidad llegó. Para el día a día conviene cerrarlo —
            y lo que se descarte queda contado arriba, con el motivo, así no se pierde en silencio.
          </p>

          <div className="trp-com-pie">
            <button className="trp-btn-primario" onClick={guardar} disabled={!cambio || guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <span className="trp-nota" style={{ margin: 0 }}>
              Se aplica solo, en unos segundos. No hace falta reiniciar nada.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.trp-envoltura{max-width:1200px;margin:0 auto;padding:26px 20px 70px;color:var(--foreground)}
.trp-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.trp-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${AZUL},#0f3f9e);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${AZUL}45;flex:none}
.trp-cab h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px}
.trp-cab p{color:var(--muted-foreground);margin:3px 0 0;font-size:13px;max-width:62ch}
.trp-kpis{display:flex;gap:8px;flex-wrap:wrap}
.trp-kpi{text-align:center;padding:7px 14px;border-radius:10px;background:var(--surface-card);border:1px solid var(--border);min-width:74px}
.trp-kpi b{display:block;font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.trp-kpi span{font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.5px}

.trp-receptor{display:flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:11px;padding:9px 13px;font-size:12.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px}
.trp-receptor.ok{border-color:${VERDE}44;background:${VERDE}0c}
.trp-receptor.mal{border-color:${AMBAR}44;background:${AMBAR}0c}
.trp-receptor code{font-size:11.5px;background:var(--surface-elevated);padding:1px 5px;border-radius:4px}
.trp-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:9px;margin-bottom:12px;font-size:13px}

.trp-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.trp-segmentos{display:flex;background:var(--surface-elevated);border:1px solid var(--border);border-radius:9px;padding:2px;gap:2px}
.trp-seg{background:transparent;border:none;color:var(--muted-foreground);font:inherit;font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:7px;cursor:pointer;white-space:nowrap}
.trp-seg:hover{color:var(--text-secondary)}
.trp-seg.act{background:var(--card);color:${AZUL_CLARO};box-shadow:0 1px 3px rgba(0,0,0,.14)}
.trp-buscador{display:flex;align-items:center;gap:7px;flex:1;min-width:200px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:0 11px}
.trp-buscador:focus-within{border-color:${AZUL_CLARO};box-shadow:0 0 0 3px ${AZUL}22}
.trp-input{background:var(--card);border:1px solid var(--border);color:var(--foreground);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;outline:none}
.trp-limpio{flex:1;min-width:0;border:none!important;background:transparent!important;box-shadow:none!important;padding-left:0}
.trp-select{cursor:pointer;max-width:210px}
.trp-envivo{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted-foreground);cursor:pointer;user-select:none}
.trp-late{animation:trplate 1.8s infinite}
@keyframes trplate{0%,100%{opacity:1}50%{opacity:.3}}

.trp-tabla-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card)}
.trp-tabla{width:100%;min-width:820px;border-collapse:collapse;font-size:13px}
.trp-tabla th{text-align:left;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
.trp-tabla td{padding:9px 12px;border-top:1px solid var(--border);vertical-align:top}
.trp-th-p,.trp-td-p{width:26px;padding-left:10px!important;padding-right:0!important;text-align:center}
.trp-fila{cursor:pointer;outline:none}
.trp-fila:hover,.trp-fila:focus-visible{background:var(--surface-hover)}
.trp-punto{width:8px;height:8px;border-radius:99px;display:inline-block;flex:none;margin-top:4px}
.trp-hora{white-space:nowrap;font-variant-numeric:tabular-nums;font-size:12.5px}
.trp-ago{font-size:10.5px;color:var(--muted-foreground)}
.trp-evento{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.trp-nivel{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;border:1px solid;border-radius:5px;padding:1px 6px}
.trp-nombre{font-weight:600;font-size:13px}
.trp-resumen{font-size:12px;color:var(--muted-foreground);line-height:1.5;margin-top:3px;max-width:72ch}
.trp-gris{color:var(--muted-foreground)}
.trp-comunidades{border:1px solid var(--border);border-radius:11px;background:var(--surface-card);margin-bottom:12px;overflow:hidden}
.trp-com-cab{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 13px}
.trp-com-titulo{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);white-space:nowrap}
.trp-com-chip{display:inline-flex;align-items:center;gap:5px;font-family:ui-monospace,monospace;font-size:11.5px;border:1px solid var(--border);background:var(--card);border-radius:6px;padding:2px 7px}
.trp-com-quitar button{display:inline-flex;background:none;border:none;color:var(--muted-foreground);cursor:pointer;padding:0;margin-left:1px}
.trp-com-quitar button:hover{color:${ROJO}}
.trp-com-editor{display:flex;flex-direction:column;gap:10px;padding:0 13px 13px;border-top:1px solid var(--border);padding-top:12px}
.trp-com-alta{display:flex;gap:7px;align-items:center}
.trp-com-alta .trp-input{max-width:240px}
.trp-com-pie{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.trp-btn-primario{display:inline-flex;align-items:center;gap:7px;background:${AZUL};color:#fff;border:none;border-radius:9px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.trp-btn-primario:hover:not(:disabled){background:#1550bd}
.trp-btn-primario:disabled{opacity:.5;cursor:default}
.trp-sinubicar{display:flex;align-items:flex-start;gap:9px;border:1px solid ${AMBAR}55;background:${AMBAR}0e;border-radius:11px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:var(--text-secondary)}
.trp-equipo{display:flex;flex-direction:column;gap:1px;min-width:150px}
.trp-equipo-sub{font-size:10.5px;color:var(--muted-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}
.trp-enlace-mapa{font-weight:600;font-size:13px;color:inherit;text-decoration:none;border-bottom:1px dotted var(--muted-foreground)}
.trp-enlace-mapa:hover{color:${AZUL_CLARO};border-bottom-color:${AZUL_CLARO}}
.trp-chevron{display:inline-flex;color:var(--muted-foreground);opacity:.5}
.trp-chevron.abajo{transform:rotate(90deg)}
.trp-detalle td{background:var(--surface-card);border-top:none}
.trp-det{display:flex;flex-direction:column;gap:9px;padding:2px 0 6px}
.trp-det-datos{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:12px}
.trp-det-datos em{font-style:normal;color:var(--muted-foreground);margin-right:5px}
.trp-vb{width:100%;border-collapse:collapse;font-size:11.5px;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.trp-vb th{padding:6px 9px;font-size:10px;background:var(--surface-elevated);border-bottom:1px solid var(--border)}
.trp-vb td{padding:5px 9px;border-top:1px solid var(--border);vertical-align:middle;overflow-wrap:anywhere}
.trp-vacio{padding:22px 8px;text-align:center}
.trp-vacio strong{display:block;font-size:13.5px;margin-bottom:6px}
.trp-vacio p{font-size:12.5px;color:var(--muted-foreground);line-height:1.65;margin:0 auto;max-width:70ch}
.trp-vacio code{background:var(--surface-elevated);padding:1px 5px;border-radius:4px;font-size:11.5px}
.trp-pie{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px}
.trp-nota{font-size:12.5px;color:var(--muted-foreground);line-height:1.6;margin:0}
.trp-btn-fantasma{display:inline-flex;align-items:center;gap:6px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:9px;padding:7px 12px;font:inherit;font-size:12.5px;cursor:pointer}
.trp-btn-fantasma:hover{background:var(--surface-elevated);border-color:var(--muted-foreground)}
@media (prefers-reduced-motion:reduce){.trp-late{animation:none}}
`;
