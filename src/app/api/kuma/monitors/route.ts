import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";
import { createMonitorSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  let step = "init";
  try {
    step = "parse-body";
    const body = await req.json();

    step = "validate-schema";
    let parsed;
    try {
      parsed = createMonitorSchema.safeParse(body);
    } catch (zodErr: any) {
      console.error("[monitors/POST] Zod safeParse threw:", zodErr);
      return NextResponse.json(
        { error: `Zod validation error: ${zodErr.message}`, step: "validate-schema" },
        { status: 500 }
      );
    }

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

    step = "clean-data";
    const cleanData: Record<string, unknown> = { ...parsed.data };
    if (cleanData.parent == null) delete cleanData.parent;
    if (cleanData.description === "") delete cleanData.description;
    // Uptime Kuma v2 requires these fields — omitting them causes internal crashes
    if (!cleanData.notificationIDList || typeof cleanData.notificationIDList !== "object") {
      cleanData.notificationIDList = {};
    }
    // Kuma v2 calls .every() on accepted_statuscodes — MUST be present as string array
    if (!Array.isArray(cleanData.accepted_statuscodes)) {
      cleanData.accepted_statuscodes = ["200-299"];
    }
    // Other JSON fields Kuma v2 expects (see server.js lines 718-730)
    if (cleanData.conditions === undefined) cleanData.conditions = [];
    if (cleanData.kafkaProducerBrokers === undefined) cleanData.kafkaProducerBrokers = [];
    if (cleanData.kafkaProducerSaslOptions === undefined) cleanData.kafkaProducerSaslOptions = {};
    if (cleanData.rabbitmqNodes === undefined) cleanData.rabbitmqNodes = [];

    step = "get-kuma";
    const kuma = getKumaClient();

    step = "add-monitor";
    const result = await kuma.addMonitor(cleanData);

    step = "return-result";
    if (result.ok) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json({ error: result.msg || "Error al crear monitor en Uptime Kuma" }, { status: 500 });
    }
  } catch (err: any) {
    console.error(`[monitors/POST] Error at step "${step}":`, err);
    return NextResponse.json(
      { error: `[${step}] ${err.message}`, stack: err.stack?.split("\n").slice(0, 5).join(" | ") },
      { status: 500 }
    );
  }
}
