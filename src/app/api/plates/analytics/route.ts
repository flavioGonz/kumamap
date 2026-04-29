/**
 * Merodeo Repetitivo (Repeated Loitering) Analytics API
 *
 * Analyzes the access log to find unregistered plates/identifiers that appear
 * repeatedly — potential security threats not in the registry.
 *
 * GET /api/plates/analytics?mapId=...&minCount=3&days=30&type=lpr
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getPlateRegistry } from "@/lib/plate-registry";

interface Sighting {
  timestamp: string;
  nodeId: string;
  nodeLabel?: string;
  direction?: string;
  vehicleColor?: string;
  vehicleBrand?: string;
  plateImageId?: string;
  fullImageId?: string;
}

interface LoiteringEntry {
  plate: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  cameras: string[];
  avgInterval: number;
  riskScore: number;
  sightings: Sighting[];
  timePattern: "day" | "night" | "mixed";
}

function computeTimePattern(timestamps: Date[]): "day" | "night" | "mixed" {
  let nightCount = 0;
  for (const ts of timestamps) {
    const h = ts.getHours();
    if (h >= 20 || h < 6) nightCount++;
  }
  const nightRatio = nightCount / timestamps.length;
  if (nightRatio >= 0.7) return "night";
  if (nightRatio <= 0.3) return "day";
  return "mixed";
}

function computeRiskScore(
  count: number,
  daysSinceLastSeen: number,
  hasNightActivity: boolean,
  multiCamera: boolean
): number {
  // Frequency component: up to 40 points
  const frequencyScore = Math.min(count * 10, 40);

  // Recency component: up to 30 points (more recent = higher score)
  const recencyScore = Math.min(Math.max((30 - daysSinceLastSeen) * 2, 0), 30);

  // Night activity: 15 points
  const nightScore = hasNightActivity ? 15 : 0;

  // Multi-camera presence: 15 points
  const cameraScore = multiCamera ? 15 : 0;

  return Math.min(frequencyScore + recencyScore + nightScore + cameraScore, 100);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const mapId = searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json(
      { error: "mapId query parameter is required" },
      { status: 400 }
    );
  }

  const minCount = parseInt(searchParams.get("minCount") ?? "3", 10);
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const type = searchParams.get("type") ?? "lpr";

  // Validate params
  if (isNaN(minCount) || minCount < 1) {
    return NextResponse.json(
      { error: "minCount must be a positive integer" },
      { status: 400 }
    );
  }
  if (isNaN(days) || days < 1) {
    return NextResponse.json(
      { error: "days must be a positive integer" },
      { status: 400 }
    );
  }

  try {
    const registry = getPlateRegistry();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all access log entries for this map (use a high limit to get everything)
    const allEntries = registry.getAccessLog(mapId, {
      from: cutoffDate.toISOString(),
      matchResult: "unknown",
      limit: 50000,
    });

    // Filter out unreadable plates
    const entries = allEntries.filter(
      (e) => e.plate && e.plate !== "NO_LEIDA" && e.plate.trim() !== ""
    );

    // Group by plate
    const plateMap = new Map<
      string,
      {
        timestamps: Date[];
        sightings: Sighting[];
        cameras: Set<string>;
      }
    >();

    for (const entry of entries) {
      const plate = entry.plate;
      if (!plateMap.has(plate)) {
        plateMap.set(plate, {
          timestamps: [],
          sightings: [],
          cameras: new Set(),
        });
      }

      const group = plateMap.get(plate)!;
      const ts = new Date(entry.timestamp);
      group.timestamps.push(ts);
      group.cameras.add(entry.nodeLabel || entry.nodeId);

      group.sightings.push({
        timestamp: entry.timestamp,
        nodeId: entry.nodeId,
        nodeLabel: entry.nodeLabel,
        direction: entry.direction,
        vehicleColor: entry.vehicleColor,
        vehicleBrand: entry.vehicleBrand,
        plateImageId: entry.plateImageId,
        fullImageId: entry.fullImageId,
      });
    }

    // Build loitering entries for plates that meet the minCount threshold
    const results: LoiteringEntry[] = [];

    for (const [plate, group] of plateMap) {
      if (group.timestamps.length < minCount) continue;

      // Sort timestamps ascending for interval calculations
      const sortedTimestamps = [...group.timestamps].sort(
        (a, b) => a.getTime() - b.getTime()
      );

      const firstSeen = sortedTimestamps[0];
      const lastSeen = sortedTimestamps[sortedTimestamps.length - 1];

      // Calculate average interval in hours between consecutive sightings
      let avgInterval = 0;
      if (sortedTimestamps.length > 1) {
        let totalIntervalMs = 0;
        for (let i = 1; i < sortedTimestamps.length; i++) {
          totalIntervalMs +=
            sortedTimestamps[i].getTime() - sortedTimestamps[i - 1].getTime();
        }
        avgInterval = Math.round(
          totalIntervalMs / (sortedTimestamps.length - 1) / (1000 * 60 * 60) * 10
        ) / 10;
      }

      // Night activity check
      const hasNightActivity = group.timestamps.some((ts) => {
        const h = ts.getHours();
        return h >= 20 || h < 6;
      });

      const cameras = Array.from(group.cameras);
      const multiCamera = cameras.length > 1;

      const daysSinceLastSeen =
        (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);

      const riskScore = computeRiskScore(
        group.timestamps.length,
        daysSinceLastSeen,
        hasNightActivity,
        multiCamera
      );

      const timePattern = computeTimePattern(group.timestamps);

      // Get last 10 sightings (sorted newest first)
      const sortedSightings = [...group.sightings].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const recentSightings = sortedSightings.slice(0, 10);

      results.push({
        plate,
        count: group.timestamps.length,
        firstSeen: firstSeen.toISOString(),
        lastSeen: lastSeen.toISOString(),
        cameras,
        avgInterval,
        riskScore,
        sightings: recentSightings,
        timePattern,
      });
    }

    // Sort by count descending
    results.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      mapId,
      type,
      days,
      minCount,
      analyzedFrom: cutoffDate.toISOString(),
      analyzedUntil: now.toISOString(),
      totalUnknownAccesses: entries.length,
      loiteringCount: results.length,
      loitering: results,
    });
  } catch (err) {
    console.error("[Analytics] Error computing loitering analysis:", err);
    return NextResponse.json(
      { error: "Internal server error computing analytics" },
      { status: 500 }
    );
  }
}
