import { NextRequest } from "next/server";
import { spawn, type ChildProcess } from "child_process";
import { resolveProxyTarget } from "@/lib/stream-token";
import { assertSafeDeviceUrl } from "@/lib/ssrf-guard";

/**
 * RTSP → MJPEG proxy using ffmpeg.
 *
 * GET /api/camera/rtsp-stream?ref=<signed-ref>&fps=2&quality=5&scale=640
 *
 * The target is passed as a server-signed `ref` (see lib/stream-token.ts), so
 * credentials never reach the browser and callers cannot aim the proxy at an
 * arbitrary host. Authenticated operators may still pass a raw `?url=` for the
 * stream-test button; that path is validated by the SSRF guard.
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

export async function GET(req: NextRequest) {
  const target = resolveProxyTarget(req.nextUrl.searchParams, req.headers);
  if ("error" in target) return new Response(target.error, { status: target.status });

  const rawUrl = target.url;

  if (!rawUrl.startsWith("rtsp://") && !rawUrl.startsWith("rtsps://")) {
    return new Response("Solo se permiten URLs rtsp://", { status: 400 });
  }

  // Resolves DNS and rejects loopback / link-local / public destinations.
  const guard = await assertSafeDeviceUrl(rawUrl);
  if (!guard.ok) return new Response(guard.reason, { status: 403 });

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
        // ── Input options (ultra low-latency RTSP) ──
        "-rtsp_transport", "tcp",
        "-rtsp_flags", "prefer_tcp",
        "-timeout", "5000000",           // 5s connection timeout (microseconds)
        "-analyzeduration", "100000",    // 100ms analyze (minimal)
        "-probesize", "100000",          // 100KB probe (minimal)
        "-fflags", "+nobuffer+discardcorrupt+genpts",
        "-flags", "low_delay",
        "-avioflags", "direct",          // Direct I/O, no buffering
        "-i", rawUrl,

        // ── Output options (MJPEG to stdout) ──
        "-an",                           // No audio
        "-vf", vf,                       // FPS limit + optional scale
        "-q:v", String(quality),         // JPEG quality (2=high, 8=medium, 15=low)
        "-f", "mjpeg",                   // MJPEG output
        "-flush_packets", "1",           // Flush after each frame
        "-max_delay", "0",               // No output delay
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
