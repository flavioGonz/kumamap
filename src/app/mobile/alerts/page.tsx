"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import PageTransition from "@/components/mobile/PageTransition";
import { SkeletonKpiRow, SkeletonAlertList } from "@/components/mobile/Skeleton";
import { useToast } from "@/components/mobile/MobileToast";
import { hapticTap, hapticSuccess, hapticMedium, hapticError } from "@/lib/haptics";

interface KumaMonitor {
  id: number;
  name: string;
  status: number;
  type: string;
  ping: number | null;
  msg: string;
  uptime24?: number;
}

interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  time: string;
  status: number;
  prevStatus: number;
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
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export default function MobileAlerts() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"status" | "timeline">("status");
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
      const [kumaRes, tlRes] = await Promise.all([
        fetch(apiUrl("/api/kuma")),
        fetch(apiUrl("/api/kuma/timeline?hours=6")),
      ]);
      if (kumaRes.ok) {
        const data = await kumaRes.json();
        const newMonitors: KumaMonitor[] = Array.isArray(data.monitors) ? data.monitors : [];
        setMonitors(newMonitors);

        // Detect new DOWN monitors for sound
        const currentDownIds = new Set(newMonitors.filter(m => m.status === 0).map(m => m.id));
        if (prevDownIds.current.size > 0 && soundEnabled) {
          for (const id of currentDownIds) {
            if (!prevDownIds.current.has(id) && !acknowledged.has(id)) {
              playAlertSound("critical");
              hapticError();
              break;
            }
          }
          for (const id of prevDownIds.current) {
            if (!currentDownIds.has(id)) {
              playAlertSound("resolve");
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
      if (tlRes.ok) {
        const tlData = await tlRes.json();
        setTimeline(Array.isArray(tlData?.events) ? tlData.events : []);
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
  const pendingCount = monitors.filter((m) => m.status !== 0 && m.status !== 1).length;
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

  // Availability percentage
  const totalActive = monitors.filter(m => m.status === 0 || m.status === 1).length;
  const availability = totalActive > 0 ? Math.round((upCount / totalActive) * 1000) / 10 : 100;

  return (
    <PageTransition>
    <PullToRefresh onRefresh={handleRefresh}>
      {/* Header */}
      <div className="px-5 pt-3 pb-2 safe-top">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-[var(--text-primary)]">Alertas</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSoundEnabled(s => !s); hapticTap(); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
              style={{
                background: soundEnabled ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${soundEnabled ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {soundEnabled ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="px-5 py-2">
        {loading ? (
          <SkeletonKpiRow count={4} />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <KpiCard label="Caídos" value={downCount} color="#ef4444" pulse={downCount > 0} />
            <KpiCard label="Activos" value={upCount} color="#22c55e" />
            <KpiCard label="Pend." value={pendingCount} color="#f59e0b" />
            <KpiCard label="Disp." value={`${availability}%`} color={availability >= 99 ? "#22c55e" : availability >= 95 ? "#f59e0b" : "#ef4444"} />
          </div>
        )}
      </div>

      {/* Tab switcher: Status / Timeline */}
      <div className="px-5 py-2">
        <div className="flex rounded-2xl overflow-hidden" style={{ background: "var(--surface-hover)", border: "1px solid var(--glass-border)", height: 36 }}>
          {([
            { key: "status" as const, label: "Estado actual" },
            { key: "timeline" as const, label: "Línea de tiempo" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); hapticTap(); }}
              className="flex-1 flex items-center justify-center text-[11px] font-bold transition-all"
              style={{
                color: tab === t.key ? "var(--text-primary)" : "var(--text-tertiary)",
                background: tab === t.key ? "var(--surface-elevated)" : "transparent",
                borderRadius: 14, margin: 2,
                boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "status" ? (
        <>
          {/* Filter tabs + ack all */}
          <div className="px-5 py-1 flex items-center gap-2">
            <div className="flex gap-1.5 flex-1">
              {([
                { key: "down" as const, label: "Caídos", count: downCount, color: "#ef4444" },
                { key: "up" as const, label: "Activos", count: upCount, color: "#22c55e" },
                { key: "all" as const, label: "Todos", count: monitors.length, color: "#60a5fa" },
              ]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); hapticTap(); }}
                  className="rounded-2xl px-3.5 py-1.5 text-[10px] font-bold transition-all active:scale-95"
                  style={{
                    background: filter === f.key ? `${f.color}18` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${filter === f.key ? `${f.color}35` : "rgba(255,255,255,0.06)"}`,
                    color: filter === f.key ? f.color : "#666",
                  }}
                >{f.label} ({f.count})</button>
              ))}
            </div>
            {unackedDown > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                className="rounded-2xl px-3 py-1.5 text-[10px] font-bold transition-all active:scale-95"
                style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}
              >ACK ({unackedDown})</button>
            )}
          </div>

          {/* Monitor list */}
          <div className="flex-1 px-5 space-y-2 py-3 pb-4">
            {loading && <SkeletonAlertList count={5} />}
            {!loading && filtered.length === 0 && (
              <EmptyState filter={filter} />
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
        </>
      ) : (
        /* Timeline tab */
        <div className="flex-1 px-5 py-3 pb-4 space-y-1.5">
          {loading && <SkeletonAlertList count={8} />}
          {!loading && timeline.length === 0 && (
            <div className="flex flex-col items-center py-12 text-[#555]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <p className="text-xs">Sin eventos en las últimas 6 horas</p>
            </div>
          )}
          {timeline.map((ev, i) => (
            <TimelineRow key={i} event={ev} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 16px rgba(239,68,68,0.8); }
        }
        @keyframes expand-in {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 400px; }
        }
        @keyframes pulse-kpi {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .safe-top { padding-top: max(env(safe-area-inset-top, 12px), 12px); }
      `}</style>
    </PullToRefresh>
    </PageTransition>
  );
}

/* ── KPI Card ── */
function KpiCard({ label, value, color, pulse }: { label: string; value: number | string; color: string; pulse?: boolean }) {
  return (
    <div
      className="rounded-xl px-2.5 py-2 text-center"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}20`,
        animation: pulse ? "pulse-kpi 2s ease-in-out infinite" : "none",
      }}
    >
      <div className="text-[16px] font-extrabold font-mono" style={{ color }}>{value}</div>
      <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color: `${color}99` }}>{label}</div>
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-[#555]">
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
  );
}

/* ── Timeline row ── */
function TimelineRow({ event: ev }: { event: TimelineEvent }) {
  const isDown = ev.status === 0;
  const statusColor = isDown ? "#ef4444" : ev.status === 1 ? "#22c55e" : "#f59e0b";
  const statusText = isDown ? "DOWN" : ev.status === 1 ? "UP" : "PEND";
  const date = new Date(ev.time);

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{
      background: isDown ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
      borderLeft: `3px solid ${statusColor}`,
    }}>
      <div className="flex-shrink-0">
        <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold font-mono" style={{
          background: `${statusColor}18`, color: statusColor,
        }}>{statusText}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold text-[var(--text-primary)] truncate">{ev.monitorName}</div>
        <div className="text-[9px] text-[var(--text-tertiary)] truncate">
          {ev.msg || `${ev.prevStatus === 0 ? "DOWN" : "UP"} → ${statusText}`}
          {ev.ping != null && ev.ping > 0 && ` · ${ev.ping}ms`}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[10px] font-mono text-[var(--text-secondary)]">
          {date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-[8px] text-[var(--text-tertiary)]">{timeAgo(ev.time)}</div>
      </div>
    </div>
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
          className="h-3 w-3 rounded-full shrink-0"
          style={{
            background: m.status === 1 ? "#22c55e" : isAcked ? "#f59e0b" : "#ef4444",
            boxShadow: isDown && !isAcked ? "0 0 10px rgba(239,68,68,0.6)" : "none",
            animation: isDown && !isAcked ? "pulse-dot 2s ease-in-out infinite" : "none",
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[var(--text-primary)] truncate">{m.name}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">
            {isAcked && <span style={{ color: "#f59e0b", fontWeight: 700 }}>ACK · </span>}
            {m.type.toUpperCase()}
            {m.ping != null && m.status === 1 && <span className="ml-1 font-mono">{m.ping}ms</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {m.uptime24 != null && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
              background: (m.uptime24 ?? 0) >= 0.99 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: (m.uptime24 ?? 0) >= 0.99 ? "#22c55e" : "#ef4444",
            }}>
              {((m.uptime24 ?? 0) * 100).toFixed(1)}%
            </span>
          )}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div
          className="px-4 pb-3.5 pt-0 border-t"
          style={{ borderColor: "rgba(255,255,255,0.04)", animation: "expand-in 0.2s ease-out" }}
        >
          <div className="grid grid-cols-3 gap-2 mb-2.5 mt-2">
            <DetailChip label="Tipo" value={m.type.toUpperCase()} />
            <DetailChip label="ID" value={`#${m.id}`} />
            <DetailChip
              label="Estado"
              value={m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PEND"}
              color={m.status === 1 ? "#22c55e" : m.status === 0 ? "#ef4444" : "#f59e0b"}
            />
          </div>
          {m.ping != null && (
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <DetailChip label="Latencia" value={`${m.ping}ms`} color={m.ping < 100 ? "#22c55e" : m.ping < 500 ? "#f59e0b" : "#ef4444"} />
              {m.uptime24 != null && (
                <DetailChip
                  label="Uptime 24h"
                  value={`${((m.uptime24 ?? 0) * 100).toFixed(2)}%`}
                  color={(m.uptime24 ?? 0) >= 0.99 ? "#22c55e" : "#ef4444"}
                />
              )}
            </div>
          )}
          {m.msg && (
            <div className="rounded-xl px-3 py-2 mb-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Mensaje</div>
              <div className="text-[11px] text-[var(--text-secondary)] break-all">{m.msg}</div>
            </div>
          )}
          {isDown && !isAcked && (
            <button
              onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
              className="w-full py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
              style={{
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.25)",
                color: "#fbbf24",
              }}
            >Confirmar alerta</button>
          )}
          {isAcked && (
            <div className="text-center py-1.5 text-[10px] font-bold" style={{ color: "rgba(245,158,11,0.6)" }}>
              Alerta confirmada
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className="text-[11px] font-mono font-bold" style={{ color: color || "var(--text-secondary)" }}>{value}</div>
    </div>
  );
}
