import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── Session token management ─────────────────────────────────────────────────
// Uses HMAC-SHA256 to create tamper-proof tokens with embedded expiration.

const SECRET = process.env.SESSION_SECRET || process.env.KUMA_PASS || "kumamap-default-secret";
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create a cryptographic session token containing the username and expiry.
 * Format: base64(payload).base64(hmac)
 */
export function createSessionToken(username: string): string {
  const payload = JSON.stringify({
    u: username,
    exp: Date.now() + TOKEN_MAX_AGE_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Validate a session token. Returns the username if valid, null otherwise.
 */
export function validateSessionToken(token: string): string | null {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    // Verify signature
    const expectedSig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    // Parse and check expiry
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;

    return payload.u || null;
  } catch {
    return null;
  }
}

// ── Rate limiting ────────────────────────────────────────────────────────────
// Simple in-memory rate limiter for login attempts.

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true; // allowed
  }

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return false; // blocked
  }

  entry.count++;
  return true;
}

export function resetLoginRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

// ── Auth middleware helper ────────────────────────────────────────────────────

/**
 * Validate the session cookie. Returns the username or a 401 response.
 */
export function requireAuth(req: NextRequest): string | NextResponse {
  const token = req.cookies.get("kumamap_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const username = validateSessionToken(token);
  if (!username) {
    const res = NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
    res.cookies.delete("kumamap_session");
    return res;
  }

  return username;
}

// Also accept old base64 tokens (for backward compat during rollout)
// They'll expire after 7 days and be replaced by new HMAC tokens on next login.
function isLegacyToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString();
    return decoded.includes(":") && !token.includes(".");
  } catch {
    return false;
  }
}

/**
 * Enhanced requireAuth that also accepts legacy tokens during migration.
 */
export function requireAuthCompat(req: NextRequest): string | NextResponse {
  const token = req.cookies.get("kumamap_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Try new HMAC token first
  const username = validateSessionToken(token);
  if (username) return username;

  // Fall back to legacy base64 token
  if (isLegacyToken(token)) {
    try {
      const decoded = Buffer.from(token, "base64").toString();
      const [user] = decoded.split(":");
      if (user === (process.env.KUMA_USER || "")) return user;
    } catch {}
  }

  const res = NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  res.cookies.delete("kumamap_session");
  return res;
}
