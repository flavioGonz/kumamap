import { NextResponse } from "next/server";
import getDb from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cameras
 *
 * Returns ALL maps plus camera/DVR/NVR nodes for each.
 * - Camera nodes with streamUrl are direct camera feeds
 * - DVR/NVR nodes (icon=harddrive, deviceType=nvr) expose channels as RTSP streams
 * Maps without cameras are included so users can plan installations.
 */
export async function GET() {
  try {
    const db = getDb;

    const maps = db.prepare("SELECT id, name FROM network_maps").all() as { id: string; name: string }[];

    const cameras: CameraInfo[] = [];
    const allMaps: MapInfo[] = [];

    for (const map of maps) {
      const nodes = db
        .prepare("SELECT id, label, custom_data FROM network_map_nodes WHERE map_id = ?")
        .all(map.id) as { id: string; label: string; custom_data: string | null }[];

      let mapCameraCount = 0;
      let mapNvrCount = 0;

      for (const node of nodes) {
        if (!node.custom_data) continue;
        try {
          const data = JSON.parse(node.custom_data);
          const icon = data.icon || "";
          const streamUrl = data.streamUrl || "";
          const streamType = data.streamType || "";
          const deviceType = data.deviceType || "";

          // Direct camera nodes with stream configured
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
              source: "camera",
            });
            mapCameraCount++;
          }

          // DVR/NVR nodes — generate RTSP streams from channels
          if ((icon === "harddrive" || deviceType === "nvr") && data.ip) {
            const nvrIp = data.ip;
            const nvrUser = data.mgmtUser || "admin";
            const nvrPass = data.mgmtPassword || "";
            const channels: NvrChannel[] = data.nvrChannels || [];
            mapNvrCount++;

            if (channels.length > 0) {
              // Use saved channel data from ISAPI polling
              for (const ch of channels) {
                if (!ch.enabled && ch.enabled !== undefined) continue;
                const chId = ch.id || 1;
                const rtspUrl = `rtsp://${nvrUser}:${nvrPass}@${nvrIp}:554/Streaming/Channels/${String(chId).padStart(2, "0")}01`;
                cameras.push({
                  nodeId: `${node.id}_ch${chId}`,
                  mapId: map.id,
                  mapName: map.name,
                  label: ch.name || `${node.label || "NVR"} - CH${chId}`,
                  ip: nvrIp,
                  streamType: "rtsp",
                  streamUrl: rtspUrl,
                  rtspFps: data.rtspFps || 2,
                  manufacturer: data.description || data.brand || "NVR/DVR",
                  source: "nvr",
                  nvrNodeId: node.id,
                  nvrChannel: chId,
                });
              }
            } else {
              // No channel data saved yet — create a placeholder entry for the NVR itself
              // so the dashboard knows this map has recording capability
              cameras.push({
                nodeId: `${node.id}_nvr`,
                mapId: map.id,
                mapName: map.name,
                label: node.label || "NVR/DVR",
                ip: nvrIp,
                streamType: "nvr",
                streamUrl: "",
                manufacturer: data.description || data.brand || "NVR/DVR",
                source: "nvr",
                nvrNodeId: node.id,
                nvrChannel: 0,
              });
            }
          }

          // Camera nodes without stream but with IP — still count as cameras
          if (icon === "camera" && !streamUrl && data.ip) {
            cameras.push({
              nodeId: node.id,
              mapId: map.id,
              mapName: map.name,
              label: node.label || data.label || "Cámara (sin stream)",
              ip: data.ip,
              streamType: "",
              streamUrl: "",
              manufacturer: data.description || "",
              source: "camera",
            });
            mapCameraCount++;
          }
        } catch {
          // Skip malformed JSON
        }
      }

      allMaps.push({
        mapId: map.id,
        mapName: map.name,
        cameraCount: mapCameraCount,
        nvrCount: mapNvrCount,
        totalNodes: nodes.length,
      });
    }

    return NextResponse.json({
      cameras,
      maps: allMaps,
      count: cameras.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error listing cameras", cameras: [], maps: [] },
      { status: 500 },
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
  source: "camera" | "nvr";
  nvrNodeId?: string;
  nvrChannel?: number;
}

interface NvrChannel {
  id: number;
  name: string;
  enabled?: boolean;
  online?: boolean;
  recording?: boolean;
}

interface MapInfo {
  mapId: string;
  mapName: string;
  cameraCount: number;
  nvrCount: number;
  totalNodes: number;
}

function extractIpFromUrl(url: string): string {
  try {
    const match = url.match(/:\/\/(?:[^:@]+(?::[^@]+)?@)?([^:/\s]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}
