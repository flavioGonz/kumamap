import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

// ─── POST: import monitors & groups from exported JSON ──────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.version !== "kumamap-export-v1") {
      return NextResponse.json(
        { error: "Formato de archivo inválido. Se espera kumamap-export-v1." },
        { status: 400 },
      );
    }

    const groups: any[] = Array.isArray(body.groups) ? body.groups : [];
    const monitors: any[] = Array.isArray(body.monitors) ? body.monitors : [];

    if (groups.length === 0 && monitors.length === 0) {
      return NextResponse.json(
        { error: "El archivo no contiene monitores ni grupos para importar." },
        { status: 400 },
      );
    }

    const kuma = getKumaClient();
    const results = { groupsCreated: 0, monitorsCreated: 0, errors: [] as string[] };

    // Map old IDs to new IDs for parent references
    const idMap = new Map<number, number>();

    // 1. Create groups first (sorted by parent — root groups first)
    const sortedGroups = [...groups].sort((a, b) => {
      if (a.parent == null && b.parent != null) return -1;
      if (a.parent != null && b.parent == null) return 1;
      return 0;
    });

    for (const g of sortedGroups) {
      try {
        const data: Record<string, unknown> = {
          name: g.name,
          type: "group",
          notificationIDList: {},
          accepted_statuscodes: ["200-299"],
          conditions: [],
          kafkaProducerBrokers: [],
          kafkaProducerSaslOptions: {},
          rabbitmqNodes: [],
        };
        // Map parent to new ID if it was already created
        if (g.parent != null && idMap.has(g.parent)) {
          data.parent = idMap.get(g.parent);
        }
        const result = await kuma.addMonitor(data);
        if (result.ok && result.monitorID) {
          idMap.set(g.id, result.monitorID);
          results.groupsCreated++;
        } else {
          results.errors.push(`Grupo "${g.name}": ${result.msg || "error desconocido"}`);
        }
      } catch (err: any) {
        results.errors.push(`Grupo "${g.name}": ${err.message}`);
      }
    }

    // 2. Create monitors
    for (const m of monitors) {
      try {
        const data: Record<string, unknown> = { ...m };
        // Remove old ID
        delete data.id;
        // Remove runtime fields
        delete data.status;
        delete data.ping;
        delete data.msg;
        delete data.uptime24;
        // Map parent to new group ID
        if (m.parent != null && idMap.has(m.parent)) {
          data.parent = idMap.get(m.parent);
        } else if (m.parent != null) {
          // Parent group wasn't imported (maybe it already existed) — skip parent
          delete data.parent;
        }
        // Ensure required Kuma v2 fields
        if (!data.notificationIDList || typeof data.notificationIDList !== "object") {
          data.notificationIDList = {};
        }
        if (!Array.isArray(data.accepted_statuscodes)) {
          data.accepted_statuscodes = ["200-299"];
        }
        if (data.conditions === undefined) data.conditions = [];
        if (data.kafkaProducerBrokers === undefined) data.kafkaProducerBrokers = [];
        if (data.kafkaProducerSaslOptions === undefined) data.kafkaProducerSaslOptions = {};
        if (data.rabbitmqNodes === undefined) data.rabbitmqNodes = [];

        const result = await kuma.addMonitor(data);
        if (result.ok && result.monitorID) {
          idMap.set(m.id, result.monitorID);
          results.monitorsCreated++;
        } else {
          results.errors.push(`Monitor "${m.name}": ${result.msg || "error desconocido"}`);
        }
      } catch (err: any) {
        results.errors.push(`Monitor "${m.name}": ${err.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      ...results,
      totalProcessed: groups.length + monitors.length,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
