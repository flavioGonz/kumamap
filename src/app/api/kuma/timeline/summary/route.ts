import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const kuma = getKumaClient();
  const monitors = kuma.getMonitors();

  const monitorIdsParam = req.nextUrl.searchParams.get("monitorIds");
  const filterSet = monitorIdsParam
    ? new Set(monitorIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0))
    : null;

  const activeMonitorIds = monitors
    .filter((m) => m.active && m.type !== "group" && (!filterSet || filterSet.has(m.id)))
    .map((m) => m.id);

  let badDates: string[] = [];

  try {
    const { fetchBadDatesFromDb } = await import("@/lib/kuma-db");
    if (activeMonitorIds.length > 0) {
      badDates = await fetchBadDatesFromDb(activeMonitorIds);
    }
  } catch (error) {
    // DB not configured or unavailable — return empty calendar (non-fatal)
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("No database configured")) {
      console.warn("[Timeline/summary] DB fetch failed:", msg);
    }
  }

  return NextResponse.json({
    badDates
  });
}
