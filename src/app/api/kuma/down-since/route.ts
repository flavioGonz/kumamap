import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

/**
 * GET /api/kuma/down-since
 *
 * Cuando empezo la caida actual de cada monitor que esta abajo, leido del historial
 * de latidos de Uptime Kuma. Es el unico lugar de donde sale ese dato: el cliente no
 * inventa un arranque, porque un contador que empieza de cero en cada recarga miente.
 *
 * Respuesta: { [monitorId]: isoTimestamp }
 *
 * Si la consulta principal no encuentra la racha (por ejemplo, el latido caido recien
 * se escribio y todavia no quedo del lado correcto del ultimo UP), se cae al ultimo
 * latido registrado del monitor, que es justo el momento en que se cayo.
 */
export async function GET() {
  try {
    const kuma = getKumaClient();
    const monitors = kuma.getMonitors();

    const downIds = monitors.filter((m) => m.status === 0 && m.active).map((m) => m.id);
    if (downIds.length === 0) return NextResponse.json({});

    const { fetchDownSinceTimes, fetchUltimoLatido } = await import("@/lib/kuma-db");
    const sinceMap = await fetchDownSinceTimes(downIds);

    const result: Record<number, string> = {};
    sinceMap.forEach((ts, id) => { result[id] = ts; });

    // Los que quedaron sin respuesta: se resuelven con su ultimo latido, no se
    // dejan al cliente para que los invente.
    const faltan = downIds.filter((id) => !result[id]);
    if (faltan.length) {
      try {
        const ultimos = await fetchUltimoLatido(faltan);
        ultimos.forEach((ts, id) => { result[id] = ts; });
      } catch {
        /* si tampoco se puede, ese monitor simplemente no muestra cartel */
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("No database configured")) {
      console.warn("[down-since] falló la consulta:", msg);
    }
    return NextResponse.json({});
  }
}
