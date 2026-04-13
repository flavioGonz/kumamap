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
// Block requests to private/reserved IP ranges to prevent internal network probing

import { isIP } from "net";
import dns from "dns/promises";

/** CIDR ranges that must NEVER be fetched */
const BLOCKED_CIDRS = [
  // IPv4 private & reserved
  { prefix: "127.",       label: "loopback" },
  { prefix: "10.",        label: "private-A" },
  { prefix: "0.",         label: "reserved" },
  { prefix: "169.254.",   label: "link-local" },
  // IPv4 172.16.0.0/12
  // IPv4 192.168.0.0/16
];

function isPrivateIPv4(ip: string): boolean {
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("0.") || ip.startsWith("169.254.")) return true;
  // 172.16.0.0 – 172.31.255.255
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // 192.168.0.0/16
  if (ip.startsWith("192.168.")) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

/** Resolve hostname and check ALL addresses against blocked ranges */
async function validateUrlTarget(hostname: string): Promise<{ ok: boolean; reason?: string }> {
  // Direct IP literal
  if (isIP(hostname)) {
    if (isIP(hostname) === 4 && isPrivateIPv4(hostname)) return { ok: false, reason: "private IPv4" };
    if (isIP(hostname) === 6 && isPrivateIPv6(hostname)) return { ok: false, reason: "private IPv6" };
    return { ok: true };
  }
  // Block common internal hostnames
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) {
    return { ok: false, reason: `blocked hostname: ${lower}` };
  }
  // DNS resolution — check ALL resolved IPs (prevents DNS rebinding on multi-A records)
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addresses, ...addresses6];
    if (all.length === 0) return { ok: false, reason: "unresolvable hostname" };
    for (const ip of all) {
      if (isIP(ip) === 4 && isPrivateIPv4(ip)) return { ok: false, reason: `resolves to private IP ${ip}` };
      if (isIP(ip) === 6 && isPrivateIPv6(ip)) return { ok: false, reason: `resolves to private IPv6 ${ip}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }
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

    // SSRF check: validate the target is not a private/internal address
    const ssrfCheck = await validateUrlTarget(parsed.hostname);
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
