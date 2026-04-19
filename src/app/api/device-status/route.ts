import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

// ── Cache ──────────────────────────────────────────────────────────────────
interface CacheEntry { data: any; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000;

function getCached(key: string): any | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return e.data;
}
function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.ts > CACHE_TTL) cache.delete(k);
  }
}

// ── Hikvision ISAPI ────────────────────────────────────────────────────────

function digestAuth(user: string, pass: string, method: string, uri: string, wwwAuth: string): string {
  const parts: Record<string, string> = {};
  wwwAuth.replace(/(\w+)="?([^",]+)"?/g, (_, k, v) => { parts[k] = v; return ""; });

  const realm = parts["realm"] || "";
  const nonce = parts["nonce"] || "";
  const qop = parts["qop"] || "auth";
  const nc = "00000001";
  const cnonce = Math.random().toString(36).slice(2, 10);

  const ha1 = createHash("md5").update(`${user}:${realm}:${pass}`).digest("hex");
  const ha2 = createHash("md5").update(`${method}:${uri}`).digest("hex");
  const response = createHash("md5").update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest("hex");

  return `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
}

async function isapiGet(ip: string, path: string, user: string, pass: string, timeout = 5000): Promise<string | null> {
  const url = `http://${ip}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    // First request to get Digest challenge
    const r1 = await fetch(url, { signal: controller.signal, headers: { Accept: "application/xml" } });
    if (r1.status !== 401) {
      clearTimeout(timer);
      return r1.ok ? await r1.text() : null;
    }

    const wwwAuth = r1.headers.get("www-authenticate") || "";
    if (!wwwAuth.toLowerCase().startsWith("digest")) { clearTimeout(timer); return null; }

    const auth = digestAuth(user, pass, "GET", path, wwwAuth);
    const r2 = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: auth, Accept: "application/xml" },
    });
    clearTimeout(timer);
    return r2.ok ? await r2.text() : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[0]);
  return results;
}

interface NvrStatus {
  type: "nvr";
  reachable: boolean;
  error?: string;
  deviceInfo?: {
    model: string;
    firmware: string;
    serial: string;
    name: string;
  };
  resources?: {
    cpuUsage: number;
    memUsage: number;
  };
  disks: Array<{
    id: string;
    name: string;
    capacityGB: number;
    freeGB: number;
    usedPercent: number;
    status: string;
    property: string;
  }>;
  channels: Array<{
    id: number;
    name: string;
    online: boolean;
    recording: boolean;
    resolution?: string;
    bitrate?: number;
  }>;
}

async function pollNvr(ip: string, user: string, pass: string): Promise<NvrStatus> {
  const result: NvrStatus = { type: "nvr", reachable: false, disks: [], channels: [] };

  // ── Device Info ──
  const devXml = await isapiGet(ip, "/ISAPI/System/deviceInfo", user, pass);
  if (!devXml) {
    result.error = "No se pudo conectar a ISAPI (verificar IP/credenciales)";
    return result;
  }

  result.reachable = true;
  result.deviceInfo = {
    model: xmlVal(devXml, "model"),
    firmware: xmlVal(devXml, "firmwareVersion"),
    serial: xmlVal(devXml, "serialNumber"),
    name: xmlVal(devXml, "deviceName"),
  };

  // ── CPU / Memory ──
  const statusXml = await isapiGet(ip, "/ISAPI/System/status", user, pass);
  if (statusXml) {
    const cpu = parseInt(xmlVal(statusXml, "cpuUtilization")) || 0;
    const mem = parseInt(xmlVal(statusXml, "memoryUsage")) || 0;
    result.resources = { cpuUsage: cpu, memUsage: mem };
  }

  // ── Storage / Disks ──
  const storageXml = await isapiGet(ip, "/ISAPI/ContentMgmt/Storage", user, pass);
  if (storageXml) {
    const hdds = xmlBlocks(storageXml, "hdd");
    for (const hdd of hdds) {
      const capMB = parseInt(xmlVal(hdd, "capacity")) || 0;
      const freeMB = parseInt(xmlVal(hdd, "freeSpace")) || 0;
      const capGB = Math.round(capMB / 1024);
      const freeGB = Math.round(freeMB / 1024);
      const usedPercent = capGB > 0 ? Math.round(((capGB - freeGB) / capGB) * 100) : 0;

      result.disks.push({
        id: xmlVal(hdd, "id") || `hdd-${result.disks.length}`,
        name: xmlVal(hdd, "hddName") || `HDD ${result.disks.length + 1}`,
        capacityGB: capGB,
        freeGB,
        usedPercent,
        status: xmlVal(hdd, "status") || "unknown",
        property: xmlVal(hdd, "property") || "rw",
      });
    }
  }

  // ── Channels (video inputs) ──
  const channelsXml = await isapiGet(ip, "/ISAPI/System/Video/inputs/channels", user, pass);
  if (channelsXml) {
    const chBlocks = xmlBlocks(channelsXml, "VideoInputChannel");
    for (const ch of chBlocks) {
      const id = parseInt(xmlVal(ch, "id")) || result.channels.length + 1;
      const name = xmlVal(ch, "name") || `CH${id}`;
      // resWidth/resHeight might be available
      const resW = xmlVal(ch, "resDesc");

      result.channels.push({
        id,
        name,
        online: true, // will be updated below
        recording: false,
        resolution: resW || undefined,
      });
    }
  }

  // ── Channel status (online/offline) ──
  const chStatusXml = await isapiGet(ip, "/ISAPI/ContentMgmt/InputProxy/channels/status", user, pass);
  if (chStatusXml) {
    const statusBlocks = xmlBlocks(chStatusXml, "InputProxyChannelStatus");
    for (const sb of statusBlocks) {
      const id = parseInt(xmlVal(sb, "id"));
      const online = xmlVal(sb, "online").toLowerCase() === "true";
      const ch = result.channels.find(c => c.id === id);
      if (ch) ch.online = online;
      else result.channels.push({ id, name: `CH${id}`, online, recording: false });
    }
  }

  // ── Recording status ──
  const recXml = await isapiGet(ip, "/ISAPI/ContentMgmt/record/control/manual/status", user, pass);
  if (recXml) {
    // Check each channel's recording status
    for (const ch of result.channels) {
      if (recXml.includes(`<id>${ch.id}</id>`) || recXml.toLowerCase().includes("recording")) {
        // Try individual channel recording status
        const chRecXml = await isapiGet(ip, `/ISAPI/ContentMgmt/record/control/manual/channels/${ch.id}/status`, user, pass);
        if (chRecXml && chRecXml.toLowerCase().includes("recording")) {
          ch.recording = true;
        }
      }
    }
  }

  // Fallback: if no channel status, try simple channels list
  if (result.channels.length === 0) {
    const simpleXml = await isapiGet(ip, "/ISAPI/System/Video/inputs/channels/status", user, pass);
    if (simpleXml) {
      const blocks = xmlBlocks(simpleXml, "VideoInputChannelStatus");
      for (const b of blocks) {
        const id = parseInt(xmlVal(b, "id")) || result.channels.length + 1;
        result.channels.push({
          id,
          name: `Canal ${id}`,
          online: xmlVal(b, "online")?.toLowerCase() === "true",
          recording: false,
        });
      }
    }
  }

  return result;
}

// ── PBX status (Grandstream / Asterisk via HTTP API) ────────────────────────

interface PbxStatus {
  type: "pbx";
  reachable: boolean;
  error?: string;
  activeCalls: number;
  totalExtensions: number;
  registeredExtensions: number;
  trunks: Array<{
    name: string;
    status: string;
    type: string;
  }>;
  calls: Array<{
    caller: string;
    callee: string;
    duration: string;
    status: string;
  }>;
}

async function pollPbx(ip: string, user: string, pass: string): Promise<PbxStatus> {
  const result: PbxStatus = {
    type: "pbx", reachable: false,
    activeCalls: 0, totalExtensions: 0, registeredExtensions: 0,
    trunks: [], calls: [],
  };

  // Try Grandstream UCM API first
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    // Grandstream UCM: login to get cookie/token
    const loginRes = await fetch(`http://${ip}:8089/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: { action: "login", user, token: createHash("md5").update(pass).digest("hex") } }),
      signal: controller.signal,
    });

    if (loginRes.ok) {
      const loginData = await loginRes.json();
      const cookie = loginData?.response?.cookie;

      if (cookie) {
        result.reachable = true;

        // Get PBX status
        const statusRes = await fetch(`http://${ip}:8089/api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: { action: "getSystemStatus", cookie } }),
          signal: controller.signal,
        });
        if (statusRes.ok) {
          const sd = await statusRes.json();
          const status = sd?.response;
          if (status) {
            result.activeCalls = parseInt(status.ActiveCalls) || 0;
          }
        }

        // Get SIP extensions
        const extRes = await fetch(`http://${ip}:8089/api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: { action: "listAccount", cookie, page: 1, item_num: 500 } }),
          signal: controller.signal,
        });
        if (extRes.ok) {
          const ed = await extRes.json();
          const accts = ed?.response?.account || [];
          result.totalExtensions = accts.length;
          result.registeredExtensions = accts.filter((a: any) => a.status === "Registered" || a.status === "2").length;
        }

        // Get trunks
        const trunkRes = await fetch(`http://${ip}:8089/api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: { action: "listVoIPTrunk", cookie, page: 1, item_num: 50 } }),
          signal: controller.signal,
        });
        if (trunkRes.ok) {
          const td = await trunkRes.json();
          const trunks = td?.response?.trunk || [];
          result.trunks = trunks.map((t: any) => ({
            name: t.trunk_name || t.trunkname || `Troncal ${t.trunk_index}`,
            status: t.reg_status === "Registered" || t.reg_status === "2" ? "registered" : t.reg_status || "unknown",
            type: t.trunk_type || "SIP",
          }));
        }

        // Logout
        await fetch(`http://${ip}:8089/api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: { action: "logout", cookie } }),
        }).catch(() => {});
      }
    }
  } catch {
    // Not a Grandstream — try generic approach
  } finally {
    clearTimeout(timer);
  }

  // If Grandstream didn't work, try ISAPI-style or mark as SNMP-only
  if (!result.reachable) {
    // Try basic HTTP check
    try {
      const controller2 = new AbortController();
      const t2 = setTimeout(() => controller2.abort(), 3000);
      const r = await fetch(`http://${ip}`, { signal: controller2.signal, redirect: "manual" });
      clearTimeout(t2);
      if (r.status > 0) {
        result.reachable = true;
        result.error = "PBX alcanzable pero API no soportada — mostrando datos SNMP";
      }
    } catch {
      result.error = "PBX no alcanzable por HTTP — mostrando datos SNMP";
    }
  }

  return result;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { ip, user, password, deviceType } = await request.json();

    if (!ip) return NextResponse.json({ error: "IP required" }, { status: 400 });

    const cacheKey = `device:${ip}:${deviceType}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cached: true });

    let result: any;

    if (deviceType === "nvr") {
      result = await pollNvr(ip, user || "admin", password || "");
    } else if (deviceType === "pbx") {
      result = await pollPbx(ip, user || "admin", password || "");
    } else {
      return NextResponse.json({ error: "Unsupported device type" }, { status: 400 });
    }

    if (result.reachable) setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message, reachable: false }, { status: 500 });
  }
}
