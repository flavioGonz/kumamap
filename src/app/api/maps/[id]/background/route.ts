import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads", "network-maps");

// ── File upload validation ────────────────────────────────────────────────────
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const ALLOWED_MIME_PREFIXES = ["image/"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const map = mapsDb.getById(id);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("background") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Only images are allowed.` },
        { status: 400 }
      );
    }

    // Validate extension (sanitize filename to prevent path traversal)
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Invalid extension: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}` },
        { status: 400 }
      );
    }

    const filename = `bg-${Date.now()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = MIME_MAP[ext] || "image/jpeg";

    // Save blob into DB (primary, survives builds/deploys)
    mapsDb.setBackground(id, filename, buffer, mime);

    // Also save to disk as cache (faster serving)
    try {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      // Delete old file from disk (cleanup only, DB blob is the source of truth)
      if (map.background_image) {
        const oldPath = path.join(UPLOADS_DIR, path.basename(map.background_image));
        if (fs.existsSync(oldPath)) try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    } catch (diskErr) {
      // Disk save failed but DB blob is saved — image won't be lost
      console.warn("Background disk cache save failed (DB blob is safe):", diskErr);
    }

    return NextResponse.json({ filename });
  } catch (err) {
    console.error("Background upload error:", err);
    return NextResponse.json(
      { error: "Error al subir imagen de fondo" },
      { status: 500 }
    );
  }
}
