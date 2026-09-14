import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";

export const dynamic = "force-dynamic";

/**
 * PUT /api/visitors/[id]/checkout?mapId=xxx
 * Check out a visitor (mark departure time).
 * Body (optional): { observations?: string }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  let observations: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    observations = (body as Record<string, string>).observations;
  } catch {
    // No body is fine
  }

  const registry = getVisitorRegistry();
  const record = registry.checkOut(mapId, id, observations);

  if (!record) {
    return NextResponse.json(
      { error: "Visitor not found or already checked out" },
      { status: 404 }
    );
  }

  return NextResponse.json(record);
}
