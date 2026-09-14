import { NextRequest, NextResponse } from "next/server";
import { mikrotikFetch } from "@/lib/mikrotik-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/mikrotik/traffic
 *
 * Returns live interface traffic rates from a MikroTik router using
 * the /interface/monitor-traffic REST command (gives instant bps).
 *
 * Body: { host, user, pass, interfaces: string[], port?: number }
 * Response: { ts, interfaces: { [name]: { rxBps, txBps, rxPps, txPps } } }
 *
 * No caching — this endpoint is meant to be polled every 2 seconds
 * for real-time traffic display.
 */

interface TrafficResult {
  name: string;
  "rx-bits-per-second": string;
  "tx-bits-per-second": string;
  "rx-packets-per-second": string;
  "tx-packets-per-second": string;
  "fp-rx-bits-per-second"?: string;
  "fp-tx-bits-per-second"?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { host, user, pass, interfaces, port } = body as {
      host: string;
      user: string;
      pass: string;
      interfaces: string[];
      port?: number;
    };

    if (!host || !user || !pass || !interfaces?.length) {
      return NextResponse.json(
        { error: "Faltan parámetros: host, user, pass, interfaces" },
        { status: 400 }
      );
    }

    // Call monitor-traffic with "once" for all requested interfaces
    const ifaceList = interfaces.join(",");
    const data = await mikrotikFetch(
      host,
      "/interface/monitor-traffic",
      user,
      pass,
      5000,
      port,
      { interface: ifaceList, once: "" }
    );

    // RouterOS returns an array of objects (one per interface)
    const results: TrafficResult[] = Array.isArray(data) ? data : [data];

    const parsed: Record<string, {
      rxBps: number;
      txBps: number;
      rxPps: number;
      txPps: number;
    }> = {};

    for (const r of results) {
      const name = r.name || ifaceList;
      parsed[name] = {
        rxBps: parseInt(r["rx-bits-per-second"] || "0", 10),
        txBps: parseInt(r["tx-bits-per-second"] || "0", 10),
        rxPps: parseInt(r["rx-packets-per-second"] || "0", 10),
        txPps: parseInt(r["tx-packets-per-second"] || "0", 10),
      };
    }

    return NextResponse.json({ ts: Date.now(), interfaces: parsed });
  } catch (err: any) {
    console.error("[MikroTik/traffic]", err.message);
    return NextResponse.json(
      { error: err.message || "Error al consultar tráfico" },
      { status: 502 }
    );
  }
}
