import { NextRequest, NextResponse } from "next/server";
import { mikrotikFetch, isPathAllowed } from "@/lib/mikrotik-client";

export const dynamic = "force-dynamic";

// ── Cache ──────────────────────────────────────────────────────────────────
interface CacheEntry { data: any; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 10_000; // 10 seconds

function getCached(key: string): any | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return e.data;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.ts > CACHE_TTL) cache.delete(k);
  }
}

// ── POST handler (credentials in body, path whitelist enforced) ──────────

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ip, port, user = "admin", pass = "", path } = body;

  if (!ip || !path) {
    return NextResponse.json({ error: "ip and path are required" }, { status: 400 });
  }

  // Sanitize path — must start with /
  const safePath = path.startsWith("/") ? path : `/${path}`;

  // Whitelist check
  if (!isPathAllowed(safePath)) {
    return NextResponse.json(
      { error: `Path not allowed: ${safePath}`, path: safePath },
      { status: 403 }
    );
  }

  const cacheKey = `${ip}:${port || ""}:${user}:${safePath}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, cached: true, path: safePath });
  }

  try {
    const data = await mikrotikFetch(ip, safePath, user, pass, 8000, port);
    setCache(cacheKey, data);
    return NextResponse.json({ data, cached: false, path: safePath });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error desconocido", path: safePath },
      { status: 502 }
    );
  }
}

// ── Legacy GET (backwards compat during transition — remove later) ───────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ip = searchParams.get("ip");
  const port = searchParams.get("port") ? parseInt(searchParams.get("port")!) : undefined;
  const user = searchParams.get("user") || "admin";
  const pass = searchParams.get("pass") || "";
  const path = searchParams.get("path");

  if (!ip || !path) {
    return NextResponse.json({ error: "ip and path are required" }, { status: 400 });
  }

  const safePath = path.startsWith("/") ? path : `/${path}`;

  if (!isPathAllowed(safePath)) {
    return NextResponse.json(
      { error: `Path not allowed: ${safePath}`, path: safePath },
      { status: 403 }
    );
  }

  const cacheKey = `${ip}:${port || ""}:${user}:${safePath}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, cached: true, path: safePath });
  }

  try {
    const data = await mikrotikFetch(ip, safePath, user, pass, 8000, port);
    setCache(cacheKey, data);
    return NextResponse.json({ data, cached: false, path: safePath });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error desconocido", path: safePath },
      { status: 502 }
    );
  }
}
