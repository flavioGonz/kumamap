import { NextResponse } from "next/server";
import os from "os";
import fs from "fs";

export const dynamic = "force-dynamic";

// Keep a rolling window of CPU samples for sparkline charts
const CPU_HISTORY_SIZE = 60; // 60 samples = ~5 minutes at 5s intervals
const cpuHistory: number[] = [];
const memHistory: number[] = [];
const networkHistory: { rx: number; tx: number; ts: number }[] = [];
let lastCpuTimes: { idle: number; total: number } | null = null;
let lastNetBytes: { rx: number; tx: number; ts: number } | null = null;

function getCpuUsage(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }

  if (lastCpuTimes) {
    const idleDiff = idle - lastCpuTimes.idle;
    const totalDiff = total - lastCpuTimes.total;
    const usage = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
    lastCpuTimes = { idle, total };
    return Math.max(0, Math.min(100, usage));
  }
  lastCpuTimes = { idle, total };
  return 0;
}

function getNetworkBytes(): { rx: number; tx: number } {
  try {
    const data = fs.readFileSync("/proc/net/dev", "utf-8");
    const lines = data.split("\n").slice(2); // skip header
    let rx = 0;
    let tx = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const iface = parts[0].replace(":", "");
      if (iface === "lo") continue; // skip loopback
      rx += parseInt(parts[1], 10) || 0;
      tx += parseInt(parts[9], 10) || 0;
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

function getNetworkRate(): { rxRate: number; txRate: number } {
  const current = getNetworkBytes();
  const now = Date.now();

  if (lastNetBytes) {
    const dt = (now - lastNetBytes.ts) / 1000; // seconds
    if (dt > 0) {
      const rxRate = Math.round((current.rx - lastNetBytes.rx) / dt);
      const txRate = Math.round((current.tx - lastNetBytes.tx) / dt);
      lastNetBytes = { ...current, ts: now };
      return { rxRate: Math.max(0, rxRate), txRate: Math.max(0, txRate) };
    }
  }
  lastNetBytes = { ...current, ts: now };
  return { rxRate: 0, txRate: 0 };
}

function getDiskUsage(): { totalGb: number; usedGb: number; freeGb: number; usedPercent: number } {
  try {
    const stats = fs.statfsSync("/");
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bavail;
    const usedBytes = totalBytes - freeBytes;
    return {
      totalGb: +(totalBytes / 1e9).toFixed(1),
      usedGb: +(usedBytes / 1e9).toFixed(1),
      freeGb: +(freeBytes / 1e9).toFixed(1),
      usedPercent: Math.round((usedBytes / totalBytes) * 100),
    };
  } catch {
    return { totalGb: 0, usedGb: 0, freeGb: 0, usedPercent: 0 };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * GET /api/metrics
 *
 * Returns real-time server performance metrics:
 * - CPU usage (current + 60-sample history)
 * - Memory usage (current + history)
 * - Network I/O rates
 * - Disk usage
 * - System info (uptime, load, processes)
 */
export async function GET() {
  const cpuUsage = getCpuUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.round((usedMem / totalMem) * 100);
  const network = getNetworkRate();
  const disk = getDiskUsage();

  // Push to history
  cpuHistory.push(cpuUsage);
  if (cpuHistory.length > CPU_HISTORY_SIZE) cpuHistory.shift();
  memHistory.push(memPercent);
  if (memHistory.length > CPU_HISTORY_SIZE) memHistory.shift();
  networkHistory.push({ rx: network.rxRate, tx: network.txRate, ts: Date.now() });
  if (networkHistory.length > CPU_HISTORY_SIZE) networkHistory.shift();

  const cpus = os.cpus();
  const processMemMb = +(process.memoryUsage().heapUsed / 1e6).toFixed(1);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    cpu: {
      usage: cpuUsage,
      cores: cpus.length,
      model: cpus[0]?.model || "Unknown",
      history: cpuHistory,
    },
    memory: {
      usedGb: +(usedMem / 1e9).toFixed(2),
      totalGb: +(totalMem / 1e9).toFixed(2),
      freeGb: +(freeMem / 1e9).toFixed(2),
      usedPercent: memPercent,
      processHeapMb: processMemMb,
      history: memHistory,
    },
    network: {
      rxBytesPerSec: network.rxRate,
      txBytesPerSec: network.txRate,
      rxFormatted: formatBytes(network.rxRate),
      txFormatted: formatBytes(network.txRate),
      history: networkHistory.map((h) => ({ rx: h.rx, tx: h.tx })),
    },
    disk,
    system: {
      uptimeSeconds: Math.round(os.uptime()),
      uptimeHuman: formatUptime(os.uptime()),
      loadAverage: os.loadavg().map((l) => +l.toFixed(2)),
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      nodeVersion: process.version,
      pid: process.pid,
    },
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
