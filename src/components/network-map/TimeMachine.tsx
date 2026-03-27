"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Clock, Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from "lucide-react";

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
  parent?: number | null;
}

interface TimeMachineProps {
  open: boolean;
  onToggle: () => void;
  onTimeChange: (time: Date | null) => void; // null = live mode
  monitors: MonitorInfo[];
}

const STATUS_COLORS: Record<number, string> = {
  0: "#ef4444", // DOWN
  1: "#22c55e", // UP
  2: "#f59e0b", // PENDING
  3: "#8b5cf6", // MAINTENANCE
};

export default function TimeMachine({ open, onToggle, onTimeChange, monitors }: TimeMachineProps) {
  const [timeline, setTimeline] = useState<Record<number, HeartbeatEntry[]>>({});
  const [currentTime, setCurrentTime] = useState<Date | null>(null); // null = LIVE
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Time range: last 2 hours (adjustable)
  const [hoursBack, setHoursBack] = useState(2);
  const timeStart = useMemo(() => new Date(Date.now() - hoursBack * 60 * 60 * 1000), [hoursBack]);
  const timeEnd = useMemo(() => new Date(), []);

  // Non-group monitors only
  const activeMonitors = useMemo(
    () => monitors.filter((m) => m.type !== "group"),
    [monitors]
  );

  // Fetch timeline data
  useEffect(() => {
    if (!open) return;
    fetch("/maps/api/kuma/timeline")
      .then((r) => r.json())
      .then((data) => setTimeline(data.timeline || {}))
      .catch(() => {});

    const interval = setInterval(() => {
      fetch("/maps/api/kuma/timeline")
        .then((r) => r.json())
        .then((data) => setTimeline(data.timeline || {}))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [open]);

  // Draw timeline canvas
  useEffect(() => {
    if (!canvasRef.current || !open) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const rowHeight = 20;
    const labelWidth = 0;
    const barWidth = width - labelWidth;
    const height = activeMonitors.length * rowHeight;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const startMs = timeStart.getTime();
    const endMs = timeEnd.getTime();
    const rangeMs = endMs - startMs;

    activeMonitors.forEach((mon, i) => {
      const y = i * rowHeight;
      const entries = timeline[mon.id] || [];

      // Background
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.1)";
      ctx.fillRect(labelWidth, y, barWidth, rowHeight);

      // Draw status bars
      if (entries.length === 0) {
        ctx.fillStyle = "rgba(107,114,128,0.2)";
        ctx.fillRect(labelWidth, y + 2, barWidth, rowHeight - 4);
      } else {
        for (let j = 0; j < entries.length; j++) {
          const entryTime = new Date(entries[j].time).getTime();
          const nextTime = j < entries.length - 1 ? new Date(entries[j + 1].time).getTime() : endMs;

          if (nextTime < startMs || entryTime > endMs) continue;

          const x = Math.max(0, ((entryTime - startMs) / rangeMs) * barWidth) + labelWidth;
          const w = Math.min(barWidth - (x - labelWidth), ((nextTime - entryTime) / rangeMs) * barWidth);

          ctx.fillStyle = (STATUS_COLORS[entries[j].status] || "#6b7280") + "cc";
          ctx.fillRect(x, y + 3, Math.max(w, 1), rowHeight - 6);
        }
      }
    });

    // Draw current time cursor
    if (currentTime) {
      const cursorMs = currentTime.getTime();
      if (cursorMs >= startMs && cursorMs <= endMs) {
        const x = ((cursorMs - startMs) / rangeMs) * barWidth + labelWidth;
        ctx.strokeStyle = "#60a5fa";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Glow
        ctx.shadowColor = "#60a5fa";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "#60a5fa";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }, [timeline, activeMonitors, open, currentTime, timeStart, timeEnd]);

  // Play animation
  useEffect(() => {
    if (!playing) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      return;
    }

    const stepMs = 60000 * speed; // 1 min per tick * speed
    const intervalMs = 100; // tick every 100ms

    playIntervalRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        const next = new Date((prev || timeStart).getTime() + stepMs);
        if (next >= timeEnd) {
          setPlaying(false);
          return null; // Back to live
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [playing, speed, timeStart, timeEnd]);

  // Notify parent of time changes
  useEffect(() => {
    onTimeChange(currentTime);
  }, [currentTime, onTimeChange]);

  // Get status at specific time for a monitor
  function getStatusAtTime(monitorId: number, time: Date): number {
    const entries = timeline[monitorId] || [];
    let lastStatus = 2; // pending
    for (const e of entries) {
      if (new Date(e.time) <= time) lastStatus = e.status;
      else break;
    }
    return lastStatus;
  }

  // Click on canvas to set time
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      const ms = timeStart.getTime() + ratio * (timeEnd.getTime() - timeStart.getTime());
      setCurrentTime(new Date(ms));
      setPlaying(false);
    },
    [timeStart, timeEnd]
  );

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="absolute bottom-3 right-[340px] z-[10000] flex items-center gap-1.5 rounded-xl px-3 py-2 transition-all"
        style={{
          background: "rgba(10,10,10,0.85)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(16px)",
          color: "#888",
        }}
      >
        <Clock className="h-4 w-4" />
        <span className="text-[10px] font-bold">Time Machine</span>
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-[320px] z-[10000] flex flex-col"
      style={{
        background: "rgba(8,8,8,0.95)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <button onClick={onToggle} className="text-[#555] hover:text-[#ededed] transition-colors">
          <ChevronLeft className="h-4 w-4 rotate-90" />
        </button>

        <Clock className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[11px] font-bold text-[#ededed]">Time Machine</span>

        <div className="h-4 w-px mx-1" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Playback controls */}
        <button onClick={() => { setCurrentTime(timeStart); setPlaying(false); }} title="Inicio"
          className="rounded-lg p-1 text-[#666] hover:text-[#ededed] hover:bg-white/5 transition-all">
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setPlaying(!playing)} title={playing ? "Pausar" : "Reproducir"}
          className="rounded-lg p-1.5 transition-all"
          style={{ background: playing ? "rgba(59,130,246,0.15)" : "transparent", color: playing ? "#60a5fa" : "#888" }}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button onClick={() => { setCurrentTime(null); setPlaying(false); }} title="En vivo"
          className="rounded-lg px-2 py-1 text-[10px] font-bold transition-all"
          style={{
            background: !currentTime ? "rgba(34,197,94,0.15)" : "transparent",
            color: !currentTime ? "#4ade80" : "#666",
            border: !currentTime ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
          }}>
          LIVE
        </button>

        <div className="h-4 w-px mx-1" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Speed */}
        {[1, 2, 4, 8].map((s) => (
          <button key={s} onClick={() => setSpeed(s)}
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold transition-all"
            style={{
              background: speed === s ? "rgba(59,130,246,0.12)" : "transparent",
              color: speed === s ? "#60a5fa" : "#555",
            }}>
            {s}x
          </button>
        ))}

        <div className="h-4 w-px mx-1" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Time range */}
        {[1, 2, 6, 12, 24].map((h) => (
          <button key={h} onClick={() => setHoursBack(h)}
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold transition-all"
            style={{
              background: hoursBack === h ? "rgba(255,255,255,0.06)" : "transparent",
              color: hoursBack === h ? "#ededed" : "#555",
            }}>
            {h}h
          </button>
        ))}

        <div className="flex-1" />

        {/* Current time display */}
        <span className="text-[11px] font-mono" style={{ color: currentTime ? "#60a5fa" : "#4ade80" }}>
          {currentTime
            ? currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
            : "EN VIVO"}
        </span>
      </div>

      {/* Timeline grid */}
      <div className="flex" style={{ maxHeight: "200px", overflow: "hidden" }}>
        {/* Monitor labels */}
        <div className="shrink-0 w-36 overflow-y-auto" style={{ borderRight: "1px solid rgba(255,255,255,0.04)" }}>
          {activeMonitors.map((mon, i) => {
            const status = currentTime
              ? getStatusAtTime(mon.id, currentTime)
              : mon.status ?? 2;
            const color = STATUS_COLORS[status] || "#6b7280";
            return (
              <div
                key={mon.id}
                className="flex items-center gap-1.5 px-2 truncate"
                style={{
                  height: 20,
                  background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                }}
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                <span className="text-[9px] text-[#999] truncate font-medium">{mon.name}</span>
              </div>
            );
          })}
        </div>

        {/* Canvas timeline */}
        <div className="flex-1 overflow-y-auto cursor-crosshair">
          <canvas
            ref={canvasRef}
            width={600}
            className="w-full"
            onClick={handleCanvasClick}
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      </div>

      {/* Time axis */}
      <div className="flex items-center px-2 py-1 ml-36" style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
        {Array.from({ length: 7 }, (_, i) => {
          const t = new Date(timeStart.getTime() + (i / 6) * (timeEnd.getTime() - timeStart.getTime()));
          return (
            <span key={i} className="flex-1 text-[8px] text-[#555] font-mono text-center">
              {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          );
        })}
      </div>
    </div>
  );
}
