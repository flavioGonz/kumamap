/**
 * Consulta en vivo de grabadores Hikvision por ISAPI (HTTP/XML con Digest).
 *
 * La lista de grabadores (`grabadores.ts`) arma los canales desde lo que quedó
 * DOCUMENTADO en el rack. Esto es lo contrario: le pregunta al equipo lo que
 * está pasando de verdad —modelo, MAC, firmware, cada canal con su IP de cámara,
 * resolución, cuadros por segundo, códec y si está grabando— y el estado de los
 * discos con su SMART. Requiere que el servidor tenga ruta al NVR.
 *
 * El cliente digest es el mismo que ya usa /api/device-status, probado en campo;
 * acá se centraliza y se le agregan los sondeos que faltaban.
 */
import { createHash } from "crypto";

// ── Cliente Digest ISAPI ─────────────────────────────────────────────────────

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

/** GET ISAPI con digest (o basic de fallback). Prueba HTTP y HTTPS. */
export async function isapiGet(ip: string, path: string, user: string, pass: string, timeout = 8000): Promise<string | null> {
  for (const scheme of ["http", "https"]) {
    const url = `${scheme}://${ip}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r1 = await fetch(url, { signal: controller.signal, headers: { Accept: "application/xml" } });
      if (r1.ok) {
        clearTimeout(timer);
        const text = await r1.text();
        if (text.includes("<") && !text.includes("<!DOCTYPE html")) return text;
      }
      if (r1.status === 401) {
        const wwwAuth = r1.headers.get("www-authenticate") || "";
        if (wwwAuth.toLowerCase().startsWith("digest")) {
          const auth = digestAuth(user, pass, "GET", path, wwwAuth);
          const r2 = await fetch(url, { signal: controller.signal, headers: { Authorization: auth, Accept: "application/xml" } });
          clearTimeout(timer);
          if (r2.ok) return await r2.text();
        } else {
          const basic = Buffer.from(`${user}:${pass}`).toString("base64");
          const r2 = await fetch(url, { signal: controller.signal, headers: { Authorization: `Basic ${basic}`, Accept: "application/xml" } });
          clearTimeout(timer);
          if (r2.ok) return await r2.text();
        }
      }
      clearTimeout(timer);
    } catch {
      clearTimeout(timer);
      if (scheme === "http") continue;
    }
  }
  return null;
}

// ── Utilidades XML ──────────────────────────────────────────────────────────

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}
function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[0]);
  return out;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type SaludDisco = "ok" | "atencion" | "falla" | "desconocido";

export interface DiscoNvr {
  id: string;
  nombre: string;
  capacidadGB: number;
  libreGB: number;
  usadoPct: number;
  estado: string;          // texto crudo del NVR (ok / error / unformatted / sleeping…)
  salud: SaludDisco;       // normalizado para el semáforo
  propiedad: string;       // rw / ro / redundant
  temperatura: number | null;
  horasEncendido: number | null;
  sectoresMalos: number | null;
  evaluacion: string;      // "pass" / "fail" del SMART, si lo da
}

export interface CanalNvr {
  canal: number;
  nombre: string;
  camaraIp: string;
  online: boolean;
  grabando: boolean;
  resolucion: string;      // "1920x1080"
  fps: number | null;
  bitrateKbps: number | null;
  codec: string;           // H.264 / H.265…
}

export interface EstadoNvr {
  alcanzable: boolean;
  error?: string;
  info?: { modelo: string; firmware: string; serie: string; nombre: string; mac: string };
  cpuPct?: number;
  memPct?: number;
  discos: DiscoNvr[];
  canales: CanalNvr[];
  ts: number;
}

// ── Normalización de estado de disco ─────────────────────────────────────────

function normalizarSalud(estado: string, evaluacion: string, sectoresMalos: number | null): SaludDisco {
  const e = estado.toLowerCase();
  const ev = evaluacion.toLowerCase();
  if (ev === "fail" || /error|fail|fault|abnormal|damaged/.test(e)) return "falla";
  if ((sectoresMalos ?? 0) > 0 || /unformatted|sleeping|warning|smart/.test(e)) return "atencion";
  if (/ok|normal|good|idle|正常/.test(e) || ev === "pass") return "ok";
  return estado ? "atencion" : "desconocido";
}

// ── Sondeos ──────────────────────────────────────────────────────────────────

async function traerDiscos(ip: string, user: string, pass: string): Promise<DiscoNvr[]> {
  // El listado de discos vive en dos rutas según el modelo.
  let xml = await isapiGet(ip, "/ISAPI/ContentMgmt/Storage/hdd", user, pass);
  if (!xml) xml = await isapiGet(ip, "/ISAPI/ContentMgmt/Storage", user, pass);
  if (!xml) return [];
  const discos: DiscoNvr[] = [];
  for (const hdd of xmlBlocks(xml, "hdd")) {
    const id = xmlVal(hdd, "id") || `hdd-${discos.length}`;
    const capMB = parseInt(xmlVal(hdd, "capacity")) || 0;
    const libreMB = parseInt(xmlVal(hdd, "freeSpace")) || 0;
    const capGB = Math.round(capMB / 1024);
    const libreGB = Math.round(libreMB / 1024);
    const estado = xmlVal(hdd, "status") || "unknown";

    // SMART detallado (no todos los modelos lo exponen).
    let temperatura: number | null = null;
    let horas: number | null = null;
    let sectores: number | null = null;
    let evaluacion = "";
    const smartXml = await isapiGet(ip, `/ISAPI/ContentMgmt/Storage/hdd/${id}/smartInfo`, user, pass, 6000);
    if (smartXml) {
      const t = parseInt(xmlVal(smartXml, "temperature")); if (!isNaN(t)) temperatura = t;
      const h = parseInt(xmlVal(smartXml, "powerOnTime") || xmlVal(smartXml, "powerOnHours")); if (!isNaN(h)) horas = h;
      const b = parseInt(xmlVal(smartXml, "badSector") || xmlVal(smartXml, "badSectorCount")); if (!isNaN(b)) sectores = b;
      evaluacion = (xmlVal(smartXml, "evaluation") || xmlVal(smartXml, "selfEvaluation") || xmlVal(smartXml, "healthStatus")).toLowerCase();
    }

    discos.push({
      id,
      nombre: xmlVal(hdd, "hddName") || `HDD ${discos.length + 1}`,
      capacidadGB: capGB,
      libreGB,
      usadoPct: capGB > 0 ? Math.round(((capGB - libreGB) / capGB) * 100) : 0,
      estado,
      salud: normalizarSalud(estado, evaluacion, sectores),
      propiedad: xmlVal(hdd, "property") || "rw",
      temperatura,
      horasEncendido: horas,
      sectoresMalos: sectores,
      evaluacion,
    });
  }
  return discos;
}

/** Frecuencia de Hik: maxFrameRate viene ×100 (2500 = 25 fps). */
function fpsDe(x: string): number | null {
  const n = parseInt(x);
  if (isNaN(n) || n <= 0) return null;
  return n > 100 ? Math.round(n / 100) : n;
}

async function traerCanales(ip: string, user: string, pass: string): Promise<CanalNvr[]> {
  const canales = new Map<number, CanalNvr>();
  const get = (n: number): CanalNvr => {
    let c = canales.get(n);
    if (!c) { c = { canal: n, nombre: `CH${n}`, camaraIp: "", online: false, grabando: false, resolucion: "", fps: null, bitrateKbps: null, codec: "" }; canales.set(n, c); }
    return c;
  };

  // 1) Canales digitales del NVR: nombre + IP de la cámara.
  const inXml = await isapiGet(ip, "/ISAPI/ContentMgmt/InputProxy/channels", user, pass);
  if (inXml) {
    for (const b of xmlBlocks(inXml, "InputProxyChannel")) {
      const id = parseInt(xmlVal(b, "id")); if (isNaN(id)) continue;
      const c = get(id);
      c.nombre = xmlVal(b, "name") || c.nombre;
      c.camaraIp = xmlVal(b, "ipAddress") || xmlVal(b, "address") || c.camaraIp;
    }
  }
  // 2) Estado online por canal.
  const stXml = await isapiGet(ip, "/ISAPI/ContentMgmt/InputProxy/channels/status", user, pass);
  if (stXml) {
    for (const b of xmlBlocks(stXml, "InputProxyChannelStatus")) {
      const id = parseInt(xmlVal(b, "id")); if (isNaN(id)) continue;
      get(id).online = xmlVal(b, "online").toLowerCase() === "true";
    }
  }
  // 3) Config de stream: resolución, fps, bitrate, códec. El canal 101 = cám 1 main.
  const strXml = await isapiGet(ip, "/ISAPI/Streaming/channels", user, pass);
  if (strXml) {
    for (const b of xmlBlocks(strXml, "StreamingChannel")) {
      const sid = parseInt(xmlVal(b, "id")); if (isNaN(sid)) continue;
      // 101 -> canal 1 (stream principal); ignoramos los sub (…02).
      const canal = Math.floor(sid / 100);
      const tipo = sid % 100;
      if (canal < 1 || tipo !== 1) continue;
      const c = get(canal);
      const w = xmlVal(b, "videoResolutionWidth");
      const h = xmlVal(b, "videoResolutionHeight");
      if (w && h) c.resolucion = `${w}x${h}`;
      c.fps = fpsDe(xmlVal(b, "maxFrameRate")) ?? c.fps;
      const br = parseInt(xmlVal(b, "vbrUpperCap") || xmlVal(b, "constantBitRate") || xmlVal(b, "bitRate"));
      if (!isNaN(br) && br > 0) c.bitrateKbps = br;
      c.codec = xmlVal(b, "videoCodecType") || c.codec;
    }
  }
  // 4) Grabación por canal (tracks del NVR).
  const recXml = await isapiGet(ip, "/ISAPI/ContentMgmt/record/tracks", user, pass);
  if (recXml) {
    for (const b of xmlBlocks(recXml, "Track")) {
      const chan = parseInt(xmlVal(b, "Channel") || xmlVal(b, "SrcChannel") || xmlVal(b, "id"));
      const enabled = xmlVal(b, "Enable").toLowerCase() === "true" || xmlVal(b, "enable").toLowerCase() === "true";
      const trackType = xmlVal(b, "TrackType").toLowerCase();
      if (isNaN(chan)) continue;
      // Los tracks de video suelen ser IDs impares por canal; si está habilitado, graba.
      const canal = chan > 100 ? Math.floor(chan / 100) : chan;
      if (enabled && trackType !== "audio") get(canal).grabando = true;
    }
  }

  return [...canales.values()].sort((a, b) => a.canal - b.canal);
}

/** Sondeo completo de un grabador. Nunca tira: devuelve alcanzable=false con motivo. */
export async function sondearNvr(ip: string, user: string, pass: string): Promise<EstadoNvr> {
  const out: EstadoNvr = { alcanzable: false, discos: [], canales: [], ts: Date.now() };
  if (!ip) { out.error = "Sin IP de gestión"; return out; }

  let devXml = await isapiGet(ip, "/ISAPI/System/deviceInfo", user, pass);
  if (!devXml) devXml = await isapiGet(ip, "/ISAPI/System/deviceinfo", user, pass);
  if (!devXml) {
    // ¿Está viva la web al menos?
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`http://${ip}`, { signal: ctrl.signal, redirect: "manual" });
      clearTimeout(t);
      out.error = `Alcanzable (HTTP ${r.status}) pero ISAPI no respondió — verificar usuario/clave y que ISAPI esté habilitado`;
    } catch {
      out.error = `No se llega a ${ip} — verificar IP y ruta de red desde el servidor`;
    }
    return out;
  }

  out.alcanzable = true;
  out.info = {
    modelo: xmlVal(devXml, "model"),
    firmware: xmlVal(devXml, "firmwareVersion"),
    serie: xmlVal(devXml, "serialNumber"),
    nombre: xmlVal(devXml, "deviceName"),
    mac: xmlVal(devXml, "macAddress"),
  };

  const statusXml = await isapiGet(ip, "/ISAPI/System/status", user, pass);
  if (statusXml) {
    out.cpuPct = parseInt(xmlVal(statusXml, "cpuUtilization")) || undefined;
    out.memPct = parseInt(xmlVal(statusXml, "memoryUsage")) || undefined;
  }

  out.discos = await traerDiscos(ip, user, pass);
  out.canales = await traerCanales(ip, user, pass);
  return out;
}

/** Sólo discos (para la tarea diaria): más liviano que el sondeo completo. */
export async function sondearDiscosNvr(ip: string, user: string, pass: string): Promise<{ alcanzable: boolean; error?: string; info?: EstadoNvr["info"]; discos: DiscoNvr[] }> {
  if (!ip) return { alcanzable: false, error: "Sin IP de gestión", discos: [] };
  let devXml = await isapiGet(ip, "/ISAPI/System/deviceInfo", user, pass);
  if (!devXml) devXml = await isapiGet(ip, "/ISAPI/System/deviceinfo", user, pass);
  if (!devXml) return { alcanzable: false, error: `No se llega a ${ip} o ISAPI no respondió`, discos: [] };
  const info = {
    modelo: xmlVal(devXml, "model"), firmware: xmlVal(devXml, "firmwareVersion"),
    serie: xmlVal(devXml, "serialNumber"), nombre: xmlVal(devXml, "deviceName"), mac: xmlVal(devXml, "macAddress"),
  };
  const discos = await traerDiscos(ip, user, pass);
  return { alcanzable: true, info, discos };
}

/** La peor salud de un conjunto de discos, para el semáforo del grabador. */
export function peorSalud(discos: DiscoNvr[]): SaludDisco {
  if (discos.some((d) => d.salud === "falla")) return "falla";
  if (discos.some((d) => d.salud === "atencion")) return "atencion";
  if (discos.some((d) => d.salud === "ok")) return "ok";
  return "desconocido";
}
