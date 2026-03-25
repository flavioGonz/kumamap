import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads", "network-maps");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const map = mapsDb.getById(id);
  if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("background") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // Ensure dir exists
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Delete old
  if (map.background_image) {
    const oldPath = path.join(UPLOADS_DIR, map.background_image);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const ext = path.extname(file.name) || ".jpg";
  const filename = `bg-${Date.now()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  mapsDb.setBackground(id, filename);
  return NextResponse.json({ filename });
}
