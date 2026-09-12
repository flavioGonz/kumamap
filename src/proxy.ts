import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── Next.js 16 Proxy — runs BEFORE route handlers (Node.js runtime) ─────────
// Protects all API routes (except auth and public endpoints) by validating
// the session cookie. Uses Node.js crypto (proxy runs in Node.js, not Edge).
// Features sliding-session renewal: tokens are refreshed when >50% of their
// lifetime has elapsed, so active users never hit expiration.

// ── Session signing secret ──────────────────────────────────────────────────
// SECURITY: never fall back to a hardcoded default — a public default secret
// lets anyone forge a valid session token. If SESSION_SECRET is missing we
// derive a per-boot random secret: sessions won't survive a restart, but they
// cannot be forged. A loud warning is printed so the operator sets it properly.
function resolveSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) return explicit;

  if (explicit) {
    console.warn("[Auth] SESSION_SECRET is too short (<16 chars) — ignoring it.");
  }
  const ephemeral = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[Auth] SESSION_SECRET is not set. Using an ephemeral per-boot secret: " +
      "all sessions will be invalidated on restart. " +
      "Set SESSION_SECRET=<32+ random chars> in .env to fix."
  );
  return ephemeral;
}

const SECRET = resolveSecret();
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_RENEW_THRESHOLD = TOKEN_MAX_AGE_MS / 2; // renew when <3.5 days remaining
/** Set COOKIE_SECURE=1 once the deployment is behind HTTPS */
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";

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
  "/api/ups",              // UPS SNMP polling + history (needed by kiosk tour tooltip)
  "/api/dns-watch",        // estado de los resolvers DNS publicos (lo usa el login)
  "/api/agent",            // metadatos del agente monitor-ng (tarjeta de descarga del login)
  "/downloads",            // instalador del agente, servido como archivo estatico
];

// API routes accessible via ANY method without auth (needed by mobile PWA)
const PUBLIC_ANY_PREFIXES = [
  // Del agente monitor-ng: se autentica con su propio token Bearer y no tiene
  // sesion. Lo demas que cuelga de /api/monitor-ng es el panel y va con sesion,
  // que antes quedaba fuera del control de roles por estar todo bajo el mismo
  // prefijo.
  "/api/monitor-ng/report",
  "/api/monitor-ng/register",
  "/api/monitor-ng/adopt-status",
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

type Rol = "admin" | "operador" | "lector";

interface TokenResult {
  username: string | null;
  /**
   * Los tokens anteriores a los usuarios propios no traen rol. Se los toma como
   * administrador: hasta entonces habia un solo usuario y podia todo.
   */
  rol: Rol;
  /** true when the token is valid but past the renewal threshold */
  needsRenewal: boolean;
}

function aRol(v: unknown): Rol {
  return v === "operador" || v === "lector" ? v : "admin";
}

/** Metodos que modifican algo. Un lector no pasa de aca. */
const METODOS_QUE_ESCRIBEN = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Rutas reservadas a administradores. */
const SOLO_ADMIN = ["/api/usuarios"];

function validateToken(token: string): TokenResult {
  try {
    // New HMAC tokens: payloadBase64url.signatureBase64url
    if (token.includes(".")) {
      const [payloadB64, sig] = token.split(".");
      if (!payloadB64 || !sig) return { username: null, rol: "admin", needsRenewal: false };

      const expectedSig = crypto
        .createHmac("sha256", SECRET)
        .update(payloadB64)
        .digest("base64url");

      // Constant-time comparison
      if (sig.length !== expectedSig.length) return { username: null, rol: "admin", needsRenewal: false };
      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { username: null, rol: "admin", needsRenewal: false };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
        return { username: null, rol: "admin", needsRenewal: false };
      }

      const timeRemaining = payload.exp - Date.now();
      return {
        username: payload.u || null,
        rol: aRol(payload.r),
        needsRenewal: timeRemaining < TOKEN_RENEW_THRESHOLD,
      };
    }

    // SECURITY: the legacy unsigned base64 token path was REMOVED.
    // It accepted any `base64("<KUMA_USER>:...")` value with no signature check,
    // which allowed a trivial no-password admin bypass:
    //     document.cookie = "kumamap_session=" + btoa("admin:")
    // Only HMAC-signed tokens (payload.signature) are accepted now. Users holding
    // an old cookie simply get a 401 and re-login once.
    return { username: null, rol: "admin", needsRenewal: false };
  } catch {
    return { username: null, rol: "admin", needsRenewal: false };
  }
}

/** Create a fresh HMAC session token */
function createToken(username: string, rol: Rol): string {
  const payload = JSON.stringify({
    u: username,
    r: rol,
    exp: Date.now() + TOKEN_MAX_AGE_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Build the response for an allowed request, propagating identity downstream.
 *
 * Every request that reaches a route handler carries `x-kumamap-auth`:
 *   "1" → a valid session was presented
 *   "0" → anonymous (public kiosk / PWA path)
 *
 * Route handlers that return device credentials (cameras, map node custom_data)
 * MUST redact secrets when this header is "0". See `src/lib/redact.ts`.
 *
 * These headers are stripped-and-reset on every request, so a client cannot
 * spoof them by sending their own `x-kumamap-auth: 1`.
 */
function allow(req: NextRequest, username: string | null, rol: Rol, needsRenewal: boolean) {
  const headers = new Headers(req.headers);
  headers.delete("x-kumamap-user");
  headers.delete("x-kumamap-auth");
  headers.delete("x-kumamap-rol");
  headers.set("x-kumamap-auth", username ? "1" : "0");
  if (username) {
    headers.set("x-kumamap-user", username);
    headers.set("x-kumamap-rol", rol);
  }

  const response = NextResponse.next({ request: { headers } });

  // Sliding session: renew token when >50% of lifetime has elapsed
  if (username && needsRenewal) {
    response.cookies.set("kumamap_session", createToken(username, rol), {
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
      path: "/",
      maxAge: 86400 * 7,
    });
  }

  return response;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public paths (login page, kiosk page, Next internals)
  if (isPublicPath(pathname)) return NextResponse.next();

  // Only protect API routes — pages handle their own redirects
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Always evaluate the session, even on public routes, so downstream handlers
  // can tell an authenticated operator from an anonymous kiosk and redact
  // credentials accordingly.
  const token = req.cookies.get("kumamap_session")?.value;
  const { username, rol, needsRenewal } = token
    ? validateToken(token)
    : { username: null, rol: "admin" as Rol, needsRenewal: false };

  // Public routes: pass through, authenticated or not
  if (isPublicGetRoute(req.method, pathname) || isPublicAnyRoute(pathname)) {
    return allow(req, username, rol, needsRenewal);
  }

  // Everything else requires a valid session
  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!username) {
    // Don't delete the cookie here — let the frontend handle the redirect.
    // Deleting the cookie on every 401 causes cascading failures with auto-save.
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  // ── Roles ────────────────────────────────────────────────────────────────
  // Un lector mira; no escribe en ningun lado. Y hay rutas que son de
  // administradores aunque el metodo sea de lectura.
  if (SOLO_ADMIN.some((p) => pathname.startsWith(p)) && rol !== "admin") {
    return NextResponse.json(
      { error: "Esta sección es de administradores" },
      { status: 403 }
    );
  }
  if (METODOS_QUE_ESCRIBEN.has(req.method) && rol === "lector") {
    return NextResponse.json(
      { error: "Tu cuenta es de sólo lectura: no puede modificar nada." },
      { status: 403 }
    );
  }

  return allow(req, username, rol, needsRenewal);
}

// NOTE: do not add further exports to this file. Next.js expects a proxy/
// middleware module to export only the handler and `config`. Route handlers that
// need the auth flag should read the `x-kumamap-auth` header directly, or use
// `publicSafe()` from src/lib/redact.ts.

export const config = {
  matcher: ["/api/:path*"],
};
