/**
 * SSRF guard for outbound fetches driven by user-supplied URLs.
 *
 * The previous check was a string blocklist (`localhost`, `127.0.0.1`, `::1`,
 * `169.254.*`). That is bypassable in at least four ways:
 *   - alternate loopback spellings:  0.0.0.0, [::], 127.1, 0x7f.1
 *   - decimal/octal/hex IP encodings: http://2130706433/
 *   - a DNS name that *resolves* to 127.0.0.1 (DNS rebinding)
 *   - IPv6-mapped IPv4: ::ffff:127.0.0.1
 *
 * This guard instead RESOLVES the hostname and validates the resulting IPs,
 * which is the only reliable way to know where a request will actually land.
 *
 * KumaMap talks to cameras/NVRs on the LAN, so the policy is an *allowlist* of
 * private ranges, minus loopback and link-local.
 */

import dns from "dns/promises";
import net from "net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "rtsp:", "rtsps:"]);

/** Ports a camera/NVR realistically listens on. */
const ALLOWED_PORTS = new Set([
  80, 443, 554, 8000, 8080, 8443, 8554, 88, 2020, 7001, 9000, 37777,
]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** Private LAN ranges we permit. */
function isAllowedIpv4(ip: string): boolean {
  // Explicitly denied even though some fall inside the ranges below.
  if (inCidr(ip, "127.0.0.0", 8)) return false;   // loopback
  if (inCidr(ip, "169.254.0.0", 16)) return false; // link-local / cloud metadata
  if (inCidr(ip, "0.0.0.0", 8)) return false;      // "this network" / 0.0.0.0
  if (inCidr(ip, "224.0.0.0", 4)) return false;    // multicast

  return (
    inCidr(ip, "10.0.0.0", 8) ||
    inCidr(ip, "172.16.0.0", 12) ||
    inCidr(ip, "192.168.0.0", 16)
  );
}

function isAllowedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return false; // loopback / unspecified
  if (lower.startsWith("fe80:")) return false;         // link-local

  // IPv4-mapped (::ffff:127.0.0.1) — re-check as IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isAllowedIpv4(mapped[1]);

  // Unique local addresses (fc00::/7) are the IPv6 analogue of a private LAN.
  return lower.startsWith("fc") || lower.startsWith("fd");
}

export interface SsrfCheck {
  ok: boolean;
  reason?: string;
  /** IPs the hostname resolved to (useful for logging). */
  addresses?: string[];
}

/**
 * Validate that `rawUrl` points at a private-LAN device on a plausible port.
 * Resolves DNS names; rejects anything that lands on loopback/link-local/public.
 */
export async function assertSafeDeviceUrl(rawUrl: string): Promise<SsrfCheck> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL malformada" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `Protocolo no permitido: ${parsed.protocol}` };
  }

  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === "https:" || parsed.protocol === "rtsps:"
      ? 443
      : parsed.protocol === "rtsp:"
        ? 554
        : 80;

  if (!ALLOWED_PORTS.has(port)) {
    return { ok: false, reason: `Puerto no permitido: ${port}` };
  }

  // Strip brackets from IPv6 literals: [fd00::1] → fd00::1
  const host = parsed.hostname.replace(/^\[|\]$/g, "");

  let addresses: string[];
  const literal = net.isIP(host);
  if (literal) {
    addresses = [host];
  } else {
    try {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      addresses = records.map((r) => r.address);
    } catch {
      return { ok: false, reason: `No se pudo resolver el host: ${host}` };
    }
    if (addresses.length === 0) {
      return { ok: false, reason: `El host no resolvió a ninguna IP: ${host}` };
    }
  }

  // EVERY resolved address must be allowed — a name resolving to both a LAN IP
  // and a public one must not slip through.
  for (const addr of addresses) {
    const version = net.isIP(addr);
    const allowed = version === 4 ? isAllowedIpv4(addr) : isAllowedIpv6(addr);
    if (!allowed) {
      return {
        ok: false,
        reason: `Destino fuera de la LAN permitida: ${addr}`,
        addresses,
      };
    }
  }

  return { ok: true, addresses };
}
