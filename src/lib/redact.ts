/**
 * Credential redaction for responses served to unauthenticated clients.
 *
 * The public kiosk (`/view/[id]`) and the mobile PWA read `/api/maps` and
 * `/api/cameras` without a session. Those payloads carry device credentials in
 * plaintext (`mgmtPassword`, `snmpCommunity`, RTSP URLs with `user:pass@`, …).
 *
 * Before this module existed, any unauthenticated host on the LAN could dump
 * every stored device password with a single GET. Now the proxy stamps
 * `x-kumamap-auth: 0|1` on every request and these helpers strip secrets from
 * anything served to an anonymous caller.
 *
 * Rule of thumb: the kiosk needs to *display* devices, never to *log into* them.
 */

/** Keys whose values must never reach an unauthenticated client. */
const SECRET_KEYS = new Set([
  "password",
  "pass",
  "mgmtpassword",
  "webpassword",
  "sippassword",
  "snmpcommunity",
  "upssnmpcommunity",
  "nutpass",
  "nutpassword",
  "apikey",
  "api_key",
  "token",
  "secret",
  "privatekey",
  "rtsppassword",
  "mgmtuser",
  "webuser",
  "sipuser",
  "nutuser",
  "user",
  "username",
]);

/** Keys that hold URLs which may embed `user:pass@` credentials. */
const URL_KEYS = new Set([
  "rtspurl",
  "rtsp",
  "streamurl",
  "snapshoturl",
  "url",
  "mainstream",
  "substream",
]);

const REDACTED = "***";

/** Strip `user:pass@` from a URL-ish string, keeping it usable for display. */
export function stripUrlCredentials(value: string): string {
  return value.replace(/:\/\/[^/@\s]*@/, "://");
}

/**
 * Deep-clone `value`, replacing every secret field with `***` and stripping
 * inline credentials from URL fields. Safe against cycles and deeply nested
 * `custom_data` blobs.
 */
export function redactSecrets<T>(value: T, seen = new WeakSet<object>()): T {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, seen)) as unknown as T;
  }

  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (seen.has(obj)) return value;
    seen.add(obj);

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();

      if (SECRET_KEYS.has(lower)) {
        // Preserve "is it configured?" without leaking the value.
        out[key] = val == null || val === "" ? val : REDACTED;
        continue;
      }

      if (URL_KEYS.has(lower) && typeof val === "string") {
        out[key] = stripUrlCredentials(val);
        continue;
      }

      // `custom_data` is stored as a JSON *string* on map nodes — redact inside it.
      if (lower === "custom_data" && typeof val === "string") {
        out[key] = redactJsonString(val);
        continue;
      }

      out[key] = redactSecrets(val, seen);
    }
    return out as unknown as T;
  }

  return value;
}

/** Redact secrets inside a JSON-encoded string, returning a JSON string. */
export function redactJsonString(json: string): string {
  try {
    return JSON.stringify(redactSecrets(JSON.parse(json)));
  } catch {
    // Not valid JSON — return as-is rather than dropping data the UI needs.
    return json;
  }
}

/**
 * Redact `payload` unless the request carries a valid session.
 *
 * Usage inside a route handler:
 *   return NextResponse.json(publicSafe(req.headers, cameras));
 */
export function publicSafe<T>(headers: Headers, payload: T): T {
  return headers.get("x-kumamap-auth") === "1" ? payload : redactSecrets(payload);
}
