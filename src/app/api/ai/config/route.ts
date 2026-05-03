import { NextRequest, NextResponse } from "next/server";
import { getAiConfig, saveAiConfig } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/config — Return current AI configuration
 */
export async function GET() {
  const config = getAiConfig();
  return NextResponse.json(config);
}

/**
 * PUT /api/ai/config — Update AI configuration
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = saveAiConfig(body);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

/**
 * POST /api/ai/config/test — Test Ollama connection
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string };
    const testUrl = url || getAiConfig().ollamaUrl;

    const res = await fetch(`${testUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ online: false, error: `HTTP ${res.status}`, models: [] });
    }

    const data = await res.json();
    const models = (data.models || []).map((m: any) => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
    }));

    return NextResponse.json({ online: true, models, url: testUrl });
  } catch (err: any) {
    return NextResponse.json({ online: false, error: err.message, models: [] });
  }
}
