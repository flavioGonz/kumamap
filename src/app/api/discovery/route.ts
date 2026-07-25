import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import dns from "dns/promises";

// SECURITY: execFile (not exec) — arguments are passed as an array and never
// interpolated into a shell string, so a hostile `subnet` cannot inject commands.
const execFileAsync = promisify(execFile);

/**
 * POST /api/discovery
 * Scans a subnet for live hosts using ping sweep.
 * Body: { subnet: "192.168.1", startIp?: number, endIp?: number }
 * Returns: { hosts: [{ ip, hostname?, rtt? }] }
 */

const MAX_RANGE = 254; // max IPs to scan per request
const PING_TIMEOUT_MS = 500; // timeout per host
const CONCURRENT_BATCH = 30; // parallel pings

interface DiscoveredHost {
  ip: string;
  hostname: string | null;
  rtt: number | null;
}

/**
 * Validate that `subnet` is a well-formed private /24 prefix like "192.168.1".
 *
 * SECURITY: the previous version only ran `parseInt` on the first two octets and
 * never validated the third, so a payload like "10.0.1;reboot" passed the check
 * and was then interpolated into a shell command. Every octet is now matched
 * against a strict numeric regex and range-checked, and the value is additionally
 * passed to `execFile` as an argument (never through a shell).
 */
const OCTET_RE = /^(0|[1-9]\d{0,2})$/;

function parseOctets(subnet: string): number[] | null {
  const parts = subnet.split(".");
  if (parts.length !== 3) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!OCTET_RE.test(part)) return null; // rejects "", "01", "1;x", "1 2", "-1"
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function isPrivateSubnet(subnet: string): boolean {
  const octets = parseOctets(subnet);
  if (!octets) return false;
  const [first, second] = octets;
  if (first === 10) return true;                              // 10.0.0.0/8
  if (first === 172 && second >= 16 && second <= 31) return true; // 172.16.0.0/12
  if (first === 192 && second === 168) return true;           // 192.168.0.0/16
  return false;
}

async function pingHost(ip: string): Promise<{ alive: boolean; rtt: number | null }> {
  try {
    // Arguments as an array — no shell, no interpolation, no injection.
    const { stdout } = await execFileAsync(
      "ping",
      ["-c", "1", "-W", "1", ip],
      { timeout: PING_TIMEOUT_MS + 1000 }
    );
    // Extract RTT from output like "time=1.23 ms"
    const match = stdout.match(/time[=<]([\d.]+)\s*ms/);
    const rtt = match ? parseFloat(match[1]) : null;
    return { alive: true, rtt };
  } catch {
    return { alive: false, rtt: null };
  }
}

async function resolveHostname(ip: string): Promise<string | null> {
  try {
    const [hostname] = await dns.reverse(ip);
    return hostname || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subnet, startIp = 1, endIp = 254 } = body;

    // Validate subnet
    if (!subnet || typeof subnet !== "string") {
      return NextResponse.json({ error: "subnet is required (e.g. '192.168.1')" }, { status: 400 });
    }
    if (!isPrivateSubnet(subnet)) {
      return NextResponse.json({ error: "Only private subnets allowed (10.x, 172.16-31.x, 192.168.x)" }, { status: 403 });
    }

    const start = Math.max(1, Math.min(254, Number(startIp)));
    const end = Math.max(start, Math.min(254, Number(endIp)));
    if (end - start + 1 > MAX_RANGE) {
      return NextResponse.json({ error: `Max range is ${MAX_RANGE} IPs` }, { status: 400 });
    }

    // Build IP list
    const ips: string[] = [];
    for (let i = start; i <= end; i++) {
      ips.push(`${subnet}.${i}`);
    }

    // Ping sweep in batches
    const alive: { ip: string; rtt: number | null }[] = [];
    for (let i = 0; i < ips.length; i += CONCURRENT_BATCH) {
      const batch = ips.slice(i, i + CONCURRENT_BATCH);
      const results = await Promise.all(batch.map(async (ip) => {
        const result = await pingHost(ip);
        return { ip, ...result };
      }));
      for (const r of results) {
        if (r.alive) alive.push({ ip: r.ip, rtt: r.rtt });
      }
    }

    // Resolve hostnames for alive hosts (in parallel, best effort)
    const hosts: DiscoveredHost[] = await Promise.all(
      alive.map(async (h) => {
        const hostname = await resolveHostname(h.ip);
        return { ip: h.ip, hostname, rtt: h.rtt };
      })
    );

    // Sort by IP numerically
    hosts.sort((a, b) => {
      const aLast = parseInt(a.ip.split(".").pop()!);
      const bLast = parseInt(b.ip.split(".").pop()!);
      return aLast - bLast;
    });

    return NextResponse.json({
      subnet,
      range: `${subnet}.${start} - ${subnet}.${end}`,
      total: ips.length,
      found: hosts.length,
      hosts,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
