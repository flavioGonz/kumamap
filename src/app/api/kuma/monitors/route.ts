import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";
import { createMonitorSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createMonitorSchema.safeParse(body);

    if (!parsed.success) {
      const details = parsed.error.flatten();
      const fieldErrors = Object.entries(details.fieldErrors)
        .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
        .join("; ");
      return NextResponse.json(
        { error: fieldErrors || "Datos inválidos", details },
        { status: 400 }
      );
    }

    const kuma = getKumaClient();

    // Clean data for Uptime Kuma — remove null/empty fields that can cause issues
    const cleanData: Record<string, unknown> = { ...parsed.data };
    if (cleanData.parent == null) delete cleanData.parent;
    if (cleanData.description === "") delete cleanData.description;
    // Only send notificationIDList if there are active notifications
    if (cleanData.notificationIDList) {
      const notifs = cleanData.notificationIDList as Record<string, boolean>;
      const hasActive = Object.values(notifs).some(Boolean);
      if (!hasActive) delete cleanData.notificationIDList;
    }

    const result = await kuma.addMonitor(cleanData);

    if (result.ok) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json({ error: result.msg || "Error al crear monitor en Uptime Kuma" }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
