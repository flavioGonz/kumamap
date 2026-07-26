"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { apiUrl } from "@/lib/api";

/* ── data layer ─────────────────────────────────────────── */
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

const STATE_COLOR: Record<string, string> = { ok: "#16a34a", warn: "#f59e0b", crit: "#dc2626", idle: "#9ca3af" };
const CARMIN = "#e11d48";

function ago(ms: number): string {
  if (!ms) return "nunca";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

/* ── icons (inline, lucide-style) ───────────────────────── */
const I = {
  server: (c = "currentColor") => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="16" x="3" y="4" rx="2" /><path d="M3 12h4l2-5 3 9 2-4h5" /></svg>),
  pulse: (c = "currentColor", s = 18) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>),
  check: (c = "currentColor") => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>),
  key: (c = "currentColor") => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></svg>),
  unlink: (c = "currentColor") => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18.84 12.25 1.72-1.71a5.83 5.83 0 0 0-8.24-8.24l-1.72 1.71" /><path d="m5.17 11.75-1.71 1.71a5.83 5.83 0 0 0 8.24 8.24l1.71-1.71" /><line x1="8" x2="16" y1="2" y2="2" /><line x1="2" x2="2" y1="8" y2="16" /></svg>),
  trash: (c = "currentColor") => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>),
  chevron: (open: boolean, c = "currentColor") => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><path d="m9 18 6-6-6-6" /></svg>),
  globe: (c = "currentColor") => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><path d="M2 12h20" /></svg>),
  inbox: (c = "currentColor") => (<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>),
};

/* ── page ───────────────────────────────────────────────── */
export default function MonitorNgPage() {
  const [data, setData] = useState<DevicesResponse>({ pending: [], adopted: [] });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data: d, error: e } = await apiFetch<DevicesResponse>(apiUrl("/api/monitor-ng/devices"));
    if (e) setError(e);
    else if (d) { setData({ pending: d.pending || [], adopted: d.adopted || [] }); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 10000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const action = useCallback(async (deviceId: string, act: string, name?: string) => {
    setBusy(deviceId + act);
    const { error: e } = await apiFetch(apiUrl("/api/monitor-ng/devices"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act, deviceId, name }),
    });
    setBusy(null);
    if (e) { setError(e); return; }
    await load();
  }, [load]);

  const adopt = (d: PendingDevice) => {
    const name = window.prompt("Nombre para este servidor en el mapa:", d.name || d.deviceId);
    if (name === null) return;
    action(d.deviceId, "adopt", name.trim() || d.deviceId);
  };
  const deadopt = (d: AdoptedDevice) => { if (window.confirm(`De-adoptar "${d.name}" (#${d.deviceId})?\n\nVuelve a pendiente y su token queda revocado.`)) action(d.deviceId, "deadopt"); };
  const regen = (d: AdoptedDevice) => { if (window.confirm(`Regenerar el token de "${d.name}"?\n\nEl dispositivo tendrá que recibirlo de nuevo (unos segundos sin reportar).`)) action(d.deviceId, "regen-token"); };
  const remove = (d: PendingDevice | AdoptedDevice) => { if (window.confirm(`Eliminar por completo el dispositivo #${d.deviceId}?`)) action(d.deviceId, "delete"); };

  const totalCrit = data.adopted.reduce((a, d) => a + (d.stale ? 0 : d.crit), 0);
  const online = data.adopted.filter((d) => !d.stale).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 60px" }}>
        {/* header */}
        <header style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `linear-gradient(135deg, ${CARMIN}, #9f1239)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(225,29,72,.35)" }}>
            {I.pulse("#fff", 24)}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Servidores monitor-ng</h1>
            <p style={{ color: "var(--muted-foreground)", margin: "3px 0 0", fontSize: 13 }}>
              Adopción de agentes remotos. Cada servidor se registra con un código de 5 dígitos y reporta cifrado con token propio.
            </p>
          </div>
          <StatChip label="online" value={`${online}/${data.adopted.length}`} color="#16a34a" />
          <StatChip label="pendientes" value={String(data.pending.length)} color={CARMIN} pulse={data.pending.length > 0} />
          <StatChip label="críticos" value={String(totalCrit)} color={totalCrit ? "#dc2626" : "var(--muted-foreground)"} />
        </header>

        {error && (
          <div style={{ background: "rgba(220,38,38,.12)", border: "1px solid #dc2626", color: "#f87171", padding: "10px 14px", borderRadius: 8, margin: "18px 0", fontSize: 13 }}>{error}</div>
        )}

        {/* ── PENDIENTES ── */}
        <section style={{ marginTop: 26 }}>
          <SectionTitle icon={I.inbox(CARMIN)} title="Pendientes de adopción" badge={data.pending.length || undefined} badgeColor={CARMIN} />
          {loading ? (
            <Muted>Cargando…</Muted>
          ) : data.pending.length === 0 ? (
            <EmptyState icon={I.inbox("var(--muted-foreground)")} text="No hay dispositivos esperando adopción." sub="Instalá monitor-ng en un servidor y cargale la URL de este controlador; aparecerá acá con su código." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
              {data.pending.map((d) => (
                <div key={d.deviceId} style={{ ...card, borderColor: "rgba(225,29,72,.35)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: CARMIN }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Código de adopción</div>
                      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 30, fontWeight: 700, letterSpacing: 5, color: CARMIN, lineHeight: 1 }}>{d.deviceId}</div>
                    </div>
                    <span style={{ ...pill, color: CARMIN, borderColor: "rgba(225,29,72,.4)", background: "rgba(225,29,72,.08)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: CARMIN, display: "inline-block" }} /> pendiente
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: "var(--text-secondary)" }}>
                    {I.server("var(--muted-foreground)")}<span style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                    {d.ip && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{I.globe()}{d.ip}</span>}
                    <span>visto {ago(d.lastSeen)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button onClick={() => adopt(d)} disabled={busy === d.deviceId + "adopt"} style={btnPrimary}>{I.check("#fff")} {busy === d.deviceId + "adopt" ? "Adoptando…" : "Adoptar"}</button>
                    <button onClick={() => remove(d)} style={btnGhost} title="Descartar">{I.trash()}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ADOPTADOS (tabla) ── */}
        <section style={{ marginTop: 34 }}>
          <SectionTitle icon={I.server("#16a34a")} title="Servidores adoptados" badge={data.adopted.length || undefined} badgeColor="#16a34a" />
          {data.adopted.length === 0 ? (
            <EmptyState icon={I.server("var(--muted-foreground)")} text="Todavía no adoptaste ningún servidor." sub="Cuando adoptes un pendiente aparecerá acá y como nodo en el mapa." />
          ) : (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface-card)", color: "var(--muted-foreground)", textAlign: "left" }}>
                    <Th style={{ width: 40 }}></Th>
                    <Th>Dispositivo</Th>
                    <Th>Estado</Th>
                    <Th>Sensores</Th>
                    <Th>IP</Th>
                    <Th>Último reporte</Th>
                    <Th style={{ textAlign: "right" }}>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.adopted.map((d) => {
                    const color = d.stale ? "#9ca3af" : STATE_COLOR[d.state] || "#9ca3af";
                    const open = expanded === d.deviceId;
                    return (
                      <Fragment key={d.deviceId}>
                        <tr style={{ borderTop: "1px solid var(--border)", cursor: "pointer", transition: "background .12s" }}
                          onClick={() => setExpanded(open ? null : d.deviceId)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <Td><span style={{ color: "var(--muted-foreground)" }}>{I.chevron(open)}</span></Td>
                          <Td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-elevated)", display: "flex", alignItems: "center", justifyContent: "center", color }}>{I.server(color)}</span>
                              <div>
                                <div style={{ fontWeight: 600 }}>{d.name}</div>
                                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--muted-foreground)", letterSpacing: .5 }}>#{d.deviceId} · id {d.monitorId}</div>
                              </div>
                            </div>
                          </Td>
                          <Td><span style={{ ...pill, color, borderColor: color + "55", background: color + "14" }}><span style={{ width: 7, height: 7, borderRadius: 99, background: color, display: "inline-block" }} />{d.stale ? "sin reporte" : d.state}</span></Td>
                          <Td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <SensorChip n={d.ok} color="#16a34a" />
                              <SensorChip n={d.warn} color="#f59e0b" />
                              <SensorChip n={d.crit} color="#dc2626" />
                            </div>
                          </Td>
                          <Td><span style={{ color: "var(--muted-foreground)" }}>{d.ip || "—"}</span></Td>
                          <Td><span style={{ color: d.stale ? "#dc2626" : "var(--muted-foreground)" }}>{ago(d.lastSeen)}</span></Td>
                          <Td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <IconBtn title="Regenerar token" onClick={() => regen(d)} disabled={busy === d.deviceId + "regen-token"}>{I.key()}</IconBtn>
                              <IconBtn title="De-adoptar" onClick={() => deadopt(d)} disabled={busy === d.deviceId + "deadopt"}>{I.unlink()}</IconBtn>
                              <IconBtn title="Eliminar" danger onClick={() => remove(d)}>{I.trash()}</IconBtn>
                            </div>
                          </Td>
                        </tr>
                        {open && (
                          <tr style={{ background: "var(--surface-card)" }}>
                            <td colSpan={7} style={{ padding: "4px 18px 18px" }}>
                              <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 1, margin: "10px 0" }}>Sensores</div>
                              {d.metrics.length === 0 ? (
                                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Sin métricas todavía.</div>
                              ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
                                  {d.metrics.map((m) => {
                                    const mc = STATE_COLOR[m.state] || "#9ca3af";
                                    return (
                                      <div key={m.id} title={m.label} style={{ border: "1px solid var(--border)", borderLeft: `3px solid ${mc}`, borderRadius: 8, padding: "8px 10px", background: "var(--card)" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-foreground)" }}>
                                          <span style={{ width: 7, height: 7, borderRadius: 99, background: mc }} />
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label || m.id}</span>
                                        </div>
                                        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{m.value}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── small components ───────────────────────────────────── */
function StatChip({ label, value, color, pulse }: { label: string; value: string; color: string; pulse?: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "6px 14px", borderRadius: 10, background: "var(--surface-card)", border: "1px solid var(--border)", minWidth: 74 }}>
      <div style={{ fontSize: 19, fontWeight: 700, color, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {pulse && <span style={{ width: 7, height: 7, borderRadius: 99, background: color, boxShadow: `0 0 0 0 ${color}`, animation: "mngpulse 1.6s infinite" }} />}
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: .5 }}>{label}</div>
      <style>{`@keyframes mngpulse{0%{box-shadow:0 0 0 0 ${color}88}70%{box-shadow:0 0 0 8px ${color}00}100%{box-shadow:0 0 0 0 ${color}00}}`}</style>
    </div>
  );
}
function SectionTitle({ icon, title, badge, badgeColor }: { icon: React.ReactNode; title: string; badge?: number; badgeColor: string }) {
  return (
    <h2 style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 15, fontWeight: 600, margin: "0 0 14px" }}>
      <span style={{ display: "flex" }}>{icon}</span>{title}
      {badge != null && <span style={{ background: badgeColor, color: "#fff", borderRadius: 99, fontSize: 12, fontWeight: 700, padding: "1px 9px" }}>{badge}</span>}
    </h2>
  );
}
function SensorChip({ n, color }: { n: number; color: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color, opacity: n ? 1 : 0.4 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: color }} />{n}</span>;
}
function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, cursor: disabled ? "default" : "pointer", background: "transparent", border: "1px solid var(--border)", color: danger ? "#f87171" : "var(--text-secondary)", opacity: disabled ? 0.5 : 1 }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = danger ? "rgba(239,68,68,.1)" : "var(--surface-elevated)"; e.currentTarget.style.borderColor = danger ? "#7f1d1d" : "var(--muted-foreground)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border)"; }}>
      {children}
    </button>
  );
}
function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: "40px 20px", color: "var(--muted-foreground)" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: 0.6 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 14 }}>{text}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 5, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>{sub}</div>}
    </div>
  );
}
function Muted({ children }: { children: React.ReactNode }) { return <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>{children}</p>; }
function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) { return <th style={{ padding: "10px 14px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: .5, ...style }}>{children}</th>; }
function Td({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: (e: React.MouseEvent) => void }) { return <td onClick={onClick} style={{ padding: "11px 14px", verticalAlign: "middle", ...style }}>{children}</td>; }

/* ── style tokens ───────────────────────────────────────── */
const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 };
const pill: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, textTransform: "capitalize", border: "1px solid var(--border)", borderRadius: 99, padding: "3px 10px" };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: CARMIN, color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: 1, justifyContent: "center" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px", fontSize: 13, cursor: "pointer" };
