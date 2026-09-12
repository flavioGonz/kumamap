/**
 * El instalador de monitor-ng que estamos publicando.
 *
 * No hay numeros escritos a mano en ningun lado: la version sale del nombre del
 * archivo en public/downloads/. El sha256 se calcula una sola vez y se cachea por
 * (archivo, tamano, mtime) — son ~80 MB y lo pide cada agente en cada push.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DIR = path.join(process.cwd(), "public", "downloads");
const RX = /^monitor-ng-setup-(\d+\.\d+\.\d+)\.exe$/i;

export interface Release {
  version: string;
  file: string;
  bytes: number;
  updatedAt: string;
  url: string;
  platform: string;
}

/** Compara 1.2.3 contra 1.10.0 numericamente, no como texto. */
export function comparar(a: string, b: string): number {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function ultimoInstalador(): Release | null {
  try {
    if (!fs.existsSync(DIR)) return null;
    const cands = fs
      .readdirSync(DIR)
      .map((f) => ({ file: f, m: RX.exec(f) }))
      .filter((x): x is { file: string; m: RegExpExecArray } => x.m !== null)
      .map((x) => ({ file: x.file, version: x.m[1] }));
    if (!cands.length) return null;
    cands.sort((a, b) => comparar(b.version, a.version));
    const top = cands[0];
    const st = fs.statSync(path.join(DIR, top.file));
    return {
      version: top.version,
      file: top.file,
      bytes: st.size,
      updatedAt: st.mtime.toISOString(),
      url: "/downloads/" + top.file,
      platform: "Windows x64",
    };
  } catch {
    return null;
  }
}

let cacheSha: { clave: string; sha: string } | null = null;

/**
 * sha256 del instalador. El agente NO ejecuta nada que no coincida con este hash,
 * asi que es lo unico que hace que bajar un .exe y correrlo sea aceptable.
 */
export function shaInstalador(r: Release): string | null {
  const p = path.join(DIR, r.file);
  const clave = r.file + ":" + r.bytes + ":" + r.updatedAt;
  if (cacheSha && cacheSha.clave === clave) return cacheSha.sha;
  try {
    const h = crypto.createHash("sha256");
    h.update(fs.readFileSync(p));
    const sha = h.digest("hex");
    cacheSha = { clave, sha };
    return sha;
  } catch {
    return null;
  }
}
