import { NextRequest, NextResponse } from "next/server";
import {
  getHikEventStore,
  xmlTag,
  parseHikEventType,
  parseAnprFields,
  parseFaceFields,
  parseFaceFromJson,
  isHeartbeatOrTest,
  isDuplicateEvent,
  isapiResponse,
} from "@/lib/hik-events";
import type { HikEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// ── Request logging (helps diagnose camera test failures) ──

function logRequest(method: string, nodeId: string, req: NextRequest) {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  console.log(
    `[Hik] ${method} /api/hik/events/${nodeId} | ` +
    `UA: ${headers["user-agent"] || "none"} | ` +
    `CT: ${headers["content-type"] || "none"} | ` +
    `Accept: ${headers["accept"] || "none"} | ` +
    `From: ${headers["x-forwarded-for"] || headers["x-real-ip"] || "direct"}`
  );
}

// ── Shared handler for POST and PUT ──────────────────────────────────────────

async function handleEvent(
  req: NextRequest,
  nodeId: string
): Promise<Response> {
  logRequest(req.method, nodeId, req);
  const store = getHikEventStore();
  const contentType = req.headers.get("content-type") || "";

  try {
    let xmlText = "";
    let jsonText = "";
    const imageBuffers: { name: string; data: Buffer; type: string }[] = [];

    // ── Parse body ──
    if (contentType.includes("multipart/form-data")) {
      // Hikvision G2+ cameras send multipart with XML + images
      const formData = await req.formData();
      for (const [name, value] of formData.entries()) {
        if (value instanceof File) {
          // Check if it's an image
          const nameLC = name.toLowerCase();
          if (
            value.type?.startsWith("image/") ||
            nameLC.includes("picture") ||
            nameLC.includes("image") ||
            nameLC.includes("plate") ||
            nameLC.includes("face") ||
            nameLC.includes("pic") ||
            nameLC.includes("capture") ||
            nameLC.includes("snap")
          ) {
            const buf = Buffer.from(await value.arrayBuffer());
            imageBuffers.push({
              name: nameLC,
              data: buf,
              type: value.type || "image/jpeg",
            });
          } else {
            // Inspect content to determine if it's XML or JSON
            const text = await value.text();
            const trimmed = text.trim();
            if (trimmed.startsWith("<")) {
              xmlText = text;
            } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              jsonText = text;
            } else if (
              value.type?.includes("xml") ||
              nameLC.endsWith(".xml") ||
              nameLC.includes("event")
            ) {
              xmlText = text;
            } else if (value.type?.includes("json")) {
              jsonText = text;
            }
          }
        } else if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed.startsWith("<")) {
            xmlText = value;
          } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            jsonText = value;
          }
        }
      }
    } else {
      // Plain body — detect XML vs JSON from content
      const raw = await req.text();
      const trimmed = raw.trim();
      if (trimmed.startsWith("<")) {
        xmlText = raw;
      } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        jsonText = raw;
      }
    }

    // ── No data at all → test/heartbeat → ISAPI OK ──
    if (!xmlText && !jsonText) {
      return isapiResponse("OK");
    }

    // ── PATH A: JSON content — likely face event ──
    if (jsonText) {
      try {
        const jsonData = JSON.parse(jsonText);
        const hasFaceKeys =
          jsonData.alarmResult?.[0]?.faces ||
          jsonData.faceMatchResult ||
          jsonData.faces ||
          jsonData.FaceInfo ||
          jsonData.faceInfo;
        const evtType = jsonData.eventType || jsonData.alarmResult?.eventType || "";
        const isFace =
          hasFaceKeys || (evtType && evtType.toLowerCase().includes("face"));

        if (isFace) {
          const faceFields = parseFaceFromJson(jsonData);
          const dateTime = jsonData.dateTime || new Date().toISOString();

          // Store images (full scene vs face crop)
          let fullImageId: string | undefined;
          let faceImageId: string | undefined;
          if (imageBuffers.length > 0) {
            const fullImg = imageBuffers.find(
              (i) =>
                i.name.includes("background") ||
                i.name.includes("scene") ||
                i.name.includes("full")
            );
            const faceImg = imageBuffers.find(
              (i) =>
                i.name.includes("face") ||
                i.name.includes("tracking") ||
                i.name.includes("capture")
            );
            // Fallback: largest = full, second = crop
            const sorted = [...imageBuffers].sort(
              (a, b) => b.data.length - a.data.length
            );
            const fImg = fullImg || sorted[0];
            const cImg = faceImg || sorted[1];
            if (fImg) fullImageId = store.storeImage(fImg.data, fImg.type);
            if (cImg) faceImageId = store.storeImage(cImg.data, cImg.type);
          }

          const event: Omit<HikEvent, "id"> = {
            nodeId,
            mapId: store.getMapForNode(nodeId),
            eventType: "face",
            timestamp: dateTime,
            cameraIp: faceFields.cameraIp || "",
            ...faceFields,
            fullImageId,
            faceImageId,
          };

          const stored = store.addEvent(event);
          console.log(
            `[Hik] FACE event → node ${nodeId} | Name: ${stored.faceName || "?"} | Sim: ${stored.similarity || "?"}%`
          );
          return isapiResponse("OK");
        }
      } catch {
        // JSON parse failed — fall through to XML
      }
    }

    // ── PATH B: XML content — ANPR/LPR or other events ──
    if (xmlText) {
      // Heartbeat / test / non-event detection
      if (isHeartbeatOrTest(xmlText)) {
        return isapiResponse("OK");
      }

      // Must have EventNotificationAlert
      if (!xmlText.includes("EventNotificationAlert")) {
        return isapiResponse("OK");
      }

      // Parse event type
      const rawEventType = xmlTag(xmlText, "eventType");
      const eventState = xmlTag(xmlText, "eventState");

      // Skip inactive events (heartbeats)
      if (eventState === "inactive") {
        return isapiResponse("OK");
      }

      const eventType = parseHikEventType(rawEventType);
      const cameraIp = xmlTag(xmlText, "ipAddress");
      const macAddress = xmlTag(xmlText, "macAddress") || undefined;
      const channelId = xmlTag(xmlText, "channelID");
      const dateTime = xmlTag(xmlText, "dateTime") || new Date().toISOString();

      // Build base event
      const event: Omit<HikEvent, "id"> = {
        nodeId,
        mapId: store.getMapForNode(nodeId),
        eventType,
        timestamp: dateTime,
        cameraIp,
        channelId: channelId || undefined,
        macAddress,
      };

      // Parse type-specific fields
      if (eventType === "anpr") {
        const anprFields = parseAnprFields(xmlText);
        Object.assign(event, anprFields);

        // Debounce: skip if same plate on same node within 3 seconds
        if (
          anprFields.licensePlate &&
          anprFields.licensePlate !== "NO_LEIDA" &&
          isDuplicateEvent(`${nodeId}:${anprFields.licensePlate}`)
        ) {
          return isapiResponse("OK");
        }
      } else if (eventType === "face") {
        Object.assign(event, parseFaceFields(xmlText));
      }

      // Store images from multipart
      if (imageBuffers.length > 0) {
        // Classify images by field name (OmniAccess pattern)
        const plateImg = imageBuffers.find(
          (i) =>
            i.name.includes("plate") ||
            i.name.includes("licensepic") ||
            i.name.includes("detectionpic")
        );
        const faceImg = imageBuffers.find(
          (i) =>
            i.name.includes("face") ||
            i.name.includes("target") ||
            i.name.includes("snap")
        );
        // Fallback: largest = full scene, smallest = crop
        const sorted = [...imageBuffers].sort(
          (a, b) => b.data.length - a.data.length
        );
        const fullImg =
          imageBuffers.find(
            (i) =>
              i.name.includes("background") ||
              i.name.includes("scene") ||
              i.name.includes("full")
          ) || sorted[0];

        if (fullImg) event.fullImageId = store.storeImage(fullImg.data, fullImg.type);
        if (plateImg) event.plateImageId = store.storeImage(plateImg.data, plateImg.type);
        if (faceImg) event.faceImageId = store.storeImage(faceImg.data, faceImg.type);

        // If no specific plate/face image found, use second largest as crop
        if (!event.plateImageId && !event.faceImageId && sorted.length > 1) {
          const cropImg = sorted[1];
          if (eventType === "anpr") {
            event.plateImageId = store.storeImage(cropImg.data, cropImg.type);
          } else if (eventType === "face") {
            event.faceImageId = store.storeImage(cropImg.data, cropImg.type);
          }
        }
      }

      // Also check for inline base64 images in XML
      const picDataMatch = xmlText.match(/<picData>([^<]+)<\/picData>/i);
      if (picDataMatch && picDataMatch[1]) {
        try {
          const buf = Buffer.from(picDataMatch[1], "base64");
          const imageId = store.storeImage(buf, "image/jpeg");
          if (eventType === "anpr" && !event.plateImageId) {
            event.plateImageId = imageId;
          } else if (eventType === "face" && !event.faceImageId) {
            event.faceImageId = imageId;
          } else if (!event.fullImageId) {
            event.fullImageId = imageId;
          }
        } catch {
          // Invalid base64 — ignore
        }
      }

      // Store event and broadcast via SSE
      const stored = store.addEvent(event);

      console.log(
        `[Hik] ${eventType.toUpperCase()} event from ${cameraIp} → node ${nodeId}` +
          (event.licensePlate ? ` | Plate: ${event.licensePlate}` : "") +
          (event.vehicleBrand ? ` | ${event.vehicleBrand}` : "") +
          (event.vehicleColor ? ` ${event.vehicleColor}` : "") +
          (event.faceName ? ` | Face: ${event.faceName}` : "") +
          (event.listType ? ` | List: ${event.listType}` : "")
      );

      return isapiResponse("OK");
    }

    // Fallback
    return isapiResponse("OK");
  } catch (err: any) {
    console.error("[Hik] Error processing event:", err.message);
    // Always return 200 ISAPI to the NVR to prevent retries
    return isapiResponse("OK");
  }
}

// ── HTTP Method Handlers ─────────────────────────────────────────────────────

/**
 * POST /api/hik/events/[nodeId]
 * Main event receiver — Hikvision alarm server notifications.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  return handleEvent(req, nodeId);
}

/**
 * PUT /api/hik/events/[nodeId]
 * Some Hikvision firmware versions use PUT for test/notification.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  return handleEvent(req, nodeId);
}

/**
 * GET /api/hik/events/[nodeId]
 * Returns recent events for a specific node (used by frontend).
 * Cameras may also GET this URL during test — return ISAPI XML for them.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  logRequest("GET", nodeId, req);

  const accept = req.headers.get("accept") || "";
  const hasQueryParams = req.nextUrl.searchParams.has("limit") || req.nextUrl.searchParams.has("format");

  // Return JSON only if the request explicitly asks for JSON or has frontend query params.
  // Otherwise return ISAPI XML — cameras send Accept: */* or empty and expect XML.
  const wantsJson = accept.includes("application/json") || hasQueryParams ||
    (accept.includes("text/html") && !accept.includes("xml"));

  if (!wantsJson) {
    return isapiResponse("OK");
  }

  const store = getHikEventStore();
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const events = store.getNodeEvents(nodeId, limit);
  return NextResponse.json({ nodeId, count: events.length, events });
}

/**
 * OPTIONS /api/hik/events/[nodeId]
 * Some cameras send OPTIONS preflight before POST/PUT.
 */
export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  logRequest("OPTIONS", nodeId, req);
  return new Response(null, {
    status: 200,
    headers: {
      "Allow": "GET, POST, PUT, OPTIONS",
      "Content-Type": "application/xml",
    },
  });
}

/**
 * HEAD /api/hik/events/[nodeId]
 * Connectivity check — some devices use HEAD.
 */
export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  logRequest("HEAD", nodeId, req);
  return new Response(null, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}
