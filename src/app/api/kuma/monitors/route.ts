import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";
import { createMonitorSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const kuma = getKumaClient();
    
    // Auth check - should already be connected via server.ts
    // but the singleton handles it internally.
    
    const result = await kuma.addMonitor(parsed.data);

    if (result.ok) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json({ error: result.msg }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
