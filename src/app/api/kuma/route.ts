import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET() {
  const kuma = getKumaClient();
  return NextResponse.json({
    connected: kuma.isConnected,
    monitors: kuma.getMonitors(),
  });
}
