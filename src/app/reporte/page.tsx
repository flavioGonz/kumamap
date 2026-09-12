"use client";

/**
 * Reportes mensuales por cliente.
 *
 * Esta pantalla no es el informe: es el paso previo. Muestra el mes cerrado de
 * todos los clientes en una tabla para poder mirar el conjunto antes de emitir
 * nada — qué clientes quedaron por debajo del objetivo, cuáles tienen nodos
 * rotos que ensuciarían el informe— y recién ahí se abre la hoja de cada uno,
 * que es la que se imprime o se guarda en PDF.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";

interface Cliente {
  id: string; nombre: string; monitores: number; huerfanos: number;
  up: number; down: number; mant: number; pct: number | null;
  cobertura: number | null;
  peor: { id: number; nombre: string; pct: number } | null;
}
interface Mes { anio: number; mes: number; etiqueta: string }
interface Rango { etiqueta: string; dias: number }

const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const VIOLETA = "#8b5cf6";
const GRIS = "#8493a8";

const OBJETIVOS = [99, 99.5, 99.9];

function colorSla(p: number | null): string {
  if (p == null) return GRIS;
  if (p >= 99.9) return VERDE;
  if (p >= 99) return "#65a30d";
  if (p >= 95) return AMBAR;
  return ROJO;
}
function fmtPct(p: number | null): string {
  if (p == null) return "—";
  if (p >= 99.995) return "100,00";
  return p.toFixed(2).replace(".", ",");
}
/** Los latidos caídos por el intervalo dan el tiempo fuera. 60 s es el común. */
function fmtFuera(down: number): string {
  const s = down * 60;
  if (s <= 0) return "sin cortes";
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
}

const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  hoja: sv(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>, 22),
  abrir: sv(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>, 14),
  lupa: sv(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, 15),
  x: sv(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 15),
  alerta: sv(<><path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /><path d="M12 9v4M12 17h.01" /></>, 13),
};

export default function ReportePage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [meses, setMeses] = useState<Mes[]>([]);
  const [rango, setRango] = useState<Rango | null>(null);
  const [sel, setSel] = useState<{ anio: number; mes: number } | null>(null);
  const [objetivo, setObjetivo] = useState(99.5);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (m: { anio: number; mes: number } | null) => {
    setCargando(true);
    try {
      const p = m ? `?anio=${m.anio}&mes=${m.mes}` : "";
      const r = await fetch(apiUrl(`/api/kuma/reporte${p}`), { credentials: "include" });
      const b = await r.json();
      if (!r.ok) { setError(b?.error || `HTTP ${r.status}`); setCargando(false); return; }
      setClientes(b.clientes || []);
      setMeses(b.meses || []);
      setRango(b.rango || null);
      if (!m && b.sugerido) setSel(b.sugerido);
      setError(null);
    } catch (e: any) { setError(e?.message || "Error de red"); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(null); }, [cargar]);

  const cambiarMes = (anio: number, mes: number) => { setSel({ anio, mes }); cargar({ anio, mes }); };

  const enlaceHoja = (c: Cliente) =>
    apiUrl(`/api/kuma/reporte-pdf?mapId=${encodeURIComponent(c.id)}&anio=${sel?.anio}&mes=${sel?.mes}&objetivo=${objetivo}`);

  const filtrados = useMemo(() => {
    const f = q.trim().toLowerCase();
    return f ? clientes.filter((c) => c.nombre.toLowerCase().includes(f)) : clientes;
  }, [clientes, q]);

  const bajoObjetivo = clientes.filter((c) => c.pct != null && c.pct < objetivo);
  const conHuerfanos = clientes.filter((c) => c.huerfanos > 0);
  const global = useMemo(() => {
    const up = clientes.reduce((a, c) => a + c.up, 0);
    const down = clientes.reduce((a, c) => a + c.down, 0);
    return up + down > 0 ? (up / (up + down)) * 100 : null;
  }, [clientes]);

  return (
    <div className="rp-envoltura">
      <style>{CSS}</style>

      <header className="rp-cab">
        <div className="rp-logo">{I.hoja("#fff")}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>Reportes mensuales</h1>
          <p>
            El mes cerrado de cada cliente. Mirá el conjunto acá —quién quedó por
            debajo del objetivo, quién tiene nodos rotos que ensuciarían el informe—
            y después abrí la hoja del cliente para imprimirla o guardarla en PDF.
          </p>
        </div>
        <div className="rp-kpis">
          <div className="rp-kpi"><b style={{ color: colorSla(global) }}>{fmtPct(global)}<small>%</small></b><span>Global</span></div>
          <div className="rp-kpi"><b style={{ color: bajoObjetivo.length ? ROJO : undefined }}>{bajoObjetivo.length}</b><span>Bajo objetivo</span></div>
          <div className="rp-kpi"><b>{clientes.length}</b><span>Clientes</span></div>
        </div>
      </header>

      {error && <div className="rp-error">{error}</div>}

      <div className="rp-filtros">
        <select className="rp-input" value={sel ? `${sel.anio}-${sel.mes}` : ""}
                onChange={(e) => { const [a, m] = e.target.value.split("-").map(Number); cambiarMes(a, m); }}>
          {meses.map((m) => (
            <option key={`${m.anio}-${m.mes}`} value={`${m.anio}-${m.mes}`}>{m.etiqueta}</option>
          ))}
        </select>

        <div className="rp-segmentos" role="group" aria-label="Objetivo de disponibilidad">
          <span className="rp-etq-seg">Objetivo</span>
          {OBJETIVOS.map((o) => (
            <button key={o} className={"rp-seg" + (objetivo === o ? " act" : "")} onClick={() => setObjetivo(o)}>
              {String(o).replace(".", ",")} %
            </button>
          ))}
        </div>

        <div className="rp-buscador">
          {I.lupa(GRIS)}
          <input className="rp-input rp-limpio" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="rp-btn rp-mini" onClick={() => setQ("")} aria-label="Limpiar">{I.x()}</button>}
        </div>
      </div>

      {conHuerfanos.length > 0 && (
        <div className="rp-aviso">
          <span style={{ color: AMBAR, display: "inline-flex", marginTop: 2 }}>{I.alerta(AMBAR)}</span>
          <span>
            <b>{conHuerfanos.length} cliente{conHuerfanos.length === 1 ? "" : "s"} con nodos apuntando a
            monitores que ya no existen</b> ({conHuerfanos.map((c) => c.nombre).join(", ")}). Esos enlaces
            no entran en el cálculo, así que el informe va a informar de menos. Se arreglan desde
            Disponibilidad, en el cartel de arriba.
          </span>
        </div>
      )}

      {cargando ? (
        <p className="rp-gris">Cargando {rango?.etiqueta || "el mes"}…</p>
      ) : clientes.length === 0 ? (
        <div className="rp-vacio">
          <p><b>No hay datos para {rango?.etiqueta || "ese mes"}.</b></p>
          <p>El registro de estadísticas puede no llegar tan atrás, o los mapas todavía no tienen monitores vinculados.</p>
        </div>
      ) : (
        <div className="rp-tabla-wrap">
          <table className="rp-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="c">Disponibilidad</th>
                <th className="c" title="Estimado a partir de los sondeos sin respuesta. El informe del cliente trae la cifra exacta, leída de las transiciones y sin contar dos veces lo que cayó junto.">Fuera de servicio</th>
                <th className="c">Mantenimiento</th>
                <th className="c">Enlaces</th>
                <th>Peor enlace</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => {
                const cumple = c.pct != null && c.pct >= objetivo;
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="rp-cliente">
                        <span className="rp-punto" style={{ background: colorSla(c.pct) }} />
                        <span className="rp-nombre">{c.nombre}</span>
                        {c.huerfanos > 0 && (
                          <span className="rp-etq rp-etq-alerta" title={`${c.huerfanos} nodos vinculados a monitores inexistentes`}>
                            {c.huerfanos} rotos
                          </span>
                        )}
                        {c.cobertura != null && c.cobertura < 0.98 && (
                          <span className="rp-etq rp-etq-alerta"
                                title={`Sólo hay medición de ${Math.round(c.cobertura * 100)} % de las horas del mes`}>
                            {Math.round(c.cobertura * 100)} % del mes
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="c">
                      <span className="rp-pct" style={{ color: colorSla(c.pct) }}>{fmtPct(c.pct)}<small>%</small></span>
                      {c.pct != null && !cumple && <div className="rp-bajo">bajo objetivo</div>}
                    </td>
                    <td className="c num">{fmtFuera(c.down)}</td>
                    <td className="c num" style={{ color: c.mant > 0 ? VIOLETA : undefined }}>
                      {c.mant > 0 ? fmtFuera(c.mant) : "—"}
                    </td>
                    <td className="c num">{c.monitores}</td>
                    <td>
                      {c.peor
                        ? <span className="rp-peor"><b style={{ color: colorSla(c.peor.pct) }}>{fmtPct(c.peor.pct)} %</b> {c.peor.nombre}</span>
                        : <span className="rp-gris">—</span>}
                    </td>
                    <td>
                      <a className="rp-btn rp-primario" href={enlaceHoja(c)} target="_blank" rel="noreferrer">
                        {I.abrir("#fff")} Informe
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="rp-nota">
        La disponibilidad sale de los mismos agregados que muestra Disponibilidad, así que el informe y la
        pantalla nunca se contradicen. Los cortes del informe no se estiman: se leen de las transiciones
        registradas, con la hora exacta de caída y de vuelta. El mantenimiento declarado no cuenta como
        indisponibilidad, pero se lista igual para que el corte quede explicado. Cuando un cliente no
        tiene registro del mes completo lo dice acá y también en el informe: un porcentaje calculado
        sobre media docena de días no se puede presentar como el mes.
      </p>
    </div>
  );
}

const CSS = `
.rp-envoltura{max-width:1240px;margin:0 auto;padding:26px 20px 70px;color:var(--foreground)}
.rp-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.rp-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${AZUL},#0f3f9e);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${AZUL}45;flex:none}
.rp-cab h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px}
.rp-cab p{color:var(--muted-foreground);margin:3px 0 0;font-size:13px;max-width:72ch;line-height:1.55}
.rp-kpis{display:flex;gap:8px;flex-wrap:wrap}
.rp-kpi{text-align:center;padding:7px 15px;border-radius:10px;background:var(--surface-card);border:1px solid var(--border);min-width:92px}
.rp-kpi b{display:block;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.rp-kpi b small{font-size:11px;opacity:.55;margin-left:1px}
.rp-kpi span{font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.5px}
.rp-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:9px;margin-bottom:12px;font-size:13px}
.rp-gris{color:var(--muted-foreground)}

.rp-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.rp-input{background:var(--card);border:1px solid var(--border);color:var(--foreground);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;outline:none}
.rp-input:focus{border-color:${AZUL_CLARO};box-shadow:0 0 0 3px ${AZUL}22}
.rp-limpio{flex:1;min-width:0;border:none!important;background:transparent!important;box-shadow:none!important;padding-left:0}
.rp-buscador{display:flex;align-items:center;gap:7px;flex:1;min-width:200px;max-width:320px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:0 8px 0 11px}
.rp-segmentos{display:flex;align-items:center;background:var(--surface-elevated);border:1px solid var(--border);border-radius:9px;padding:2px;gap:2px}
.rp-etq-seg{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground);padding:0 8px 0 7px}
.rp-seg{background:transparent;border:none;color:var(--muted-foreground);font:inherit;font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:7px;cursor:pointer;white-space:nowrap}
.rp-seg.act{background:var(--card);color:${AZUL_CLARO};box-shadow:0 1px 3px rgba(0,0,0,.14)}

.rp-btn{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);color:var(--foreground);font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;white-space:nowrap;text-decoration:none}
.rp-btn:hover{background:var(--surface-hover)}
.rp-primario{background:${AZUL};border-color:${AZUL};color:#fff}
.rp-primario:hover{background:${AZUL_CLARO}}
.rp-mini{padding:3px 6px;border:none;background:transparent}

.rp-aviso{display:flex;align-items:flex-start;gap:9px;border:1px solid ${AMBAR}55;background:${AMBAR}0e;border-radius:11px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:var(--text-secondary)}

.rp-vacio{border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--muted-foreground);font-size:13px;line-height:1.6}
.rp-vacio p{margin:0 0 6px;max-width:60ch;margin-inline:auto}
.rp-vacio b{color:var(--foreground)}

.rp-tabla-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card)}
.rp-tabla{width:100%;min-width:940px;border-collapse:collapse;font-size:13px}
.rp-tabla thead th{text-align:left;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
.rp-tabla td{padding:10px 12px;border-top:1px solid var(--border);vertical-align:middle}
.rp-tabla .c{text-align:center}
.rp-tabla tbody tr:hover{background:var(--surface-hover)}
.num{font-variant-numeric:tabular-nums;color:var(--text-secondary);white-space:nowrap}
.rp-cliente{display:flex;align-items:center;gap:9px;min-width:180px}
.rp-punto{width:8px;height:8px;border-radius:99px;display:inline-block;flex:none}
.rp-nombre{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}
.rp-pct{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-pct small{font-size:9.5px;opacity:.55;margin-left:1px;font-weight:600}
.rp-bajo{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${ROJO};margin-top:1px}
.rp-peor{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text-secondary);max-width:250px}
.rp-peor b{font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-etq{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border:1px solid var(--border);border-radius:4px;padding:0 5px;color:var(--muted-foreground)}
.rp-etq-alerta{color:${AMBAR};border-color:${AMBAR}66}
.rp-nota{color:var(--muted-foreground);font-size:12px;line-height:1.6;max-width:88ch;margin-top:14px}

@media(max-width:640px){
  .rp-envoltura{padding:18px 14px 60px}
  .rp-kpis{width:100%}
  .rp-kpi{flex:1}
}
`;
