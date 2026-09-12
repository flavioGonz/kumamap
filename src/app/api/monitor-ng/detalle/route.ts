import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdoptedDevice, listAdoptedDevices } from "@/lib/monitorng";
import { getDetalle, respaldosDeTodos } from "@/lib/monitorng-jobs";

export const dynamic = "force-dynamic";

/**
 * Detalle operativo que sube el agente:
 *   ?deviceId=123&tipo=veeam    -> jobs de respaldo de ese servidor
 *   ?deviceId=123&tipo=eventos  -> eventos criticos del visor
 *   ?tipo=veeam                 -> todos los jobs de todos los servidores
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const sp = req.nextUrl.searchParams;
    const tipo = sp.get("tipo") === "eventos" ? "eventos" : "veeam";
    const deviceId = sp.get("deviceId");

    if (deviceId) {
      const d = getAdoptedDevice(deviceId);
      if (!d) return NextResponse.json({ error: "dispositivo no encontrado o sin adoptar" }, { status: 404 });
      return NextResponse.json({ deviceId: d.deviceId, name: d.name, tipo, detalle: getDetalle(d.node, tipo) });
    }

    if (tipo === "veeam") {
      const porNode = new Map(listAdoptedDevices().map((x) => [x.node, x]));
      return NextResponse.json({
        tipo,
        servidores: respaldosDeTodos()
          .filter((r) => porNode.has(r.node))
          .map((r) => ({ ...r, deviceId: porNode.get(r.node)!.deviceId, name: porNode.get(r.node)!.name })),
      });
    }
    return NextResponse.json({ error: "para eventos hace falta deviceId" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
