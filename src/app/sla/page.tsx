"use client";

/**
 * Disponibilidad por cliente.
 *
 * No se calcula nada acá ni en el servidor: Uptime Kuma ya agregó los latidos en
 * `stat_hourly` y nosotros los leemos. Por eso una tabla de 30 mapas sale en
 * milisegundos en vez de recorrer un cuarto de millón de filas.
 *
 * Un mapa es un cliente, así que el SLA del mapa es el SLA que se le informa.
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { apiUrl } from "@/lib/api";

interface Tramo { up: number; down: number; pct: number | null; ping: number | null; pingMin: number | null; pingMax: number | null }
interface Ventanas { h24: Tramo; d7: Tramo; d30: Tramo }
interface DiaSla { fecha: string; up: number; down: number; pct: number | null; ping: number | null }
interface Monitor {
  id: number; nombre: string; tipo: string; activo: boolean; estado: number | null;
  intervalo: number; ventanas: Ventanas; serie?: DiaSla[]; mant?: number;
}
interface FilaMapa {
  id: string; nombre: string; monitores: number;
  /** Nodos vinculados a monitores que Kuma ya no tiene: apuntan al vacío. */
  huerfanos: number;
  sla: Ventanas; peor: { id: number; nombre: string; pct: number } | null;
}
interface Alcance { desde: string | null; horas: number }
interface VentanaMant { id: number; titulo: string; monitores: number }
interface NodoHuerfano { nodoId: string; mapaId: string; mapa: string; etiqueta: string; monitorId: number }

const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const GRIS = "#8493a8";
const VIOLETA = "#8b5cf6";   // el mismo que usa el mapa para MAINT

type Ventana = "h24" | "d7" | "d30";
const VENTANAS: Array<{ k: Ventana; t: string; largo: string }> = [
  { k: "h24", t: "24 h", largo: "últimas 24 horas" },
  { k: "d7", t: "7 días", largo: "últimos 7 días" },
  { k: "d30", t: "30 días", largo: "últimos 30 días" },
];

/** Umbrales de un enlace de datos, no de un servidor de misión crítica. */
function colorSla(pct: number | null): string {
  if (pct == null) return GRIS;
  if (pct >= 99.9) return VERDE;
  if (pct >= 99) return "#65a30d";
  if (pct >= 95) return AMBAR;
  return ROJO;
}
function fmtPct(pct: number | null): string {
  if (pct == null) return "—";
  if (pct >= 99.995) return "100";
  return pct.toFixed(pct >= 99 ? 2 : 1);
}
/** El conteo de latidos caídos por el intervalo del monitor da el tiempo fuera. */
function fmtCaido(down: number, intervalo: number): string {
  const s = down * (intervalo || 60);
  if (s <= 0) return "sin cortes";
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
}
function fmtFecha(f: string): string {
  const [a, m, d] = f.split("-");
  return `${d}/${m}`;
}

const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  escudo: sv(<><path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.6 3.8 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>, 22),
  lupa: sv(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, 15),
  chevron: sv(<path d="m9 18 6-6-6-6" />, 14),
  x: sv(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 15),
  mapa: sv(<><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z" /><path d="M9 3v15M15 6v15" /></>, 15),
};

/* ─────────────────────────────────── tira de días ── */

function TiraDias({ serie }: { serie: DiaSla[] }) {
  if (!serie.length) return <span className="sla-gris">sin datos</span>;
  return (
    <div className="sla-tira" role="img" aria-label={`Disponibilidad diaria de los últimos ${serie.length} días`}>
      {serie.map((d) => {
        const c = colorSla(d.pct);
        const alto = d.pct == null ? 30 : Math.max(12, Math.min(100, ((d.pct - 90) / 10) * 100));
        return (
          <span key={d.fecha} className="sla-dia" title={
            d.pct == null
              ? `${fmtFecha(d.fecha)} · sin datos`
              : `${fmtFecha(d.fecha)} · ${fmtPct(d.pct)} % · ${d.down} latidos caídos${d.ping != null ? ` · ${d.ping} ms` : ""}`
          }>
            <span style={{ height: `${alto}%`, background: c, opacity: d.pct == null ? .3 : 1 }} />
          </span>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────── página ── */

export default function SlaPage() {
  const [mapas, setMapas] = useState<FilaMapa[]>([]);
  const [global, setGlobal] = useState<Tramo | null>(null);
  const [alcance, setAlcance] = useState<Alcance | null>(null);
  const [conDato, setConDato] = useState(0);
  const [huerfanos, setHuerfanos] = useState(0);
  const [mantenimiento, setMantenimiento] = useState<VentanaMant[]>([]);
  const [listaHuerfanos, setListaHuerfanos] = useState<NodoHuerfano[] | null>(null);
  const [soltando, setSoltando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [ventana, setVentana] = useState<Ventana>("d30");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, Monitor[]>>({});
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null);
  const [huerfanosDe, setHuerfanosDe] = useState<Record<string, number[]>>({});

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/kuma/uptime"), { credentials: "include" });
      const b = await r.json();
      if (!r.ok) { setError(b?.error || `HTTP ${r.status}`); setCargando(false); return; }
      setMapas(b.mapas || []); setGlobal(b.global || null);
      setAlcance(b.alcance || null); setConDato(b.monitoresConDato || 0);
      setHuerfanos(b.huerfanosTotal || 0);
      setMantenimiento(b.mantenimiento || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const verHuerfanos = useCallback(async () => {
    if (listaHuerfanos) { setListaHuerfanos(null); return; }
    try {
      const r = await fetch(apiUrl("/api/maps/huerfanos"), { credentials: "include" });
      const b = await r.json();
      setListaHuerfanos(b.huerfanos || []);
    } catch { setListaHuerfanos([]); }
  }, [listaHuerfanos]);

  const desvincular = useCallback(async (nodos: string[]) => {
    if (nodos.length === 0) return;
    setSoltando(true);
    try {
      await fetch(apiUrl("/api/maps/huerfanos"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodos }),
      });
      const r = await fetch(apiUrl("/api/maps/huerfanos"), { credentials: "include" });
      const b = await r.json();
      setListaHuerfanos(b.huerfanos || []);
      await cargar();
    } catch { /* el cartel se recalcula al recargar */ }
    setSoltando(false);
  }, [cargar]);

  const abrir = useCallback(async (id: string) => {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (detalle[id]) return;
    setCargandoDetalle(id);
    try {
      const r = await fetch(apiUrl(`/api/kuma/uptime?mapId=${encodeURIComponent(id)}&dias=30`), { credentials: "include" });
      const b = await r.json();
      if (r.ok) {
        setDetalle((d) => ({ ...d, [id]: b.monitores || [] }));
        setHuerfanosDe((h) => ({ ...h, [id]: b.mapa?.huerfanos || [] }));
      }
    } catch { /* se muestra vacío */ }
    setCargandoDetalle(null);
  }, [abierto, detalle]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return mapas
      .filter((m) => m.monitores > 0)
      .filter((m) => !t || m.nombre.toLowerCase().includes(t))
      .sort((a, b) => {
        const pa = a.sla[ventana].pct, pb = b.sla[ventana].pct;
        if (pa == null && pb == null) return a.nombre.localeCompare(b.nombre);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
  }, [mapas, q, ventana]);

  const sinMonitores = mapas.filter((m) => m.monitores === 0).length;
  const bajo99 = lista.filter((m) => m.sla[ventana].pct != null && m.sla[ventana].pct! < 99).length;
  const ventanaLarga = VENTANAS.find((v) => v.k === ventana)?.largo || "";

  return (
    <div className="sla-envoltura">
      <style>{CSS}</style>

      <header className="sla-cab">
        <div className="sla-logo">{I.escudo("#fff")}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1>Disponibilidad</h1>
          <p>
            Un mapa es un cliente, así que el número de cada fila es el que se le informa.
            Sale de las estadísticas que Uptime Kuma ya calculó — no se recorre el historial de latidos.
          </p>
        </div>
        <div className="sla-kpis">
          <div className="sla-kpi">
            <b style={{ color: colorSla(global?.pct ?? null) }}>{fmtPct(global?.pct ?? null)}<small>%</small></b>
            <span>todo, 30 días</span>
          </div>
          <div className="sla-kpi"><b>{lista.length}</b><span>clientes</span></div>
          <div className="sla-kpi"><b style={{ color: bajo99 ? AMBAR : "var(--foreground)" }}>{bajo99}</b><span>bajo 99 %</span></div>
        </div>
      </header>

      {error && <div className="sla-error">{error}</div>}

      {mantenimiento.length > 0 && (
        <div className="sla-aviso sla-aviso-mant">
          <span className="sla-punto" style={{ background: VIOLETA }} />
          <span>
            <b>{mantenimiento.length === 1 ? "Hay una ventana de mantenimiento corriendo" : `Hay ${mantenimiento.length} ventanas de mantenimiento corriendo`}:</b>{" "}
            {mantenimiento.map((v) => `${v.titulo} (${v.monitores})`).join(" · ")}. Mientras
            dure, esos minutos no cuentan como caída en los números de abajo.
          </span>
        </div>
      )}

      {huerfanos > 0 && (
        <div className="sla-aviso">
          <span className="sla-punto" style={{ background: AMBAR }} />
          <span>
            <b>{huerfanos} {huerfanos === 1 ? "nodo está vinculado" : "nodos están vinculados"} a monitores
            que ya no existen en Uptime Kuma.</b> No pintan estado ni suman a ninguna disponibilidad, y por
            eso pasan desapercibidos.
            <button className="sla-ver-h" onClick={verHuerfanos}>
              {listaHuerfanos ? "Ocultar" : "Ver cuáles"}
            </button>
          </span>
        </div>
      )}

      {listaHuerfanos && listaHuerfanos.length > 0 && (
        <div className="sla-huerfanos">
          <div className="sla-huerfanos-cab">
            <span>Nodos vinculados a monitores inexistentes</span>
            <button className="sla-btn-h" disabled={soltando}
                    onClick={() => desvincular(listaHuerfanos.map((h) => h.nodoId))}>
              {soltando ? "Desvinculando…" : `Desvincular los ${listaHuerfanos.length}`}
            </button>
          </div>
          <table className="sla-sub">
            <thead>
              <tr><th>Cliente</th><th>Nodo</th><th>Monitor</th><th></th></tr>
            </thead>
            <tbody>
              {listaHuerfanos.map((h) => (
                <tr key={h.nodoId}>
                  <td>{h.mapa}</td>
                  <td>{h.etiqueta}</td>
                  <td className="sla-num sla-gris">#{h.monitorId}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="sla-btn-h" disabled={soltando}
                            onClick={() => desvincular([h.nodoId])}>Desvincular</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sla-nota">
            Desvincular no borra el nodo: lo deja como un nodo sin sensor, en el mismo
            lugar del mapa, listo para volver a vincularlo al monitor correcto.
          </p>
        </div>
      )}

      <div className="sla-filtros">
        <div className="sla-segmentos" role="group" aria-label="Ventana">
          {VENTANAS.map((v) => (
            <button key={v.k} className={"sla-seg" + (ventana === v.k ? " act" : "")} onClick={() => setVentana(v.k)}>{v.t}</button>
          ))}
        </div>
        <div className="sla-buscador">
          {I.lupa("var(--muted-foreground)")}
          <input className="sla-input sla-limpio" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="sla-btn-fantasma sla-mini" onClick={() => setQ("")}>{I.x()}</button>}
        </div>
      </div>

      <div className="sla-tabla-wrap">
        <table className="sla-tabla">
          <thead>
            <tr>
              <th className="sla-th-p" />
              <th>Cliente</th>
              <th className="sla-th-c">Enlaces</th>
              <th className="sla-th-c">24 h</th>
              <th className="sla-th-c">7 días</th>
              <th className="sla-th-c">30 días</th>
              <th>Peor enlace (30 d)</th>
              <th className="sla-th-p" />
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => {
              const ab = abierto === m.id;
              const c = colorSla(m.sla[ventana].pct);
              return (
                <Fragment key={m.id}>
                  <tr className="sla-fila" onClick={() => abrir(m.id)} tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") abrir(m.id); }}
                      style={{ ["--acento" as any]: c }}>
                    <td className="sla-td-p"><span className="sla-punto" style={{ background: c }} /></td>
                    <td>
                      <div className="sla-cliente">
                        <span className="sla-ico">{I.mapa("var(--muted-foreground)")}</span>
                        <span className="sla-nombre">{m.nombre}</span>
                      </div>
                    </td>
                    <td className="sla-td-c sla-num">
                      {m.monitores}
                      {m.huerfanos > 0 && (
                        <span className="sla-etq sla-etq-aviso"
                              title={`${m.huerfanos} nodos apuntan a monitores que ya no existen en Kuma`}>
                          +{m.huerfanos} rotos
                        </span>
                      )}
                    </td>
                    {(["h24", "d7", "d30"] as Ventana[]).map((k) => (
                      <td key={k} className="sla-td-c">
                        <span className="sla-pct" style={{ color: colorSla(m.sla[k].pct), opacity: k === ventana ? 1 : .62 }}>
                          {fmtPct(m.sla[k].pct)}<small>%</small>
                        </span>
                      </td>
                    ))}
                    <td>
                      {m.peor ? (
                        <span className="sla-peor" title={m.peor.nombre}>
                          <span className="sla-punto" style={{ background: colorSla(m.peor.pct) }} />
                          {m.peor.nombre}
                          <b style={{ color: colorSla(m.peor.pct) }}>{fmtPct(m.peor.pct)}%</b>
                        </span>
                      ) : <span className="sla-gris">sin datos</span>}
                    </td>
                    <td className="sla-td-p"><span className={"sla-chevron" + (ab ? " abajo" : "")}>{I.chevron()}</span></td>
                  </tr>

                  {ab && (
                    <tr className="sla-detalle">
                      <td />
                      <td colSpan={7}>
                        {cargandoDetalle === m.id && <p className="sla-nota">Cargando enlaces…</p>}
                        {detalle[m.id] && huerfanosDe[m.id]?.length > 0 && (
                          <p className="sla-nota sla-nota-aviso">
                            Nodos vinculados a monitores que Kuma ya no tiene:{" "}
                            <b>{huerfanosDe[m.id].join(", ")}</b>. Se borró el monitor en Kuma y el nodo del
                            mapa quedó apuntando a ese id.
                          </p>
                        )}
                        {detalle[m.id] && (
                          <div className="sla-det">
                            <table className="sla-sub">
                              <thead>
                                <tr>
                                  <th>Enlace</th>
                                  <th className="sla-th-c">24 h</th>
                                  <th className="sla-th-c">7 d</th>
                                  <th className="sla-th-c">30 d</th>
                                  <th className="sla-th-c">Fuera de servicio (30 d)</th>
                                  <th className="sla-th-c">Latencia</th>
                                  <th>Día a día, 30 días</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detalle[m.id].map((mo) => (
                                  <tr key={mo.id}>
                                    <td>
                                      <div className="sla-enlace">
                                        <span className="sla-punto" style={{
                                          background: mo.estado === 1 ? VERDE : mo.estado === 0 ? ROJO : mo.estado === 3 ? AZUL_CLARO : GRIS,
                                        }} />
                                        <span title={`${mo.tipo || "monitor"} · id ${mo.id}`}>{mo.nombre}</span>
                                        {!mo.activo && <span className="sla-etq">pausado</span>}
                                      </div>
                                    </td>
                                    {(["h24", "d7", "d30"] as Ventana[]).map((k) => (
                                      <td key={k} className="sla-td-c">
                                        <span className="sla-pct chico" style={{ color: colorSla(mo.ventanas[k].pct) }}>
                                          {fmtPct(mo.ventanas[k].pct)}<small>%</small>
                                        </span>
                                      </td>
                                    ))}
                                    <td className="sla-td-c sla-num" title={`${mo.ventanas.d30.down} latidos caídos · un latido cada ${mo.intervalo} s`}>
                                      {fmtCaido(mo.ventanas.d30.down, mo.intervalo)}
                                      {!!mo.mant && (
                                        <span className="sla-mant" title={`${mo.mant} latidos en ventana de mantenimiento: no cuentan como caída`}>
                                          +{fmtCaido(mo.mant, mo.intervalo)} mant.
                                        </span>
                                      )}
                                    </td>
                                    <td className="sla-td-c sla-num">
                                      {mo.ventanas.d30.ping != null
                                        ? <span title={`mínima ${mo.ventanas.d30.pingMin} ms · máxima ${mo.ventanas.d30.pingMax} ms`}>{mo.ventanas.d30.ping} ms</span>
                                        : <span className="sla-gris">—</span>}
                                    </td>
                                    <td style={{ minWidth: 190 }}><TiraDias serie={mo.serie || []} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="sla-nota">
                              El tiempo fuera de servicio es una estimación: latidos caídos por el intervalo de cada
                              monitor. Las ventanas de mantenimiento de Kuma todavía no se descuentan — mientras no
                              existan, un corte programado cuenta como caída.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {cargando && <tr><td colSpan={8}><span className="sla-gris">Cargando…</span></td></tr>}
            {!cargando && lista.length === 0 && (
              <tr><td colSpan={8}>
                <div className="sla-vacio">
                  <strong>No hay clientes con monitores asignados{q ? " que coincidan" : ""}.</strong>
                  {!q && <p>Un mapa entra en esta tabla cuando alguno de sus nodos está vinculado a un monitor de Uptime Kuma.</p>}
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="sla-nota sla-pie">
        Mostrando {ventanaLarga}. {conDato} monitores con estadística
        {alcance?.desde ? `, desde el ${new Date(alcance.desde).toLocaleDateString("es-UY")}` : ""}.
        {sinMonitores > 0 && ` ${sinMonitores} mapas quedaron fuera porque no tienen ningún nodo vinculado a un monitor.`}
        {" "}El porcentaje es latidos correctos sobre latidos totales, tal como los agrega Uptime Kuma.
      </p>
    </div>
  );
}

const CSS = `
.sla-envoltura{max-width:1240px;margin:0 auto;padding:26px 20px 70px;color:var(--foreground)}
.sla-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.sla-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${AZUL},#0f3f9e);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${AZUL}45;flex:none}
.sla-cab h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px}
.sla-cab p{color:var(--muted-foreground);margin:3px 0 0;font-size:13px;max-width:64ch;line-height:1.55}
.sla-kpis{display:flex;gap:8px;flex-wrap:wrap}
.sla-kpi{text-align:center;padding:7px 15px;border-radius:10px;background:var(--surface-card);border:1px solid var(--border);min-width:86px}
.sla-kpi b{display:block;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.sla-kpi b small{font-size:11px;opacity:.55;margin-left:1px}
.sla-kpi span{font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.5px}
.sla-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:9px;margin-bottom:12px;font-size:13px;line-height:1.55}

.sla-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.sla-segmentos{display:flex;background:var(--surface-elevated);border:1px solid var(--border);border-radius:9px;padding:2px;gap:2px}
.sla-seg{background:transparent;border:none;color:var(--muted-foreground);font:inherit;font-size:12.5px;font-weight:600;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.sla-seg:hover{color:var(--text-secondary)}
.sla-seg.act{background:var(--card);color:${AZUL_CLARO};box-shadow:0 1px 3px rgba(0,0,0,.14)}
.sla-buscador{display:flex;align-items:center;gap:7px;flex:1;min-width:200px;max-width:360px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:0 8px 0 11px}
.sla-buscador:focus-within{border-color:${AZUL_CLARO};box-shadow:0 0 0 3px ${AZUL}22}
.sla-input{background:var(--card);border:1px solid var(--border);color:var(--foreground);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;outline:none}
.sla-limpio{flex:1;min-width:0;border:none!important;background:transparent!important;box-shadow:none!important;padding-left:0}
.sla-mini{padding:3px 6px;min-width:0;border:none}

.sla-tabla-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card)}
.sla-tabla{width:100%;min-width:900px;border-collapse:collapse;font-size:13px}
.sla-tabla thead th{text-align:left;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
.sla-tabla td{padding:10px 12px;border-top:1px solid var(--border);vertical-align:middle}
.sla-th-c,.sla-td-c{text-align:center}
.sla-th-p,.sla-td-p{width:26px;padding-left:10px!important;padding-right:0!important;text-align:center}
.sla-fila{cursor:pointer;outline:none;box-shadow:inset 3px 0 0 transparent;transition:background .12s}
.sla-fila:hover,.sla-fila:focus-visible{background:var(--surface-hover);box-shadow:inset 3px 0 0 var(--acento)}
.sla-fila:hover .sla-chevron{opacity:1}
.sla-punto{width:8px;height:8px;border-radius:99px;display:inline-block;flex:none}
.sla-cliente{display:flex;align-items:center;gap:9px;min-width:170px}
.sla-ico{display:inline-flex;opacity:.7;flex:none}
.sla-nombre{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.sla-pct{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.sla-pct small{font-size:9.5px;opacity:.55;margin-left:1px;font-weight:600}
.sla-pct.chico{font-size:13px}
.sla-num{font-variant-numeric:tabular-nums;color:var(--text-secondary);white-space:nowrap}
.sla-peor{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text-secondary);max-width:260px}
.sla-peor b{font-variant-numeric:tabular-nums;white-space:nowrap}
.sla-gris{color:var(--muted-foreground)}
.sla-chevron{display:inline-flex;color:var(--muted-foreground);opacity:.45;transition:opacity .12s}
.sla-chevron.abajo{transform:rotate(90deg);opacity:1}

.sla-detalle td{background:var(--surface-card);border-top:none;padding-top:0}
.sla-det{padding:4px 0 10px}
.sla-sub{width:100%;border-collapse:collapse;font-size:12.5px}
.sla-sub th{text-align:left;font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground);padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
.sla-sub td{padding:7px 10px;border-top:1px solid var(--border-soft,var(--border));vertical-align:middle}
.sla-enlace{display:flex;align-items:center;gap:8px;min-width:150px}
.sla-enlace>span:nth-child(2){white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}
.sla-aviso{display:flex;align-items:flex-start;gap:9px;border:1px solid ${AMBAR}55;background:${AMBAR}0e;border-radius:11px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:var(--text-secondary)}
.sla-aviso .sla-punto{margin-top:6px}
.sla-ver-h{margin-left:8px;background:transparent;border:1px solid ${AMBAR}66;color:${AMBAR};font:inherit;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:7px;cursor:pointer}
.sla-ver-h:hover{background:${AMBAR}1a}
.sla-huerfanos{border:1px solid var(--border);border-radius:12px;background:var(--card);padding:10px 12px;margin-bottom:12px}
.sla-huerfanos-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground)}
.sla-btn-h{background:var(--surface-card);border:1px solid var(--border);color:var(--foreground);font:inherit;font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}
.sla-btn-h:hover{background:var(--surface-hover);border-color:${AMBAR}66;color:${AMBAR}}
.sla-btn-h:disabled{opacity:.55;cursor:default}
.sla-aviso-mant{border-color:${VIOLETA}55;background:${VIOLETA}0e}
.sla-mant{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:${VIOLETA};border:1px solid ${VIOLETA}55;border-radius:4px;padding:0 5px;white-space:nowrap}
.sla-nota-aviso{color:${AMBAR}}
.sla-etq-aviso{margin-left:6px;color:${AMBAR};border-color:${AMBAR}66}
.sla-etq{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground);border:1px solid var(--border);border-radius:4px;padding:0 5px}

.sla-tira{display:flex;align-items:flex-end;gap:2px;height:26px;min-width:180px}
.sla-dia{flex:1;min-width:3px;height:100%;display:flex;align-items:flex-end}
.sla-dia>span{display:block;width:100%;border-radius:1.5px}

.sla-vacio{padding:24px 8px;text-align:center}
.sla-vacio strong{display:block;font-size:13.5px;margin-bottom:6px}
.sla-vacio p{font-size:12.5px;color:var(--muted-foreground);margin:0 auto;max-width:64ch;line-height:1.6}
.sla-nota{font-size:12px;color:var(--muted-foreground);line-height:1.6;margin:8px 0 0;max-width:88ch}
.sla-pie{margin-top:12px;font-size:12.5px}
.sla-btn-fantasma{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font:inherit;font-size:12.5px;cursor:pointer}
.sla-btn-fantasma:hover{background:var(--surface-elevated)}
`;
