import { NextRequest } from "next/server";
import { spawn, type ChildProcess } from "child_process";

/**
 * RTSP → MJPEG proxy using ffmpeg.
 *
 * GET /api/camera/rtsp-stream?url=rtsp://user:pass@ip:554/stream&fps=5&quality=5
 *
 * - Spawns ffmpeg to transcode RTSP to MJPEG
 * - Streams multipart/x-mixed-replace back to the browser
 * - Automatically kills ffmpeg when the client disconnects
 * - Max 1 fps by default to save bandwidth; configurable via &fps=
 */

const BOUNDARY = "kumamap-rtsp-frame";
const MAX_CONCURRENT = 8;
let activeStreams = 0;

/** Only allow rtsp:// protocol */
function validateRtspUrl(raw: string): { ok: boolean; url?: string; reason?: string } {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "rtsp:") {
      return { ok: false, reason: "Only rtsp:// URLs are allowed" };
    }
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return { ok: false, reason: "Loopback blocked" };
    }
    return { ok: true, url: raw };
  } catch {
    return { ok: false, reason: "Invalid RTSP URL" };
  }
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  const validation = validateRtspUrl(rawUrl);
  if (!validation.ok) {
    return new Response(validation.reason, { status: 400 });
  }

  if (activeStreams >= MAX_CONCURRENT) {
    return new Response("Too many active streams", { status: 429 });
  }

  const fps = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("fps") || "2", 10), 1), 15);
  const quality = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("quality") || "5", 10), 1), 31);

  activeStreams++;

  let ffmpeg: ChildProcess | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // ffmpeg: RTSP input → MJPEG frames to stdout
      ffmpeg = spawn("ffmpeg", [
        "-rtsp_transport", "tcp",        // TCP for reliability
        "-i", rawUrl,                    // RTSP input
        "-an",                           // No audio
        "-vf", `fps=${fps}`,             // Limit framerate
        "-q:v", String(quality),         // JPEG quality (1=best, 31=worst)
        "-f", "mjpeg",                   // Output format: motion JPEG
        "-fflags", "nobuffer",           // Low latency
        "-flags", "low_delay",           // Low latency
        "pipe:1",                        // Output to stdout
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = Buffer.alloc(0);

      if (!ffmpeg.stdout || !ffmpeg.stderr) {
        controller.close();
        return;
      }

      ffmpeg.stdout.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        // JPEG markers: SOI = FF D8, EOI = FF D9
        let startIdx = 0;
        while (true) {
          const soi = buffer.indexOf(Buffer.from([0xff, 0xd8]), startIdx);
          if (soi === -1) break;
          const eoi = buffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
          if (eoi === -1) break;

          const frame = buffer.subarray(soi, eoi + 2);

          try {
            const header = `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
            controller.enqueue(new TextEncoder().encode(header));
            controller.enqueue(new Uint8Array(frame));
            controller.enqueue(new TextEncoder().encode("\r\n"));
          } catch {
            // Client disconnected
            cleanup();
            return;
          }

          startIdx = eoi + 2;
        }

        // Keep only unprocessed bytes
        if (startIdx > 0) {
          buffer = buffer.subarray(startIdx);
        }
        // Prevent unbounded buffer growth
        if (buffer.length > 2 * 1024 * 1024) {
          buffer = buffer.subarray(buffer.length - 512 * 1024);
        }
      });

      ffmpeg.stderr!.on("data", () => {
        // Suppress ffmpeg stderr (connection info, encoding stats)
      });

      ffmpeg.on("close", () => {
        activeStreams = Math.max(0, activeStreams - 1);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      ffmpeg.on("error", () => {
        activeStreams = Math.max(0, activeStreams - 1);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      function cleanup() {
        if (ffmpeg && !ffmpeg.killed) {
          ffmpeg.kill("SIGTERM");
          // Force kill after 3s if still running
          setTimeout(() => {
            if (ffmpeg && !ffmpeg.killed) ffmpeg.kill("SIGKILL");
          }, 3000);
        }
      }

      // Handle client disconnect via AbortSignal
      req.signal.addEventListener("abort", cleanup);
    },

    cancel() {
      if (ffmpeg && !ffmpeg.killed) {
        ffmpeg.kill("SIGTERM");
        setTimeout(() => {
          if (ffmpeg && !ffmpeg.killed) ffmpeg.kill("SIGKILL");
        }, 3000);
      }
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
