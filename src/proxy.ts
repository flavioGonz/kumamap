import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── Next.js 16 Proxy — runs BEFORE route handlers (Node.js runtime) ─────────
// Protects all API routes (except auth and public endpoints) by validating
// the session cookie. Uses Node.js crypto (proxy runs in Node.js, not Edge).

const SECRET = process.env.SESSION_SECRET || process.env.KUMA_PASS || "kumamap-default-secret";

// Routes that never require authentication
const PUBLIC_PATHS = [
  "/api/auth",       // login/logout
  "/view",           // public kiosk view
  "/_next",          // Next.js internals
  "/favicon.ico",
];

// API routes accessible via GET without auth (needed by public /view/[id] kiosk)
const PUBLIC_GET_PREFIXES = [
  "/api/maps",             // GET maps list + single map by id (needed by mobile PWA)
  "/api/kuma",             // monitor data (needed by mobile PWA + kiosk)
  "/api/kuma/down-since",  // monitor down-since timestamps
  "/api/kuma/history/",    // monitor ping history
  "/api/kuma/stream",      // SSE real-time events
  "/api/cameras",          // camera grid listing (needed by mobile PWA)
  "/api/camera/snapshot",  // camera snapshot proxy
  "/api/camera/rtsp-stream", // RTSP → MJPEG transcoding proxy
  "/api/health",           // health check (monitored by Uptime Kuma)
  "/api/version",          // version info for OTA updater
  "/api/push",             // push subscription GET (VAPID public key)
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isPublicGetRoute(method: string, pathname: string): boolean {
  if (method !== "GET") return false;
  return PUBLIC_GET_PREFIXES.some((p) => pathname.startsWith(p));
}

function validateToken(token: string): string | null {
  try {
    // New HMAC tokens: payloadBase64url.signatureBase64url
    if (token.includes(".")) {
      const [payloadB64, sig] = token.split(".");
      if (!payloadB64 || !sig) return null;

      const expectedSig = crypto
        .createHmac("sha256", SECRET)
        .update(payloadB64)
        .digest("base64url");

      // Constant-time comparison
      if (sig.length !== expectedSig.length) return null;
      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
      return payload.u || null;
    }

    // Legacy base64 tokens (backward compat — will expire naturally after 7 days)
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

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public paths
  if (isPublicPath(pathname)) return NextResponse.next();

  // Only protect API routes — pages handle their own redirects
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Allow read-only API access for public kiosk view (/view/[id])
  if (isPublicGetRoute(req.method, pathname)) return NextResponse.next();

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
