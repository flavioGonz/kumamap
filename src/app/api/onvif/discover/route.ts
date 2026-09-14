import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/onvif/discover
 *
 * Two modes:
 * 1. Multicast (default): WS-Discovery UDP probe — scans the whole local network.
 *    Body: { timeout?, user?, pass? }
 *
 * 2. IP Range: Directly connects to each IP in a range and probes for ONVIF.
 *    Body: { mode: "range", rangeStart: "192.168.1.1", rangeEnd: "192.168.1.50",
 *            ports?: number[], timeout?, user?, pass? }
 */
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine — use defaults
  }

  const timeout = Math.min(body.timeout || 5000, 15000); // max 15s
  const user = body.user || "admin";
  const pass = body.pass || "";

  try {
    const onvif = await import("onvif");

    if (body.mode === "range") {
      return handleRangeScan(onvif, body, user, pass, timeout);
    }

    return handleMulticastScan(onvif, user, pass, timeout);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Discovery failed", devices: [] },
      { status: 500 }
    );
  }
}

// ── Multicast WS-Discovery ───────────────────────────────────────────────

async function handleMulticastScan(
  onvif: any,
  user: string,
  pass: string,
  timeout: number
): Promise<NextResponse> {
  const Discovery = onvif.Discovery;

  const rawDevices = await new Promise<any[]>((resolve, reject) => {
    Discovery.probe({ timeout, resolve: false }, (err: any, cams: any[]) => {
      if (err) return reject(err);
      resolve(cams || []);
    });
  });

  const discovered: DiscoveredDevice[] = rawDevices.map((dev: any) => {
    const probeMatch = dev.probeMatches?.probeMatch || dev;
    const xaddrs = probeMatch?.XAddrs || probeMatch?.xaddrs || dev.xaddrs || "";
    const scopes = probeMatch?.scopes || dev.scopes || "";

    const scopeStr = typeof scopes === "string" ? scopes : Array.isArray(scopes) ? scopes.join(" ") : String(scopes || "");
    const manufacturer = extractScope(scopeStr, "hardware") || extractScope(scopeStr, "name") || extractScope(scopeStr, "mfr") || "";
    const model = extractScope(scopeStr, "model") || "";
    const name = extractScope(scopeStr, "name") || extractScope(scopeStr, "location") || "";

    const ip = extractIpFromXaddrs(xaddrs);
    const port = extractPortFromXaddrs(xaddrs);

    return {
      ip,
      port,
      xaddrs: typeof xaddrs === "string" ? xaddrs : String(xaddrs),
      manufacturer: decodeURIComponent(manufacturer),
      model: decodeURIComponent(model),
      name: decodeURIComponent(name),
      scopes: scopeStr,
      streamUri: null,
      snapshotUri: null,
      connected: false,
      error: null,
    };
  });

  const uniqueByIp = new Map<string, DiscoveredDevice>();
  for (const dev of discovered) {
    if (dev.ip && !uniqueByIp.has(dev.ip)) {
      uniqueByIp.set(dev.ip, dev);
    }
  }
  const unique = Array.from(uniqueByIp.values());

  if (user && pass) {
    const Cam = onvif.Cam;
    const connectPromises = unique.map((dev) =>
      connectAndGetStreams(Cam, dev, user, pass, Math.min(timeout, 8000))
    );
    await Promise.allSettled(connectPromises);
  }

  return NextResponse.json({
    count: unique.length,
    timeout,
    devices: unique,
  });
}

// ── IP Range scan ────────────────────────────────────────────────────────

const MAX_RANGE_IPS = 254; // Safety limit
const RANGE_BATCH_SIZE = 10; // Parallel connections per batch

function parseIpToNum(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

function numToIp(num: number): string {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");
}

function expandIpRange(start: string, end: string): string[] {
  const s = parseIpToNum(start);
  const e = parseIpToNum(end);
  if (s === null || e === null || e < s) return [];
  const count = Math.min(e - s + 1, MAX_RANGE_IPS);
  const ips: string[] = [];
  for (let i = 0; i < count; i++) {
    ips.push(numToIp(s + i));
  }
  return ips;
}

async function handleRangeScan(
  onvif: any,
  body: any,
  user: string,
  pass: string,
  timeout: number
): Promise<NextResponse> {
  const rangeStart = body.rangeStart;
  const rangeEnd = body.rangeEnd;

  if (!rangeStart || !rangeEnd) {
    return NextResponse.json(
      { error: "Se requiere rangeStart y rangeEnd", devices: [] },
      { status: 400 }
    );
  }

  const ips = expandIpRange(rangeStart, rangeEnd);
  if (ips.length === 0) {
    return NextResponse.json(
      { error: "Rango IP inválido", devices: [] },
      { status: 400 }
    );
  }

  const ports = Array.isArray(body.ports) && body.ports.length > 0
    ? body.ports.map(Number).filter((p: number) => p > 0 && p <= 65535)
    : [80, 8080]; // Default ONVIF ports

  const Cam = onvif.Cam;
  const perHostTimeout = Math.min(timeout, 5000);
  const devices: DiscoveredDevice[] = [];

  // Process IPs in batches
  for (let i = 0; i < ips.length; i += RANGE_BATCH_SIZE) {
    const batch = ips.slice(i, i + RANGE_BATCH_SIZE);
    const batchPromises = batch.flatMap((ip) =>
      ports.map((port: number) => probeOnvifDirect(Cam, ip, port, user, pass, perHostTimeout))
    );
    const results = await Promise.allSettled(batchPromises);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        devices.push(r.value);
      }
    }
  }

  // Deduplicate by IP (in case multiple ports respond for same device)
  const uniqueByIp = new Map<string, DiscoveredDevice>();
  for (const dev of devices) {
    const existing = uniqueByIp.get(dev.ip);
    // Prefer the one that connected successfully, or the one with a stream URI
    if (!existing || (!existing.connected && dev.connected) || (!existing.streamUri && dev.streamUri)) {
      uniqueByIp.set(dev.ip, dev);
    }
  }
  const unique = Array.from(uniqueByIp.values());

  return NextResponse.json({
    count: unique.length,
    timeout,
    scanned: ips.length,
    ports,
    devices: unique,
  });
}

/** Try to connect directly to an IP:port as an ONVIF device */
async function probeOnvifDirect(
  Cam: any,
  ip: string,
  port: number,
  user: string,
  pass: string,
  timeout: number
): Promise<DiscoveredDevice | null> {
  return new Promise<DiscoveredDevice | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);

    try {
      const cam = new Cam(
        { hostname: ip, port, username: user, password: pass, timeout },
        (err: any) => {
          clearTimeout(timer);
          if (err) {
            // Not an ONVIF device or auth failed — skip silently
            resolve(null);
            return;
          }

          const dev: DiscoveredDevice = {
            ip,
            port,
            xaddrs: `http://${ip}:${port}/onvif/device_service`,
            manufacturer: cam.deviceInformation?.manufacturer || "",
            model: cam.deviceInformation?.model || "",
            name: cam.deviceInformation?.model || "",
            scopes: "",
            streamUri: null,
            snapshotUri: null,
            connected: true,
            error: null,
          };

          // Get stream URI
          cam.getStreamUri(
            { protocol: "RTSP", profileToken: cam.activeSource?.profileToken },
            (err2: any, stream: any) => {
              if (!err2 && stream?.uri) {
                dev.streamUri = injectRtspCredentials(stream.uri, user, pass);
              }
              // Get snapshot URI
              cam.getSnapshotUri(
                { profileToken: cam.activeSource?.profileToken },
                (err3: any, snap: any) => {
                  if (!err3 && snap?.uri) {
                    dev.snapshotUri = snap.uri;
                  }
                  resolve(dev);
                }
              );
            }
          );
        }
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DiscoveredDevice {
  ip: string;
  port: number;
  xaddrs: string;
  manufacturer: string;
  model: string;
  name: string;
  scopes: string;
  streamUri: string | null;
  snapshotUri: string | null;
  connected: boolean;
  error: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractScope(scopes: string, key: string): string {
  // ONVIF scopes look like: onvif://www.onvif.org/name/CameraName
  const regex = new RegExp(`onvif://www\\.onvif\\.org/${key}/([^\\s]+)`, "i");
  const match = scopes.match(regex);
  return match ? match[1] : "";
}

function extractIpFromXaddrs(xaddrs: string): string {
  try {
    const match = String(xaddrs).match(/https?:\/\/([^:/\s]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function extractPortFromXaddrs(xaddrs: string): number {
  try {
    const match = String(xaddrs).match(/https?:\/\/[^:/\s]+:(\d+)/);
    return match ? parseInt(match[1]) : 80;
  } catch {
    return 80;
  }
}

/** Inject user:pass into an RTSP URI so the proxy/ffmpeg can authenticate.
 *  rtsp://192.168.1.10:554/path → rtsp://admin:pass@192.168.1.10:554/path */
function injectRtspCredentials(uri: string, user: string, pass: string): string {
  if (!user || !pass) return uri;
  try {
    // Already has credentials?
    if (uri.match(/^rtsp:\/\/[^@/]+:[^@/]+@/)) return uri;
    const encoded = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
    return uri.replace(/^rtsp:\/\//, `rtsp://${encoded}@`);
  } catch {
    return uri;
  }
}

async function connectAndGetStreams(
  Cam: any,
  dev: DiscoveredDevice,
  user: string,
  pass: string,
  timeout: number
): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      dev.error = "Timeout al conectar";
      resolve();
    }, timeout);

    try {
      const cam = new Cam(
        {
          hostname: dev.ip,
          port: dev.port,
          username: user,
          password: pass,
          timeout: timeout,
        },
        (err: any) => {
          clearTimeout(timer);
          if (err) {
            dev.error = err.message || "Error de conexión";
            resolve();
            return;
          }

          dev.connected = true;

          // Extract manufacturer/model from device info if available
          if (cam.deviceInformation) {
            if (cam.deviceInformation.manufacturer && !dev.manufacturer) {
              dev.manufacturer = cam.deviceInformation.manufacturer;
            }
            if (cam.deviceInformation.model && !dev.model) {
              dev.model = cam.deviceInformation.model;
            }
          }

          // Get stream URI
          cam.getStreamUri(
            { protocol: "RTSP", profileToken: cam.activeSource?.profileToken },
            (err2: any, stream: any) => {
              if (!err2 && stream?.uri) {
                // Inject credentials into the RTSP URI so ffmpeg/proxy can authenticate
                dev.streamUri = injectRtspCredentials(stream.uri, user, pass);
              }

              // Get snapshot URI
              cam.getSnapshotUri(
                { profileToken: cam.activeSource?.profileToken },
                (err3: any, snap: any) => {
                  if (!err3 && snap?.uri) {
                    dev.snapshotUri = snap.uri;
                  }
                  resolve();
                }
              );
            }
          );
        }
      );
    } catch (e: any) {
      clearTimeout(timer);
      dev.error = e.message || "Error inesperado";
      resolve();
    }
  });
}
