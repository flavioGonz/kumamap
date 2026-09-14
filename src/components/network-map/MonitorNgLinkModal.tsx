"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Server, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiUrl } from "@/lib/api";

export interface MngDevice {
  deviceId: string;
  name: string;
  ip?: string;
  monitorId: number;
  state?: string;
  ok?: number;
  warn?: number;
  crit?: number;
  stale?: boolean;
  lastSeen?: number;
}

export interface MonitorNgLinkProps {
  open: boolean;
  actualDeviceId?: string;
  onSelect: (d: MngDevice) => void;
  onClose: () => void;
}

const colorEstado = (s?: string, stale?: boolean) =>
  stale ? "#64748b" : s === "crit" ? "#ef4444" : s === "warn" ? "#f59e0b" : s === "ok" ? "#22c55e" : "#64748b";
const labelEstado = (s?: string, stale?: boolean) =>
  stale ? "Sin reporte" : s === "crit" ? "Crítico" : s === "warn" ? "Atención" : s === "ok" ? "OK" : "Inactivo";

export default function MonitorNgLinkModal({ open, actualDeviceId, onSelect, onClose }: MonitorNgLinkProps) {
  const [devs, setDevs] = useState<MngDevice[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const cargar = async () => {
    setCargando(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/monitor-ng/devices"), { credentials: "include" });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || "No se pudo leer la lista"); return; }
      setDevs(Array.isArray(json?.adopted) ? json.adopted : []);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally { setCargando(false); }
  };

  useEffect(() => { if (open) cargar(); }, [open]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const arr = t ? devs.filter((d) => (d.name || "").toLowerCase().includes(t) || (d.ip || "").includes(t)) : devs;
    return [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [devs, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 96vw)", maxHeight: "82vh", display: "flex", flexDirection: "column",
          background: "var(--surface-elevated, #16181c)", border: "1px solid var(--glass-border, rgba(255,255,255,0.1))",
          borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.6)", color: "var(--text-primary, #ededed)",
        }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--glass-border, rgba(255,255,255,0.08))" }}>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4" style={{ color: "#3987e5" }} />
            <div>
              <div className="text-sm font-semibold">Vincular servidor monitor-ng</div>
              <div className="text-[11px]" style={{ color: "var(--text-secondary, #888)" }}>Elegí un dispositivo adoptado para mostrar su estado</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={cargar} title="Actualizar" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10" style={{ color: "var(--text-secondary,#888)" }}>
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10" style={{ color: "var(--text-secondary,#888)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.05)" }}>
            <Search className="h-3.5 w-3.5" style={{ color: "var(--text-secondary,#888)" }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o IP…"
              className="bg-transparent outline-none text-[13px] w-full" style={{ color: "var(--text-primary,#ededed)" }} />
          </div>
        </div>

        <div className="px-3 py-3 overflow-y-auto" style={{ flex: 1 }}>
          {error ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <AlertTriangle className="h-6 w-6" style={{ color: "#f59e0b" }} />
              <div className="text-sm" style={{ color: "var(--text-secondary,#999)" }}>{error}</div>
            </div>
          ) : cargando && !devs.length ? (
            <div className="flex justify-center py-12" style={{ color: "var(--text-secondary,#888)" }}><RefreshCw className="h-5 w-5 animate-spin" /></div>
          ) : !lista.length ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-secondary,#999)" }}>
              {devs.length ? "Ningún dispositivo coincide." : "No hay dispositivos adoptados todavía."}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {lista.map((d) => {
                const sel = d.deviceId === actualDeviceId;
                const col = colorEstado(d.state, d.stale);
                return (
                  <button key={d.deviceId} onClick={() => onSelect(d)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition hover:bg-white/5"
                    style={{ border: `1px solid ${sel ? "#3987e5" : "var(--glass-border, rgba(255,255,255,0.07))"}`, background: sel ? "rgba(57,135,229,0.08)" : "transparent" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, background: col, flex: "none", boxShadow: `0 0 6px ${col}` }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate">{d.name || "Servidor"}</span>
                        {sel && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#3987e5" }} />}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: "var(--text-secondary,#888)" }}>
                        {d.ip || "—"} · <span style={{ color: col }}>{labelEstado(d.state, d.stale)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "#22c55e" }}>{d.ok ?? 0}</span>
                      <span style={{ color: "#f59e0b" }}>{d.warn ?? 0}</span>
                      <span style={{ color: "#ef4444" }}>{d.crit ?? 0}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
