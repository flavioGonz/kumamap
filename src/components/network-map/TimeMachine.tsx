"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Clock, Play, Pause, Radio, ChevronDown, ChevronUp, Zap, Calendar, Gauge } from "lucide-react";
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
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [statusChanges, setStatusChanges] = useState<Record<number, Array<{ t: number; s: number }>>>({});
  const [position, setPosition] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [hoursBack, setHoursBack] = useState(2);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [customRange, setCustomRange] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const barRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mapMonitorSet = useMemo(() => new Set(mapMonitorIds || []), [mapMonitorIds]);
  const activeMonitors = useMemo(() => {
    const filtered = monitors.filter(m => m.type !== "group");
    if (mapMonitorSet.size === 0) return filtered;
    return filtered.filter(m => mapMonitorSet.has(m.id));
  }, [monitors, mapMonitorSet]);

  const timeStart = useMemo(() => {
    if (customRange && rangeFrom) return new Date(rangeFrom);
    return new Date(Date.now() - hoursBack * 3600000);
  }, [hoursBack, customRange, rangeFrom]);
  const timeEnd = useMemo(() => {
    if (customRange && rangeTo) return new Date(rangeTo);
    return new Date();
  }, [customRange, rangeTo]);
  const isLive = position >= 0.999;
  const rangeMs = timeEnd.getTime() - timeStart.getTime();

  const fetchTimeline = useCallback(() => {
    setLoading(true);
    const h = customRange ? Math.ceil(rangeMs / 3600000) : hoursBack;
    fetch(apiUrl(`/api/kuma/timeline?hours=${Math.min(h, 168)}`))
      .then(r => r.json())
      .then(d => {
        setEvents(d.events || []);
        setStatusChanges(d.statusChanges || {});
        setLoading(false);
        setLoaded(true);
      })
      .catch(() => setLoading(false));
  }, [hoursBack, customRange, rangeMs]);

  useEffect(() => { setLoaded(false); }, [hoursBack]);

  useEffect(() => {
    if (!open || !loaded) return;
    const iv = setInterval(fetchTimeline, 120000);
    return () => clearInterval(iv);
  }, [open, loaded, fetchTimeline]);

  const visibleEvents = useMemo(() => {
    const startMs = timeStart.getTime();
    const endMs = timeEnd.getTime();
    return events
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
  }, [events, timeStart, timeEnd, rangeMs, mapMonitorSet]);

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

  // Play — pause at DOWN events and trigger focus
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

  // ─── Closed state ───
  if (!open) {
    return (
      <button onClick={onToggle}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-[10000] flex flex-col items-center gap-1.5 rounded-2xl px-2 py-4 transition-all hover:px-3"
        style={{ background: "rgba(10,10,10,0.85)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
        <Clock className="h-4 w-4 text-blue-400" />
        <span className="text-[7px] font-black text-[#666] tracking-wider" style={{ writingMode: "vertical-rl" }}>TIME MACHINE</span>
        {downEvents.length > 0 && loaded && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-[8px] font-bold text-red-400">{downEvents.length}</span>
        )}
      </button>
    );
  }

  // ─── Open state — Floating compact bar ───
  return (
    <div className="absolute left-2 top-16 bottom-16 z-[10000] flex" style={{ width: 48 }}>
      <div className="h-full w-full flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "rgba(6,6,6,0.92)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>

        {/* Top: Close + Play + Live */}
        <div className="flex flex-col items-center gap-1 py-2 px-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <button onClick={onToggle} className="text-blue-400 hover:text-blue-300 transition-colors"><Clock className="h-3.5 w-3.5" /></button>
          <button onClick={() => {
            if (!loaded) fetchTimeline();
            if (isLive) { setPosition(0); setPlaying(true); } else setPlaying(!playing);
          }}
            className="rounded-xl p-1.5 transition-all"
            style={{ background: playing ? "rgba(59,130,246,0.2)" : "transparent", color: playing ? "#60a5fa" : "#777" }}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setPosition(1); setPlaying(false); }}
            className="rounded-xl p-1.5 transition-all"
            style={{ background: isLive ? "rgba(34,197,94,0.15)" : "transparent", color: isLive ? "#4ade80" : "#555" }}>
            <Radio className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Timeline bar */}
        <div ref={barRef}
          className="flex-1 relative cursor-ns-resize select-none mx-1 my-0.5 rounded-xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)", touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(20,20,40,0.2), rgba(10,10,10,0.05))" }} />

          {/* Load button or spinner */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-blue-500" />
            </div>
          )}
          {!loaded && !loading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "auto" }}>
              <button onClick={fetchTimeline}
                className="rounded-lg px-1.5 py-1 text-[6px] font-bold uppercase tracking-wider"
                style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}>
                Cargar
              </button>
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
                onClick={(e) => {
                  e.stopPropagation();
                  setPosition(evt.position);
                  setPlaying(false);
                  onFocusEvent?.(evt.monitorId, isDown ? "down" : "up");
                }}>
                <div className="h-[2px] w-full transition-all group-hover/evt:h-[3px]" style={{ background: evtColor, boxShadow: `0 0 6px ${evtColor}`, opacity: isDown ? 0.9 : 0.5 }} />
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all group-hover/evt:scale-[2]"
                  style={{ width: isDown ? 7 : 5, height: isDown ? 7 : 5, background: evtColor, boxShadow: `0 0 6px ${evtColor}` }} />
                {/* Tooltip */}
                <div className="absolute left-[52px] -top-5 rounded-xl px-3 py-2 opacity-0 group-hover/evt:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: "rgba(6,6,6,0.97)", border: `1px solid ${evtColor}33`, boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 20px ${evtColor}15`, backdropFilter: "blur(16px)", zIndex: 20, minWidth: 180 }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: evtColor, boxShadow: `0 0 8px ${evtColor}` }} />
                    <span className="text-[11px] font-bold text-[#ededed]">{evt.monitorName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] mb-1">
                    <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: evtColor + "22", color: evtColor, border: `1px solid ${evtColor}33` }}>
                      {isDown ? "▼ DOWN" : isRecovery ? "▲ RECOVERED" : "● CAMBIO"}
                    </span>
                    <span className="font-mono text-[#777]">
                      {evt.timeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                  {evt.msg && <div className="text-[8px] text-[#555] truncate max-w-[200px]">{evt.msg}</div>}
                </div>
              </div>
            );
          })}

          {/* Time ticks */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-0.5">
            {Array.from({ length: 5 }, (_, i) => {
              const t = new Date(timeStart.getTime() + (i / 4) * rangeMs);
              return (
                <div key={i} className="relative">
                  <div className="absolute left-0 right-0 h-px" style={{ background: "rgba(255,255,255,0.03)" }} />
                  <span className="absolute left-1/2 -translate-x-1/2 text-[5px] text-[#333] font-mono">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              );
            })}
          </div>

          {/* NOW marker */}
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
                <div className="absolute left-[52px] -top-3 rounded-lg px-2 py-0.5 text-[9px] font-mono font-bold whitespace-nowrap"
                  style={{ background: "rgba(8,8,8,0.95)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                  {currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {downCount > 0 && <span className="ml-1 text-red-400">{downCount}↓</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: collapsible controls */}
        <div className="flex flex-col items-center gap-0.5 py-1.5 px-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>

          {/* Speed toggle */}
          <button onClick={() => { setShowSpeed(v => !v); setShowRange(false); setShowEvents(false); }}
            className="flex items-center gap-0.5 rounded-lg px-1 py-0.5 w-full text-center transition-all"
            style={{ color: showSpeed ? "#60a5fa" : "#555", background: showSpeed ? "rgba(59,130,246,0.08)" : "transparent" }}>
            <Gauge className="h-2.5 w-2.5" />
            <span className="text-[7px] font-bold flex-1">{speed}x</span>
            {showSpeed ? <ChevronUp className="h-2 w-2" /> : <ChevronDown className="h-2 w-2" />}
          </button>
          {showSpeed && (
            <div className="absolute left-[52px] bottom-[80px] rounded-xl p-2 space-y-1"
              style={{ background: "rgba(6,6,6,0.97)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 20, width: 80 }}>
              <div className="text-[8px] font-bold text-[#555] uppercase tracking-wider mb-1">Velocidad</div>
              {[1, 2, 4, 8, 16].map(s => (
                <button key={s} onClick={() => { setSpeed(s); setShowSpeed(false); }}
                  className="w-full text-left rounded-lg px-2 py-1 text-[9px] font-bold transition-all"
                  style={{ color: speed === s ? "#60a5fa" : "#888", background: speed === s ? "rgba(59,130,246,0.1)" : "transparent" }}>
                  {s}x {s === 1 ? "normal" : s >= 8 ? "rapido" : ""}
                </button>
              ))}
            </div>
          )}

          {/* Range toggle */}
          <button onClick={() => { setShowRange(v => !v); setShowSpeed(false); setShowEvents(false); }}
            className="flex items-center gap-0.5 rounded-lg px-1 py-0.5 w-full text-center transition-all"
            style={{ color: showRange ? "#f59e0b" : "#555", background: showRange ? "rgba(245,158,11,0.08)" : "transparent" }}>
            <Calendar className="h-2.5 w-2.5" />
            <span className="text-[7px] font-bold flex-1">{customRange ? "Rango" : hoursBack + "h"}</span>
            {showRange ? <ChevronUp className="h-2 w-2" /> : <ChevronDown className="h-2 w-2" />}
          </button>
          {showRange && (
            <div className="absolute left-[52px] bottom-[56px] rounded-xl p-2 space-y-1"
              style={{ background: "rgba(6,6,6,0.97)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 20, width: 200 }}>
              <div className="text-[8px] font-bold text-[#555] uppercase tracking-wider mb-1">Rango de tiempo</div>
              <div className="flex gap-1 flex-wrap">
                {[1, 2, 6, 12, 24, 48, 72, 168].map(h => (
                  <button key={h} onClick={() => { setHoursBack(h); setCustomRange(false); setLoaded(false); setPosition(1); setShowRange(false); }}
                    className="rounded-lg px-2 py-1 text-[9px] font-bold transition-all"
                    style={{ color: !customRange && hoursBack === h ? "#ededed" : "#666", background: !customRange && hoursBack === h ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${!customRange && hoursBack === h ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}` }}>
                    {h < 24 ? `${h}h` : `${h / 24}d`}
                  </button>
                ))}
              </div>
              <div className="h-px my-1" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="text-[8px] font-bold text-[#555] uppercase tracking-wider mb-1">Rango personalizado</div>
              <div className="space-y-1">
                <div>
                  <label className="text-[7px] text-[#444] font-semibold">Desde</label>
                  <input type="datetime-local" value={rangeFrom || new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 16)}
                    onChange={e => setRangeFrom(e.target.value)}
                    className="w-full rounded-lg px-2 py-1 text-[9px] text-[#ededed] mt-0.5 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
                </div>
                <div>
                  <label className="text-[7px] text-[#444] font-semibold">Hasta</label>
                  <input type="datetime-local" value={rangeTo || new Date().toISOString().slice(0, 16)}
                    onChange={e => setRangeTo(e.target.value)}
                    className="w-full rounded-lg px-2 py-1 text-[9px] text-[#ededed] mt-0.5 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
                </div>
                <button onClick={() => { setCustomRange(true); setLoaded(false); fetchTimeline(); setPosition(0); setShowRange(false); }}
                  className="w-full rounded-lg py-1.5 text-[8px] font-bold uppercase tracking-wider transition-all"
                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}>
                  Aplicar
                </button>
              </div>
            </div>
          )}

          {/* Events list toggle */}
          <button onClick={() => { setShowEvents(v => !v); setShowSpeed(false); setShowRange(false); if (!loaded) fetchTimeline(); }}
            className="flex items-center gap-0.5 rounded-lg px-1 py-0.5 w-full text-center transition-all"
            style={{ color: showEvents ? "#ef4444" : "#555", background: showEvents ? "rgba(239,68,68,0.08)" : "transparent" }}>
            <Zap className="h-2.5 w-2.5" />
            <span className="text-[7px] font-bold flex-1">{downEvents.length > 0 ? downEvents.length : "Evt"}</span>
            {showEvents ? <ChevronUp className="h-2 w-2" /> : <ChevronDown className="h-2 w-2" />}
          </button>
          {showEvents && (
            <div className="absolute left-[52px] bottom-[32px] rounded-xl p-2"
              style={{ background: "rgba(6,6,6,0.97)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 20, width: 240, maxHeight: 300, overflowY: "auto" }}>
              <div className="text-[8px] font-bold text-[#555] uppercase tracking-wider mb-2">
                Eventos ({visibleEvents.length})
              </div>
              {visibleEvents.length === 0 && (
                <div className="text-[9px] text-[#444] text-center py-4">
                  {loaded ? "Sin eventos en este rango" : "Clic en Cargar para ver eventos"}
                </div>
              )}
              <div className="space-y-1">
                {visibleEvents.map((evt, i) => {
                  const isDown = evt.status === 0;
                  const isRecovery = evt.prevStatus === 0 && evt.status === 1;
                  const evtColor = isDown ? "#ef4444" : isRecovery ? "#22c55e" : "#f59e0b";
                  return (
                    <button key={i}
                      onClick={() => {
                        setPosition(evt.position);
                        setPlaying(false);
                        setShowEvents(false);
                        onFocusEvent?.(evt.monitorId, isDown ? "down" : "up");
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all hover:bg-white/[0.03]"
                      style={{ border: "1px solid transparent" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = evtColor + "33"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                    >
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: evtColor, boxShadow: `0 0 4px ${evtColor}` }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-bold text-[#ededed] truncate">{evt.monitorName}</div>
                        <div className="flex items-center gap-1.5 text-[8px]">
                          <span className="font-bold" style={{ color: evtColor }}>{isDown ? "DOWN" : isRecovery ? "UP" : "CHG"}</span>
                          <span className="text-[#555] font-mono">{evt.timeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current time / LIVE */}
          <div className="mt-0.5 text-center">
            <div className="text-[8px] font-mono font-black" style={{ color: isLive ? "#4ade80" : "#60a5fa" }}>
              {isLive ? "LIVE" : currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
