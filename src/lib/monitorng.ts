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
