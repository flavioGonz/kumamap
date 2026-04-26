import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";
import { createMonitorSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// ─── GET: single monitor details ─────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const monitorId = parseInt(id, 10);
  if (isNaN(monitorId)) {
    return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
  }

  const kuma = getKumaClient();
  const monitor = kuma.getMonitor(monitorId);
  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  return NextResponse.json(monitor);
}

// ─── PUT: edit monitor ───────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const monitorId = parseInt(id, 10);
  if (isNaN(monitorId)) {
    return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
  }

  try {
    const body = await req.json();

    // Partial validation — allow updating individual fields
    const editSchema = createMonitorSchema.partial();
    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const kuma = getKumaClient();

    // Uptime Kuma's editMonitor expects the full monitor object with id
    const existing = kuma.getMonitor(monitorId);
    if (!existing) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    // Merge existing data with edits
    const editData: Record<string, unknown> = { ...existing, ...parsed.data, id: monitorId };
    // Uptime Kuma v2 requires these fields
    if (!editData.notificationIDList || typeof editData.notificationIDList !== "object") {
      editData.notificationIDList = {};
    }
    if (!Array.isArray(editData.accepted_statuscodes)) {
      editData.accepted_statuscodes = ["200-299"];
    }
    if (editData.conditions === undefined) editData.conditions = [];
    const result = await kuma.editMonitor(editData);

    if (result.ok) {
      return NextResponse.json({ ok: true, msg: result.msg });
    } else {
      return NextResponse.json({ error: result.msg || "Error editing monitor" }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── DELETE: remove monitor ──────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const monitorId = parseInt(id, 10);
  if (isNaN(monitorId)) {
    return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
  }

  try {
    const kuma = getKumaClient();
    const result = await kuma.deleteMonitor(monitorId);

    if (result.ok) {
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: result.msg || "Error deleting monitor" }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PATCH: pause / resume monitor ───────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const monitorId = parseInt(id, 10);
  if (isNaN(monitorId)) {
    return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { action } = body as { action: "pause" | "resume" };

    if (action !== "pause" && action !== "resume") {
      return NextResponse.json({ error: "Invalid action. Use 'pause' or 'resume'" }, { status: 400 });
    }

    const kuma = getKumaClient();
    const result = action === "pause"
      ? await kuma.pauseMonitor(monitorId)
      : await kuma.resumeMonitor(monitorId);

    if (result.ok) {
      return NextResponse.json({ ok: true, active: action === "resume" });
    } else {
      return NextResponse.json({ error: result.msg || `Error ${action} monitor` }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
