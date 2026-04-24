import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/onvif/discover
 *
 * Scans the local network for ONVIF-compatible cameras using WS-Discovery.
 * Optionally attempts to connect and fetch stream URIs with provided credentials.
 *
 * Body: { timeout?: number, user?: string, pass?: string }
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
    // Dynamic import — onvif uses dgram which is Node-only
    const onvif = await import("onvif");
    const Discovery = onvif.Discovery;

    // Phase 1: WS-Discovery probe
    const rawDevices = await new Promise<any[]>((resolve, reject) => {
      Discovery.probe({ timeout, resolve: false }, (err: any, cams: any[]) => {
        if (err) return reject(err);
        resolve(cams || []);
      });
    });

    // Parse discovered devices
    const discovered: DiscoveredDevice[] = rawDevices.map((dev: any) => {
      const probeMatch = dev.probeMatches?.probeMatch || dev;
      const xaddrs = probeMatch?.XAddrs || probeMatch?.xaddrs || dev.xaddrs || "";
      const scopes = probeMatch?.scopes || dev.scopes || "";

      // Parse scope strings for manufacturer/model info
      const scopeStr = typeof scopes === "string" ? scopes : Array.isArray(scopes) ? scopes.join(" ") : String(scopes || "");
      const manufacturer = extractScope(scopeStr, "hardware") || extractScope(scopeStr, "name") || extractScope(scopeStr, "mfr") || "";
      const model = extractScope(scopeStr, "model") || "";
      const name = extractScope(scopeStr, "name") || extractScope(scopeStr, "location") || "";

      // Extract IP from XAddrs
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

    // Deduplicate by IP
    const uniqueByIp = new Map<string, DiscoveredDevice>();
    for (const dev of discovered) {
      if (dev.ip && !uniqueByIp.has(dev.ip)) {
        uniqueByIp.set(dev.ip, dev);
      }
    }
    const unique = Array.from(uniqueByIp.values());

    // Phase 2: Try to connect to each device and get stream URIs
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Discovery failed", devices: [] },
      { status: 500 }
    );
  }
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
                dev.streamUri = stream.uri;
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
