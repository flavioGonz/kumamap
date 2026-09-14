/**
 * Visitor Registry — JSON-file-based guard booth visitor logbook.
 *
 * Each map gets its own visitors.json file stored in data/visitors/<mapId>.json.
 * Supports check-in (cédula scan) and check-out with duration tracking.
 * Designed for USB barcode/QR scanner input at a guard booth.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ── Types ──

export interface VisitorRecord {
  id: string;
  cedula: string;            // Cédula / ID number (scanned or typed)
  name: string;              // Visitor full name
  company?: string;          // Visitor's company / organization
  personToVisit: string;     // Who they are visiting
  vehiclePlate?: string;     // Vehicle plate (if applicable)
  vehicleDesc?: string;      // Vehicle description
  reason?: string;           // Reason for visit
  observations?: string;     // Guard notes
  checkIn: string;           // ISO datetime — entry time
  checkOut?: string;         // ISO datetime — exit time (null = still inside)
  durationMinutes?: number;  // Calculated on checkout
  mapId: string;
  guardName?: string;        // Guard who registered the visit
  createdAt: string;
  updatedAt: string;
}

export interface VisitorSearchOpts {
  q?: string;                // Free text search (name, cedula, company)
  from?: string;             // ISO date — filter from
  to?: string;               // ISO date — filter to
  activeOnly?: boolean;      // Only visitors currently inside (no checkout)
  limit?: number;
  offset?: number;
}

export interface VisitorStats {
  totalToday: number;
  activeNow: number;         // Currently inside (no checkout)
  totalThisWeek: number;
  totalThisMonth: number;
  avgDurationMinutes: number;
  topVisitors: { cedula: string; name: string; visits: number }[];
  topCompanies: { company: string; visits: number }[];
}

// ── Storage paths ──

const DATA_DIR = path.join(process.cwd(), "data", "visitors");

// ── Registry Manager ──

class VisitorRegistryManager {
  private registries = new Map<string, VisitorRecord[]>();
  private dirty = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // ── Load / Save ──

  private load(mapId: string): VisitorRecord[] {
    if (this.registries.has(mapId)) return this.registries.get(mapId)!;

    const filePath = path.join(DATA_DIR, `${mapId}.json`);
    let records: VisitorRecord[] = [];

    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        records = JSON.parse(raw);
      }
    } catch (err) {
      console.error(`[visitor-registry] Failed to load ${mapId}:`, err);
      records = [];
    }

    this.registries.set(mapId, records);
    return records;
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.flushAll();
      this.saveTimer = null;
    }, 2000);
  }

  flushAll() {
    for (const mapId of this.dirty) {
      const records = this.registries.get(mapId);
      if (!records) continue;
      const filePath = path.join(DATA_DIR, `${mapId}.json`);
      try {
        fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
      } catch (err) {
        console.error(`[visitor-registry] Failed to save ${mapId}:`, err);
      }
    }
    this.dirty.clear();
  }

  private markDirty(mapId: string) {
    this.dirty.add(mapId);
    this.scheduleSave();
  }

  // ── CRUD ──

  /** Get all visitors for a map, newest first */
  getVisitors(mapId: string, opts?: VisitorSearchOpts): VisitorRecord[] {
    let records = [...this.load(mapId)].sort(
      (a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()
    );

    if (opts?.activeOnly) {
      records = records.filter((r) => !r.checkOut);
    }

    if (opts?.q) {
      const q = opts.q.toLowerCase();
      records = records.filter(
        (r) =>
          r.cedula.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.company && r.company.toLowerCase().includes(q)) ||
          r.personToVisit.toLowerCase().includes(q) ||
          (r.vehiclePlate && r.vehiclePlate.toLowerCase().includes(q))
      );
    }

    if (opts?.from) {
      const fromDate = new Date(opts.from);
      records = records.filter((r) => new Date(r.checkIn) >= fromDate);
    }

    if (opts?.to) {
      const toDate = new Date(opts.to);
      toDate.setHours(23, 59, 59, 999);
      records = records.filter((r) => new Date(r.checkIn) <= toDate);
    }

    const total = records.length;

    if (opts?.offset) {
      records = records.slice(opts.offset);
    }

    if (opts?.limit) {
      records = records.slice(0, opts.limit);
    }

    return records;
  }

  /** Count total visitors matching filters */
  countVisitors(mapId: string, opts?: VisitorSearchOpts): number {
    return this.getVisitors(mapId, { ...opts, limit: undefined, offset: undefined }).length;
  }

  /** Get a single visitor by ID */
  getVisitor(mapId: string, id: string): VisitorRecord | undefined {
    return this.load(mapId).find((r) => r.id === id);
  }

  /** Find previous visits by cédula */
  getVisitorHistory(mapId: string, cedula: string): VisitorRecord[] {
    const normalized = cedula.replace(/\D/g, "");
    return this.load(mapId)
      .filter((r) => r.cedula.replace(/\D/g, "") === normalized)
      .sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime());
  }

  /** Check if this cédula is currently checked in (no checkout) */
  isCheckedIn(mapId: string, cedula: string): VisitorRecord | undefined {
    const normalized = cedula.replace(/\D/g, "");
    return this.load(mapId).find(
      (r) => r.cedula.replace(/\D/g, "") === normalized && !r.checkOut
    );
  }

  /** Register a new visitor (check-in) */
  checkIn(
    mapId: string,
    data: {
      cedula: string;
      name: string;
      company?: string;
      personToVisit: string;
      vehiclePlate?: string;
      vehicleDesc?: string;
      reason?: string;
      observations?: string;
      guardName?: string;
    }
  ): VisitorRecord {
    const records = this.load(mapId);
    const now = new Date().toISOString();

    const record: VisitorRecord = {
      id: randomUUID(),
      cedula: data.cedula.trim(),
      name: data.name.trim(),
      company: data.company?.trim() || undefined,
      personToVisit: data.personToVisit.trim(),
      vehiclePlate: data.vehiclePlate
        ? data.vehiclePlate.toUpperCase().replace(/[^A-Z0-9]/g, "")
        : undefined,
      vehicleDesc: data.vehicleDesc?.trim() || undefined,
      reason: data.reason?.trim() || undefined,
      observations: data.observations?.trim() || undefined,
      checkIn: now,
      mapId,
      guardName: data.guardName?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    records.push(record);
    this.markDirty(mapId);

    // Trim old records (keep last 50,000)
    if (records.length > 50000) {
      records.sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime());
      records.length = 50000;
    }

    return record;
  }

  /** Check out a visitor (mark departure) */
  checkOut(mapId: string, id: string, observations?: string): VisitorRecord | null {
    const records = this.load(mapId);
    const record = records.find((r) => r.id === id);
    if (!record || record.checkOut) return null;

    const now = new Date();
    record.checkOut = now.toISOString();
    record.updatedAt = now.toISOString();

    // Calculate duration
    const checkInTime = new Date(record.checkIn).getTime();
    record.durationMinutes = Math.round((now.getTime() - checkInTime) / 60000);

    if (observations) {
      record.observations = record.observations
        ? `${record.observations} | Salida: ${observations}`
        : observations;
    }

    this.markDirty(mapId);
    return record;
  }

  /** Update a visitor record */
  updateVisitor(
    mapId: string,
    id: string,
    data: Partial<Omit<VisitorRecord, "id" | "mapId" | "createdAt">>
  ): VisitorRecord | null {
    const records = this.load(mapId);
    const record = records.find((r) => r.id === id);
    if (!record) return null;

    Object.assign(record, data, { updatedAt: new Date().toISOString() });
    this.markDirty(mapId);
    return record;
  }

  /** Delete a visitor record */
  deleteVisitor(mapId: string, id: string): boolean {
    const records = this.load(mapId);
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) return false;

    records.splice(idx, 1);
    this.markDirty(mapId);
    return true;
  }

  // ── Stats ──

  getStats(mapId: string): VisitorStats {
    const records = this.load(mapId);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const today = records.filter((r) => new Date(r.checkIn) >= todayStart);
    const activeNow = records.filter((r) => !r.checkOut);
    const thisWeek = records.filter((r) => new Date(r.checkIn) >= weekStart);
    const thisMonth = records.filter((r) => new Date(r.checkIn) >= monthStart);

    // Average duration (only completed visits)
    const completed = records.filter((r) => r.durationMinutes != null);
    const avgDuration =
      completed.length > 0
        ? Math.round(completed.reduce((sum, r) => sum + r.durationMinutes!, 0) / completed.length)
        : 0;

    // Top visitors by frequency
    const visitorCounts = new Map<string, { name: string; count: number }>();
    for (const r of records) {
      const key = r.cedula.replace(/\D/g, "");
      const existing = visitorCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        visitorCounts.set(key, { name: r.name, count: 1 });
      }
    }
    const topVisitors = [...visitorCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([cedula, v]) => ({ cedula, name: v.name, visits: v.count }));

    // Top companies
    const companyCounts = new Map<string, number>();
    for (const r of records) {
      if (r.company) {
        companyCounts.set(r.company, (companyCounts.get(r.company) || 0) + 1);
      }
    }
    const topCompanies = [...companyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([company, visits]) => ({ company, visits }));

    return {
      totalToday: today.length,
      activeNow: activeNow.length,
      totalThisWeek: thisWeek.length,
      totalThisMonth: thisMonth.length,
      avgDurationMinutes: avgDuration,
      topVisitors,
      topCompanies,
    };
  }

  // ── Export ──

  exportCSV(mapId: string, opts?: { from?: string; to?: string }): string {
    const records = this.getVisitors(mapId, { from: opts?.from, to: opts?.to });

    const headers = [
      "Cédula",
      "Nombre",
      "Empresa",
      "Visita a",
      "Vehículo",
      "Matrícula",
      "Motivo",
      "Entrada",
      "Salida",
      "Duración (min)",
      "Observaciones",
      "Guardia",
    ];

    const rows = records.map((r) => [
      r.cedula,
      r.name,
      r.company || "",
      r.personToVisit,
      r.vehicleDesc || "",
      r.vehiclePlate || "",
      r.reason || "",
      r.checkIn,
      r.checkOut || "En sitio",
      r.durationMinutes != null ? String(r.durationMinutes) : "",
      r.observations || "",
      r.guardName || "",
    ]);

    const escape = (v: string) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };

    return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  }
}

// ── Singleton ──

const SINGLETON_KEY = Symbol.for("kumamap.visitorRegistry");
const globalAny = globalThis as Record<symbol, unknown>;

export function getVisitorRegistry(): VisitorRegistryManager {
  if (!globalAny[SINGLETON_KEY]) {
    globalAny[SINGLETON_KEY] = new VisitorRegistryManager();
  }
  return globalAny[SINGLETON_KEY] as VisitorRegistryManager;
}
