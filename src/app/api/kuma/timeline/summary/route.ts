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
    .filter((m) => m.type !== "group" && (!filterSet || filterSet.has(m.id)))
    .map((m) => m.id);

  let dias: Array<{ fecha: string; caidas: number; minutos: number }> = [];
  let umbralMin = 2;

  try {
    const { fetchBadDatesFromDb, umbralCaidaMinutos } = await import("@/lib/kuma-db");
    umbralMin = umbralCaidaMinutos();
    if (activeMonitorIds.length > 0) {
      dias = await fetchBadDatesFromDb(activeMonitorIds);
    }
  } catch (error) {
    // DB not configured or unavailable — return empty calendar (non-fatal)
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("No database configured")) {
      console.warn("[Timeline/summary] DB fetch failed:", msg);
    }
  }

  return NextResponse.json({
    // badDates se mantiene por compatibilidad; dias trae ademas la severidad
    // para que el calendario pueda graduar el color en vez de pintar si/no.
    badDates: dias.map((d) => d.fecha),
    dias,
    umbralMin,
  });
}
