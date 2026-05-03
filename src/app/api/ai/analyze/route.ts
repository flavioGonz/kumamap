import { NextRequest, NextResponse } from "next/server";
import { ollamaChat } from "@/lib/ollama-client";
import { getVisitorRegistry } from "@/lib/visitor-registry";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/analyze
 * Body: { mapId, type: "visitor"|"plate"|"daily_summary", cedula?, plate? }
 * Returns instant AI analysis (non-streaming).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mapId, type, cedula, plate } = body as {
      mapId: string;
      type: "visitor" | "plate" | "daily_summary";
      cedula?: string;
      plate?: string;
    };

    if (!mapId) {
      return NextResponse.json({ error: "mapId required" }, { status: 400 });
    }

    let prompt = "";
    let context = "";

    if (type === "visitor" && cedula) {
      const registry = getVisitorRegistry();
      const history = registry.getVisitorHistory(mapId, cedula);
      const isActive = registry.isCheckedIn(mapId, cedula);

      if (history.length === 0) {
        return NextResponse.json({
          analysis: "🆕 **Primera visita** — No hay registros previos para este documento. Se recomienda verificación completa de identidad.",
          type: "new_visitor",
        });
      }

      context = `Historial del visitante CI ${cedula}:\n`;
      context += `Total de visitas: ${history.length}\n`;
      context += `Estado actual: ${isActive ? "EN SITIO" : "fuera"}\n\n`;

      // Companies used
      const companies = new Set(history.map(h => h.company).filter(Boolean));
      context += `Empresas registradas: ${[...companies].join(", ") || "N/A"}\n`;

      // People visited
      const people = new Set(history.map(h => h.personToVisit));
      context += `Personas visitadas: ${[...people].join(", ")}\n`;

      // Visit durations
      const durations = history.filter(h => h.durationMinutes).map(h => h.durationMinutes!);
      if (durations.length > 0) {
        const avgDur = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
        const maxDur = Math.max(...durations);
        const minDur = Math.min(...durations);
        context += `Duración promedio: ${avgDur} min (min: ${minDur}, max: ${maxDur})\n`;
      }

      // Last 10 visits
      context += `\nÚltimas visitas:\n`;
      for (const v of history.slice(0, 10)) {
        const date = new Date(v.checkIn).toLocaleString("es-UY");
        const dur = v.durationMinutes ? `${v.durationMinutes} min` : "sin salida";
        context += `  - ${date} | ${v.name} | ${v.company || "—"} → ${v.personToVisit} | ${dur}\n`;
      }

      // Check for vehicles
      const plates = new Set(history.map(h => h.vehiclePlate).filter(Boolean));
      if (plates.size > 0) {
        context += `Vehículos asociados: ${[...plates].join(", ")}\n`;
      }

      prompt = `Analiza el perfil de este visitante para el guardia de seguridad. Genera un resumen breve (máximo 4 líneas) que incluya:
1. Patrón de comportamiento (frecuencia, regularidad)
2. Cualquier anomalía o cambio (empresa diferente, persona diferente, horario inusual)
3. Nivel de confianza: ✅ Normal / ⚠️ Revisar / 🚨 Alerta
4. Recomendación para el guardia

Sé directo y conciso.`;

    } else if (type === "plate" && plate) {
      const plateReg = getPlateRegistry();
      const match = plateReg.matchPlate(mapId, plate);
      const logs = plateReg.getAccessLog(mapId, { plate, limit: 30 });

      context = `Matrícula: ${plate}\n`;
      context += `Estado: ${match.result}\n`;
      if (match.record) {
        context += `Propietario: ${match.record.ownerName}\n`;
        context += `Categoría: ${match.record.category}\n`;
        context += `Vehículo: ${match.record.vehicleDesc || "N/A"}\n`;
        if (match.record.notes) context += `Notas: ${match.record.notes}\n`;
      }

      if (logs.length > 0) {
        context += `\nHistorial de detecciones (${logs.length}):\n`;
        for (const log of logs.slice(0, 15)) {
          const time = new Date(log.timestamp).toLocaleString("es-UY");
          context += `  - ${time} | ${log.matchResult} | ${log.nodeLabel || log.nodeId} | ${log.direction || "—"}\n`;
        }

        // Pattern analysis
        const hours = logs.map(l => new Date(l.timestamp).getHours());
        const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
        context += `\nHora promedio de detección: ${avgHour}:00\n`;

        const days = new Set(logs.map(l => new Date(l.timestamp).toISOString().slice(0, 10)));
        context += `Días distintos con actividad: ${days.size}\n`;
      }

      prompt = `Analiza esta matrícula para el guardia de seguridad. Genera un resumen breve (máximo 4 líneas):
1. Estado y perfil del vehículo
2. Patrón de acceso (horarios, frecuencia)
3. Cualquier anomalía
4. Recomendación: ✅ Normal / ⚠️ Revisar / 🚨 Alerta`;

    } else if (type === "daily_summary") {
      const registry = getVisitorRegistry();
      const stats = registry.getStats(mapId);
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayVisitors = registry.getVisitors(mapId, { from: todayStr });
      const activeVisitors = registry.getVisitors(mapId, { activeOnly: true });

      const plateReg = getPlateRegistry();
      const todayLogs = plateReg.getAccessLog(mapId, { from: todayStr });

      context = `Resumen del día ${todayStr}:\n`;
      context += `Visitantes hoy: ${stats.totalToday}\n`;
      context += `En sitio ahora: ${stats.activeNow}\n`;
      context += `Accesos vehiculares: ${todayLogs.length}\n`;

      const unknownPlates = todayLogs.filter(l => l.matchResult === "unknown").length;
      const blockedAttempts = todayLogs.filter(l => l.matchResult === "blocked").length;
      context += `Placas desconocidas: ${unknownPlates}\n`;
      context += `Intentos bloqueados: ${blockedAttempts}\n`;

      if (activeVisitors.length > 0) {
        const now = new Date();
        context += `\nVisitantes activos:\n`;
        for (const v of activeVisitors) {
          const elapsed = Math.round((now.getTime() - new Date(v.checkIn).getTime()) / 60000);
          context += `  - ${v.name} (${v.cedula}): ${elapsed} min en sitio\n`;
        }
      }

      prompt = `Genera un resumen de seguridad del día para el guardia. Incluye:
1. Resumen de actividad (visitantes y vehículos)
2. Situaciones que requieran atención (visitantes demorados, placas sospechosas)
3. Estado general: ✅ Sin novedad / ⚠️ Requiere atención / 🚨 Alerta activa
Máximo 6 líneas.`;

    } else {
      return NextResponse.json({ error: "Invalid analysis type" }, { status: 400 });
    }

    const analysis = await ollamaChat([
      {
        role: "system",
        content: `Eres un analista de inteligencia de seguridad. Respondes en español, de forma concisa y profesional. Usas markdown básico para formato.`,
      },
      {
        role: "user",
        content: `${context}\n\n${prompt}`,
      },
    ]);

    return NextResponse.json({ analysis, type });
  } catch (err: any) {
    console.error("[AI Analyze]", err);
    return NextResponse.json(
      { error: err.message, analysis: "⚠️ AI no disponible — Ollama no responde." },
      { status: 200 } // Return 200 with fallback so UI doesn't break
    );
  }
}
