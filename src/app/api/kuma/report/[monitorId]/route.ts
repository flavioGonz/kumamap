import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  const { monitorId } = await params;
  const mid = parseInt(monitorId);
  const hours = parseInt(req.nextUrl.searchParams.get("hours") || "24");
  const kuma = getKumaClient();
  const monitor = kuma.getMonitor(mid);

  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  // Get full heartbeat history
  const beats = await kuma.getMonitorBeats(mid, Math.min(hours, 720)); // max 30 days

  // Helper: detect if a heartbeat message indicates a real failure even if status=1
  const isMsgFailure = (msg: string | undefined) =>
    /connection failed|timeout|timed out|refused|unreachable|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg || "");

  // Calculate stats — count msg-failures as effective downs
  const totalBeats = beats.length;
  const effectiveDownBeats = beats.filter(b => b.status === 0 || (b.status === 1 && isMsgFailure(b.msg))).length;
  const upBeats = totalBeats - effectiveDownBeats;
  const downBeats = effectiveDownBeats;
  const uptime = totalBeats > 0 ? (upBeats / totalBeats * 100) : 0;
  const avgPing = beats.filter(b => b.ping != null).reduce((sum, b) => sum + (b.ping || 0), 0) / (beats.filter(b => b.ping != null).length || 1);
  const maxPing = Math.max(...beats.filter(b => b.ping != null).map(b => b.ping || 0), 0);
  const minPing = Math.min(...beats.filter(b => b.ping != null && b.ping > 0).map(b => b.ping || 0), Infinity);

  // Extract events (status changes)
  const events: Array<{
    time: string;
    status: number;
    prevStatus: number;
    msg: string;
    ping: number | null;
    duration: number;
  }> = [];

  // Use effective status: status=0 OR (status=1 but msg indicates failure) → treat as DOWN (0)
  const effectiveStatus = (b: typeof beats[0]) =>
    b.status === 0 || (b.status === 1 && isMsgFailure(b.msg)) ? 0 : b.status;

  for (let i = 1; i < beats.length; i++) {
    const curEff = effectiveStatus(beats[i]);
    const prevEff = effectiveStatus(beats[i - 1]);
    if (curEff !== prevEff) {
      events.push({
        time: beats[i].time,
        status: curEff,
        prevStatus: prevEff,
        msg: beats[i].msg,
        ping: beats[i].ping,
        duration: beats[i].duration,
      });
    }
  }

  // Group events by day
  const eventsByDay: Record<string, typeof events> = {};
  for (const evt of events) {
    const day = new Date(evt.time).toLocaleDateString("es-UY");
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(evt);
  }

  // Downtime periods
  const downtimes: Array<{ start: string; end: string; durationMs: number; msg: string }> = [];
  let downStart: string | null = null;
  let downMsg = "";
  for (const beat of beats) {
    const eff = effectiveStatus(beat);
    if (eff === 0 && !downStart) {
      downStart = beat.time;
      downMsg = beat.msg;
    } else if (eff !== 0 && downStart) {
      const durationMs = new Date(beat.time).getTime() - new Date(downStart).getTime();
      downtimes.push({ start: downStart, end: beat.time, durationMs, msg: downMsg });
      downStart = null;
    }
  }
  // If still down
  if (downStart) {
    downtimes.push({ start: downStart, end: new Date().toISOString(), durationMs: Date.now() - new Date(downStart).getTime(), msg: downMsg });
  }

  return NextResponse.json({
    monitor: {
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      url: monitor.url || monitor.hostname,
      status: monitor.status,
      tags: monitor.tags,
    },
    period: {
      hours,
      from: beats.length > 0 ? beats[0].time : null,
      to: beats.length > 0 ? beats[beats.length - 1].time : null,
    },
    stats: {
      totalChecks: totalBeats,
      upChecks: upBeats,
      downChecks: downBeats,
      uptimePercent: Math.round(uptime * 100) / 100,
      avgPing: Math.round(avgPing * 100) / 100,
      maxPing: maxPing === -Infinity ? 0 : maxPing,
      minPing: minPing === Infinity ? 0 : minPing,
    },
    events,
    eventsByDay,
    downtimes,
    totalDowntimeMs: downtimes.reduce((sum, d) => sum + d.durationMs, 0),
  });
}
