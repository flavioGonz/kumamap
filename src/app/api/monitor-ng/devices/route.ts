import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  listPendingDevices,
  listAdoptedDevices,
  adoptDevice,
  deAdoptDevice,
  regenReportToken,
  deleteDevice,
  getAdoptedDevice,
} from "@/lib/monitorng";

export const dynamic = "force-dynamic";

/** Admin: list of pending + adopted devices (the adoption section data). */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ pending: listPendingDevices(), adopted: listAdoptedDevices() });
}

/** Admin actions on a device: adopt | deadopt | regen-token | delete | detail. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const deviceId = String(body?.deviceId || "");
    if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    switch (action) {
      case "adopt":
        return NextResponse.json({ ok: true, device: adoptDevice(deviceId, body?.name) });
      case "deadopt":
        return NextResponse.json(deAdoptDevice(deviceId));
      case "regen-token":
        return NextResponse.json(regenReportToken(deviceId));
      case "delete":
        return NextResponse.json(deleteDevice(deviceId));
      case "detail":
        return NextResponse.json({ device: getAdoptedDevice(deviceId) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "bad request" }, { status: err?.status || 400 });
  }
}
