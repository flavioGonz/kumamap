import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET() {
  const kuma = getKumaClient();
  const monitors = kuma.getMonitors();

  // Build timeline: for each monitor, get heartbeat history
  const timeline: Record<number, Array<{ time: string; status: number; ping: number | null }>> = {};

  for (const m of monitors) {
    const history = kuma.getHistory(m.id);
    timeline[m.id] = history.map((h) => ({
      time: h.time,
      status: h.status,
      ping: h.ping,
    }));
  }

  return NextResponse.json({
    connected: kuma.isConnected,
    monitors: monitors.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      status: m.status,
      parent: m.parent,
    })),
    timeline,
  });
}
