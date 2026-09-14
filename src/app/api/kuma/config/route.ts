import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export async function GET() {
  const kuma = getKumaClient();

  if (!kuma.isConnected) {
    // If not connected, return empty lists but no error yet, common on boot
    return NextResponse.json({
      groups: [],
      notifications: [],
      connected: false
    });
  }

  const monitors = kuma.getMonitors();
  const groups = monitors
    .filter(m => m.type === "group")
    .map(m => ({ id: m.id, name: m.name }));

  const notifications = await kuma.getNotifications();

  return NextResponse.json({
    groups,
    notifications,
    connected: true
  });
}
