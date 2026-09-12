/**
 * Grabadores y sus canales.
 *
 * GET  → la lista completa, con los canales y una referencia firmada por canal
 *        cuando se puede pedir video.
 * PUT  → fija el dialecto RTSP de un grabador (`hikvision` | `dahua`).
 * POST → prueba, desde el servidor, si se llega al grabador.
 *
 * La prueba no acepta una IP del cliente: recibe el id del grabador y usa la IP
 * que está en la base. Si no, esto sería un escáner de puertos de la red interna
 * con la puerta abierta.
 */
import { NextRequest, NextResponse } from "next/server";
import net from "net";
import { requireAuth } from "@/lib/auth";
import { listarGrabadores, guardarPatron, type Patron } from "@/lib/grabadores";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const grabadores = listarGrabadores();
    return NextResponse.json({
      grabadores,
      total: grabadores.length,
      canales: grabadores.reduce((n, g) => n + g.totalCanales, 0),
      reproducibles: grabadores.filter((g) => g.motivo === null).length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { id, patron } = (await req.json()) as { id?: string; patron?: Patron };
    if (!id || (patron !== "hikvision" && patron !== "dahua")) {
      return NextResponse.json({ error: "Falta el grabador o el patrón" }, { status: 400 });
    }
    return guardarPatron(id, patron)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "No se encontró ese grabador" }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

/** Un TCP connect con tiempo límite. Es todo lo que hace falta para saber si hay ruta. */
function tocarPuerto(host: string, puerto: number, ms = 4000): Promise<{ abierto: boolean; codigo: string; ms: number }> {
  return new Promise((resolve) => {
    const arranque = Date.now();
    const s = net.connect({ host, port: puerto });
    const cerrar = (abierto: boolean, codigo: string) => {
      try { s.destroy(); } catch { /* ya estaba cerrado */ }
      resolve({ abierto, codigo, ms: Date.now() - arranque });
    };
    const t = setTimeout(() => cerrar(false, "SIN RESPUESTA"), ms);
    s.on("connect", () => { clearTimeout(t); cerrar(true, "ABIERTO"); });
    s.on("error", (e: any) => { clearTimeout(t); cerrar(false, e?.code || "ERROR"); });
  });
}

export async function POST(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const { id } = (await req.json()) as { id?: string };
    const g = listarGrabadores().find((x) => x.id === id);
    if (!g) return NextResponse.json({ error: "No se encontró ese grabador" }, { status: 404 });
    if (!g.ip) return NextResponse.json({ ok: false, motivo: "sin-ip" });

    const [rtsp, web] = await Promise.all([tocarPuerto(g.ip, 554), tocarPuerto(g.ip, 80)]);
    return NextResponse.json({
      ok: true, ip: g.ip, rtsp, web,
      // Lo importante del diagnóstico: distinguir "no hay ruta" de "no contesta".
      diagnostico: rtsp.abierto
        ? "El grabador contesta en el 554. Si un canal no da imagen, revisá el usuario, la clave o el dialecto RTSP."
        : rtsp.codigo === "EHOSTUNREACH" || rtsp.codigo === "ENETUNREACH"
          ? "El servidor no tiene ruta hacia esa red. Hace falta una VPN o un reenvío de puertos para poder ver estos canales."
          : rtsp.codigo === "ECONNREFUSED"
            ? "Se llega al equipo pero el 554 está cerrado. Puede tener el RTSP deshabilitado o en otro puerto."
            : "No hubo respuesta. El equipo puede estar apagado, con otra IP, o hay un cortafuegos en el medio.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
