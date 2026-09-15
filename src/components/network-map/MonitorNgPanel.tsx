"use client";

/**
 * Ventana flotante de un servidor monitor-ng. Misma mecánica de arrastre y
 * guardado que las de tráfico y UPS (vía FloatPanel): ya NO es un punto/nodo en
 * el mapa, es una ventana flotante como las demás. Se vincula a un dispositivo
 * adoptado y muestra su estado y métricas; los datos los deja el poller de
 * LeafletMapView en window["mng-<deviceId>"].
 */

import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import FloatPanel from "./FloatPanel";

export default function MonitorNgPanel({
  deviceId, titulo, posGuardada, onMover, onLink, onClose,
}: {
  deviceId?: string;
  titulo: string;
  posGuardada?: { left: number; top: number } | null;
  onMover?: (pos: { left: number; top: number }) => void;
  onLink: () => void;
  onClose: () => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(iv);
  }, []);

  const controls = [
    { key: "link", title: "Vincular dispositivo", content: <Link2 className="w-3 h-3" />, onClick: onLink },
    { key: "close", title: "Quitar del mapa", content: <X className="w-3 h-3" />, onClick: onClose },
  ];

  const d: any = deviceId ? (window as any)[`mng-${deviceId}`] || null : null;

  // ── Sin vincular ──
  if (!deviceId) {
    return (
      <FloatPanel posGuardada={posGuardada} onMover={onMover} width={200} controls={controls}>
        <div style={{ color: "#93a3b8", fontSize: 11.5, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: "#c8d4e4", marginBottom: 3 }}>Servidor monitor-ng</div>
          Sin vincular. Usá el enlace 🔗 y elegí un dispositivo.
        </div>
      </FloatPanel>
    );
  }

  // ── Vinculado, todavía sin datos ──
  if (!d) {
    return (
      <FloatPanel posGuardada={posGuardada} onMover={onMover} width={200} accent="#64748b" controls={controls}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "#64748b", flex: "none" }} />
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "#c4d0e0", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</span>
        </div>
        <div style={{ fontSize: 11, color: "#7d8da0" }}>consultando…</div>
      </FloatPanel>
    );
  }

  const estado = d.stale ? "idle" : (d.state || "idle");
  const col = estado === "crit" ? "#ef4444" : estado === "warn" ? "#f59e0b" : estado === "ok" ? "#22c55e" : "#64748b";
  const et = estado === "crit" ? "Crítico" : estado === "warn" ? "Atención" : estado === "ok" ? "OK" : (d.stale ? "Sin reporte" : "Inactivo");
  const mcol = (s: string) => s === "crit" ? "#ef4444" : s === "warn" ? "#f59e0b" : s === "ok" ? "#22c55e" : "#93a3b8";
  const mets: any[] = Array.isArray(d.metrics) ? d.metrics.slice(0, 4) : [];

  const cont = (n: number, c: string, lbl: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "#e8eef7", fontVariantNumeric: "tabular-nums" }}>{n}</span>
      <span style={{ fontSize: 8.5, color: "#7d8da0" }}>{lbl}</span>
    </span>
  );

  return (
    <FloatPanel posGuardada={posGuardada} onMover={onMover} width={214} accent={col} controls={controls}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: col, flex: "none", boxShadow: `0 0 6px ${col}` }} />
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#c4d0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>{d.name || titulo}</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: ".04em" }}>{et}</span>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 8, paddingBottom: 7, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        {cont(d.ok || 0, "#22c55e", "ok")}{cont(d.warn || 0, "#f59e0b", "warn")}{cont(d.crit || 0, "#ef4444", "crit")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {mets.length > 0 ? mets.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 9.5, color: "#93a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{m.label || m.id}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: mcol(m.state), fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis" }}>{m.value || "—"}</span>
          </div>
        )) : <span style={{ fontSize: 10, color: "#7d8da0" }}>sin métricas aún</span>}
      </div>
    </FloatPanel>
  );
}
