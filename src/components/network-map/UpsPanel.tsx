"use client";

/**
 * Panel de UPS.
 *
 * Lo primero que uno quiere saber de una UPS es si está tomando de la red o de
 * la batería, y cuánto aguanta. Eso va arriba y en grande. Después las cifras
 * del momento, y abajo las curvas de las últimas horas con las tiradas en
 * batería sombreadas: sin eso, un corte de dos minutos a las 3 de la mañana no
 * se ve en ninguna parte.
 *
 * El panel se puede fijar: queda anotado en el nodo y vuelve a abrirse solo al
 * entrar al mapa, en la misma posición.
 */

import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  X, RefreshCw, Zap, Thermometer, Clock, Activity, AlertTriangle,
  Plug, Gauge, Settings, Pin, PinOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import {
  type UpsResult, type UpsHistoryPoint, type UpsVendor,
  statusColor, statusLabel, batteryColor, loadColor, runtimeStr,
} from "@/lib/ups";

const VENDOR_BADGE: Record<UpsVendor, string | null> = {
  apc: "APC", rfc1628: "RFC 1628", nut: "NUT", unknown: null,
};

/* Par categórico validado contra fondo oscuro (ΔE 19.6 con deuteranopía). */
const AZUL = "#3987e5";
const AQUA = "#199e70";
const AMBAR = "#f59e0b";
const ROJO = "#ef4444";

const ANCHO = 344;
const ANCHO_MINI = 238;
const GRAF_W = ANCHO - 26;   // ancho útil dentro del panel
const GRAF_H = 52;

/* ─────────────────────────────────────────── anillo de carga ── */

function Anillo({ pct, color, enBateria, etiqueta }: {
  pct: number; color: string; enBateria: boolean; etiqueta: string;
}) {
  const R = 30, C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div style={{ position: "relative", width: 76, height: 76, flex: "none" }}>
      <svg width={76} height={76} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={38} cy={38} r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={7} />
        <circle cx={38} cy={38} r={R} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${(C * p).toFixed(1)} ${C.toFixed(1)}`}
          style={{ transition: "stroke-dasharray .7s ease" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 0,
      }}>
        <span style={{ fontSize: 21, fontWeight: 700, color: "#f2f5fa", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(pct)}<span style={{ fontSize: 11, opacity: .55 }}>%</span>
        </span>
        <span style={{ fontSize: 8.5, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".06em", marginTop: 1 }}>
          {etiqueta}
        </span>
      </div>
      {enBateria && (
        <span style={{
          position: "absolute", inset: -3, borderRadius: "50%",
          border: `1px solid ${AMBAR}55`, animation: "upsLate 1.6s ease-in-out infinite",
        }} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────── gráfica ── */

interface Tramo { x0: number; x1: number }

const Grafica = memo(function Grafica({
  puntos, tiempos, tramos, color, titulo, unidad, decimales = 0, minFijo, maxFijo,
}: {
  puntos: number[]; tiempos: number[]; tramos: Tramo[];
  color: string; titulo: string; unidad: string;
  decimales?: number; minFijo?: number; maxFijo?: number;
}) {
  if (puntos.length < 2) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
        <span style={grafTitulo}>{titulo}</span>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.22)" }}>juntando lecturas…</span>
      </div>
    );
  }

  const crudoMax = Math.max(...puntos), crudoMin = Math.min(...puntos);
  let max = maxFijo ?? crudoMax, min = minFijo ?? crudoMin;
  if (max - min < 1e-6) { max = max + 1; min = min - 1; }
  const margen = (max - min) * 0.12;
  if (maxFijo == null) max += margen;
  if (minFijo == null) min -= margen;

  const y = (v: number) => GRAF_H - ((v - min) / (max - min)) * (GRAF_H - 4) - 2;
  const x = (i: number) => (i / (puntos.length - 1)) * GRAF_W;

  const linea = puntos.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${linea} L${GRAF_W},${GRAF_H} L0,${GRAF_H} Z`;
  const gid = `ups-g-${titulo.replace(/[^a-z]/gi, "")}`;
  const ultimo = puntos[puntos.length - 1];

  const hora = (t: number) => new Date(t).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
  const anchoBanda = GRAF_W / puntos.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={grafTitulo}>{titulo}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {ultimo.toFixed(decimales)} <span style={{ fontSize: 9.5, opacity: .6 }}>{unidad}</span>
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <svg width={GRAF_W} height={GRAF_H} style={{ display: "block" }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".28" />
              <stop offset="100%" stopColor={color} stopOpacity=".02" />
            </linearGradient>
          </defs>
          {/* Tiradas en batería: el dato que explica todo lo demás. */}
          {tramos.map((t, i) => (
            <rect key={i} x={t.x0 * GRAF_W} y={0} width={Math.max(1.5, (t.x1 - t.x0) * GRAF_W)} height={GRAF_H}
              fill={AMBAR} opacity=".14" />
          ))}
          <line x1={0} y1={GRAF_H - 1} x2={GRAF_W} y2={GRAF_H - 1} stroke="#ffffff" strokeWidth={1} opacity=".08" />
          <path d={area} fill={`url(#${gid})`} />
          <path d={linea} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(puntos.length - 1)} cy={y(ultimo)} r={2.6} fill={color} stroke="#0e1117" strokeWidth={1} />
          {puntos.map((v, i) => (
            <rect key={i} x={x(i) - anchoBanda / 2} y={0} width={anchoBanda} height={GRAF_H} fill="transparent">
              <title>{`${hora(tiempos[i] ?? 0)}  ${v.toFixed(decimales)} ${unidad}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div style={ejes}>
        <span>{hora(tiempos[0] ?? 0)}</span>
        <span style={{ opacity: .7 }}>mín {crudoMin.toFixed(decimales)} · máx {crudoMax.toFixed(decimales)} {unidad}</span>
        <span>{hora(tiempos[tiempos.length - 1] ?? 0)}</span>
      </div>
    </div>
  );
});

const grafTitulo: React.CSSProperties = {
  fontSize: 9.5, color: "rgba(255,255,255,.42)", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: ".06em",
};
const ejes: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", gap: 6,
  fontSize: 9, color: "rgba(255,255,255,.28)", fontVariantNumeric: "tabular-nums",
};

/* ────────────────────────────────────────────── estilos ── */

const STYLE_ID = "ups-panel-styles";
function inyectar() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes upsLate { 0%,100%{opacity:1} 50%{opacity:.25} }
    .ups-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
      border-radius:7px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.04);
      color:rgba(255,255,255,.5);cursor:pointer;transition:color .12s,background .12s}
    .ups-btn:hover{color:#e7edf6;background:rgba(255,255,255,.09)}
    .ups-btn.act{color:${AZUL};border-color:${AZUL}55;background:${AZUL}1c}
    .ups-mini b{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;color:#e7edf6}
    .ups-mini small{font-size:9px;opacity:.6;margin-left:1px}
    @media (prefers-reduced-motion:reduce){ .ups-late,[style*="upsLate"]{animation:none!important} }
  `;
  document.head.appendChild(s);
}

/* ──────────────────────────────────────────────── panel ── */

export default function UpsPanel({
  nodeId, ip, upsName, onClose, onConfigure, anchorX, anchorY,
  fijado, onFijar, posGuardada, onMover, mini, onMini,
}: {
  nodeId: string; ip?: string; upsName: string; onClose: () => void;
  onConfigure?: () => void; anchorX?: number; anchorY?: number;
  /** Fijado = vuelve a abrirse solo al entrar al mapa. */
  fijado?: boolean;
  onFijar?: (v: boolean, pos: { left: number; top: number }) => void;
  posGuardada?: { left: number; top: number } | null;
  onMover?: (pos: { left: number; top: number }) => void;
  /** Contraído: sólo el renglón de resumen, para poder fijar varias UPS. */
  mini?: boolean;
  onMini?: (v: boolean) => void;
}) {
  const [data, setData] = useState<UpsResult | null>(null);
  const [history, setHistory] = useState<UpsHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const vivoRef = useRef(true);

  /* ── posición ── */
  const ancho = mini ? ANCHO_MINI : ANCHO;
  const anchoVentana = typeof window !== "undefined" ? window.innerWidth : 1280;
  const altoVentana = typeof window !== "undefined" ? window.innerHeight : 800;
  const inicial = posGuardada
    ? posGuardada
    : {
        left: Math.max(8, Math.min((anchorX ?? anchoVentana - ancho - 60) - ancho / 2, anchoVentana - ancho - 8)),
        top: Math.max(8, Math.min((anchorY ?? 80) + 20, altoVentana - 340)),
      };
  const [pos, setPos] = useState(inicial);
  const [arrastrando, setArrastrando] = useState(false);
  const salto = useRef({ x: 0, y: 0 });

  const alBajar = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, form, a")) return;
    e.preventDefault();
    setArrastrando(true);
    salto.current = { x: e.clientX - pos.left, y: e.clientY - pos.top };
  };
  useEffect(() => {
    if (!arrastrando) return;
    const mover = (e: MouseEvent) => setPos({ left: e.clientX - salto.current.x, top: e.clientY - salto.current.y });
    const soltar = () => {
      setArrastrando(false);
      setPos((p) => { onMover?.(p); return p; });
    };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    return () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
  }, [arrastrando, onMover]);

  useEffect(() => { inyectar(); }, []);

  /* ── datos ── */
  const consultar = useCallback(async () => {
    if (!nodeId) return;
    abortRef.current?.abort();
    const c = new AbortController();
    abortRef.current = c;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/ups/poll"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }), signal: c.signal,
      });
      const r: UpsResult = await res.json();
      if (!vivoRef.current) return;
      setData(r);
      setError(r.reachable ? null : r.error || "No se pudo alcanzar la UPS");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (vivoRef.current) setError(err?.message || "error");
    } finally {
      if (vivoRef.current) setLoading(false);
    }
  }, [nodeId]);

  const traerHistorial = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/ups/history?nodeId=${encodeURIComponent(nodeId)}&hours=6`));
      const j = await res.json();
      if (vivoRef.current && j.points) setHistory(j.points);
    } catch { /* no es crítico */ }
  }, [nodeId]);

  useEffect(() => {
    vivoRef.current = true;
    consultar(); traerHistorial();
    const a = setInterval(consultar, 30_000);
    const b = setInterval(traerHistorial, 60_000);
    return () => { vivoRef.current = false; abortRef.current?.abort(); clearInterval(a); clearInterval(b); };
  }, [consultar, traerHistorial]);

  useEffect(() => {
    const socket = getSocket();
    const lectura = (p: { nodeId: string; result: UpsResult }) => {
      if (p?.nodeId !== nodeId || !p.result) return;
      setData(p.result);
      setError(p.result.reachable ? null : p.result.error || "No se pudo alcanzar la UPS");
    };
    const foto = (s: Record<string, UpsResult>) => {
      const r = s?.[nodeId];
      if (r) { setData(r); setError(r.reachable ? null : r.error || "No se pudo alcanzar la UPS"); }
    };
    socket.on("ups:reading", lectura);
    socket.on("ups:snapshot", foto);
    return () => { socket.off("ups:reading", lectura); socket.off("ups:snapshot", foto); };
  }, [nodeId]);

  /* ── derivados ── */
  const bat = data?.battery, ent = data?.input, sal = data?.output, ident = data?.identity;
  const enBateria = sal?.status === "onBattery";
  const cEstado = sal ? statusColor(sal.status) : "#6b7280";
  const tEstado = sal ? statusLabel(sal.status) : "—";
  const ipVisible = ip || data?.ip || "—";
  const marca = data?.vendor ? VENDOR_BADGE[data.vendor] : null;
  const transporte = data?.vendor === "nut" ? "NUT" : "SNMP";

  const tiempos = history.map((p) => p.t);
  /** Tramos en batería, en fracción del ancho: lo que hace legible el resto. */
  const tramos: Tramo[] = [];
  {
    let ini = -1;
    for (let i = 0; i < history.length; i++) {
      const enBat = String(history[i].status || "").toLowerCase().includes("battery");
      if (enBat && ini < 0) ini = i;
      if ((!enBat || i === history.length - 1) && ini >= 0) {
        const fin = enBat ? i : i - 1;
        tramos.push({ x0: ini / Math.max(1, history.length - 1), x1: fin / Math.max(1, history.length - 1) });
        ini = -1;
      }
    }
  }

  const serieCarga = history.map((p) => p.load);
  const serieBateria = history.map((p) => p.charge);
  const serieEntrada = history.filter((p) => p.inputV != null).map((p) => p.inputV!);
  const tiemposEntrada = history.filter((p) => p.inputV != null).map((p) => p.t);
  const serieTemp = history.filter((p) => p.temp != null).map((p) => p.temp!);
  const tiemposTemp = history.filter((p) => p.temp != null).map((p) => p.t);

  const Cifra = ({ icono, k, v, u, c }: { icono: React.ReactNode; k: string; v: string; u: string; c?: string }) => (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2, padding: "7px 9px", minWidth: 0,
      border: "1px solid rgba(255,255,255,.06)", borderRadius: 9, background: "rgba(255,255,255,.025)",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "rgba(255,255,255,.38)", textTransform: "uppercase", letterSpacing: ".05em" }}>
        {icono}{k}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: c || "#e7edf6", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {v}<span style={{ fontSize: 9.5, opacity: .55, marginLeft: 2 }}>{u}</span>
      </span>
    </div>
  );

  return (
    <div
      className="fixed z-50 flex flex-col"
      style={{
        left: pos.left, top: pos.top, width: ancho,
        maxHeight: "calc(100vh - 40px)",
        background: "rgba(11,14,20,.97)",
        border: `1px solid ${enBateria ? AMBAR + "44" : "rgba(255,255,255,.08)"}`,
        borderRadius: 14,
        boxShadow: "0 18px 50px rgba(0,0,0,.55)",
        backdropFilter: "blur(18px)",
        overflow: "hidden",
        userSelect: arrastrando ? "none" : "auto",
      }}
    >
      {/* ── cabecera ── */}
      <div onMouseDown={alBajar} style={{
        display: "flex", alignItems: "center", gap: 9, padding: "9px 11px",
        borderBottom: "1px solid rgba(255,255,255,.07)",
        cursor: arrastrando ? "grabbing" : "grab",
        background: `linear-gradient(180deg, ${cEstado}0f, transparent)`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9, flex: "none",
          background: `${cEstado}18`, border: `1px solid ${cEstado}3a`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Zap className="w-4 h-4" style={{ color: cEstado }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#eef2f8", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {upsName}
          </div>
          {!mini && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, fontSize: 10, color: "rgba(255,255,255,.32)" }}>
              <span style={{ fontFamily: "ui-monospace,monospace" }}>{ipVisible}</span>
              <span>·</span>
              <span>{transporte}{marca ? ` · ${marca}` : ""}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button className="ups-btn" onClick={consultar} disabled={loading} title="Volver a consultar">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {onMini && (
            <button className="ups-btn" onClick={() => onMini(!mini)}
              title={mini ? "Ver todo" : "Contraer: deja sólo el resumen, para poder fijar varias"}>
              {mini ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
          {onFijar && (
            <button className={"ups-btn" + (fijado ? " act" : "")} onClick={() => onFijar(!fijado, pos)}
              title={fijado ? "Dejar de mostrarlo al abrir el mapa" : "Dejarlo abierto: vuelve solo al entrar al mapa"}>
              {fijado ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>
          )}
          {onConfigure && (
            <button className="ups-btn" onClick={onConfigure} title="Configurar la UPS">
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
          <button className="ups-btn" onClick={onClose} title="Cerrar"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {mini ? (
        /* Resumen: lo minimo para saber si hay que mirar. El resto esta a un clic. */
        <div className="ups-mini" style={{ padding: "7px 11px 9px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700,
            color: cEstado, background: `${cEstado}18`, border: `1px solid ${cEstado}45`, whiteSpace: "nowrap",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: cEstado }} />
            {data?.reachable ? tEstado : "sin respuesta"}
          </span>

          {bat && (
            <span style={miniCifra} title="Carga de la batería">
              <b style={{ color: batteryColor(bat.charge) }}>{Math.round(bat.charge)}<small>%</small></b>
              <span>bat</span>
            </span>
          )}
          {sal?.loadPercent != null && (
            <span style={miniCifra} title="Carga del equipo conectado">
              <b style={{ color: loadColor(sal.loadPercent) }}>{Math.round(sal.loadPercent)}<small>%</small></b>
              <span>carga</span>
            </span>
          )}
          {bat?.runtimeMinutes != null && (
            <span style={miniCifra} title="Autonomía restante">
              <b style={{ color: bat.runtimeMinutes < 10 ? ROJO : "#e7edf6" }}>{runtimeStr(bat.runtimeMinutes)}</b>
            </span>
          )}
          {bat && bat.health !== "normal" && bat.health !== "unknown" && (
            <span style={{ ...miniCifra, color: ROJO }} title="La batería necesita atención">
              <AlertTriangle className="w-3 h-3" />
            </span>
          )}
          {!data && <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>consultando…</span>}
        </div>
      ) : (
      <div style={{ flex: 1, overflowY: "auto", padding: "11px 13px 13px", display: "flex", flexDirection: "column", gap: 11 }}>

        {loading && !data && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 18 }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: AZUL }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>Consultando {ipVisible}…</span>
          </div>
        )}

        {error && !data && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 10 }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: ROJO }} />
            <span style={{ fontSize: 11.5, color: "#fca5a5" }}>{error}</span>
          </div>
        )}

        {data?.reachable && bat && sal && (
          <>
            {/* ── lo primero que se mira ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <Anillo pct={bat.charge} color={batteryColor(bat.charge)} enBateria={enBateria} etiqueta="batería" />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
                  padding: "3px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 700,
                  color: cEstado, background: `${cEstado}18`, border: `1px solid ${cEstado}45`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: cEstado }} />
                  {tEstado}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <Clock className="w-3 h-3" style={{ color: "rgba(255,255,255,.3)" }} />
                  <span style={{
                    fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    color: bat.runtimeMinutes != null && bat.runtimeMinutes < 10 ? ROJO : "#e7edf6",
                  }}>
                    {runtimeStr(bat.runtimeMinutes)}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.32)" }}>de autonomía</span>
                </div>
                {sal.loadPercent != null && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,.38)" }}>
                      <span>carga del equipo</span>
                      <span style={{ color: loadColor(sal.loadPercent), fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(sal.loadPercent)} %
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
                      <span style={{
                        display: "block", height: "100%", borderRadius: 99,
                        width: `${Math.min(100, sal.loadPercent)}%`, background: loadColor(sal.loadPercent),
                        transition: "width .6s ease",
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {bat.health !== "normal" && bat.health !== "unknown" && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 9, background: "rgba(239,68,68,.09)", border: "1px solid rgba(239,68,68,.22)" }}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: ROJO }} />
                <span style={{ fontSize: 11.5, color: "#fca5a5", fontWeight: 600 }}>
                  {bat.health === "replace" ? "Hay que reemplazar la batería"
                    : bat.health === "low" ? "Batería baja"
                    : bat.health === "depleted" ? "Batería agotada"
                    : bat.health === "fault" ? "Falla en la batería" : bat.health}
                </span>
              </div>
            )}

            {/* ── cifras del momento ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 7 }}>
              {ent?.voltage != null && (
                <Cifra icono={<Plug className="w-2.5 h-2.5" />} k="entrada" v={String(Math.round(ent.voltage))} u="V"
                  c={ent.voltage >= 200 && ent.voltage <= 245 ? "#e7edf6" : AMBAR} />
              )}
              {sal.voltage != null && (
                <Cifra icono={<Zap className="w-2.5 h-2.5" />} k="salida" v={String(Math.round(sal.voltage))} u="V"
                  c={sal.voltage >= 200 && sal.voltage <= 245 ? "#e7edf6" : AMBAR} />
              )}
              {ent?.frequency != null && (
                <Cifra icono={<Activity className="w-2.5 h-2.5" />} k="frecuencia" v={ent.frequency.toFixed(1)} u="Hz"
                  c={Math.abs(ent.frequency - 50) <= 1.5 ? "#e7edf6" : AMBAR} />
              )}
              {bat.temperature != null && (
                <Cifra icono={<Thermometer className="w-2.5 h-2.5" />} k="temperatura" v={String(Math.round(bat.temperature))} u="°C"
                  c={bat.temperature > 40 ? ROJO : bat.temperature > 35 ? AMBAR : "#e7edf6"} />
              )}
              {sal.power != null && (
                <Cifra icono={<Gauge className="w-2.5 h-2.5" />} k="potencia" v={String(Math.round(sal.power))}
                  u={data.vendor === "apc" ? "VA" : "W"} />
              )}
              {bat.voltage != null && (
                <Cifra icono={<Zap className="w-2.5 h-2.5" />} k="batería" v={bat.voltage.toFixed(1)} u="Vcc" />
              )}
            </div>

            {/* ── curvas ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 3, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.55)" }}>Últimas 6 horas</span>
                <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.28)" }}>
                  {tramos.length > 0
                    ? <><span style={{ display: "inline-block", width: 8, height: 8, background: AMBAR, opacity: .5, borderRadius: 2, marginRight: 4, verticalAlign: -1 }} />
                        {tramos.length} {tramos.length === 1 ? "tirada" : "tiradas"} en batería</>
                    : `${history.length} lecturas`}
                </span>
              </div>
              <Grafica puntos={serieCarga} tiempos={tiempos} tramos={tramos} color={AZUL} titulo="Carga" unidad="%" minFijo={0} />
              <Grafica puntos={serieBateria} tiempos={tiempos} tramos={tramos} color={AQUA} titulo="Batería" unidad="%" minFijo={0} maxFijo={100} />
              {serieEntrada.length > 1 && (
                <Grafica puntos={serieEntrada} tiempos={tiemposEntrada} tramos={tramos} color={AZUL} titulo="Tensión de entrada" unidad="V" />
              )}
              {serieTemp.length > 1 && (
                <Grafica puntos={serieTemp} tiempos={tiemposTemp} tramos={tramos} color={AMBAR} titulo="Temperatura" unidad="°C" decimales={1} />
              )}
            </div>

            {ident?.model && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.25)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ident.model}{ident.serial ? ` · S/N ${ident.serial}` : ""}
              </div>
            )}
          </>
        )}

        {data && !data.reachable && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 18, textAlign: "center" }}>
            <Plug className="w-7 h-7" style={{ color: "rgba(255,255,255,.14)" }} />
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.45)" }}>No se pudo alcanzar la UPS</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.24)" }}>{data.error || `${ipVisible} no responde`}</span>
            <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
              <button onClick={consultar} className="cursor-pointer" style={botonChico}>Reintentar</button>
              {onConfigure && (
                <button onClick={onConfigure} className="cursor-pointer"
                  style={{ ...botonChico, color: AZUL, borderColor: AZUL + "45", background: AZUL + "14" }}>
                  Configurar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {!mini && <div style={{
        padding: "6px 12px", borderTop: "1px solid rgba(255,255,255,.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 9.5, color: "rgba(255,255,255,.25)",
      }}>
        <span>
          {data?.timestamp ? `leído ${new Date(data.timestamp).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "sin lectura"}
          {data?.cached ? " · de caché" : ""}
        </span>
        {fijado && <span style={{ color: AZUL }}>fijado al mapa</span>}
      </div>}
    </div>
  );
}

const miniCifra: React.CSSProperties = {
  display: "inline-flex", alignItems: "baseline", gap: 3,
  fontSize: 10, color: "rgba(255,255,255,.42)", whiteSpace: "nowrap",
};

const botonChico: React.CSSProperties = {
  padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
  background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.55)",
  border: "1px solid rgba(255,255,255,.1)",
};
