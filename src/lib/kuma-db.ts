/**
 * KumaMap - Direct Uptime Kuma Database Access
 *
 * Supports two modes, auto-detected from environment variables:
 *
 *  SQLite mode (Uptime Kuma v1.x — most common):
 *    KUMA_DB_PATH=/path/to/kuma.db
 *    (read-only access to the SQLite file)
 *
 *  MySQL/MariaDB mode — TCP (Uptime Kuma 2.0 external MariaDB):
 *    KUMA_DB_HOST=127.0.0.1
 *    KUMA_DB_USER=kumamap_reader
 *    KUMA_DB_PASSWORD=yourpassword
 *    KUMA_DB_NAME=kuma        (default: kuma)
 *    KUMA_DB_PORT=3306        (default: 3306)
 *
 *  MySQL/MariaDB mode — Unix socket (Uptime Kuma 2.0 embedded MariaDB via Docker volume):
 *    KUMA_DB_SOCKET=/home/nico/uptime-kuma-data/run/mariadb.sock
 *    KUMA_DB_USER=kumamap_reader
 *    KUMA_DB_PASSWORD=yourpassword
 *    KUMA_DB_NAME=kuma        (default: kuma)
 *
 *  Disabled (neither env set):
 *    App works via Socket.IO only; historical timeline shows limited data.
 *
 * To set up, run: npm run setup-db
 */

import mysql from "mysql2/promise";

export interface KumaHeartbeat {
  monitorID: number;
  status: number;
  time: string;
  msg: string;
  ping: number | null;
  duration: number;
}

// ─────────────────────────────────────────────
// Mode detection
// ─────────────────────────────────────────────

type DbMode = "sqlite" | "mysql" | "disabled";

function detectMode(): DbMode {
  if (process.env.KUMA_DB_PATH) return "sqlite";
  if (process.env.KUMA_DB_HOST || process.env.KUMA_DB_SOCKET) return "mysql";
  return "disabled";
}

// ─────────────────────────────────────────────
// SQLite implementation
// ─────────────────────────────────────────────

let sqliteDb: import("better-sqlite3").Database | null = null;

function getSqliteDb(): import("better-sqlite3").Database {
  if (!sqliteDb) {
    // Dynamic require so the module doesn't crash on machines without the .node binding
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const dbPath = process.env.KUMA_DB_PATH!;
    console.log(`[KumaDB] SQLite mode — opening ${dbPath}`);
    sqliteDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return sqliteDb!;
}

function fetchHeartbeatsFromSqlite(
  monitorIds: number[],
  hours: number,
  untilDate?: string
): KumaHeartbeat[] {
  const db = getSqliteDb();

  const now = untilDate ? new Date(untilDate).getTime() : Date.now();
  const sinceMs = now - hours * 3_600_000;

  // SQLite stores time as ISO-8601 string in UTC
  const since = new Date(sinceMs).toISOString().replace("T", " ").substring(0, 19);
  const until = new Date(now).toISOString().replace("T", " ").substring(0, 19);

  const placeholders = monitorIds.map(() => "?").join(",");
  const stmt = db.prepare(`
    SELECT monitor_id as monitorID, status, time, msg, ping, duration
    FROM heartbeat
    WHERE monitor_id IN (${placeholders})
      AND time >= ?
      AND time <= ?
    ORDER BY time ASC
  `);

  return stmt.all(...monitorIds, since, until) as KumaHeartbeat[];
}

function fetchBadDatesSqlite(monitorIds: number[]): string[] {
  const db = getSqliteDb();

  const cutoff = new Date(Date.now() - 90 * 86_400_000)
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);

  const placeholders = monitorIds.map(() => "?").join(",");
  const stmt = db.prepare(`
    SELECT DISTINCT DATE(time) as eventDate
    FROM heartbeat
    WHERE monitor_id IN (${placeholders})
      AND status = 0
      AND time >= ?
  `);

  const rows = stmt.all(...monitorIds, cutoff) as { eventDate: string }[];
  return rows.map((r) => r.eventDate);
}

// ─────────────────────────────────────────────
// MySQL implementation
// ─────────────────────────────────────────────

let mysqlPool: mysql.Pool | null = null;

export function getKumaDb(): mysql.Pool {
  if (detectMode() !== "mysql") {
    throw new Error(
      "[KumaDB] MySQL mode requires KUMA_DB_HOST or KUMA_DB_SOCKET to be set in the environment. " +
        "Set KUMA_DB_PATH for SQLite mode, or leave both unset to use Socket.IO only."
    );
  }

  if (!mysqlPool) {
    const socketPath = process.env.KUMA_DB_SOCKET;
    const host = process.env.KUMA_DB_HOST;
    const user = process.env.KUMA_DB_USER || "kumamap_reader";
    const password = process.env.KUMA_DB_PASSWORD;
    const database = process.env.KUMA_DB_NAME || "kuma";
    const port = parseInt(process.env.KUMA_DB_PORT || "3306", 10);

    if (!password) {
      throw new Error(
        "[KumaDB] KUMA_DB_PASSWORD is required when KUMA_DB_HOST or KUMA_DB_SOCKET is set. " +
          "Run `npm run setup-db` to create the read-only user and get the connection settings."
      );
    }

    if (socketPath) {
      console.log(`[KumaDB] MySQL mode — connecting via socket ${socketPath} as ${user}@${database}`);
    } else {
      console.log(`[KumaDB] MySQL mode — connecting to ${user}@${host}:${port}/${database}`);
    }

    const poolConfig: mysql.PoolOptions = {
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10_000,
    };

    if (socketPath) {
      poolConfig.socketPath = socketPath;
    } else {
      poolConfig.host = host;
      poolConfig.port = port;
    }

    mysqlPool = mysql.createPool(poolConfig);
  }

  return mysqlPool;
}

async function fetchHeartbeatsFromMysql(
  monitorIds: number[],
  hours: number,
  untilDate?: string
): Promise<KumaHeartbeat[]> {
  const db = getKumaDb();

  const now = untilDate ? new Date(untilDate).getTime() : Date.now();
  const sinceMs = now - hours * 3_600_000;
  const since = new Date(sinceMs).toISOString().replace("T", " ").substring(0, 19);
  const until = new Date(now).toISOString().replace("T", " ").substring(0, 19);

  const [rows] = await db.query(
    `SELECT monitor_id as monitorID, status, time, msg, ping, duration
     FROM heartbeat
     WHERE monitor_id IN (?)
       AND time >= ?
       AND time <= ?
     ORDER BY time ASC`,
    [monitorIds, since, until]
  );

  return rows as KumaHeartbeat[];
}

async function fetchBadDatesMysql(monitorIds: number[]): Promise<string[]> {
  const db = getKumaDb();

  const [rows] = await db.query(
    `SELECT DISTINCT DATE(time) as eventDate
     FROM heartbeat
     WHERE monitor_id IN (?)
       AND status = 0
       AND time >= DATE_SUB(NOW(), INTERVAL 90 DAY)`,
    [monitorIds]
  );

  return (rows as { eventDate: Date | string }[]).map((r) => {
    const d = new Date(r.eventDate);
    return d.toISOString().split("T")[0];
  });
}

// ─────────────────────────────────────────────
// Public unified API
// ─────────────────────────────────────────────

/**
 * Fetch heartbeats for the given monitor IDs over the specified time window.
 * Automatically uses SQLite or MySQL depending on environment configuration.
 * Throws if neither KUMA_DB_PATH nor KUMA_DB_HOST is set (disabled mode).
 */
export async function fetchHeartbeatsFromDb(
  monitorIds: number[],
  hours: number = 24,
  untilDate?: string
): Promise<KumaHeartbeat[]> {
  if (!monitorIds || monitorIds.length === 0) return [];

  const mode = detectMode();

  if (mode === "sqlite") {
    return fetchHeartbeatsFromSqlite(monitorIds, Math.min(hours, 2160), untilDate);
  }

  if (mode === "mysql") {
    return fetchHeartbeatsFromMysql(monitorIds, Math.min(hours, 2160), untilDate);
  }

  throw new Error(
    "[KumaDB] No database configured. Set KUMA_DB_PATH (SQLite) or KUMA_DB_HOST (MySQL) " +
      "to enable historical timeline. Run `npm run setup-db` for guided setup."
  );
}

/**
 * Fetch the list of calendar dates (last 90 days) that had at least one DOWN event.
 * Used by the timeline calendar heatmap. Returns [] if DB is not configured.
 */
export async function fetchBadDatesFromDb(monitorIds: number[]): Promise<string[]> {
  if (!monitorIds || monitorIds.length === 0) return [];

  const mode = detectMode();

  if (mode === "sqlite") {
    return fetchBadDatesSqlite(monitorIds);
  }

  if (mode === "mysql") {
    return fetchBadDatesMysql(monitorIds);
  }

  throw new Error("[KumaDB] No database configured.");
}

// ─────────────────────────────────────────────
// Down-since query (start of current down streak)
// ─────────────────────────────────────────────

/**
 * For each given monitor ID that is currently in a DOWN streak, returns the ISO
 * timestamp of when that streak began (i.e. the first consecutive DOWN heartbeat
 * after the last UP heartbeat). If a monitor has never had an UP heartbeat in
 * the stored history, returns its earliest recorded DOWN heartbeat.
 *
 * Returns a Map<monitorId, isoTimestamp>.
 */
export async function fetchDownSinceTimes(monitorIds: number[]): Promise<Map<number, string>> {
  if (!monitorIds || monitorIds.length === 0) return new Map();
  const mode = detectMode();
  if (mode === "disabled") return new Map();

  if (mode === "sqlite") {
    const db = getSqliteDb();
    const placeholders = monitorIds.map(() => "?").join(",");
    // Find the first DOWN heartbeat after the last UP heartbeat for each monitor
    const stmt = db.prepare(`
      SELECT h.monitor_id as monitorID, MIN(h.time) as down_since
      FROM heartbeat h
      WHERE h.monitor_id IN (${placeholders})
        AND h.status = 0
        AND h.time > COALESCE(
          (SELECT MAX(u.time) FROM heartbeat u
           WHERE u.monitor_id = h.monitor_id AND u.status = 1),
          '1970-01-01 00:00:00'
        )
      GROUP BY h.monitor_id
    `);
    const rows = stmt.all(...monitorIds) as { monitorID: number; down_since: string }[];
    const result = new Map<number, string>();
    for (const r of rows) {
      // Normalise SQLite ISO string → proper ISO-8601
      const t = r.down_since.includes("T") ? r.down_since : r.down_since.replace(" ", "T") + "Z";
      result.set(r.monitorID, t);
    }
    return result;
  }

  // MySQL / MariaDB
  const db = getKumaDb();
  const [rows] = await db.query(
    `SELECT h.monitor_id AS monitorID, MIN(h.time) AS down_since
     FROM heartbeat h
     WHERE h.monitor_id IN (?)
       AND h.status = 0
       AND h.time > COALESCE(
         (SELECT MAX(u.time) FROM heartbeat u
          WHERE u.monitor_id = h.monitor_id AND u.status = 1),
         '1970-01-01 00:00:00'
       )
     GROUP BY h.monitor_id`,
    [monitorIds]
  ) as any[];
  const result = new Map<number, string>();
  for (const r of (rows as { monitorID: number; down_since: Date | string }[])) {
    const d = r.down_since instanceof Date ? r.down_since.toISOString() : String(r.down_since);
    result.set(r.monitorID, d);
  }
  return result;
}

/**
 * Returns a human-readable description of the current DB mode.
 * Useful for status/health endpoints.
 */
export function getDbMode(): { mode: DbMode; detail: string } {
  const mode = detectMode();
  if (mode === "sqlite") return { mode, detail: `SQLite: ${process.env.KUMA_DB_PATH}` };
  if (mode === "mysql") {
    const connStr = process.env.KUMA_DB_SOCKET
      ? `socket:${process.env.KUMA_DB_SOCKET}`
      : `${process.env.KUMA_DB_HOST}:${process.env.KUMA_DB_PORT || 3306}`;
    return {
      mode,
      detail: `MySQL: ${process.env.KUMA_DB_USER || "kumamap_reader"}@${connStr}/${process.env.KUMA_DB_NAME || "kuma"}`,
    };
  }
  return { mode: "disabled", detail: "No DB configured — using Socket.IO only" };
}
