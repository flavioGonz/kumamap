import { NextRequest, NextResponse } from "next/server";
import { ingestSignedReport } from "@/lib/monitorng";
import {
  guardarSurvey, guardarResultados, jobsParaBajada,
  guardarVersion, estadoActualizacion, actualizacionParaBajada, guardarDetalle,
} from "@/lib/monitorng-jobs";

export const dynamic = "force-dynamic";

/** Origen con el que el agente nos hablo, para armarle la URL de descarga. */
function origenDe(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

/**
 * Push del agente adoptado. Ademas de las metricas, la subida puede traer:
 *   - survey:       relevamiento del servidor (solo cuando cambia)
 *   - jobResults:   resultados de los encargos de la bajada anterior
 *   - agentVersion: que version de agente es
 *   - veeamJobs:    jobs de Veeam con su ultimo resultado
 *   - eventos:      eventos criticos del visor
 *   - updateState:  como le fue con la actualizacion que se llevo
 *
 * Y la BAJADA es el unico canal que tenemos para pedirle algo: el controlador no
 * alcanza al equipo remoto. Le devolvemos los encargos pendientes y, si su version
 * quedo vieja, la actualizacion (con su sha256, que el agente verifica antes de correr).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = req.headers.get("authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    const rec = ingestSignedReport(String(body?.deviceId || ""), bearer, body);

    try {
      if (body?.survey) guardarSurvey(rec.node, body.survey);
      if (body?.jobResults) guardarResultados(rec.node, body.jobResults);
      if (body?.agentVersion) guardarVersion(rec.node, body.agentVersion);
      if (body?.veeamJobs) guardarDetalle(rec.node, "veeam", body.veeamJobs);
      if (body?.eventos) guardarDetalle(rec.node, "eventos", body.eventos);
      if (body?.updateState) estadoActualizacion(rec.node, body.updateState);
    } catch {
      /* nunca romper el reporte de metricas por los canales secundarios */
    }

    let jobs: any[] = [];
    try { jobs = jobsParaBajada(rec.node); } catch { jobs = []; }

    let update: any = null;
    try { update = actualizacionParaBajada(rec.node, origenDe(req)); } catch { update = null; }

    return NextResponse.json({
      ok: true,
      node: rec.node,
      monitorId: rec.monitorId,
      ...(jobs.length ? { jobs } : {}),
      ...(update ? { update } : {}),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
