import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getKumaDb() {
  if (!pool) {
    const host = process.env.KUMA_DB_HOST || '192.168.99.122';
    const user = process.env.KUMA_DB_USER || 'kumamap_reader';
    const password = process.env.KUMA_DB_PASSWORD || 'KumaMapReader2026*';
    const database = process.env.KUMA_DB_NAME || 'kuma';

    console.log(`[MySQL] Connecting to Kuma DB at ${host}...`);

    pool = mysql.createPool({
      host,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

export interface KumaHeartbeat {
  monitorID: number;
  status: number;
  time: string;
  msg: string;
  ping: number | null;
  duration: number;
}

/**
 * Fetch heartbeats directly from Uptime Kuma's MySQL database.
 */
export async function fetchHeartbeatsFromDb(monitorIds: number[], hours: number = 24, untilDate?: string): Promise<KumaHeartbeat[]> {
  if (!monitorIds || monitorIds.length === 0) {
    return [];
  }

  const db = getKumaDb();
  
  // If untilDate is provided, we calculate 'since' relative to that date or absolute.
  // Actually, let's use absolute timestamps for better precision.
  const now = untilDate ? new Date(untilDate).getTime() : Date.now();
  const sinceMs = now - hours * 60 * 60 * 1000;
  const since = new Date(sinceMs).toISOString().replace('T', ' ').substring(0, 19);
  const until = new Date(now).toISOString().replace('T', ' ').substring(0, 19);
  
  const query = `
    SELECT monitor_id as monitorID, status, time, msg, ping, duration 
    FROM heartbeat 
    WHERE monitor_id IN (?) 
    AND time >= ?
    AND time <= ?
    ORDER BY time ASC
  `;

  const [rows] = await db.query(query, [monitorIds, since, until]);
  return rows as KumaHeartbeat[];
}
