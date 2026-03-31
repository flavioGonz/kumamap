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
    const { getKumaDb } = await import("@/lib/kuma-db");
    const db = getKumaDb();
    
    if (activeMonitorIds.length > 0) {
      // Get distinct dates with status = 0 (DOWN) in the last 90 days
      const query = `
        SELECT DISTINCT DATE(time) as eventDate 
        FROM heartbeat 
        WHERE monitor_id IN (?) 
        AND status = 0
        AND time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      `;
      const [rows] = await db.query(query, [activeMonitorIds]);
      badDates = (rows as any[]).map(r => {
        // mysql2 might return Date objects or strings depending on timezone configuration
        const d = new Date(r.eventDate);
        return d.toISOString().split('T')[0];
      });
    }
  } catch (error) {
    console.warn("[Timeline] MySQL summary fetch failed:", error);
    // Fallback: we cannot easily do this via Kuma API efficiently for 90 days.
    // So we just return empty if DB is unavailable.
  }

  return NextResponse.json({
    badDates
  });
}
