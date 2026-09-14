import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

// Only export fields that Kuma's addMonitor (bean.import) can store in the monitor table.
// Fields like tags, status, ping, uptime24 are either runtime or stored in separate tables.
const MONITOR_EXPORT_FIELDS = [
  "id", "name", "type", "url", "hostname", "port", "interval", "active",
  "parent", "description", "keyword", "maxretries",
  // HTTP options
  "method", "body", "headers", "basic_auth_user", "basic_auth_pass",
  "authMethod", "timeout", "maxredirects",
  // TLS
  "tlsCa", "tlsCert", "tlsKey",
  // OAuth
  "oauth_client_id", "oauth_client_secret", "oauth_auth_method",
  "oauth_token_url", "oauth_scopes", "oauth_audience",
  // Various monitor types
  "databaseConnectionString", "databaseQuery",
  "docker_container", "docker_host",
  "mqttTopic", "mqttUsername", "mqttPassword", "mqttSuccessMessage",
  "grpcUrl", "grpcServiceName", "grpcMethod", "grpcBody", "grpcMetadata",
  "radiusUsername", "radiusPassword", "radiusSecret", "radiusCalledStationId", "radiusCallingStationId",
  "pushToken",
  "accepted_statuscodes",
  "dns_resolve_server", "dns_resolve_type",
  "game", "gamedigGivenPortOnly",
  "jsonPath", "expectedValue",
  "kafkaProducerTopic", "kafkaProducerMessage",
  "snmpOid", "snmpVersion", "snmpCommunityString",
  // Misc
  "ipFamily", "invertKeyword", "expiryNotification",
  "ignoreTls", "upsideDown", "retryInterval",
  "resendInterval", "packetSize",
];

// ─── GET: export all monitors & groups as JSON ──────────────
export async function GET() {
  try {
    const kuma = getKumaClient();
    const allMonitors = kuma.getMonitors();

    const groups = allMonitors
      .filter((m) => m.type === "group")
      .map((g) => ({
        id: g.id,
        name: g.name,
        type: "group" as const,
        active: g.active,
        parent: g.parent ?? null,
      }));

    const monitors = allMonitors
      .filter((m) => m.type !== "group")
      .map((m) => {
        const raw = m as unknown as Record<string, unknown>;
        const exported: Record<string, unknown> = {};
        for (const field of MONITOR_EXPORT_FIELDS) {
          const val = raw[field];
          if (val !== undefined && val !== null && val !== "") {
            exported[field] = val;
          }
        }
        // Always include these core fields even if empty
        exported.id = m.id;
        exported.name = m.name;
        exported.type = m.type;
        exported.active = m.active;
        exported.parent = m.parent ?? null;
        // Also export tags separately (for reference/display, not for bean.import)
        if (m.tags && m.tags.length > 0) {
          exported._tags = m.tags; // underscore prefix = metadata, not sent to Kuma
        }
        return exported;
      });

    const exportData = {
      version: "kumamap-export-v1",
      exportedAt: new Date().toISOString(),
      totalGroups: groups.length,
      totalMonitors: monitors.length,
      groups,
      monitors,
    };

    return NextResponse.json(exportData);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
