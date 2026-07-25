/**
 * Client-side helpers for building camera proxy URLs.
 *
 * ALWAYS prefer `streamRef` (a server-signed opaque token) over `streamUrl`.
 * The raw URL contains RTSP credentials and is only present for authenticated
 * operators; the kiosk and the mobile PWA receive it redacted.
 *
 * Passing `url=` still works for logged-in operators (the stream-test button),
 * but it is rejected for anonymous callers by the API.
 */

import { apiUrl } from "./api";

export interface StreamSource {
  streamUrl?: string;
  streamRef?: string;
  streamType?: string;
  rtspFps?: number;
}

/** Build the query fragment that identifies the stream to the proxy. */
function targetParam(cam: StreamSource): string | null {
  if (cam.streamRef) return `ref=${encodeURIComponent(cam.streamRef)}`;
  if (cam.streamUrl) return `url=${encodeURIComponent(cam.streamUrl)}`;
  return null;
}

/** Snapshot (single JPEG) proxy URL. `bust` forces a fresh frame. */
export function snapshotSrc(cam: StreamSource, bust: number = Date.now()): string {
  const target = targetParam(cam);
  if (!target) return "";
  return apiUrl(`/api/camera/snapshot?${target}&_t=${bust}`);
}

/** RTSP → MJPEG proxy URL. */
export function rtspSrc(
  cam: StreamSource,
  opts: { fps?: number; quality?: number; scale?: number } = {}
): string {
  const target = targetParam(cam);
  if (!target) return "";
  const params = [target, `fps=${opts.fps ?? cam.rtspFps ?? 2}`];
  if (opts.quality) params.push(`quality=${opts.quality}`);
  if (opts.scale) params.push(`scale=${opts.scale}`);
  return apiUrl(`/api/camera/rtsp-stream?${params.join("&")}`);
}

/** The right proxy URL for whatever `streamType` the camera uses. */
export function streamSrc(cam: StreamSource): string {
  switch (cam.streamType) {
    case "rtsp":
      return rtspSrc(cam);
    case "snapshot":
      return snapshotSrc(cam);
    case "mjpeg":
    default:
      // MJPEG/iframe are loaded directly by the browser; there is no proxy.
      return cam.streamUrl || "";
  }
}
