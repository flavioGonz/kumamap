import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

export const dynamic = "force-dynamic";

// ─── Types ─────────────────────────────────────
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

interface NvrChannelApi {
  id: number;
  name: string;
  enabled?: boolean;
  online?: boolean;
  recording?: boolean;
}

interface RackNvrInfo {
  rackNodeId: string;
  rackLabel: string;
  deviceId: string;
  deviceLabel: string;
  deviceIp: string;
  mapId: string;
  mapName: string;
  channels: RackNvrChannel[];
}

interface RackNvrChannel {
  channel: number;
  label: string;
  enabled: boolean;
  connectedCamera?: string;
  cameraIp?: string;
  recording?: string;
  resolution?: string;
  codec?: string;
}

interface MapInfo {
  mapId: string;
  mapName: string;
  cameraCount: number;
  nvrCount: number;
  totalNodes: number;
}

// ─── Helpers ───────────────────────────────────
function extractIpFromUrl(url: string): string {
  try {
    const match = url.match(/:\/\/(?:[^:@]+(?::[^@]+)?@)?([^:/\s]+)/);
    return match ? match[1] : "";
  } catch { return ""; }
}

function safeJson(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// ─── GET: list cameras + rack NVRs ─────────────
export async function GET() {
  try {
    const db = getDb;
    const maps = db.prepare("SELECT id, name FROM network_maps").all() as { id: string; name: string }[];

    const cameras: CameraInfo[] = [];
    const allMaps: MapInfo[] = [];
    const rackNvrs: RackNvrInfo[] = [];

    for (const map of maps) {
      const nodes = db
        .prepare("SELECT id, label, custom_data FROM network_map_nodes WHERE map_id = ?")
        .all(map.id) as { id: string; label: string; custom_data: string | null }[];

      let mapCameraCount = 0;
      let mapNvrCount = 0;

      for (const node of nodes) {
        const data = safeJson(node.custom_data);
        if (!data) continue;

        const icon = data.icon || "";
        const streamUrl = data.streamUrl || "";
        const streamType = data.streamType || "";
        const deviceType = data.deviceType || "";
        const isCamera = icon === "camera" || icon === "_camera" || data.type === "camera";

        // Direct camera nodes with stream configured
        if (isCamera && streamUrl) {
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

        // DVR/NVR map nodes — generate RTSP streams from channels
        if ((icon === "harddrive" || deviceType === "nvr") && data.ip) {
          const nvrIp = data.ip;
          const nvrUser = data.mgmtUser || "admin";
          const nvrPass = data.mgmtPassword || "";
          const channels: NvrChannelApi[] = data.nvrChannels || [];
          mapNvrCount++;

          if (channels.length > 0) {
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

        // Camera nodes without stream but with IP
        if (isCamera && !streamUrl && data.ip) {
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

        // Rack nodes — extract NVR devices for association
        if (icon === "_rack" && data.type === "rack" && Array.isArray(data.devices)) {
          for (const dev of data.devices) {
            if (dev.type === "nvr" && dev.nvrChannels && dev.nvrChannels.length > 0) {
              rackNvrs.push({
                rackNodeId: node.id,
                rackLabel: node.label || "Rack",
                deviceId: dev.id,
                deviceLabel: dev.label || "NVR",
                deviceIp: dev.managementIp || "",
                mapId: map.id,
                mapName: map.name,
                channels: dev.nvrChannels.map((ch: any) => ({
                  channel: ch.channel,
                  label: ch.label || `CH${ch.channel}`,
                  enabled: ch.enabled || false,
                  connectedCamera: ch.connectedCamera || "",
                  cameraIp: ch.cameraIp || "",
                  recording: ch.recording || "",
                  resolution: ch.resolution || "",
                  codec: ch.codec || "",
                })),
              });
            }
          }
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
      rackNvrs,
      count: cameras.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error listing cameras", cameras: [], maps: [], rackNvrs: [] },
      { status: 500 },
    );
  }
}

// ─── POST: associate camera with NVR channel ───
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rackNodeId, deviceId, channel, cameraLabel, cameraIp } = body;

    if (!rackNodeId || !deviceId || !channel) {
      return NextResponse.json({ error: "Missing rackNodeId, deviceId, or channel" }, { status: 400 });
    }

    const db = getDb;

    // Read the rack node
    const node = db.prepare("SELECT id, custom_data FROM network_map_nodes WHERE id = ?").get(rackNodeId) as { id: string; custom_data: string | null } | undefined;
    if (!node) {
      return NextResponse.json({ error: "Rack node not found" }, { status: 404 });
    }

    const data = safeJson(node.custom_data);
    if (!data || !Array.isArray(data.devices)) {
      return NextResponse.json({ error: "Invalid rack data" }, { status: 400 });
    }

    // Find the NVR device
    const devIdx = data.devices.findIndex((d: any) => d.id === deviceId);
    if (devIdx < 0) {
      return NextResponse.json({ error: "NVR device not found in rack" }, { status: 404 });
    }

    const dev = data.devices[devIdx];
    if (!Array.isArray(dev.nvrChannels)) {
      return NextResponse.json({ error: "Device has no NVR channels" }, { status: 400 });
    }

    // Find the channel
    const chIdx = dev.nvrChannels.findIndex((ch: any) => ch.channel === channel);
    if (chIdx < 0) {
      return NextResponse.json({ error: `Channel ${channel} not found` }, { status: 404 });
    }

    // Update the channel
    dev.nvrChannels[chIdx] = {
      ...dev.nvrChannels[chIdx],
      connectedCamera: cameraLabel || "",
      cameraIp: cameraIp || "",
      enabled: true,
    };

    data.devices[devIdx] = dev;

    // Save back
    db.prepare("UPDATE network_map_nodes SET custom_data = ? WHERE id = ?")
      .run(JSON.stringify(data), rackNodeId);

    return NextResponse.json({
      ok: true,
      channel: dev.nvrChannels[chIdx],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error associating camera" }, { status: 500 });
  }
}

// ─── PATCH: configure stream on a camera node ──
// Used by ONVIF auto-config to set streamUrl/streamType on existing camera nodes,
// or to update any camera node's stream configuration.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeId, streamUrl, streamType, snapshotUrl, manufacturer, model } = body;

    if (!nodeId) {
      return NextResponse.json({ error: "Missing nodeId" }, { status: 400 });
    }

    const db = getDb;

    const node = db.prepare("SELECT id, custom_data FROM network_map_nodes WHERE id = ?")
      .get(nodeId) as { id: string; custom_data: string | null } | undefined;

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const data = safeJson(node.custom_data) || {};

    // Update stream config
    if (streamUrl !== undefined) data.streamUrl = streamUrl;
    if (streamType !== undefined) data.streamType = streamType;
    if (snapshotUrl !== undefined) data.snapshotUrl = snapshotUrl;
    if (manufacturer !== undefined) data.description = manufacturer;
    if (model !== undefined) data.model = model;

    db.prepare("UPDATE network_map_nodes SET custom_data = ? WHERE id = ?")
      .run(JSON.stringify(data), nodeId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error updating camera" }, { status: 500 });
  }
}
