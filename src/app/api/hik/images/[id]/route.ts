import { NextRequest, NextResponse } from "next/server";
import { getHikEventStore } from "@/lib/hik-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/hik/images/[id]
 *
 * Serves captured images (plates, faces) from the in-memory buffer.
 * Images are stored temporarily (30 min TTL, max 500 images).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const store = getHikEventStore();
  const image = store.getImage(id);

  if (!image) {
    return NextResponse.json({ error: "Image not found or expired" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.data) as any, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": image.data.length.toString(),
      "Cache-Control": "public, max-age=1800", // 30 min cache
    },
  });
}
