import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const groupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  parent: z.number().nullable().optional(),
});

// ─── GET: list all groups ────────────────────────
export async function GET() {
  try {
    const kuma = getKumaClient();
    const monitors = kuma.getMonitors();
    const groups = monitors
      .filter((m) => m.type === "group")
      .map((g) => ({
        id: g.id,
        name: g.name,
        active: g.active,
        parent: g.parent ?? null,
        childCount: monitors.filter((m) => m.parent === g.id).length,
      }));

    return NextResponse.json({ groups });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: create group ─────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = groupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const kuma = getKumaClient();
    const data: Record<string, unknown> = {
      name: parsed.data.name,
      type: "group",
      notificationIDList: {},
      accepted_statuscodes: ["200-299"],
      conditions: [],
      kafkaProducerBrokers: [],
      kafkaProducerSaslOptions: {},
      rabbitmqNodes: [],
    };
    if (parsed.data.parent != null) data.parent = parsed.data.parent;
    const result = await kuma.addMonitor(data);

    if (result.ok) {
      return NextResponse.json(
        { ok: true, groupId: result.monitorID },
        { status: 201 },
      );
    } else {
      return NextResponse.json({ error: result.msg }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
