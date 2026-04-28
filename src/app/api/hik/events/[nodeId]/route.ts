import { NextRequest, NextResponse } from "next/server";
import {
  getHikEventStore,
  xmlTag,
  parseHikEventType,
  parseAnprFields,
  parseFaceFields,
} from "@/lib/hik-events";
import type { HikEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Returns an ISAPI-compatible XML response that Hikvision NVRs/cameras
 * understand. Without this format, the NVR "Test" button reports failure
 * even when the HTTP status is 200.
 */
function isapi200(msg = "OK") {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ResponseStatus version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <requestURL>/</requestURL>
  <statusCode>1</statusCode>
  <statusString>${msg}</statusString>
  <subStatusCode>ok</subStatusCode>
</ResponseStatus>`;
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

/**
 * POST /api/hik/events/[nodeId]
 *
 * Receives Hikvision alarm server HTTP notifications.
 * Supports both plain XML and multipart/form-data (with images).
 *
 * This endpoint is PUBLIC — no session auth required.
 * The NVR/camera pushes events here directly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  const store = getHikEventStore();
  const contentType = req.headers.get("content-type") || "";

  try {
    let xmlText = "";
    const imageBuffers: { name: string; data: Buffer; type: string }[] = [];

    if (contentType.includes("multipart/form-data")) {
      // Hikvision G2+ cameras send multipart with XML + images
      const formData = await req.formData();
      for (const [name, value] of formData.entries()) {
        if (value instanceof File) {
          if (
            value.type?.includes("xml") ||
            name.toLowerCase().endsWith(".xml") ||
            name.toLowerCase().includes("event")
          ) {
            xmlText = await value.text();
          } else if (
            value.type?.startsWith("image/") ||
            name.toLowerCase().includes("picture") ||
            name.toLowerCase().includes("image") ||
            name.toLowerCase().includes("plate") ||
            name.toLowerCase().includes("face")
          ) {
            const buf = Buffer.from(await value.arrayBuffer());
            imageBuffers.push({
              name: name.toLowerCase(),
              data: buf,
              type: value.type || "image/jpeg",
            });
          }
        } else if (typeof value === "string" && value.includes("<EventNotificationAlert")) {
          xmlText = value;
        }
      }
    } else {
      // Plain XML body (older cameras)
      xmlText = await req.text();
    }

    if (!xmlText || !xmlText.includes("EventNotificationAlert")) {
      // Might be a heartbeat / videoloss keepalive / test button — acknowledge
      return isapi200("OK");
    }

    // Parse event type
    const rawEventType = xmlTag(xmlText, "eventType");
    const eventState = xmlTag(xmlText, "eventState");

    // Skip inactive events (heartbeats)
    if (eventState === "inactive") {
      return isapi200("OK");
    }

    const eventType = parseHikEventType(rawEventType);
    const cameraIp = xmlTag(xmlText, "ipAddress");
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
    };

    // Parse type-specific fields
    if (eventType === "anpr") {
      Object.assign(event, parseAnprFields(xmlText));
    } else if (eventType === "face") {
      Object.assign(event, parseFaceFields(xmlText));
    }

    // Store images
    for (const img of imageBuffers) {
      const imageId = store.storeImage(img.data, img.type);
      if (img.name.includes("plate")) {
        event.plateImageId = imageId;
      } else if (img.name.includes("face") || img.name.includes("target")) {
        event.faceImageId = imageId;
      } else {
        // Full scene image
        if (!event.fullImageId) event.fullImageId = imageId;
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
      (event.faceName ? ` | Face: ${event.faceName}` : "")
    );

    return isapi200("OK");
  } catch (err: any) {
    console.error("[Hik] Error processing event:", err.message);
    // Always return 200 to the NVR to prevent retries
    return isapi200("OK");
  }
}

/**
 * GET /api/hik/events/[nodeId]
 *
 * Returns recent events for a specific node.
 * Query params: ?limit=50
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  const store = getHikEventStore();
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

  const events = store.getNodeEvents(nodeId, limit);
  return NextResponse.json({ nodeId, count: events.length, events });
}
