"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────
interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  time: string;
  status: number;
  prevStatus: number;
  ping: number | null;
  msg: string;
}

interface MonitorInfo {
  id: number;
  name: string;
  type: string;
  status: number;
  parent: number | null;
}

// ── Status helpers ───────────────────────────────────────────────
const STATUS_MAP: Record<number, { label: string; color: string; bg: string; icon: string }> = {
  0: { label: "CAÍDO", color: "#ef4444", bg: "rgba(239,68,68,0.12)", icon: "▼" },
  1: { label: "ACTIVO", color: "#22c55e", bg: "rgba(34,197,94,0.10)", icon: "▲" },
  2: { label: "PENDIENTE", color: "#f59e0b", bg: "rgba(245,158,11,0.10)", icon: "●" },
  3: { label: "MANT.", color: "#6366f1", bg: "rgba(99,102,241,0.10)", icon: "◆" },
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
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

function formatFullDate(date: Date): string {
  return date.toLocaleString("es-UY", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 0) return "";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ${mins % 60}m`;
}

function computeDowntimes(events: TimelineEvent[]): Map<string, number> {
  const result = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.status !== 0) continue;
    const downTime = new Date(ev.time).getTime();
    const key = `${ev.monitorId}-${ev.time}`;
    let recovered = false;
    for (let j = i - 1; j >= 0; j--) {
      const candidate = events[j];
      if (candidate.monitorId === ev.monitorId && candidate.status === 1) {
        result.set(key, new Date(candidate.time).getTime() - downTime);
        recovered = true;
        break;
      }
      if (candidate.monitorId === ev.monitorId && candidate.status === 0) break;
    }
    if (!recovered) result.set(key, -1);
  }
  return result;
}

function getSeverity(downtimeMs: number | undefined): { level: "leve" | "grave" | "none"; label: string; color: string; bg: string } {
  if (downtimeMs == null) return { level: "none", label: "", color: "", bg: "" };
  if (downtimeMs === -1) return { level: "grave", label: "GRAVE", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (downtimeMs < 300000) return { level: "leve", label: "LEVE", color: "#f59e0b", bg: "rgba(245,158,11,0.10)" };
  return { level: "grave", label: "GRAVE", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
}

function interpretEvent(ev: TimelineEvent): { translated: string; explanation: string; suggestion: string } {
  const msg = (ev.msg || "").trim();
  const isDown = ev.status === 0;
  if (/Connection failed/i.test(msg) || /connect ETIMEDOUT/i.test(msg)) {
    return { translated: "Fallo de conexión", explanation: isDown ? "No se pudo conectar al host destino." : "Conexión restablecida.", suggestion: isDown ? "Verificar que el equipo esté encendido y conectividad de red." : "Monitorear estabilidad." };
  }
  if (/timeout/i.test(msg) && !/ETIMEDOUT/.test(msg)) {
    return { translated: "Tiempo de espera agotado", explanation: isDown ? "Solicitud excedió timeout." : "Respondió a tiempo.", suggestion: isDown ? "Verificar carga del servidor." : "Normalizado." };
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return { translated: "Conexión rechazada", explanation: "Puerto cerrado o servicio no corriendo.", suggestion: "Verificar servicio y firewall." };
  }
  if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) {
    return { translated: "Host/Red inalcanzable", explanation: "No se puede llegar al destino.", suggestion: "Revisar cableado, switches y ruteo." };
  }
  if (/DNS|ENOTFOUND|getaddrinfo/i.test(msg)) {
    return { translated: "Error DNS", explanation: "No se resolvió el dominio.", suggestion: "Verificar config DNS." };
  }
  if (isDown) return { translated: msg || "Servicio caído", explanation: "El monitor detectó una caída.", suggestion: "Revisar estado y logs." };
  return { translated: msg || "Servicio restaurado", explanation: "Servicio normalizado.", suggestion: "Monitorear estabilidad." };
}

// ── Constants ────────────────────────────────────────────────────
const POLL_INTERVAL = 20000;
const QUICK_RANGES = [
  { value: 1, label: "1h" }, { value: 6, label: "6h" }, { value: 24, label: "24h" },
  { value: 72, label: "3d" }, { value: 168, label: "7d" }, { value: 720, label: "30d" },
];

// ══════════════════════════════════════════════════════════════════
// FULL-PAGE ALERT MANAGER
// ══════════════════════════════════════════════════════════════════
export default function AlertsPage() {
  // ── Auth ──
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  useEffect(() => { setIsAuthenticated(!!localStorage.getItem("kumamap_user")); }, []);

  // ── Data ──
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(24);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchRef = useRef<number>(0);

  // ── UI State ──
  const [filterStatus, setFilterStatus] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [groupByMonitor, setGroupByMonitor] = useState(true);
  const [expandedMonitors, setExpandedMonitors] = useState<Set<number>>(new Set());
  const [nocMode, setNocMode] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // ── Sound ──
  const [soundMuted, setSoundMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("kumamap-sound-muted") === "1"; } catch { return false; }
  });
  const prevGraveKeysRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Acknowledged ──
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = sessionStorage.getItem("kumamap-ack-alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  // ── Fetch ──
  const fetchHours = useMemo(() => {
    if (useCustomDates && dateFrom && dateTo) {
      return Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 3600000));
    }
    return hours;
  }, [useCustomDates, dateFrom, dateTo, hours]);

  const fetchEvents = useCallback(async (h: number) => {
    setLoading(true);
    try {
      let url = apiUrl(`/api/kuma/timeline?hours=${h}`);
      if (useCustomDates && dateFrom && dateTo) {
        url = apiUrl(`/api/kuma/timeline?hours=${h}&from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`);
      }
      const res = await fetch(url);
      const data = await res.json();
      let sorted: TimelineEvent[] = (data.events || []).sort(
        (a: TimelineEvent, b: TimelineEvent) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      if (useCustomDates && dateFrom && dateTo) {
        const fromMs = new Date(dateFrom).getTime();
        const toMs = new Date(dateTo).getTime();
        sorted = sorted.filter(e => { const t = new Date(e.time).getTime(); return t >= fromMs && t <= toMs; });
      }
      setEvents(sorted);
      setMonitors(data.monitors || []);
      lastFetchRef.current = Date.now();
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [useCustomDates, dateFrom, dateTo]);

  useEffect(() => {
    if (isAuthenticated !== true) return;
    fetchEvents(fetchHours);
    pollRef.current = setInterval(() => fetchEvents(fetchHours), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isAuthenticated, fetchHours, fetchEvents]);

  // ── Downtimes ──
  const downtimes = useMemo(() => computeDowntimes(events), [events]);

  // ── Sound ──
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    const currentGraveKeys = new Set<string>();
    for (const ev of events) {
      if (ev.status !== 0) continue;
      const key = `${ev.monitorId}-${ev.time}`;
      if (acknowledgedKeys.has(key)) continue;
      const dt = downtimes.get(key);
      if (getSeverity(dt).level === "grave") currentGraveKeys.add(key);
    }
    const prev = prevGraveKeysRef.current;
    if (prev.size > 0 && !soundMuted) {
      for (const k of currentGraveKeys) { if (!prev.has(k)) { playBeep(); break; } }
    }
    prevGraveKeysRef.current = currentGraveKeys;
  }, [events, downtimes, acknowledgedKeys, soundMuted, playBeep]);

  // ── Ack handlers ──
  const handleAcknowledge = useCallback((key: string) => {
    setAcknowledgedKeys(prev => {
      const next = new Set(prev); next.add(key);
      try { sessionStorage.setItem("kumamap-ack-alerts", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const handleAcknowledgeGroup = useCallback((groupEvents: TimelineEvent[]) => {
    setAcknowledgedKeys(prev => {
      const next = new Set(prev);
      for (const ev of groupEvents) { if (ev.status === 0) next.add(`${ev.monitorId}-${ev.time}`); }
      try { sessionStorage.setItem("kumamap-ack-alerts", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const handleAcknowledgeAll = useCallback(() => {
    setAcknowledgedKeys(prev => {
      const next = new Set(prev);
      for (const ev of events) { if (ev.status === 0) next.add(`${ev.monitorId}-${ev.time}`); }
      try { sessionStorage.setItem("kumamap-ack-alerts", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [events]);

  // ── Filters ──
  const filtered = useMemo(() => events.filter(e => {
    if (filterStatus !== null && e.status !== filterStatus) return false;
    if (searchText && !e.monitorName.toLowerCase().includes(searchText.toLowerCase()) && !e.msg.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  }), [events, filterStatus, searchText]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = events.length;
    const down = events.filter(e => e.status === 0).length;
    const unackDown = events.filter(e => e.status === 0 && !acknowledgedKeys.has(`${e.monitorId}-${e.time}`)).length;
    let grave = 0, leve = 0;
    for (const ev of events) {
      if (ev.status !== 0) continue;
      const dt = downtimes.get(`${ev.monitorId}-${ev.time}`);
      const s = getSeverity(dt);
      if (s.level === "grave") grave++;
      else if (s.level === "leve") leve++;
    }
    const monitorsDown = new Set(events.filter(e => e.status === 0).map(e => e.monitorId)).size;
    const totalMonitors = monitors.length;
    const monitorsUp = totalMonitors - monitorsDown;
    const uptimePct = totalMonitors > 0 ? ((monitorsUp / totalMonitors) * 100) : 100;
    return { total, down, unackDown, grave, leve, monitorsDown, totalMonitors, monitorsUp, uptimePct };
  }, [events, monitors, downtimes, acknowledgedKeys]);

  // ── Trend data (alerts per hour in the selected range) ──
  const trendData = useMemo(() => {
    if (events.length === 0) return [];
    const downEvents = events.filter(e => e.status === 0);
    if (downEvents.length === 0) return [];
    const now = Date.now();
    const rangeMs = fetchHours * 3600000;
    const buckets = Math.min(fetchHours, 24);
    const bucketMs = rangeMs / buckets;
    const result: { hour: string; count: number; grave: number }[] = [];
    for (let i = 0; i < buckets; i++) {
      const start = now - rangeMs + i * bucketMs;
      const end = start + bucketMs;
      let count = 0, graveCount = 0;
      for (const ev of downEvents) {
        const t = new Date(ev.time).getTime();
        if (t >= start && t < end) {
          count++;
          const dt = downtimes.get(`${ev.monitorId}-${ev.time}`);
          if (getSeverity(dt).level === "grave") graveCount++;
        }
      }
      const d = new Date(start);
      result.push({
        hour: d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }),
        count, grave: graveCount,
      });
    }
    return result;
  }, [events, downtimes, fetchHours]);

  // ── Groups ──
  const monitorGroups = useMemo(() => {
    const map = new Map<number, { monitorId: number; monitorName: string; events: TimelineEvent[]; downCount: number; graveCount: number; latestStatus: number }>();
    for (const ev of filtered) {
      let g = map.get(ev.monitorId);
      if (!g) { g = { monitorId: ev.monitorId, monitorName: ev.monitorName, events: [], downCount: 0, graveCount: 0, latestStatus: ev.status }; map.set(ev.monitorId, g); }
      g.events.push(ev);
      if (ev.status === 0) {
        g.downCount++;
        const dt = downtimes.get(`${ev.monitorId}-${ev.time}`);
        if (getSeverity(dt).level === "grave") g.graveCount++;
      }
    }
    return [...map.values()].sort((a, b) => b.downCount - a.downCount || a.monitorName.localeCompare(b.monitorName));
  }, [filtered, downtimes]);

  // ── NOC mode ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && nocMode) setNocMode(false);
      if (e.key === "F11") { e.preventDefault(); setNocMode(v => !v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nocMode]);

  useEffect(() => {
    if (nocMode) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, [nocMode]);

  // Close datepicker on outside click
  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDatePicker]);

  const toggleSoundMute = useCallback(() => {
    setSoundMuted(prev => { const n = !prev; try { localStorage.setItem("kumamap-sound-muted", n ? "1" : "0"); } catch {} return n; });
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpandedMonitors(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedMonitors(new Set(monitorGroups.map(g => g.monitorId)));
  }, [monitorGroups]);

  const collapseAll = useCallback(() => { setExpandedMonitors(new Set()); }, []);

  // ── Auth check ──
  if (isAuthenticated === null) return <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center"><div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin" /></div>;
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/40 text-sm mb-4">Acceso requerido</p>
          <a href="/" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors">Iniciar sesión</a>
        </div>
      </div>
    );
  }

  const activeRangeLabel = useCustomDates
    ? `${new Date(dateFrom).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })} – ${new Date(dateTo).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })}`
    : QUICK_RANGES.find(r => r.value === hours)?.label || `${hours}h`;

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className={`h-screen w-screen bg-[#0a0a0a] flex flex-col overflow-hidden ${nocMode ? "" : ""}`}>
      {/* ── Top bar ── */}
      <header className={`shrink-0 border-b border-white/[0.06] ${nocMode ? "px-6 py-2" : "px-6 py-3"}`} style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #ef444488, #f97316aa)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white/90 leading-none">Centro de Alertas</h1>
              <p className="text-[10px] text-white/30 mt-0.5">
                KumaMap · {monitors.length} monitores · {activeRangeLabel}
                {loading && <span className="ml-2 text-blue-400">actualizando...</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sound toggle */}
            <button onClick={toggleSoundMute} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-all" style={{ color: soundMuted ? "rgba(255,255,255,0.2)" : "#f59e0b" }} title={soundMuted ? "Activar sonido" : "Silenciar"}>
              {soundMuted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
              )}
            </button>
            {/* NOC mode toggle */}
            <button onClick={() => setNocMode(v => !v)} className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium transition-all hover:bg-white/[0.06]" style={{ color: nocMode ? "#60a5fa" : "rgba(255,255,255,0.4)" }} title="Modo NOC (F11)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {nocMode ? <><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></> : <><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></>}
              </svg>
              {nocMode ? "Salir" : "NOC"}
            </button>
            {/* Back to map */}
            {!nocMode && (
              <a href="/" className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                Mapa
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <div className={`shrink-0 ${nocMode ? "px-6 py-3" : "px-6 py-4"}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="Eventos totales" value={kpis.total} color="#94a3b8" />
          <KpiCard label="Alertas activas" value={kpis.unackDown} color="#ef4444" pulse={kpis.unackDown > 0} />
          <KpiCard label="Graves" value={kpis.grave} color="#ef4444" />
          <KpiCard label="Leves" value={kpis.leve} color="#f59e0b" />
          <KpiCard label="Monitores caídos" value={kpis.monitorsDown} color="#f97316" subtitle={`de ${kpis.totalMonitors}`} />
          <KpiCard label="Monitores activos" value={kpis.monitorsUp} color="#22c55e" subtitle={`de ${kpis.totalMonitors}`} />
          <KpiCard label="Disponibilidad" value={`${kpis.uptimePct.toFixed(1)}%`} color={kpis.uptimePct >= 99 ? "#22c55e" : kpis.uptimePct >= 95 ? "#f59e0b" : "#ef4444"} />
        </div>

        {/* ── Trend mini-chart ── */}
        {trendData.length > 1 && (
          <div className="mt-3 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Tendencia de alertas</span>
              <span className="text-[9px] text-white/20 font-mono">{activeRangeLabel}</span>
            </div>
            <div className="px-4 pb-3 h-16 flex items-end gap-[2px]">
              {trendData.map((d, i) => {
                const maxCount = Math.max(...trendData.map(t => t.count), 1);
                const h = Math.max(4, (d.count / maxCount) * 52);
                const gravePct = d.count > 0 ? d.grave / d.count : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.hour}: ${d.count} alertas (${d.grave} graves)`}>
                    <div className="w-full rounded-sm" style={{ height: h, background: gravePct > 0.5 ? "rgba(239,68,68,0.5)" : d.count > 0 ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.06)", transition: "height 0.3s ease" }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Filters bar ── */}
      <div className="shrink-0 px-6 pb-3 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" placeholder="Buscar monitor o mensaje..." value={searchText} onChange={e => setSearchText(e.target.value)}
            className="h-8 w-64 pl-8 pr-3 rounded-lg text-xs text-white/80 placeholder-white/25 outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
        </div>

        {/* Status chips */}
        {[
          { val: null, label: "Todos", color: "#888" },
          { val: 0, label: "Caídos", color: "#ef4444" },
          { val: 1, label: "Activos", color: "#22c55e" },
          { val: 2, label: "Pendiente", color: "#f59e0b" },
          { val: 3, label: "Mant.", color: "#6366f1" },
        ].map(chip => (
          <button key={String(chip.val)} onClick={() => setFilterStatus(chip.val)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
            style={{
              background: filterStatus === chip.val ? chip.color + "22" : "rgba(255,255,255,0.03)",
              color: filterStatus === chip.val ? chip.color : "rgba(255,255,255,0.4)",
              border: `1px solid ${filterStatus === chip.val ? chip.color + "44" : "rgba(255,255,255,0.04)"}`,
            }}>
            {chip.label}
          </button>
        ))}

        <div className="w-px h-5 bg-white/[0.06]" />

        {/* Time range */}
        <div className="flex items-center gap-1" ref={datePickerRef} style={{ position: "relative" }}>
          {QUICK_RANGES.map(r => (
            <button key={r.value} onClick={() => { setUseCustomDates(false); setHours(r.value); setShowDatePicker(false); }}
              className="px-2 py-1 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: !useCustomDates && hours === r.value ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                color: !useCustomDates && hours === r.value ? "#a5b4fc" : "rgba(255,255,255,0.35)",
                border: `1px solid ${!useCustomDates && hours === r.value ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.04)"}`,
              }}>
              {r.label}
            </button>
          ))}
          <button onClick={() => setShowDatePicker(v => !v)}
            className="px-2 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1"
            style={{
              background: useCustomDates || showDatePicker ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
              color: useCustomDates || showDatePicker ? "#a5b4fc" : "rgba(255,255,255,0.35)",
              border: `1px solid ${useCustomDates || showDatePicker ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.04)"}`,
            }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
            {useCustomDates ? activeRangeLabel : "Fechas"}
          </button>
          {showDatePicker && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, background: "linear-gradient(180deg, #1e1e2e 0%, #181825 100%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 14, width: 280, boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
              <div className="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-2">Rango personalizado</div>
              <div className="flex flex-col gap-2 mb-3">
                <div><label className="text-[10px] text-white/30 mb-0.5 block">Desde</label><input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full h-7 px-2 rounded text-[11px] text-white/80 outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", colorScheme: "dark" }} /></div>
                <div><label className="text-[10px] text-white/30 mb-0.5 block">Hasta</label><input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full h-7 px-2 rounded text-[11px] text-white/80 outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", colorScheme: "dark" }} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setUseCustomDates(false); setShowDatePicker(false); }} className="flex-1 h-7 rounded text-[10px] font-medium text-white/40" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>Limpiar</button>
                <button onClick={() => { if (dateFrom && dateTo) { setUseCustomDates(true); setShowDatePicker(false); } }} disabled={!dateFrom || !dateTo} className="flex-1 h-7 rounded text-[10px] font-semibold" style={{ background: dateFrom && dateTo ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)", color: dateFrom && dateTo ? "#a5b4fc" : "rgba(255,255,255,0.2)", border: `1px solid ${dateFrom && dateTo ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}` }}>Aplicar</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Group / Expand / Collapse / ACK All */}
        <button onClick={() => setGroupByMonitor(v => !v)}
          className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium transition-all hover:bg-white/[0.06]"
          style={{ color: groupByMonitor ? "#a5b4fc" : "rgba(255,255,255,0.35)", border: `1px solid ${groupByMonitor ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)"}` }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          {groupByMonitor ? "Agrupado" : "Agrupar"}
        </button>

        {groupByMonitor && (
          <>
            <button onClick={expandAll} className="h-8 px-2 rounded-lg text-[10px] font-medium text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all" title="Expandir todos">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
            </button>
            <button onClick={collapseAll} className="h-8 px-2 rounded-lg text-[10px] font-medium text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all" title="Colapsar todos">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>
            </button>
          </>
        )}

        {kpis.unackDown > 0 && (
          <button onClick={handleAcknowledgeAll}
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.15)" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            ACK todas ({kpis.unackDown})
          </button>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden px-6 pb-4 gap-4">
        {/* ── Left: Event list ── */}
        <div className="flex-1 overflow-y-auto rounded-xl" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
          {loading && events.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/10"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span className="text-sm text-white/25">Sin eventos en este rango</span>
            </div>
          )}

          {groupByMonitor ? (
            /* Grouped accordion view */
            <div className="p-2">
              {monitorGroups.map(group => {
                const isExpanded = expandedMonitors.has(group.monitorId);
                const unackInGroup = group.events.filter(ev => ev.status === 0 && !acknowledgedKeys.has(`${ev.monitorId}-${ev.time}`)).length;
                const allAcked = unackInGroup === 0 && group.downCount > 0;
                return (
                  <div key={group.monitorId} className="mb-1.5">
                    <div onClick={() => toggleExpand(group.monitorId)}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl cursor-pointer transition-all hover:bg-white/[0.04]"
                      style={{ borderLeft: `3px solid ${group.downCount > 0 ? (allAcked ? "rgba(255,255,255,0.15)" : "#ef4444") : "#22c55e"}`, opacity: allAcked ? 0.5 : 1 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        className="text-white/30 shrink-0 transition-transform" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                        <path d="m9 18 6-6-6-6"/>
                      </svg>
                      <span className="text-[12px] font-semibold text-white/85 truncate flex-1">{group.monitorName}</span>
                      {group.graveCount > 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>{group.graveCount} GRAVE</span>}
                      {group.downCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>{group.downCount} caídas</span>}
                      {unackInGroup > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); handleAcknowledgeGroup(group.events); }}
                          className="shrink-0 flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold transition-all hover:scale-105 active:scale-95"
                          style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.15)" }}
                          title="Aceptar todas las alertas de este monitor">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                          ACK ({unackInGroup})
                        </button>
                      )}
                      <span className="text-[10px] text-white/20 font-mono shrink-0">{group.events.length}</span>
                    </div>

                    {isExpanded && (
                      <div className="ml-4 pl-3 border-l border-white/[0.04]">
                        {group.events.map((ev, i) => (
                          <EventRow key={`${ev.monitorId}-${ev.time}-${i}`} ev={ev} downtimes={downtimes}
                            acknowledgedKeys={acknowledgedKeys} onSelect={setSelectedEvent} onAck={handleAcknowledge}
                            showMonitorName={false} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Flat list view */
            <div className="p-2">
              {filtered.map((ev, i) => (
                <EventRow key={`${ev.monitorId}-${ev.time}-${i}`} ev={ev} downtimes={downtimes}
                  acknowledgedKeys={acknowledgedKeys} onSelect={setSelectedEvent} onAck={handleAcknowledge}
                  showMonitorName={true} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Detail panel ── */}
        <div className="w-[380px] shrink-0 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
          {selectedEvent ? (
            <EventDetailPanel event={selectedEvent} downtimes={downtimes} allEvents={events}
              acknowledgedKeys={acknowledgedKeys} onAck={handleAcknowledge} onClose={() => setSelectedEvent(null)}
              onSelectEvent={setSelectedEvent} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/15">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span className="text-xs">Seleccioná un evento para ver detalle</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer status bar ── */}
      <footer className="shrink-0 px-6 py-1.5 border-t border-white/[0.04] flex items-center justify-between" style={{ background: "rgba(10,10,10,0.95)" }}>
        <div className="flex items-center gap-4">
          {[0, 1].map(s => { const c = events.filter(e => e.status === s).length; const st = STATUS_MAP[s]; return (
            <span key={s} className="flex items-center gap-1 text-[10px] font-mono" style={{ color: st.color + "88" }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: st.color }}/>{c}
            </span>
          ); })}
          {(() => { const ac = events.filter(e => e.status === 0 && acknowledgedKeys.has(`${e.monitorId}-${e.time}`)).length; return ac > 0 ? <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "rgba(74,222,128,0.5)" }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{ac}</span> : null; })()}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-white/15 font-mono">
            Auto-refresh {POLL_INTERVAL / 1000}s
            {lastFetchRef.current > 0 && ` · Último: ${new Date(lastFetchRef.current).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
          </span>
          {nocMode && <span className="text-[9px] text-blue-400/50 font-mono">ESC para salir</span>}
        </div>
      </footer>

      <style>{`
        @keyframes noc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════
function KpiCard({ label, value, color, subtitle, pulse }: { label: string; value: string | number; color: string; subtitle?: string; pulse?: boolean }) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-[9px] text-white/30 font-semibold uppercase tracking-wider mb-1">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-black tracking-tight" style={{ color, animation: pulse ? "noc-pulse 2s ease-in-out infinite" : undefined }}>{value}</span>
        {subtitle && <span className="text-[10px] text-white/20">{subtitle}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Event Row (reusable for both flat and grouped)
// ═══════════════════════════════════════════════════════════════════
function EventRow({ ev, downtimes, acknowledgedKeys, onSelect, onAck, showMonitorName }: {
  ev: TimelineEvent; downtimes: Map<string, number>; acknowledgedKeys: Set<string>;
  onSelect: (ev: TimelineEvent) => void; onAck: (key: string) => void; showMonitorName: boolean;
}) {
  const st = STATUS_MAP[ev.status] || STATUS_MAP[2];
  const prevSt = STATUS_MAP[ev.prevStatus] || STATUS_MAP[2];
  const date = new Date(ev.time);
  const evKey = `${ev.monitorId}-${ev.time}`;
  const isAck = acknowledgedKeys.has(evKey);

  return (
    <div onClick={() => onSelect(ev)}
      className="group rounded-lg px-4 py-2.5 mb-1 transition-all hover:bg-white/[0.04] cursor-pointer active:scale-[0.995]"
      style={{ borderLeft: `3px solid ${isAck ? "rgba(255,255,255,0.12)" : st.color}`, opacity: isAck ? 0.4 : 1 }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {showMonitorName && <span className="text-[11px] font-semibold text-white/85 truncate max-w-[220px]">{ev.monitorName}</span>}
          {isAck && (
            <span className="shrink-0 flex items-center gap-0.5 text-[7px] font-bold px-1 py-px rounded"
              style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.15)" }}>
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>ACK
            </span>
          )}
        </div>
        <span className="text-[10px] text-white/25 font-mono shrink-0 ml-2" title={formatTime(date)}>{timeAgo(date)}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: prevSt.color, background: prevSt.bg }}>{prevSt.icon} {prevSt.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/15"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: st.color, background: st.bg }}>{st.icon} {st.label}</span>
        {ev.ping != null && ev.ping > 0 && <span className="text-[9px] text-white/20 font-mono ml-auto">{ev.ping}ms</span>}
      </div>
      {ev.status === 0 && (() => {
        const dt = downtimes.get(evKey);
        if (dt == null) return null;
        const isOngoing = dt === -1;
        const sev = getSeverity(dt);
        return (
          <div className="flex items-center gap-1.5 mb-1">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={sev.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span className="text-[9px] font-mono font-semibold" style={{ color: sev.color }}>{isOngoing ? "Aún caído" : `Caída: ${formatDuration(dt)}`}</span>
            <span className="text-[7px] font-black px-1 py-px rounded" style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}33` }}>{sev.label}</span>
            {isOngoing && <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: "0 0 6px #ef4444" }}/>}
          </div>
        );
      })()}
      {ev.msg && <div className="text-[10px] text-white/30 truncate leading-relaxed" title={ev.msg}>{ev.msg}</div>}
      <div className="text-[9px] text-white/15 font-mono mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{formatTime(date)}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Event Detail Panel (right side)
// ═══════════════════════════════════════════════════════════════════
function EventDetailPanel({ event, downtimes, allEvents, acknowledgedKeys, onAck, onClose, onSelectEvent }: {
  event: TimelineEvent; downtimes: Map<string, number>; allEvents: TimelineEvent[];
  acknowledgedKeys: Set<string>; onAck: (key: string) => void; onClose: () => void;
  onSelectEvent: (ev: TimelineEvent) => void;
}) {
  const st = STATUS_MAP[event.status] || STATUS_MAP[2];
  const date = new Date(event.time);
  const evKey = `${event.monitorId}-${event.time}`;
  const isAck = acknowledgedKeys.has(evKey);
  const dtMs = event.status === 0 ? downtimes.get(evKey) : undefined;
  const severity = getSeverity(dtMs);
  const interp = interpretEvent(event);

  // Monitor history (all events for this monitor, sorted newest-first)
  const monitorHistory = useMemo(() => allEvents.filter(e => e.monitorId === event.monitorId).slice(0, 20), [allEvents, event.monitorId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-white/90 truncate">{event.monitorName}</div>
          <div className="text-[10px] text-white/30 font-mono mt-0.5">{formatFullDate(date)}</div>
        </div>
        <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-all shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
        {/* ACK banner */}
        {isAck && (
          <div className="mb-3 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.12)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            <span className="text-[11px] font-semibold text-green-400/80">ALARMA ACEPTADA</span>
          </div>
        )}

        {/* Status + severity */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ color: st.color, background: st.bg }}>{st.icon} {st.label}</span>
          {severity.level !== "none" && <span className="text-[9px] font-black px-2 py-1 rounded-lg" style={{ background: severity.bg, color: severity.color, border: `1px solid ${severity.color}33` }}>{severity.label}</span>}
          {dtMs != null && <span className="text-[10px] font-mono text-white/40">{dtMs === -1 ? "En curso" : formatDuration(dtMs)}</span>}
        </div>

        {/* Interpretation */}
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="text-[11px] font-semibold text-white/70 mb-1">{interp.translated}</div>
          <div className="text-[10px] text-white/40 leading-relaxed mb-2">{interp.explanation}</div>
          <div className="text-[10px] text-blue-400/60 leading-relaxed flex items-start gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            {interp.suggestion}
          </div>
        </div>

        {/* Raw message */}
        {event.msg && (
          <div className="mb-4">
            <div className="text-[9px] text-white/25 uppercase tracking-wider font-semibold mb-1">Mensaje original</div>
            <div className="text-[10px] text-white/40 font-mono rounded-lg p-2 break-all" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>{event.msg}</div>
          </div>
        )}

        {/* ACK button */}
        {event.status === 0 && !isAck && (
          <button onClick={() => onAck(evKey)}
            className="w-full mb-4 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.15)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            Aceptar alerta
          </button>
        )}

        {/* Monitor timeline */}
        <div className="text-[9px] text-white/25 uppercase tracking-wider font-semibold mb-2">Historial del monitor ({monitorHistory.length})</div>
        <div className="border-l border-white/[0.06] pl-3">
          {monitorHistory.map((hEv, i) => {
            const hSt = STATUS_MAP[hEv.status] || STATUS_MAP[2];
            const hDate = new Date(hEv.time);
            const isSelected = hEv.time === event.time && hEv.status === event.status;
            return (
              <div key={i} onClick={() => onSelectEvent(hEv)}
                className={`flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/[0.03] rounded px-2 -ml-2 transition-all ${isSelected ? "bg-white/[0.05]" : ""}`}>
                <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: hSt.color, boxShadow: isSelected ? `0 0 6px ${hSt.color}` : "none" }}/>
                <span className="text-[10px] font-mono text-white/30">{formatTime(hDate)}</span>
                <span className="text-[9px] font-bold" style={{ color: hSt.color }}>{hSt.label}</span>
                {hEv.status === 0 && (() => {
                  const hDt = downtimes.get(`${hEv.monitorId}-${hEv.time}`);
                  const hSev = getSeverity(hDt);
                  return hSev.level !== "none" ? <span className="text-[7px] font-black px-1 rounded" style={{ background: hSev.bg, color: hSev.color }}>{hSev.label}</span> : null;
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
