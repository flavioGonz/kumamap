import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/latest
 *
 * Metadatos del agente monitor-ng que se ofrece para descargar desde el login.
 * El instalador se sirve como archivo estatico desde public/downloads/.
 * No hay numeros escritos a mano: la version sale del nombre del archivo y el
 * tamano del propio archivo en disco.
 */
const DIR = path.join(process.cwd(), "public", "downloads");
const RX = /^monitor-ng-setup-(\d+\.\d+\.\d+)\.exe$/i;

export async function GET() {
  try {
    if (!fs.existsSync(DIR)) {
      return NextResponse.json({ available: false, reason: "sin instalador publicado" });
    }
    const candidates = fs
      .readdirSync(DIR)
      .map((f) => ({ file: f, m: RX.exec(f) }))
      .filter((x): x is { file: string; m: RegExpExecArray } => x.m !== null)
      .map((x) => ({ file: x.file, version: x.m[1] }));

    if (candidates.length === 0) {
      return NextResponse.json({ available: false, reason: "sin instalador publicado" });
    }

    // Mayor version primero (comparacion numerica por segmento)
    candidates.sort((a, b) => {
      const pa = a.version.split(".").map(Number);
      const pb = b.version.split(".").map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
      return 0;
    });

    const latest = candidates[0];
    const stat = fs.statSync(path.join(DIR, latest.file));
    return NextResponse.json({
      available: true,
      version: latest.version,
      file: latest.file,
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
      url: "/downloads/" + latest.file,
      platform: "Windows x64",
    });
  } catch (e) {
    return NextResponse.json(
      { available: false, reason: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
