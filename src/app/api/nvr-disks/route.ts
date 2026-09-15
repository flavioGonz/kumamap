/**
 * Salud de discos de los grabadores (SMART).
 *
 * GET  → última lectura guardada de cada grabador + configuración de la tarea diaria.
 * PUT  → guarda la configuración de la tarea (habilitado / hora / soloProblemas).
 * POST → corre el escaneo ahora mismo y devuelve el resultado.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { nvrDisksDb, settingsDb } from "@/lib/db";
import { getConfig, setConfig, escanearDiscos } from "@/lib/nvr-disk-scan";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  const filas = nvrDisksDb.getAll().map((r) => ({
    grabadorId: r.grabador_id,
    etiqueta: r.etiqueta,
    ip: r.ip,
    ts: r.ts,
    alcanzable: !!r.alcanzable,
    peor: r.peor_salud,
    discos: r.discos_json ? JSON.parse(r.discos_json) : [],
    kumaMonitorId: r.kuma_monitor_id,
  }));
  const ultimo = settingsDb.get("nvrDisks.lastScanTs");
  return NextResponse.json({ config: getConfig(), grabadores: filas, ultimoScan: ultimo ? Number(ultimo) : null });
}

export async function PUT(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const body = await req.json();
    return NextResponse.json({ ok: true, config: setConfig(body || {}) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const resultados = await escanearDiscos();
    return NextResponse.json({ ok: true, ts: Date.now(), resultados });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
