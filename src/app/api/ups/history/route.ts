import { NextRequest, NextResponse } from "next/server";
import { getUpsHistory } from "@/lib/ups-monitor";

/**
 * UPS history.
 *
 * BEFORE: history was an in-memory ring buffer that the *browser* filled by
 * POSTing every reading it happened to take. Consequences: history only existed
 * while somebody had the panel open, it was wiped on every restart, and any
 * client could inject arbitrary datapoints.
 *
 * NOW: the server-side monitor (lib/ups-monitor.ts) polls every UPS every 30s and
 * writes to the `ups_history` SQLite table. This route is read-only; the POST
 * ingest endpoint is gone.
 *
 * GET /api/ups/history?nodeId=<node>&hours=24
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get("nodeId");

  if (!nodeId) {
    return NextResponse.json(
      { error: "nodeId requerido (el historial ahora se indexa por nodo, no por IP)" },
      { status: 400 }
    );
  }

  const hours = Math.min(Math.max(Number(searchParams.get("hours") || 24), 1), 24 * 7);
  const points = getUpsHistory(nodeId, hours);

  return NextResponse.json({ nodeId, hours, count: points.length, points });
}
