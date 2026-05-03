import { NextRequest, NextResponse } from "next/server";
import { ollamaVision } from "@/lib/ollama-client";
import { getHikEventStore } from "@/lib/hik-events";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/vision
 * Body: { imageId: string, type: "plate_verify"|"vehicle_describe" }
 *   OR: { imageBase64: string, type: ... }
 *
 * Sends an image to qwen3-vl for visual analysis.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageId, imageBase64, type = "vehicle_describe", cameraPlate } = body as {
      imageId?: string;
      imageBase64?: string;
      type: "plate_verify" | "vehicle_describe" | "full_analysis";
      cameraPlate?: string; // The plate reading from the camera for verification
    };

    // Get image data
    let b64Image: string;

    if (imageBase64) {
      // Strip data: prefix if present
      b64Image = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    } else if (imageId) {
      const store = getHikEventStore();
      const image = store.getImage(imageId);
      if (!image) {
        return NextResponse.json({ error: "Image not found or expired" }, { status: 404 });
      }
      b64Image = Buffer.from(image.data).toString("base64");
    } else {
      return NextResponse.json({ error: "imageId or imageBase64 required" }, { status: 400 });
    }

    let prompt: string;

    if (type === "plate_verify") {
      prompt = `Analiza esta imagen de tráfico/vehículo. Necesito que:
1. Leas la matrícula/placa del vehículo visible en la imagen. Si hay texto visible que parezca una placa, transcribilo exactamente.
2. La cámara leyó: "${cameraPlate || "desconocida"}". ¿Coincide con lo que ves? Responde COINCIDE o NO_COINCIDE.
3. Describí brevemente el vehículo: tipo (auto/camioneta/moto/camión), color, y marca si es reconocible.

Responde en formato JSON sin markdown:
{"plateRead":"PLACA_LEIDA","verification":"COINCIDE|NO_COINCIDE|NO_VISIBLE","vehicleType":"tipo","vehicleColor":"color","vehicleBrand":"marca o desconocida","confidence":"alta|media|baja","notes":"observaciones breves"}`;

    } else if (type === "vehicle_describe") {
      prompt = `Describí el vehículo en esta imagen de forma concisa:
- Tipo: auto, camioneta, SUV, moto, camión, furgón, etc.
- Color principal
- Marca y modelo si es reconocible
- Estado general si es visible (limpio, sucio, dañado)
- Cualquier detalle distintivo

Responde en formato JSON sin markdown:
{"vehicleType":"tipo","vehicleColor":"color","vehicleBrand":"marca","vehicleModel":"modelo o desconocido","condition":"estado","distinctive":"detalles distintivos o ninguno"}`;

    } else {
      // full_analysis
      prompt = `Analiza esta imagen de una cámara de seguridad/tráfico. Describí todo lo relevante:
1. Vehículo: tipo, color, marca, modelo, estado
2. Matrícula: si es visible, transcribila exactamente
3. Ocupantes: cuántas personas son visibles (no identificar, solo contar)
4. Contexto: dirección de movimiento, hora aparente (día/noche), condiciones

Responde en formato JSON sin markdown:
{"plateRead":"PLACA o NO_VISIBLE","vehicleType":"tipo","vehicleColor":"color","vehicleBrand":"marca","vehicleModel":"modelo","occupants":0,"direction":"entrada|salida|desconocida","timeOfDay":"día|noche|atardecer","notes":"observaciones"}`;
    }

    const result = await ollamaVision(prompt, [b64Image]);

    // Try to parse JSON from the response
    let parsed: Record<string, unknown> | null = null;
    try {
      // Extract JSON from response (may have extra text around it)
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If JSON parsing fails, return raw text
    }

    return NextResponse.json({
      analysis: parsed || { raw: result },
      type,
      model: "qwen3-vl:4b",
    });
  } catch (err: any) {
    console.error("[AI Vision]", err);
    return NextResponse.json(
      { error: err.message, analysis: null },
      { status: 200 } // Don't break UI
    );
  }
}
