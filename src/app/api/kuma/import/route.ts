import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

// Fields safe to send to Kuma's addMonitor (bean.import).
// Excludes: tags (separate table), status/ping/msg (runtime), _tags (metadata)
const SAFE_MONITOR_FIELDS = new Set([
  "name", "type", "url", "hostname", "port", "interval", "active",
  "parent", "description", "keyword", "maxretries",
  "method", "body", "headers", "basic_auth_user", "basic_auth_pass",
  "authMethod", "timeout", "maxredirects",
  "tlsCa", "tlsCert", "tlsKey",
  "oauth_client_id", "oauth_client_secret", "oauth_auth_method",
  "oauth_token_url", "oauth_scopes", "oauth_audience",
  "databaseConnectionString", "databaseQuery",
  "docker_container", "docker_host",
  "mqttTopic", "mqttUsername", "mqttPassword", "mqttSuccessMessage",
  "grpcUrl", "grpcServiceName", "grpcMethod", "grpcBody", "grpcMetadata",
  "radiusUsername", "radiusPassword", "radiusSecret",
  "radiusCalledStationId", "radiusCallingStationId",
  "pushToken",
  "dns_resolve_server", "dns_resolve_type",
  "game", "gamedigGivenPortOnly",
  "jsonPath", "expectedValue",
  "kafkaProducerTopic", "kafkaProducerMessage",
  "snmpOid", "snmpVersion", "snmpCommunityString",
  "ipFamily", "invertKeyword", "expiryNotification",
  "ignoreTls", "upsideDown", "retryInterval",
  "resendInterval", "packetSize",
]);

/** Small delay between addMonitor calls to avoid overwhelming Kuma */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const results = {
      groupsCreated: 0,
      monitorsCreated: 0,
      errors: [] as string[],
    };

    // Map old IDs to new IDs for parent references
    const idMap = new Map<number, number>();

    // 1. Create groups first (root groups before child groups)
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
        await delay(200); // Give Kuma time between creates
      } catch (err: any) {
        results.errors.push(`Grupo "${g.name}": ${err.message}`);
      }
    }

    // 2. Create monitors — only send safe fields
    for (const m of monitors) {
      try {
        const data: Record<string, unknown> = {};

        // Copy only safe fields from the exported monitor
        for (const [key, val] of Object.entries(m)) {
          if (SAFE_MONITOR_FIELDS.has(key) && val !== undefined && val !== null) {
            data[key] = val;
          }
        }

        // Ensure type is explicitly set (critical!)
        data.type = m.type || "http";
        data.name = m.name;

        // Map parent to new group ID
        if (m.parent != null && idMap.has(m.parent)) {
          data.parent = idMap.get(m.parent);
        } else {
          // Don't send parent if we can't map it
          delete data.parent;
        }

        // Ensure required Kuma v2 fields
        data.notificationIDList = {};
        data.accepted_statuscodes = ["200-299"];
        if (data.conditions === undefined) data.conditions = [];
        if (data.kafkaProducerBrokers === undefined) data.kafkaProducerBrokers = [];
        if (data.kafkaProducerSaslOptions === undefined) data.kafkaProducerSaslOptions = {};
        if (data.rabbitmqNodes === undefined) data.rabbitmqNodes = [];

        const result = await kuma.addMonitor(data);
        if (result.ok && result.monitorID) {
          idMap.set(m.id, result.monitorID);
          results.monitorsCreated++;
        } else {
          results.errors.push(`Monitor "${m.name}" (${m.type}): ${result.msg || "error desconocido"}`);
        }
        await delay(200); // Give Kuma time between creates
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
