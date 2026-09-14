import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";

/**
 * Server-side proxy for camera snapshots.
 * Supports:
 *  - HTTP/HTTPS with Basic Auth and Digest Auth (Hikvision, Tiandy, etc.)
 *  - RTSP URLs via ffmpeg (captures a single frame from the stream)
 *
 * Usage: GET /api/camera/snapshot?url=<encoded-camera-url>
 * Credentials embedded in URL: http://user:pass@host/path
 *                             rtsp://user:pass@host:554/path
 */

function md5(s: string) {
  return createHash("md5").update(s).digest("hex");
}

/** Parse WWW-Authenticate: Digest header fields */
function parseDigestChallenge(header: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|([\w./@-]+))/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(header)) !== null) {
    fields[m[1]] = m[2] ?? m[3];
  }
  return fields;
}

/** Build a Digest Auth response header */
function buildDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: Record<string, string>,
): string {
  const { realm, nonce, qop, opaque, algorithm } = challenge;

  const ha1 = algorithm?.toUpperCase() === "MD5-SESS"
    ? md5(`${md5(`${username}:${realm}:${password}`)}:${nonce}:00000001:abcdef01`)
    : md5(`${username}:${realm}:${password}`);

  const ha2 = md5(`${method}:${uri}`);

  let response: string;
  let ncHex = "00000001";
  let cnonce = "abcdef01";

  if (qop === "auth" || qop === "auth-int") {
    response = md5(`${ha1}:${nonce}:${ncHex}:${cnonce}:${qop}:${ha2}`);
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
  }

  let header =
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) header += `, qop=${qop}, nc=${ncHex}, cnonce="${cnonce}"`;
  if (opaque) header += `, opaque="${opaque}"`;
  if (algorithm) header += `, algorithm=${algorithm}`;

  return header;
}

// ── SSRF Protection ───────────────────────────────────────────────────────────

function validateUrlTarget(hostname: string): { ok: boolean; reason?: string } {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") {
    return { ok: false, reason: "loopback blocked" };
  }
  if (lower.startsWith("169.254.")) {
    return { ok: false, reason: "link-local blocked" };
  }
  return { ok: true };
}

// ── RTSP snapshot via ffmpeg ──────────────────────────────────────────────────

async function captureRtspSnapshot(rtspUrl: string): Promise<Buffer> {
  const tmpFile = join(tmpdir(), `kumamap-snap-${randomBytes(8).toString("hex")}.jpg`);

  return new Promise<Buffer>((resolve, reject) => {
    // ffmpeg: connect to RTSP, grab 1 frame, output as JPEG
    const args = [
      "-y",                         // overwrite output
      "-rtsp_transport", "tcp",     // use TCP for RTSP (more reliable)
      "-i", rtspUrl,                // input RTSP URL (with credentials)
      "-frames:v", "1",            // capture only 1 frame
      "-q:v", "3",                 // JPEG quality (2-5, lower = better)
      "-f", "image2",              // output format
      tmpFile,                      // output file
    ];

    const proc = execFile("ffmpeg", args, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, async (err) => {
      try {
        if (err) {
          // Cleanup temp file on error
          await unlink(tmpFile).catch(() => {});
          return reject(new Error(`ffmpeg error: ${err.message}`));
        }

        const data = await readFile(tmpFile);
        await unlink(tmpFile).catch(() => {});

        if (data.length === 0) {
          return reject(new Error("ffmpeg produced empty output"));
        }

        resolve(data);
      } catch (e: any) {
        await unlink(tmpFile).catch(() => {});
        reject(new Error(`Snapshot read error: ${e.message}`));
      }
    });

    // Kill ffmpeg if it hangs
    setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
    }, 14000);
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  try {
    const parsed = new URL(rawUrl);

    // SSRF check
    const ssrfCheck = validateUrlTarget(parsed.hostname);
    if (!ssrfCheck.ok) {
      return new Response(`Blocked: ${ssrfCheck.reason}`, { status: 403 });
    }

    // ── RTSP: use ffmpeg to capture a frame ─────────────────────────────────
    if (parsed.protocol === "rtsp:") {
      try {
        const jpegBuffer = await captureRtspSnapshot(rawUrl);
        return new Response(new Uint8Array(jpegBuffer), {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        });
      } catch (err: any) {
        return new Response(`RTSP snapshot failed: ${err.message}`, { status: 502 });
      }
    }

    // ── HTTP/HTTPS: proxy with auth ─────────────────────────────────────────
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("Only http, https, and rtsp URLs are allowed", { status: 400 });
    }

    let username = decodeURIComponent(parsed.username);
    let password = decodeURIComponent(parsed.password);
    parsed.username = "";
    parsed.password = "";
    const fetchUrl = parsed.toString();

    const baseHeaders: Record<string, string> = {
      "User-Agent": "KumaMap-CameraProxy/1.5",
    };

    if (username) {
      baseHeaders["Authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }

    let response = await fetch(fetchUrl, {
      headers: baseHeaders,
      signal: AbortSignal.timeout(8000),
    });

    // Digest auth retry if needed
    if (response.status === 401 && username) {
      const wwwAuth = response.headers.get("www-authenticate") ?? "";
      if (wwwAuth.toLowerCase().startsWith("digest")) {
        const challenge = parseDigestChallenge(wwwAuth);
        const parsedFetch = new URL(fetchUrl);
        const uri = parsedFetch.pathname + parsedFetch.search;
        const digestHeader = buildDigestHeader("GET", uri, username, password, challenge);

        response = await fetch(fetchUrl, {
          headers: { ...baseHeaders, Authorization: digestHeader },
          signal: AbortSignal.timeout(8000),
        });
      }
    }

    if (!response.ok) {
      return new Response(`Camera returned HTTP ${response.status}`, { status: 502 });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err: any) {
    return new Response(`Snapshot error: ${err.message}`, { status: 500 });
  }
}
