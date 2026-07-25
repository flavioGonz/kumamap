/**
 * Server-side UPS monitor.
 *
 * WHY THIS EXISTS
 * ---------------
 * UPS polling used to live entirely in the browser: `UpsPanel` fetched
 * /api/ups/poll on a 30s interval, and history was an in-memory ring buffer that
 * only filled while someone had the panel open. That means:
 *   • a UPS that switched to battery at 3am went completely unnoticed
 *   • history reset on every server restart
 *   • the client had to be handed the SNMP community / NUT password to poll
 *
 * This module moves polling into the server process (started from server.ts,
 * alongside the Kuma client), so UPSes are watched continuously whether or not
 * anyone is looking. It:
 *   • discovers UPS nodes from the map DB (icon === "ups")
 *   • polls each one over SNMP or NUT according to its own config
 *   • persists history to SQLite so it survives restarts
 *   • raises push alerts on the transitions that matter (mains lost, battery
 *     low, runtime short, overload, battery needs replacing)
 *   • pushes live readings to browsers over the existing Socket.IO channel
 */

import getDb from "./db";
import { pollNut } from "./nut-client";
import { pollSnmpUps } from "./ups-snmp";
import type { UpsConfig, UpsResult, UpsHistoryPoint } from "./ups";

const POLL_INTERVAL_MS = 30_000;
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Don't re-alert about the same condition more often than this. */
const ALERT_THROTTLE_MS = 10 * 60 * 1000;

export interface UpsNode {
  nodeId: string;
  mapId: string;
  label: string;
  config: UpsConfig;
}

export interface UpsAlert {
  nodeId: string;
  label: string;
  kind: "onBattery" | "mainsRestored" | "batteryLow" | "runtimeLow" | "overload" | "replaceBattery" | "unreachable";
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
}

type AlertSink = (alert: UpsAlert) => void;
type ReadingSink = (nodeId: string, result: UpsResult) => void;

// ── Persistence ──────────────────────────────────────────────────────────────

let schemaReady = false;

/**
 * Additive, idempotent migration — matches the existing convention in db.ts
 * (CREATE TABLE IF NOT EXISTS / ALTER TABLE wrapped in try-catch).
 */
function ensureSchema() {
  if (schemaReady) return;
  const db = getDb;
  db.exec(`
    CREATE TABLE IF NOT EXISTS ups_history (
      node_id    TEXT    NOT NULL,
      t          INTEGER NOT NULL,
      charge     REAL,
      load       REAL,
      input_v    REAL,
      output_v   REAL,
      temp       REAL,
      runtime    REAL,
      status     TEXT,
      reachable  INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_ups_history_node_t ON ups_history (node_id, t);
  `);
  schemaReady = true;
}

function persist(nodeId: string, r: UpsResult) {
  try {
    ensureSchema();
    getDb
      .prepare(
        `INSERT INTO ups_history (node_id, t, charge, load, input_v, output_v, temp, runtime, status, reachable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        nodeId,
        r.timestamp,
        r.battery?.charge ?? null,
        r.output?.loadPercent ?? null,
        r.input?.voltage ?? null,
        r.output?.voltage ?? null,
        r.battery?.temperature ?? null,
        r.battery?.runtimeMinutes ?? null,
        r.output?.status ?? "unknown",
        r.reachable ? 1 : 0
      );
  } catch (err) {
    console.error("[UPS] Error guardando historial:", err);
  }
}

function pruneHistory() {
  try {
    ensureSchema();
    getDb
      .prepare("DELETE FROM ups_history WHERE t < ?")
      .run(Date.now() - HISTORY_RETENTION_MS);
  } catch {}
}

/** Read persisted history for a node (newest last). */
export function getUpsHistory(nodeId: string, hours = 24): UpsHistoryPoint[] {
  try {
    ensureSchema();
    const rows = getDb
      .prepare(
        `SELECT t, charge, load, input_v, output_v, temp, runtime, status
         FROM ups_history WHERE node_id = ? AND t >= ? ORDER BY t ASC`
      )
      .all(nodeId, Date.now() - hours * 3600_000) as any[];

    return rows.map((r) => ({
      t: r.t,
      charge: r.charge ?? 0,
      load: r.load ?? 0,
      inputV: r.input_v ?? undefined,
      outputV: r.output_v ?? undefined,
      temp: r.temp ?? undefined,
      runtime: r.runtime ?? undefined,
      status: r.status ?? "unknown",
    }));
  } catch {
    return [];
  }
}

// ── Node discovery ───────────────────────────────────────────────────────────

/** All map nodes that represent a UPS, with their parsed config. */
export function listUpsNodes(): UpsNode[] {
  try {
    const rows = getDb
      .prepare(
        `SELECT id, map_id, label, custom_data
         FROM network_map_nodes
         WHERE icon = 'ups'`
      )
      .all() as { id: string; map_id: string; label: string; custom_data: string | null }[];

    const nodes: UpsNode[] = [];
    for (const row of rows) {
      let cd: any = {};
      try {
        cd = row.custom_data ? JSON.parse(row.custom_data) : {};
      } catch {
        continue;
      }

      const ip = cd.ip || cd.nutHost;
      if (!ip) continue; // not configured yet

      nodes.push({
        nodeId: row.id,
        mapId: row.map_id,
        label: row.label || cd.label || "UPS",
        config: {
          protocol: cd.upsProtocol || cd.protocol || "snmp",
          ip,
          // `upsSnmpCommunity` is the field the existing UI writes; keep both.
          snmpCommunity: cd.upsSnmpCommunity || cd.snmpCommunity || "public",
          nutPort: cd.nutPort || 3493,
          nutUpsName: cd.nutUpsName,
          nutUser: cd.nutUser,
          nutPassword: cd.nutPassword,
          kumaMonitorId: cd.kumaMonitorId ?? null,
          alertChargeBelow: cd.alertChargeBelow ?? 30,
          alertLoadAbove: cd.alertLoadAbove ?? 90,
          alertRuntimeBelow: cd.alertRuntimeBelow ?? 5,
        },
      });
    }
    return nodes;
  } catch (err) {
    console.error("[UPS] Error listando nodos UPS:", err);
    return [];
  }
}

/** Poll one UPS using whichever protocol it is configured for. */
export async function pollUpsNode(cfg: UpsConfig): Promise<UpsResult> {
  if (cfg.protocol === "nut") {
    return pollNut({
      host: cfg.ip!,
      port: cfg.nutPort,
      upsName: cfg.nutUpsName,
      username: cfg.nutUser,
      password: cfg.nutPassword,
    });
  }
  return pollSnmpUps(cfg.ip!, cfg.snmpCommunity || "public");
}

// ── Alerting ─────────────────────────────────────────────────────────────────

interface NodeState {
  lastStatus?: string;
  lastReachable?: boolean;
  lastAlertAt: Map<UpsAlert["kind"], number>;
}

const state = new Map<string, NodeState>();

function shouldAlert(st: NodeState, kind: UpsAlert["kind"]): boolean {
  const last = st.lastAlertAt.get(kind) ?? 0;
  if (Date.now() - last < ALERT_THROTTLE_MS) return false;
  st.lastAlertAt.set(kind, Date.now());
  return true;
}

function evaluateAlerts(node: UpsNode, r: UpsResult, emit: AlertSink) {
  let st = state.get(node.nodeId);
  if (!st) {
    st = { lastAlertAt: new Map() };
    state.set(node.nodeId, st);
  }

  const label = node.label;
  const cfg = node.config;

  // Reachability
  if (!r.reachable) {
    if (st.lastReachable !== false && shouldAlert(st, "unreachable")) {
      emit({
        nodeId: node.nodeId,
        label,
        kind: "unreachable",
        severity: "warning",
        title: `⚠ UPS ${label} sin respuesta`,
        body: r.error || "No se pudo consultar el UPS",
      });
    }
    st.lastReachable = false;
    st.lastStatus = undefined;
    return;
  }
  st.lastReachable = true;

  const status = r.output?.status ?? "unknown";
  const charge = r.battery?.charge ?? 100;
  const load = r.output?.loadPercent ?? 0;
  const runtime = r.battery?.runtimeMinutes;

  // Mains lost → running on battery. The single most important UPS event.
  if (status === "onBattery" && st.lastStatus !== "onBattery" && shouldAlert(st, "onBattery")) {
    emit({
      nodeId: node.nodeId,
      label,
      kind: "onBattery",
      severity: "critical",
      title: `🔋 ${label} EN BATERÍA`,
      body: `Corte de red · ${charge}% carga${runtime != null ? ` · ~${runtime} min de autonomía` : ""}`,
    });
  }

  // Mains restored
  if (
    status === "onLine" &&
    st.lastStatus === "onBattery" &&
    shouldAlert(st, "mainsRestored")
  ) {
    emit({
      nodeId: node.nodeId,
      label,
      kind: "mainsRestored",
      severity: "info",
      title: `✓ ${label} volvió a red`,
      body: `Alimentación restablecida · ${charge}% carga`,
    });
  }

  // Battery running down
  if (charge > 0 && charge < (cfg.alertChargeBelow ?? 30) && shouldAlert(st, "batteryLow")) {
    emit({
      nodeId: node.nodeId,
      label,
      kind: "batteryLow",
      severity: "critical",
      title: `🪫 ${label} batería baja`,
      body: `Carga al ${charge}% (umbral ${cfg.alertChargeBelow ?? 30}%)`,
    });
  }

  // Autonomy about to run out — the actionable one during a long outage.
  if (
    runtime != null &&
    runtime > 0 &&
    runtime < (cfg.alertRuntimeBelow ?? 5) &&
    status === "onBattery" &&
    shouldAlert(st, "runtimeLow")
  ) {
    emit({
      nodeId: node.nodeId,
      label,
      kind: "runtimeLow",
      severity: "critical",
      title: `⏳ ${label}: ~${runtime} min de autonomía`,
      body: "Apagá equipos no críticos o preparate para el corte",
    });
  }

  // Overload
  if (load > (cfg.alertLoadAbove ?? 90) && shouldAlert(st, "overload")) {
    emit({
      nodeId: node.nodeId,
      label,
      kind: "overload",
      severity: "warning",
      title: `⚡ ${label} sobrecargado`,
      body: `Carga de salida al ${load}%`,
    });
  }

  // Battery needs replacing (self-test failed)
  if (r.battery?.needsReplacement && shouldAlert(st, "replaceBattery")) {
    emit({
      nodeId: node.nodeId,
      label,
      kind: "replaceBattery",
      severity: "warning",
      title: `🔧 ${label}: reemplazar batería`,
      body: "El UPS reporta que la batería debe cambiarse",
    });
  }

  st.lastStatus = status;
}

// ── The loop ─────────────────────────────────────────────────────────────────

const MONITOR_KEY = Symbol.for("kumamap.upsMonitor");

class UpsMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private latest = new Map<string, UpsResult>();
  private onAlert: AlertSink = () => {};
  private onReading: ReadingSink = () => {};
  private running = false;

  start(sinks: { onAlert?: AlertSink; onReading?: ReadingSink } = {}) {
    if (this.timer) return; // already started
    if (sinks.onAlert) this.onAlert = sinks.onAlert;
    if (sinks.onReading) this.onReading = sinks.onReading;

    ensureSchema();
    void this.tick(); // don't wait a full interval for the first reading
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.pruneTimer = setInterval(pruneHistory, 6 * 3600_000);
    console.log("[UPS] Monitor iniciado (poll cada 30s)");
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.timer = null;
    this.pruneTimer = null;
  }

  /** Most recent reading per node — served to API routes without re-polling. */
  getLatest(nodeId: string): UpsResult | undefined {
    return this.latest.get(nodeId);
  }

  getAllLatest(): Record<string, UpsResult> {
    return Object.fromEntries(this.latest);
  }

  private async tick() {
    if (this.running) return; // a slow round must not stack up
    this.running = true;

    try {
      const nodes = listUpsNodes();

      // Drop cached state for nodes that no longer exist (prevents a slow leak
      // as UPS nodes are added and removed from maps).
      const live = new Set(nodes.map((n) => n.nodeId));
      for (const id of [...this.latest.keys()]) if (!live.has(id)) this.latest.delete(id);
      for (const id of [...state.keys()]) if (!live.has(id)) state.delete(id);

      await Promise.all(
        nodes.map(async (node) => {
          try {
            const result = await pollUpsNode(node.config);
            this.latest.set(node.nodeId, result);
            if (result.reachable) persist(node.nodeId, result);
            evaluateAlerts(node, result, this.onAlert);
            this.onReading(node.nodeId, result);
          } catch (err) {
            console.error(`[UPS] Error consultando ${node.label}:`, err);
          }
        })
      );
    } finally {
      this.running = false;
    }
  }
}

/** Singleton pinned to `process` — server.ts and API routes load separate
 *  module copies (tsx vs webpack), same reasoning as the Kuma client. */
export function getUpsMonitor(): UpsMonitor {
  const proc = process as any;
  if (!proc[MONITOR_KEY]) proc[MONITOR_KEY] = new UpsMonitor();
  return proc[MONITOR_KEY];
}
