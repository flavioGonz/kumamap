import { NextResponse } from "next/server";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

/**
 * GET /api/version
 *
 * Returns local and remote git version info for OTA update checking.
 * Compares local HEAD with origin/master to detect available updates.
 */
export async function GET() {
  try {
    const cwd = process.cwd();

    // Local version info
    const localCommit = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
    const localFull = execSync("git rev-parse HEAD", { cwd, encoding: "utf-8" }).trim();
    const localDate = execSync("git log -1 --format=%ci", { cwd, encoding: "utf-8" }).trim();
    const localMsg = execSync("git log -1 --format=%s", { cwd, encoding: "utf-8" }).trim();
    const localBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8" }).trim();

    // Get app version from changelog
    let appVersion = "unknown";
    try {
      const changelog = require("@/lib/changelog");
      appVersion = changelog.APP_VERSION;
    } catch {
      // Fallback: read from package.json
      try {
        const pkg = require("../../package.json");
        appVersion = pkg.version;
      } catch {}
    }

    // Fetch remote to check for updates (timeout 10s)
    let remoteCommit = "";
    let remoteDate = "";
    let remoteMsg = "";
    let commitsAhead = 0;
    let commitsBehind = 0;
    let updateAvailable = false;
    let fetchError = "";

    try {
      execSync("git fetch origin --quiet", { cwd, timeout: 10000 });
      remoteCommit = execSync("git rev-parse --short origin/master", { cwd, encoding: "utf-8" }).trim();
      const remoteFull = execSync("git rev-parse origin/master", { cwd, encoding: "utf-8" }).trim();
      remoteDate = execSync("git log -1 --format=%ci origin/master", { cwd, encoding: "utf-8" }).trim();
      remoteMsg = execSync("git log -1 --format=%s origin/master", { cwd, encoding: "utf-8" }).trim();

      // Count commits ahead/behind
      const aheadBehind = execSync(`git rev-list --left-right --count HEAD...origin/master`, { cwd, encoding: "utf-8" }).trim();
      const [ahead, behind] = aheadBehind.split(/\s+/).map(Number);
      commitsAhead = ahead || 0;
      commitsBehind = behind || 0;
      updateAvailable = commitsBehind > 0;

      // Get list of new commits if update available
      let newCommits: { hash: string; date: string; msg: string }[] = [];
      if (updateAvailable) {
        const log = execSync(
          `git log --oneline --format="%h|%ci|%s" HEAD..origin/master`,
          { cwd, encoding: "utf-8" }
        ).trim();
        newCommits = log.split("\n").filter(Boolean).map((line) => {
          const [hash, ...rest] = line.split("|");
          const date = rest[0] || "";
          const msg = rest.slice(1).join("|");
          return { hash, date, msg };
        });
      }

      return NextResponse.json({
        appVersion,
        local: { commit: localCommit, fullHash: localFull, date: localDate, message: localMsg, branch: localBranch },
        remote: { commit: remoteCommit, date: remoteDate, message: remoteMsg },
        updateAvailable,
        commitsAhead,
        commitsBehind,
        newCommits,
      });
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        appVersion,
        local: { commit: localCommit, fullHash: localFull, date: localDate, message: localMsg, branch: localBranch },
        remote: null,
        updateAvailable: false,
        commitsAhead: 0,
        commitsBehind: 0,
        newCommits: [],
        fetchError: "No se pudo contactar el repositorio remoto",
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get version info" },
      { status: 500 }
    );
  }
}
