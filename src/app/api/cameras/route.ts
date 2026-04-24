import { NextResponse } from "next/server";
import getDb from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cameras
 *
 * Returns all camera nodes across all maps that have a stream configured.
 * Used by the camera grid dashboard.
 */
export async function GET() {
  try {
    const db = getDb;

    // Get all nodes from all maps
    const maps = db.prepare("SELECT id, name FROM maps").all() as { id: string; name: string }[];

    const cameras: CameraInfo[] = [];

    for (const map of maps) {
      const nodes = db
        .prepare("SELECT id, label, custom_data FROM network_map_nodes WHERE map_id = ?")
        .all(map.id) as { id: string; label: string; custom_data: string | null }[];

      for (const node of nodes) {
        if (!node.custom_data) continue;
        try {
          const data = JSON.parse(node.custom_data);
          // Check if it's a camera with a stream configured
          const icon = data.icon || "";
          const streamUrl = data.streamUrl || "";
          const streamType = data.streamType || "";

          if (icon === "camera" && streamUrl) {
            cameras.push({
              nodeId: node.id,
              mapId: map.id,
              mapName: map.name,
              label: node.label || data.label || "Cámara",
              ip: data.ip || extractIpFromUrl(streamUrl),
              streamType,
              streamUrl,
              snapshotInterval: data.snapshotInterval,
              rtspFps: data.rtspFps,
              manufacturer: data.description || "",
            });
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    return NextResponse.json({ cameras, count: cameras.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error listing cameras", cameras: [] },
      { status: 500 }
    );
  }
}

interface CameraInfo {
  nodeId: string;
  mapId: string;
  mapName: string;
  label: string;
  ip: string;
  streamType: string;
  streamUrl: string;
  snapshotInterval?: number;
  rtspFps?: number;
  manufacturer: string;
}

function extractIpFromUrl(url: string): string {
  try {
    const match = url.match(/:\/\/(?:[^:@]+(?::[^@]+)?@)?([^:/\s]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}
