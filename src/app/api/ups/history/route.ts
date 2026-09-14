import { NextRequest, NextResponse } from "next/server";
import type { UpsHistoryPoint } from "@/lib/ups";

// ── In-memory ring buffer (24h per UPS IP) ──────────────────────────────────
// At 30s poll interval → 2880 points per day — very lightweight

const MAX_POINTS = 2880; // 24h at 30s intervals
const history = new Map<string, UpsHistoryPoint[]>();

function getBuffer(ip: string): UpsHistoryPoint[] {
  let buf = history.get(ip);
  if (!buf) {
    buf = [];
    history.set(ip, buf);
  }
  return buf;
}

function pushPoint(ip: string, point: UpsHistoryPoint) {
  const buf = getBuffer(ip);
  buf.push(point);
  // Trim to MAX_POINTS (ring buffer behavior)
  if (buf.length > MAX_POINTS) {
    buf.splice(0, buf.length - MAX_POINTS);
  }
}

// Evict stale UPS entries (no data in >2h)
const STALE_MS = 2 * 60 * 60 * 1000;
function evictStale() {
  const now = Date.now();
  for (const [ip, buf] of history) {
    if (buf.length === 0 || now - buf[buf.length - 1].t > STALE_MS) {
      history.delete(ip);
    }
  }
}
// Run eviction every 10 minutes
setInterval(evictStale, 10 * 60 * 1000);

// ── GET: retrieve history for a UPS ─────────────────────────────────────────
// Query: ?ip=x.x.x.x&hours=24  (default 24h)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get("ip");
  if (!ip) {
    return NextResponse.json({ error: "ip required" }, { status: 400 });
  }

  const hours = Math.min(Number(searchParams.get("hours") || 24), 24);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const buf = getBuffer(ip);

  // Binary search for cutoff
  let lo = 0, hi = buf.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (buf[mid].t < cutoff) lo = mid + 1;
    else hi = mid;
  }

  const points = buf.slice(lo);

  return NextResponse.json({
    ip,
    count: points.length,
    points,
  });
}

// ── POST: push a new data point ─────────────────────────────────────────────
// Body: { ip, charge, load, inputV?, outputV?, temp?, runtime?, status }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ip, charge, load, inputV, outputV, temp, runtime, status } = body;

    if (!ip || charge == null || load == null) {
      return NextResponse.json({ error: "ip, charge, load required" }, { status: 400 });
    }

    const point: UpsHistoryPoint = {
      t: Date.now(),
      charge: Number(charge),
      load: Number(load),
      inputV: inputV != null ? Number(inputV) : undefined,
      outputV: outputV != null ? Number(outputV) : undefined,
      temp: temp != null ? Number(temp) : undefined,
      runtime: runtime != null ? Number(runtime) : undefined,
      status: status || "unknown",
    };

    pushPoint(ip, point);

    return NextResponse.json({ ok: true, count: getBuffer(ip).length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
