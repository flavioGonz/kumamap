import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hostValido, type Version } from "@/lib/snmp-walk";
import { tasaInterfaz } from "@/lib/snmp-live";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Tasa de trafico en vivo de una interfaz, por SNMP directo. La usa la ventana
 * de trafico para moverse al segundo (el historial de Kuma da un punto por
 * intervalo del monitor; esto lee el equipo cada vez).
 *   { host, community, version, ifIndex, port }
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const b = await req.json();
    const host = String(b?.host || "").trim();
    const comunidad = String(b?.community || b?.comunidad || "public").trim();
    const version: Version = b?.version === "1" ? "1" : "2c";
    const ifIndex = String(b?.ifIndex || "").trim();
    const puerto = Number(b?.port) > 0 && Number(b?.port) < 65536 ? Number(b.port) : 161;

    if (!hostValido(host)) {
      return NextResponse.json({ error: "Host inválido" }, { status: 400 });
    }
    if (!/^\d+$/.test(ifIndex)) {
      return NextResponse.json({ error: "ifIndex inválido" }, { status: 400 });
    }

    const tasa = await tasaInterfaz(host, comunidad, version, ifIndex, puerto);
    return NextResponse.json(tasa);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "No se pudo leer la interfaz" }, { status: 502 });
  }
}
