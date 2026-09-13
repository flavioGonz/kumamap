import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { registrarDestino, bajaDestino, contarDestinos } from "@/lib/avisos";

export const dynamic = "force-dynamic";

/**
 * Alta y baja de un dispositivo para recibir avisos.
 *
 * Sigue siendo accesible sin sesión, porque quien se suscribe es el navegador
 * del móvil o el quiosco. Pero si HAY sesión se guarda de quién es: eso es lo
 * que después permite entender la lista en /avisos, donde si no se veria una
 * hilera de endpoints anónimos.
 *
 * `mapas` es la novedad de K3: los clientes que ese dispositivo quiere seguir.
 * Vacío significa todos, que es lo que recibían todos antes.
 */
export async function POST(req: NextRequest) {
  try {
    const cuerpo = await req.json();
    const sub = cuerpo?.subscription || cuerpo;
    if (!sub?.endpoint) {
      return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
    }
    const sesion = requireAuth(req);
    const usuario = typeof sesion === "string" ? sesion : "";

    registrarDestino(sub, {
      usuario,
      mapas: Array.isArray(cuerpo?.mapas) ? cuerpo.mapas.map(String) : [],
      etiqueta: String(cuerpo?.etiqueta || "").slice(0, 80),
    });
    return NextResponse.json({ ok: true, total: contarDestinos() });
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
}

/** DELETE /api/push — body: { endpoint } */
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    bajaDestino(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
}

/** GET /api/push — la clave pública y cuántos dispositivos hay registrados. */
export async function GET() {
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    subscriptions: contarDestinos(),
  });
}
