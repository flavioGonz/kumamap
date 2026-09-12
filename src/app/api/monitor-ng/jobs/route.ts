import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdoptedDevice } from "@/lib/monitorng";
import { encargar, listJobs, getJob, cancelarJob, resumenJobs, JOB_TIPOS } from "@/lib/monitorng-jobs";

export const dynamic = "force-dynamic";

/** Resuelve deviceId -> node, exigiendo que el equipo este adoptado. */
function nodeDe(deviceId: string): string {
  const d = getAdoptedDevice(String(deviceId || ""));
  if (!d) {
    const e: any = new Error("dispositivo no encontrado o sin adoptar");
    e.status = 404;
    throw e;
  }
  return d.node;
}

/**
 * GET /api/monitor-ng/jobs?deviceId=12345      -> encargos de ese servidor
 * GET /api/monitor-ng/jobs?id=j-xxxx           -> detalle de un encargo
 * GET /api/monitor-ng/jobs                     -> ultimos encargos de todos
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const sp = req.nextUrl.searchParams;
    const id = sp.get("id");
    if (id) {
      const job = getJob(id);
      if (!job) return NextResponse.json({ error: "encargo no encontrado" }, { status: 404 });
      return NextResponse.json({ job });
    }
    const deviceId = sp.get("deviceId");
    if (deviceId) {
      const node = nodeDe(deviceId);
      return NextResponse.json({ tipos: JOB_TIPOS, resumen: resumenJobs(node), jobs: listJobs(node) });
    }
    return NextResponse.json({ tipos: JOB_TIPOS, jobs: listJobs(undefined, 60) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}

/**
 * POST /api/monitor-ng/jobs
 *   { deviceId, tipo: "scan", rango: "192.168.1.0/24", puertos: [80,443] }
 *   { deviceId, tipo: "ping", destino: "8.8.8.8" }
 *   { deviceId, action: "cancel", id: "j-xxxx" }
 *
 * Solo deja el encargo en la cola. Lo ejecuta el agente cuando lo levanta.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    if (String(body?.action || "") === "cancel") {
      return NextResponse.json(cancelarJob(String(body?.id || "")));
    }
    const node = nodeDe(body?.deviceId);
    const job = encargar(node, body, typeof auth === "string" ? auth : "");
    return NextResponse.json({ ok: true, job });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
