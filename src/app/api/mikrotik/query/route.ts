import { NextRequest, NextResponse } from "next/server";

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

// ── Generic MikroTik REST API proxy ───────────────────────────────────────

async function mikrotikFetch(
  ip: string,
  path: string,
  user: string,
  pass: string,
  timeoutMs = 8000,
  port?: number
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  for (const scheme of ["https", "http"]) {
    try {
      const effectivePort = port || (scheme === "https" ? 443 : 80);
      const portSuffix = (scheme === "https" && effectivePort === 443) || (scheme === "http" && effectivePort === 80) ? "" : `:${effectivePort}`;
      const url = `${scheme}://${ip}${portSuffix}/rest${path}`;

      const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      if (scheme === "https") {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      }

      const res = await fetch(url, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (scheme === "https") {
        if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
      }

      clearTimeout(timer);

      if (res.ok) return await res.json();
      if (res.status === 401) throw new Error("Credenciales inválidas (401)");
      if (scheme === "https") continue;
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      clearTimeout(timer);
      if (err.message?.includes("Credenciales")) throw err;
      if (scheme === "https") continue;
      throw err;
    }
  }

  throw new Error("No se pudo conectar al router");
}

// ── Handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ip = searchParams.get("ip");
  const port = searchParams.get("port") ? parseInt(searchParams.get("port")!) : undefined;
  const user = searchParams.get("user") || "admin";
  const pass = searchParams.get("pass") || "";
  const path = searchParams.get("path"); // e.g. "/ip/route", "/ip/firewall/filter", "/log"

  if (!ip || !path) {
    return NextResponse.json({ error: "ip and path are required" }, { status: 400 });
  }

  // Sanitize path - must start with /
  const safePath = path.startsWith("/") ? path : `/${path}`;

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
    return NextResponse.json({ error: err.message || "Error desconocido", path: safePath }, { status: 502 });
  }
}
