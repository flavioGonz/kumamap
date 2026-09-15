"use client";

/**
 * Ventana flotante de tráfico. Antes era una tarjeta dibujada como marcador de
 * Leaflet; ahora es un panel React con la MISMA mecánica de arrastre y guardado
 * que el panel de UPS (a través de FloatPanel), para que las tres ventanas del
 * mapa —tráfico, batería (UPS) y monitor-ng— se comporten idéntico.
 *
 * Los datos en vivo los deja el poller de LeafletMapView en window["traf-<id>"]
 * (tasa SNMP cada 3 s); acá los leemos en un intervalo propio y, si no hay
 * lecturas vivas, caemos al historial de Kuma que trae este mismo panel.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Pencil, Clock, X } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatTraffic } from "@/utils/format";
import FloatPanel from "./FloatPanel";

const AZUL = "#3987e5";
const AQUA = "#199e70";

interface Serie { puntos: Array<{ t: number; bps: number }>; actual: number; pico: number }

export default function TrafficPanel({
  monitorId, titulo, color, tieneSensor, posGuardada, onMover, onEdit, onHistory, onClose,
}: {
  monitorId: number | null;
  titulo: string;
  color: string;
  tieneSensor: boolean;
  posGuardada?: { left: number; top: number } | null;
  onMover?: (pos: { left: number; top: number }) => void;
  onEdit: () => void;
  onHistory: () => void;
  onClose: () => void;
}) {
  const [, setTick] = useState(0);
  const vivoRef = useRef(true);

  // Historial de Kuma (fallback cuando no hay lecturas vivas) — lo trae el panel.
  const traerHistorial = useCallback(async () => {
    if (!monitorId) return;
    try {
      const r = await fetch(apiUrl(`/api/kuma/traffic/${monitorId}?minutos=60`), { credentials: "include" });
      if (!r.ok) return;
      const dd = await r.json();
      if (dd && vivoRef.current) {
        const c: any = (window as any)[`traf-${monitorId}`] || {};
        (window as any)[`traf-${monitorId}`] = { ...dd, sello: dd?.sello, vivoBuf: c.vivoBuf };
      }
    } catch { /* una lectura suelta no importa */ }
  }, [monitorId]);

  useEffect(() => {
    vivoRef.current = true;
    traerHistorial();
    const hist = setInterval(traerHistorial, 30_000);
    // Refresco visual: leemos el buffer en vivo cada 1.5 s.
    const paint = setInterval(() => { if (vivoRef.current) setTick((t) => t + 1); }, 1500);
    return () => { vivoRef.current = false; clearInterval(hist); clearInterval(paint); };
  }, [traerHistorial]);

  const controls = [
    { key: "edit", title: "Editar ventana (SNMP)", content: <Pencil className="w-3 h-3" />, onClick: onEdit },
    { key: "hist", title: "Ver historial", content: <Clock className="w-3 h-3" />, onClick: onHistory },
    { key: "close", title: "Quitar del mapa", content: <X className="w-3 h-3" />, onClick: onClose },
  ];

  const cache: any = monitorId ? (window as any)[`traf-${monitorId}`] || null : null;

  // ── Sin sensor configurado ──
  if (!tieneSensor || !monitorId) {
    return (
      <FloatPanel posGuardada={posGuardada} onMover={onMover} width={200} controls={controls}>
        <div style={{ color: "#93a3b8", fontSize: 11.5, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: "#c8d4e4", marginBottom: 3 }}>Ventana de tráfico</div>
          Sin sensor asignado. Usá el lápiz ✎ y elegí un monitor SNMP.
        </div>
      </FloatPanel>
    );
  }

  // ── Series (vivo si hay, si no historial) ──
  let entrada: Serie | null = cache?.entrada || null;
  let salida: Serie | null = cache?.salida || null;
  const vbuf: Array<{ t: number; e: number | null; s: number | null }> = cache?.vivoBuf || [];
  if (vbuf.length >= 2) {
    const serie = (k: "e" | "s"): Serie | null => {
      const p = vbuf.filter((x) => x[k] != null).map((x) => ({ t: x.t, bps: x[k] as number }));
      if (p.length < 2) return null;
      const vals = p.map((v) => v.bps);
      return { puntos: p, actual: vals[vals.length - 1], pico: Math.max(...vals) };
    };
    entrada = serie("e") || entrada;
    salida = serie("s") || salida;
  }

  const cap: number | null = cache?.capacidadBps ?? null;
  const ifaz = cache?.interfaz || null;
  const pico = Math.max(entrada?.pico || 0, salida?.pico || 0);
  const techo = pico > 0 ? pico * 1.15 : 1;

  const W = 172, H = 40;
  const puntosXY = (s: Serie | null) => {
    const p = (s?.puntos || []).slice(-60);
    if (p.length < 2) return null;
    return p.map((v, i) => ({ x: (i / (p.length - 1)) * W, y: H - (v.bps / techo) * (H - 3), t: v.t, bps: v.bps }));
  };
  const pE = puntosXY(entrada), pS = puntosXY(salida);
  const camino = (pts: Array<{ x: number; y: number }> | null) =>
    pts ? pts.map((q, i) => `${i === 0 ? "M" : "L"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ") : "";
  const base = pE || pS;
  const yCap = cap && pico > 0 && cap < techo ? (H - (cap / techo) * (H - 3)).toFixed(1) : null;

  const fila = (col: string, flecha: string, s: Serie | null) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: col, flex: "none", transform: "translateY(-1px)" }} />
      <span style={{ fontSize: 9, color: "#93a3b8", letterSpacing: ".04em" }}>{flecha}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#e8eef7", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {s?.actual != null ? formatTraffic(s.actual) : "—"}
      </span>
    </div>
  );

  const pct = cap && pico > 0 ? Math.round((pico / cap) * 100) : null;
  const pie = pico > 0
    ? `pico ${formatTraffic(pico)}${pct != null ? ` · ${pct}% de ${formatTraffic(cap!)}` : ""}`
    : (cache?.aviso || "esperando lecturas");
  const tit = ifaz?.nombre ? `${ifaz.nombre}${ifaz.alias ? ` · ${ifaz.alias}` : ""}` : titulo;

  return (
    <FloatPanel posGuardada={posGuardada} onMover={onMover} width={214} controls={controls}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: color, flex: "none", boxShadow: `0 0 6px ${color}` }} />
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#c4d0e0", letterSpacing: ".02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{tit}</span>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 5 }}>
        {fila(AZUL, "▼", entrada)}
        {salida && fila(AQUA, "▲", salida)}
      </div>
      {(pE || pS) && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
          <line x1={0} y1={H} x2={W} y2={H} stroke="#ffffff" strokeWidth={1} opacity={0.12} />
          {yCap && <line x1={0} y1={yCap} x2={W} y2={yCap} stroke="#8493a8" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
          {pE && <>
            <path d={`${camino(pE)} L${W},${H} L0,${H} Z`} fill={AZUL} opacity={0.22} />
            <path d={camino(pE)} fill="none" stroke={AZUL} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </>}
          {pS && <path d={camino(pS)} fill="none" stroke={AQUA} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {base && base.map((q, i) => {
            const ancho = W / base.length;
            const hora = new Date(q.t).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
            const a = pE?.[i] ? formatTraffic(pE[i].bps) : "—";
            const b = pS?.[i] ? formatTraffic(pS[i].bps) : "—";
            return <rect key={i} x={(q.x - ancho / 2).toFixed(1)} y={0} width={ancho.toFixed(1)} height={H} fill="transparent"><title>{`${hora}  ▼ ${a}   ▲ ${b}`}</title></rect>;
          })}
        </svg>
      )}
      <div style={{ marginTop: 5, fontSize: 9, color: "#7d8da0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 182 }}>{pie}</div>
    </FloatPanel>
  );
}
