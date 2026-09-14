import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import dns from "dns/promises";

const execAsync = promisify(exec);

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

// Validate that subnet looks like a private network prefix
function isPrivateSubnet(subnet: string): boolean {
  const parts = subnet.split(".");
  if (parts.length !== 3) return false;
  const first = parseInt(parts[0]);
  const second = parseInt(parts[1]);
  if (first === 10) return true; // 10.x.x.x
  if (first === 172 && second >= 16 && second <= 31) return true; // 172.16-31.x.x
  if (first === 192 && second === 168) return true; // 192.168.x.x
  return false;
}

async function pingHost(ip: string): Promise<{ alive: boolean; rtt: number | null }> {
  try {
    // Cross-platform ping: -c 1 (Linux), -W timeout in seconds
    const { stdout } = await execAsync(
      `ping -c 1 -W 1 ${ip}`,
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
