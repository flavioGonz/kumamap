import { NextRequest } from "next/server";
import { getHikEventStore } from "@/lib/hik-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/hik/events/stream?mapId=xxx
 *
 * Server-Sent Events stream for real-time Hikvision events.
 * Optionally filters by mapId to only receive events for nodes in a specific map.
 *
 * HTTP/2 compatible: avoids `Connection` header (invalid in h2) and sends
 * periodic heartbeat comments to prevent proxy timeouts (Cloudflare, nginx, etc.).
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId") || undefined;
  const store = getHikEventStore();

  let clientId: string;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      clientId = store.addClient(controller, mapId);

      // Send initial connection message
      const hello = `data: ${JSON.stringify({ type: "connected", clientId, mapId })}\n\n`;
      controller.enqueue(new TextEncoder().encode(hello));

      // Send recent events as initial batch
      if (mapId) {
        const recent = store.getMapEvents(mapId, 20);
        if (recent.length > 0) {
          const batch = `data: ${JSON.stringify({ type: "history", events: recent })}\n\n`;
          controller.enqueue(new TextEncoder().encode(batch));
        }
      }

      // Heartbeat every 30s to keep the connection alive through HTTP/2 proxies
      // (Cloudflare has a 100s idle timeout; nginx default is 60s)
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        } catch {
          // Controller closed — clean up
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 30_000);
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      store.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",        // Disable nginx/proxy buffering
      "X-Content-Type-Options": "nosniff",
    },
  });
}
