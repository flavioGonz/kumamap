import { NextRequest, NextResponse } from "next/server";
import { mapsDb } from "@/lib/db";

export async function GET() {
  return NextResponse.json(mapsDb.getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const map = mapsDb.create({
    name: body.name,
    background_type: body.background_type,
    kuma_group_id: body.kuma_group_id,
    width: body.width,
    height: body.height,
  });
  return NextResponse.json(map, { status: 201 });
}
