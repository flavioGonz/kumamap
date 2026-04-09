"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiUrl } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────
export interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  time: string;
  status: number;
  prevStatus: number;
  ping: number | null;
  msg: string;
}

interface AlertManagerPanelProps {
  open: boolean;
  onClose: () => void;
  sidebarWidth: number;
  /** Current count callback — parent uses it for the badge */
  onCountChange?: (count: number) => void;
  /** Called when user clicks an event — parent should locate the sensor on the map */
  onEventClick?: (event: TimelineEvent) => void;
}

// ── Helpers ────────────────────────────────────────────────────────
const STATUS_MAP: Record<number, { label: string; color: string; bg: string; icon: string }> = {
  0: { label: "CAÍDO", color: "#ef4444", bg: "rgba(239,68,68,0.12)", icon: "▼" },
  1: { label: "ACTIVO", color: "#22c55e", bg: "rgba(34,197,94,0.10)", icon: "▲" },
  2: { label: "PENDIENTE", color: "#f59e0b", bg: "rgba(245,158,11,0.10)", icon: "●" },
  3: { label: "MANT.", color: "#6366f1", bg: "rgba(99,102,241,0.10)", icon: "◆" },
};

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `hace ${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d ${hrs % 24}h`;
}

function formatTime(date: Date): string {
  return date.toLocaleString("es-UY", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Page size for "infinite scroll" ────────────────────────────────
const PAGE_SIZE = 50;
const POLL_INTERVAL = 30000; // 30s

// ── Time-range dropdown (dark themed) ─────────────────────────────
const TIME_OPTIONS = [
  { value: 1, label: "1h" },
  { value: 6, label: "6h" },
  { value: 24, label: "24h" },
  { value: 72, label: "3 días" },
  { value: 168, label: "7 días" },
  { value: 720, label: "30 días" },
];

function TimeRangeDropdown({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = TIME_OPTIONS.find(o => o.value === value) || TIME_OPTIONS[2];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 cursor-pointer transition-all"
        style={{
          background: open ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${open ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)"}`,
          color: open ? "#a5b4fc" : "rgba(255,255,255,0.5)",
        }}
      >
        {current.label}
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
            background: "linear-gradient(180deg, #1e1e2e 0%, #181825 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "4px 0", minWidth: 90,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            animation: "am-fadeSlide 0.15s ease-out",
          }}
        >
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] font-medium transition-all"
              style={{
                background: opt.value === value ? "rgba(99,102,241,0.12)" : "transparent",
                color: opt.value === value ? "#a5b4fc" : "rgba(255,255,255,0.55)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
              onMouseEnter={e => { if (opt.value !== value) (e.target as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (opt.value !== value) (e.target as HTMLElement).style.background = "transparent"; }}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#a5b4fc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8.5l4 4 8-9" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────
export default function AlertManagerPanel({ open, onClose, sidebarWidth, onCountChange, onEventClick }: AlertManagerPanelProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(24);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterStatus, setFilterStatus] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch events ──
  const fetchEvents = useCallback(async (h: number) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/kuma/timeline?hours=${h}`));
      const data = await res.json();
      const sorted: TimelineEvent[] = (data.events || []).sort(
        (a: TimelineEvent, b: TimelineEvent) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      setEvents(sorted);
    } catch {
      /* silently fail — keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Initial load + poll ──
  useEffect(() => {
    if (!open) return;
    fetchEvents(hours);
    pollRef.current = setInterval(() => fetchEvents(hours), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, hours, fetchEvents]);

  // ── Badge count: only DOWN events in last 24h ──
  useEffect(() => {
    const downCount = events.filter(e => e.status === 0).length;
    onCountChange?.(downCount);
  }, [events, onCountChange]);

  // ── Filter logic (must be before handleScroll so length is available) ──
  const filtered = events.filter(e => {
    if (filterStatus !== null && e.status !== filterStatus) return false;
    if (searchText && !e.monitorName.toLowerCase().includes(searchText.toLowerCase()) && !e.msg.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const filteredLenRef = useRef(filtered.length);
  filteredLenRef.current = filtered.length;

  // ── Infinite scroll ──
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredLenRef.current));
    }
  }, []);

  // Reset visible count on filter change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filterStatus, searchText, hours]);

  const visible = filtered.slice(0, visibleCount);

  if (!open) return null;

  return (
    <div
      className="fixed top-0 bottom-0 flex flex-col"
      style={{
        right: 0,
        width: 380,
        zIndex: 9998,
        background: "rgba(8,8,12,0.96)",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(24px)",
        transition: "right 0.3s ease",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span className="text-sm font-bold text-white/90">Alert Manager</span>
          <span className="text-[10px] text-white/30 font-mono ml-1">
            {filtered.length} eventos
          </span>
        </div>
        <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 transition-all">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="px-4 pb-2 flex flex-col gap-2">
        {/* Search */}
        <div className="relative">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar monitor o mensaje..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full h-7 pl-7 pr-2 rounded-md text-xs text-white/80 placeholder-white/25 outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        {/* Status chips + time range */}
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { val: null, label: "Todos", color: "#888" },
            { val: 0, label: "Caídos", color: "#ef4444" },
            { val: 1, label: "Activos", color: "#22c55e" },
            { val: 2, label: "Pendiente", color: "#f59e0b" },
            { val: 3, label: "Mant.", color: "#6366f1" },
          ].map(chip => (
            <button
              key={String(chip.val)}
              onClick={() => setFilterStatus(chip.val)}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
              style={{
                background: filterStatus === chip.val ? chip.color + "22" : "rgba(255,255,255,0.04)",
                color: filterStatus === chip.val ? chip.color : "rgba(255,255,255,0.4)",
                border: `1px solid ${filterStatus === chip.val ? chip.color + "44" : "transparent"}`,
              }}
            >
              {chip.label}
            </button>
          ))}
          <div className="flex-1" />
          <TimeRangeDropdown value={hours} onChange={setHours} />
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mx-3 h-px bg-white/6" />

      {/* ── Event list (infinite scroll) ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
      >
        {loading && events.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 rounded-full border-2 border-white/10 border-t-blue-400" style={{ animation: "am-spin 0.8s linear infinite" }} />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/10">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="text-xs text-white/25">Sin eventos en este rango</span>
          </div>
        )}

        {visible.map((ev, i) => {
          const st = STATUS_MAP[ev.status] || STATUS_MAP[2];
          const prevSt = STATUS_MAP[ev.prevStatus] || STATUS_MAP[2];
          const date = new Date(ev.time);
          return (
            <div
              key={`${ev.monitorId}-${ev.time}-${i}`}
              onClick={() => onEventClick?.(ev)}
              className="group rounded-lg px-3 py-2.5 mb-1 transition-all hover:bg-white/[0.06] cursor-pointer active:scale-[0.99]"
              style={{ borderLeft: `3px solid ${st.color}` }}
            >
              {/* Top row: monitor name + time ago */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-white/85 truncate max-w-[200px]">
                  {ev.monitorName}
                </span>
                <span className="text-[10px] text-white/25 font-mono shrink-0 ml-2" title={formatTime(date)}>
                  {timeAgo(date)}
                </span>
              </div>

              {/* Status transition */}
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: prevSt.color, background: prevSt.bg }}
                >
                  {prevSt.icon} {prevSt.label}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/15">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: st.color, background: st.bg }}
                >
                  {st.icon} {st.label}
                </span>
                {ev.ping != null && ev.ping > 0 && (
                  <span className="text-[9px] text-white/20 font-mono ml-auto">{ev.ping}ms</span>
                )}
              </div>

              {/* Message */}
              {ev.msg && (
                <div className="text-[10px] text-white/30 truncate leading-relaxed" title={ev.msg}>
                  {ev.msg}
                </div>
              )}

              {/* Exact time on hover */}
              <div className="text-[9px] text-white/15 font-mono mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(date)}
              </div>
            </div>
          );
        })}

        {visibleCount < filtered.length && (
          <div className="flex justify-center py-3">
            <div className="h-4 w-4 rounded-full border-2 border-white/10 border-t-white/30" style={{ animation: "am-spin 0.8s linear infinite" }} />
          </div>
        )}
      </div>

      {/* ── Footer summary ── */}
      <div className="px-4 py-2 flex items-center justify-between border-t border-white/5">
        <div className="flex items-center gap-3">
          {[0, 1].map(s => {
            const count = events.filter(e => e.status === s).length;
            const st = STATUS_MAP[s];
            return (
              <span key={s} className="flex items-center gap-1 text-[10px] font-mono" style={{ color: st.color + "99" }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                {count}
              </span>
            );
          })}
        </div>
        <span className="text-[9px] text-white/15 font-mono">
          {loading ? "cargando..." : `últimas ${hours}h`}
        </span>
      </div>

      <style>{`
        @keyframes am-spin { to { transform: rotate(360deg); } }
        @keyframes am-fadeSlide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Standalone hook for badge count (used by parent without opening the panel) ──
export function useAlertCount(pollMs = 60000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(apiUrl("/api/kuma/timeline?hours=24"));
        const data = await res.json();
        if (!alive) return;
        const downEvents = (data.events || []).filter((e: any) => e.status === 0).length;
        setCount(downEvents);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [pollMs]);

  return count;
}
