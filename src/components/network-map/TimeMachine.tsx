"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Clock, Play, Pause, Radio, Gauge, Calendar, Zap, ChevronRight } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  time: string;
  status: number;
  prevStatus: number;
  ping: number | null;
  msg: string;
}

interface MonitorInfo { id: number; name: string; type: string; status?: number; }

interface TimeMachineProps {
  open: boolean;
  onToggle: () => void;
  onTimeChange: (time: Date | null, statuses: Map<number, number>) => void;
  onDragging?: (isDragging: boolean) => void;
  onFocusEvent?: (monitorId: number, eventType: "down" | "up") => void;
  monitors: MonitorInfo[];
  mapMonitorIds?: number[];
}

export default function TimeMachine({ open, onToggle, onTimeChange, onDragging, onFocusEvent, monitors, mapMonitorIds }: TimeMachineProps) {
  const [allEvents, setAllEvents] = useState<TimelineEvent[]>([]);
  const [statusChanges, setStatusChanges] = useState<Record<number, Array<{ t: number; s: number }>>>({});
  const [position, setPosition] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [hoursBack, setHoursBack] = useState(6);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activePanel, setActivePanel] = useState<"speed" | "range" | "events" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mapMonitorSet = useMemo(() => new Set(mapMonitorIds || []), [mapMonitorIds]);
  const activeMonitors = useMemo(() => {
    const filtered = monitors.filter(m => m.type !== "group");
    if (mapMonitorSet.size === 0) return filtered;
    return filtered.filter(m => mapMonitorSet.has(m.id));
  }, [monitors, mapMonitorSet]);

  const timeStart = useMemo(() => new Date(Date.now() - hoursBack * 3600000), [hoursBack]);
  const timeEnd = useMemo(() => new Date(), []);
  const isLive = position >= 0.999;
  const rangeMs = timeEnd.getTime() - timeStart.getTime();

  // Fetch timeline — always uses hoursBack
  const fetchTimeline = useCallback(() => {
    setLoading(true);
    fetch(apiUrl(`/api/kuma/timeline?hours=${hoursBack}`))
      .then(r => r.json())
      .then(d => {
        setAllEvents(d.events || []);
        setStatusChanges(d.statusChanges || {});
        setLoading(false);
        setLoaded(true);
      })
      .catch(() => { setLoading(false); });
  }, [hoursBack]);

  // Auto-fetch when opened or hours change
  useEffect(() => {
    if (!open) return;
    fetchTimeline();
  }, [open, hoursBack, fetchTimeline]);

  // Refresh every 2 min
  useEffect(() => {
    if (!open || !loaded) return;
    const iv = setInterval(fetchTimeline, 120000);
    return () => clearInterval(iv);
  }, [open, loaded, fetchTimeline]);

  // Filter events to map monitors + time range
  const visibleEvents = useMemo(() => {
    const startMs = timeStart.getTime();
    const endMs = timeEnd.getTime();
    return allEvents
      .filter(e => {
        if (mapMonitorSet.size > 0 && !mapMonitorSet.has(e.monitorId)) return false;
        const t = new Date(e.time).getTime();
        return t >= startMs && t <= endMs;
      })
      .map(e => ({
        ...e,
        position: (new Date(e.time).getTime() - startMs) / rangeMs,
        timeDate: new Date(e.time),
      }));
  }, [allEvents, timeStart, timeEnd, rangeMs, mapMonitorSet]);

  const downEvents = useMemo(() => visibleEvents.filter(e => e.status === 0), [visibleEvents]);

  const getStatusesAtTime = useCallback((t: Date): Map<number, number> => {
    const map = new Map<number, number>();
    const targetMs = t.getTime();
    for (const mon of activeMonitors) {
      const changes = statusChanges[mon.id];
      if (!changes || changes.length === 0) { map.set(mon.id, mon.status ?? 1); continue; }
      let status = changes[0].s;
      for (const c of changes) { if (c.t <= targetMs) status = c.s; else break; }
      map.set(mon.id, status);
    }
    return map;
  }, [statusChanges, activeMonitors]);

  const currentTime = useMemo(() => {
    if (isLive) return null;
    return new Date(timeStart.getTime() + position * rangeMs);
  }, [position, isLive, timeStart, rangeMs]);

  useEffect(() => {
    const statuses = currentTime ? getStatusesAtTime(currentTime) : new Map<number, number>();
    onTimeChange(currentTime, statuses);
  }, [currentTime]);

  useEffect(() => { onDragging?.(dragging); }, [dragging, onDragging]);

  // Play
  useEffect(() => {
    if (!playing) { if (playRef.current) clearInterval(playRef.current); return; }
    const step = (speed * 60000) / rangeMs;
    playRef.current = setInterval(() => {
      setPosition(prev => {
        const next = prev + step;
        if (next >= 1) { setPlaying(false); return 1; }
        for (const evt of visibleEvents) {
          if (evt.status === 0 && prev < evt.position && next >= evt.position) {
            setPlaying(false);
            onFocusEvent?.(evt.monitorId, "down");
            return evt.position;
          }
        }
        return next;
      });
    }, 50);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing, speed, rangeMs, visibleEvents]);

  const updatePosition = useCallback((clientY: number) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    setPosition(Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true); setPlaying(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientY);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    updatePosition(e.clientY);
  }, [dragging, updatePosition]);

  const handlePointerUp = useCallback(() => setDragging(false), []);

  const downCount = useMemo(() => {
    if (!currentTime) return 0;
    const st = getStatusesAtTime(currentTime);
    let c = 0; st.forEach(s => { if (s === 0) c++; }); return c;
  }, [currentTime, getStatusesAtTime]);

  const togglePanel = (p: "speed" | "range" | "events") => setActivePanel(prev => prev === p ? null : p);

  // ─── Closed ───
  if (!open) {
    return (
      <button onClick={onToggle}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-[10000] flex flex-col items-center gap-2 rounded-2xl px-2.5 py-5 transition-all hover:px-3.5"
        style={{ background: "rgba(10,10,10,0.88)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
        <Clock className="h-4 w-4 text-blue-400" />
        <span className="text-[7px] font-black text-[#555] tracking-wider" style={{ writingMode: "vertical-rl" }}>TIME MACHINE</span>
        {downEvents.length > 0 && loaded && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
            style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>{downEvents.length}</span>
        )}
      </button>
    );
  }

  // ─── Open ───
  return (
    <div className="absolute left-3 top-20 bottom-20 z-[10000] flex" style={{ width: 60 }}>
      <div className="h-full w-full flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,8,8,0.94)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>

        {/* Top controls */}
        <div className="flex flex-col items-center gap-2 py-3 px-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <button onClick={onToggle} className="text-blue-400 hover:text-blue-300 transition-colors" title="Cerrar Time Machine">
            <Clock className="h-4 w-4" />
          </button>
          <button onClick={() => {
            if (isLive) { setPosition(0); setPlaying(true); } else setPlaying(!playing);
          }}
            className="flex items-center justify-center h-8 w-8 rounded-xl transition-all"
            style={{ background: playing ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${playing ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.06)"}`, color: playing ? "#60a5fa" : "#888" }}
            title={playing ? "Pausar" : "Reproducir"}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={() => { setPosition(1); setPlaying(false); }}
            className="flex items-center justify-center h-8 w-8 rounded-xl transition-all"
            style={{ background: isLive ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${isLive ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`, color: isLive ? "#4ade80" : "#555" }}
            title="Volver a LIVE">
            <Radio className="h-4 w-4" />
          </button>
        </div>

        {/* Timeline bar */}
        <div ref={barRef}
          className="flex-1 relative cursor-ns-resize select-none mx-1.5 my-1 rounded-xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)", touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(20,20,40,0.15), rgba(10,10,10,0.05))" }} />

          {/* Loading */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
            </div>
          )}

          {/* Event markers */}
          {visibleEvents.map((evt, i) => {
            const isDown = evt.status === 0;
            const isRecovery = evt.prevStatus === 0 && evt.status === 1;
            const evtColor = isDown ? "#ef4444" : isRecovery ? "#22c55e" : "#f59e0b";
            return (
              <div key={i} className="absolute left-0 right-0 group/evt cursor-pointer"
                style={{ top: `${evt.position * 100}%`, pointerEvents: "auto" }}
                onClick={(e) => { e.stopPropagation(); setPosition(evt.position); setPlaying(false); onFocusEvent?.(evt.monitorId, isDown ? "down" : "up"); }}>
                <div className="h-[2px] w-full transition-all group-hover/evt:h-[4px]" style={{ background: evtColor, boxShadow: `0 0 8px ${evtColor}`, opacity: isDown ? 1 : 0.5 }} />
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all group-hover/evt:scale-[2]"
                  style={{ width: isDown ? 8 : 5, height: isDown ? 8 : 5, background: evtColor, boxShadow: `0 0 8px ${evtColor}` }} />
                {/* Tooltip */}
                <div className="absolute left-[64px] -top-5 rounded-xl px-3 py-2 opacity-0 group-hover/evt:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: "rgba(6,6,6,0.97)", border: `1px solid ${evtColor}33`, boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 20px ${evtColor}15`, backdropFilter: "blur(16px)", zIndex: 20, minWidth: 200 }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-3 w-3 rounded-full" style={{ background: evtColor, boxShadow: `0 0 8px ${evtColor}` }} />
                    <span className="text-[11px] font-bold text-[#ededed]">{evt.monitorName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-bold px-2 py-0.5 rounded-md" style={{ background: evtColor + "22", color: evtColor, border: `1px solid ${evtColor}33` }}>
                      {isDown ? "▼ DOWN" : isRecovery ? "▲ RECOVERED" : "● CAMBIO"}
                    </span>
                    <span className="font-mono text-[#777]">{evt.timeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                  {evt.msg && <div className="text-[9px] text-[#555] mt-1 truncate max-w-[220px]">{evt.msg}</div>}
                </div>
              </div>
            );
          })}

          {/* Time ticks */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-1">
            {Array.from({ length: 5 }, (_, i) => {
              const t = new Date(timeStart.getTime() + (i / 4) * rangeMs);
              return (
                <div key={i} className="relative">
                  <div className="absolute left-0 right-0 h-px" style={{ background: "rgba(255,255,255,0.03)" }} />
                  <span className="absolute left-1/2 -translate-x-1/2 text-[6px] text-[#333] font-mono">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              );
            })}
          </div>

          {/* NOW */}
          <div className="absolute left-0 right-0 bottom-0 pointer-events-none">
            <div className="h-[2px] w-full" style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80", opacity: 0.4 }} />
          </div>

          {/* Scrubber */}
          <div className="absolute left-0 right-0 pointer-events-none"
            style={{ top: `${position * 100}%`, transition: dragging ? "none" : "top 0.05s linear" }}>
            <div className="relative">
              {playing && <div className="absolute -left-1 -right-1 -top-2 -bottom-2 rounded-full animate-ping" style={{ background: `${isLive ? "#4ade80" : "#60a5fa"}12` }} />}
              <div className="h-[3px] w-full rounded-full" style={{ background: isLive ? "#4ade80" : "#60a5fa", boxShadow: `0 0 12px ${isLive ? "#4ade80" : "#60a5fa"}` }} />
              {!isLive && (
                <div className="absolute left-[64px] -top-3.5 rounded-xl px-2.5 py-1 text-[10px] font-mono font-bold whitespace-nowrap"
                  style={{ background: "rgba(8,8,8,0.95)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                  {currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {downCount > 0 && <span className="ml-1.5 text-red-400 font-bold">{downCount}↓</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom action buttons */}
        <div className="flex flex-col items-center gap-1.5 py-3 px-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>

          {/* Speed */}
          <button onClick={() => togglePanel("speed")}
            className="flex items-center justify-center h-8 w-8 rounded-xl transition-all relative"
            style={{ background: activePanel === "speed" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${activePanel === "speed" ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}`, color: activePanel === "speed" ? "#60a5fa" : "#666" }}
            title={`Velocidad: ${speed}x`}>
            <Gauge className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 text-[7px] font-bold rounded-full px-1" style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa" }}>{speed}x</span>
          </button>

          {/* Range */}
          <button onClick={() => togglePanel("range")}
            className="flex items-center justify-center h-8 w-8 rounded-xl transition-all relative"
            style={{ background: activePanel === "range" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${activePanel === "range" ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.06)"}`, color: activePanel === "range" ? "#f59e0b" : "#666" }}
            title={`Rango: ${hoursBack}h`}>
            <Calendar className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 text-[7px] font-bold rounded-full px-1" style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>{hoursBack}h</span>
          </button>

          {/* Events */}
          <button onClick={() => togglePanel("events")}
            className="flex items-center justify-center h-8 w-8 rounded-xl transition-all relative"
            style={{ background: activePanel === "events" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${activePanel === "events" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`, color: activePanel === "events" ? "#f87171" : "#666" }}
            title={`${downEvents.length} eventos DOWN`}>
            <Zap className="h-4 w-4" />
            {downEvents.length > 0 && (
              <span className="absolute -top-1 -right-1 text-[7px] font-bold rounded-full px-1" style={{ background: "rgba(239,68,68,0.3)", color: "#f87171" }}>{downEvents.length}</span>
            )}
          </button>

          {/* LIVE indicator */}
          <div className="text-[9px] font-mono font-black mt-1" style={{ color: isLive ? "#4ade80" : "#60a5fa" }}>
            {isLive ? "LIVE" : currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* ═══ Popout Panels ═══ */}

      {/* Speed panel */}
      {activePanel === "speed" && (
        <div className="absolute left-[64px] bottom-[100px] rounded-2xl p-3"
          style={{ background: "rgba(8,8,8,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 20, width: 160 }}>
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="h-4 w-4 text-blue-400" />
            <span className="text-[11px] font-bold text-[#ededed]">Velocidad</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 4, 8, 16, 32].map(s => (
              <button key={s} onClick={() => { setSpeed(s); setActivePanel(null); }}
                className="rounded-xl py-2 text-[11px] font-bold text-center transition-all"
                style={{ background: speed === s ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${speed === s ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)"}`, color: speed === s ? "#60a5fa" : "#888" }}>
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Range panel */}
      {activePanel === "range" && (
        <div className="absolute left-[64px] bottom-[60px] rounded-2xl p-3"
          style={{ background: "rgba(8,8,8,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 20, width: 200 }}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-amber-400" />
            <span className="text-[11px] font-bold text-[#ededed]">Rango de tiempo</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 6, 12, 24, 48, 72, 168].map(h => (
              <button key={h} onClick={() => { setHoursBack(h); setPosition(1); setPlaying(false); setActivePanel(null); }}
                className="rounded-xl py-2 text-[11px] font-bold text-center transition-all"
                style={{ background: hoursBack === h ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${hoursBack === h ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.04)"}`, color: hoursBack === h ? "#f59e0b" : "#888" }}>
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Events panel */}
      {activePanel === "events" && (
        <div className="absolute left-[64px] bottom-[20px] rounded-2xl p-3"
          style={{ background: "rgba(8,8,8,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 20, width: 280, maxHeight: 400, overflowY: "auto" }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-red-400" />
            <span className="text-[11px] font-bold text-[#ededed]">Eventos ({visibleEvents.length})</span>
            <span className="text-[9px] text-[#555] ml-auto">{hoursBack}h</span>
          </div>
          {visibleEvents.length === 0 && (
            <div className="text-[10px] text-[#555] text-center py-6">
              {loading ? "Cargando..." : "Sin eventos en este rango"}
            </div>
          )}
          <div className="space-y-1">
            {visibleEvents.map((evt, i) => {
              const isDown = evt.status === 0;
              const isRecovery = evt.prevStatus === 0 && evt.status === 1;
              const evtColor = isDown ? "#ef4444" : isRecovery ? "#22c55e" : "#f59e0b";
              return (
                <button key={i}
                  onClick={() => { setPosition(evt.position); setPlaying(false); setActivePanel(null); onFocusEvent?.(evt.monitorId, isDown ? "down" : "up"); }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all group/ev"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${evtColor}08`; (e.currentTarget as HTMLElement).style.borderColor = `${evtColor}22`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.04)"; }}
                >
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ background: evtColor, boxShadow: `0 0 6px ${evtColor}` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-[#ededed] truncate">{evt.monitorName}</div>
                    <div className="flex items-center gap-2 text-[9px]">
                      <span className="font-bold" style={{ color: evtColor }}>{isDown ? "DOWN" : isRecovery ? "UP" : "CHG"}</span>
                      <span className="text-[#555] font-mono">{evt.timeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-3 w-3 text-[#333] group-hover/ev:text-[#666] transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
