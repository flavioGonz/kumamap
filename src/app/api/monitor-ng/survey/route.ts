import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdoptedDevice, listAdoptedDevices } from "@/lib/monitorng";
import { getSurvey, listSurveys } from "@/lib/monitorng-jobs";

export const dynamic = "force-dynamic";

/**
 * Relevamiento que el agente hace del servidor donde esta instalado.
 * GET ?deviceId=12345  -> el de ese servidor
 * GET                  -> todos, con el nombre del equipo resuelto
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    if (deviceId) {
      const d = getAdoptedDevice(deviceId);
      if (!d) return NextResponse.json({ error: "dispositivo no encontrado o sin adoptar" }, { status: 404 });
      return NextResponse.json({ deviceId: d.deviceId, name: d.name, survey: getSurvey(d.node) });
    }
    const porNode = new Map(listAdoptedDevices().map((d) => [d.node, d]));
    const surveys = listSurveys()
      .filter((s) => porNode.has(s.node))
      .map((s) => ({ ...s, deviceId: porNode.get(s.node)!.deviceId, name: porNode.get(s.node)!.name }));
    return NextResponse.json({ surveys });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
