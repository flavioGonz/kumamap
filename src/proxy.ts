import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── Next.js 16 Proxy — runs BEFORE route handlers (Node.js runtime) ─────────
// Protects all API routes (except auth and public endpoints) by validating
// the session cookie. Uses Node.js crypto (proxy runs in Node.js, not Edge).
// Features sliding-session renewal: tokens are refreshed when >50% of their
// lifetime has elapsed, so active users never hit expiration.

const SECRET = process.env.SESSION_SECRET || process.env.KUMA_PASS || "kumamap-default-secret";
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_RENEW_THRESHOLD = TOKEN_MAX_AGE_MS / 2; // renew when <3.5 days remaining

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
  "/api/plates",           // plate registry + access log (needed by mobile PWA)
  "/api/hik/images",       // Hikvision event images (used by LPR feed)
  "/api/hik/events/stream", // SSE event stream (used by LPR feed)
  "/api/uploads",           // uploaded files (map background images, etc.)
];

// API routes accessible via ANY method without auth (needed by mobile PWA)
const PUBLIC_ANY_PREFIXES = [
  "/api/push",             // push subscription CRUD + test (needed by mobile PWA)
  "/api/hik/events",       // Hikvision camera event webhooks (NVR pushes here)
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isPublicGetRoute(method: string, pathname: string): boolean {
  if (method !== "GET") return false;
  return PUBLIC_GET_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicAnyRoute(pathname: string): boolean {
  return PUBLIC_ANY_PREFIXES.some((p) => pathname.startsWith(p));
}

interface TokenResult {
  username: string | null;
  /** true when the token is valid but past the renewal threshold */
  needsRenewal: boolean;
}

function validateToken(token: string): TokenResult {
  try {
    // New HMAC tokens: payloadBase64url.signatureBase64url
    if (token.includes(".")) {
      const [payloadB64, sig] = token.split(".");
      if (!payloadB64 || !sig) return { username: null, needsRenewal: false };

      const expectedSig = crypto
        .createHmac("sha256", SECRET)
        .update(payloadB64)
        .digest("base64url");

      // Constant-time comparison
      if (sig.length !== expectedSig.length) return { username: null, needsRenewal: false };
      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { username: null, needsRenewal: false };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
        return { username: null, needsRenewal: false };
      }

      const timeRemaining = payload.exp - Date.now();
      return {
        username: payload.u || null,
        needsRenewal: timeRemaining < TOKEN_RENEW_THRESHOLD,
      };
    }

    // Legacy base64 tokens (backward compat — will expire naturally after 7 days)
    const decoded = Buffer.from(token, "base64").toString();
    if (decoded.includes(":")) {
      const [user] = decoded.split(":");
      const validUser = process.env.KUMA_USER || "";
      if (user && user === validUser) return { username: user, needsRenewal: true }; // always renew legacy
    }

    return { username: null, needsRenewal: false };
  } catch {
    return { username: null, needsRenewal: false };
  }
}

/** Create a fresh HMAC session token */
function createToken(username: string): string {
  const payload = JSON.stringify({
    u: username,
    exp: Date.now() + TOKEN_MAX_AGE_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public paths
  if (isPublicPath(pathname)) return NextResponse.next();

  // Only protect API routes — pages handle their own redirects
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Allow read-only API access for public kiosk view (/view/[id])
  if (isPublicGetRoute(req.method, pathname)) return NextResponse.next();

  // Allow any-method public routes (push subscriptions for mobile PWA)
  if (isPublicAnyRoute(pathname)) return NextResponse.next();

  // Validate session cookie
  const token = req.cookies.get("kumamap_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { username, needsRenewal } = validateToken(token);
  if (!username) {
    // Don't delete the cookie here — let the frontend handle the redirect.
    // Deleting the cookie on every 401 causes cascading failures with auto-save.
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  // Add user info to request headers for downstream routes
  const response = NextResponse.next();
  response.headers.set("x-kumamap-user", username);

  // Sliding session: renew token when >50% of lifetime has elapsed
  if (needsRenewal) {
    const newToken = createToken(username);
    response.cookies.set("kumamap_session", newToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 86400 * 7,
    });
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
