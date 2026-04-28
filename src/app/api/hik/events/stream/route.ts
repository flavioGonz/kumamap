import { NextRequest } from "next/server";
import { getHikEventStore } from "@/lib/hik-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/hik/events/stream?mapId=xxx
 *
 * Server-Sent Events stream for real-time Hikvision events.
 * Optionally filters by mapId to only receive events for nodes in a specific map.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId") || undefined;
  const store = getHikEventStore();

  let clientId: string;

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
    },
    cancel() {
      store.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
