import { NextRequest } from "next/server";
import { createHash } from "crypto";

/**
 * Server-side proxy for camera snapshots.
 * Supports Basic Auth AND Digest Auth (required by Hikvision cameras).
 *
 * Usage: GET /api/camera/snapshot?url=<encoded-camera-url>
 * Credentials embedded in URL: http://user:pass@host/path
 */

function md5(s: string) {
  return createHash("md5").update(s).digest("hex");
}

/** Parse WWW-Authenticate: Digest header fields */
function parseDigestChallenge(header: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|([\w./@-]+))/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(header)) !== null) {
    fields[m[1]] = m[2] ?? m[3];
  }
  return fields;
}

/** Build a Digest Auth response header */
function buildDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: Record<string, string>,
): string {
  const { realm, nonce, qop, opaque, algorithm } = challenge;

  const ha1 = algorithm?.toUpperCase() === "MD5-SESS"
    ? md5(`${md5(`${username}:${realm}:${password}`)}:${nonce}:00000001:abcdef01`)
    : md5(`${username}:${realm}:${password}`);

  const ha2 = md5(`${method}:${uri}`);

  let response: string;
  let ncHex = "00000001";
  let cnonce = "abcdef01";

  if (qop === "auth" || qop === "auth-int") {
    response = md5(`${ha1}:${nonce}:${ncHex}:${cnonce}:${qop}:${ha2}`);
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
  }

  let header =
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) header += `, qop=${qop}, nc=${ncHex}, cnonce="${cnonce}"`;
  if (opaque) header += `, opaque="${opaque}"`;
  if (algorithm) header += `, algorithm=${algorithm}`;

  return header;
}

// ── SSRF Protection ───────────────────────────────────────────────────────────
// Camera proxy allows private IPs (cameras live on the local network).
// Only block loopback and link-local to prevent abuse.

function validateUrlTarget(hostname: string): { ok: boolean; reason?: string } {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") {
    return { ok: false, reason: "loopback blocked" };
  }
  if (lower.startsWith("169.254.")) {
    return { ok: false, reason: "link-local blocked" };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  let fetchUrl: string;
  let username = "";
  let password = "";

  try {
    const parsed = new URL(rawUrl);

    // Only allow http/https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("Only http/https URLs are allowed", { status: 400 });
    }

    // SSRF check: block loopback/link-local only (private IPs allowed for local cameras)
    const ssrfCheck = validateUrlTarget(parsed.hostname);
    if (!ssrfCheck.ok) {
      return new Response(`Blocked: ${ssrfCheck.reason}`, { status: 403 });
    }

    username = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
    parsed.username = "";
    parsed.password = "";
    fetchUrl = parsed.toString();
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  const baseHeaders: Record<string, string> = {
    "User-Agent": "KumaMap-CameraProxy/1.5",
  };

  // ── Attempt 1: no auth (or Basic if we got credentials) ──────────────────
  if (username) {
    baseHeaders["Authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  let response = await fetch(fetchUrl, {
    headers: baseHeaders,
    signal: AbortSignal.timeout(6000),
  });

  // ── If 401 with Digest challenge, retry with Digest Auth ──────────────────
  if (response.status === 401 && username) {
    const wwwAuth = response.headers.get("www-authenticate") ?? "";
    if (wwwAuth.toLowerCase().startsWith("digest")) {
      const challenge = parseDigestChallenge(wwwAuth);

      // URI is just the path+query part
      const parsedFetch = new URL(fetchUrl);
      const uri = parsedFetch.pathname + parsedFetch.search;

      const digestHeader = buildDigestHeader("GET", uri, username, password, challenge);

      response = await fetch(fetchUrl, {
        headers: {
          ...baseHeaders,
          Authorization: digestHeader,
        },
        signal: AbortSignal.timeout(6000),
      });
    }
  }

  if (!response.ok) {
    return new Response(`Camera returned HTTP ${response.status}`, { status: 502 });
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
