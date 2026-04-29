/**
 * Hikvision Event Store — In-memory ring buffer for camera events.
 *
 * Stores recent LPR, face recognition, and other events per node.
 * Provides SSE broadcasting to connected frontend clients.
 */

import { randomUUID } from "crypto";
import type { HikEvent, HikEventType } from "./types";
import { mapsDb } from "./db";

// ── Configuration ──

const MAX_EVENTS_PER_NODE = 200;    // Ring buffer size per node
const MAX_IMAGES = 500;              // Max cached images globally
const IMAGE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL for images

// ── Types ──

interface StoredImage {
  data: Buffer;
  contentType: string;
  createdAt: number;
}

type SSEClient = {
  id: string;
  mapId?: string;
  controller: ReadableStreamDefaultController;
};

// ── Singleton Store ──

class HikEventStore {
  private events: Map<string, HikEvent[]> = new Map();        // nodeId → events[]
  private images: Map<string, StoredImage> = new Map();        // imageId → image data
  private clients: Set<SSEClient> = new Set();                 // SSE subscribers
  private nodeMapIndex: Map<string, string> = new Map();       // nodeId → mapId
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of expired images
    this.cleanupInterval = setInterval(() => this.cleanupImages(), 5 * 60 * 1000);
  }

  // ── Node → Map registration ──

  registerNodeMap(nodeId: string, mapId: string) {
    this.nodeMapIndex.set(nodeId, mapId);
  }

  getMapForNode(nodeId: string): string | undefined {
    const cached = this.nodeMapIndex.get(nodeId);
    if (cached) return cached;

    // Auto-resolve from maps DB: scan all maps for this nodeId
    try {
      const maps = mapsDb.getAll();
      for (const map of maps) {
        const nodes = mapsDb.getNodes(map.id);
        if (nodes.some((n: any) => n.id === nodeId)) {
          this.nodeMapIndex.set(nodeId, map.id);
          console.log(`[Hik] Auto-resolved node ${nodeId} → map ${map.id} (${map.name})`);
          return map.id;
        }
      }
    } catch (err) {
      console.error("[Hik] Failed to resolve nodeId → mapId from DB:", err);
    }

    return undefined;
  }

  // ── Event Storage ──

  addEvent(event: Omit<HikEvent, "id">): HikEvent {
    const id = randomUUID();
    const fullEvent: HikEvent = { ...event, id };

    // Store in node buffer
    const nodeEvents = this.events.get(event.nodeId) || [];
    nodeEvents.push(fullEvent);
    if (nodeEvents.length > MAX_EVENTS_PER_NODE) {
      nodeEvents.shift();
    }
    this.events.set(event.nodeId, nodeEvents);

    // Broadcast to SSE clients
    this.broadcast(fullEvent);

    return fullEvent;
  }

  getNodeEvents(nodeId: string, limit: number = 50): HikEvent[] {
    const events = this.events.get(nodeId) || [];
    return events.slice(-limit);
  }

  getMapEvents(mapId: string, limit: number = 100): HikEvent[] {
    const allEvents: HikEvent[] = [];
    for (const [nodeId, events] of this.events) {
      if (this.nodeMapIndex.get(nodeId) === mapId) {
        allEvents.push(...events);
      }
    }
    // Sort by timestamp descending and limit
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allEvents.slice(0, limit);
  }

  searchPlates(query: string, limit: number = 50): HikEvent[] {
    const results: HikEvent[] = [];
    const q = query.toUpperCase();
    for (const events of this.events.values()) {
      for (const ev of events) {
        if (ev.eventType === "anpr" && ev.licensePlate?.toUpperCase().includes(q)) {
          results.push(ev);
        }
      }
    }
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results.slice(0, limit);
  }

  // ── Image Storage ──

  storeImage(data: Buffer, contentType: string = "image/jpeg"): string {
    const id = randomUUID();

    // Evict oldest if over limit
    if (this.images.size >= MAX_IMAGES) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, img] of this.images) {
        if (img.createdAt < oldestTime) {
          oldestTime = img.createdAt;
          oldestKey = key;
        }
      }
      if (oldestKey) this.images.delete(oldestKey);
    }

    this.images.set(id, { data, contentType, createdAt: Date.now() });
    return id;
  }

  getImage(id: string): StoredImage | undefined {
    return this.images.get(id);
  }

  private cleanupImages() {
    const cutoff = Date.now() - IMAGE_TTL_MS;
    for (const [id, img] of this.images) {
      if (img.createdAt < cutoff) {
        this.images.delete(id);
      }
    }
  }

  // ── SSE Broadcasting ──

  addClient(controller: ReadableStreamDefaultController, mapId?: string): string {
    const id = randomUUID();
    this.clients.add({ id, mapId, controller });
    return id;
  }

  removeClient(clientId: string) {
    for (const client of this.clients) {
      if (client.id === clientId) {
        this.clients.delete(client);
        break;
      }
    }
  }

  private broadcast(event: HikEvent) {
    const eventMapId = this.nodeMapIndex.get(event.nodeId);
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of this.clients) {
      // Filter by mapId if the client specified one
      if (client.mapId && eventMapId && client.mapId !== eventMapId) continue;

      try {
        client.controller.enqueue(new TextEncoder().encode(data));
      } catch {
        // Client disconnected — remove on next broadcast
        this.clients.delete(client);
      }
    }
  }

  // ── Stats ──

  getStats() {
    let totalEvents = 0;
    for (const events of this.events.values()) {
      totalEvents += events.length;
    }
    return {
      nodes: this.events.size,
      totalEvents,
      images: this.images.size,
      sseClients: this.clients.size,
    };
  }
}

// ── Singleton ──

let instance: HikEventStore | null = null;

export function getHikEventStore(): HikEventStore {
  if (!instance) {
    instance = new HikEventStore();
  }
  return instance;
}

// ── Debounce Cache ──

const DEBOUNCE_MS = 3000;
const debounceCache = new Map<string, number>(); // key → lastSeenTimestamp

/** Returns true if this event should be skipped (debounced) */
export function isDuplicateEvent(key: string): boolean {
  const now = Date.now();
  const last = debounceCache.get(key);
  if (last && now - last < DEBOUNCE_MS) return true;
  debounceCache.set(key, now);
  // Cleanup old entries periodically
  if (debounceCache.size > 500) {
    for (const [k, t] of debounceCache) {
      if (now - t > DEBOUNCE_MS * 10) debounceCache.delete(k);
    }
  }
  return false;
}

// ── XML Parsing Helpers ──

/** Extract a tag value from simple XML (no namespace handling needed for Hik payloads) */
export function xmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

/** Determine HikEventType from Hikvision eventType string */
export function parseHikEventType(raw: string): HikEventType {
  const lower = raw.toLowerCase();
  if (lower === "anpr" || lower.includes("vehicledetect") || lower.includes("trafficplate")) return "anpr";
  if (lower.includes("face") || lower.includes("accesscontroller")) return "face";
  if (lower === "vmd" || lower.includes("motion")) return "vmd";
  if (lower.includes("linedetection") || lower.includes("linecross")) return "line";
  if (lower.includes("fielddetection") || lower.includes("intrusion")) return "field";
  if (lower.includes("tamper")) return "tamper";
  return "unknown";
}

/** Check if XML content is a heartbeat / test / non-event message */
export function isHeartbeatOrTest(xml: string): boolean {
  const lower = xml.toLowerCase();
  return lower.includes("heartbeat") || lower.includes("stun") ||
         (!lower.includes("eventnotificationalert") && !lower.includes("anpr") && !lower.includes("face"));
}

/** Parse ANPR fields from XML — rich extraction following OmniAccess patterns */
export function parseAnprFields(xml: string): Partial<HikEvent> {
  const { getVehicleColorName, getVehicleBrandName } = require("./hikvision-codes");

  const plateRaw = xmlTag(xml, "licensePlate");
  const cleanPlate = plateRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Color: try text first, then numeric code
  const colorText = xmlTag(xml, "color");
  const colorCode = xmlTag(xml, "vehicleColor") || xmlTag(xml, "colorDepth");
  let vehicleColor: string | undefined;
  if (colorText) {
    vehicleColor = colorText;
  } else if (colorCode) {
    vehicleColor = getVehicleColorName(colorCode);
  }

  // Brand: numeric code → name
  const brandCode = xmlTag(xml, "vehicleLogoRecog") || xmlTag(xml, "vehicleLogo") ||
    xmlTag(xml, "vehicleBrand") || xmlTag(xml, "brand");
  const vehicleBrand = brandCode ? getVehicleBrandName(brandCode) : undefined;

  // Model: try multiple fields (note Hikvision typo vehileModel)
  const vehicleModel = xmlTag(xml, "vehicleModel") || xmlTag(xml, "vehileModel") || undefined;

  // List type (whitelist/blacklist decision from camera)
  const listType = xmlTag(xml, "vehicleListName") || xmlTag(xml, "listType") ||
    xmlTag(xml, "ListType") || undefined;

  return {
    licensePlate: cleanPlate === "UNKNOWN" || !cleanPlate ? "NO_LEIDA" : cleanPlate,
    plateColor: xmlTag(xml, "plateColor") || undefined,
    vehicleType: xmlTag(xml, "vehicleType") || undefined,
    vehicleColor,
    vehicleBrand: vehicleBrand && vehicleBrand !== "Unknown" ? vehicleBrand : undefined,
    vehicleModel: vehicleModel && vehicleModel !== "Unknown" ? vehicleModel : undefined,
    direction: xmlTag(xml, "direction") || undefined,
    confidence: parseInt(xmlTag(xml, "confidenceLevel")) || undefined,
    listType,
  };
}

/** Parse face recognition fields from JSON (Hikvision face events use JSON, not XML) */
export function parseFaceFromJson(jsonData: any): Partial<HikEvent> {
  const alarmData = jsonData.alarmResult?.[0] || jsonData.faceMatchResult || jsonData;
  const faceData = alarmData.faces?.[0] || alarmData.faceInfo || {};
  const identifyData = faceData.identify?.[0] || {};
  const candidate = identifyData.candidate?.[0] || {};

  const personName = (candidate.reserve_field?.name || candidate.name || "").trim();
  const similarity = candidate.similarity ? Math.floor(candidate.similarity * 100) : 0;

  return {
    faceName: personName || "Desconocido",
    similarity: similarity || undefined,
    cameraIp: jsonData.ipAddress || alarmData.ipAddress || "",
    macAddress: jsonData.macAddress || alarmData.macAddress || undefined,
  };
}

/** Parse face recognition fields from XML (legacy) */
export function parseFaceFields(xml: string): Partial<HikEvent> {
  return {
    faceName: xmlTag(xml, "name") || undefined,
    faceScore: parseInt(xmlTag(xml, "faceScore")) || undefined,
    similarity: parseInt(xmlTag(xml, "similarity")) || undefined,
    employeeNo: xmlTag(xml, "employeeNoString") || xmlTag(xml, "employeeNo") || undefined,
  };
}

/** ISAPI-compatible XML response for Hikvision NVRs/cameras */
export function isapiResponse(msg = "OK"): Response {
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
