import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

/**
 * POST /api/kuma/reconnect
 * Force disconnect and reconnect to Uptime Kuma.
 * Useful when the socket gets stuck in a disconnected state.
 */
export async function POST() {
  const kuma = getKumaClient();
  const before = kuma.getDiagnostics();

  kuma.forceReconnect();

  // Wait a moment for the connection to establish
  await new Promise((r) => setTimeout(r, 3000));

  const after = kuma.getDiagnostics();

  return NextResponse.json({
    action: "forceReconnect",
    before: {
      connected: before.connected,
      authenticated: before.authenticated,
      lastError: before.lastError,
    },
    after: {
      connected: after.connected,
      authenticated: after.authenticated,
      socketConnected: after.socketConnected,
      lastError: after.lastError,
      lastConnectAt: after.lastConnectAt,
      lastAuthAt: after.lastAuthAt,
    },
  });
}

/**
 * GET /api/kuma/reconnect
 * Returns current Kuma connection diagnostics.
 */
export async function GET() {
  const kuma = getKumaClient();
  return NextResponse.json(kuma.getDiagnostics());
}
