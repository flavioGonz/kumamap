/**
 * Hikvision Event Store — In-memory ring buffer for camera events.
 *
 * Stores recent LPR, face recognition, and other events per node.
 * Provides SSE broadcasting to connected frontend clients.
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { HikEvent, HikEventType } from "./types";
import { mapsDb } from "./db";

// ── Configuration ──

const MAX_EVENTS_PER_NODE = 200;    // Ring buffer size per node
const MAX_IMAGES_MEMORY = 200;      // Max cached images in RAM
const IMAGE_DIR = path.join(process.cwd(), "data", "hik-images");
const IMAGE_INDEX_FILE = path.join(IMAGE_DIR, "_index.json");
const MAX_IMAGES_DISK = 10000;      // Max images on disk before cleanup

// ── Types ──

interface StoredImage {
  data: Buffer;
  contentType: string;
  createdAt: number;
}

interface ImageIndexEntry {
  id: string;
  contentType: string;
  createdAt: number;
  size: number;
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
  private imageIndex: Map<string, ImageIndexEntry> = new Map();

  constructor() {
    // Ensure image directory exists
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    // Load image index from disk
    this.loadImageIndex();
    // Periodic cleanup of old memory cache (not disk — disk is permanent)
    this.cleanupInterval = setInterval(() => this.cleanupMemoryCache(), 10 * 60 * 1000);
  }

  private loadImageIndex() {
    try {
      if (fs.existsSync(IMAGE_INDEX_FILE)) {
        const raw = fs.readFileSync(IMAGE_INDEX_FILE, "utf-8");
        const entries: ImageIndexEntry[] = JSON.parse(raw);
        for (const e of entries) this.imageIndex.set(e.id, e);
      }
    } catch (err) {
      console.error("[Hik] Error loading image index:", err);
    }
  }

  private saveImageIndex() {
    try {
      const entries = Array.from(this.imageIndex.values());
      fs.writeFileSync(IMAGE_INDEX_FILE, JSON.stringify(entries), "utf-8");
    } catch (err) {
      console.error("[Hik] Error saving image index:", err);
    }
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

  // ── Image Storage (disk-persistent + memory cache) ──

  storeImage(data: Buffer, contentType: string = "image/jpeg"): string {
    const id = randomUUID();
    const ext = contentType.includes("png") ? ".png" : ".jpg";
    const fileName = `${id}${ext}`;
    const filePath = path.join(IMAGE_DIR, fileName);

    // Write to disk
    try {
      fs.writeFileSync(filePath, data);
    } catch (err) {
      console.error("[Hik] Error writing image to disk:", err);
    }

    // Store in memory cache
    if (this.images.size >= MAX_IMAGES_MEMORY) {
      // Evict oldest from memory (not disk)
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

    // Update index
    this.imageIndex.set(id, { id, contentType, createdAt: Date.now(), size: data.length });
    this.saveImageIndex();

    // Disk cleanup if too many files
    if (this.imageIndex.size > MAX_IMAGES_DISK) {
      this.cleanupOldDiskImages();
    }

    return id;
  }

  getImage(id: string): StoredImage | undefined {
    // Check memory first
    const cached = this.images.get(id);
    if (cached) return cached;

    // Fall back to disk
    const indexEntry = this.imageIndex.get(id);
    if (!indexEntry) {
      // Try scanning disk directly
      return this.loadImageFromDisk(id);
    }

    const ext = indexEntry.contentType.includes("png") ? ".png" : ".jpg";
    const filePath = path.join(IMAGE_DIR, `${id}${ext}`);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        const img: StoredImage = { data, contentType: indexEntry.contentType, createdAt: indexEntry.createdAt };
        // Cache in memory
        this.images.set(id, img);
        return img;
      }
    } catch {}

    return undefined;
  }

  private loadImageFromDisk(id: string): StoredImage | undefined {
    for (const ext of [".jpg", ".png"]) {
      const filePath = path.join(IMAGE_DIR, `${id}${ext}`);
      try {
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath);
          const contentType = ext === ".png" ? "image/png" : "image/jpeg";
          return { data, contentType, createdAt: Date.now() };
        }
      } catch {}
    }
    return undefined;
  }

  private cleanupMemoryCache() {
    // Only evict memory, not disk
    if (this.images.size > MAX_IMAGES_MEMORY) {
      const entries = Array.from(this.images.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toRemove = entries.slice(0, entries.length - MAX_IMAGES_MEMORY);
      for (const [key] of toRemove) this.images.delete(key);
    }
  }

  private cleanupOldDiskImages() {
    // Remove oldest disk images when over MAX_IMAGES_DISK
    const sorted = Array.from(this.imageIndex.values())
      .sort((a, b) => a.createdAt - b.createdAt);
    const toRemove = sorted.slice(0, sorted.length - MAX_IMAGES_DISK);
    for (const entry of toRemove) {
      const ext = entry.contentType.includes("png") ? ".png" : ".jpg";
      const filePath = path.join(IMAGE_DIR, `${entry.id}${ext}`);
      try { fs.unlinkSync(filePath); } catch {}
      this.imageIndex.delete(entry.id);
      this.images.delete(entry.id);
    }
    this.saveImageIndex();
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
