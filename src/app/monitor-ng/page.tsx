"use client";

/**
 * Consola de servidores monitor-ng.
 *
 * REGLA DE ORO: este controlador NO puede hacer nada sobre el equipo remoto.
 * No lo alcanza por red, no tiene credenciales, no ejecuta nada. Lo unico que
 * puede hacer es DEJAR UN ENCARGO; el agente lo levanta en su proximo push y
 * devuelve el resultado en el siguiente. Toda la interfaz esta escrita para que
 * eso se entienda: los encargos no "se ejecutan", se encargan.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { apiUrl } from "@/lib/api";

/* ─────────────────────────────────────────────── datos ── */
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { credentials: "include", ...opts });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: body?.error || `HTTP ${res.status}` };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Error de red" };
  }
}

interface Metric { id: string; state: string; value: string; label?: string }
interface PendingDevice {
  deviceId: string; node: string; name: string; ip: string;
  fingerprint: string; pendingSince: number; lastSeen: number;
}
interface AdoptedDevice extends PendingDevice {
  monitorId: number; adoptedAt: number; state: string;
  ok: number; warn: number; crit: number; ts: string;
  stale: boolean; hasToken: boolean; metrics: Metric[];
}
interface DevicesResponse { pending: PendingDevice[]; adopted: AdoptedDevice[] }

interface Producto { clave: string; nombre: string; version?: string; evidencia?: string; ruta?: string; sensores?: string[]; servicios?: Array<{ nombre: string; display: string; estado: string; inicio: string }> }
interface Survey {
  node: string; deviceId?: string; name?: string; at: number; recibido: number;
  os: any; roles: string[]; volumenes: any[]; productos: Producto[];
}
interface AgenteVersion {
  node: string; deviceId?: string; name?: string; version: string; visto: number;
  objetivo: string; estado: "al-dia" | "hay-nueva" | "actualizando" | "fallo" | "desconocida";
  intentos: number; error: string;
}
interface Release { version: string; file: string; bytes: number; updatedAt: string; url: string; platform: string }

interface Job {
  id: string; node: string; tipo: string; destino: string; params: Record<string, any>;
  estado: string; creado: number; enviado: number; cerrado: number; ms: number;
  intentos: number; resultado: any; autor: string; resumen: string;
}

/* ───────────────────────────────────────────── paleta ── */
/** Azul KumaMaps, el mismo del login. El color semantico va aparte del acento. */
const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const GRIS = "#8493a8";
const CARMIN = "#e11d48";

const STATE_COLOR: Record<string, string> = { ok: VERDE, warn: AMBAR, crit: ROJO, idle: GRIS };
const ORDEN_ESTADO: Record<string, number> = { crit: 0, warn: 1, ok: 2, idle: 3 };
/** El agente manda ok/warn/crit; en pantalla va en castellano. */
const ESTADO_TXT: Record<string, string> = { ok: "en orden", warn: "atención", crit: "crítico", idle: "en espera" };
const etiquetaEstado = (d: { stale: boolean; state: string }) => (d.stale ? "sin reporte" : ESTADO_TXT[d.state] || d.state);

function ago(ms: number): string {
  if (!ms) return "nunca";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}
function reloj(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function gb(n: any): string {
  const v = Number(n);
  return isFinite(v) ? v.toFixed(v >= 100 ? 0 : 1) + " GB" : "—";
}

/* ────────────────────────────────────────────── iconos ── */
const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  server: sv(<><rect width="18" height="16" x="3" y="4" rx="2" /><path d="M3 12h4l2-5 3 9 2-4h5" /></>),
  pulse: (c = "currentColor", s = 18) => sv(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />, s, 2.2)(c),
  check: sv(<polyline points="20 6 9 17 4 12" />, 14, 2.5),
  key: sv(<><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>, 14),
  unlink: sv(<><path d="m18.84 12.25 1.72-1.71a5.83 5.83 0 0 0-8.24-8.24l-1.72 1.71" /><path d="m5.17 11.75-1.71 1.71a5.83 5.83 0 0 0 8.24 8.24l1.71-1.71" /><line x1="8" x2="16" y1="2" y2="2" /><line x1="2" x2="2" y1="8" y2="16" /></>, 14),
  trash: sv(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 14),
  globe: sv(<><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><path d="M2 12h20" /></>, 13),
  inbox: sv(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>, 34, 1.6),
  alerta: sv(<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>, 15),
  x: sv(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 16),
  radar: sv(<><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" /><path d="M4 6h.01" /><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" /><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" /><path d="M12 18h.01" /><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" /><circle cx="12" cy="12" r="2" /></>, 15),
  cpu: sv(<><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" /></>, 15),
  box: sv(<><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>, 15),
  refresh: sv(<><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>, 14),
  escudo: sv(<><path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.6 3.8 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>, 15),
  lupa: sv(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, 15),
  chevron: sv(<path d="m9 18 6-6-6-6" />, 15),
  reloj: sv(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>, 13),
};

/* ══════════════════════════════════════════════ pagina ══ */
export default function MonitorNgPage() {
  const [data, setData] = useState<DevicesResponse>({ pending: [], adopted: [] });
  const [surveys, setSurveys] = useState<Record<string, Survey>>({});
  const [agentes, setAgentes] = useState<Record<string, AgenteVersion>>({});
  const [ultima, setUltima] = useState<Release | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data: d, error: e } = await apiFetch<DevicesResponse>(apiUrl("/api/monitor-ng/devices"));
    if (e) setError(e);
    else if (d) { setData({ pending: d.pending || [], adopted: d.adopted || [] }); setError(null); }
    setLoading(false);
  }, []);

  const loadSurveys = useCallback(async () => {
    const { data: d } = await apiFetch<{ surveys: Survey[] }>(apiUrl("/api/monitor-ng/survey"));
    if (d?.surveys) {
      const m: Record<string, Survey> = {};
      for (const s of d.surveys) if (s.deviceId) m[s.deviceId] = s;
      setSurveys(m);
    }
  }, []);

  const loadAgentes = useCallback(async () => {
    const { data: d } = await apiFetch<{ ultima: Release | null; agentes: AgenteVersion[] }>(apiUrl("/api/monitor-ng/agents"));
    if (d) {
      setUltima(d.ultima || null);
      const m: Record<string, AgenteVersion> = {};
      for (const a of d.agentes || []) if (a.deviceId) m[a.deviceId] = a;
      setAgentes(m);
    }
  }, []);

  useEffect(() => {
    load(); loadSurveys(); loadAgentes();
    timer.current = setInterval(() => { load(); loadAgentes(); }, 10000);
    const t2 = setInterval(loadSurveys, 60000);
    return () => { if (timer.current) clearInterval(timer.current); clearInterval(t2); };
  }, [load, loadSurveys, loadAgentes]);

  const action = useCallback(async (deviceId: string, act: string, name?: string) => {
    setBusy(deviceId + act);
    const { error: e } = await apiFetch(apiUrl("/api/monitor-ng/devices"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act, deviceId, name }),
    });
    setBusy(null);
    if (e) { setError(e); return; }
    if (act === "delete" || act === "deadopt") setAbierto(null);
    await load();
  }, [load]);

  const adopt = (d: PendingDevice) => {
    const name = window.prompt("Nombre para este servidor en el mapa:", d.name || d.deviceId);
    if (name === null) return;
    action(d.deviceId, "adopt", name.trim() || d.deviceId);
  };
  const deadopt = (d: AdoptedDevice) => { if (window.confirm(`¿De-adoptar "${d.name}" (#${d.deviceId})?\n\nVuelve a pendiente y su token queda revocado.`)) action(d.deviceId, "deadopt"); };
  const regen = (d: AdoptedDevice) => { if (window.confirm(`¿Regenerar el token de "${d.name}"?\n\nEl agente tendrá que recibirlo de nuevo (unos segundos sin reportar).`)) action(d.deviceId, "regen-token"); };
  const remove = (d: PendingDevice | AdoptedDevice) => { if (window.confirm(`¿Eliminar por completo el dispositivo #${d.deviceId}?`)) action(d.deviceId, "delete"); };

  /* ── lo que está mal ahora: la única lista que importa a primera vista ── */
  const alertas = useMemo(() => {
    const out: Array<{ d: AdoptedDevice; tipo: "mudo" | "sensor"; m?: Metric }> = [];
    for (const d of data.adopted) {
      if (d.stale) { out.push({ d, tipo: "mudo" }); continue; }
      for (const m of d.metrics) if (m.state === "crit" || m.state === "warn") out.push({ d, tipo: "sensor", m });
    }
    return out.sort((a, b) => {
      const pa = a.tipo === "mudo" ? -1 : ORDEN_ESTADO[a.m!.state] ?? 9;
      const pb = b.tipo === "mudo" ? -1 : ORDEN_ESTADO[b.m!.state] ?? 9;
      return pa - pb;
    });
  }, [data.adopted]);

  const mudos = data.adopted.filter((d) => d.stale).length;
  const online = data.adopted.length - mudos;
  const enAlerta = alertas.filter((a) => a.tipo === "sensor").length;
  const sel = data.adopted.find((d) => d.deviceId === abierto) || null;

  const ordenados = useMemo(() =>
    [...data.adopted].sort((a, b) => {
      const pa = a.stale ? -1 : ORDEN_ESTADO[a.state] ?? 9;
      const pb = b.stale ? -1 : ORDEN_ESTADO[b.state] ?? 9;
      return pa - pb || a.name.localeCompare(b.name);
    }), [data.adopted]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "26px 20px 70px" }}>

        <header className="mng-cab">
          <div className="mng-logo">{I.pulse("#fff", 24)}</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Servidores monitor-ng</h1>
            <p style={{ color: "var(--muted-foreground)", margin: "3px 0 0", fontSize: 13 }}>
              Agentes instalados en servidores remotos. Reportan cada 30 s con token propio; el controlador solo les deja encargos.
            </p>
          </div>
          <div className="mng-kpis">
            <Kpi label="en línea" value={`${online}/${data.adopted.length}`} color={VERDE} />
            <Kpi label="sensores en alerta" value={String(enAlerta)} color={enAlerta ? AMBAR : "var(--muted-foreground)"} />
            <Kpi label="sin reporte" value={String(mudos)} color={mudos ? ROJO : "var(--muted-foreground)"} pulse={mudos > 0} />
            <Kpi label="pendientes" value={String(data.pending.length)} color={data.pending.length ? AZUL : "var(--muted-foreground)"} pulse={data.pending.length > 0} />
          </div>
        </header>

        {error && <div className="mng-error">{error}</div>}

        {/* ── qué está mal ahora ─────────────────────────── */}
        {alertas.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <Titulo icono={I.alerta(ROJO)} texto="Qué está mal ahora" badge={alertas.length} color={ROJO} />
            <div className="mng-alertas">
              {alertas.slice(0, 14).map((a, i) => {
                const c = a.tipo === "mudo" ? ROJO : STATE_COLOR[a.m!.state];
                return (
                  <button key={i} className="mng-alerta" style={{ borderLeftColor: c }} onClick={() => setAbierto(a.d.deviceId)}>
                    <span className="mng-punto" style={{ background: c }} />
                    <span className="mng-alerta-srv">{a.d.name}</span>
                    {a.tipo === "mudo" ? (
                      <>
                        <span className="mng-alerta-sen">sin reporte</span>
                        <span className="mng-alerta-val" style={{ color: c }}>{ago(a.d.lastSeen)}</span>
                      </>
                    ) : (
                      <>
                        <span className="mng-alerta-sen">{a.m!.label || a.m!.id}</span>
                        <span className="mng-alerta-val" style={{ color: c }}>{a.m!.value}</span>
                      </>
                    )}
                  </button>
                );
              })}
              {alertas.length > 14 && <div className="mng-alerta-mas">y {alertas.length - 14} más</div>}
            </div>
          </section>
        )}

        {/* ── pendientes ─────────────────────────────────── */}
        {(data.pending.length > 0 || loading) && (
          <section style={{ marginTop: 28 }}>
            <Titulo icono={I.inbox(AZUL)} texto="Pendientes de adopción" badge={data.pending.length || undefined} color={AZUL} />
            {loading && data.pending.length === 0 ? (
              <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Cargando…</p>
            ) : (
              <div className="mng-grid-pend">
                {data.pending.map((d) => (
                  <div key={d.deviceId} className="mng-card mng-pend">
                    <div className="mng-pend-barra" />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div className="mng-micro">Código de adopción</div>
                        <div className="mng-codigo">{d.deviceId}</div>
                      </div>
                      <span className="mng-pill" style={{ color: AZUL, borderColor: AZUL + "55", background: AZUL + "12" }}>
                        <span className="mng-punto" style={{ background: AZUL }} /> pendiente
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                      {I.server("var(--muted-foreground)")}<span style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                      {d.ip && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{I.globe()}{d.ip}</span>}
                      <span>visto {ago(d.lastSeen)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                      <button onClick={() => adopt(d)} disabled={busy === d.deviceId + "adopt"} className="mng-btn-primario" style={{ flex: 1 }}>
                        {I.check("#fff")} {busy === d.deviceId + "adopt" ? "Adoptando…" : "Adoptar"}
                      </button>
                      <button onClick={() => remove(d)} className="mng-btn-fantasma" title="Descartar">{I.trash()}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── servidores ─────────────────────────────────── */}
        <section style={{ marginTop: 30 }}>
          <Titulo icono={I.server(AZUL)} texto="Servidores adoptados" badge={data.adopted.length || undefined} color={AZUL} />
          {data.adopted.length === 0 ? (
            <div className="mng-card" style={{ textAlign: "center", padding: "44px 20px", color: "var(--muted-foreground)" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: 0.6 }}>{I.server("var(--muted-foreground)")}</div>
              <div style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 14 }}>Todavía no adoptaste ningún servidor.</div>
              <div style={{ fontSize: 12.5, marginTop: 5 }}>Instalá monitor-ng en un servidor y cargale la URL de este controlador; aparecerá arriba con su código.</div>
            </div>
          ) : (
            <TablaServidores filas={ordenados} surveys={surveys} agentes={agentes} onAbrir={setAbierto} />
          )}
        </section>
      </div>

      {sel && (
        <Cajon
          d={sel}
          survey={surveys[sel.deviceId]}
          agente={agentes[sel.deviceId]}
          ultima={ultima}
          onRecargarAgentes={loadAgentes}
          busy={busy}
          onCerrar={() => setAbierto(null)}
          onRegen={() => regen(sel)}
          onDeadopt={() => deadopt(sel)}
          onBorrar={() => remove(sel)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════ tabla de servidores ══ */
const UPD_TXT: Record<string, { t: string; c: string }> = {
  "al-dia": { t: "al día", c: GRIS },
  "hay-nueva": { t: "hay versión nueva", c: AZUL_CLARO },
  actualizando: { t: "actualizándose", c: AZUL_CLARO },
  fallo: { t: "falló la actualización", c: AMBAR },
  desconocida: { t: "versión desconocida", c: GRIS },
};

/** El agente manda el valor ya formateado ("42 %", "C: 86 %"). Para la columna
 *  hace falta el número: se extrae, y si no hay, la celda queda vacía. */
function porcentaje(v?: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(v || "");
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return isFinite(n) ? n : null;
}
/** "C: 86 %" → "C:" */
function unidad(v?: string): string {
  const m = /^\s*([A-Za-z]:)/.exec(v || "");
  return m ? m[1].toUpperCase() : "";
}
const metrica = (d: AdoptedDevice, id: string) => d.metrics.find((m) => m.id === id);
/** Umbrales de carga: el color lo decide el número, no el estado del sensor,
 *  porque cada servidor tiene su propio umbral configurado en el agente. */
const colorCarga = (p: number) => (p >= 90 ? ROJO : p >= 75 ? AMBAR : VERDE);

function Medidor({ v, etiqueta }: { v?: string; etiqueta?: string }) {
  const p = porcentaje(v);
  if (p == null) return <span className="mng-td-vacio">—</span>;
  const c = colorCarga(p);
  return (
    <div className="mng-medidor" title={v}>
      <div className="mng-medidor-n" style={{ color: p >= 75 ? c : "var(--foreground)" }}>
        {Math.round(p)}<small>%</small>
      </div>
      <div className="mng-medidor-barra"><span style={{ width: Math.min(100, p) + "%", background: c }} /></div>
      {etiqueta && <div className="mng-medidor-et">{etiqueta}</div>}
    </div>
  );
}

/** Cuántas alertas trae el sensor de eventos: "3 alertas" | "sin alertas" */
function alertasDeEventos(m?: Metric): number | null {
  if (!m) return null;
  const n = /(\d+)/.exec(m.value || "");
  return n ? parseInt(n[1], 10) : 0;
}

type Orden = "estado" | "nombre" | "visto";

function TablaServidores({ filas, surveys, agentes, onAbrir }: {
  filas: AdoptedDevice[];
  surveys: Record<string, Survey>;
  agentes: Record<string, AgenteVersion>;
  onAbrir: (deviceId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [solo, setSolo] = useState<"todos" | "problemas" | "mudos">("todos");
  const [orden, setOrden] = useState<Orden>("estado");

  const vista = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = filas.filter((d) => {
      if (solo === "mudos" && !d.stale) return false;
      if (solo === "problemas" && !d.stale && d.warn + d.crit === 0) return false;
      if (!t) return true;
      const s = surveys[d.deviceId];
      return (
        d.name.toLowerCase().includes(t) ||
        d.deviceId.toLowerCase().includes(t) ||
        (d.ip || "").includes(t) ||
        (s?.os?.nombre || "").toLowerCase().includes(t) ||
        (s?.productos || []).some((p) => p.nombre.toLowerCase().includes(t))
      );
    });
    if (orden === "nombre") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    else if (orden === "visto") out = [...out].sort((a, b) => b.lastSeen - a.lastSeen);
    return out;
  }, [filas, surveys, q, solo, orden]);

  return (
    <>
      <div className="mng-barra-tabla">
        <div className="mng-buscador">
          {I.lupa("var(--muted-foreground)")}
          <input className="mng-input mng-input-limpio" placeholder="Buscar por nombre, código, IP, sistema o producto…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="mng-btn-fantasma mng-mini" onClick={() => setQ("")} title="Limpiar">{I.x()}</button>}
        </div>
        <div className="mng-segmentos" role="group" aria-label="Filtrar servidores">
          {([["todos", "Todos"], ["problemas", "Con problemas"], ["mudos", "Sin reporte"]] as const).map(([k, t]) => (
            <button key={k} className={"mng-seg" + (solo === k ? " act" : "")} onClick={() => setSolo(k)}>{t}</button>
          ))}
        </div>
        <select className="mng-input mng-select" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar">
          <option value="estado">Ordenar: por gravedad</option>
          <option value="nombre">Ordenar: por nombre</option>
          <option value="visto">Ordenar: reporte más reciente</option>
        </select>
      </div>

      <div className="mng-tabla-srv-wrap">
        <table className="mng-tabla-srv">
          <thead>
            <tr>
              <th className="mng-th-punto" aria-label="Estado" />
              <th>Servidor</th>
              <th>Estado</th>
              <th className="mng-th-c" title="Uso de procesador">CPU</th>
              <th className="mng-th-c" title="Uso de memoria">Memoria</th>
              <th className="mng-th-c" title="Volumen más lleno">Disco</th>
              <th className="mng-th-c" title="Sensores en orden / atención / críticos">Sensores</th>
              <th>Respaldo</th>
              <th className="mng-th-c">Eventos</th>
              <th>Sistema</th>
              <th>Agente</th>
              <th>Último reporte</th>
              <th className="mng-th-punto" />
            </tr>
          </thead>
          <tbody>
            {vista.map((d) => (
              <FilaServidor key={d.deviceId} d={d} survey={surveys[d.deviceId]} agente={agentes[d.deviceId]} onAbrir={() => onAbrir(d.deviceId)} />
            ))}
          </tbody>
        </table>
        {vista.length === 0 && (
          <p className="mng-nota" style={{ padding: "22px 16px", textAlign: "center" }}>
            Ningún servidor coincide con ese filtro.
          </p>
        )}
      </div>
      <p className="mng-nota" style={{ marginTop: 8 }}>
        {vista.length} de {filas.length} servidores · la fila se abre con un clic (o Enter) y muestra sensores, respaldos, eventos, relevamiento y encargos.
      </p>
    </>
  );
}

function FilaServidor({ d, survey, agente, onAbrir }: {
  d: AdoptedDevice; survey?: Survey; agente?: AgenteVersion; onAbrir: () => void;
}) {
  const color = d.stale ? ROJO : STATE_COLOR[d.state] || GRIS;
  const total = d.ok + d.warn + d.crit;
  const cpu = metrica(d, "cpu");
  const mem = metrica(d, "mem");
  const disco = metrica(d, "disk");
  const veeam = metrica(d, "veeam");
  const evt = metrica(d, "evt");
  const nEvt = alertasDeEventos(evt);
  const os = survey?.os?.nombre as string | undefined;
  const upd = agente ? UPD_TXT[agente.estado] : null;

  return (
    <tr className={"mng-fila" + (d.stale ? " mudo" : "")} tabIndex={0} onClick={onAbrir}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
        style={{ "--acento": color } as React.CSSProperties}>
      <td className="mng-td-punto"><span className={"mng-punto" + (d.stale ? " mng-late" : "")} style={{ background: color }} /></td>

      <td>
        <div className="mng-celda-srv">
          <span className="mng-srv-ico" style={{ color }}>{I.server(color)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="mng-srv-nombre">{d.name}</div>
            <div className="mng-srv-id">#{d.deviceId} · {d.ip || "sin ip"}</div>
          </div>
        </div>
      </td>

      <td>
        <span className="mng-pill" style={{ color, borderColor: color + "55", background: color + "12" }}>
          <span className="mng-punto" style={{ background: color }} />{etiquetaEstado(d)}
        </span>
      </td>

      <td className="mng-td-c"><Medidor v={cpu?.value} /></td>
      <td className="mng-td-c"><Medidor v={mem?.value} /></td>
      <td className="mng-td-c"><Medidor v={disco?.value} etiqueta={unidad(disco?.value)} /></td>

      <td className="mng-td-c">
        {total > 0 ? (
          <div className="mng-celda-sensores" title={`${d.ok} en orden · ${d.warn} atención · ${d.crit} críticos`}>
            <div className="mng-barra">
              {d.crit > 0 && <span style={{ flex: d.crit, background: ROJO }} />}
              {d.warn > 0 && <span style={{ flex: d.warn, background: AMBAR }} />}
              {d.ok > 0 && <span style={{ flex: d.ok, background: d.stale ? GRIS : VERDE, opacity: d.stale ? 0.5 : 1 }} />}
            </div>
            <div className="mng-celda-cuentas">
              <b style={{ color: d.crit ? ROJO : "var(--muted-foreground)" }}>{d.crit}</b>
              <b style={{ color: d.warn ? AMBAR : "var(--muted-foreground)" }}>{d.warn}</b>
              <span>de {total}</span>
            </div>
          </div>
        ) : <span className="mng-td-vacio">—</span>}
      </td>

      <td>
        {veeam ? (
          <span className="mng-mini-estado" style={{ color: STATE_COLOR[veeam.state] || GRIS }}>
            {I.escudo(STATE_COLOR[veeam.state] || GRIS)}
            <span title={veeam.label || "Respaldos"}>{veeam.value}</span>
          </span>
        ) : <span className="mng-td-vacio" title="Este servidor no reporta el sensor de respaldos">sin Veeam</span>}
      </td>

      <td className="mng-td-c">
        {nEvt == null ? <span className="mng-td-vacio">—</span> : (
          <span className="mng-conteo" style={{ color: nEvt ? (STATE_COLOR[evt!.state] || AMBAR) : "var(--muted-foreground)" }}
                title={evt!.value}>
            {nEvt}
          </span>
        )}
      </td>

      <td>
        {os ? <span className="mng-so" title={os}>{os.replace(/^Microsoft\s+/i, "").replace(/\s+Standard| Datacenter/i, "")}</span>
            : <span className="mng-td-vacio">—</span>}
      </td>

      <td>
        {agente?.version ? (
          <span className={"mng-chip" + (agente.estado === "al-dia" || agente.estado === "desconocida" ? "" : " mng-chip-azul")}
                title={agente.estado === "fallo" ? agente.error : upd?.t}>
            v{agente.version}{agente.estado === "fallo" ? " ⚠" : agente.estado === "hay-nueva" ? " ↑" : ""}
          </span>
        ) : <span className="mng-td-vacio">—</span>}
      </td>

      <td>
        <span className="mng-visto" style={{ color: d.stale ? ROJO : "var(--muted-foreground)" }}
              title={reloj(d.lastSeen)}>
          {I.reloj(d.stale ? ROJO : "var(--muted-foreground)")} {ago(d.lastSeen)}
        </span>
      </td>

      <td className="mng-td-punto"><span className="mng-chevron">{I.chevron()}</span></td>
    </tr>
  );
}

/** Fichas del encabezado del cajón: los cinco datos que uno busca primero. */
function Ficha({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="mng-ficha">
      <span>{k}</span>
      <strong style={mono ? { fontFamily: "ui-monospace,monospace", fontSize: 12.5 } : undefined} title={v}>{v}</strong>
    </div>
  );
}
function FichaCarga({ k, v }: { k: string; v?: string }) {
  return (
    <div className="mng-ficha mng-ficha-carga">
      <span>{k}</span>
      <Medidor v={v} />
    </div>
  );
}

/* ═════════════════════════════════════════════════ cajón ══ */
type Pestana = "sensores" | "respaldos" | "eventos" | "relevamiento" | "encargos" | "agente";

function Cajon({ d, survey, agente, ultima, onRecargarAgentes, busy, onCerrar, onRegen, onDeadopt, onBorrar }: {
  d: AdoptedDevice; survey?: Survey; agente?: AgenteVersion; ultima: Release | null;
  onRecargarAgentes: () => void; busy: string | null;
  onCerrar: () => void; onRegen: () => void; onDeadopt: () => void; onBorrar: () => void;
}) {
  const [pest, setPest] = useState<Pestana>("sensores");
  const color = d.stale ? ROJO : STATE_COLOR[d.state] || GRIS;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  return (
    <div className="mng-velo" onClick={onCerrar}>
      <aside className="mng-cajon" onClick={(e) => e.stopPropagation()}>
        <header className="mng-cajon-cab">
          <span className="mng-srv-ico" style={{ color }}>{I.server(color)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{d.name}</div>
            <div className="mng-srv-id">#{d.deviceId} · monitor {d.monitorId} · {d.ip || "sin ip"}</div>
          </div>
          <button className="mng-btn-fantasma" onClick={onCerrar} title="Cerrar (Esc)">{I.x()}</button>
        </header>

        <div className="mng-cajon-estado" style={{ borderColor: color + "40", background: color + "0e" }}>
          <span className="mng-pill" style={{ color, borderColor: color + "55", background: color + "14" }}>
            <span className={"mng-punto" + (d.stale ? " mng-late" : "")} style={{ background: color }} />{etiquetaEstado(d)}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
            último reporte {ago(d.lastSeen)} · {reloj(d.lastSeen)}
          </span>
          <div style={{ flex: 1 }} />
          <SensorCuenta n={d.ok} color={VERDE} />
          <SensorCuenta n={d.warn} color={AMBAR} />
          <SensorCuenta n={d.crit} color={ROJO} />
        </div>

        {/* Los datos que uno busca antes de abrir ninguna pestaña. */}
        <div className="mng-fichas">
          <FichaCarga k="CPU" v={metrica(d, "cpu")?.value} />
          <FichaCarga k="Memoria" v={metrica(d, "mem")?.value} />
          <FichaCarga k="Disco" v={metrica(d, "disk")?.value} />
          <Ficha k="Sistema" v={(survey?.os?.nombre as string) || "sin relevar"} />
          <Ficha k="Dirección" v={d.ip || "sin ip"} mono />
          <Ficha k="Agente" v={agente?.version ? "v" + agente.version : "desconocida"} mono />
        </div>

        <nav className="mng-pestanas">
          <Pest a={pest} id="sensores" set={setPest} icono={I.cpu()} texto="Sensores" n={d.metrics.length} />
          <Pest a={pest} id="respaldos" set={setPest} icono={I.escudo()} texto="Respaldos" />
          <Pest a={pest} id="eventos" set={setPest} icono={I.alerta()} texto="Eventos" />
          <Pest a={pest} id="relevamiento" set={setPest} icono={I.box()} texto="Relevamiento" n={survey?.productos?.length} />
          <Pest a={pest} id="encargos" set={setPest} icono={I.radar()} texto="Encargos" />
          <Pest a={pest} id="agente" set={setPest} icono={I.refresh()} texto="Agente" />
        </nav>

        <div className="mng-cajon-cuerpo">
          {pest === "sensores" && <VistaSensores d={d} />}
          {pest === "respaldos" && <VistaRespaldos d={d} />}
          {pest === "eventos" && <VistaEventos d={d} />}
          {pest === "relevamiento" && <VistaRelevamiento survey={survey} d={d} />}
          {pest === "encargos" && <VistaEncargos d={d} />}
          {pest === "agente" && <VistaAgente d={d} agente={agente} ultima={ultima} onRecargar={onRecargarAgentes} />}
        </div>

        <footer className="mng-cajon-pie">
          <button className="mng-btn-fantasma mng-ancho" onClick={onRegen} disabled={busy === d.deviceId + "regen-token"}>{I.key()} Regenerar token</button>
          <button className="mng-btn-fantasma mng-ancho" onClick={onDeadopt} disabled={busy === d.deviceId + "deadopt"}>{I.unlink()} De-adoptar</button>
          <button className="mng-btn-fantasma mng-peligro" onClick={onBorrar} title="Eliminar">{I.trash()}</button>
        </footer>
      </aside>
    </div>
  );
}

function Pest({ a, id, set, icono, texto, n }: { a: Pestana; id: Pestana; set: (p: Pestana) => void; icono: React.ReactNode; texto: string; n?: number }) {
  const act = a === id;
  return (
    <button className={"mng-pest" + (act ? " act" : "")} onClick={() => set(id)}>
      {icono}{texto}
      {n != null && n > 0 && <span className="mng-pest-n">{n}</span>}
    </button>
  );
}

/* ── sensores ── */
function VistaSensores({ d }: { d: AdoptedDevice }) {
  if (!d.metrics.length) return <Vacio texto="Sin métricas todavía." sub="El agente todavía no envió ningún sensor. Revisá que tenga sensores habilitados en su consola local." />;
  const orden = [...d.metrics].sort((a, b) => (ORDEN_ESTADO[a.state] ?? 9) - (ORDEN_ESTADO[b.state] ?? 9));
  return (
    <div className="mng-sensores">
      {orden.map((m) => {
        const c = STATE_COLOR[m.state] || GRIS;
        return (
          <div key={m.id} className="mng-sensor" style={{ borderLeftColor: c }}>
            <div className="mng-sensor-cab">
              <span className="mng-punto" style={{ background: c }} />
              <span className="mng-sensor-nom">{m.label || m.id}</span>
              <code className="mng-sensor-id">{m.id}</code>
            </div>
            <div className="mng-sensor-val" style={{ color: m.state === "ok" ? "var(--foreground)" : c }}>{m.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── respaldos (Veeam) ── */
const RESULTADO_JOB: Record<string, { t: string; c: string }> = {
  success: { t: "correcto", c: VERDE },
  warning: { t: "con avisos", c: AMBAR },
  failed: { t: "FALLÓ", c: ROJO },
  none: { t: "sin correr", c: GRIS },
};
function estadoJob(s: string): { t: string; c: string } {
  const k = String(s || "").toLowerCase();
  if (/success/.test(k)) return RESULTADO_JOB.success;
  if (/warn/.test(k)) return RESULTADO_JOB.warning;
  if (/fail/.test(k)) return RESULTADO_JOB.failed;
  return RESULTADO_JOB.none;
}

function VistaRespaldos({ d }: { d: AdoptedDevice }) {
  const [det, setDet] = useState<any | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    apiFetch<{ detalle: any }>(apiUrl(`/api/monitor-ng/detalle?tipo=veeam&deviceId=${d.deviceId}`)).then(({ data }) => {
      if (!vivo) return;
      setDet(data?.detalle || null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [d.deviceId]);

  if (cargando) return <p className="mng-nota">Cargando…</p>;
  if (!det || !det.jobs?.length) {
    return <Vacio
      texto="Este servidor no reporta jobs de Veeam."
      sub="O no tiene Veeam instalado, o el agente no pudo cargar el módulo de PowerShell de Veeam. El sensor necesita Veeam.Backup.PowerShell (o el snap-in viejo) y que el agente corra como administrador." />;
  }

  const jobs: any[] = det.jobs;
  const fallados = jobs.filter((j) => /fail/i.test(j.ultimoEstado)).length;
  const avisos = jobs.filter((j) => /warn/i.test(j.ultimoEstado)).length;
  const bien = jobs.length - fallados - avisos;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="mng-resumen-jobs">
        <Cuenta n={bien} t="correctos" c={VERDE} />
        <Cuenta n={avisos} t="con avisos" c={AMBAR} />
        <Cuenta n={fallados} t="fallados" c={ROJO} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          leído {ago(det.at)}{det.nivel === 1 ? "" : " · sin acceso a la lista de jobs"}
        </span>
      </div>

      <div className="mng-jobs">
        {jobs.map((j, i) => {
          const e = estadoJob(j.ultimoEstado);
          const fin = j.ultimoFin ? Date.parse(j.ultimoFin) : 0;
          const viejo = fin ? Date.now() - fin > 26 * 3600000 : false;
          return (
            <div key={i} className="mng-job" style={{ borderLeftColor: e.c }}>
              <div className="mng-job-cab">
                <span className="mng-punto" style={{ background: e.c }} />
                <span className="mng-job-nom">{j.nombre}</span>
                <span className="mng-pill" style={{ color: e.c, borderColor: e.c + "55", background: e.c + "12" }}>{e.t}</span>
              </div>
              <div className="mng-job-datos">
                <span><em>corrió</em> {fin ? ago(fin) : "nunca"}{fin ? ` · ${reloj(fin)}` : ""}</span>
                {j.minutos > 0 && <span><em>tardó</em> {j.minutos} min</span>}
                {j.gb > 0 && <span><em>transfirió</em> {j.gb} GB</span>}
                {j.proxima && <span><em>próxima</em> {j.proxima}</span>}
                {j.tipo && <span><em>tipo</em> {j.tipo}</span>}
              </div>
              {viejo && /success/i.test(j.ultimoEstado) && (
                <div className="mng-job-aviso">Dio correcto, pero hace más de 26 h que no corre.</div>
              )}
            </div>
          );
        })}
      </div>

      {det.ultimoBueno && (
        <p className="mng-nota">Último respaldo correcto de todo el servidor: {reloj(Date.parse(det.ultimoBueno))}.</p>
      )}
    </div>
  );
}

function Cuenta({ n, t, c }: { n: number; t: string; c: string }) {
  return (
    <span className="mng-cuenta" style={{ color: c, opacity: n ? 1 : 0.4 }}>
      <span className="mng-punto" style={{ background: c }} />{n} {t}
    </span>
  );
}

/* ── eventos del visor de Windows ── */

/** Qué significa cada evento, en castellano y sin jerga.
 *  El visor de Windows dice "4625"; acá dice qué pasó, por qué aparece y qué mirar.
 *  Fuente: documentación de Microsoft, resumida a lo que importa operativamente. */
const EXPLICA: Record<number, { t: string; q: string; mirar?: string }> = {
  4624: { t: "Inicio de sesión correcto", q: "Alguien entró al servidor. El tipo de inicio dice por dónde: consola, red, servicio o escritorio remoto." },
  4625: { t: "Inicio de sesión fallido", q: "Se intentó entrar con una contraseña que no corresponde. Muchos seguidos y desde el mismo origen es un ataque de fuerza bruta; muchos del mismo usuario suele ser una contraseña vencida guardada en un servicio o una tarea programada.", mirar: "El usuario y el origen. Si el origen es una IP de internet y el equipo tiene el escritorio remoto publicado, hay que cerrarlo o dejarlo detrás de la VPN." },
  4634: { t: "Cierre de sesión", q: "Terminó una sesión. Informativo." },
  4647: { t: "Cierre de sesión iniciado por el usuario", q: "El usuario cerró sesión a propósito. Informativo." },
  4648: { t: "Inicio de sesión con credenciales explícitas", q: "Un proceso usó un usuario distinto al de la sesión (un «ejecutar como»). Normal en tareas y servicios; sospechoso si aparece de golpe en un equipo donde nadie administra." },
  4672: { t: "Privilegios de administrador asignados", q: "La sesión que acaba de abrirse tiene permisos administrativos.", mirar: "Que el usuario sea uno esperado. Un 4672 de una cuenta común no está bien." },
  4720: { t: "Se creó una cuenta de usuario", q: "Apareció un usuario nuevo en el equipo o en el dominio.", mirar: "Si nadie lo creó a propósito, es la señal clásica de una intrusión que quiere dejarse una puerta." },
  4722: { t: "Se habilitó una cuenta", q: "Una cuenta que estaba deshabilitada volvió a quedar operativa." },
  4723: { t: "Cambio de contraseña por el propio usuario", q: "El usuario cambió su contraseña." },
  4724: { t: "Un administrador reseteó una contraseña", q: "Alguien con permisos le puso una contraseña nueva a otra cuenta.", mirar: "Quién la reseteó y a quién. Un reseteo no pedido sobre una cuenta de servicio rompe cosas y puede ser un secuestro de cuenta." },
  4725: { t: "Se deshabilitó una cuenta", q: "La cuenta quedó fuera de servicio." },
  4726: { t: "Se eliminó una cuenta de usuario", q: "Desapareció un usuario del equipo o del dominio." },
  4728: { t: "Se agregó un usuario a un grupo global", q: "Alguien sumó una cuenta a un grupo — normalmente para darle permisos.", mirar: "Si el grupo es «Administradores» o «Admins. del dominio», hay que confirmar que estaba previsto." },
  4732: { t: "Se agregó un usuario a un grupo local", q: "Una cuenta ganó permisos en este equipo.", mirar: "Si el grupo es «Administradores», confirmarlo con quien administra." },
  4738: { t: "Se modificó una cuenta de usuario", q: "Cambió algo de la cuenta: nombre, expiración, banderas de contraseña." },
  4719: { t: "Cambió la política de auditoría", q: "Se modificó qué cosas registra Windows.", mirar: "Es el paso previo clásico a hacer algo sin dejar rastro. Si nadie tocó las políticas, revisarlo." },
  1102: { t: "Se borró el registro de seguridad", q: "Alguien vació el log de seguridad completo.", mirar: "Windows no lo hace solo. Es una acción deliberada y casi siempre para tapar algo." },
  7045: { t: "Se instaló un servicio nuevo", q: "Apareció un servicio que antes no estaba.", mirar: "Puede ser una instalación legítima (un agente, un motor de base de datos) o la persistencia de un malware. El nombre y la ruta del ejecutable lo aclaran." },
  7031: { t: "Un servicio terminó inesperadamente", q: "Un servicio se cayó y Windows aplicó su acción de recuperación (normalmente reiniciarlo).", mirar: "Cuál servicio y cuántas veces. Repetido, es un problema real, no un tropezón." },
  7034: { t: "Un servicio se cerró sin avisar", q: "Un servicio terminó de forma anormal y sin acción de recuperación configurada." },
  7036: { t: "Un servicio cambió de estado", q: "Un servicio arrancó o se detuvo. Informativo y muy frecuente." },
  41: { t: "El equipo se reinició sin apagarse bien", q: "Windows arrancó sin haber cerrado la sesión anterior: corte de energía, cuelgue, pantalla azul o un apagado forzado.", mirar: "Si se repite, mirar la alimentación (UPS), la temperatura y el visor de errores de hardware." },
  6008: { t: "Apagado inesperado", q: "El equipo anterior no se apagó de forma ordenada. Es la cara visible de un corte o un cuelgue." },
  6005: { t: "Arrancó el registro de eventos", q: "Equivale a «el equipo arrancó». Informativo." },
  6006: { t: "Se detuvo el registro de eventos", q: "Equivale a «el equipo se apagó ordenadamente». Informativo." },
  1074: { t: "Apagado o reinicio pedido", q: "Un usuario o un proceso pidió apagar o reiniciar.", mirar: "El evento dice quién y qué programa lo pidió; sirve para saber si fue Windows Update, una persona o un script." },
  7: { t: "Bloque defectuoso en el disco", q: "El disco encontró un sector que no puede leer.", mirar: "Es una advertencia temprana de disco que se está muriendo. Hay que mirar el SMART y tener el respaldo al día." },
  51: { t: "Error de paginación al disco", q: "Windows no pudo escribir o leer en el disco durante una operación de memoria virtual.", mirar: "Suele acompañar a un disco o un cable con problemas." },
  129: { t: "Se reinició la controladora de disco", q: "La controladora dejó de responder y el driver la reinició.", mirar: "Latencia alta, cables, firmware de la controladora o un disco que cuelga el bus." },
  153: { t: "Una operación de disco falló y se reintentó", q: "La E/S no salió a la primera; el sistema la repitió.", mirar: "Aislado no dice nada. Repetido es el mismo cuadro que el 7 y el 129." },
  1000: { t: "Una aplicación se cerró por error", q: "Un programa terminó de forma anormal. El evento trae el ejecutable, el módulo que falló y el código de excepción.", mirar: "Cuál programa y con qué frecuencia. El módulo suele apuntar directo a la causa." },
  1001: { t: "Informe de error de Windows", q: "Windows registró el detalle del fallo anterior para su reporte de errores." },
  10016: { t: "Permisos de DCOM", q: "Un componente pidió permisos DCOM que no tiene. Muy común y casi siempre inofensivo." },
};

/** Por dónde entró la sesión. Windows lo manda como número. */
const TIPO_LOGON: Record<string, string> = {
  "2": "consola (teclado del equipo)",
  "3": "red (recurso compartido)",
  "4": "tarea programada",
  "5": "servicio",
  "7": "desbloqueo de pantalla",
  "8": "red con contraseña en claro",
  "9": "credenciales nuevas (ejecutar como)",
  "10": "escritorio remoto",
  "11": "credenciales en caché",
};

const NIVEL: Record<number, { t: string; c: string }> = {
  1: { t: "crítico", c: ROJO },
  2: { t: "error", c: ROJO },
  3: { t: "advertencia", c: AMBAR },
  4: { t: "información", c: GRIS },
  0: { t: "información", c: GRIS },
};

const REGISTRO: Record<string, string> = { Security: "Seguridad", System: "Sistema", Application: "Aplicación" };

/** Qué ids mira cada regla del agente: sirve para que el chip del resumen filtre de verdad. */
const REGLA_IDS: Record<string, number[]> = {
  logonfail: [4625], logclear: [1102], auditpol: [4719],
  accounts: [4720, 4722, 4723, 4724, 4725, 4726, 4728, 4732, 4738],
  newservice: [7045], dirtyboot: [41, 6008], svccrash: [7031, 7034],
  diskerr: [7, 51, 129, 153], appcrash: [1000, 1001], bootlog: [6005, 6006, 1074],
};

function fechaEvento(e: any): number {
  const v = e?.time ?? e?.at;
  if (!v) return 0;
  const n = typeof v === "number" ? v : Date.parse(v);
  return isFinite(n) ? n : 0;
}

function VistaEventos({ d }: { d: AdoptedDevice }) {
  const [det, setDet] = useState<any | null>(null);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [registro, setRegistro] = useState("todos");
  const [gravedad, setGravedad] = useState("todas");
  const [regla, setRegla] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    apiFetch<{ detalle: any }>(apiUrl(`/api/monitor-ng/detalle?tipo=eventos&deviceId=${d.deviceId}`)).then(({ data }) => {
      if (!vivo) return;
      setDet(data?.detalle || null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [d.deviceId]);

  const todos: any[] = useMemo(
    () => [...((det?.recientes as any[]) || [])].sort((a, b) => fechaEvento(b) - fechaEvento(a)),
    [det]
  );

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const ids = regla ? REGLA_IDS[regla] : null;
    return todos.filter((e) => {
      if (registro !== "todos" && e.log !== registro) return false;
      if (gravedad === "errores" && !(e.level === 1 || e.level === 2)) return false;
      if (gravedad === "avisos" && e.level !== 3) return false;
      if (ids && ids.indexOf(Number(e.id)) < 0) return false;
      if (!t) return true;
      const ex = EXPLICA[Number(e.id)];
      return (
        String(e.id).includes(t) ||
        (e.msg || "").toLowerCase().includes(t) ||
        (e.user || "").toLowerCase().includes(t) ||
        (e.ip || "").toLowerCase().includes(t) ||
        (e.provider || "").toLowerCase().includes(t) ||
        (ex?.t || "").toLowerCase().includes(t)
      );
    });
  }, [todos, q, registro, gravedad, regla]);

  if (cargando) return <p className="mng-nota">Cargando…</p>;
  if (!todos.length) {
    return <Vacio
      texto="No hay eventos guardados de este servidor."
      sub="Es una buena noticia: el agente solo sube los eventos que caen en alguna regla activa (fallos de servicio, errores de disco, cuentas, apagados inesperados). Si acabás de adoptarlo, esperá al primer reporte con novedades." />;
  }

  const nCrit = todos.filter((e) => e.level === 1 || e.level === 2).length;
  const nWarn = todos.filter((e) => e.level === 3).length;
  const seguridad = todos.filter((e) => e.log === "Security").length;
  const hayFiltro = Boolean(q || registro !== "todos" || gravedad !== "todas" || regla);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      {/* de un vistazo */}
      <div className="mng-evt-kpis">
        <div className="mng-evt-kpi"><b style={{ color: nCrit ? ROJO : "var(--foreground)" }}>{nCrit}</b><span>errores</span></div>
        <div className="mng-evt-kpi"><b style={{ color: nWarn ? AMBAR : "var(--foreground)" }}>{nWarn}</b><span>advertencias</span></div>
        <div className="mng-evt-kpi"><b>{seguridad}</b><span>de seguridad</span></div>
        <div className="mng-evt-kpi"><b>{todos.length}</b><span>guardados</span></div>
        <div style={{ flex: 1 }} />
        <span className="mng-nota">leído {ago(det?.at)}</span>
      </div>

      {/* reglas que dispararon */}
      {(det?.resumen?.length || 0) > 0 && (
        <div className="mng-chips">
          {det.resumen.map((h: any) => {
            const c = STATE_COLOR[h.state] || GRIS;
            const act = regla === h.id;
            return (
              <button key={h.id} className={"mng-chip mng-chip-btn" + (act ? " act" : "")}
                style={act ? { borderColor: c, color: c, background: c + "1a" } : { borderColor: c + "55", color: c }}
                onClick={() => setRegla(act ? null : h.id)}
                title={act ? "Quitar el filtro" : "Ver solo estos eventos"}>
                {h.label} · {h.count}
              </button>
            );
          })}
        </div>
      )}

      {/* filtros */}
      <div className="mng-evt-filtros">
        <div className="mng-buscador" style={{ flex: 1, minWidth: 190 }}>
          {I.lupa("var(--muted-foreground)")}
          <input className="mng-input mng-input-limpio" placeholder="Buscar por texto, id, usuario u origen…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="mng-input mng-select" value={registro} onChange={(e) => setRegistro(e.target.value)} aria-label="Registro">
          <option value="todos">Todos los registros</option>
          <option value="Security">Seguridad</option>
          <option value="System">Sistema</option>
          <option value="Application">Aplicación</option>
        </select>
        <select className="mng-input mng-select" value={gravedad} onChange={(e) => setGravedad(e.target.value)} aria-label="Gravedad">
          <option value="todas">Toda gravedad</option>
          <option value="errores">Solo errores</option>
          <option value="avisos">Solo advertencias</option>
        </select>
        {hayFiltro && (
          <button className="mng-btn-fantasma" onClick={() => { setQ(""); setRegistro("todos"); setGravedad("todas"); setRegla(null); }}>
            {I.x()} Limpiar
          </button>
        )}
      </div>

      <div className="mng-eventos">
        {lista.slice(0, 120).map((e: any, i: number) => {
          const idn = Number(e.id);
          const ex = EXPLICA[idn];
          const niv = NIVEL[e.level] || NIVEL[4];
          const c = e.level === 1 || e.level === 2 ? ROJO : e.level === 3 ? AMBAR : GRIS;
          const ts = fechaEvento(e);
          const abiertoEste = abierto === i;
          return (
            <div key={e.record ?? i} className="mng-evento" style={{ borderLeftColor: c }}>
              <button className="mng-evento-cab mng-evento-btn" onClick={() => setAbierto(abiertoEste ? null : i)}
                      aria-expanded={abiertoEste}>
                <span className="mng-nivel" style={{ color: c, borderColor: c + "55", background: c + "12" }}>{niv.t}</span>
                <span className="mng-evento-tit">{ex?.t || e.msg || `Evento ${e.id}`}</span>
                <code className="mng-evt-id">{REGISTRO[e.log] || e.log || "?"} · {e.id}</code>
                <span className="mng-evento-fecha">{ts ? reloj(ts) : "sin fecha"}</span>
                <span className={"mng-chevron" + (abiertoEste ? " abajo" : "")}>{I.chevron()}</span>
              </button>

              {(e.user || e.ip || e.logonType) && (
                <div className="mng-evento-quien">
                  {e.user && <span><em>usuario</em> {e.user}</span>}
                  {e.ip && <span><em>origen</em> {e.ip}</span>}
                  {e.logonType && <span><em>entró por</em> {TIPO_LOGON[String(e.logonType)] || `tipo ${e.logonType}`}</span>}
                </div>
              )}

              {abiertoEste && (
                <div className="mng-evento-detalle">
                  {ex ? (
                    <>
                      <p className="mng-evento-qes"><strong>Qué es.</strong> {ex.q}</p>
                      {ex.mirar && <p className="mng-evento-qes"><strong>Qué mirar.</strong> {ex.mirar}</p>}
                    </>
                  ) : (
                    <p className="mng-evento-qes">
                      No tengo una explicación cargada para el evento {e.id} de {REGISTRO[e.log] || e.log}.
                      El texto de Windows está abajo; el proveedor que lo emitió es <code>{e.provider || "desconocido"}</code>.
                    </p>
                  )}
                  {e.msg && <div className="mng-evento-msg">{e.msg}</div>}
                  <div className="mng-evento-quien">
                    <span><em>proveedor</em> {e.provider || "—"}</span>
                    <span><em>registro</em> {e.record ?? "—"}</span>
                    <span><em>nivel</em> {e.level ?? "—"}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {lista.length === 0 && <p className="mng-nota">Nada coincide con ese filtro.</p>}
        {lista.length > 120 && <p className="mng-nota">Se muestran los 120 más recientes de {lista.length}.</p>}
      </div>

      <p className="mng-nota">
        {hayFiltro ? `${lista.length} de ${todos.length} eventos · ` : `${todos.length} eventos · `}
        es lo que el agente guardó y subió cuando cambió, no una consulta en vivo: el controlador no puede
        entrar a leer el visor de eventos de ese servidor.
      </p>
    </div>
  );
}

/* ── relevamiento ── */
function VistaRelevamiento({ survey, d }: { survey?: Survey; d: AdoptedDevice }) {
  if (!survey) {
    return <Vacio
      texto="Todavía no llegó el relevamiento."
      sub={d.stale
        ? "El agente está mudo. Cuando vuelva a reportar mandará el relevamiento."
        : "El agente releva el servidor al arrancar y cada 12 h, y lo sube solo cuando cambia. Si acabás de adoptarlo, puede tardar un par de minutos."} />;
  }
  const os = survey.os || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="mng-micro">Equipo</div>
        <div className="mng-datos">
          <Dato k="Sistema" v={`${os.nombre || "—"}${os.build ? " (build " + os.build + ")" : ""}`} />
          <Dato k="Modelo" v={[os.fabricante, os.modelo].filter(Boolean).join(" ") || "—"} />
          <Dato k="CPU / RAM" v={`${os.cpus ?? "—"} núcleos · ${gb(os.ramGB)}`} />
          <Dato k="Dominio" v={os.enDominio ? os.dominio : `${os.dominio || "—"} (fuera de dominio)`} />
          <Dato k="Encendido desde" v={os.arranque ? new Date(os.arranque).toLocaleString("es-UY") : "—"} />
          <Dato k="Relevado" v={`${reloj(survey.at)} · recibido ${ago(survey.recibido)}`} />
        </div>
      </div>

      {survey.volumenes?.length > 0 && (
        <div>
          <div className="mng-micro">Volúmenes</div>
          <div className="mng-vols">
            {survey.volumenes.map((v: any, i: number) => {
              const libre = Number(v.libreGb ?? v.libreGB ?? 0);
              const tot = Number(v.gb ?? v.totalGB ?? 0);
              const usadoPct = tot > 0 ? Math.round(((tot - libre) / tot) * 100) : 0;
              const c = usadoPct >= 93 ? ROJO : usadoPct >= 85 ? AMBAR : VERDE;
              return (
                <div key={i} className="mng-vol">
                  <div className="mng-vol-cab">
                    <strong>{v.id || "?"}{v.etiqueta ? " · " + v.etiqueta : ""}</strong>
                    <span style={{ color: "var(--muted-foreground)" }}>{gb(libre)} libres de {gb(tot)}</span>
                  </div>
                  <div className="mng-vol-barra"><span style={{ width: usadoPct + "%", background: c }} /></div>
                  <div style={{ fontSize: 11, color: c, fontWeight: 600 }}>{usadoPct}% usado</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mng-micro">Qué corre en este servidor</div>
        {survey.productos?.length ? (
          <div className="mng-productos">
            {survey.productos.map((p) => (
              <div key={p.clave} className="mng-producto">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                    <code>{p.clave}</code>{p.version ? ` · v${p.version}` : ""}{p.evidencia ? ` · por ${p.evidencia}` : ""}
                  </div>
                  {p.servicios?.length ? (
                    <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 2 }}>
                      {p.servicios.slice(0, 3).map((s2) => (
                        <span key={s2.nombre} style={{ marginRight: 10 }}>
                          <span className="mng-punto" style={{ background: s2.estado === "Running" ? VERDE : ROJO, marginRight: 4 }} />
                          {s2.nombre}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {p.sensores?.length ? (
                  <div className="mng-chips">
                    {p.sensores.map((s) => <span key={s} className="mng-chip mng-chip-azul">{s}</span>)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : <p className="mng-nota">No reconoció ningún producto conocido en este servidor.</p>}
      </div>

      {survey.roles?.length > 0 && (
        <div>
          <div className="mng-micro">Roles de Windows</div>
          <div className="mng-chips">{survey.roles.map((r) => <span key={r} className="mng-chip">{r}</span>)}</div>
        </div>
      )}
    </div>
  );
}

/* ── encargos ── */
const TIPOS = [
  { id: "ping", nom: "Ping", ayuda: "IP o nombre" },
  { id: "tcp", nom: "Puerto TCP", ayuda: "IP o nombre" },
  { id: "http", nom: "HTTP", ayuda: "https://…" },
  { id: "dns", nom: "DNS", ayuda: "nombre a resolver" },
  { id: "traceroute", nom: "Traceroute", ayuda: "IP o nombre" },
  { id: "scan", nom: "Barrido de red", ayuda: "192.168.1.0/24 o 192.168.1.10-200" },
];
const ESTADO_ENCARGO: Record<string, { t: string; c: string }> = {
  pendiente: { t: "en cola", c: AZUL },
  enviado: { t: "el agente lo tomó", c: AZUL_CLARO },
  listo: { t: "listo", c: VERDE },
  error: { t: "error", c: ROJO },
  expirado: { t: "nunca volvió", c: GRIS },
};

function VistaEncargos({ d }: { d: AdoptedDevice }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tipo, setTipo] = useState("ping");
  const [destino, setDestino] = useState("");
  const [puerto, setPuerto] = useState("443");
  const [puertos, setPuertos] = useState("80,443,3389");
  const [err, setErr] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await apiFetch<{ jobs: Job[] }>(apiUrl(`/api/monitor-ng/jobs?deviceId=${d.deviceId}`));
    if (data?.jobs) setJobs(data.jobs);
  }, [d.deviceId]);

  useEffect(() => { cargar(); const t = setInterval(cargar, 5000); return () => clearInterval(t); }, [cargar]);

  const encargar = async () => {
    setErr(null); setEnviando(true);
    const cuerpo: any = { deviceId: d.deviceId, tipo };
    if (tipo === "scan") { cuerpo.rango = destino.trim(); cuerpo.puertos = puertos.split(",").map((p) => Number(p.trim())).filter(Boolean); }
    else if (tipo === "http") cuerpo.url = destino.trim();
    else { cuerpo.destino = destino.trim(); if (tipo === "tcp") cuerpo.puerto = Number(puerto); }
    const { error } = await apiFetch(apiUrl("/api/monitor-ng/jobs"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    setEnviando(false);
    if (error) { setErr(error); return; }
    setDestino("");
    cargar();
  };

  const cancelar = async (id: string) => {
    await apiFetch(apiUrl("/api/monitor-ng/jobs"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", id }),
    });
    cargar();
  };

  const tdef = TIPOS.find((t) => t.id === tipo)!;
  const abierto = jobs.find((j) => j.id === detalle);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p className="mng-nota">
        Desde acá no ejecutamos nada en el servidor: dejamos el encargo en cola y el agente lo levanta
        en su próximo reporte (hasta 30 s) y devuelve el resultado en el siguiente.
      </p>

      <div className="mng-form">
        <div className="mng-form-fila">
          <select value={tipo} onChange={(e) => { setTipo(e.target.value); setErr(null); }} className="mng-input" style={{ maxWidth: 168 }}>
            {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
          <input className="mng-input" style={{ flex: 1, minWidth: 150 }} placeholder={tdef.ayuda}
            value={destino} onChange={(e) => setDestino(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && destino.trim()) encargar(); }} />
          {tipo === "tcp" && <input className="mng-input" style={{ width: 88 }} placeholder="puerto" value={puerto} onChange={(e) => setPuerto(e.target.value)} />}
          <button className="mng-btn-primario" onClick={encargar} disabled={enviando || !destino.trim()}>
            {enviando ? "Encargando…" : "Encargar"}
          </button>
        </div>
        {tipo === "scan" && (
          <div className="mng-form-fila">
            <label className="mng-micro" style={{ alignSelf: "center", margin: 0 }}>Puertos a probar</label>
            <input className="mng-input" style={{ flex: 1 }} value={puertos} onChange={(e) => setPuertos(e.target.value)} placeholder="80,443,3389" />
          </div>
        )}
        {err && <div className="mng-error" style={{ margin: 0 }}>{err}</div>}
      </div>

      {jobs.length === 0 ? (
        <Vacio texto="Todavía no le encargaste nada a este servidor." sub="Un barrido de una /24 tarda unos segundos y devuelve IP, MAC cuando hay, nombre y puertos abiertos." />
      ) : (
        <div className="mng-encargos">
          {jobs.map((j) => {
            const e = ESTADO_ENCARGO[j.estado] || { t: j.estado, c: GRIS };
            const vivo = j.estado === "pendiente" || j.estado === "enviado";
            return (
              <div key={j.id} className="mng-encargo" style={{ borderLeftColor: e.c }}>
                <div className="mng-encargo-cab">
                  <span className="mng-tipo">{j.tipo}</span>
                  <span className="mng-encargo-dest">{j.destino}</span>
                  <span className="mng-pill" style={{ color: e.c, borderColor: e.c + "55", background: e.c + "12" }}>
                    {vivo && <span className="mng-punto mng-late" style={{ background: e.c }} />}{e.t}
                  </span>
                </div>
                <div className="mng-encargo-pie">
                  <span style={{ flex: 1 }}>{j.resumen}</span>
                  {j.ms > 0 && <span className="mng-ms">{j.ms} ms</span>}
                  <span style={{ color: "var(--muted-foreground)" }}>{ago(j.creado)}</span>
                  {j.estado === "pendiente" && <button className="mng-link" onClick={() => cancelar(j.id)}>cancelar</button>}
                  {j.resultado && <button className="mng-link" onClick={() => setDetalle(detalle === j.id ? null : j.id)}>{detalle === j.id ? "ocultar" : "ver"}</button>}
                </div>
                {abierto?.id === j.id && <ResultadoEncargo j={j} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultadoEncargo({ j }: { j: Job }) {
  const r = j.resultado;
  if (!r) return null;

  if (j.tipo === "scan" && Array.isArray(r.vivos)) {
    return (
      <div className="mng-resultado">
        <div className="mng-micro" style={{ marginTop: 0 }}>{r.vivos.length} equipos vivos de {r.probados} direcciones</div>
        <div className="mng-tabla-wrap">
          <table className="mng-tabla">
            <thead><tr><th>IP</th><th>ms</th><th>MAC</th><th>Nombre</th><th>Puertos</th></tr></thead>
            <tbody>
              {r.vivos.map((v: any) => (
                <tr key={v.ip}>
                  <td style={{ fontFamily: "ui-monospace, monospace" }}>{v.ip}</td>
                  <td className="mng-num">{v.ms}</td>
                  <td style={{ fontFamily: "ui-monospace, monospace", color: "var(--muted-foreground)" }}>{v.mac || "—"}</td>
                  <td>{v.nombre || "—"}</td>
                  <td>{(v.puertos || []).length ? v.puertos.join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.vivos.some((v: any) => !v.mac) && (
          <p className="mng-nota" style={{ marginTop: 8 }}>
            Los equipos sin MAC están del otro lado de un router: ARP solo ve la red local del agente.
          </p>
        )}
      </div>
    );
  }

  if (j.tipo === "traceroute" && Array.isArray(r.saltos)) {
    return (
      <div className="mng-resultado">
        <ol className="mng-saltos">
          {r.saltos.map((s: any, i: number) => (
            <li key={i}><span className="mng-salto-n">{i + 1}</span><span style={{ fontFamily: "ui-monospace, monospace" }}>{s.ip || s.direccion || "*"}</span><span className="mng-ms">{s.ms != null ? s.ms + " ms" : ""}</span></li>
          ))}
        </ol>
      </div>
    );
  }

  return <div className="mng-resultado"><pre className="mng-json">{JSON.stringify(r, null, 2)}</pre></div>;
}

/* ── agente: version y actualizacion automatica ── */
function VistaAgente({ d, agente, ultima, onRecargar }: {
  d: AdoptedDevice; agente?: AgenteVersion; ultima: Release | null; onRecargar: () => void;
}) {
  const [reintentando, setReintentando] = useState(false);

  const reintentar = async () => {
    setReintentando(true);
    await apiFetch(apiUrl("/api/monitor-ng/agents"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry-update", deviceId: d.deviceId }),
    });
    setReintentando(false);
    onRecargar();
  };

  if (!agente?.version) {
    return <Vacio
      texto="Todavía no sabemos qué versión tiene este agente."
      sub="Las versiones anteriores a la 6.1 no informaban su versión. Cuando este servidor actualice a 6.1 o más nuevo, aparece acá y se mantiene solo." />;
  }

  const e = UPD_TXT[agente.estado] || UPD_TXT["al-dia"];
  const alDia = agente.estado === "al-dia";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="mng-agente" style={{ borderColor: e.c + "45", background: e.c + "0c" }}>
        <div>
          <div className="mng-micro" style={{ margin: 0 }}>Versión instalada</div>
          <div className="mng-agente-v">{agente.version}</div>
        </div>
        <div style={{ flex: 1 }}>
          <span className="mng-pill" style={{ color: e.c, borderColor: e.c + "55", background: e.c + "14" }}>
            {agente.estado === "actualizando" && <span className="mng-punto mng-late" style={{ background: e.c }} />}
            {e.t}
          </span>
          {ultima && (
            <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 6 }}>
              Publicada: <strong>{ultima.version}</strong> · {(ultima.bytes / 1048576).toFixed(0)} MB · {reloj(Date.parse(ultima.updatedAt))}
            </div>
          )}
        </div>
      </div>

      {agente.estado === "fallo" && (
        <div className="mng-error" style={{ margin: 0 }}>
          Falló {agente.intentos} {agente.intentos === 1 ? "vez" : "veces"} al pasar a {agente.objetivo}: {agente.error || "sin detalle"}
          <div style={{ marginTop: 8 }}>
            <button className="mng-btn-fantasma" onClick={reintentar} disabled={reintentando}>
              {I.refresh()} {reintentando ? "Reintentando…" : "Volver a ofrecerla"}
            </button>
          </div>
        </div>
      )}

      <p className="mng-nota">
        {alDia
          ? "Este agente está en la última versión publicada. Cuando subas un instalador más nuevo a public/downloads, lo toma solo en el próximo reporte."
          : "El controlador le ofrece la versión nueva en la bajada del reporte. El agente la baja, verifica el sha256 y se reinstala en silencio: no hay que desinstalar nada y la adopción se mantiene, porque el config vive fuera de la carpeta de instalación."}
      </p>

      <div className="mng-datos">
        <Dato k="Último reporte" v={`${ago(d.lastSeen)} · ${reloj(d.lastSeen)}`} />
        <Dato k="Intentos de actualización" v={agente.intentos ? String(agente.intentos) : "ninguno"} />
        {agente.objetivo && <Dato k="Actualizando a" v={agente.objetivo} />}
        <Dato k="Instalador publicado" v={ultima ? ultima.file : "ninguno"} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════ piezas chicas ══ */
function Kpi({ label, value, color, pulse }: { label: string; value: string; color: string; pulse?: boolean }) {
  return (
    <div className="mng-kpi">
      <div className="mng-kpi-v" style={{ color }}>
        {pulse && <span className="mng-punto mng-late" style={{ background: color }} />}
        {value}
      </div>
      <div className="mng-kpi-l">{label}</div>
    </div>
  );
}
function Titulo({ icono, texto, badge, color }: { icono: React.ReactNode; texto: string; badge?: number; color: string }) {
  return (
    <h2 className="mng-titulo">
      <span style={{ display: "flex" }}>{icono}</span>{texto}
      {badge != null && <span className="mng-badge" style={{ background: color }}>{badge}</span>}
    </h2>
  );
}
function SensorCuenta({ n, color }: { n: number; color: string }) {
  return <span className="mng-cuenta" style={{ color, opacity: n ? 1 : 0.35 }}><span className="mng-punto" style={{ background: color }} />{n}</span>;
}
function Dato({ k, v }: { k: string; v: string }) {
  return <div className="mng-dato"><span>{k}</span><strong>{v}</strong></div>;
}
function Vacio({ texto, sub }: { texto: string; sub?: string }) {
  return (
    <div className="mng-vacio">
      <div style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 13.5 }}>{texto}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--muted-foreground)", lineHeight: 1.55 }}>{sub}</div>}
    </div>
  );
}

/* ═════════════════════════════════════════════════ estilo ══ */
/* Todo sale de los tokens de la app, asi que light y dark salen solos. */
const CSS = `
.mng-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.mng-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${AZUL},#0f3f9e);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${AZUL}45;flex:none}
.mng-kpis{display:flex;gap:8px;flex-wrap:wrap}
.mng-kpi{text-align:center;padding:7px 14px;border-radius:10px;background:var(--surface-card);border:1px solid var(--border);min-width:78px}
.mng-kpi-v{font-size:19px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;font-variant-numeric:tabular-nums}
.mng-kpi-l{font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.5px;margin-top:1px}

.mng-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:8px;margin:18px 0;font-size:13px}
.mng-titulo{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;margin:0 0 14px}
.mng-badge{color:#fff;border-radius:99px;font-size:12px;font-weight:700;padding:1px 9px;font-variant-numeric:tabular-nums}
.mng-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px}
.mng-pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;border:1px solid var(--border);border-radius:99px;padding:3px 10px;white-space:nowrap}
.mng-punto{width:7px;height:7px;border-radius:99px;display:inline-block;flex:none}
.mng-late{animation:mnglate 1.6s infinite}
@keyframes mnglate{0%{opacity:1}50%{opacity:.25}100%{opacity:1}}
.mng-micro{font-size:10.5px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:1px;margin:0 0 8px}
.mng-nota{font-size:12.5px;color:var(--muted-foreground);line-height:1.6;margin:0}

/* alertas */
.mng-alertas{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:8px}
.mng-alerta{display:flex;align-items:center;gap:9px;text-align:left;width:100%;background:var(--card);border:1px solid var(--border);border-left:3px solid;border-radius:10px;padding:9px 12px;cursor:pointer;color:inherit;font:inherit;transition:background .12s,transform .12s}
.mng-alerta:hover{background:var(--surface-hover);transform:translateX(2px)}
.mng-alerta-srv{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38%}
.mng-alerta-sen{font-size:12.5px;color:var(--muted-foreground);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-alerta-val{font-size:12.5px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.mng-alerta-mas{display:flex;align-items:center;justify-content:center;font-size:12.5px;color:var(--muted-foreground)}

/* pendientes */
.mng-grid-pend{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.mng-pend{position:relative;overflow:hidden;border-color:${AZUL}45}
.mng-pend-barra{position:absolute;top:0;left:0;width:4px;height:100%;background:${AZUL}}
.mng-codigo{font-family:ui-monospace,monospace;font-size:30px;font-weight:700;letter-spacing:5px;color:${AZUL};line-height:1}

/* servidores */
.mng-grid-srv{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
.mng-srv{display:flex;flex-direction:column;gap:11px;text-align:left;cursor:pointer;color:inherit;font:inherit;border-top:3px solid;transition:transform .14s,box-shadow .14s,border-color .14s}
.mng-srv:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.14)}
.mng-srv-cab{display:flex;align-items:center;gap:10px}
.mng-srv-ico{width:32px;height:32px;border-radius:9px;background:var(--surface-elevated);display:flex;align-items:center;justify-content:center;flex:none}
.mng-srv-nombre{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-srv-id{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted-foreground);letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-barra{display:flex;height:5px;border-radius:99px;overflow:hidden;background:var(--surface-elevated)}
.mng-barra>span{display:block}
.mng-mudo{display:flex;align-items:center;gap:10px;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.25);border-radius:10px;padding:9px 11px;font-size:13px}
.mng-peores{display:flex;flex-direction:column;gap:5px}
.mng-peor{display:flex;align-items:center;gap:8px;font-size:12.5px}
.mng-peor-nom{flex:1;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-peor-val{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.mng-todobien{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted-foreground)}
.mng-srv-pie{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:auto;padding-top:4px}
.mng-srv-visto{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;white-space:nowrap}
.mng-chips{display:flex;flex-wrap:wrap;gap:4px}
.mng-chip{font-size:10.5px;border:1px solid var(--border);background:var(--surface-elevated);color:var(--text-secondary);border-radius:6px;padding:2px 6px;white-space:nowrap}
.mng-chip-azul{border-color:${AZUL}55;background:${AZUL}12;color:${AZUL}}

/* cajon */
.mng-velo{position:fixed;inset:0;background:rgba(4,10,22,.5);backdrop-filter:blur(2px);z-index:60;display:flex;justify-content:flex-end;animation:mngvelo .16s ease-out}
@keyframes mngvelo{from{opacity:0}to{opacity:1}}
.mng-cajon{width:min(820px,100%);height:100%;background:var(--background);border-left:1px solid var(--border);display:flex;flex-direction:column;box-shadow:-18px 0 48px rgba(0,0,0,.3);animation:mngentra .22s cubic-bezier(.22,1,.36,1)}
@keyframes mngentra{from{transform:translateX(26px);opacity:.4}to{transform:none;opacity:1}}
.mng-cajon-cab{display:flex;align-items:center;gap:11px;padding:16px 18px;border-bottom:1px solid var(--border)}
.mng-cajon-estado{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 18px 0;padding:9px 12px;border:1px solid;border-radius:10px}
.mng-cuenta{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums}
.mng-pestanas{display:flex;gap:4px;padding:14px 18px 0;border-bottom:1px solid var(--border)}
.mng-pest{display:inline-flex;align-items:center;gap:6px;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--muted-foreground);font:inherit;font-size:13px;font-weight:600;padding:7px 11px 9px;cursor:pointer;transition:color .12s,border-color .12s}
.mng-pest:hover{color:var(--text-secondary)}
.mng-pest.act{color:${AZUL_CLARO};border-bottom-color:${AZUL_CLARO}}
.mng-pest-n{background:var(--surface-elevated);border-radius:99px;font-size:10.5px;padding:0 6px;font-variant-numeric:tabular-nums}
.mng-cajon-cuerpo{flex:1;overflow-y:auto;padding:18px}
.mng-cajon-pie{display:flex;gap:8px;padding:12px 18px;border-top:1px solid var(--border);background:var(--surface-card)}
.mng-ancho{flex:1;width:auto!important}

/* sensores */
.mng-sensores{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:9px}
.mng-sensor{border:1px solid var(--border);border-left:3px solid;border-radius:10px;padding:9px 11px;background:var(--card)}
.mng-sensor-cab{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted-foreground)}
.mng-sensor-nom{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-sensor-id{font-size:10px;opacity:.65}
.mng-sensor-val{font-size:16px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums}

/* relevamiento */
.mng-datos{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.mng-dato{display:flex;flex-direction:column;gap:1px;border:1px solid var(--border);border-radius:9px;padding:8px 10px;background:var(--card)}
.mng-dato span{font-size:10.5px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.6px}
.mng-dato strong{font-size:13px;font-weight:600}
.mng-vols{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px}
.mng-vol{border:1px solid var(--border);border-radius:10px;padding:9px 11px;background:var(--card);display:flex;flex-direction:column;gap:5px}
.mng-vol-cab{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px}
.mng-vol-barra{height:5px;border-radius:99px;background:var(--surface-elevated);overflow:hidden}
.mng-vol-barra>span{display:block;height:100%;border-radius:99px}
.mng-productos{display:flex;flex-direction:column;gap:7px}
.mng-producto{display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;padding:9px 11px;background:var(--card)}

/* encargos */
.mng-form{display:flex;flex-direction:column;gap:8px;border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--surface-card)}
.mng-form-fila{display:flex;gap:8px;flex-wrap:wrap}
.mng-input{background:var(--card);border:1px solid var(--border);color:var(--foreground);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;outline:none}
.mng-input:focus{border-color:${AZUL_CLARO};box-shadow:0 0 0 3px ${AZUL}22}
.mng-encargos{display:flex;flex-direction:column;gap:8px}
.mng-encargo{border:1px solid var(--border);border-left:3px solid;border-radius:10px;padding:10px 12px;background:var(--card)}
.mng-encargo-cab{display:flex;align-items:center;gap:9px}
.mng-tipo{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted-foreground)}
.mng-encargo-dest{flex:1;font-family:ui-monospace,monospace;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-encargo-pie{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:12px;color:var(--text-secondary)}
.mng-ms{font-variant-numeric:tabular-nums;color:var(--muted-foreground)}
.mng-link{background:none;border:none;color:${AZUL_CLARO};font:inherit;font-size:12px;cursor:pointer;padding:0;text-decoration:underline}
.mng-resultado{margin-top:10px;border-top:1px solid var(--border);padding-top:10px}
.mng-tabla-wrap{overflow-x:auto;max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:9px}
.mng-tabla{width:100%;border-collapse:collapse;font-size:12px}
.mng-tabla th{position:sticky;top:0;background:var(--surface-card);text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground);padding:7px 10px;font-weight:600}
.mng-tabla td{padding:6px 10px;border-top:1px solid var(--border)}
.mng-num{font-variant-numeric:tabular-nums;color:var(--muted-foreground)}
.mng-saltos{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12.5px}
.mng-saltos li{display:flex;align-items:center;gap:10px}
.mng-salto-n{width:22px;text-align:right;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.mng-json{margin:0;font-size:11.5px;background:var(--surface-card);border:1px solid var(--border);border-radius:9px;padding:10px;overflow-x:auto;max-height:300px}
.mng-resumen-jobs{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid var(--border);border-radius:10px;padding:9px 12px;background:var(--surface-card)}
.mng-jobs{display:flex;flex-direction:column;gap:8px}
.mng-job{border:1px solid var(--border);border-left:3px solid;border-radius:10px;padding:10px 12px;background:var(--card)}
.mng-job-cab{display:flex;align-items:center;gap:9px}
.mng-job-nom{flex:1;font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-job-datos{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px;font-size:12px;color:var(--text-secondary)}
.mng-job-datos em{font-style:normal;color:var(--muted-foreground);margin-right:4px}
.mng-job-aviso{margin-top:6px;font-size:12px;color:#f59e0b}
.mng-eventos{display:flex;flex-direction:column;gap:7px}
.mng-evento{border:1px solid var(--border);border-left:3px solid;border-radius:10px;padding:9px 11px;background:var(--card)}
.mng-evento-cab{display:flex;align-items:baseline;gap:10px}
.mng-evt-id{font-size:11px;color:var(--muted-foreground)}
.mng-evento-fecha{margin-left:auto;font-size:11.5px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.mng-evento-msg{font-size:12.5px;margin-top:3px;line-height:1.45;overflow-wrap:anywhere}
.mng-evento-quien{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:5px;font-size:11.5px;color:var(--text-secondary)}
.mng-evento-quien em{font-style:normal;color:var(--muted-foreground);margin-right:4px}
.mng-agente{display:flex;align-items:center;gap:16px;border:1px solid;border-radius:12px;padding:12px 14px}
.mng-agente-v{font-family:ui-monospace,monospace;font-size:24px;font-weight:700;letter-spacing:.5px;line-height:1.1}
.mng-vacio{border:1px dashed var(--border);border-radius:12px;padding:26px 18px;text-align:center}

/* ── barra de herramientas de la tabla ── */
.mng-barra-tabla{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.mng-buscador{display:flex;align-items:center;gap:7px;flex:1;min-width:230px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:0 8px 0 11px}
.mng-buscador:focus-within{border-color:${AZUL_CLARO};box-shadow:0 0 0 3px ${AZUL}22}
.mng-input-limpio{flex:1;min-width:0;border:none!important;background:transparent!important;box-shadow:none!important;padding-left:0;padding-right:0}
.mng-select{padding-right:26px;cursor:pointer}
.mng-mini{padding:3px 6px;min-width:0;border:none}
.mng-segmentos{display:flex;background:var(--surface-elevated);border:1px solid var(--border);border-radius:9px;padding:2px;gap:2px}
.mng-seg{background:transparent;border:none;color:var(--muted-foreground);font:inherit;font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:7px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s}
.mng-seg:hover{color:var(--text-secondary)}
.mng-seg.act{background:var(--card);color:${AZUL_CLARO};box-shadow:0 1px 3px rgba(0,0,0,.14)}

/* ── tabla de servidores ── */
.mng-tabla-srv-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card)}
.mng-tabla-srv{width:100%;min-width:1120px;border-collapse:collapse;font-size:13px}
.mng-tabla-srv thead th{position:sticky;top:0;z-index:1;background:var(--surface-card);text-align:left;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
.mng-tabla-srv .mng-th-c,.mng-tabla-srv .mng-td-c{text-align:center}
.mng-th-punto{width:26px;padding-left:10px!important;padding-right:0!important}
.mng-td-punto{width:26px;padding-left:10px!important;padding-right:0!important;text-align:center}
.mng-tabla-srv td{padding:9px 12px;border-top:1px solid var(--border);vertical-align:middle}
.mng-tabla-srv tbody tr:first-child td{border-top:none}
.mng-fila{cursor:pointer;outline:none;transition:background .12s;box-shadow:inset 3px 0 0 transparent}
.mng-fila:hover{background:var(--surface-hover)}
.mng-fila:focus-visible{background:var(--surface-hover);box-shadow:inset 3px 0 0 var(--acento)}
.mng-fila:hover{box-shadow:inset 3px 0 0 var(--acento)}
.mng-fila.mudo{background:rgba(220,38,38,.05)}
.mng-fila:hover .mng-chevron{opacity:1;transform:translateX(2px)}
.mng-chevron{display:inline-flex;color:var(--muted-foreground);opacity:.45;transition:opacity .12s,transform .12s}
.mng-chevron.abajo{transform:rotate(90deg)}
.mng-celda-srv{display:flex;align-items:center;gap:10px;min-width:180px}
.mng-td-vacio{color:var(--muted-foreground);opacity:.55}

/* medidores de carga */
.mng-medidor{display:inline-flex;flex-direction:column;align-items:center;gap:3px;min-width:52px}
.mng-medidor-n{font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}
.mng-medidor-n small{font-size:9.5px;font-weight:600;opacity:.6;margin-left:1px}
.mng-medidor-barra{width:44px;height:4px;border-radius:99px;background:var(--surface-elevated);overflow:hidden}
.mng-medidor-barra>span{display:block;height:100%;border-radius:99px}
.mng-medidor-et{font-size:9.5px;color:var(--muted-foreground);letter-spacing:.4px}

.mng-celda-sensores{display:inline-flex;flex-direction:column;gap:4px;min-width:78px}
.mng-celda-cuentas{display:flex;align-items:baseline;justify-content:center;gap:6px;font-size:11.5px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.mng-celda-cuentas b{font-size:12.5px}
.mng-mini-estado{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;white-space:nowrap}
.mng-conteo{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.mng-so{font-size:12px;color:var(--text-secondary);display:inline-block;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-visto{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;white-space:nowrap}

/* ── eventos de Windows ── */
.mng-evt-kpis{display:flex;align-items:center;gap:16px;flex-wrap:wrap;border:1px solid var(--border);border-radius:11px;padding:9px 13px;background:var(--surface-card)}
.mng-evt-kpi{display:flex;align-items:baseline;gap:5px}
.mng-evt-kpi b{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}
.mng-evt-kpi span{font-size:11.5px;color:var(--muted-foreground)}
.mng-evt-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mng-chip-btn{cursor:pointer;font:inherit;font-size:10.5px;transition:background .12s}
.mng-chip-btn:hover{background:var(--surface-hover)}
.mng-evento-btn{width:100%;background:none;border:none;font:inherit;color:inherit;cursor:pointer;text-align:left;padding:0;display:flex;align-items:center;gap:9px}
.mng-nivel{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;border:1px solid;border-radius:5px;padding:1px 6px;flex:none}
.mng-evento-tit{font-size:13px;font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-evento-detalle{margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);display:flex;flex-direction:column;gap:7px}
.mng-evento-qes{margin:0;font-size:12.5px;line-height:1.55;color:var(--text-secondary)}
.mng-evento-qes strong{color:var(--foreground)}

/* ── fichas del cajón ── */
.mng-fichas{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:8px;margin:10px 18px 0}
.mng-ficha{display:flex;flex-direction:column;gap:3px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--card);min-width:0}
.mng-ficha>span{font-size:9.5px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.6px}
.mng-ficha>strong{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mng-ficha-carga{align-items:flex-start}
.mng-ficha-carga .mng-medidor{align-items:flex-start;min-width:0}
.mng-ficha-carga .mng-medidor-barra{width:100%;min-width:54px}
@media (max-width:560px){.mng-fichas{margin-left:14px;margin-right:14px}}

/* botones */
.mng-btn-primario{display:inline-flex;align-items:center;gap:7px;background:${AZUL};color:#fff;border:none;border-radius:9px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;justify-content:center;transition:background .12s}
.mng-btn-primario:hover:not(:disabled){background:#1550bd}
.mng-btn-primario:disabled{opacity:.5;cursor:default}
.mng-btn-fantasma{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:38px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:9px;padding:8px 12px;font:inherit;font-size:12.5px;cursor:pointer;transition:background .12s,border-color .12s}
.mng-btn-fantasma:hover:not(:disabled){background:var(--surface-elevated);border-color:var(--muted-foreground)}
.mng-btn-fantasma:disabled{opacity:.5;cursor:default}
.mng-peligro{color:#f87171}
.mng-peligro:hover{background:rgba(239,68,68,.1)!important;border-color:#7f1d1d!important}

@media (max-width:560px){
  .mng-kpis{width:100%}
  .mng-kpi{flex:1;min-width:0}
  .mng-cajon-cuerpo{padding:14px}
  .mng-cajon-cab,.mng-pestanas{padding-left:14px;padding-right:14px}
}
@media (prefers-reduced-motion:reduce){
  .mng-srv:hover{transform:none}
  .mng-late{animation:none}
  .mng-cajon,.mng-velo{animation:none}
}
`;
