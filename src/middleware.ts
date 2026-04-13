import { NextRequest, NextResponse } from "next/server";

// ── Next.js Edge Middleware — runs BEFORE route handlers ──────────────────────
// Protects all API routes (except auth and public endpoints) by validating
// the session cookie.
// Uses Web Crypto API (Edge-compatible) instead of Node.js crypto.

const SECRET = process.env.SESSION_SECRET || process.env.KUMA_PASS || "kumamap-default-secret";

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/api/auth",       // login/logout
  "/view",           // public kiosk view
  "/_next",          // Next.js internals
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/** Convert a string to ArrayBuffer (UTF-8) */
function encode(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

/** Base64url decode → string */
function b64urlDecode(b64: string): string {
  // Pad and convert base64url → base64
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

/** HMAC-SHA256 using Web Crypto, returns base64url */
async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encode(data));
  // Convert ArrayBuffer → base64url
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string comparison */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function validateToken(token: string): Promise<string | null> {
  try {
    // New HMAC tokens: payload.signature
    if (token.includes(".")) {
      const dotIdx = token.indexOf(".");
      const payloadB64 = token.slice(0, dotIdx);
      const sig = token.slice(dotIdx + 1);
      if (!payloadB64 || !sig) return null;

      const expectedSig = await hmacSha256(SECRET, payloadB64);
      if (!timingSafeEqual(sig, expectedSig)) return null;

      const payloadStr = b64urlDecode(payloadB64);
      const payload = JSON.parse(payloadStr);
      if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
      return payload.u || null;
    }

    // Legacy base64 tokens (backward compat)
    const decoded = atob(token);
    if (decoded.includes(":")) {
      const [user] = decoded.split(":");
      const validUser = process.env.KUMA_USER || "";
      if (user && user === validUser) return user;
    }

    return null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public paths
  if (isPublicPath(pathname)) return NextResponse.next();

  // Only protect API routes — pages handle their own redirects
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Validate session cookie
  const token = req.cookies.get("kumamap_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const username = await validateToken(token);
  if (!username) {
    const res = NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
    res.cookies.delete("kumamap_session");
    return res;
  }

  // Add user info to request headers for downstream routes
  const response = NextResponse.next();
  response.headers.set("x-kumamap-user", username);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
