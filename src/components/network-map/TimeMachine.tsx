"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Clock, Play, Pause, Radio } from "lucide-react";

interface HeartbeatEntry {
  time: string;
  status: number;
  ping: number | null;
}

interface MonitorInfo {
  id: number;
  name: string;
  type: string;
  status?: number;
}

interface TimeMachineProps {
  open: boolean;
  onToggle: () => void;
  onTimeChange: (time: Date | null, statuses: Map<number, number>) => void;
  monitors: MonitorInfo[];
}

export default function TimeMachine({ open, onToggle, onTimeChange, monitors }: TimeMachineProps) {
  const [timeline, setTimeline] = useState<Record<number, HeartbeatEntry[]>>({});
  const [position, setPosition] = useState(1); // 0=oldest, 1=LIVE
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

  // Fetch timeline
  useEffect(() => {
    if (!open) return;
    const doFetch = () => { fetch("/maps/api/kuma/timeline").then(r => r.json()).then(d => setTimeline(d.timeline || {})).catch(() => {}); };
    doFetch();
    const iv = setInterval(doFetch, 30000);
    return () => clearInterval(iv);
  }, [open]);

  // Statuses at time
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

  const currentTime = useMemo(() => {
    if (isLive) return null;
    return new Date(timeStart.getTime() + position * (timeEnd.getTime() - timeStart.getTime()));
  }, [position, isLive, timeStart, timeEnd]);

  // Notify parent
  useEffect(() => {
    const statuses = currentTime ? getStatusesAtTime(currentTime) : new Map<number, number>();
    onTimeChange(currentTime, statuses);
  }, [currentTime]);

  // Summary color segments (vertical: top=oldest, bottom=newest)
  const summarySegments = useMemo(() => {
    const count = 150;
    const rangeMs = timeEnd.getTime() - timeStart.getTime();
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = new Date(timeStart.getTime() + (i / count) * rangeMs);
      let hasDown = false, hasPending = false;
      for (const mon of activeMonitors) {
        const entries = timeline[mon.id] || [];
        let st = 2;
        for (const e of entries) { if (new Date(e.time) <= t) st = e.status; else break; }
        if (st === 0) hasDown = true;
        if (st === 2) hasPending = true;
      }
      colors.push(hasDown ? "#ef4444" : hasPending ? "#f59e0b" : "#22c55e");
    }
    return colors;
  }, [timeline, activeMonitors, timeStart, timeEnd]);

  // Play
  useEffect(() => {
    if (!playing) { if (playRef.current) clearInterval(playRef.current); return; }
    const step = (speed * 60000) / (timeEnd.getTime() - timeStart.getTime());
    playRef.current = setInterval(() => {
      setPosition(p => { const n = p + step; if (n >= 1) { setPlaying(false); return 1; } return n; });
    }, 80);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing, speed, timeStart, timeEnd]);

  // Drag (vertical)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true); setPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = barRef.current!.getBoundingClientRect();
    setPosition(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)));
  }, []);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const rect = barRef.current!.getBoundingClientRect();
    setPosition(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)));
  }, [dragging]);
  const handlePointerUp = useCallback(() => setDragging(false), []);

  const downCount = useMemo(() => {
    if (!currentTime) return 0;
    const st = getStatusesAtTime(currentTime);
    let c = 0; st.forEach(s => { if (s === 0) c++; }); return c;
  }, [currentTime, getStatusesAtTime]);

  // Closed state: small button
  if (!open) {
    return (
      <button onClick={onToggle}
        className="absolute right-[340px] top-1/2 -translate-y-1/2 z-[10000] flex flex-col items-center gap-1 rounded-l-xl px-1.5 py-3 transition-all hover:px-2.5"
        style={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRight: "none", backdropFilter: "blur(16px)" }}>
        <Clock className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[8px] font-bold text-[#888] tracking-wider" style={{ writingMode: "vertical-rl" }}>TIME MACHINE</span>
      </button>
    );
  }

  return (
    <div className="absolute right-[320px] top-0 bottom-0 z-[10000] flex"
      style={{ width: 52 }}>

      {/* Vertical bar */}
      <div className="h-full w-full flex flex-col"
        style={{ background: "rgba(6,6,6,0.95)", borderLeft: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)" }}>

        {/* Top: controls */}
        <div className="flex flex-col items-center gap-1.5 py-2 px-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <button onClick={onToggle} className="text-blue-400 hover:text-blue-300 transition-colors">
            <Clock className="h-3.5 w-3.5" />
          </button>
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

        {/* Timeline scrubber (vertical) */}
        <div ref={barRef} className="flex-1 relative cursor-ns-resize select-none mx-1.5 my-1 rounded-lg overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}>

          {/* Color segments (vertical) */}
          <div className="absolute inset-0 flex flex-col">
            {summarySegments.map((c, i) => (
              <div key={i} className="flex-1 w-full" style={{ background: c, opacity: 0.35 }} />
            ))}
          </div>

          {/* Scrubber handle */}
          <div className="absolute left-0 right-0 transition-[top] duration-75 pointer-events-none"
            style={{ top: `${position * 100}%` }}>
            <div className="relative flex items-center justify-center">
              <div className="absolute -top-[5px] w-full h-[3px] rounded-full"
                style={{ background: isLive ? "#4ade80" : "#60a5fa", boxShadow: `0 0 10px ${isLive ? "#4ade80" : "#60a5fa"}` }} />
              {/* Time tooltip */}
              {!isLive && (
                <div className="absolute -left-[72px] -top-2 rounded-md px-1.5 py-0.5 text-[8px] font-mono font-bold whitespace-nowrap"
                  style={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>
                  {currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>

          {/* Time labels */}
          <div className="absolute left-0 right-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none px-0.5 py-1">
            {Array.from({ length: 5 }, (_, i) => {
              const t = new Date(timeStart.getTime() + (i / 4) * (timeEnd.getTime() - timeStart.getTime()));
              return <span key={i} className="text-[6px] text-[#333] font-mono text-center">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
            })}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-1 py-2 px-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          {/* Speed */}
          {[1, 4, 16].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className="text-[7px] font-bold rounded-md px-1 py-0.5 transition-all w-full text-center"
              style={{ color: speed === s ? "#60a5fa" : "#444", background: speed === s ? "rgba(59,130,246,0.1)" : "transparent" }}>
              {s}x
            </button>
          ))}
          <div className="h-px w-full my-0.5" style={{ background: "rgba(255,255,255,0.04)" }} />
          {/* Hours */}
          {[1, 2, 6, 24].map(h => (
            <button key={h} onClick={() => setHoursBack(h)}
              className="text-[7px] font-bold rounded-md px-1 py-0.5 transition-all w-full text-center"
              style={{ color: hoursBack === h ? "#ededed" : "#444", background: hoursBack === h ? "rgba(255,255,255,0.05)" : "transparent" }}>
              {h}h
            </button>
          ))}

          {/* Status */}
          <div className="mt-1 text-center">
            <div className="text-[8px] font-mono font-bold" style={{ color: isLive ? "#4ade80" : "#60a5fa" }}>
              {isLive ? "LIVE" : currentTime?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            {!isLive && downCount > 0 && (
              <div className="text-[7px] text-red-400 font-bold animate-pulse">{downCount}↓</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
