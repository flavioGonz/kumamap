import { NextRequest, NextResponse } from "next/server";
import { discoverNutUps } from "@/lib/nut-client";

/**
 * POST /api/ups/discover-nut
 * Body: { host, port?, user?, password? }
 *
 * Lists the UPS names a NUT server (`upsd`) exposes, so the config modal can
 * offer a dropdown instead of making the operator type the ups.conf section name
 * from memory.
 *
 * Authenticated-only: it takes credentials and probes an arbitrary host.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-kumamap-auth") !== "1") {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  try {
    const { host, port, user, password } = await req.json();
    if (!host || typeof host !== "string") {
      return NextResponse.json({ ok: false, error: "Falta 'host'" }, { status: 400 });
    }

    const result = await discoverNutUps({
      host,
      port: port ? Number(port) : undefined,
      username: user || undefined,
      password: password || undefined,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error consultando el servidor NUT" },
      { status: 500 }
    );
  }
}
