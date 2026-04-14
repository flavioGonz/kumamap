import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getDeployTargets, type DeployTarget } from "@/lib/deploy-targets";

export const dynamic = "force-dynamic";

// Prevent concurrent deploys
let deploying = false;

interface DeployResult {
  target: string;
  host: string;
  status: "success" | "error";
  output: string;
  durationMs: number;
}

/**
 * POST /api/deploy
 * Body: { targets?: string[] }  — array of target IDs. If omitted, deploys to ALL targets.
 *
 * Runs git pull → npm run build → pm2 restart on each target via SSH.
 * Returns results per target.
 */
export async function POST(req: NextRequest) {
  if (deploying) {
    return NextResponse.json(
      { error: "Deploy already in progress" },
      { status: 409 }
    );
  }

  let body: { targets?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = deploy all
  }

  const allTargets = getDeployTargets();
  const selectedTargets = body.targets
    ? allTargets.filter((t) => body.targets!.includes(t.id))
    : allTargets;

  if (selectedTargets.length === 0) {
    return NextResponse.json(
      { error: "No matching targets found", available: allTargets.map((t) => t.id) },
      { status: 400 }
    );
  }

  deploying = true;

  try {
    // Deploy to all targets in parallel
    const results = await Promise.all(
      selectedTargets.map((target) => deployToTarget(target))
    );

    const allSuccess = results.every((r) => r.status === "success");

    return NextResponse.json({
      status: allSuccess ? "success" : "partial_failure",
      results,
    });
  } finally {
    deploying = false;
  }
}

/**
 * GET /api/deploy
 * Returns the list of configured deploy targets.
 */
export async function GET() {
  const targets = getDeployTargets();
  return NextResponse.json({
    targets: targets.map((t) => ({
      id: t.id,
      name: t.name,
      host: t.host,
    })),
    deploying,
  });
}

async function deployToTarget(target: DeployTarget): Promise<DeployResult> {
  const start = Date.now();
  const path = target.path || "/opt/kumamap";
  const pm2Name = target.pm2Name || "kumamap";

  const command = [
    `cd ${path}`,
    "git pull origin master",
    "npm run build",
    `pm2 restart ${pm2Name}`,
  ].join(" && ");

  try {
    const output = await sshExec(target, command, 180_000); // 3min timeout
    return {
      target: target.name,
      host: target.host,
      status: "success",
      output: truncate(output, 2000),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      target: target.name,
      host: target.host,
      status: "error",
      output: truncate(err instanceof Error ? err.message : String(err), 2000),
      durationMs: Date.now() - start,
    };
  }
}

function sshExec(target: DeployTarget, command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      "-o", "BatchMode=yes",
      "-p", String(target.port || 22),
      `${target.user}@${target.host}`,
      command,
    ];

    const proc = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`SSH timeout after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout + stderr);
      } else {
        reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n... (truncated)";
}
