import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const kuma = getKumaClient();
  const monitors = kuma.getMonitors();
  const hours = parseInt(req.nextUrl.searchParams.get("hours") || "24");

  // Get real historical beats from Kuma DB (cached 5min)
  const activeMonitorIds = monitors
    .filter((m) => m.active && m.type !== "group")
    .map((m) => m.id);

  const allBeats = await kuma.getAllBeats(activeMonitorIds, Math.min(hours, 168)); // max 7 days

  // Compress timeline: only send status changes (events), not every heartbeat
  // This dramatically reduces payload size
  const events: Array<{
    monitorId: number;
    monitorName: string;
    time: string;
    status: number;
    prevStatus: number;
    ping: number | null;
    msg: string;
  }> = [];

  for (const [monitorId, beats] of allBeats) {
    const mon = monitors.find((m) => m.id === monitorId);
    if (!mon || beats.length === 0) continue;

    let prevStatus = beats[0].status;
    for (let i = 1; i < beats.length; i++) {
      if (beats[i].status !== prevStatus) {
        events.push({
          monitorId,
          monitorName: mon.name,
          time: beats[i].time,
          status: beats[i].status,
          prevStatus,
          ping: beats[i].ping,
          msg: beats[i].msg,
        });
        prevStatus = beats[i].status;
      }
    }
  }

  // Sort events by time
  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Also build a compact status-at-time map for scrubbing
  // For each monitor: array of { time, status } at each change point
  const statusChanges: Record<number, Array<{ t: number; s: number }>> = {};
  for (const [monitorId, beats] of allBeats) {
    if (beats.length === 0) continue;
    const changes: Array<{ t: number; s: number }> = [
      { t: new Date(beats[0].time).getTime(), s: beats[0].status },
    ];
    let prev = beats[0].status;
    for (let i = 1; i < beats.length; i++) {
      if (beats[i].status !== prev) {
        changes.push({ t: new Date(beats[i].time).getTime(), s: beats[i].status });
        prev = beats[i].status;
      }
    }
    statusChanges[monitorId] = changes;
  }

  return NextResponse.json({
    connected: kuma.isConnected,
    hours,
    events,
    statusChanges,
    monitors: monitors
      .filter((m) => m.active && m.type !== "group")
      .map((m) => ({ id: m.id, name: m.name, type: m.type, status: m.status, parent: m.parent })),
  });
}
