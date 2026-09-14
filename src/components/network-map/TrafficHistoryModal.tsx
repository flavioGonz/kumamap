"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Upload, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api";

const AZUL = "#3987e5";  // bajada (entrada)
const AQUA = "#199e70";  // subida (salida)

export interface TrafficHistoryProps {
  open: boolean;
  titulo: string;
  inId?: number;
  outId?: number;
  capacidadBps?: number | null;
  onClose: () => void;
}

type Punto = { t: number; bps: number };
type Datos = { entrada: Punto[]; salida: Punto[]; hours: number; muestras?: { entrada: number; salida: number } };

const RANGOS = [
  { label: "1 h", h: 1 },
  { label: "6 h", h: 6 },
  { label: "24 h", h: 24 },
  { label: "7 d", h: 168 },
];

function fmtBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${Math.round(bps)} bps`;
}

function fmtHora(t: number, spanMs: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (spanMs > 36 * 3600 * 1000) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hh}h`;
  }
  return `${hh}:${mm}`;
}

export default function TrafficHistoryModal({ open, titulo, inId, outId, capacidadBps, onClose }: TrafficHistoryProps) {
  const [hours, setHours] = useState(6);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cargar = useMemo(() => async () => {
    if (!inId || !outId) { setError("Esta ventana todavía no tiene sensores creados."); return; }
    setCargando(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/kuma/traffic-history"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inId, outId, hours }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || "No se pudo leer el historial"); setDatos(null); }
      else setDatos(json);
    } catch (e: any) {
      setError(e?.message || "Error de red"); setDatos(null);
    } finally { setCargando(false); }
  }, [inId, outId, hours]);

  useEffect(() => { if (open) cargar(); }, [open, cargar]);

  // ── Geometría del gráfico ──
  const W = 720, H = 300, mL = 62, mR = 16, mT = 16, mB = 30;
  const plotW = W - mL - mR, plotH = H - mT - mB;

  const { pathIn, pathOut, ejeY, ejeX, tMin, tMax, yMax, capY } = useMemo(() => {
    const empty = { pathIn: "", pathOut: "", ejeY: [] as { y: number; v: number }[], ejeX: [] as { x: number; t: number }[], tMin: 0, tMax: 0, yMax: 0, capY: null as number | null };
    if (!datos) return empty;
    const all = [...datos.entrada, ...datos.salida];
    if (all.length < 2) return empty;
    const tMin = Math.min(...all.map((p) => p.t));
    const tMax = Math.max(...all.map((p) => p.t));
    let yMax = Math.max(...all.map((p) => p.bps), 1);
    if (capacidadBps && capacidadBps > 0) yMax = Math.max(yMax, capacidadBps * 0.15);
    yMax *= 1.15; // aire arriba
    const spanT = Math.max(tMax - tMin, 1);
    const px = (t: number) => mL + ((t - tMin) / spanT) * plotW;
    const py = (v: number) => mT + plotH - (v / yMax) * plotH;
    const linea = (pts: Punto[]) => pts.length < 2 ? "" : pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.t).toFixed(1)},${py(p.bps).toFixed(1)}`).join(" ");
    // ticks Y (4)
    const ejeY = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: mT + plotH - f * plotH, v: f * yMax }));
    // ticks X (5)
    const ejeX = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: mL + f * plotW, t: tMin + f * spanT }));
    const capY = capacidadBps && capacidadBps > 0 && capacidadBps <= yMax ? py(capacidadBps) : null;
    return { pathIn: linea(datos.entrada), pathOut: linea(datos.salida), ejeY, ejeX, tMin, tMax, yMax, capY };
  }, [datos, capacidadBps, plotW, plotH]);

  // ── Hover: punto más cercano en el tiempo ──
  const hover = useMemo(() => {
    if (hoverX === null || !datos || tMax <= tMin) return null;
    const spanT = tMax - tMin;
    const t = tMin + ((hoverX - mL) / plotW) * spanT;
    const cerca = (pts: Punto[]) => pts.reduce<Punto | null>((best, p) => (!best || Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), null);
    const pe = cerca(datos.entrada), ps = cerca(datos.salida);
    const ref = pe || ps; if (!ref) return null;
    const x = mL + ((ref.t - tMin) / spanT) * plotW;
    return { x, t: ref.t, entrada: pe?.bps ?? null, salida: ps?.bps ?? null };
  }, [hoverX, datos, tMin, tMax, plotW]);

  if (!open) return null;
  const spanMs = tMax - tMin;
  const hayDatos = !!datos && (datos.entrada.length + datos.salida.length) >= 2;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(780px, 96vw)", background: "var(--surface-elevated, #16181c)",
          border: "1px solid var(--glass-border, rgba(255,255,255,0.1))", borderRadius: 16,
          boxShadow: "0 24px 70px rgba(0,0,0,0.6)", color: "var(--text-primary, #ededed)",
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--glass-border, rgba(255,255,255,0.08))" }}>
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 shrink-0" style={{ color: AZUL }} />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Historial de tráfico</div>
              <div className="text-[11px] truncate" style={{ color: "var(--text-secondary, #888)" }}>{titulo}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={cargar} title="Actualizar"
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition" style={{ color: "var(--text-secondary, #888)" }}>
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition" style={{ color: "var(--text-secondary, #888)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Controles: rango + leyenda */}
        <div className="flex items-center justify-between px-5 pt-3 flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>
            {RANGOS.map((r) => (
              <button key={r.h} onClick={() => setHours(r.h)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition"
                style={hours === r.h ? { background: AZUL, color: "#fff" } : { color: "var(--text-secondary, #999)" }}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 3, borderRadius: 2, background: AZUL, display: "inline-block" }} /><Download className="h-3 w-3" style={{ color: AZUL }} />Bajada</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 3, borderRadius: 2, background: AQUA, display: "inline-block" }} /><Upload className="h-3 w-3" style={{ color: AQUA }} />Subida</span>
          </div>
        </div>

        {/* Gráfico */}
        <div className="px-3 pb-2 pt-1">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-6 w-6" style={{ color: "#f59e0b" }} />
              <div className="text-sm" style={{ color: "var(--text-secondary, #999)" }}>{error}</div>
            </div>
          ) : cargando && !datos ? (
            <div className="flex items-center justify-center py-20" style={{ color: "var(--text-secondary, #888)" }}>
              <RefreshCw className="h-5 w-5 animate-spin" />
            </div>
          ) : !hayDatos ? (
            <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
              <div className="text-sm" style={{ color: "var(--text-secondary, #999)" }}>Todavía no hay historial suficiente en este rango.</div>
              <div className="text-[11px]" style={{ color: "var(--text-muted, #666)" }}>Uptime Kuma va guardando una muestra por intervalo del sensor.</div>
            </div>
          ) : (
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", cursor: "crosshair" }}
              onMouseMove={(e) => {
                const r = svgRef.current!.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * W;
                setHoverX(x >= mL && x <= W - mR ? x : null);
              }}
              onMouseLeave={() => setHoverX(null)}>
              {/* grid + eje Y */}
              {ejeY.map((g, i) => (
                <g key={i}>
                  <line x1={mL} y1={g.y} x2={W - mR} y2={g.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                  <text x={mL - 6} y={g.y + 3} textAnchor="end" fontSize={10} fill="var(--text-muted, #777)">{fmtBps(g.v)}</text>
                </g>
              ))}
              {/* eje X */}
              {ejeX.map((g, i) => (
                <text key={i} x={g.x} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--text-muted, #777)">{fmtHora(g.t, spanMs)}</text>
              ))}
              {/* capacidad */}
              {capY !== null && (
                <>
                  <line x1={mL} y1={capY} x2={W - mR} y2={capY} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
                  <text x={W - mR} y={capY - 4} textAnchor="end" fontSize={9} fill="#f59e0b">capacidad {fmtBps(capacidadBps!)}</text>
                </>
              )}
              {/* series */}
              <path d={pathIn} fill="none" stroke={AZUL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <path d={pathOut} fill="none" stroke={AQUA} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* hover */}
              {hover && (
                <>
                  <line x1={hover.x} y1={mT} x2={hover.x} y2={mT + plotH} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                  {hover.entrada !== null && <circle cx={hover.x} cy={mT + plotH - (hover.entrada / (yMax || 1)) * plotH} r={3} fill={AZUL} stroke="#fff" strokeWidth={1} />}
                  {hover.salida !== null && <circle cx={hover.x} cy={mT + plotH - (hover.salida / (yMax || 1)) * plotH} r={3} fill={AQUA} stroke="#fff" strokeWidth={1} />}
                </>
              )}
            </svg>
          )}
        </div>

        {/* Pie: valor bajo el cursor */}
        {hayDatos && (
          <div className="flex items-center justify-between px-5 py-2.5 text-[11px]" style={{ borderTop: "1px solid var(--glass-border, rgba(255,255,255,0.08))", color: "var(--text-secondary, #999)" }}>
            {hover ? (
              <>
                <span>{new Date(hover.t).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex items-center gap-4">
                  <span style={{ color: AZUL }}>▼ {fmtBps(hover.entrada ?? 0)}</span>
                  <span style={{ color: AQUA }}>▲ {fmtBps(hover.salida ?? 0)}</span>
                </span>
              </>
            ) : (
              <>
                <span>Pasá el cursor sobre el gráfico para ver los valores</span>
                <span>{datos?.muestras ? `${datos.muestras.entrada + datos.muestras.salida} muestras` : ""}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
