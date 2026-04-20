"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import PageTransition from "@/components/mobile/PageTransition";
import { SkeletonList } from "@/components/mobile/Skeleton";
import { useToast } from "@/components/mobile/MobileToast";
import { hapticTap, hapticSuccess, hapticMedium } from "@/lib/haptics";

interface KumaMonitor {
  id: number;
  name: string;
  status: number;
  type: string;
  ping: number | null;
  msg: string;
}

// ── Alert sound generator (Web Audio API) ──
function playAlertSound(type: "critical" | "warning" | "resolve") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "critical") {
      // Urgent two-tone alarm
      osc.type = "square";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === "warning") {
      // Softer single beep
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
      // Resolve — pleasant ascending tone
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }

    setTimeout(() => ctx.close(), 1000);
  } catch { /* Audio not available */ }
}

export default function MobileAlerts() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "down" | "up">("down");
  const [acknowledged, setAcknowledged] = useState<Set<number>>(() => {
    try {
      const saved = sessionStorage.getItem("kumamap-acked");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevDownIds = useRef<Set<number>>(new Set());
  const { show } = useToast();

  const saveAcked = (set: Set<number>) => {
    try { sessionStorage.setItem("kumamap-acked", JSON.stringify([...set])); } catch {}
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/kuma"));
      if (res.ok) {
        const data = await res.json();
        const newMonitors: KumaMonitor[] = data.monitors || [];
        setMonitors(newMonitors);

        // Detect new DOWN monitors for sound
        const currentDownIds = new Set(newMonitors.filter(m => m.status === 0).map(m => m.id));
        if (prevDownIds.current.size > 0 && soundEnabled) {
          for (const id of currentDownIds) {
            if (!prevDownIds.current.has(id) && !acknowledged.has(id)) {
              playAlertSound("critical");
              break;
            }
          }
          // Detect recoveries
          for (const id of prevDownIds.current) {
            if (!currentDownIds.has(id)) {
              playAlertSound("resolve");
              // Auto-remove from acknowledged when recovered
              setAcknowledged(prev => {
                const next = new Set(prev);
                next.delete(id);
                saveAcked(next);
                return next;
              });
              break;
            }
          }
        }
        prevDownIds.current = currentDownIds;
      }
    } catch {
      show("Sin conexión", "error");
    }
    finally { setLoading(false); }
  }, [show, soundEnabled, acknowledged]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  const filtered = monitors.filter((m) => {
    if (filter === "down") return m.status === 0;
    if (filter === "up") return m.status === 1;
    return true;
  });

  const downCount = monitors.filter((m) => m.status === 0).length;
  const upCount = monitors.filter((m) => m.status === 1).length;
  const unackedDown = monitors.filter(m => m.status === 0 && !acknowledged.has(m.id)).length;

  const handleRefresh = useCallback(async () => {
    await fetchData();
    hapticSuccess();
    show("Actualizado", "success");
  }, [fetchData, show]);

  const handleAcknowledge = (id: number) => {
    hapticMedium();
    setAcknowledged(prev => {
      const next = new Set(prev);
      next.add(id);
      saveAcked(next);
      return next;
    });
    show("Alerta confirmada", "info");
  };

  const handleAcknowledgeAll = () => {
    hapticMedium();
    const downIds = monitors.filter(m => m.status === 0).map(m => m.id);
    setAcknowledged(prev => {
      const next = new Set(prev);
      downIds.forEach(id => next.add(id));
      saveAcked(next);
      return next;
    });
    show("Todas las alertas confirmadas", "info");
  };

  return (
    <PageTransition>
    <PullToRefresh onRefresh={handleRefresh}>
      {/* Header — immersive */}
      <div className="px-5 pt-3 pb-2 safe-top">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-[#ededed]">Alertas</h1>
          <div className="flex items-center gap-2">
            {/* Sound toggle */}
            <button
              onClick={() => { setSoundEnabled(s => !s); hapticTap(); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
              style={{
                background: soundEnabled ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${soundEnabled ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.08)"}`,
              }}
              title={soundEnabled ? "Sonido activado" : "Sonido silenciado"}
            >
              {soundEnabled ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              )}
            </button>
            {downCount > 0 && (
              <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                {downCount} DOWN
              </span>
            )}
            <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              {upCount} UP
            </span>
          </div>
        </div>
      </div>

      {/* Filter tabs + ack all */}
      <div className="px-5 py-2 flex items-center gap-2">
        <div className="flex gap-1.5 flex-1">
          {([
            { key: "down" as const, label: "Caídos", count: downCount, color: "#ef4444" },
            { key: "up" as const, label: "Activos", count: upCount, color: "#22c55e" },
            { key: "all" as const, label: "Todos", count: monitors.length, color: "#60a5fa" },
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); hapticTap(); }}
              className="rounded-2xl px-4 py-2 text-[11px] font-bold transition-all active:scale-95"
              style={{
                background: filter === f.key ? `${f.color}18` : "rgba(255,255,255,0.03)",
                border: `1px solid ${filter === f.key ? `${f.color}35` : "rgba(255,255,255,0.06)"}`,
                color: filter === f.key ? f.color : "#666",
              }}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        {unackedDown > 0 && (
          <button
            onClick={handleAcknowledgeAll}
            className="rounded-2xl px-3 py-2 text-[10px] font-bold transition-all active:scale-95"
            style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}
          >
            ACK todo
          </button>
        )}
      </div>

      {/* Monitor list */}
      <div className="flex-1 px-5 space-y-2 pb-4">
        {loading && <SkeletonList count={5} />}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-[#555]">
            {filter === "down" ? (
              <>
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <p className="text-sm text-[#22c55e] font-bold">Todo operativo</p>
                <p className="text-xs text-[#555] mt-1">No hay monitores caídos</p>
              </>
            ) : (
              <p className="text-sm">Sin resultados</p>
            )}
          </div>
        )}

        {filtered.map((m) => (
          <AlertCard
            key={m.id}
            monitor={m}
            onToast={show}
            acknowledged={acknowledged.has(m.id)}
            onAcknowledge={() => handleAcknowledge(m.id)}
          />
        ))}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 16px rgba(239,68,68,0.8); }
        }
        .safe-top { padding-top: max(env(safe-area-inset-top, 12px), 12px); }
      `}</style>
    </PullToRefresh>
    </PageTransition>
  );
}

/* ── Expandable alert card ── */
function AlertCard({
  monitor: m,
  onToast,
  acknowledged,
  onAcknowledge,
}: {
  monitor: KumaMonitor;
  onToast: (msg: string, type?: "success" | "error" | "info" | "warning") => void;
  acknowledged: boolean;
  onAcknowledge: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      hapticMedium();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(m.name).then(() => onToast("Nombre copiado", "info")).catch(() => {});
        } else {
          const ta = document.createElement("textarea");
          ta.value = m.name;
          ta.style.cssText = "position:fixed;left:-9999px;opacity:0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          onToast("Nombre copiado", "info");
        }
      } catch {}
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const isDown = m.status === 0;
  const isAcked = isDown && acknowledged;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: isDown
          ? isAcked ? "rgba(245,158,11,0.04)" : "rgba(239,68,68,0.06)"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${isDown
          ? isAcked ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)"
          : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <button
        onClick={() => { setExpanded(!expanded); hapticTap(); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-white/[0.02] transition-all text-left"
      >
        <div
          className="h-3.5 w-3.5 rounded-full shrink-0"
          style={{
            background: m.status === 1 ? "#22c55e" : isAcked ? "#f59e0b" : "#ef4444",
            boxShadow: isDown && !isAcked ? "0 0 10px rgba(239,68,68,0.6)" : "none",
            animation: isDown && !isAcked ? "pulse-dot 2s ease-in-out infinite" : "none",
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[#ddd] truncate">{m.name}</div>
          <div className="text-[11px] text-[#555] truncate mt-0.5">
            {isAcked && <span style={{ color: "#f59e0b", fontWeight: 700 }}>ACK · </span>}
            {m.msg || m.type.toUpperCase()}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {m.ping != null && m.status === 1 && (
            <span className="text-[11px] font-mono text-[#555]">{m.ping}ms</span>
          )}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expandable detail */}
      {expanded && (
        <div
          className="px-4 pb-3.5 pt-0 border-t"
          style={{ borderColor: "rgba(255,255,255,0.04)", animation: "expand-in 0.2s ease-out" }}
        >
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <DetailChip label="Tipo" value={m.type.toUpperCase()} />
            <DetailChip label="ID" value={`#${m.id}`} />
            {m.ping != null && <DetailChip label="Latencia" value={`${m.ping}ms`} />}
            <DetailChip
              label="Estado"
              value={m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING"}
              color={m.status === 1 ? "#22c55e" : m.status === 0 ? "#ef4444" : "#f59e0b"}
            />
          </div>
          {m.msg && (
            <div className="rounded-xl px-3 py-2 mb-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-[9px] uppercase tracking-wider text-[#444] mb-0.5">Mensaje</div>
              <div className="text-[11px] text-[#888] break-all">{m.msg}</div>
            </div>
          )}
          {/* Acknowledge button */}
          {isDown && !isAcked && (
            <button
              onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
              className="w-full py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
              style={{
                background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.08))",
                border: "1px solid rgba(245,158,11,0.25)",
                color: "#fbbf24",
              }}
            >
              Confirmar alerta
            </button>
          )}
          {isAcked && (
            <div className="text-center py-1.5 text-[10px] font-bold" style={{ color: "rgba(245,158,11,0.6)" }}>
              Alerta confirmada
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes expand-in {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 300px; }
        }
      `}</style>
    </div>
  );
}

function DetailChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="text-[9px] uppercase tracking-wider text-[#444]">{label}</div>
      <div className="text-[11px] font-mono font-bold" style={{ color: color || "#aaa" }}>{value}</div>
    </div>
  );
}
