import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const kuma = getKumaClient();
  const monitors = kuma.getMonitors();

  // Support both "hours" (relative) and "from"/"to" (absolute) range
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  let hours: number;
  if (fromParam && toParam) {
    const fromMs = new Date(fromParam).getTime();
    const toMs = new Date(toParam).getTime();
    hours = Math.ceil((toMs - fromMs) / 3600000);
    if (hours <= 0) hours = 24;
  } else {
    hours = parseInt(req.nextUrl.searchParams.get("hours") || "24");
  }

  // Optional: filter to specific monitor IDs (from map nodes)
  const monitorIdsParam = req.nextUrl.searchParams.get("monitorIds");
  const filterSet = monitorIdsParam
    ? new Set(monitorIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0))
    : null;

  // Get real historical beats from Kuma DB (cached 5min)
  const activeMonitorIds = monitors
    .filter((m) => m.active && m.type !== "group" && (!filterSet || filterSet.has(m.id)))
    .map((m) => m.id);

  // Optimize: Use direct MySQL query if available, fallback to Socket.IO
  let allBeatsMap: Map<number, any[]> = new Map();
  
  try {
    const { fetchHeartbeatsFromDb } = await import("@/lib/kuma-db");
    const beatsArray = await fetchHeartbeatsFromDb(activeMonitorIds, Math.min(hours, 2160)); // Up to 90 days via MySQL
    
    // Group by monitorId
    for (const b of beatsArray) {
      if (!allBeatsMap.has(b.monitorID)) allBeatsMap.set(b.monitorID, []);
      allBeatsMap.get(b.monitorID)!.push(b);
    }
  } catch (error) {
    console.warn("[Timeline] MySQL direct fetch failed, falling back to Kuma API:", error);
    allBeatsMap = await kuma.getAllBeats(activeMonitorIds, Math.min(hours, 720));
  }

  const events: Array<{
    monitorId: number;
    monitorName: string;
    time: string;
    status: number;
    prevStatus: number;
    ping: number | null;
    msg: string;
  }> = [];

  for (const [monitorId, beats] of allBeatsMap) {
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

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const statusChanges: Record<number, Array<{ t: number; s: number }>> = {};
  for (const [monitorId, beats] of allBeatsMap) {
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
      .filter((m) => m.active && m.type !== "group" && (!filterSet || filterSet.has(m.id)))
      .map((m) => ({ id: m.id, name: m.name, type: m.type, status: m.status, parent: m.parent })),
  });
}
