/**
 * Los destinatarios de los avisos (K3).
 *
 * GET    → los dispositivos suscriptos y la lista de clientes para elegir.
 * PUT    → cambia a qué clientes escucha un dispositivo, su nombre, o lo apaga.
 * POST   → manda un aviso de prueba a un dispositivo.
 * DELETE → lo da de baja.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import db from "@/lib/db";
import { getKumaClient } from "@/lib/kuma";
import { listarDestinos, actualizarDestino, bajaDestino, probarDestino, mapasDeMonitor } from "@/lib/avisos";

export const dynamic = "force-dynamic";

/** Los mapas que tienen al menos un monitor: son los que sirve elegir. */
function clientesConMonitores() {
  const mapas = db.prepare("SELECT id, name FROM network_maps ORDER BY name").all() as any[];
  const nodos = db.prepare(
    "SELECT map_id, kuma_monitor_id FROM network_map_nodes WHERE kuma_monitor_id IS NOT NULL"
  ).all() as any[];
  const cuenta = new Map<string, number>();
  for (const n of nodos) cuenta.set(n.map_id, (cuenta.get(n.map_id) || 0) + 1);
  return mapas
    .map((m) => ({ id: m.id, nombre: m.name, monitores: cuenta.get(m.id) || 0 }))
    .filter((m) => m.monitores > 0);
}

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    let conectados = 0;
    try { conectados = getKumaClient().getMonitors().length; } catch { /* Kuma puede no estar */ }
    return NextResponse.json({
      destinos: listarDestinos(),
      clientes: clientesConMonitores(),
      monitores: conectados,
      vapid: !!process.env.VAPID_PUBLIC_KEY,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { id, mapas, etiqueta, activo } = (await req.json()) as {
      id?: number; mapas?: string[]; etiqueta?: string; activo?: boolean;
    };
    if (!Number.isFinite(Number(id))) {
      return NextResponse.json({ error: "Falta el dispositivo" }, { status: 400 });
    }
    const ok = actualizarDestino(Number(id), {
      ...(mapas !== undefined ? { mapas: mapas.map(String) } : {}),
      ...(etiqueta !== undefined ? { etiqueta: String(etiqueta).slice(0, 80) } : {}),
      ...(activo !== undefined ? { activo: !!activo } : {}),
    });
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "No se encontró ese dispositivo" }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { id, monitorId } = (await req.json()) as { id?: number; monitorId?: number };

    // Útil para entender por qué un aviso fue o no fue a un lado: a qué clientes
    // pertenece un monitor según los mapas.
    if (monitorId != null) {
      return NextResponse.json({ monitorId, mapas: mapasDeMonitor(Number(monitorId)) });
    }
    if (!Number.isFinite(Number(id))) {
      return NextResponse.json({ error: "Falta el dispositivo" }, { status: 400 });
    }
    const ok = await probarDestino(Number(id));
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "El navegador no aceptó el aviso. Puede haber caducado la suscripción." }, { status: 502 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint");
  const id = Number(url.searchParams.get("id"));
  if (endpoint) {
    return bajaDestino(endpoint)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "No estaba registrado" }, { status: 404 });
  }
  if (Number.isFinite(id)) {
    const d = listarDestinos().find((x) => x.id === id);
    if (d && bajaDestino(d.destino)) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "No se encontró ese dispositivo" }, { status: 404 });
  }
  return NextResponse.json({ error: "Falta el dispositivo" }, { status: 400 });
}
