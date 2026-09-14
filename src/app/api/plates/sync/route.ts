import { NextRequest, NextResponse } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";
import https from "https";
import http from "http";

export const dynamic = "force-dynamic";

// ── Types ──

interface SyncResult {
  cameraIp: string;
  cameraLabel: string;
  success: boolean;
  added: number;
  deleted: number;
  error?: string;
}

// ── Hikvision ISAPI Helper ──

const agent = new https.Agent({ rejectUnauthorized: false });

async function isapiRequest(
  ip: string,
  path: string,
  method: string,
  user: string,
  pass: string,
  body?: string
): Promise<{ status: number; data: string }> {
  const url = `http://${ip}${path}`;
  const authHeader = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      {
        method,
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/xml",
          ...(body ? { "Content-Length": Buffer.byteLength(body).toString() } : {}),
        },
        timeout: 10000,
        ...(url.startsWith("https") ? { agent } : {}),
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, data }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Build XML for a single plate record ──

function buildPlateXml(plate: string, category: string, ownerName: string, id: string): string {
  // Hikvision vehicleList item
  const listType = category === "blocked" ? "blackList" : "whiteList";
  return `<?xml version="1.0" encoding="UTF-8"?>
<VehicleList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <VehicleInfo>
    <id>${id}</id>
    <plateNo>${plate}</plateNo>
    <listType>${listType}</listType>
    <effectiveTime>2020-01-01T00:00:00</effectiveTime>
    <expireTime>2099-12-31T23:59:59</expireTime>
    <ownerInfo>${ownerName}</ownerInfo>
  </VehicleInfo>
</VehicleList>`;
}

// ── Delete all plates from camera ──

async function clearCameraPlates(
  ip: string,
  user: string,
  pass: string
): Promise<number> {
  // GET existing plates
  let deleted = 0;
  try {
    const res = await isapiRequest(ip, "/ISAPI/Traffic/channels/1/vehicleList?format=json", "GET", user, pass);
    if (res.status === 200) {
      const data = JSON.parse(res.data);
      const vehicles = data?.VehicleList?.VehicleInfo || data?.vehicleList || [];
      const ids = Array.isArray(vehicles) ? vehicles.map((v: any) => v.id || v.ID) : [];
      for (const id of ids) {
        if (!id) continue;
        try {
          await isapiRequest(ip, `/ISAPI/Traffic/channels/1/vehicleList/${id}`, "DELETE", user, pass);
          deleted++;
        } catch {}
      }
    }
  } catch {}
  return deleted;
}

// ── Upload plates to camera ──

async function uploadPlatesToCamera(
  ip: string,
  user: string,
  pass: string,
  plates: { plate: string; category: string; ownerName: string; id: string }[]
): Promise<{ added: number; errors: number }> {
  let added = 0;
  let errors = 0;

  for (const p of plates) {
    try {
      const xml = buildPlateXml(p.plate, p.category, p.ownerName, p.id);
      const res = await isapiRequest(ip, "/ISAPI/Traffic/channels/1/vehicleList", "POST", user, pass, xml);
      if (res.status >= 200 && res.status < 300) {
        added++;
      } else if (res.data?.includes("alreadyExist") || res.data?.includes("duplicated")) {
        // Already exists — try PUT to update
        try {
          await isapiRequest(ip, `/ISAPI/Traffic/channels/1/vehicleList/${p.id}`, "PUT", user, pass, xml);
          added++;
        } catch {
          errors++;
        }
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return { added, errors };
}

/**
 * GET /api/plates/sync/read?ip=x&user=x&pass=x
 * Read the vehicle list from a single Hikvision LPR camera.
 * Returns the plates currently stored on the camera.
 */
export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get("ip");
  const user = req.nextUrl.searchParams.get("user") || "admin";
  const pass = req.nextUrl.searchParams.get("pass") || "";

  if (!ip) {
    return NextResponse.json({ error: "ip required" }, { status: 400 });
  }

  try {
    const res = await isapiRequest(
      ip,
      "/ISAPI/Traffic/channels/1/vehicleList?format=json",
      "GET",
      user,
      pass
    );

    if (res.status !== 200) {
      return NextResponse.json(
        { error: `Camera returned HTTP ${res.status}`, plates: [] },
        { status: 502 }
      );
    }

    // Parse the Hikvision response
    let cameraPlates: { id: string; plate: string; listType: string; ownerInfo?: string }[] = [];
    try {
      const data = JSON.parse(res.data);
      const vehicles = data?.VehicleList?.VehicleInfo || data?.vehicleList || [];
      const list = Array.isArray(vehicles) ? vehicles : [vehicles];
      cameraPlates = list
        .filter((v: any) => v && v.plateNo)
        .map((v: any) => ({
          id: v.id || v.ID || "",
          plate: (v.plateNo || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
          listType: v.listType || "whiteList",
          ownerInfo: v.ownerInfo || "",
        }));
    } catch {
      // Try XML parsing as fallback
      const plateMatches = res.data.matchAll(/<plateNo>([^<]+)<\/plateNo>/g);
      const idMatches = res.data.matchAll(/<id>([^<]+)<\/id>/g);
      const listMatches = res.data.matchAll(/<listType>([^<]+)<\/listType>/g);
      const ownerMatches = res.data.matchAll(/<ownerInfo>([^<]*)<\/ownerInfo>/g);

      const plates = [...plateMatches].map((m) => m[1]);
      const ids = [...idMatches].map((m) => m[1]);
      const lists = [...listMatches].map((m) => m[1]);
      const owners = [...ownerMatches].map((m) => m[1]);

      cameraPlates = plates.map((p, i) => ({
        id: ids[i] || "",
        plate: p.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        listType: lists[i] || "whiteList",
        ownerInfo: owners[i] || "",
      }));
    }

    return NextResponse.json({ ip, count: cameraPlates.length, plates: cameraPlates });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Connection error", plates: [] },
      { status: 502 }
    );
  }
}

/**
 * POST /api/plates/sync
 * Sync plates from the registry to Hikvision LPR cameras.
 * Body: { mapId, cameras: [{ ip, user, pass, label }], mode: "full" | "add_only" }
 *
 * "full" mode: clears all plates on camera, then uploads registry.
 * "add_only" mode: only uploads plates (no deletion).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mapId, cameras, mode = "full" } = body;

    if (!mapId || !cameras || !Array.isArray(cameras)) {
      return NextResponse.json({ error: "mapId and cameras array required" }, { status: 400 });
    }

    const registry = getPlateRegistry();
    const plates = registry.getPlates(mapId);

    // Only sync authorized and blocked (not visitors — those are time-bound)
    const syncPlates = plates
      .filter((p) => p.category === "authorized" || p.category === "blocked")
      .map((p) => ({
        plate: p.plate,
        category: p.category,
        ownerName: p.ownerName,
        id: p.id,
      }));

    const results: SyncResult[] = [];

    for (const cam of cameras) {
      const { ip, user = "admin", pass = "", label = ip } = cam;
      if (!ip) continue;

      try {
        let deleted = 0;

        // Full sync: clear first
        if (mode === "full") {
          deleted = await clearCameraPlates(ip, user, pass);
        }

        // Upload
        const { added, errors } = await uploadPlatesToCamera(ip, user, pass, syncPlates);

        results.push({
          cameraIp: ip,
          cameraLabel: label,
          success: errors === 0,
          added,
          deleted,
          error: errors > 0 ? `${errors} plates failed to upload` : undefined,
        });
      } catch (err: any) {
        results.push({
          cameraIp: ip,
          cameraLabel: label,
          success: false,
          added: 0,
          deleted: 0,
          error: err.message || "Connection error",
        });
      }
    }

    const totalSuccess = results.filter((r) => r.success).length;

    return NextResponse.json({
      mapId,
      totalPlates: syncPlates.length,
      totalCameras: cameras.length,
      successCameras: totalSuccess,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
