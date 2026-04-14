import { NextRequest } from "next/server";
import { spawn, type ChildProcess } from "child_process";

/**
 * RTSP → MJPEG proxy using ffmpeg.
 *
 * GET /api/camera/rtsp-stream?url=rtsp://user:pass@ip:554/stream&fps=2&quality=5&scale=640
 *
 * Optimized for low-latency streaming to browsers:
 * - TCP transport for reliability over WiFi/lossy networks
 * - Zero-copy JPEG parsing from ffmpeg stdout
 * - Configurable FPS, quality, and output resolution
 * - Auto-cleanup on client disconnect
 * - Max 8 concurrent streams to prevent server overload
 */

const BOUNDARY = "kumamap-rtsp-frame";
const MAX_CONCURRENT = 8;
let activeStreams = 0;

/** Only allow rtsp:// protocol, block loopback */
function validateRtspUrl(raw: string): { ok: boolean; reason?: string } {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "rtsp:") return { ok: false, reason: "Only rtsp:// URLs allowed" };
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return { ok: false, reason: "Loopback blocked" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "Invalid RTSP URL" };
  }
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) return new Response("Missing 'url' parameter", { status: 400 });

  const v = validateRtspUrl(rawUrl);
  if (!v.ok) return new Response(v.reason, { status: 400 });

  if (activeStreams >= MAX_CONCURRENT) return new Response("Too many active streams", { status: 429 });

  const fps = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("fps") || "2", 10), 1), 15);
  const quality = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("quality") || "8", 10), 1), 31);
  const scale = req.nextUrl.searchParams.get("scale"); // e.g. "640" → scale to 640px width

  activeStreams++;
  let ffmpeg: ChildProcess | null = null;
  let closed = false;

  function killFfmpeg() {
    if (ffmpeg && !ffmpeg.killed) {
      ffmpeg.kill("SIGTERM");
      setTimeout(() => { if (ffmpeg && !ffmpeg.killed) ffmpeg.kill("SIGKILL"); }, 2000);
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      // Build video filter chain
      const vfParts: string[] = [];
      if (scale) vfParts.push(`scale=${scale}:-1`);
      vfParts.push(`fps=${fps}`);
      const vf = vfParts.join(",");

      ffmpeg = spawn("ffmpeg", [
        // ── Input options (low-latency RTSP) ──
        "-rtsp_transport", "tcp",
        "-rtsp_flags", "prefer_tcp",
        "-timeout", "5000000",           // 5s connection timeout (microseconds)
        "-analyzeduration", "500000",    // 0.5s analyze (faster start)
        "-probesize", "500000",          // 500KB probe (faster start)
        "-fflags", "+nobuffer+discardcorrupt",
        "-flags", "low_delay",
        "-i", rawUrl,

        // ── Output options (MJPEG to stdout) ──
        "-an",                           // No audio
        "-vf", vf,                       // FPS limit + optional scale
        "-q:v", String(quality),         // JPEG quality (2=high, 8=medium, 15=low)
        "-f", "mjpeg",                   // MJPEG output
        "-flush_packets", "1",           // Flush after each frame
        "pipe:1",
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!ffmpeg.stdout || !ffmpeg.stderr) {
        activeStreams = Math.max(0, activeStreams - 1);
        controller.close();
        return;
      }

      let buffer = Buffer.alloc(0);
      const SOI = Buffer.from([0xff, 0xd8]);
      const EOI = Buffer.from([0xff, 0xd9]);

      ffmpeg.stdout.on("data", (chunk: Buffer) => {
        if (closed) return;
        buffer = Buffer.concat([buffer, chunk]);

        // Extract complete JPEG frames (SOI→EOI)
        let searchFrom = 0;
        while (true) {
          const soi = buffer.indexOf(SOI, searchFrom);
          if (soi === -1) break;
          const eoi = buffer.indexOf(EOI, soi + 2);
          if (eoi === -1) break;

          const frame = buffer.subarray(soi, eoi + 2);
          try {
            controller.enqueue(new TextEncoder().encode(
              `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
            ));
            controller.enqueue(new Uint8Array(frame));
            controller.enqueue(new TextEncoder().encode("\r\n"));
          } catch {
            closed = true;
            killFfmpeg();
            return;
          }
          searchFrom = eoi + 2;
        }

        // Keep unprocessed bytes, cap at 1MB
        if (searchFrom > 0) buffer = buffer.subarray(searchFrom);
        if (buffer.length > 1024 * 1024) buffer = buffer.subarray(buffer.length - 256 * 1024);
      });

      // Capture stderr for connection errors (don't log normal stats)
      let stderrBuf = "";
      ffmpeg.stderr.on("data", (d: Buffer) => {
        stderrBuf += d.toString();
        // If ffmpeg can't connect, close the stream with an error indicator
        if (stderrBuf.includes("Connection refused") || stderrBuf.includes("Connection timed out") || stderrBuf.includes("Server returned")) {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch {}
          }
        }
        // Keep stderr buffer small
        if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-2048);
      });

      ffmpeg.on("close", () => {
        activeStreams = Math.max(0, activeStreams - 1);
        if (!closed) { closed = true; try { controller.close(); } catch {} }
      });

      ffmpeg.on("error", () => {
        activeStreams = Math.max(0, activeStreams - 1);
        if (!closed) { closed = true; try { controller.close(); } catch {} }
      });

      // Cleanup on client disconnect
      req.signal.addEventListener("abort", () => { closed = true; killFfmpeg(); });
    },

    cancel() {
      closed = true;
      killFfmpeg();
      activeStreams = Math.max(0, activeStreams - 1);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
