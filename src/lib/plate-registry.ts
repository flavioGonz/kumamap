/**
 * Plate Registry — JSON-file-based license plate management.
 *
 * Each map gets its own plates.json file stored in data/plates/<mapId>.json.
 * Supports three plate categories: authorized, visitor (with date range), blocked.
 * Provides a match engine for real-time ANPR event classification.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ── Types ──

export type PlateCategory = "authorized" | "visitor" | "blocked";

export interface PlateRecord {
  id: string;
  plate: string;           // Normalized plate (uppercase, no special chars)
  category: PlateCategory;
  ownerName: string;        // Person or company name
  vehicleDesc?: string;     // e.g. "Toyota Hilux gris"
  notes?: string;
  validFrom?: string;       // ISO date — for visitors
  validUntil?: string;      // ISO date — for visitors
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
  mapId: string;            // Which map this plate belongs to
}

export type PlateMatchResult = "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";

export interface PlateMatch {
  result: PlateMatchResult;
  record?: PlateRecord;     // The matched record (if any)
}

// ── Access Log Types ──

export interface AccessLogEntry {
  id: string;
  timestamp: string;        // ISO datetime
  plate: string;
  matchResult: PlateMatchResult;
  ownerName?: string;
  nodeId: string;
  nodeLabel?: string;       // Camera name from the map
  mapId: string;
  cameraIp?: string;
  vehicleColor?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  direction?: string;
  confidence?: number;
  fullImageId?: string;
  plateImageId?: string;
  eventId: string;          // Reference to the HikEvent id
  // AI verification fields
  aiVerification?: "COINCIDE" | "NO_COINCIDE" | "NO_VISIBLE" | "pending" | "error";
  aiPlateRead?: string;     // What AI read from the image
  aiVehicleType?: string;   // AI-detected vehicle type
  aiVehicleColor?: string;  // AI-detected color
  aiVehicleBrand?: string;  // AI-detected brand
  aiConfidence?: string;    // AI confidence level
  aiNotes?: string;         // AI observations
}

// ── Configuration ──

const DATA_DIR = path.join(process.cwd(), "data", "plates");
const LOG_DIR = path.join(process.cwd(), "data", "access-logs");
const MAX_LOG_ENTRIES = 10000; // Per map, ~30 days at moderate traffic

// ── Singleton ──

class PlateRegistryManager {
  private registries: Map<string, PlateRecord[]> = new Map(); // mapId → plates
  private accessLogs: Map<string, AccessLogEntry[]> = new Map(); // mapId → log entries
  private dirty: Set<string> = new Set(); // mapIds with unsaved changes
  private logDirty: Set<string> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Ensure data directories exist
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  // ── Plate Registry CRUD ──

  private loadRegistry(mapId: string): PlateRecord[] {
    if (this.registries.has(mapId)) return this.registries.get(mapId)!;

    const filePath = path.join(DATA_DIR, `${mapId}.json`);
    let records: PlateRecord[] = [];
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        records = JSON.parse(raw);
      }
    } catch (err) {
      console.error(`[PlateRegistry] Error loading ${filePath}:`, err);
    }
    this.registries.set(mapId, records);
    return records;
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushAll();
    }, 2000); // Debounce writes by 2 seconds
  }

  private flushAll() {
    for (const mapId of this.dirty) {
      const records = this.registries.get(mapId);
      if (!records) continue;
      const filePath = path.join(DATA_DIR, `${mapId}.json`);
      try {
        fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
      } catch (err) {
        console.error(`[PlateRegistry] Error saving ${filePath}:`, err);
      }
    }
    this.dirty.clear();

    for (const mapId of this.logDirty) {
      const entries = this.accessLogs.get(mapId);
      if (!entries) continue;
      const filePath = path.join(LOG_DIR, `${mapId}.json`);
      try {
        fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf-8");
      } catch (err) {
        console.error(`[PlateRegistry] Error saving log ${filePath}:`, err);
      }
    }
    this.logDirty.clear();
  }

  /** Normalize a plate string for comparison */
  static normalizePlate(plate: string): string {
    return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  /** Get all plates for a map */
  getPlates(mapId: string): PlateRecord[] {
    return this.loadRegistry(mapId);
  }

  /** Get a specific plate record */
  getPlate(mapId: string, id: string): PlateRecord | undefined {
    return this.loadRegistry(mapId).find((p) => p.id === id);
  }

  /** Add a new plate to the registry */
  addPlate(mapId: string, data: Omit<PlateRecord, "id" | "createdAt" | "updatedAt" | "mapId" | "plate"> & { plate: string }): PlateRecord {
    const records = this.loadRegistry(mapId);
    const normalized = PlateRegistryManager.normalizePlate(data.plate);

    // Check for duplicates
    const existing = records.find((p) => p.plate === normalized);
    if (existing) {
      // Update existing instead of duplicating
      Object.assign(existing, {
        ...data,
        plate: normalized,
        updatedAt: new Date().toISOString(),
      });
      this.dirty.add(mapId);
      this.scheduleSave();
      return existing;
    }

    const record: PlateRecord = {
      id: randomUUID(),
      ...data,
      plate: normalized,
      mapId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    records.push(record);
    this.dirty.add(mapId);
    this.scheduleSave();
    return record;
  }

  /** Update a plate record */
  updatePlate(mapId: string, id: string, data: Partial<Omit<PlateRecord, "id" | "mapId" | "createdAt">>): PlateRecord | null {
    const records = this.loadRegistry(mapId);
    const record = records.find((p) => p.id === id);
    if (!record) return null;

    if (data.plate) data.plate = PlateRegistryManager.normalizePlate(data.plate);
    Object.assign(record, data, { updatedAt: new Date().toISOString() });
    this.dirty.add(mapId);
    this.scheduleSave();
    return record;
  }

  /** Delete a plate record */
  deletePlate(mapId: string, id: string): boolean {
    const records = this.loadRegistry(mapId);
    const idx = records.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    records.splice(idx, 1);
    this.dirty.add(mapId);
    this.scheduleSave();
    return true;
  }

  /** Search plates by query (partial match on plate or ownerName) */
  searchPlates(mapId: string, query: string): PlateRecord[] {
    const records = this.loadRegistry(mapId);
    const q = query.toUpperCase();
    return records.filter(
      (p) => p.plate.includes(q) || p.ownerName.toUpperCase().includes(q)
    );
  }

  // ── Match Engine ──

  /** Match a plate against the registry, returning classification */
  matchPlate(mapId: string, rawPlate: string): PlateMatch {
    if (!rawPlate || rawPlate === "NO_LEIDA") {
      return { result: "unknown" };
    }

    const normalized = PlateRegistryManager.normalizePlate(rawPlate);
    const records = this.loadRegistry(mapId);
    const record = records.find((p) => p.plate === normalized);

    if (!record) {
      return { result: "unknown" };
    }

    if (record.category === "blocked") {
      return { result: "blocked", record };
    }

    if (record.category === "visitor") {
      // Check date range
      const now = new Date();
      if (record.validFrom && new Date(record.validFrom) > now) {
        return { result: "visitor_expired", record };
      }
      if (record.validUntil && new Date(record.validUntil) < now) {
        return { result: "visitor_expired", record };
      }
      return { result: "visitor", record };
    }

    return { result: "authorized", record };
  }

  // ── Access Log ──

  private loadAccessLog(mapId: string): AccessLogEntry[] {
    if (this.accessLogs.has(mapId)) return this.accessLogs.get(mapId)!;

    const filePath = path.join(LOG_DIR, `${mapId}.json`);
    let entries: AccessLogEntry[] = [];
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        entries = JSON.parse(raw);
      }
    } catch (err) {
      console.error(`[PlateRegistry] Error loading access log ${filePath}:`, err);
    }
    this.accessLogs.set(mapId, entries);
    return entries;
  }

  /** Log an access event */
  logAccess(entry: Omit<AccessLogEntry, "id">): AccessLogEntry {
    const log = this.loadAccessLog(entry.mapId);
    const full: AccessLogEntry = { id: randomUUID(), ...entry };

    log.push(full);

    // Trim to max size (remove oldest)
    if (log.length > MAX_LOG_ENTRIES) {
      log.splice(0, log.length - MAX_LOG_ENTRIES);
    }

    this.logDirty.add(entry.mapId);
    this.scheduleSave();
    return full;
  }

  /** Update an access log entry (for AI verification results) */
  updateAccessLog(mapId: string, entryId: string, updates: Partial<AccessLogEntry>): AccessLogEntry | null {
    const log = this.loadAccessLog(mapId);
    const entry = log.find(e => e.id === entryId);
    if (!entry) return null;
    Object.assign(entry, updates);
    this.logDirty.add(mapId);
    this.scheduleSave();
    return entry;
  }

  /** Get access log entries with optional filters */
  getAccessLog(
    mapId: string,
    opts?: {
      plate?: string;
      from?: string;    // ISO date
      until?: string;   // ISO date
      nodeId?: string;
      matchResult?: PlateMatchResult;
      limit?: number;
    }
  ): AccessLogEntry[] {
    let entries = this.loadAccessLog(mapId);

    if (opts?.plate) {
      const q = PlateRegistryManager.normalizePlate(opts.plate);
      entries = entries.filter((e) => e.plate.includes(q));
    }
    if (opts?.from) {
      const from = new Date(opts.from).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() >= from);
    }
    if (opts?.until) {
      const until = new Date(opts.until).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() <= until);
    }
    if (opts?.nodeId) {
      entries = entries.filter((e) => e.nodeId === opts.nodeId);
    }
    if (opts?.matchResult) {
      entries = entries.filter((e) => e.matchResult === opts.matchResult);
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const limit = opts?.limit ?? 200;
    return entries.slice(0, limit);
  }

  /** Get plate history — all accesses for a specific plate */
  getPlateHistory(mapId: string, plate: string, limit = 100): AccessLogEntry[] {
    const normalized = PlateRegistryManager.normalizePlate(plate);
    return this.getAccessLog(mapId, { plate: normalized, limit });
  }

  /** Get access stats for a map */
  getStats(mapId: string, days = 7) {
    const entries = this.loadAccessLog(mapId);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);

    // Count by result
    const byResult: Record<string, number> = {};
    for (const e of recent) {
      byResult[e.matchResult] = (byResult[e.matchResult] || 0) + 1;
    }

    // Top plates
    const plateCounts: Record<string, number> = {};
    for (const e of recent) {
      if (e.plate && e.plate !== "NO_LEIDA") {
        plateCounts[e.plate] = (plateCounts[e.plate] || 0) + 1;
      }
    }
    const topPlates = Object.entries(plateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([plate, count]) => ({ plate, count }));

    // Accesses by hour
    const byHour: number[] = new Array(24).fill(0);
    for (const e of recent) {
      const h = new Date(e.timestamp).getHours();
      byHour[h]++;
    }

    // Accesses per day
    const byDay: Record<string, number> = {};
    for (const e of recent) {
      const day = e.timestamp.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }

    return {
      totalAccesses: recent.length,
      byResult,
      topPlates,
      byHour,
      byDay,
      registeredPlates: this.loadRegistry(mapId).length,
    };
  }

  /** Export access log as CSV */
  exportCsv(mapId: string, opts?: { from?: string; until?: string; matchResult?: PlateMatchResult }): string {
    const entries = this.getAccessLog(mapId, { ...opts, limit: 50000 });
    const header = "Fecha,Hora,Matrícula,Estado,Propietario,Cámara,Dirección,Color,Marca,Confianza\n";
    const rows = entries.map((e) => {
      const d = new Date(e.timestamp);
      const date = d.toLocaleDateString("es-UY");
      const time = d.toLocaleTimeString("es-UY");
      return [
        date, time, e.plate, e.matchResult,
        (e.ownerName || "").replace(/,/g, ";"),
        (e.nodeLabel || e.nodeId).replace(/,/g, ";"),
        e.direction || "", e.vehicleColor || "",
        e.vehicleBrand || "", e.confidence ?? "",
      ].join(",");
    });
    return header + rows.join("\n");
  }
}

// ── Singleton via Symbol.for (cross-module safe) ──

const REGISTRY_KEY = Symbol.for("kumamap.plateRegistry");

export function getPlateRegistry(): PlateRegistryManager {
  if (!(process as any)[REGISTRY_KEY]) {
    (process as any)[REGISTRY_KEY] = new PlateRegistryManager();
  }
  return (process as any)[REGISTRY_KEY];
}
