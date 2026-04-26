import { NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

// Fields to exclude from export (runtime-only)
const RUNTIME_FIELDS = new Set(["status", "ping", "msg", "uptime24", "downTime"]);

// ─── GET: export all monitors & groups as JSON ─────────────��
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
        // Cast to any to access all dynamic Kuma fields
        const raw = m as unknown as Record<string, unknown>;
        const exported: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(raw)) {
          if (!RUNTIME_FIELDS.has(key) && val !== undefined && val !== null) {
            exported[key] = val;
          }
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
