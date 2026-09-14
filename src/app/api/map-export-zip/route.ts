import { NextRequest, NextResponse } from "next/server";
import getDb, { mapsDb } from "@/lib/db";
// @ts-ignore — archiver has no bundled types
import archiver from "archiver";
import { PassThrough } from "stream";
import { buildRackReport } from "@/app/api/rack-report/route";
import { buildRackXlsx } from "@/app/api/rack-report-xlsx/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/map-export-zip
 *
 * Receives { mapId } and exports the ENTIRE map as a ZIP archive:
 *   - kumamap-export.json  → importable map (kumamap-v1 format, same as /api/maps/[id]/export)
 *   - Per rack folder with Word (.docx) + Excel (.xlsx) reports
 *   - resumen.json with metadata
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

    // ── Fetch full map data ──
    const map = mapsDb.getById(mapId);
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    const allNodes = mapsDb.getNodes(mapId);
    const allEdges = mapsDb.getEdges(mapId);

    // ── Build importable map JSON (kumamap-v1 format) ──
    const mapExportJson = {
      _format: "kumamap-v1",
      _exportedAt: new Date().toISOString(),
      map: {
        name: map.name,
        background_type: map.background_type,
        kuma_group_id: map.kuma_group_id,
        width: map.width,
        height: map.height,
        view_state: (map as any).view_state || null,
      },
      nodes: allNodes.map((n) => ({
        id: n.id,
        kuma_monitor_id: n.kuma_monitor_id,
        label: n.label,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        icon: n.icon,
        color: n.color,
        custom_data: n.custom_data,
      })),
      edges: allEdges.map((e) => ({
        id: e.id,
        source_node_id: e.source_node_id,
        target_node_id: e.target_node_id,
        label: e.label,
        style: e.style,
        color: e.color,
        animated: e.animated,
        custom_data: (e as any).custom_data || null,
      })),
    };

    // ── Find rack nodes ──
    const rackNodes = allNodes.filter(n => {
      const icon = n.icon || "";
      const data = safeJson(n.custom_data) || {};
      return icon === "_rack" || data.type === "rack";
    });

    // ── Build ZIP archive ──
    const archive = archiver("zip", { zlib: { level: 6 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

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

    // 1. Importable map JSON (can be re-imported via /api/maps/import)
    archive.append(JSON.stringify(mapExportJson, null, 2), { name: "kumamap-export.json" });

    // 2. Per-rack reports (Word + Excel)
    for (const node of rackNodes) {
      const data = safeJson(node.custom_data) || {};
      const rackName = data.rackName || node.label || "Rack";
      const totalUnits = data.totalUnits || 12;
      const devices = Array.isArray(data.devices) ? data.devices : [];
      const folder = `racks/${safeName(rackName)}`;

      if (devices.length === 0) continue;

      try {
        const docxBuffer = await buildRackReport(rackName, totalUnits, devices);
        archive.append(Buffer.from(docxBuffer), { name: `${folder}/${safeName(rackName)}-report.docx` });
      } catch (err) {
        console.error(`Error generating Word for rack ${rackName}:`, err);
      }

      try {
        const xlsxBuffer = await buildRackXlsx(rackName, totalUnits, devices);
        archive.append(xlsxBuffer, { name: `${folder}/${safeName(rackName)}-report.xlsx` });
      } catch (err) {
        console.error(`Error generating Excel for rack ${rackName}:`, err);
      }
    }

    // 3. Summary
    const summary = {
      mapName: map.name,
      exportedAt: new Date().toISOString(),
      totalNodes: allNodes.length,
      totalEdges: allEdges.length,
      totalRacks: rackNodes.length,
      importFile: "kumamap-export.json",
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

    const filename = `${safeName(map.name)}-export-${new Date().toISOString().slice(0, 10)}.zip`;

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
