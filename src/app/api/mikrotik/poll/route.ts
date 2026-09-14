import { NextRequest, NextResponse } from "next/server";
import { mikrotikFetch } from "@/lib/mikrotik-client";

export const dynamic = "force-dynamic";

// ── Cache ──────────────────────────────────────────────────────────────────
interface CacheEntry { data: MikrotikResult; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 15_000; // 15 seconds

function getCached(key: string): MikrotikResult | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return { ...e.data, cached: true };
}

function setCache(key: string, data: MikrotikResult) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.ts > CACHE_TTL) cache.delete(k);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface MikrotikInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  speed?: string;
  macAddress?: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
  comment?: string;
}

interface MikrotikIpAddress {
  address: string;
  network: string;
  interface: string;
  disabled: boolean;
  dynamic: boolean;
}

interface MikrotikResource {
  uptime: string;
  cpuLoad: number;
  cpuCount: number;
  cpuFrequency: number;
  freeMemory: number;
  totalMemory: number;
  freeHddSpace: number;
  totalHddSpace: number;
  architectureName: string;
  boardName: string;
  platform: string;
  version: string;
  buildTime?: string;
}

interface MikrotikIdentity {
  name: string;
}

interface MikrotikRouterboard {
  model?: string;
  serialNumber?: string;
  firmwareType?: string;
  currentFirmware?: string;
  upgradeFirmware?: string;
}

interface MikrotikDhcpLease {
  address: string;
  macAddress: string;
  hostName?: string;
  status: string;
  server: string;
  comment?: string;
}

interface MikrotikResult {
  ip: string;
  timestamp: number;
  reachable: boolean;
  cached?: boolean;
  error?: string;
  identity?: MikrotikIdentity;
  resource?: MikrotikResource;
  routerboard?: MikrotikRouterboard;
  interfaces?: MikrotikInterface[];
  ipAddresses?: MikrotikIpAddress[];
  dhcpLeases?: MikrotikDhcpLease[];
}

// ── Parse helpers ──────────────────────────────────────────────────────────

function parseInterfaces(raw: any[]): MikrotikInterface[] {
  return (raw || []).map((i: any) => ({
    name: i.name || i[".id"] || "?",
    type: i.type || "unknown",
    running: i.running === "true" || i.running === true,
    disabled: i.disabled === "true" || i.disabled === true,
    speed: i["rate"] || i["speed"] || undefined,
    macAddress: i["mac-address"] || undefined,
    rxBytes: parseInt(i["rx-byte"] || "0", 10),
    txBytes: parseInt(i["tx-byte"] || "0", 10),
    rxPackets: parseInt(i["rx-packet"] || "0", 10),
    txPackets: parseInt(i["tx-packet"] || "0", 10),
    rxErrors: parseInt(i["rx-error"] || "0", 10),
    txErrors: parseInt(i["tx-error"] || "0", 10),
    comment: i.comment || undefined,
  }));
}

function parseIpAddresses(raw: any[]): MikrotikIpAddress[] {
  return (raw || []).map((a: any) => ({
    address: a.address || "?",
    network: a.network || "?",
    interface: a.interface || "?",
    disabled: a.disabled === "true" || a.disabled === true,
    dynamic: a.dynamic === "true" || a.dynamic === true,
  }));
}

function parseResource(raw: any): MikrotikResource {
  return {
    uptime: raw.uptime || "?",
    cpuLoad: parseInt(raw["cpu-load"] || "0", 10),
    cpuCount: parseInt(raw["cpu-count"] || "1", 10),
    cpuFrequency: parseInt(raw["cpu-frequency"] || "0", 10),
    freeMemory: parseInt(raw["free-memory"] || "0", 10),
    totalMemory: parseInt(raw["total-memory"] || "0", 10),
    freeHddSpace: parseInt(raw["free-hdd-space"] || "0", 10),
    totalHddSpace: parseInt(raw["total-hdd-space"] || "0", 10),
    architectureName: raw["architecture-name"] || "?",
    boardName: raw["board-name"] || "?",
    platform: raw.platform || "?",
    version: raw.version || "?",
    buildTime: raw["build-time"] || undefined,
  };
}

function parseRouterboard(raw: any): MikrotikRouterboard {
  return {
    model: raw.model || undefined,
    serialNumber: raw["serial-number"] || undefined,
    firmwareType: raw["firmware-type"] || undefined,
    currentFirmware: raw["current-firmware"] || undefined,
    upgradeFirmware: raw["upgrade-firmware"] || undefined,
  };
}

function parseDhcpLeases(raw: any[]): MikrotikDhcpLease[] {
  return (raw || []).map((l: any) => ({
    address: l.address || "?",
    macAddress: l["mac-address"] || "?",
    hostName: l["host-name"] || undefined,
    status: l.status || "?",
    server: l.server || "?",
    comment: l.comment || undefined,
  }));
}

// ── POST handler (credentials in body, not URL) ──────────────────────────

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ip, port, user = "admin", pass = "" } = body;

  if (!ip) {
    return NextResponse.json({ error: "ip is required" }, { status: 400 });
  }

  // Check cache
  const cacheKey = `${ip}:${user}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const result: MikrotikResult = {
    ip,
    timestamp: Date.now(),
    reachable: false,
  };

  try {
    // Fetch all endpoints in parallel
    const [identityRaw, resourceRaw, routerboardRaw, interfacesRaw, ipRaw, dhcpRaw] =
      await Promise.allSettled([
        mikrotikFetch(ip, "/system/identity", user, pass, 8000, port),
        mikrotikFetch(ip, "/system/resource", user, pass, 8000, port),
        mikrotikFetch(ip, "/system/routerboard", user, pass, 8000, port),
        mikrotikFetch(ip, "/interface", user, pass, 8000, port),
        mikrotikFetch(ip, "/ip/address", user, pass, 8000, port),
        mikrotikFetch(ip, "/ip/dhcp-server/lease", user, pass, 5000, port),
      ]);

    result.reachable = true;

    if (identityRaw.status === "fulfilled") {
      result.identity = { name: identityRaw.value?.name || identityRaw.value?.[0]?.name || "?" };
    }

    if (resourceRaw.status === "fulfilled") {
      result.resource = parseResource(resourceRaw.value);
    }

    if (routerboardRaw.status === "fulfilled") {
      result.routerboard = parseRouterboard(routerboardRaw.value);
    }

    if (interfacesRaw.status === "fulfilled") {
      result.interfaces = parseInterfaces(interfacesRaw.value);
    }

    if (ipRaw.status === "fulfilled") {
      result.ipAddresses = parseIpAddresses(ipRaw.value);
    }

    if (dhcpRaw.status === "fulfilled") {
      result.dhcpLeases = parseDhcpLeases(dhcpRaw.value);
    }

    // If all failed, check the first error
    const allFailed = [identityRaw, resourceRaw, interfacesRaw].every(
      (r) => r.status === "rejected"
    );
    if (allFailed) {
      result.reachable = false;
      const firstErr = (identityRaw as PromiseRejectedResult).reason;
      result.error = firstErr?.message || "No se pudo conectar";
    }

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: any) {
    result.error = err.message || "Error desconocido";
    return NextResponse.json(result);
  }
}

// ── Legacy GET (backwards compat during transition — remove later) ───────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ip = searchParams.get("ip");
  const port = searchParams.get("port") ? parseInt(searchParams.get("port")!) : undefined;
  const user = searchParams.get("user") || "admin";
  const pass = searchParams.get("pass") || "";

  if (!ip) {
    return NextResponse.json({ error: "ip is required" }, { status: 400 });
  }

  // Check cache
  const cacheKey = `${ip}:${user}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const result: MikrotikResult = {
    ip,
    timestamp: Date.now(),
    reachable: false,
  };

  try {
    const [identityRaw, resourceRaw, routerboardRaw, interfacesRaw, ipRaw, dhcpRaw] =
      await Promise.allSettled([
        mikrotikFetch(ip, "/system/identity", user, pass, 8000, port),
        mikrotikFetch(ip, "/system/resource", user, pass, 8000, port),
        mikrotikFetch(ip, "/system/routerboard", user, pass, 8000, port),
        mikrotikFetch(ip, "/interface", user, pass, 8000, port),
        mikrotikFetch(ip, "/ip/address", user, pass, 8000, port),
        mikrotikFetch(ip, "/ip/dhcp-server/lease", user, pass, 5000, port),
      ]);

    result.reachable = true;

    if (identityRaw.status === "fulfilled") result.identity = { name: identityRaw.value?.name || identityRaw.value?.[0]?.name || "?" };
    if (resourceRaw.status === "fulfilled") result.resource = parseResource(resourceRaw.value);
    if (routerboardRaw.status === "fulfilled") result.routerboard = parseRouterboard(routerboardRaw.value);
    if (interfacesRaw.status === "fulfilled") result.interfaces = parseInterfaces(interfacesRaw.value);
    if (ipRaw.status === "fulfilled") result.ipAddresses = parseIpAddresses(ipRaw.value);
    if (dhcpRaw.status === "fulfilled") result.dhcpLeases = parseDhcpLeases(dhcpRaw.value);

    const allFailed = [identityRaw, resourceRaw, interfacesRaw].every((r) => r.status === "rejected");
    if (allFailed) {
      result.reachable = false;
      const firstErr = (identityRaw as PromiseRejectedResult).reason;
      result.error = firstErr?.message || "No se pudo conectar";
    }

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: any) {
    result.error = err.message || "Error desconocido";
    return NextResponse.json(result);
  }
}
