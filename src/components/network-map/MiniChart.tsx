"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import { safeFetch } from "@/lib/error-handler";

interface MiniChartProps {
  monitorId: number;
  width?: number;
  height?: number;
  showStats?: boolean;
  showTimeline?: boolean;
}

interface HeartbeatPoint {
  status: number;
  ping: number | null;
  time: string;
  msg?: string;
}

export default function MiniChart({
  monitorId,
  width = 220,
  height = 60,
  showStats = true,
  showTimeline = true,
}: MiniChartProps) {
  const [points, setPoints] = useState<HeartbeatPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let mounted = true;
    const fetchHistory = async () => {
      const data = await safeFetch<HeartbeatPoint[]>(apiUrl(`/api/kuma/history/${monitorId}`));
      if (data && mounted) setPoints(data);
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 8000);
    return () => { mounted = false; clearInterval(interval); };
  }, [monitorId]);

  // Computed stats
  const stats = useMemo(() => {
    const pings = points.filter((p) => p.ping != null && p.ping > 0).map((p) => p.ping!);
    if (pings.length === 0) return null;
    const avg = pings.reduce((a, b) => a + b, 0) / pings.length;
    const max = Math.max(...pings);
    const min = Math.min(...pings);
    const jitter = pings.length > 1
      ? pings.slice(1).reduce((sum, p, i) => sum + Math.abs(p - pings[i]), 0) / (pings.length - 1)
      : 0;
    const upCount = points.filter((p) => p.status === 1).length;
    const availability = points.length > 0 ? (upCount / points.length) * 100 : 0;
    return { avg, max, min, jitter, availability, total: points.length };
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pings = points.map((p) => p.ping ?? 0);
    const maxPing = Math.max(...pings, 1) * 1.1; // 10% headroom

    const padTop = 4;
    const padBot = showTimeline ? 10 : 4;
    const chartH = height - padTop - padBot;
    const stepX = width / (points.length - 1);

    // Status timeline bar at bottom
    if (showTimeline) {
      const barH = 4;
      const barY = height - barH;
      points.forEach((p, i) => {
        const x = i * stepX;
        ctx.fillStyle =
          p.status === 1 ? "#22c55e" :
          p.status === 0 ? "#ef4444" :
          p.status === 3 ? "#8b5cf6" : "#f59e0b";
        ctx.fillRect(x, barY, Math.max(stepX, 1.5), barH);
      });
    }

    // Grid — subtle dashed
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 2; i++) {
      const y = padTop + (chartH / 2) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Build path points
    const pathPoints = points.map((p, i) => {
      const x = i * stepX;
      const ping = p.ping ?? 0;
      const y = padTop + chartH - (ping / maxPing) * chartH;
      return { x, y, status: p.status };
    });

    // Area fill with gradient
    const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    gradient.addColorStop(0, "rgba(59,130,246,0.15)");
    gradient.addColorStop(1, "rgba(59,130,246,0.01)");

    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 1; i < pathPoints.length; i++) {
      // Smooth curve using bezier
      const prev = pathPoints[i - 1];
      const curr = pathPoints[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    const lastPt = pathPoints[pathPoints.length - 1];
    ctx.lineTo(lastPt.x, padTop + chartH);
    ctx.lineTo(pathPoints[0].x, padTop + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main line
    ctx.beginPath();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 1; i < pathPoints.length; i++) {
      const prev = pathPoints[i - 1];
      const curr = pathPoints[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    ctx.stroke();

    // Down markers
    pathPoints.forEach((pt) => {
      if (pt.status === 0) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.strokeStyle = "#ef444488";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // Current value dot (last point)
    const last = pathPoints[pathPoints.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = last.status === 1 ? "#22c55e" : last.status === 0 ? "#ef4444" : "#f59e0b";
    ctx.fill();

    // Ping scale labels
    ctx.fillStyle = "#555";
    ctx.font = "7px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(maxPing / 1.1)}`, width - 2, padTop + 7);
    ctx.fillText("0", width - 2, padTop + chartH - 1);

  }, [points, width, height, showTimeline]);

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[9px] text-[#555]"
        style={{ width, height: height + (showStats ? 40 : 0) }}
      >
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Recopilando datos...
        </div>
      </div>
    );
  }

  return (
    <div style={{ width }}>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        className="rounded-md"
      />
      {/* Stats row */}
      {showStats && stats && (
        <div className="grid grid-cols-4 gap-1 mt-1.5">
          <StatBadge label="AVG" value={`${Math.round(stats.avg)}ms`} color="#3b82f6" />
          <StatBadge label="MIN" value={`${Math.round(stats.min)}ms`} color="#22c55e" />
          <StatBadge label="MAX" value={`${Math.round(stats.max)}ms`} color="#f59e0b" />
          <StatBadge label="JITTER" value={`${Math.round(stats.jitter)}ms`} color="#8b5cf6" />
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-md px-1 py-[2px] text-center"
      style={{
        background: `${color}11`,
        border: `1px solid ${color}22`,
      }}
    >
      <div className="text-[7px] font-bold uppercase tracking-wider" style={{ color: `${color}88` }}>
        {label}
      </div>
      <div className="text-[9px] font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
