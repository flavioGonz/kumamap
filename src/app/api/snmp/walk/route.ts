import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { caminar, relevarSensores, hostValido, oidValido, type Version } from "@/lib/snmp-walk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SNMP desde el navegador no existe: el navegador no habla UDP/161. Esta ruta es el
 * puente. Dos modos:
 *   { host, comunidad, version, modo: "sensores" }  -> lista de sensores utiles
 *   { host, comunidad, version, modo: "arbol", oid } -> recorrido crudo de un subarbol
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const b = await req.json();
    const host = String(b?.host || "").trim();
    const comunidad = String(b?.comunidad || "public").trim();
    const version: Version = b?.version === "1" ? "1" : "2c";
    const puerto = Number(b?.puerto) > 0 && Number(b?.puerto) < 65536 ? Number(b.puerto) : 161;

    if (!hostValido(host)) {
      return NextResponse.json({ error: "Host inválido: poné una IP o un nombre, sin http:// ni puerto" }, { status: 400 });
    }
    if (!comunidad || comunidad.length > 64) {
      return NextResponse.json({ error: "Comunidad inválida" }, { status: 400 });
    }

    if (b?.modo === "arbol") {
      const oid = String(b?.oid || "1.3.6.1.2.1.1").trim();
      if (!oidValido(oid)) return NextResponse.json({ error: "OID inválido" }, { status: 400 });
      const filas = await caminar(host, comunidad, version, oid, puerto);
      return NextResponse.json({ modo: "arbol", oid, filas });
    }

    const { equipo, sensores } = await relevarSensores(host, comunidad, version, puerto);
    if (!sensores.length) {
      return NextResponse.json(
        { error: "El equipo no respondió. Revisá la comunidad, que SNMP esté habilitado y que el 161/UDP llegue desde este servidor." },
        { status: 502 }
      );
    }
    return NextResponse.json({ modo: "sensores", equipo, sensores });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "No se pudo consultar el equipo" }, { status: 502 });
  }
}
