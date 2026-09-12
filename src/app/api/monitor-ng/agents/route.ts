import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listAdoptedDevices } from "@/lib/monitorng";
import { listAgentes, reintentarActualizacion } from "@/lib/monitorng-jobs";

export const dynamic = "force-dynamic";

/** Que version de agente tiene cada servidor y cual es la ultima publicada. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { ultima, agentes } = listAgentes();
    const porNode = new Map(listAdoptedDevices().map((d) => [d.node, d]));
    return NextResponse.json({
      ultima,
      agentes: agentes
        .filter((a) => porNode.has(a.node))
        .map((a) => ({ ...a, deviceId: porNode.get(a.node)!.deviceId, name: porNode.get(a.node)!.name })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}

/** Reintentar una actualizacion que quedo marcada como fallida. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    if (String(body?.action || "") !== "retry-update") {
      return NextResponse.json({ error: "accion desconocida" }, { status: 400 });
    }
    const d = listAdoptedDevices().find((x) => x.deviceId === String(body?.deviceId || ""));
    if (!d) return NextResponse.json({ error: "dispositivo no encontrado" }, { status: 404 });
    return NextResponse.json(reintentarActualizacion(d.node));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
