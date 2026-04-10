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
  { value: 0.25, label: "15m" }, { value: 0.5, label: "30m" },
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
  const [hours, setHours] = useState(6);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchRef = useRef<number>(0);

  // ── UI State ──
  const [filterStatus, setFilterStatus] = useState<number | null>(0);
  const [searchText, setSearchText] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [groupByMonitor, setGroupByMonitor] = useState(true);
  const [expandedMonitors, setExpandedMonitors] = useState<Set<number>>(new Set());
  const [nocMode, setNocMode] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFollowedOnly, setShowFollowedOnly] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // ── Sound ──
  const [soundMuted, setSoundMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("kumamap-sound-muted") === "1"; } catch { return false; }
  });
  const prevGraveKeysRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Followed (tracked) alerts ──
  const [followedKeys, setFollowedKeys] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = sessionStorage.getItem("kumamap-follow-alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

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
  // Unlock AudioContext on first user interaction (browsers block autoplay)
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("click", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "square"; osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      // Two-tone beep: 880Hz then 660Hz
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch (e) { console.warn("[AlertSound] beep failed:", e); }
  }, []);

  // Track whether initial load is done (skip beep on first data load)
  const initialLoadDoneRef = useRef(false);

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
    if (!initialLoadDoneRef.current) {
      // First load — just store keys, don't beep
      initialLoadDoneRef.current = true;
      prevGraveKeysRef.current = currentGraveKeys;
      return;
    }
    // Detect new GRAVE alerts not in previous set
    const prev = prevGraveKeysRef.current;
    if (!soundMuted) {
      for (const k of currentGraveKeys) {
        if (!prev.has(k)) {
          playBeep();
          break; // one beep per poll cycle
        }
      }
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

  // ── Follow handlers ──
  const handleFollow = useCallback((key: string) => {
    setFollowedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { sessionStorage.setItem("kumamap-follow-alerts", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── Filters ──
  const filtered = useMemo(() => events.filter(e => {
    if (filterStatus !== null && e.status !== filterStatus) return false;
    if (searchText && !e.monitorName.toLowerCase().includes(searchText.toLowerCase()) && !e.msg.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (showFollowedOnly && !followedKeys.has(`${e.monitorId}-${e.time}`)) return false;
    return true;
  }), [events, filterStatus, searchText, showFollowedOnly, followedKeys]);

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
    const followed = events.filter(e => followedKeys.has(`${e.monitorId}-${e.time}`)).length;
    return { total, down, unackDown, grave, leve, monitorsDown, totalMonitors, monitorsUp, uptimePct, followed };
  }, [events, monitors, downtimes, acknowledgedKeys, followedKeys]);

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
      <header className={`shrink-0 border-b border-white/[0.06] ${nocMode ? "px-6 py-2" : "px-6 py-3"}`} style={{ background: "linear-gradient(180deg, rgba(15,15,20,0.98) 0%, rgba(10,10,10,0.95) 100%)", backdropFilter: "blur(16px)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center relative" style={{ background: "linear-gradient(135deg, #ef4444, #f97316)", boxShadow: kpis.unackDown > 0 ? "0 0 20px rgba(239,68,68,0.3)" : "none" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {kpis.unackDown > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-black text-white px-1"
                  style={{ background: "#ef4444", boxShadow: "0 0 8px rgba(239,68,68,0.5)", animation: "noc-pulse 2s ease-in-out infinite" }}>
                  {kpis.unackDown}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white/95 leading-none tracking-tight">Centro de Alertas</h1>
              <p className="text-[10px] text-white/30 mt-0.5 flex items-center gap-1.5">
                <span className="text-white/20">KumaMap</span>
                <span className="text-white/10">·</span>
                <span>{monitors.length} monitores</span>
                <span className="text-white/10">·</span>
                <span>{activeRangeLabel}</span>
                {loading && <span className="ml-1 inline-flex items-center gap-1 text-blue-400"><span className="inline-block h-1 w-1 rounded-full bg-blue-400 animate-pulse"/>actualizando</span>}
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard label="Eventos totales" value={kpis.total} color="#94a3b8" />
          <KpiCard label="Alertas activas" value={kpis.unackDown} color="#ef4444" pulse={kpis.unackDown > 0} />
          <KpiCard label="Graves" value={kpis.grave} color="#ef4444" />
          <KpiCard label="Leves" value={kpis.leve} color="#f59e0b" />
          <KpiCard label="En seguimiento" value={kpis.followed} color="#3b82f6" />
          <KpiCard label="Monitores caídos" value={kpis.monitorsDown} color="#f97316" subtitle={`de ${kpis.totalMonitors}`} />
          <KpiCard label="Monitores activos" value={kpis.monitorsUp} color="#22c55e" subtitle={`de ${kpis.totalMonitors}`} />
          <KpiCard label="Disponibilidad" value={`${kpis.uptimePct.toFixed(1)}%`} color={kpis.uptimePct >= 99 ? "#22c55e" : kpis.uptimePct >= 95 ? "#f59e0b" : "#ef4444"} />
        </div>

        {/* ── Trend mini-chart ── */}
        {trendData.length > 1 && (
          <div className="mt-3 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/20"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>
                Tendencia de alertas
              </span>
              <span className="text-[9px] text-white/20 font-mono">{activeRangeLabel}</span>
            </div>
            <div className="px-4 pb-3 h-16 flex items-end gap-[2px]">
              {trendData.map((d, i) => {
                const maxCount = Math.max(...trendData.map(t => t.count), 1);
                const h = Math.max(4, (d.count / maxCount) * 52);
                const gravePct = d.count > 0 ? d.grave / d.count : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group/bar" title={`${d.hour}: ${d.count} alertas (${d.grave} graves)`}>
                    <div className="w-full rounded-sm transition-all duration-300 group-hover/bar:opacity-80" style={{
                      height: h,
                      background: gravePct > 0.5
                        ? "linear-gradient(180deg, rgba(239,68,68,0.7), rgba(239,68,68,0.3))"
                        : d.count > 0
                        ? "linear-gradient(180deg, rgba(245,158,11,0.6), rgba(245,158,11,0.2))"
                        : "rgba(255,255,255,0.04)",
                      boxShadow: d.count > 0 ? `0 2px 8px ${gravePct > 0.5 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)"}` : "none",
                    }} />
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

        <button onClick={() => setShowFollowedOnly(v => !v)}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1"
          style={{
            background: showFollowedOnly ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
            color: showFollowedOnly ? "#60a5fa" : "rgba(255,255,255,0.4)",
            border: `1px solid ${showFollowedOnly ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)"}`,
          }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          Seguidos {followedKeys.size > 0 && `(${followedKeys.size})`}
        </button>

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
                            acknowledgedKeys={acknowledgedKeys} followedKeys={followedKeys} onSelect={setSelectedEvent} onAck={handleAcknowledge} onFollow={handleFollow}
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
                  acknowledgedKeys={acknowledgedKeys} followedKeys={followedKeys} onSelect={setSelectedEvent} onAck={handleAcknowledge} onFollow={handleFollow}
                  showMonitorName={true} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Detail panel ── */}
        <div className="w-[400px] shrink-0 rounded-xl overflow-hidden flex flex-col" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(255,255,255,0.05)" }}>
          {selectedEvent ? (
            <EventDetailPanel event={selectedEvent} downtimes={downtimes} allEvents={events}
              acknowledgedKeys={acknowledgedKeys} followedKeys={followedKeys} onAck={handleAcknowledge} onFollow={handleFollow} onClose={() => setSelectedEvent(null)}
              onSelectEvent={setSelectedEvent} />
          ) : (
            <FollowedEventsHub events={events} downtimes={downtimes} followedKeys={followedKeys} acknowledgedKeys={acknowledgedKeys}
              onSelectEvent={setSelectedEvent} onFollow={handleFollow} onShowFollowedOnly={() => setShowFollowedOnly(true)} />
          )}
        </div>
      </div>

      {/* ── Footer status bar ── */}
      <footer className="shrink-0 px-6 py-1.5 border-t border-white/[0.06] flex items-center justify-between" style={{ background: "linear-gradient(180deg, rgba(12,12,16,0.98) 0%, rgba(8,8,10,0.99) 100%)" }}>
        <div className="flex items-center gap-4">
          {[0, 1].map(s => { const c = events.filter(e => e.status === s).length; const st = STATUS_MAP[s]; return (
            <span key={s} className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: st.color + "88" }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: st.color, boxShadow: `0 0 4px ${st.color}66` }}/>{c} {st.label.toLowerCase()}
            </span>
          ); })}
          <span className="w-px h-3 bg-white/[0.06]"/>
          {(() => { const ac = events.filter(e => e.status === 0 && acknowledgedKeys.has(`${e.monitorId}-${e.time}`)).length; return ac > 0 ? <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "rgba(74,222,128,0.5)" }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{ac} ack</span> : null; })()}
          {(() => { const fc = followedKeys.size; return fc > 0 ? <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "rgba(96,165,250,0.5)" }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>{fc} seguidos</span> : null; })()}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-white/20 font-mono flex items-center gap-1.5">
            <span className="inline-block h-1 w-1 rounded-full bg-green-500/50 animate-pulse"/>
            Auto-refresh {POLL_INTERVAL / 1000}s
            {lastFetchRef.current > 0 && <><span className="text-white/10">·</span> {new Date(lastFetchRef.current).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>}
          </span>
          {nocMode && <span className="text-[9px] text-blue-400/50 font-mono">ESC para salir</span>}
        </div>
      </footer>

      <style>{`
        @keyframes noc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 8px rgba(59,130,246,0.15); } 50% { box-shadow: 0 0 16px rgba(59,130,246,0.3); } }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════
function KpiCard({ label, value, color, subtitle, pulse, icon }: { label: string; value: string | number; color: string; subtitle?: string; pulse?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col relative overflow-hidden group transition-all hover:scale-[1.01]"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", boxShadow: pulse ? `0 0 24px ${color}15` : undefined }}>
      <div className="absolute top-0 left-0 w-full h-[2px] opacity-60" style={{ background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)` }} />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-white/35 font-semibold uppercase tracking-wider">{label}</span>
        {icon && <span className="text-white/10 group-hover:text-white/20 transition-colors">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-black tracking-tight" style={{ color, animation: pulse ? "noc-pulse 2s ease-in-out infinite" : undefined }}>{value}</span>
        {subtitle && <span className="text-[10px] text-white/20">{subtitle}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Live Timer (animates every second for ongoing DOWN events)
// ═══════════════════════════════════════════════════════════════════
function LiveTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const t0 = new Date(since).getTime();
    const tick = () => {
      const ms = Date.now() - t0;
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) setElapsed(`${d}d ${h % 24}h ${m % 60}m ${s % 60}s`);
      else if (h > 0) setElapsed(`${h}h ${m % 60}m ${s % 60}s`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
      else setElapsed(`${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <>{elapsed}</>;
}

// ═══════════════════════════════════════════════════════════════════
// Event Row (reusable for both flat and grouped)
// ═══════════════════════════════════════════════════════════════════
function EventRow({ ev, downtimes, acknowledgedKeys, followedKeys, onSelect, onAck, onFollow, showMonitorName }: {
  ev: TimelineEvent; downtimes: Map<string, number>; acknowledgedKeys: Set<string>; followedKeys: Set<string>;
  onSelect: (ev: TimelineEvent) => void; onAck: (key: string) => void; onFollow: (key: string) => void; showMonitorName: boolean;
}) {
  const st = STATUS_MAP[ev.status] || STATUS_MAP[2];
  const prevSt = STATUS_MAP[ev.prevStatus] || STATUS_MAP[2];
  const date = new Date(ev.time);
  const evKey = `${ev.monitorId}-${ev.time}`;
  const isAck = acknowledgedKeys.has(evKey);
  const isFollowed = followedKeys.has(evKey);

  return (
    <div onClick={() => onSelect(ev)}
      className="group rounded-lg px-4 py-2.5 mb-1 transition-all hover:bg-white/[0.04] cursor-pointer active:scale-[0.995]"
      style={{
        borderLeft: `3px solid ${isFollowed ? "#3b82f6" : isAck ? "rgba(255,255,255,0.12)" : st.color}`,
        opacity: isAck && !isFollowed ? 0.4 : 1,
        background: isFollowed ? "rgba(59,130,246,0.04)" : undefined,
      }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {showMonitorName && <span className="text-[11px] font-semibold text-white/85 truncate max-w-[220px]">{ev.monitorName}</span>}
          {isFollowed && (
            <span className="shrink-0 flex items-center gap-0.5 text-[7px] font-bold px-1 py-px rounded"
              style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}>
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              SEGUIM.
            </span>
          )}
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
            {isOngoing ? (
              <span className="text-[9px] font-mono font-bold" style={{ color: sev.color }}><LiveTimer since={ev.time} /></span>
            ) : (
              <span className="text-[9px] font-mono font-semibold" style={{ color: sev.color }}>Caída: {formatDuration(dt)}</span>
            )}
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
// Followed Events Hub (shown when no event selected)
// ═══════════════════════════════════════════════════════════════════
function FollowedEventsHub({ events, downtimes, followedKeys, acknowledgedKeys, onSelectEvent, onFollow, onShowFollowedOnly }: {
  events: TimelineEvent[]; downtimes: Map<string, number>; followedKeys: Set<string>; acknowledgedKeys: Set<string>;
  onSelectEvent: (ev: TimelineEvent) => void; onFollow: (key: string) => void; onShowFollowedOnly: () => void;
}) {
  const followedEvents = useMemo(() => {
    return events.filter(e => followedKeys.has(`${e.monitorId}-${e.time}`));
  }, [events, followedKeys]);

  const activeDown = useMemo(() => {
    return events.filter(e => e.status === 0 && !acknowledgedKeys.has(`${e.monitorId}-${e.time}`));
  }, [events, acknowledgedKeys]);

  const followedGrave = useMemo(() => {
    return followedEvents.filter(e => {
      const dt = downtimes.get(`${e.monitorId}-${e.time}`);
      return getSeverity(dt).level === "grave";
    });
  }, [followedEvents, downtimes]);

  const followedOngoing = useMemo(() => {
    return followedEvents.filter(e => {
      const dt = downtimes.get(`${e.monitorId}-${e.time}`);
      return dt === -1;
    });
  }, [followedEvents, downtimes]);

  if (followedEvents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6" style={{ animation: "fade-in 0.3s ease" }}>
        {/* Quick overview */}
        <div className="w-full mb-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(99,102,241,0.1))", border: "1px solid rgba(59,130,246,0.1)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <p className="text-[13px] font-semibold text-white/50 mb-1">Sin seguimientos activos</p>
            <p className="text-[11px] text-white/25 leading-relaxed max-w-[260px] mx-auto">Seleccioná un evento de la lista y pulsá &quot;Seguir&quot; para monitorear alertas específicas desde aquí.</p>
          </div>
        </div>

        {/* Quick stats summary */}
        {activeDown.length > 0 && (
          <div className="w-full rounded-xl p-3 mb-3" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: "0 0 6px #ef4444" }}/>
              <span className="text-[11px] font-bold text-red-400/80">{activeDown.length} alertas activas sin aceptar</span>
            </div>
            <div className="space-y-1">
              {activeDown.slice(0, 3).map((ev, i) => {
                const evKey = `${ev.monitorId}-${ev.time}`;
                const dt = downtimes.get(evKey);
                const sev = getSeverity(dt);
                return (
                  <div key={i} onClick={() => onSelectEvent(ev)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.04] transition-all">
                    <span className="text-[10px] font-semibold text-white/60 truncate flex-1">{ev.monitorName}</span>
                    {sev.level !== "none" && <span className="text-[7px] font-black px-1 rounded" style={{ background: sev.bg, color: sev.color }}>{sev.label}</span>}
                    {dt === -1 && <span className="text-[9px] font-mono font-bold text-red-400"><LiveTimer since={ev.time} /></span>}
                  </div>
                );
              })}
              {activeDown.length > 3 && <p className="text-[9px] text-white/20 text-center pt-1">+{activeDown.length - 3} más</p>}
            </div>
          </div>
        )}

        <p className="text-[10px] text-white/15 mt-2">Seleccioná un evento para ver detalle</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full" style={{ animation: "fade-in 0.3s ease" }}>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06] relative" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: "linear-gradient(90deg, rgba(59,130,246,0) 0%, rgba(59,130,246,0.6) 50%, rgba(59,130,246,0) 100%)" }} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.15)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div>
              <span className="text-[12px] font-bold text-white/80">Seguimientos</span>
              <span className="ml-2 text-[10px] font-mono text-blue-400/60">{followedEvents.length}</span>
            </div>
          </div>
          <button onClick={onShowFollowedOnly}
            className="text-[10px] font-medium px-2 py-1 rounded-lg transition-all hover:bg-white/[0.06]"
            style={{ color: "rgba(96,165,250,0.6)", border: "1px solid rgba(59,130,246,0.1)" }}>
            Filtrar lista
          </button>
        </div>

        {/* Quick stat pills */}
        {(followedGrave.length > 0 || followedOngoing.length > 0) && (
          <div className="flex items-center gap-2 mt-2">
            {followedOngoing.length > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"/>{followedOngoing.length} en curso
              </span>
            )}
            {followedGrave.length > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                {followedGrave.length} grave{followedGrave.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Followed events list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
        {followedEvents.map((ev, i) => {
          const evKey = `${ev.monitorId}-${ev.time}`;
          const st = STATUS_MAP[ev.status] || STATUS_MAP[2];
          const dt = downtimes.get(evKey);
          const sev = getSeverity(dt);
          const isOngoing = dt === -1;
          const date = new Date(ev.time);

          return (
            <div key={`${evKey}-${i}`} onClick={() => onSelectEvent(ev)}
              className="rounded-lg px-3 py-2.5 mb-1.5 cursor-pointer transition-all hover:bg-white/[0.05] active:scale-[0.995] group"
              style={{ background: "rgba(59,130,246,0.03)", borderLeft: `3px solid #3b82f6`, animation: `slide-up 0.2s ease ${i * 0.05}s both` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-white/80 truncate flex-1">{ev.monitorName}</span>
                <button onClick={(e) => { e.stopPropagation(); onFollow(evKey); }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-white/10 transition-all"
                  title="Dejar de seguir">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/30"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: st.color, background: st.bg }}>{st.icon} {st.label}</span>
                {sev.level !== "none" && <span className="text-[7px] font-black px-1 py-px rounded" style={{ background: sev.bg, color: sev.color }}>{sev.label}</span>}
                {isOngoing && <span className="text-[9px] font-mono font-bold text-red-400 ml-auto"><LiveTimer since={ev.time} /></span>}
                {!isOngoing && dt != null && dt > 0 && <span className="text-[9px] font-mono text-white/25 ml-auto">{formatDuration(dt)}</span>}
                {ev.status === 1 && <span className="text-[9px] text-white/25 font-mono ml-auto">{timeAgo(date)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Event Detail Panel (right side)
// ═══════════════════════════════════════════════════════════════════
function EventDetailPanel({ event, downtimes, allEvents, acknowledgedKeys, followedKeys, onAck, onFollow, onClose, onSelectEvent }: {
  event: TimelineEvent; downtimes: Map<string, number>; allEvents: TimelineEvent[];
  acknowledgedKeys: Set<string>; followedKeys: Set<string>; onAck: (key: string) => void; onFollow: (key: string) => void; onClose: () => void;
  onSelectEvent: (ev: TimelineEvent) => void;
}) {
  const st = STATUS_MAP[event.status] || STATUS_MAP[2];
  const date = new Date(event.time);
  const evKey = `${event.monitorId}-${event.time}`;
  const isAck = acknowledgedKeys.has(evKey);
  const isFollowed = followedKeys.has(evKey);
  const dtMs = event.status === 0 ? downtimes.get(evKey) : undefined;
  const severity = getSeverity(dtMs);
  const interp = interpretEvent(event);

  // Monitor history (all events for this monitor, sorted newest-first)
  const monitorHistory = useMemo(() => allEvents.filter(e => e.monitorId === event.monitorId).slice(0, 20), [allEvents, event.monitorId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06] flex items-center justify-between relative" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(90deg, ${st.color}00, ${st.color}88, ${st.color}00)` }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: st.color, boxShadow: `0 0 6px ${st.color}66` }}/>
            <span className="text-[13px] font-bold text-white/90 truncate">{event.monitorName}</span>
          </div>
          <div className="text-[10px] text-white/30 font-mono mt-0.5 ml-4">{formatFullDate(date)}</div>
        </div>
        <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-all shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
        {/* Follow banner */}
        {isFollowed && (
          <div className="mb-3 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <span className="text-[11px] font-semibold text-blue-400/80">EN SEGUIMIENTO</span>
          </div>
        )}

        {/* ACK banner */}
        {isAck && !isFollowed && (
          <div className="mb-3 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.12)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            <span className="text-[11px] font-semibold text-green-400/80">ALARMA ACEPTADA</span>
          </div>
        )}

        {/* Status + severity + live timer */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ color: st.color, background: st.bg }}>{st.icon} {st.label}</span>
          {severity.level !== "none" && <span className="text-[9px] font-black px-2 py-1 rounded-lg" style={{ background: severity.bg, color: severity.color, border: `1px solid ${severity.color}33` }}>{severity.label}</span>}
          {dtMs != null && dtMs === -1 && (
            <span className="text-[10px] font-mono font-bold text-red-400"><LiveTimer since={event.time} /></span>
          )}
          {dtMs != null && dtMs !== -1 && <span className="text-[10px] font-mono text-white/40">{formatDuration(dtMs)}</span>}
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

        {/* Action buttons */}
        {event.status === 0 && (
          <div className="flex gap-2 mb-4">
            {!isAck && (
              <button onClick={() => onAck(evKey)}
                className="flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.15)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Aceptar
              </button>
            )}
            <button onClick={() => onFollow(evKey)}
              className="flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: isFollowed ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.06)",
                color: isFollowed ? "#60a5fa" : "#93c5fd",
                border: `1px solid ${isFollowed ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.12)"}`,
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              {isFollowed ? "Dejar de seguir" : "Seguir"}
            </button>
          </div>
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
