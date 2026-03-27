"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Clock, Play, Pause, Radio } from "lucide-react";

interface HeartbeatEntry { time: string; status: number; ping: number | null; }
interface MonitorInfo { id: number; name: string; type: string; status?: number; }

interface TimeMachineProps {
  open: boolean;
  onToggle: () => void;
  onTimeChange: (time: Date | null, statuses: Map<number, number>) => void;
  onDragging?: (isDragging: boolean) => void;
  onFocusEvent?: (monitorId: number, eventType: "down" | "up") => void;
  monitors: MonitorInfo[];
}

export default function TimeMachine({ open, onToggle, onTimeChange, onDragging, onFocusEvent, monitors }: TimeMachineProps) {
  const [timeline, setTimeline] = useState<Record<number, HeartbeatEntry[]>>({});
  const [position, setPosition] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [hoursBack, setHoursBack] = useState(2);
  const barRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeMonitors = useMemo(() => monitors.filter(m => m.type !== "group"), [monitors]);
  const timeStart = useMemo(() => new Date(Date.now() - hoursBack * 3600000), [hoursBack]);
  const timeEnd = useMemo(() => new Date(), []);
  const isLive = position >= 0.999;
  const rangeMs = timeEnd.getTime() - timeStart.getTime();

  // Fetch timeline
  useEffect(() => {
    if (!open) return;
    const doFetch = () => { fetch("/maps/api/kuma/timeline").then(r => r.json()).then(d => setTimeline(d.timeline || {})).catch(() => {}); };
    doFetch();
    const iv = setInterval(doFetch, 30000);
    return () => clearInterval(iv);
  }, [open]);

  // Get statuses at time
  const getStatusesAtTime = useCallback((t: Date): Map<number, number> => {
    const map = new Map<number, number>();
    for (const mon of activeMonitors) {
      const entries = timeline[mon.id] || [];
      let status = 2;
      for (const e of entries) { if (new Date(e.time) <= t) status = e.status; else break; }
      map.set(mon.id, status);
    }
    return map;
  }, [timeline, activeMonitors]);

  // Compute events (status changes) for markers on timeline
  const events = useMemo(() => {
    const evts: Array<{ position: number; monitorId: number; monitorName: string; fromStatus: number; toStatus: number; time: Date }> = [];
    for (const mon of activeMonitors) {
      const entries = timeline[mon.id] || [];
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].status !== entries[i - 1].status) {
          const t = new Date(entries[i].time);
          const pos = (t.getTime() - timeStart.getTime()) / rangeMs;
          if (pos >= 0 && pos <= 1) {
            evts.push({ position: pos, monitorId: mon.id, monitorName: mon.name, fromStatus: entries[i - 1].status, toStatus: entries[i].status, time: t });
          }
        }
      }
    }
    return evts.sort((a, b) => a.position - b.position);
  }, [timeline, activeMonitors, timeStart, rangeMs]);

  const currentTime = useMemo(() => {
    if (isLive) return null;
    return new Date(timeStart.getTime() + position * rangeMs);
  }, [position, isLive, timeStart, rangeMs]);

  // Notify parent
  useEffect(() => {
    const statuses = currentTime ? getStatusesAtTime(currentTime) : new Map<number, number>();
    onTimeChange(currentTime, statuses);
  }, [currentTime]);

  // Notify drag state
  useEffect(() => { onDragging?.(dragging); }, [dragging, onDragging]);

  // Play — pause at events
  useEffect(() => {
    if (!playing) { if (playRef.current) clearInterval(playRef.current); return; }
    const step = (speed * 60000) / rangeMs;
    playRef.current = setInterval(() => {
      setPosition(prev => {
        const next = prev + step;
        if (next >= 1) { setPlaying(false); return 1; }
        // Check if we crossed an event — pause and focus
        for (const evt of events) {
          if (prev < evt.position && next >= evt.position) {
            setPlaying(false);
            // Focus on the node that had the event
            if (evt.toStatus === 0) {
              onFocusEvent?.(evt.monitorId, "down");
            } else if (evt.fromStatus === 0 && evt.toStatus === 1) {
              onFocusEvent?.(evt.monitorId, "up");
            }
            return evt.position;
          }
        }
        return next;
      });
    }, 50);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing, speed, rangeMs, events]);

  // Drag — immediate response
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

  // Down count
  const downCount = useMemo(() => {
    if (!currentTime) return 0;
    const st = getStatusesAtTime(currentTime);
    let c = 0; st.forEach(s => { if (s === 0) c++; }); return c;
  }, [currentTime, getStatusesAtTime]);

  if (!open) {
    return (
      <button onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-[10000] flex flex-col items-center gap-1 rounded-r-xl px-1.5 py-3 transition-all hover:px-2.5"
        style={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: "none", backdropFilter: "blur(16px)" }}>
        <Clock className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[8px] font-bold text-[#888] tracking-wider" style={{ writingMode: "vertical-rl" }}>TIME MACHINE</span>
      </button>
    );
  }

  return (
    <div className="absolute left-0 top-0 bottom-0 z-[10000] flex" style={{ width: 52 }}>
      <div className="h-full w-full flex flex-col"
        style={{ background: "rgba(6,6,6,0.95)", borderRight: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)" }}>

        {/* Controls */}
        <div className="flex flex-col items-center gap-1.5 py-2 px-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <button onClick={onToggle} className="text-blue-400 hover:text-blue-300"><Clock className="h-3.5 w-3.5" /></button>
          <button onClick={() => { if (isLive) { setPosition(0); setPlaying(true); } else setPlaying(!playing); }}
            className="rounded-lg p-1 transition-all"
            style={{ background: playing ? "rgba(59,130,246,0.15)" : "transparent", color: playing ? "#60a5fa" : "#888" }}>
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <button onClick={() => { setPosition(1); setPlaying(false); }}
            className="rounded-lg p-1 transition-all"
            style={{ background: isLive ? "rgba(34,197,94,0.12)" : "transparent", color: isLive ? "#4ade80" : "#555" }}>
            <Radio className="h-3 w-3" />
          </button>
        </div>

        {/* Timeline bar */}
        <div ref={barRef}
          className="flex-1 relative cursor-ns-resize select-none mx-1.5 my-1 rounded-lg overflow-hidden"
          style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)", touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Background: subtle gradient */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(30,30,50,0.3), rgba(10,10,10,0.1))" }} />

          {/* Event markers (status changes) */}
          {events.map((evt, i) => {
            const isDown = evt.toStatus === 0;
            const isRecovery = evt.fromStatus === 0 && evt.toStatus === 1;
            const evtColor = isDown ? "#ef4444" : isRecovery ? "#22c55e" : "#f59e0b";
            return (
              <div key={i} className="absolute left-0 right-0 group/evt cursor-pointer"
                style={{ top: `${evt.position * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPosition(evt.position);
                  setPlaying(false);
                  onFocusEvent?.(evt.monitorId, isDown ? "down" : "up");
                }}>
                {/* Glow line */}
                <div className="h-[2px] w-full transition-all group-hover/evt:h-[3px]" style={{
                  background: evtColor,
                  boxShadow: `0 0 8px ${evtColor}`,
                  opacity: isDown ? 0.9 : 0.6,
                }} />
                {/* Dot */}
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all group-hover/evt:scale-150"
                  style={{
                    width: isDown ? 8 : 6, height: isDown ? 8 : 6,
                    background: evtColor,
                    boxShadow: `0 0 6px ${evtColor}`,
                  }} />
                {/* Tooltip on hover */}
                <div className="absolute left-[54px] -top-3 rounded-md px-1.5 py-1 text-[8px] font-bold whitespace-nowrap opacity-0 group-hover/evt:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: "rgba(10,10,10,0.95)", border: `1px solid ${evtColor}44`, color: evtColor, boxShadow: "0 4px 12px rgba(0,0,0,0.6)", zIndex: 10 }}>
                  <div>{evt.monitorName}</div>
                  <div style={{ color: "#888", fontWeight: 500 }}>
                    {isDown ? "▼ DOWN" : isRecovery ? "▲ UP" : "● Cambio"} — {evt.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Time ticks */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-1">
            {Array.from({ length: 7 }, (_, i) => {
              const t = new Date(timeStart.getTime() + (i / 6) * rangeMs);
              return (
                <div key={i} className="relative">
                  <div className="absolute left-0 right-0 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <span className="absolute left-1/2 -translate-x-1/2 text-[6px] text-[#444] font-mono"
                    style={{ top: -1 }}>
                    {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>

          {/* NOW marker (always at bottom = current time) */}
          <div className="absolute left-0 right-0 bottom-0 pointer-events-none">
            <div className="h-[2px] w-full" style={{ background: "#4ade80", boxShadow: "0 0 8px #4ade80", opacity: 0.5 }} />
            <div className="absolute right-0 -top-3 text-[6px] font-bold text-emerald-400 opacity-60">AHORA</div>
          </div>

          {/* Scrubber */}
          <div className="absolute left-0 right-0 pointer-events-none"
            style={{ top: `${position * 100}%`, transition: dragging ? "none" : "top 0.05s linear" }}>
            <div className="relative">
              {/* Pulse ring during play */}
              {playing && (
                <div className="absolute -left-1 -right-1 -top-2 -bottom-2 rounded-full animate-ping"
                  style={{ background: `${isLive ? "#4ade80" : "#60a5fa"}15`, border: `1px solid ${isLive ? "#4ade80" : "#60a5fa"}33` }} />
              )}
              <div className="h-[3px] w-full rounded-full"
                style={{ background: isLive ? "#4ade80" : "#60a5fa", boxShadow: `0 0 ${playing ? 16 : 10}px ${isLive ? "#4ade80" : "#60a5fa"}` }} />
              {!isLive && (
                <div className="absolute left-[54px] -top-2.5 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold whitespace-nowrap"
                  style={{ background: "rgba(10,10,10,0.95)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
                  {currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {downCount > 0 && <span className="ml-1 text-red-400">{downCount}↓</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-1 py-2 px-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          {[1, 4, 16].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className="text-[7px] font-bold rounded-md px-1 py-0.5 w-full text-center transition-all"
              style={{ color: speed === s ? "#60a5fa" : "#444", background: speed === s ? "rgba(59,130,246,0.1)" : "transparent" }}>
              {s}x
            </button>
          ))}
          <div className="h-px w-full my-0.5" style={{ background: "rgba(255,255,255,0.04)" }} />
          {[1, 2, 6, 24].map(h => (
            <button key={h} onClick={() => setHoursBack(h)}
              className="text-[7px] font-bold rounded-md px-1 py-0.5 w-full text-center transition-all"
              style={{ color: hoursBack === h ? "#ededed" : "#444", background: hoursBack === h ? "rgba(255,255,255,0.05)" : "transparent" }}>
              {h}h
            </button>
          ))}
          <div className="mt-1 text-center">
            <div className="text-[8px] font-mono font-bold" style={{ color: isLive ? "#4ade80" : "#60a5fa" }}>
              {isLive ? "LIVE" : currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
