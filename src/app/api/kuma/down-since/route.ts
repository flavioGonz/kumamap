import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

/**
 * GET /api/kuma/down-since
 *
 * Returns the real start-of-downtime for each monitor that is currently DOWN,
 * queried directly from the Kuma database so timers reflect the actual failure
 * event rather than the last heartbeat check time.
 *
 * Response: { [monitorId: string]: isoTimestamp }
 *
 * Falls back to an empty object if the DB is not configured.
 */
export async function GET() {
  try {
    const kuma = getKumaClient();
    const monitors = kuma.getMonitors();

    // Collect IDs of currently-DOWN monitors
    const downIds = monitors
      .filter((m) => m.status === 0 && m.active)
      .map((m) => m.id);

    if (downIds.length === 0) {
      return NextResponse.json({});
    }

    // Query DB for the real streak start times
    const { fetchDownSinceTimes } = await import("@/lib/kuma-db");
    const sinceMap = await fetchDownSinceTimes(downIds);

    // Convert Map to plain object for JSON serialisation
    const result: Record<number, string> = {};
    sinceMap.forEach((ts, id) => {
      result[id] = ts;
    });

    return NextResponse.json(result);
  } catch (err) {
    // DB might not be configured — return empty object gracefully
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("No database configured")) {
      console.warn("[down-since] DB query failed:", msg);
    }
    return NextResponse.json({});
  }
}
