import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

export const dynamic = "force-dynamic";

let updating = false;

/**
 * POST /api/deploy
 *
 * Self-update: git pull → npm install → npm run build → pm2 restart
 * Runs locally — each KumaMap instance updates itself.
 */
export async function POST() {
  if (updating) {
    return NextResponse.json(
      { error: "Actualización en progreso" },
      { status: 409 }
    );
  }

  updating = true;
  const start = Date.now();
  const cwd = process.cwd();

  try {
    const steps = [
      { label: "git pull", cmd: "git pull origin master" },
      { label: "npm install", cmd: "npm install --omit=dev --ignore-scripts 2>&1 || true" },
      { label: "build", cmd: "npm run build" },
      { label: "restart", cmd: "pm2 restart kumamap || pm2 restart all" },
    ];

    const logs: { step: string; output: string; ok: boolean; ms: number }[] = [];
    let failed = false;

    for (const step of steps) {
      if (failed) break;
      const stepStart = Date.now();
      try {
        const output = await run(step.cmd, cwd, 180_000);
        logs.push({ step: step.label, output: truncate(output, 1500), ok: true, ms: Date.now() - stepStart });
      } catch (err: any) {
        logs.push({ step: step.label, output: truncate(err.message || String(err), 1500), ok: false, ms: Date.now() - stepStart });
        failed = true;
      }
    }

    return NextResponse.json({
      status: failed ? "error" : "success",
      durationMs: Date.now() - start,
      steps: logs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", error: err.message, durationMs: Date.now() - start },
      { status: 500 }
    );
  } finally {
    updating = false;
  }
}

/**
 * GET /api/deploy
 * Returns current deploy status.
 */
export async function GET() {
  return NextResponse.json({ updating });
}

function run(cmd: string, cwd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${stderr || stdout || err.message}`));
      resolve(stdout + stderr);
    });
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n... (truncado)";
}
