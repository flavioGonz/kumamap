import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { mapsDb } from "@/lib/db";

const UPLOADS_BASE = path.join(process.cwd(), "data", "uploads");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(UPLOADS_BASE, ...segments);

  // Security: prevent directory traversal
  if (!filePath.startsWith(UPLOADS_BASE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };

  // Try disk first (fast path)
  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Fallback: if this is a network-maps background image, try DB blob
  if (segments[0] === "network-maps" && segments.length === 2) {
    const filename = segments[1];
    // Find the map that references this filename
    const maps = mapsDb.getAll();
    const map = maps.find((m) => m.background_image === filename);
    if (map) {
      const blobData = mapsDb.getBackgroundBlob(map.id);
      if (blobData) {
        // Restore file to disk cache for next time
        try {
          const dir = path.join(UPLOADS_BASE, "network-maps");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, filename), blobData.blob);
        } catch { /* disk restore failed, serve from blob anyway */ }

        return new NextResponse(new Uint8Array(blobData.blob), {
          headers: {
            "Content-Type": blobData.mime || mimeTypes[ext] || "application/octet-stream",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
