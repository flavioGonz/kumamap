/**
 * Reporte mensual por cliente (N2) — datos.
 *
 * GET sin parámetros: qué clientes y qué meses hay para informar.
 * GET ?mapId=&anio=&mes=: el reporte completo de ese cliente y ese mes.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  armarReporte, mesAnterior, monitoresPorMapa, catalogoMonitores, mesesDisponibles,
  resumenMensual,
} from "@/lib/reporte-mensual";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const sp = req.nextUrl.searchParams;
    const mapId = sp.get("mapId");

    if (!mapId) {
      const hoy = mesAnterior();
      const anio = Number(sp.get("anio")) || hoy.anio;
      const mes = Number(sp.get("mes")) || hoy.mes;
      const { rango, clientes } = await resumenMensual(anio, mes);
      return NextResponse.json({
        clientes, rango, meses: await mesesDisponibles(), sugerido: hoy,
      });
    }

    const mapa = monitoresPorMapa().find((x) => x.id === mapId);
    if (!mapa) return NextResponse.json({ error: "No existe ese cliente" }, { status: 404 });

    const hoy = mesAnterior();
    const anio = Number(sp.get("anio")) || hoy.anio;
    const mes = Number(sp.get("mes")) || hoy.mes;
    if (mes < 1 || mes > 12 || anio < 2000 || anio > 2999) {
      return NextResponse.json({ error: "Mes fuera de rango" }, { status: 400 });
    }

    return NextResponse.json(await armarReporte(mapa, catalogoMonitores(), anio, mes));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
