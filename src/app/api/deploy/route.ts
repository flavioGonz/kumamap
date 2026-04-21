import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

export const dynamic = "force-dynamic";

let updating = false;
let currentStep = "";
let completedSteps: { step: string; output: string; ok: boolean; ms: number }[] = [];
let lastResult: { status: string; durationMs: number; steps: typeof completedSteps } | null = null;

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
  currentStep = "";
  completedSteps = [];
  lastResult = null;
  const start = Date.now();
  const cwd = process.cwd();

  try {
    const steps = [
      { label: "git pull", cmd: "git pull origin master" },
      { label: "npm install", cmd: "npm install --omit=dev --ignore-scripts 2>&1 || true" },
      { label: "build", cmd: "npm run build" },
      { label: "restart", cmd: "pm2 restart kumamap || pm2 restart all" },
    ];

    let failed = false;

    for (const step of steps) {
      if (failed) break;
      currentStep = step.label;
      const stepStart = Date.now();
      try {
        const output = await run(step.cmd, cwd, 300_000);
        completedSteps.push({ step: step.label, output: truncate(output, 1500), ok: true, ms: Date.now() - stepStart });
      } catch (err: any) {
        completedSteps.push({ step: step.label, output: truncate(err.message || String(err), 1500), ok: false, ms: Date.now() - stepStart });
        failed = true;
      }
    }

    currentStep = "";
    lastResult = {
      status: failed ? "error" : "success",
      durationMs: Date.now() - start,
      steps: completedSteps,
    };

    return NextResponse.json(lastResult);
  } catch (err: any) {
    currentStep = "";
    lastResult = {
      status: "error",
      durationMs: Date.now() - start,
      steps: [{ step: "error", output: err.message || String(err), ok: false, ms: 0 }],
    };
    return NextResponse.json(lastResult, { status: 500 });
  } finally {
    updating = false;
  }
}

/**
 * GET /api/deploy
 * Returns current deploy status with step progress.
 */
export async function GET() {
  return NextResponse.json({
    updating,
    currentStep,
    completedSteps: completedSteps.map((s) => ({ step: s.step, ok: s.ok, ms: s.ms })),
    lastResult: !updating ? lastResult : null,
  });
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
