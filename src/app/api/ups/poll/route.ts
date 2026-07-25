import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { pollSnmpUps } from "@/lib/ups-snmp";
import { pollNut } from "@/lib/nut-client";
import { getUpsMonitor, pollUpsNode } from "@/lib/ups-monitor";
import type { UpsConfig, UpsResult } from "@/lib/ups";

/**
 * UPS polling.
 *
 * PREFERRED: pass `nodeId` — the server looks the UPS up in the map DB and uses
 * the credentials stored there. The client never sees (nor supplies) the SNMP
 * community or the NUT password. This is what the kiosk and the panel use.
 *
 * LEGACY / OPERATOR: passing `ip` + `community` directly still works, but only
 * for an authenticated session (the proxy sets `x-kumamap-auth: 1`). It exists
 * for the "probar conexión" button when configuring a UPS that isn't saved yet.
 *
 * Readings are served from the background monitor's cache when fresh, so opening
 * the panel doesn't fire a redundant SNMP round-trip.
 */

const FRESH_MS = 20_000; // a background reading younger than this is good enough

// ── Ad-hoc (unsaved) poll cache — keyed by ip+community ──────────────────────

interface CacheEntry { data: UpsResult; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 15_000; // UPS metrics change fast during an outage

function getCached(key: string): UpsResult | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return e.data;
}

function setCache(key: string, data: UpsResult) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.ts > CACHE_TTL) cache.delete(k);
  }
}

// ── Node-based polling (credentials resolved server-side) ────────────────────

function loadNodeConfig(nodeId: string): { config: UpsConfig; label: string } | null {
  const row = getDb
    .prepare("SELECT label, custom_data FROM network_map_nodes WHERE id = ?")
    .get(nodeId) as { label: string; custom_data: string | null } | undefined;

  if (!row) return null;

  let cd: any = {};
  try {
    cd = row.custom_data ? JSON.parse(row.custom_data) : {};
  } catch {
    return null;
  }

  const ip = cd.ip || cd.nutHost;
  if (!ip) return null;

  return {
    label: row.label || "UPS",
    config: {
      protocol: cd.upsProtocol || cd.protocol || "snmp",
      ip,
      snmpCommunity: cd.upsSnmpCommunity || cd.snmpCommunity || "public",
      nutPort: cd.nutPort || 3493,
      nutUpsName: cd.nutUpsName,
      nutUser: cd.nutUser,
      nutPassword: cd.nutPassword,
      kumaMonitorId: cd.kumaMonitorId ?? null,
    },
  };
}

async function pollByNodeId(nodeId: string) {
  const node = loadNodeConfig(nodeId);
  if (!node) {
    return NextResponse.json(
      { error: "Nodo UPS no encontrado o sin IP configurada", reachable: false },
      { status: 404 }
    );
  }

  // Reuse the background monitor's reading when it's recent enough.
  const cached = getUpsMonitor().getLatest(nodeId);
  if (cached && Date.now() - cached.timestamp < FRESH_MS) {
    return NextResponse.json({ ...cached, cached: true });
  }

  const result = await pollUpsNode(node.config);
  return NextResponse.json(result);
}

// ── Ad-hoc polling (operator only) ───────────────────────────────────────────

async function pollAdHoc(
  headers: Headers,
  params: { ip?: string; community?: string; protocol?: string; nutPort?: number; nutUpsName?: string }
) {
  if (headers.get("x-kumamap-auth") !== "1") {
    return NextResponse.json(
      { error: "Consultar por IP requiere sesión. Los clientes públicos deben usar nodeId.", reachable: false },
      { status: 401 }
    );
  }

  const { ip } = params;
  if (!ip) {
    return NextResponse.json({ error: "Falta 'nodeId' o 'ip'", reachable: false }, { status: 400 });
  }

  const community = params.community || "public";
  const protocol = params.protocol === "nut" ? "nut" : "snmp";
  const cacheKey = `ups:${protocol}:${ip}:${community}:${params.nutPort ?? ""}:${params.nutUpsName ?? ""}`;

  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const result =
    protocol === "nut"
      ? await pollNut({ host: ip, port: params.nutPort, upsName: params.nutUpsName })
      : await pollSnmpUps(ip, community);

  if (result.reachable) setCache(cacheKey, result);
  return NextResponse.json(result);
}

// ── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/ups/poll?nodeId=... (public) — or ?ip=&community= (auth only) */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const nodeId = sp.get("nodeId");
    if (nodeId) return await pollByNodeId(nodeId);

    return await pollAdHoc(request.headers, {
      ip: sp.get("ip") || undefined,
      community: sp.get("community") || undefined,
      protocol: sp.get("protocol") || undefined,
      nutPort: sp.get("nutPort") ? Number(sp.get("nutPort")) : undefined,
      nutUpsName: sp.get("nutUpsName") || undefined,
    });
  } catch (err: any) {
    console.error("UPS poll error:", err);
    return NextResponse.json({ error: err.message, reachable: false }, { status: 500 });
  }
}

/** POST /api/ups/poll — body: { nodeId } or { ip, community, protocol, ... } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.nodeId) return await pollByNodeId(String(body.nodeId));

    return await pollAdHoc(request.headers, {
      ip: body?.ip,
      community: body?.community,
      protocol: body?.protocol,
      nutPort: body?.nutPort,
      nutUpsName: body?.nutUpsName,
    });
  } catch (err: any) {
    console.error("UPS poll error:", err);
    return NextResponse.json({ error: err.message, reachable: false }, { status: 500 });
  }
}
