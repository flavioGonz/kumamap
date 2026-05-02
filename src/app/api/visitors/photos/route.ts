import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const PHOTOS_DIR = path.join(process.cwd(), "data", "visitors", "photos");

/**
 * POST /api/visitors/photos
 * Upload a webcam capture photo for a visitor document.
 * Body: { mapId, cedula, imageData (base64 data URL) }
 * Returns: { id, url }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mapId, cedula, imageData } = body;

    if (!mapId || !cedula || !imageData) {
      return NextResponse.json({ error: "mapId, cedula, and imageData required" }, { status: 400 });
    }

    // Create directory structure: photos/<mapId>/<normalizedCedula>/
    const normalizedCedula = cedula.replace(/\D/g, "");
    const dir = path.join(PHOTOS_DIR, mapId, normalizedCedula);
    fs.mkdirSync(dir, { recursive: true });

    // Parse base64 data URL
    const matches = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: "Invalid image data URL" }, { status: 400 });
    }

    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const filename = `${id}.${ext}`;

    fs.writeFileSync(path.join(dir, filename), buffer);

    // Write metadata
    const metaPath = path.join(dir, "meta.json");
    let meta: { photos: { id: string; filename: string; timestamp: string }[] } = { photos: [] };
    try {
      if (fs.existsSync(metaPath)) {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      }
    } catch {}

    meta.photos.push({
      id,
      filename,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 10 photos per document
    if (meta.photos.length > 10) {
      const removed = meta.photos.splice(0, meta.photos.length - 10);
      for (const r of removed) {
        try { fs.unlinkSync(path.join(dir, r.filename)); } catch {}
      }
    }

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    return NextResponse.json({
      id,
      url: `/api/visitors/photos/${mapId}/${normalizedCedula}/${filename}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/visitors/photos?mapId=xxx&cedula=12345678
 * Get photo list for a specific document.
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  const cedula = req.nextUrl.searchParams.get("cedula");

  if (!mapId || !cedula) {
    return NextResponse.json({ error: "mapId and cedula required" }, { status: 400 });
  }

  const normalizedCedula = cedula.replace(/\D/g, "");
  const dir = path.join(PHOTOS_DIR, mapId, normalizedCedula);
  const metaPath = path.join(dir, "meta.json");

  try {
    if (!fs.existsSync(metaPath)) {
      return NextResponse.json({ cedula: normalizedCedula, photos: [] });
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const photos = (meta.photos || []).map((p: any) => ({
      id: p.id,
      url: `/api/visitors/photos/${mapId}/${normalizedCedula}/${p.filename}`,
      timestamp: p.timestamp,
    }));

    // Return newest first
    photos.reverse();

    return NextResponse.json({ cedula: normalizedCedula, photos });
  } catch {
    return NextResponse.json({ cedula: normalizedCedula, photos: [] });
  }
}
