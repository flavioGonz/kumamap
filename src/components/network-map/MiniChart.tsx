"use client";

import { useEffect, useState, useRef } from "react";

interface MiniChartProps {
  monitorId: number;
  width?: number;
  height?: number;
}

interface HeartbeatPoint {
  status: number;
  ping: number | null;
  time: string;
}

export default function MiniChart({ monitorId, width = 180, height = 50 }: MiniChartProps) {
  const [points, setPoints] = useState<HeartbeatPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let mounted = true;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/kuma/history/${monitorId}`);
        if (!res.ok || !mounted) return;
        setPoints(await res.json());
      } catch {}
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [monitorId]);

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

    // Get ping values
    const pings = points.map((p) => p.ping ?? 0);
    const maxPing = Math.max(...pings, 1);
    const minPing = Math.min(...pings.filter((p) => p > 0), 0);

    const padTop = 8;
    const padBot = 14;
    const chartH = height - padTop - padBot;
    const stepX = width / (points.length - 1);

    // Draw grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      const y = padTop + (chartH / 2) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw status bars (background)
    points.forEach((p, i) => {
      const x = i * stepX;
      ctx.fillStyle = p.status === 1
        ? "rgba(34,197,94,0.08)"
        : p.status === 0
          ? "rgba(239,68,68,0.15)"
          : "rgba(245,158,11,0.08)";
      ctx.fillRect(x - stepX / 2, 0, stepX, height);
    });

    // Draw ping line
    ctx.beginPath();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    points.forEach((p, i) => {
      const x = i * stepX;
      const ping = p.ping ?? 0;
      const y = padTop + chartH - (ping / maxPing) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw fill under line
    const lastX = (points.length - 1) * stepX;
    ctx.lineTo(lastX, padTop + chartH);
    ctx.lineTo(0, padTop + chartH);
    ctx.closePath();
    ctx.fillStyle = "rgba(59,130,246,0.08)";
    ctx.fill();

    // Draw dots for down status
    points.forEach((p, i) => {
      if (p.status === 0) {
        const x = i * stepX;
        ctx.beginPath();
        ctx.arc(x, padTop + chartH / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      }
    });

    // Labels
    ctx.fillStyle = "#737373";
    ctx.font = "8px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(maxPing)}ms`, 2, padTop + 6);
    ctx.fillText(`${Math.round(minPing)}ms`, 2, padTop + chartH - 2);

    // Time labels
    if (points.length > 0) {
      ctx.textAlign = "left";
      const first = new Date(points[0].time);
      ctx.fillText(first.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), 2, height - 2);
      ctx.textAlign = "right";
      const last = new Date(points[points.length - 1].time);
      ctx.fillText(last.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), width - 2, height - 2);
    }
  }, [points, width, height]);

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[9px] text-[#555]"
        style={{ width, height }}
      >
        Recopilando datos...
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded"
    />
  );
}
