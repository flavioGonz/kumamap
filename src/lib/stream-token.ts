/**
 * Signed stream references.
 *
 * PROBLEM (pre-fix):
 *   The camera proxies took the full target URL from the query string:
 *       /api/camera/snapshot?url=rtsp://admin:hunter2@10.0.0.5/...
 *   That meant (a) every client — including the unauthenticated kiosk — had to
 *   be handed the RTSP URL *with credentials in it*, and (b) an attacker could
 *   put ANY url there and turn the server into an SSRF/port-scan primitive.
 *
 * FIX:
 *   The server mints an opaque, HMAC-signed, short-lived `ref` token that
 *   *encodes* the real URL. Clients pass `?ref=<token>`; the server verifies the
 *   signature and recovers the URL. Credentials never leave the server, and a
 *   client cannot point the proxy at a URL the server didn't authorize.
 *
 *   Ad-hoc `?url=` is still supported, but only for authenticated operators
 *   (e.g. the "test stream" button in the config modal) and still runs through
 *   the SSRF guard.
 */

import crypto from "crypto";

const SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : // Falls back to a per-process key: refs simply stop validating after a
      // restart and clients re-fetch them from /api/cameras. Never a fixed default.
      crypto.randomBytes(32).toString("hex");

/** Refs are short-lived: a leaked ref stops working quickly. */
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Mint an opaque reference for a stream URL. Returns "" for empty input. */
export function mintStreamRef(url: string, ttlMs: number = TTL_MS): string {
  if (!url) return "";
  const payload = Buffer.from(
    JSON.stringify({ u: url, exp: Date.now() + ttlMs })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Recover the URL from a ref. Returns null if forged, malformed, or expired. */
export function resolveStreamRef(ref: string): string | null {
  try {
    const [payload, sig] = ref.split(".");
    if (!payload || !sig) return null;

    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    if (typeof data.u !== "string" || !data.u) return null;

    return data.u;
  } catch {
    return null;
  }
}

/**
 * Resolve the target URL for a camera-proxy request.
 *
 * Precedence:
 *   1. `ref`  — signed, works for anyone (kiosk included).
 *   2. `url`  — raw, ONLY for authenticated operators.
 *
 * Returns `{ url }` on success or `{ error, status }` to return verbatim.
 */
export function resolveProxyTarget(
  searchParams: URLSearchParams,
  headers: Headers
): { url: string } | { error: string; status: number } {
  const ref = searchParams.get("ref");
  if (ref) {
    const url = resolveStreamRef(ref);
    if (!url) return { error: "Referencia de stream inválida o expirada", status: 403 };
    return { url };
  }

  const raw = searchParams.get("url");
  if (!raw) return { error: "Falta el parámetro 'ref'", status: 400 };

  // Raw URLs are an operator-only escape hatch (stream test / config preview).
  if (headers.get("x-kumamap-auth") !== "1") {
    return {
      error: "El parámetro 'url' requiere sesión. Los clientes públicos deben usar 'ref'.",
      status: 401,
    };
  }

  return { url: raw };
}
