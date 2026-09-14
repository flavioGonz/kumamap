import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const PHOTOS_DIR = path.join(process.cwd(), "data", "visitors", "photos");

/**
 * GET /api/visitors/photos/<mapId>/<cedula>/<filename>
 * Serve a visitor photo file.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (!segments || segments.length < 3) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filePath = path.join(PHOTOS_DIR, ...segments);

  // Security: ensure we're not escaping the photos directory
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PHOTOS_DIR))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    return new Response(buffer, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Error reading file" }, { status: 500 });
  }
}
