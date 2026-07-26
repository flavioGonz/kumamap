/**
 * monitor-ng integration - ingest + virtual monitors
 *
 * monitor-ng agents (HikCentral/Windows servers) POST their health to
 * /api/monitor-ng every ~20s. Each node is surfaced as a "virtual monitor"
 * (id >= 900001) merged into the Kuma monitor stream, so map nodes can be
 * assigned to it and get colored like any other monitor:
 *   ok -> 1 (green) | warn -> 2 (amber) | crit -> 0 (red)
 *   stale (no report for MONITORNG_STALE_MS, default 60s) -> active:false (gray)
 *
 * NOTE: state lives in SQLite (not in-memory) because the custom server (tsx)
 * and each Next route chunk hold separate module instances. better-sqlite3 in
 * WAL mode makes these reads effectively free.
 */
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import type { KumaMonitor } from "./types";

export interface MonitorNgMetric {
  id: string;
  state: string; // ok | warn | crit
  value: string;
  label?: string;
}

export interface MonitorNgNode {
  node: string;
  monitorId: number;
  name: string;
  state: string; // ok | warn | crit | idle
  ts: string;
  ok: number;
  warn: number;
  crit: number;
  metrics: MonitorNgMetric[];
  lastSeen: number; // epoch ms (server clock)
  stale: boolean;
}

/** Virtual monitor ids live far above any real Uptime Kuma id. */
const VIRTUAL_ID_BASE = 900000;
const STALE_MS = parseInt(process.env.MONITORNG_STALE_MS || "60000", 10);

export const METRIC_LABELS: Record<string, string> = {
  cpu: "Uso de CPU",
  mem: "Memoria Windows",
  dsk: "Latencia/cola de disco",
  store: "Disco de imagenes de eventos",
  raid: "Salud RAID fisico (iLO)",
  pg: "PostgreSQL (conexiones/backends/RAM/CPU)",
  sys: "SYS.exe de HikCentral (memoria/handles, fuga)",
  crash: "Crashes de SYS (dumps)",
  svc: "Servicios HikCentral + watchdog",
  net: "Red (Mbps/conexiones)",
  temp: "Temperaturas de hardware (iLO)",
  log: "Logs de HikCentral / bucle TV-Wall",
};

const DB_PATH = path.join(process.cwd(), "data", "kumamap.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS monitorng_nodes (
    node TEXT PRIMARY KEY,
    monitor_id INTEGER UNIQUE NOT NULL,
    name TEXT,
    state TEXT DEFAULT 'ok',
    ts TEXT,
    ok INTEGER DEFAULT 0,
    warn INTEGER DEFAULT 0,
    crit INTEGER DEFAULT 0,
    metrics TEXT DEFAULT '[]',
    last_seen INTEGER DEFAULT 0
  );
`);

/**
 * Adoption model (UniFi/Omada-style). Extends the table in place for existing
 * DBs. A "device" registers with a 5-digit deviceId + a 256-bit deviceKey; the
 * controller keeps it PENDING until an admin adopts it, then issues a per-device
 * report token. Legacy nodes (device_id NULL, pushed via the global-token route)
 * keep working untouched.
 */
function ensureAdoptionColumns() {
  try {
    const cols = new Set((db.prepare("PRAGMA table_info(monitorng_nodes)").all() as any[]).map((c) => c.name));
    const add = (name: string, ddl: string) => {
      if (!cols.has(name)) db.exec(`ALTER TABLE monitorng_nodes ADD COLUMN ${ddl}`);
    };
    add("device_id", "device_id TEXT");
    add("device_key_hash", "device_key_hash TEXT");
    add("report_token", "report_token TEXT");
    add("adopted", "adopted INTEGER DEFAULT 0");
    add("pending_since", "pending_since INTEGER DEFAULT 0");
    add("adopted_at", "adopted_at INTEGER DEFAULT 0");
    add("ip", "ip TEXT");
    add("fingerprint", "fingerprint TEXT");
  } catch {
    /* best-effort migration */
  }
}
ensureAdoptionColumns();

const selectAllStmt = db.prepare(`SELECT * FROM monitorng_nodes`);
const selectIdStmt = db.prepare(`SELECT monitor_id FROM monitorng_nodes WHERE node = ?`);
const maxIdStmt = db.prepare(`SELECT MAX(monitor_id) AS m FROM monitorng_nodes`);
const upsertStmt = db.prepare(`
  INSERT INTO monitorng_nodes (node, monitor_id, name, state, ts, ok, warn, crit, metrics, last_seen)
  VALUES (@node, @monitor_id, @name, @state, @ts, @ok, @warn, @crit, @metrics, @last_seen)
  ON CONFLICT(node) DO UPDATE SET
    name = excluded.name, state = excluded.state, ts = excluded.ts,
    ok = excluded.ok, warn = excluded.warn, crit = excluded.crit,
    metrics = excluded.metrics, last_seen = excluded.last_seen
`);

function safeParse(s: string): MonitorNgMetric[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rowToNode(r: any): MonitorNgNode {
  return {
    node: r.node,
    monitorId: r.monitor_id,
    name: r.name || r.node,
    state: r.state || "ok",
    ts: r.ts || "",
    ok: r.ok || 0,
    warn: r.warn || 0,
    crit: r.crit || 0,
    metrics: safeParse(r.metrics),
    lastSeen: r.last_seen || 0,
    stale: Date.now() - (r.last_seen || 0) > STALE_MS,
  };
}

/** Ingest one report from a monitor-ng agent. Throws on invalid payload. */
export function ingestReport(body: any): MonitorNgNode {
  if (!body || typeof body !== "object") throw new Error("body must be a JSON object");
  const node = String(body.node || "").trim().slice(0, 64);
  if (!node) throw new Error("'node' is required");
  const state = ["ok", "warn", "crit", "idle"].includes(body.state) ? body.state : "ok";
  const metrics: MonitorNgMetric[] = Array.isArray(body.metrics)
    ? body.metrics.slice(0, 32).map((m: any) => ({
        id: String(m?.id ?? "").slice(0, 24),
        state: ["ok", "warn", "crit"].includes(m?.state) ? m.state : "ok",
        value: String(m?.value ?? "").slice(0, 120),
      }))
    : [];
  const existing = selectIdStmt.get(node) as any;
  const monitorId =
    existing?.monitor_id ??
    Math.max(VIRTUAL_ID_BASE, (maxIdStmt.get() as any)?.m || 0) + 1;
  const rec: MonitorNgNode = {
    node,
    monitorId,
    name: String(body.name || node).slice(0, 120),
    state,
    ts: String(body.ts || "").slice(0, 40),
    ok: Number(body.ok) || 0,
    warn: Number(body.warn) || 0,
    crit: Number(body.crit) || 0,
    metrics,
    lastSeen: Date.now(),
    stale: false,
  };
  upsertStmt.run({
    node: rec.node,
    monitor_id: rec.monitorId,
    name: rec.name,
    state: rec.state,
    ts: rec.ts,
    ok: rec.ok,
    warn: rec.warn,
    crit: rec.crit,
    metrics: JSON.stringify(rec.metrics),
    last_seen: rec.lastSeen,
  });
  return rec;
}

function stateToStatus(state: string): number {
  if (state === "crit") return 0;
  if (state === "warn") return 2;
  return 1; // ok
}

function buildMsg(n: MonitorNgNode): string {
  const bad = (n.metrics || [])
    .filter((m) => m.state !== "ok")
    .map((m) => `${m.id}=${m.value} (${m.state})`);
  const head = `monitor-ng | OK:${n.ok} Warn:${n.warn} Crit:${n.crit}`;
  return bad.length ? `${head} | ${bad.join(" - ")}` : head;
}

/** All monitor-ng nodes as Kuma-compatible virtual monitors. */
export function getMonitorNgVirtualMonitors(): KumaMonitor[] {
  const out: KumaMonitor[] = [];
  let rows: any[] = [];
  try {
    rows = selectAllStmt.all() as any[];
  } catch {
    return out;
  }
  for (const r of rows) {
    // Pending adoption devices (registered but not adopted) don't show on the map yet.
    if (r.device_id && !r.adopted) continue;
    const n = rowToNode(r);
    out.push({
      id: n.monitorId,
      name: n.name,
      type: "monitor-ng",
      url: "",
      hostname: n.node,
      active: !n.stale && n.state !== "idle", // stale/idle -> gray on the map
      status: stateToStatus(n.state),
      ping: null,
      msg: n.stale ? `monitor-ng | sin reporte (ultimo: ${n.ts || "?"})` : buildMsg(n),
      interval: 20,
      mng: {
        state: n.state,
        ts: n.ts,
        ok: n.ok,
        warn: n.warn,
        crit: n.crit,
        stale: n.stale,
        metrics: (n.metrics || []).map((mm) => ({ ...mm, label: METRIC_LABELS[mm.id] || mm.id })),
      },
    });
  }
  return out;
}

/** Full node detail (for GET /api/monitor-ng). */
export function getMonitorNgNodes() {
  return (selectAllStmt.all() as any[]).map((r) => {
    const n = rowToNode(r);
    return {
      ...n,
      staleAfterMs: STALE_MS,
      metrics: n.metrics.map((m) => ({ ...m, label: METRIC_LABELS[m.id] || m.id })),
    };
  });
}

/* =========================================================================
 *  ADOPTION MODEL  (register -> pending -> adopt -> signed report)
 * ========================================================================= */

export interface PendingDevice {
  deviceId: string;
  node: string;
  name: string;
  ip: string;
  fingerprint: string;
  pendingSince: number;
  lastSeen: number;
}
export interface AdoptedDevice extends PendingDevice {
  monitorId: number;
  adoptedAt: number;
  state: string;
  ok: number;
  warn: number;
  crit: number;
  ts: string;
  lastSeen: number;
  stale: boolean;
  hasToken: boolean;
  metrics: MonitorNgMetric[];
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function randToken(): string {
  return crypto.randomBytes(24).toString("hex"); // 48-hex-char per-device report token
}
function normId(v: any): string {
  return String(v ?? "").replace(/\D/g, "").slice(0, 5);
}
function reserveMonitorId(): number {
  return Math.max(VIRTUAL_ID_BASE, (maxIdStmt.get() as any)?.m || 0) + 1;
}
function uniqueDeviceId(): string {
  const findByDevice = db.prepare("SELECT 1 FROM monitorng_nodes WHERE device_id = ?");
  for (let i = 0; i < 50; i++) {
    const id = String(crypto.randomInt(0, 100000)).padStart(5, "0");
    if (!findByDevice.get(id)) return id;
  }
  // extremely unlikely fallback
  return String(Date.now() % 100000).padStart(5, "0");
}

/** Error with an HTTP status hint for the route layer. */
function httpErr(status: number, msg: string): Error {
  const e: any = new Error(msg);
  e.status = status;
  return e;
}

/**
 * Device self-registration. Idempotent: same deviceId+deviceKey refreshes the
 * record; a different key on an existing deviceId is rejected (409) so nobody
 * can hijack a pairing code. Returns the (possibly server-assigned) deviceId.
 */
export function registerDevice(input: {
  deviceId?: string;
  deviceKey: string;
  name?: string;
  fingerprint?: string;
  ip?: string;
}): { deviceId: string; status: "pending" | "adopted"; node: string; monitorId?: number } {
  const deviceKey = String(input.deviceKey || "");
  if (deviceKey.length < 16) throw httpErr(400, "deviceKey (>=16 chars) is required");
  const keyHash = sha256(deviceKey);
  const now = Date.now();
  let deviceId = normId(input.deviceId);

  const byDevice = db.prepare("SELECT * FROM monitorng_nodes WHERE device_id = ?");
  let row = deviceId ? (byDevice.get(deviceId) as any) : null;

  if (row) {
    if (row.device_key_hash && row.device_key_hash !== keyHash) {
      throw httpErr(409, "deviceId already in use by another device");
    }
    db.prepare(
      "UPDATE monitorng_nodes SET name = ?, ip = ?, fingerprint = ?, last_seen = ? WHERE node = ?"
    ).run(
      String(input.name || row.name || deviceId).slice(0, 120),
      String(input.ip || row.ip || "").slice(0, 64),
      String(input.fingerprint || row.fingerprint || "").slice(0, 200),
      now,
      row.node
    );
    return {
      deviceId,
      status: row.adopted ? "adopted" : "pending",
      node: row.node,
      monitorId: row.adopted ? row.monitor_id : undefined,
    };
  }

  // brand-new device
  if (!deviceId || byDevice.get(deviceId)) deviceId = uniqueDeviceId();
  const node = "mng-" + deviceId;
  db.prepare(
    `INSERT INTO monitorng_nodes
       (node, monitor_id, name, state, ts, ok, warn, crit, metrics, last_seen,
        device_id, device_key_hash, adopted, pending_since, ip, fingerprint)
     VALUES (?, ?, ?, 'idle', '', 0, 0, 0, '[]', ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    node,
    reserveMonitorId(),
    String(input.name || deviceId).slice(0, 120),
    now,
    deviceId,
    keyHash,
    now,
    String(input.ip || "").slice(0, 64),
    String(input.fingerprint || "").slice(0, 200)
  );
  return { deviceId, status: "pending", node };
}

/**
 * Device polls this (authenticated by its deviceKey) until adopted; then it
 * receives its per-device report token.
 */
export function getAdoptStatus(
  deviceId: string,
  deviceKey: string
): { status: "unknown" | "pending" | "adopted"; token?: string; node?: string; monitorId?: number } {
  const row = db.prepare("SELECT * FROM monitorng_nodes WHERE device_id = ?").get(normId(deviceId)) as any;
  if (!row) return { status: "unknown" };
  if (!row.device_key_hash || row.device_key_hash !== sha256(String(deviceKey || ""))) {
    throw httpErr(401, "bad deviceKey");
  }
  db.prepare("UPDATE monitorng_nodes SET last_seen = ? WHERE node = ?").run(Date.now(), row.node);
  if (!row.adopted) return { status: "pending" };
  let token = row.report_token;
  if (!token) {
    token = randToken();
    db.prepare("UPDATE monitorng_nodes SET report_token = ? WHERE node = ?").run(token, row.node);
  }
  return { status: "adopted", token, node: row.node, monitorId: row.monitor_id };
}

/** Admin adopts a pending device: issues the report token, marks adopted. */
export function adoptDevice(deviceId: string, name?: string): AdoptedDevice {
  const id = normId(deviceId);
  const row = db.prepare("SELECT * FROM monitorng_nodes WHERE device_id = ?").get(id) as any;
  if (!row) throw httpErr(404, "device not found");
  const token = row.report_token || randToken();
  const now = Date.now();
  db.prepare(
    "UPDATE monitorng_nodes SET adopted = 1, adopted_at = ?, report_token = ?, name = ? WHERE node = ?"
  ).run(now, token, String(name || row.name || id).slice(0, 120), row.node);
  return getAdoptedDevice(id)!;
}

/** Admin de-adopts (revokes): device returns to pending, token cleared. */
export function deAdoptDevice(deviceId: string): { ok: true } {
  const id = normId(deviceId);
  const row = db.prepare("SELECT node FROM monitorng_nodes WHERE device_id = ?").get(id) as any;
  if (!row) throw httpErr(404, "device not found");
  db.prepare(
    "UPDATE monitorng_nodes SET adopted = 0, adopted_at = 0, report_token = NULL, state = 'idle' WHERE node = ?"
  ).run(row.node);
  return { ok: true };
}

/** Admin removes a device entirely (pending or adopted). */
export function deleteDevice(deviceId: string): { ok: true } {
  const id = normId(deviceId);
  const info = db.prepare("DELETE FROM monitorng_nodes WHERE device_id = ?").run(id);
  if (info.changes === 0) throw httpErr(404, "device not found");
  return { ok: true };
}

/** Admin rotates the report token (forces the device to re-fetch it). */
export function regenReportToken(deviceId: string): { ok: true; monitorId: number } {
  const id = normId(deviceId);
  const row = db.prepare("SELECT * FROM monitorng_nodes WHERE device_id = ?").get(id) as any;
  if (!row) throw httpErr(404, "device not found");
  if (!row.adopted) throw httpErr(409, "device is not adopted");
  db.prepare("UPDATE monitorng_nodes SET report_token = ? WHERE node = ?").run(randToken(), row.node);
  return { ok: true, monitorId: row.monitor_id };
}

/**
 * Signed report from an adopted device. `bearer` is the per-device report
 * token. Verifies token (constant-time) then ingests the payload under the
 * device's stable node id.
 */
export function ingestSignedReport(deviceId: string, bearer: string, body: any): MonitorNgNode {
  const id = normId(deviceId);
  const row = db.prepare("SELECT * FROM monitorng_nodes WHERE device_id = ?").get(id) as any;
  if (!row) throw httpErr(404, "device not found");
  if (!row.adopted || !row.report_token) throw httpErr(403, "device not adopted");
  const a = Buffer.from(String(bearer || ""));
  const b = Buffer.from(String(row.report_token));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpErr(401, "bad report token");
  // force the report onto the device's stable node/name
  const payload = { ...(body && typeof body === "object" ? body : {}), node: row.node };
  if (!payload.name) payload.name = row.name || row.node;
  return ingestReport(payload);
}

function rowToPending(r: any): PendingDevice {
  return {
    deviceId: r.device_id,
    node: r.node,
    name: r.name || r.node,
    ip: r.ip || "",
    fingerprint: r.fingerprint || "",
    pendingSince: r.pending_since || 0,
    lastSeen: r.last_seen || 0,
  };
}

/** Devices registered but not yet adopted. */
export function listPendingDevices(): PendingDevice[] {
  const rows = db
    .prepare("SELECT * FROM monitorng_nodes WHERE device_id IS NOT NULL AND adopted = 0 ORDER BY pending_since ASC")
    .all() as any[];
  return rows.map(rowToPending);
}

/** Adopted devices (the "remote server" nodes). */
export function listAdoptedDevices(): AdoptedDevice[] {
  const rows = db
    .prepare("SELECT * FROM monitorng_nodes WHERE device_id IS NOT NULL AND adopted = 1 ORDER BY name ASC")
    .all() as any[];
  return rows.map((r) => toAdopted(r));
}

function toAdopted(r: any): AdoptedDevice {
  const n = rowToNode(r);
  return {
    ...rowToPending(r),
    monitorId: r.monitor_id,
    adoptedAt: r.adopted_at || 0,
    state: n.state,
    ok: n.ok,
    warn: n.warn,
    crit: n.crit,
    ts: n.ts,
    lastSeen: n.lastSeen,
    stale: n.stale,
    hasToken: !!r.report_token,
    metrics: (n.metrics || []).map((m) => ({ ...m, label: METRIC_LABELS[m.id] || m.id })),
  };
}

/** Single adopted device detail (for the edit-node modal). */
export function getAdoptedDevice(deviceId: string): AdoptedDevice | null {
  const r = db.prepare("SELECT * FROM monitorng_nodes WHERE device_id = ? AND adopted = 1").get(normId(deviceId)) as any;
  return r ? toAdopted(r) : null;
}
