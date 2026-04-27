import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
// @ts-ignore — archiver has no bundled types
import archiver from "archiver";
import { PassThrough } from "stream";
import { buildRackReport } from "@/app/api/rack-report/route";
import { buildRackXlsx } from "@/app/api/rack-report-xlsx/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/map-export-zip
 *
 * Receives { mapId } and exports ALL rack nodes in that map as a ZIP archive.
 * Each rack gets:
 *   - Word (.docx) report — same as /api/rack-report
 *   - Excel (.xlsx) report — same as /api/rack-report-xlsx
 *
 * Also includes the node list XLSX (basic summary of every node on the map).
 */

function safeJson(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, "").replace(/\s+/g, "_").substring(0, 60);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mapId } = body;

    if (!mapId) {
      return NextResponse.json({ error: "Missing mapId" }, { status: 400 });
    }

    const db = getDb;

    // Verify map exists
    const map = db.prepare("SELECT id, name FROM network_maps WHERE id = ?").get(mapId) as
      { id: string; name: string } | undefined;
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    // Find all rack nodes in this map
    const nodes = db
      .prepare("SELECT id, label, icon, custom_data FROM network_map_nodes WHERE map_id = ?")
      .all(mapId) as { id: string; label: string; icon: string | null; custom_data: string | null }[];

    const rackNodes = nodes.filter(n => {
      const icon = n.icon || "";
      const data = safeJson(n.custom_data) || {};
      return icon === "_rack" || data.type === "rack";
    });

    if (rackNodes.length === 0) {
      return NextResponse.json({ error: "No hay racks en este mapa" }, { status: 404 });
    }

    // Build ZIP archive
    const archive = archiver("zip", { zlib: { level: 6 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Collect all buffers
    const chunks: Uint8Array[] = [];
    passthrough.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));

    const done = new Promise<Uint8Array>((resolve, reject) => {
      passthrough.on("end", () => {
        const totalLength = chunks.reduce((s, c) => s + c.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(result);
      });
      passthrough.on("error", reject);
      archive.on("error", reject);
    });

    // Process each rack
    for (const node of rackNodes) {
      const data = safeJson(node.custom_data) || {};
      const rackName = data.rackName || node.label || "Rack";
      const totalUnits = data.totalUnits || 12;
      const devices = Array.isArray(data.devices) ? data.devices : [];
      const folder = safeName(rackName);

      if (devices.length === 0) continue;

      try {
        // Generate Word report
        const docxBuffer = await buildRackReport(rackName, totalUnits, devices);
        archive.append(Buffer.from(docxBuffer), { name: `${folder}/${folder}-report.docx` });
      } catch (err) {
        console.error(`Error generating Word for rack ${rackName}:`, err);
      }

      try {
        // Generate Excel report
        const xlsxBuffer = await buildRackXlsx(rackName, totalUnits, devices);
        archive.append(xlsxBuffer, { name: `${folder}/${folder}-report.xlsx` });
      } catch (err) {
        console.error(`Error generating Excel for rack ${rackName}:`, err);
      }
    }

    // Add a summary JSON with map info and rack list
    const summary = {
      mapName: map.name,
      exportedAt: new Date().toISOString(),
      totalNodes: nodes.length,
      totalRacks: rackNodes.length,
      racks: rackNodes.map(n => {
        const data = safeJson(n.custom_data) || {};
        const devices = Array.isArray(data.devices) ? data.devices : [];
        return {
          name: data.rackName || n.label || "Rack",
          totalUnits: data.totalUnits || 0,
          deviceCount: devices.length,
          usedUnits: devices.reduce((s: number, d: any) => s + (d.sizeUnits || 1), 0),
        };
      }),
    };
    archive.append(JSON.stringify(summary, null, 2), { name: "resumen.json" });

    await archive.finalize();
    const zipBytes = await done;

    const filename = `${safeName(map.name)}-racks-export-${new Date().toISOString().slice(0, 10)}.zip`;

    return new Response(zipBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(zipBytes.length),
      },
    });
  } catch (err: any) {
    console.error("Map export ZIP error:", err);
    return NextResponse.json({ error: err.message || "Error generating ZIP" }, { status: 500 });
  }
}
