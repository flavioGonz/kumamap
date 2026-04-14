import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";
import os from "os";
import fs from "fs";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Internal health check endpoint. Returns system status:
 * - Kuma socket connection state
 * - Number of monitors and their status breakdown
 * - Last heartbeat age (staleness indicator)
 * - Database accessibility
 * - Disk usage on the data partition
 * - System uptime and memory
 *
 * Designed to be monitored by Uptime Kuma itself (keyword monitor on "healthy").
 */
export async function GET() {
  const start = Date.now();
  const checks: Record<string, any> = {};
  let healthy = true;

  // ── 1. Kuma connection ──────────────────────────────────────────────────────
  try {
    const kuma = getKumaClient();
    const monitors = kuma.getMonitors();
    const connected = kuma.isConnected;

    const up = monitors.filter((m) => m.status === 1).length;
    const down = monitors.filter((m) => m.status === 0).length;
    const pending = monitors.filter((m) => m.status !== 0 && m.status !== 1).length;

    // Find the most recent heartbeat time across all monitors
    let latestHeartbeat: string | null = null;
    let latestTs = 0;
    for (const m of monitors) {
      const history = kuma.getHistory(m.id);
      if (history.length > 0) {
        const last = history[history.length - 1];
        const t = new Date(last.time).getTime();
        if (t > latestTs) {
          latestTs = t;
          latestHeartbeat = last.time;
        }
      }
    }

    const heartbeatAgeMs = latestTs > 0 ? Date.now() - latestTs : null;
    const heartbeatStale = heartbeatAgeMs !== null && heartbeatAgeMs > 120_000; // >2min = stale

    if (!connected) healthy = false;
    if (heartbeatStale) healthy = false;

    checks.kuma = {
      status: connected ? "connected" : "disconnected",
      monitors: { total: monitors.length, up, down, pending },
      lastHeartbeat: latestHeartbeat,
      heartbeatAgeSeconds: heartbeatAgeMs !== null ? Math.round(heartbeatAgeMs / 1000) : null,
      heartbeatStale,
    };
  } catch (err) {
    healthy = false;
    checks.kuma = { status: "error", error: err instanceof Error ? err.message : String(err) };
  }

  // ── 2. Database ─────────────────────────────────────────────────────────────
  try {
    const { fetchDownSinceTimes } = await import("@/lib/kuma-db");
    // Quick probe — empty array should return empty Map without error if DB is accessible
    await fetchDownSinceTimes([]);
    checks.database = { status: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No database configured") || msg.includes("disabled")) {
      checks.database = { status: "not_configured" };
    } else {
      healthy = false;
      checks.database = { status: "error", error: msg };
    }
  }

  // ── 3. Disk usage ───────────────────────────────────────────────────────────
  try {
    const stats = fs.statfsSync("/");
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bavail;
    const usedBytes = totalBytes - freeBytes;
    const usedPct = Math.round((usedBytes / totalBytes) * 100);
    const diskLow = usedPct > 90;

    if (diskLow) healthy = false;

    checks.disk = {
      status: diskLow ? "warning" : "ok",
      totalGb: +(totalBytes / 1e9).toFixed(1),
      usedGb: +(usedBytes / 1e9).toFixed(1),
      freeGb: +(freeBytes / 1e9).toFixed(1),
      usedPercent: usedPct,
    };
  } catch (err) {
    checks.disk = { status: "error", error: err instanceof Error ? err.message : String(err) };
  }

  // ── 4. System info ──────────────────────────────────────────────────────────
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);

  checks.system = {
    uptimeSeconds: Math.round(os.uptime()),
    uptimeHuman: formatUptime(os.uptime()),
    memoryUsedPercent: memUsedPct,
    memoryTotalGb: +(totalMem / 1e9).toFixed(1),
    loadAverage: os.loadavg().map((l) => +l.toFixed(2)),
    platform: `${os.type()} ${os.release()}`,
    nodeVersion: process.version,
  };

  const responseTimeMs = Date.now() - start;

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      responseTimeMs,
      checks,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
