"use client";

import { useEffect, useRef, useState } from "react";

interface MapClockProps {
  timeMachineTime: Date | null;
  timeMachineOpen: boolean;
}

export default function MapClock({ timeMachineTime, timeMachineOpen }: MapClockProps) {
  const [now, setNow] = useState(new Date());
  const [flash, setFlash] = useState(false);
  const prevTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Flash effect when time jumps (time travel!)
  useEffect(() => {
    if (timeMachineTime && prevTimeRef.current) {
      const diff = Math.abs(timeMachineTime.getTime() - prevTimeRef.current.getTime());
      if (diff > 60000) { // Jump > 1 min
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
    }
    prevTimeRef.current = timeMachineTime;
  }, [timeMachineTime]);

  const displayTime = timeMachineTime || now;
  const isHistorical = !!timeMachineTime;
  const hrs = displayTime.getHours().toString().padStart(2, "0");
  const min = displayTime.getMinutes().toString().padStart(2, "0");
  const sec = displayTime.getSeconds().toString().padStart(2, "0");
  const dateStr = displayTime.toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div
      className="absolute z-[10000] flex flex-col items-center transition-all duration-500"
      style={{
        bottom: 44,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
      }}
    >
      {/* Time Machine badge */}
      {isHistorical && (
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-0.5 mb-1 transition-all duration-300"
          style={{
            background: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.3)",
            boxShadow: "0 0 20px rgba(59,130,246,0.2)",
          }}
        >
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" style={{ boxShadow: "0 0 8px #60a5fa" }} />
          <span className="text-[9px] font-black text-blue-400 uppercase tracking-[0.15em]">TIME MACHINE</span>
        </div>
      )}

      {/* Clock */}
      <div
        className="rounded-2xl px-4 py-1.5 transition-all duration-500"
        style={{
          background: isHistorical
            ? "rgba(10,10,20,0.85)"
            : "rgba(10,10,10,0.6)",
          border: `1px solid ${isHistorical ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)"}`,
          backdropFilter: "blur(20px)",
          boxShadow: flash
            ? "0 0 60px rgba(96,165,250,0.6), 0 0 120px rgba(96,165,250,0.3)"
            : isHistorical
              ? "0 4px 30px rgba(59,130,246,0.15), 0 0 60px rgba(59,130,246,0.08)"
              : "0 4px 20px rgba(0,0,0,0.3)",
          transform: flash ? "scale(1.15)" : "scale(1)",
        }}
      >
        <div className="flex items-baseline gap-1 justify-center">
          <span
            className="font-mono font-black tracking-tight transition-all duration-300"
            style={{
              fontSize: isHistorical ? 28 : 18,
              color: isHistorical ? "#ffffff" : "#ededed",
              textShadow: isHistorical
                ? "0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(96,165,250,0.4)"
                : "0 1px 4px rgba(0,0,0,0.5)",
              letterSpacing: "0.02em",
            }}
          >
            {hrs}<span style={{ opacity: 0.5 }}>:</span>{min}
          </span>
          <span
            className="font-mono font-bold transition-all duration-300"
            style={{
              fontSize: isHistorical ? 16 : 12,
              color: isHistorical ? "rgba(255,255,255,0.5)" : "#555",
              textShadow: isHistorical ? "0 0 8px rgba(255,255,255,0.2)" : "none",
            }}
          >
            :{sec}
          </span>
        </div>
        <div
          className="text-center transition-all duration-300"
          style={{
            fontSize: isHistorical ? 10 : 9,
            color: isHistorical ? "rgba(96,165,250,0.6)" : "#444",
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginTop: -2,
          }}
        >
          {dateStr}
        </div>
      </div>
    </div>
  );
}
