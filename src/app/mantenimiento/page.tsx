"use client";

/**
 * Ventanas de mantenimiento.
 *
 * El problema que resuelve: una intervención programada —cambiar un switch,
 * cortar la fibra para una obra, reiniciar un servidor— se veía igual que una
 * caída. Notificaba a todo el mundo y bajaba el SLA del cliente como si el
 * servicio hubiera fallado.
 *
 * Con una ventana abierta, Uptime Kuma marca esos latidos como mantenimiento:
 * no los cuenta ni como arriba ni como abajo, y las alertas quedan calladas.
 * El corte sigue quedando registrado, pero como lo que fue.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";

interface MonitorRef { id: number; nombre: string; tipo: string }
interface MapaRef { id: string; nombre: string; monitores: MonitorRef[] }
interface Ventana {
  id: number; titulo: string; descripcion: string; estrategia: string;
  activa: boolean; inicio: string | null; fin: string | null;
  horaInicio: string | null; horaFin: string | null; diasSemana: number[];
  cron: string | null; zona: string; monitores: number[];
  estado: "activa" | "programada" | "terminada" | "pausada";
  nombresMonitores: string[];
}

const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const VIOLETA = "#8b5cf6";      // el mismo que el mapa usa para MAINT
const GRIS = "#8493a8";

const DIAS = [
  { n: 1, t: "Lun" }, { n: 2, t: "Mar" }, { n: 3, t: "Mié" }, { n: 4, t: "Jue" },
  { n: 5, t: "Vie" }, { n: 6, t: "Sáb" }, { n: 0, t: "Dom" },
];

const COLOR_ESTADO: Record<Ventana["estado"], string> = {
  activa: VIOLETA, programada: AZUL_CLARO, terminada: GRIS, pausada: AMBAR,
};
const TEXTO_ESTADO: Record<Ventana["estado"], string> = {
  activa: "En mantenimiento", programada: "Programada", terminada: "Terminada", pausada: "Pausada",
};

const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  llave: sv(<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>, 22),
  mas: sv(<><path d="M12 5v14M5 12h14" /></>, 15),
  x: sv(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 15),
  pausa: sv(<><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>, 14),
  play: sv(<path d="m6 3 14 9-14 9z" />, 14),
  tacho: sv(<><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /></>, 14),
  reloj: sv(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 14),
  lupa: sv(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, 15),
  mapa: sv(<><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z" /><path d="M9 3v15M15 6v15" /></>, 14),
};

type Tipo = "manual" | "single" | "recurring-weekday";

/** "2026-09-13 02:00:00" → "13/09 02:00" */
function fmtFecha(s: string | null): string {
  if (!s) return "—";
  const [f, h] = s.split(" ");
  const [, m, d] = f.split("-");
  return `${d}/${m} ${(h || "").slice(0, 5)}`;
}
function fmtHora(s: string | null): string { return s ? s.slice(0, 5) : "—"; }

/** Valor para <input type="datetime-local"> con N minutos de corrimiento. */
function enLocal(min: number, ahora: string): string {
  const base = new Date(ahora.replace(" ", "T") + "Z").getTime() + min * 60000;
  return new Date(base).toISOString().slice(0, 16);
}

function cuando(v: Ventana): string {
  if (v.estrategia === "manual") return "Abierta — hasta cerrarla a mano";
  if (v.estrategia === "single") return `${fmtFecha(v.inicio)} → ${fmtFecha(v.fin)}`;
  if (v.estrategia === "recurring-weekday") {
    const ds = DIAS.filter((d) => v.diasSemana.includes(d.n)).map((d) => d.t).join(" ");
    return `${ds || "—"} · ${fmtHora(v.horaInicio)}–${fmtHora(v.horaFin)}`;
  }
  return v.cron || v.estrategia;
}

/* ───────────────────────────────────── selector de monitores ── */

function Selector({
  mapas, sueltos, elegidos, alternar, alternarMapa,
}: {
  mapas: MapaRef[]; sueltos: MonitorRef[];
  elegidos: Set<number>;
  alternar: (id: number) => void;
  alternarMapa: (ids: number[], poner: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const filtro = q.trim().toLowerCase();
  const coincide = (m: MonitorRef) => !filtro || m.nombre.toLowerCase().includes(filtro);

  const grupos = useMemo(() => {
    const g = mapas
      .map((m) => ({ ...m, monitores: m.monitores.filter(coincide) }))
      .filter((m) => m.monitores.length > 0);
    const s = sueltos.filter(coincide);
    if (s.length) g.push({ id: "__sueltos", nombre: "Sin mapa", monitores: s });
    return g;
  }, [mapas, sueltos, filtro]);

  return (
    <div className="mn-sel">
      <div className="mn-buscador">
        {I.lupa(GRIS)}
        <input className="mn-input mn-limpio" placeholder="Buscar monitor o cliente…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="mn-btn mn-mini" onClick={() => setQ("")} aria-label="Limpiar">{I.x()}</button>}
      </div>

      <div className="mn-grupos">
        {grupos.length === 0 && <p className="mn-gris">Nada coincide con la búsqueda.</p>}
        {grupos.map((g) => {
          const ids = g.monitores.map((m) => m.id);
          const todos = ids.every((id) => elegidos.has(id));
          return (
            <div key={g.id} className="mn-grupo">
              <div className="mn-grupo-cab">
                <span className="mn-grupo-nom">{I.mapa(GRIS)} {g.nombre}</span>
                <button type="button" className="mn-btn mn-chico"
                        onClick={() => alternarMapa(ids, !todos)}>
                  {todos ? "Quitar todos" : "Todos"}
                </button>
              </div>
              <div className="mn-chips">
                {g.monitores.map((m) => (
                  <button type="button" key={m.id}
                          className={`mn-chip${elegidos.has(m.id) ? " act" : ""}`}
                          onClick={() => alternar(m.id)}>
                    {m.nombre}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── página ── */

export default function MantenimientoPage() {
  const [ventanas, setVentanas] = useState<Ventana[]>([]);
  const [mapas, setMapas] = useState<MapaRef[]>([]);
  const [sueltos, setSueltos] = useState<MonitorRef[]>([]);
  const [zona, setZona] = useState("");
  const [ahora, setAhora] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [abrirAlta, setAbrirAlta] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("manual");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [horaInicio, setHoraInicio] = useState("02:00");
  const [horaFin, setHoraFin] = useState("04:00");
  const [diasSemana, setDiasSemana] = useState<number[]>([0]);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [avisoAlta, setAvisoAlta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/kuma/mantenimiento"), { credentials: "include" });
      const b = await r.json();
      if (!r.ok) { setError(b?.error || `HTTP ${r.status}`); setCargando(false); return; }
      setVentanas(b.ventanas || []); setMapas(b.mapas || []); setSueltos(b.sueltos || []);
      setZona(b.zona || ""); setAhora(b.ahora || "");
      setError(null);
    } catch (e: any) { setError(e?.message || "Error de red"); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  useEffect(() => {
    if (abrirAlta && ahora && !inicio) {
      setInicio(enLocal(10, ahora));
      setFin(enLocal(130, ahora));
    }
  }, [abrirAlta, ahora, inicio]);

  const alternar = (id: number) => setElegidos((p) => {
    const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const alternarMapa = (ids: number[], poner: boolean) => setElegidos((p) => {
    const s = new Set(p);
    for (const id of ids) poner ? s.add(id) : s.delete(id);
    return s;
  });

  const limpiar = () => {
    setTitulo(""); setDescripcion(""); setElegidos(new Set());
    setInicio(""); setFin(""); setAvisoAlta(null);
  };

  const crear = async () => {
    setAvisoAlta(null);
    if (elegidos.size === 0) { setAvisoAlta("Elegí al menos un monitor."); return; }
    setGuardando(true);
    try {
      const r = await fetch(apiUrl("/api/kuma/mantenimiento"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo || "Mantenimiento", descripcion, tipo,
          inicio: tipo === "manual" ? null : inicio,
          fin: tipo === "single" ? fin : null,
          horaInicio, horaFin, diasSemana,
          monitores: [...elegidos],
        }),
      });
      const b = await r.json();
      if (!r.ok) { setAvisoAlta(b?.error || `HTTP ${r.status}`); setGuardando(false); return; }
      limpiar(); setAbrirAlta(false); await cargar();
    } catch (e: any) { setAvisoAlta(e?.message || "Error de red"); }
    setGuardando(false);
  };

  const accion = async (id: number, accion: "pausar" | "reanudar") => {
    await fetch(apiUrl("/api/kuma/mantenimiento"), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, accion }),
    });
    await cargar();
  };

  const borrar = async (v: Ventana) => {
    if (!confirm(`¿Borrar la ventana "${v.titulo}"?\n\nLos monitores vuelven a contar en el SLA desde este momento.`)) return;
    await fetch(apiUrl(`/api/kuma/mantenimiento?id=${v.id}`), { method: "DELETE", credentials: "include" });
    await cargar();
  };

  const activas = ventanas.filter((v) => v.estado === "activa");
  const programadas = ventanas.filter((v) => v.estado === "programada");
  const enMant = new Set(activas.flatMap((v) => v.monitores));
  const totalMonitores = mapas.reduce((a, m) => a + m.monitores.length, 0) + sueltos.length;

  return (
    <div className="mn-envoltura">
      <style>{CSS}</style>

      <header className="mn-cab">
        <div className="mn-logo">{I.llave("#fff")}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>Ventanas de mantenimiento</h1>
          <p>
            Mientras una ventana corre, Uptime Kuma marca esos monitores como <b>en
            mantenimiento</b>: no avisa por push ni por WhatsApp y esos minutos no
            cuentan como caída en la disponibilidad del cliente.
            {zona && <> Las horas son de <b>{zona}</b>.</>}
          </p>
        </div>
        <div className="mn-kpis">
          <div className="mn-kpi"><b style={{ color: activas.length ? VIOLETA : undefined }}>{activas.length}</b><span>Activas</span></div>
          <div className="mn-kpi"><b>{programadas.length}</b><span>Programadas</span></div>
          <div className="mn-kpi"><b>{enMant.size}<small>/{totalMonitores}</small></b><span>Monitores</span></div>
        </div>
      </header>

      {error && <div className="mn-error">{error}</div>}

      <div className="mn-acciones">
        <button className="mn-btn mn-primario" onClick={() => setAbrirAlta((v) => !v)}>
          {abrirAlta ? I.x("#fff") : I.mas("#fff")} {abrirAlta ? "Cancelar" : "Nueva ventana"}
        </button>
        {ahora && <span className="mn-gris mn-ahora">{I.reloj(GRIS)} {ahora.slice(11, 16)} · {ahora.slice(0, 10)}</span>}
      </div>

      {abrirAlta && (
        <section className="mn-alta">
          <div className="mn-tipos">
            {([
              ["manual", "Ahora", "Empieza ya y sigue hasta que la cierres"],
              ["single", "Programada", "Una ventana con fecha y hora de inicio y fin"],
              ["recurring-weekday", "Semanal", "Se repite los días que elijas, en una franja horaria"],
            ] as Array<[Tipo, string, string]>).map(([k, t, d]) => (
              <button key={k} type="button" className={`mn-tipo${tipo === k ? " act" : ""}`} onClick={() => setTipo(k)}>
                <b>{t}</b><span>{d}</span>
              </button>
            ))}
          </div>

          <div className="mn-campos">
            <label className="mn-campo" style={{ flex: "2 1 260px" }}>
              <span>Título</span>
              <input className="mn-input" value={titulo} maxLength={150}
                     placeholder="Cambio de switch en el rack principal"
                     onChange={(e) => setTitulo(e.target.value)} />
            </label>
            <label className="mn-campo" style={{ flex: "3 1 320px" }}>
              <span>Detalle (opcional)</span>
              <input className="mn-input" value={descripcion} maxLength={500}
                     placeholder="Quién, para qué, número de orden…"
                     onChange={(e) => setDescripcion(e.target.value)} />
            </label>
          </div>

          {tipo === "single" && (
            <div className="mn-campos">
              <label className="mn-campo"><span>Inicio</span>
                <input className="mn-input" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
              <label className="mn-campo"><span>Fin</span>
                <input className="mn-input" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
            </div>
          )}

          {tipo === "recurring-weekday" && (
            <>
              <div className="mn-campos">
                <label className="mn-campo"><span>Desde</span>
                  <input className="mn-input" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
                <label className="mn-campo"><span>Hora de inicio</span>
                  <input className="mn-input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></label>
                <label className="mn-campo"><span>Hora de fin</span>
                  <input className="mn-input" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></label>
              </div>
              <div className="mn-dias">
                {DIAS.map((d) => (
                  <button type="button" key={d.n}
                          className={`mn-chip${diasSemana.includes(d.n) ? " act" : ""}`}
                          onClick={() => setDiasSemana((p) => p.includes(d.n) ? p.filter((x) => x !== d.n) : [...p, d.n])}>
                    {d.t}
                  </button>
                ))}
              </div>
            </>
          )}

          {tipo === "manual" && (
            <p className="mn-nota">
              Sin fechas: arranca al guardarla y no termina sola. Es lo que se usa cuando
              ya se está trabajando en el sitio — al terminar, se pausa o se borra.
            </p>
          )}

          <div className="mn-campo-sel">
            <span>Monitores alcanzados {elegidos.size > 0 && <b className="mn-cuenta">{elegidos.size}</b>}</span>
            <Selector mapas={mapas} sueltos={sueltos} elegidos={elegidos}
                      alternar={alternar} alternarMapa={alternarMapa} />
          </div>

          {avisoAlta && <div className="mn-error">{avisoAlta}</div>}

          <div className="mn-pie-alta">
            <button className="mn-btn mn-primario" onClick={crear} disabled={guardando}>
              {guardando ? "Guardando…" : "Crear ventana"}
            </button>
            <button className="mn-btn" onClick={() => { limpiar(); setAbrirAlta(false); }}>Cancelar</button>
          </div>
        </section>
      )}

      {cargando ? (
        <p className="mn-gris">Cargando…</p>
      ) : ventanas.length === 0 ? (
        <div className="mn-vacio">
          <p><b>No hay ninguna ventana.</b></p>
          <p>
            Hasta que exista una, cada intervención programada entra al reporte como
            una caída del servicio y le baja el SLA al cliente.
          </p>
        </div>
      ) : (
        <div className="mn-tabla-wrap">
          <table className="mn-tabla">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Estado</th>
                <th>Ventana</th>
                <th style={{ width: 210 }}>Cuándo</th>
                <th>Monitores</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {ventanas.map((v) => (
                <tr key={v.id} className={v.estado === "activa" ? "mn-act" : undefined}>
                  <td>
                    <span className="mn-estado" style={{ color: COLOR_ESTADO[v.estado], borderColor: `${COLOR_ESTADO[v.estado]}55`, background: `${COLOR_ESTADO[v.estado]}14` }}>
                      <span className="mn-punto" style={{ background: COLOR_ESTADO[v.estado] }} />
                      {TEXTO_ESTADO[v.estado]}
                    </span>
                  </td>
                  <td>
                    <div className="mn-titulo">{v.titulo}</div>
                    {v.descripcion && <div className="mn-desc">{v.descripcion}</div>}
                  </td>
                  <td className="mn-num">{cuando(v)}</td>
                  <td>
                    <div className="mn-lista-mon">
                      {v.nombresMonitores.slice(0, 4).map((n, i) => (
                        <span className="mn-etq" key={i}>{n}</span>
                      ))}
                      {v.nombresMonitores.length > 4 && (
                        <span className="mn-etq mn-gris" title={v.nombresMonitores.join(", ")}>
                          +{v.nombresMonitores.length - 4}
                        </span>
                      )}
                      {v.nombresMonitores.length === 0 && <span className="mn-gris">sin monitores</span>}
                    </div>
                  </td>
                  <td>
                    <div className="mn-fila-acc">
                      {v.activa
                        ? <button className="mn-btn mn-chico" onClick={() => accion(v.id, "pausar")} title="Pausar: los monitores vuelven a contar">{I.pausa()} Pausar</button>
                        : <button className="mn-btn mn-chico" onClick={() => accion(v.id, "reanudar")} title="Reanudar">{I.play()} Reanudar</button>}
                      <button className="mn-btn mn-chico mn-peligro" onClick={() => borrar(v)} title="Borrar">{I.tacho()}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = `
.mn-envoltura{max-width:1240px;margin:0 auto;padding:26px 20px 70px;color:var(--foreground)}
.mn-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.mn-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${VIOLETA},#5b2fb5);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${VIOLETA}45;flex:none}
.mn-cab h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px}
.mn-cab p{color:var(--muted-foreground);margin:3px 0 0;font-size:13px;max-width:70ch;line-height:1.55}
.mn-kpis{display:flex;gap:8px;flex-wrap:wrap}
.mn-kpi{text-align:center;padding:7px 15px;border-radius:10px;background:var(--surface-card);border:1px solid var(--border);min-width:86px}
.mn-kpi b{display:block;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.mn-kpi b small{font-size:11px;opacity:.55;margin-left:1px}
.mn-kpi span{font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.5px}
.mn-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:9px;margin:10px 0;font-size:13px;line-height:1.55}
.mn-gris{color:var(--muted-foreground)}

.mn-acciones{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.mn-ahora{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-variant-numeric:tabular-nums}
.mn-btn{display:inline-flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--border);color:var(--foreground);font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:9px;cursor:pointer;white-space:nowrap}
.mn-btn:hover{background:var(--surface-hover)}
.mn-btn:disabled{opacity:.55;cursor:default}
.mn-primario{background:${AZUL};border-color:${AZUL};color:#fff}
.mn-primario:hover{background:${AZUL_CLARO}}
.mn-chico{font-size:12px;padding:5px 9px;font-weight:600}
.mn-mini{padding:3px 6px;border:none;background:transparent}
.mn-peligro:hover{background:${ROJO}1a;border-color:${ROJO}66;color:#f87171}

.mn-alta{border:1px solid var(--border);border-radius:14px;background:var(--card);padding:16px;margin-bottom:18px}
.mn-tipos{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.mn-tipo{flex:1 1 210px;text-align:left;background:var(--surface-card);border:1px solid var(--border);border-radius:11px;padding:10px 13px;cursor:pointer;font:inherit;color:var(--foreground)}
.mn-tipo:hover{background:var(--surface-hover)}
.mn-tipo.act{border-color:${AZUL_CLARO};background:${AZUL}14;box-shadow:0 0 0 3px ${AZUL}18}
.mn-tipo b{display:block;font-size:13.5px;font-weight:700;margin-bottom:2px}
.mn-tipo span{font-size:11.5px;color:var(--muted-foreground);line-height:1.45;display:block}

.mn-campos{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.mn-campo{display:flex;flex-direction:column;gap:5px;flex:1 1 190px;min-width:0}
.mn-campo>span,.mn-campo-sel>span{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground)}
.mn-input{background:var(--surface-card);border:1px solid var(--border);color:var(--foreground);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;outline:none;width:100%}
.mn-input:focus{border-color:${AZUL_CLARO};box-shadow:0 0 0 3px ${AZUL}22}
.mn-limpio{border:none!important;background:transparent!important;box-shadow:none!important;padding-left:0}
.mn-dias{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.mn-nota{font-size:12.5px;color:var(--muted-foreground);line-height:1.55;margin:0 0 12px;max-width:70ch}

.mn-campo-sel{display:flex;flex-direction:column;gap:7px;margin-bottom:12px}
.mn-cuenta{display:inline-block;margin-left:6px;background:${AZUL};color:#fff;border-radius:99px;padding:0 7px;font-size:10.5px;font-variant-numeric:tabular-nums}
.mn-sel{border:1px solid var(--border);border-radius:11px;background:var(--surface-card);padding:10px}
.mn-buscador{display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:0 8px 0 11px;margin-bottom:9px;max-width:360px}
.mn-grupos{max-height:290px;overflow-y:auto;display:flex;flex-direction:column;gap:11px}
.mn-grupo-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px}
.mn-grupo-nom{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px}
.mn-chips{display:flex;gap:5px;flex-wrap:wrap}
.mn-chip{background:var(--card);border:1px solid var(--border);color:var(--text-secondary);font:inherit;font-size:12px;padding:4px 10px;border-radius:99px;cursor:pointer;white-space:nowrap}
.mn-chip:hover{background:var(--surface-hover)}
.mn-chip.act{background:${AZUL};border-color:${AZUL};color:#fff;font-weight:600}
.mn-pie-alta{display:flex;gap:8px;flex-wrap:wrap}

.mn-vacio{border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--muted-foreground);font-size:13px;line-height:1.6}
.mn-vacio p{margin:0 0 6px;max-width:62ch;margin-inline:auto}
.mn-vacio b{color:var(--foreground)}

.mn-tabla-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card)}
.mn-tabla{width:100%;min-width:860px;border-collapse:collapse;font-size:13px}
.mn-tabla thead th{text-align:left;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
.mn-tabla td{padding:10px 12px;border-top:1px solid var(--border);vertical-align:middle}
.mn-act{background:${VIOLETA}0d;box-shadow:inset 3px 0 0 ${VIOLETA}}
.mn-estado{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid;white-space:nowrap}
.mn-punto{width:7px;height:7px;border-radius:99px;display:inline-block;flex:none}
.mn-titulo{font-weight:600}
.mn-desc{font-size:11.5px;color:var(--muted-foreground);margin-top:2px;max-width:42ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mn-num{font-variant-numeric:tabular-nums;color:var(--text-secondary);white-space:nowrap}
.mn-lista-mon{display:flex;gap:4px;flex-wrap:wrap;max-width:360px}
.mn-etq{font-size:11px;color:var(--text-secondary);border:1px solid var(--border);border-radius:5px;padding:1px 6px;white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis}
.mn-fila-acc{display:flex;gap:5px;justify-content:flex-end}

@media(max-width:640px){
  .mn-envoltura{padding:18px 14px 60px}
  .mn-kpis{width:100%}
  .mn-kpi{flex:1}
}
`;
