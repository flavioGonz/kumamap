"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Search, Loader2, Check, Radio, Activity, ChevronLeft } from "lucide-react";
import { apiUrl } from "@/lib/api";

// ── Tipos mínimos de lo que devuelven las rutas que ya existen ──────────────
interface Interfaz {
  index: number; name: string; alias?: string; speed: number;
  operStatus: string; inOctets: number; outOctets: number;
}
interface Carpeta { id: number; name: string }
interface TasaViva {
  ifIndex: string; ifName?: string; ifAlias?: string; up?: boolean;
  capacidadBps: number | null; entradaBps: number | null; salidaBps: number | null; primera: boolean;
}

export interface TraficoAplicado {
  kumaMonitorId: number;
  label: string;
  snmpTraffic: {
    host: string; community: string; version: "1" | "2c"; port: number;
    ifIndex: string; ifName?: string; ifAlias?: string;
    kumaInId: number; kumaOutId: number; capacidadBps: number | null;
  };
}

interface Props {
  open: boolean;
  nodeId: string | null;
  initial?: { host?: string; community?: string; version?: "1" | "2c" };
  onClose: () => void;
  onApplied: (nodeId: string, payload: TraficoAplicado) => void;
}

const AZUL = "#3987e5", AQUA = "#199e70";
const LS_KEY = "km_snmp_traf_last";

function fmtBps(bps: number | null | undefined): string {
  if (bps == null) return "—";
  const u = ["bps", "Kbps", "Mbps", "Gbps"]; let v = bps, i = 0;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export default function SnmpTrafficModal({ open, nodeId, initial, onClose, onApplied }: Props) {
  const [paso, setPaso] = useState<"equipo" | "interfaces" | "vivo">("equipo");
  const [host, setHost] = useState("");
  const [comunidad, setComunidad] = useState("public");
  const [version, setVersion] = useState<"1" | "2c">("2c");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<Interfaz[]>([]);
  const [soloActivas, setSoloActivas] = useState(true);
  const [sel, setSel] = useState<Interfaz | null>(null);
  const [tasa, setTasa] = useState<TasaViva | null>(null);
  const [buf, setBuf] = useState<Array<{ e: number | null; s: number | null }>>([]);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [carpeta, setCarpeta] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const vivoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Al abrir: recuperar el ultimo equipo usado (en la practica siempre el mismo).
  useEffect(() => {
    if (!open) return;
    setPaso("equipo"); setError(null); setSel(null); setTasa(null); setBuf([]); setInterfaces([]);
    try {
      const g = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      setHost(initial?.host || g.host || "");
      setComunidad(initial?.community || g.community || "public");
      setVersion((initial?.version || g.version || "2c") as "1" | "2c");
    } catch { /* nada */ }
    fetch(apiUrl("/api/kuma/groups"), { credentials: "include" })
      .then((r) => r.json()).then((d) => setCarpetas(d?.groups || [])).catch(() => {});
  }, [open, initial]);

  // Poll en vivo mientras estamos en el paso "vivo".
  const detener = () => { if (vivoRef.current) { clearInterval(vivoRef.current); vivoRef.current = null; } };
  const leerVivo = useCallback(async (iface: Interfaz) => {
    try {
      const r = await fetch(apiUrl("/api/snmp/traffic-live"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host.trim(), community: comunidad, version, ifIndex: String(iface.index) }),
      });
      const d: TasaViva = await r.json();
      if (!r.ok) return;
      setTasa(d);
      if (!d.primera) setBuf((b) => [...b, { e: d.entradaBps, s: d.salidaBps }].slice(-40));
    } catch { /* ignora una lectura suelta */ }
  }, [host, comunidad, version]);

  useEffect(() => {
    if (paso !== "vivo" || !sel) { detener(); return; }
    setBuf([]);
    leerVivo(sel); // primera (arma la muestra base)
    vivoRef.current = setInterval(() => leerVivo(sel), 2500);
    return detener;
  }, [paso, sel, leerVivo]);

  useEffect(() => () => detener(), []);

  const escanear = async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch(apiUrl("/api/snmp/poll"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: host.trim(), community: comunidad }),
      });
      const d = await r.json();
      if (!r.ok || !d.reachable) throw new Error(d?.error || "El equipo no respondió por SNMP");
      const ifs: Interfaz[] = (d.interfaces || []).filter((x: Interfaz) => x.name);
      if (!ifs.length) throw new Error("El equipo respondió pero no expuso interfaces");
      setEquipo(d?.system?.name || host.trim());
      setInterfaces(ifs);
      try { localStorage.setItem(LS_KEY, JSON.stringify({ host: host.trim(), community: comunidad, version })); } catch { /* */ }
      setPaso("interfaces");
    } catch (e: any) { setError(e?.message || "Falló el escaneo"); }
    finally { setCargando(false); }
  };

  const crearPar = async () => {
    if (!sel || !nodeId) return;
    setCreando(true); setError(null);
    const base = sel.name || `if${sel.index}`;
    const comun = {
      type: "snmp", hostname: host.trim(), port: 161, snmpVersion: version,
      radiusPassword: comunidad, jsonPath: "$", jsonPathOperator: ">=", expectedValue: "0",
      interval: 30, retryInterval: 30, timeout: 5, maxretries: 0,
      ...(carpeta ? { parent: carpeta } : {}),
    };
    const alta = async (oid: string, sufijo: string) => {
      const r = await fetch(apiUrl("/api/kuma/monitors"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...comun, name: `[KM] ${base} — ${sufijo}`, snmpOid: oid }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Uptime Kuma rechazó el sensor");
      return Number(d?.monitorID);
    };
    try {
      // El par: entrada (ifInOctets .10) y salida (ifOutOctets .16). 32 bits
      // porque Kuma no parsea Counter64; kuma-traffic los reconoce y junta.
      const inId = await alta(`1.3.6.1.2.1.2.2.1.10.${sel.index}`, "tráfico entrada");
      const outId = await alta(`1.3.6.1.2.1.2.2.1.16.${sel.index}`, "tráfico salida");
      onApplied(nodeId, {
        kumaMonitorId: inId,
        label: `${base}${sel.alias ? ` · ${sel.alias}` : ""}`,
        snmpTraffic: {
          host: host.trim(), community: comunidad, version, port: 161,
          ifIndex: String(sel.index), ifName: sel.name, ifAlias: sel.alias,
          kumaInId: inId, kumaOutId: outId, capacidadBps: tasa?.capacidadBps ?? (sel.speed ? sel.speed * 1e6 : null),
        },
      });
      onClose();
    } catch (e: any) { setError(e?.message || "No se pudo crear el par de sensores"); }
    finally { setCreando(false); }
  };

  if (!open) return null;

  const lista = soloActivas ? interfaces.filter((i) => i.operStatus === "up") : interfaces;
  const pico = Math.max(1, ...buf.flatMap((b) => [b.e || 0, b.s || 0]));
  const camino = (key: "e" | "s") => {
    const pts = buf.map((b, i) => {
      const v = b[key]; if (v == null) return null;
      return `${(i / Math.max(1, buf.length - 1) * 260).toFixed(1)},${(70 - (v / pico) * 66).toFixed(1)}`;
    }).filter(Boolean);
    return pts.length > 1 ? "M" + pts.join(" L") : "";
  };
  const capPct = tasa?.capacidadBps ? Math.round((Math.max(tasa.entradaBps || 0, tasa.salidaBps || 0) / tasa.capacidadBps) * 100) : null;

  const I: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#e8eef7", outline: "none",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", background: "#0c1119", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.7)", padding: 20, fontFamily: "ui-sans-serif,system-ui,sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Activity size={17} color={AZUL} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#eef3fa" }}>Fuente de tráfico SNMP</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#8b9bb4", cursor: "pointer" }}><X size={18} /></button>
        </div>

        {error && <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 11px", fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{error}</div>}

        {/* ── Paso equipo ── */}
        {paso === "equipo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div>
              <label style={{ fontSize: 10.5, color: "#93a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>IP del equipo</label>
              <input style={{ ...I, marginTop: 4 }} value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.99.1" autoFocus onKeyDown={(e) => e.key === "Enter" && host.trim() && escanear()} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10.5, color: "#93a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Comunidad</label>
                <input style={{ ...I, marginTop: 4 }} value={comunidad} onChange={(e) => setComunidad(e.target.value)} placeholder="public" />
              </div>
              <div style={{ width: 90 }}>
                <label style={{ fontSize: 10.5, color: "#93a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Versión</label>
                <select style={{ ...I, marginTop: 4 }} value={version} onChange={(e) => setVersion(e.target.value as "1" | "2c")}>
                  <option value="2c">v2c</option>
                  <option value="1">v1</option>
                </select>
              </div>
            </div>
            <button onClick={escanear} disabled={!host.trim() || cargando} style={{ marginTop: 4, width: "100%", padding: "10px", borderRadius: 10, background: AZUL, border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: host.trim() && !cargando ? "pointer" : "default", opacity: host.trim() && !cargando ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              {cargando ? <><Loader2 size={15} className="animate-spin" /> Escaneando…</> : <><Search size={15} /> Escanear interfaces</>}
            </button>
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Se leen las interfaces del equipo por SNMP y elegís cuál mirar. El 161/UDP tiene que llegar desde este servidor.</p>
          </div>
        )}

        {/* ── Paso interfaces ── */}
        {paso === "interfaces" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <button onClick={() => setPaso("equipo")} style={{ background: "none", border: "none", color: "#8b9bb4", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 12 }}><ChevronLeft size={14} /> {equipo}</button>
              <label style={{ marginLeft: "auto", fontSize: 11.5, color: "#93a3b8", display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} /> solo activas
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 360, overflowY: "auto" }}>
              {lista.map((i) => (
                <button key={i.index} onClick={() => { setSel(i); setPaso("vivo"); }} style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", padding: "9px 11px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "#e8eef7" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: i.operStatus === "up" ? "#22c55e" : "#64748b", flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}{i.alias ? <span style={{ color: "#8b9bb4", fontWeight: 400 }}> · {i.alias}</span> : null}</div>
                    <div style={{ fontSize: 10.5, color: "#64748b" }}>#{i.index}{i.speed ? ` · ${i.speed >= 1000 ? (i.speed / 1000) + " Gbps" : i.speed + " Mbps"}` : ""}</div>
                  </div>
                </button>
              ))}
              {lista.length === 0 && <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", padding: 20 }}>Ninguna interfaz {soloActivas ? "activa" : ""}.</p>}
            </div>
          </div>
        )}

        {/* ── Paso vivo ── */}
        {paso === "vivo" && sel && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setPaso("interfaces")} style={{ background: "none", border: "none", color: "#8b9bb4", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 12 }}><ChevronLeft size={14} /> interfaces</button>
              <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "#eef3fa" }}>{sel.name}{sel.alias ? ` · ${sel.alias}` : ""}</span>
            </div>

            {/* numeros grandes */}
            <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "#93a3b8", letterSpacing: "0.04em" }}><span style={{ color: AZUL }}>▼</span> BAJADA</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#e8eef7", fontVariantNumeric: "tabular-nums" }}>{fmtBps(tasa?.entradaBps)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#93a3b8", letterSpacing: "0.04em" }}><span style={{ color: AQUA }}>▲</span> SUBIDA</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#e8eef7", fontVariantNumeric: "tabular-nums" }}>{fmtBps(tasa?.salidaBps)}</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#93a3b8" }}>{tasa?.up ? "enlace activo" : "enlace caído"}</div>
                {capPct != null && <div style={{ fontSize: 12, color: "#8b9bb4" }}>{capPct}% de {fmtBps(tasa?.capacidadBps)}</div>}
              </div>
            </div>

            {/* grafica unica: bajada y subida juntas */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 8, marginBottom: 14 }}>
              <svg width="100%" height="70" viewBox="0 0 260 70" preserveAspectRatio="none" style={{ display: "block" }}>
                <line x1="0" y1="70" x2="260" y2="70" stroke="#fff" strokeWidth="1" opacity="0.1" />
                {camino("e") && <><path d={`${camino("e")} L260,70 L0,70 Z`} fill={AZUL} opacity="0.18" /><path d={camino("e")} fill="none" stroke={AZUL} strokeWidth="2" /></>}
                {camino("s") && <path d={camino("s")} fill="none" stroke={AQUA} strokeWidth="2" />}
              </svg>
              {buf.length < 2 && <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", padding: "6px 0" }}><Radio size={11} style={{ display: "inline", marginRight: 4 }} /> capturando…</div>}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10.5, color: "#93a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Carpeta en Uptime Kuma</label>
              <select style={{ ...I, marginTop: 4 }} value={carpeta ?? ""} onChange={(e) => setCarpeta(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Sin carpeta</option>
                {carpetas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <button onClick={crearPar} disabled={creando} style={{ width: "100%", padding: "11px", borderRadius: 10, background: AQUA, border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: creando ? "default" : "pointer", opacity: creando ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              {creando ? <><Loader2 size={15} className="animate-spin" /> Creando el par…</> : <><Check size={15} /> Crear par de sensores y usar</>}
            </button>
            <p style={{ fontSize: 11, color: "#64748b", margin: "8px 0 0" }}>Se crean <b>dos</b> sensores en Uptime Kuma (bajada y subida) a 30 s, y la ventana empieza a graficar los dos sentidos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
