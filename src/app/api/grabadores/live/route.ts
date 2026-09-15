/**
 * Detección EN VIVO de un grabador Hikvision.
 *
 * POST { id } → le pregunta al equipo por ISAPI: modelo/MAC/firmware, cada canal
 * con su IP de cámara, resolución, cuadros, códec y si graba, y el estado de los
 * discos con SMART. Sólo con sesión: usa las credenciales guardadas, nunca una IP
 * que venga del cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listarGrabadores, credencialDe } from "@/lib/grabadores";
import { sondearNvr } from "@/lib/nvr-isapi";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { id } = (await req.json()) as { id?: string };
    const g = listarGrabadores().find((x) => x.id === id);
    if (!g) return NextResponse.json({ error: "No se encontró ese grabador" }, { status: 404 });
    if (!g.ip) return NextResponse.json({ alcanzable: false, error: "Sin IP de gestión", discos: [], canales: [] });
    if (g.patron !== "hikvision") {
      return NextResponse.json({ alcanzable: false, error: "La detección en vivo por ISAPI es sólo para Hikvision", discos: [], canales: [] });
    }
    const clave = credencialDe(g.id) || "";
    if (!g.usuario || !clave) {
      return NextResponse.json({ alcanzable: false, error: "Faltan usuario o clave de gestión", discos: [], canales: [] });
    }
    const estado = await sondearNvr(g.ip, g.usuario, clave);
    return NextResponse.json(estado);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
