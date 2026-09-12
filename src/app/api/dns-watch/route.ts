import { NextResponse } from "next/server";
import { estadoDns } from "@/lib/dns-watch";

export const dynamic = "force-dynamic";

/**
 * Estado de los resolvers DNS publicos, medido desde este controlador.
 * Es publico a proposito: lo consume la pantalla de login, antes de autenticar.
 * No expone nada del cliente — son IPs publicas de internet y su latencia.
 */
export async function GET() {
  return NextResponse.json(estadoDns(), {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
