import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getKumaClient } from "@/lib/kuma";
import type { KumaHeartbeat } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WRAP32 = 4294967296; // 2^32 — los contadores ifInOctets/ifOutOctets (.10/.16) son de 32 bits
const MAX_BPS = 400e9; // descartar saltos absurdos

/** El valor del contador SNMP queda embebido en el msg del heartbeat de Kuma,
 *  p.ej. "JSON query passes (comparing 3088192208 >= 0)". */
function contadorDeMsg(msg: string | undefined): number | null {
  if (!msg) return null;
  const m = msg.match(/comparing\s+(\d+)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function tEpoch(time: any): number | null {
  if (!time) return null;
  const ms = new Date(String(time).replace(" ", "T")).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** De los heartbeats de un monitor de contador → serie de tasa (bps) por muestra. */
function serie(beats: KumaHeartbeat[]): { t: number; bps: number }[] {
  const puntos = beats
    .map((b) => ({ t: tEpoch(b.time), c: contadorDeMsg(b.msg) }))
    .filter((p): p is { t: number; c: number } => p.t !== null && p.c !== null)
    .sort((a, b) => a.t - b.t);

  const out: { t: number; bps: number }[] = [];
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];
    const dt = (b.t - a.t) / 1000; // segundos
    if (dt <= 0 || dt > 3600) continue; // hueco: no interpolamos
    let d = b.c - a.c;
    if (d < 0) d += WRAP32;            // wrap del contador de 32 bits
    if (d < 0 || d > WRAP32) continue; // reset del contador
    const bps = (d * 8) / dt;
    if (bps < 0 || bps > MAX_BPS) continue;
    out.push({ t: b.t, bps: Math.round(bps) });
  }
  return out;
}

/** Historial de tráfico de una ventana: bajada (entrada) y subida (salida).
 *  Body: { inId, outId, hours }. Lee los heartbeats guardados en Uptime Kuma. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const b = await req.json();
    const inId = Number(b?.inId);
    const outId = Number(b?.outId);
    const hours = Number(b?.hours) > 0 && Number(b?.hours) <= 720 ? Number(b.hours) : 24;
    if (!Number.isInteger(inId) || !Number.isInteger(outId)) {
      return NextResponse.json({ error: "Faltan los IDs de los sensores" }, { status: 400 });
    }

    const kuma = getKumaClient();
    const [beatsIn, beatsOut] = await Promise.all([
      kuma.getMonitorBeats(inId, hours),
      kuma.getMonitorBeats(outId, hours),
    ]);

    return NextResponse.json({
      hours,
      entrada: serie(beatsIn),
      salida: serie(beatsOut),
      muestras: { entrada: beatsIn.length, salida: beatsOut.length },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "No se pudo leer el historial" }, { status: 502 });
  }
}
