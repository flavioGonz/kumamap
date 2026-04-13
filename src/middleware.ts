import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── Next.js Edge Middleware — runs BEFORE route handlers ──────────────────────
// Protects all API routes (except auth and public endpoints) by validating
// the session cookie. Public routes (/view/*, /api/auth) are excluded.

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

function validateToken(token: string): string | null {
  try {
    // New HMAC tokens: payload.signature
    if (token.includes(".")) {
      const [payloadB64, sig] = token.split(".");
      if (!payloadB64 || !sig) return null;
      const expectedSig = crypto
        .createHmac("sha256", SECRET)
        .update(payloadB64)
        .digest("base64url");
      if (sig.length !== expectedSig.length) return null;
      // timingSafeEqual requires same-length buffers
      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
      return payload.u || null;
    }

    // Legacy base64 tokens (backward compat)
    const decoded = Buffer.from(token, "base64").toString();
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

export function middleware(req: NextRequest) {
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

  const username = validateToken(token);
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
