import { NextRequest, NextResponse } from "next/server";
import { getKumaClient } from "@/lib/kuma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  const { monitorId } = await params;
  const kuma = getKumaClient();
  const history = kuma.getHistory(parseInt(monitorId));
  return NextResponse.json(history);
}
