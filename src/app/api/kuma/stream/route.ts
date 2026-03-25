import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET() {
  const kuma = getKumaClient();

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const monitors = kuma.getMonitors();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "monitors", data: monitors, connected: kuma.isConnected })}\n\n`
        )
      );

      // Poll every 3 seconds for updates
      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const monitors = kuma.getMonitors();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "monitors", data: monitors, connected: kuma.isConnected })}\n\n`
            )
          );
        } catch {
          clearInterval(interval);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      }, 3000);

      // Cleanup on close
      return () => {
        closed = true;
        clearInterval(interval);
      };
    },
    cancel() {
      closed = true;
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
