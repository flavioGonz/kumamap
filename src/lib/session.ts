/**
 * Session token verification shared by the Next.js proxy and the Socket.IO
 * gateway in server.ts.
 *
 * server.ts is compiled separately from the Next.js bundle, so it cannot import
 * from `src/proxy.ts` (that module pulls in `next/server`). This file holds the
 * pure-crypto half so both sides validate tokens identically.
 */

import crypto from "crypto";

let cachedSecret: string | null = null;

export function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) {
    cachedSecret = explicit;
  } else {
    // Never fall back to a hardcoded default — a public default lets anyone
    // forge a session. An ephemeral secret only costs a re-login on restart.
    cachedSecret = crypto.randomBytes(32).toString("hex");
  }
  return cachedSecret;
}

/** Returns the username for a valid HMAC token, or null. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null; // unsigned legacy tokens are rejected

    const expected = crypto
      .createHmac("sha256", sessionSecret())
      .update(payloadB64)
      .digest("base64url");

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;

    return typeof payload.u === "string" && payload.u ? payload.u : null;
  } catch {
    return null;
  }
}

/** Pull the `kumamap_session` value out of a raw Cookie header. */
export function sessionFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "kumamap_session") {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
