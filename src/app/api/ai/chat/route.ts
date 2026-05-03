import { NextRequest, NextResponse } from "next/server";
import { ollamaChatStream, ollamaStatus, OllamaChatMessage } from "@/lib/ollama-client";
import { getVisitorRegistry } from "@/lib/visitor-registry";
import { getPlateRegistry } from "@/lib/plate-registry";

export const dynamic = "force-dynamic";

/**
 * Build context data based on the module (bitacora or lpr).
 */
function buildContext(mapId: string, module: string): string {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const parts: string[] = [];

  parts.push(`Fecha y hora actual: ${now.toLocaleString("es-UY")}`);

  if (module === "bitacora" || module === "general") {
    const registry = getVisitorRegistry();
    const stats = registry.getStats(mapId);
    const todayVisitors = registry.getVisitors(mapId, { from: todayStr });
    const activeVisitors = registry.getVisitors(mapId, { activeOnly: true });

    parts.push(`\n── BITÁCORA DE VISITANTES ──`);
    parts.push(`Visitantes hoy: ${stats.totalToday}`);
    parts.push(`En sitio ahora: ${stats.activeNow}`);
    parts.push(`Esta semana: ${stats.totalThisWeek}`);
    parts.push(`Este mes: ${stats.totalThisMonth}`);
    parts.push(`Duración promedio de visita: ${stats.avgDurationMinutes} minutos`);

    if (stats.topVisitors.length > 0) {
      parts.push(`\nVisitantes frecuentes:`);
      for (const v of stats.topVisitors.slice(0, 5)) {
        parts.push(`  - ${v.name} (CI: ${v.cedula}): ${v.visits} visitas`);
      }
    }

    if (stats.topCompanies.length > 0) {
      parts.push(`\nEmpresas frecuentes:`);
      for (const c of stats.topCompanies.slice(0, 5)) {
        parts.push(`  - ${c.company}: ${c.visits} visitas`);
      }
    }

    if (activeVisitors.length > 0) {
      parts.push(`\nVisitantes EN SITIO ahora:`);
      for (const v of activeVisitors.slice(0, 15)) {
        const elapsed = Math.round((now.getTime() - new Date(v.checkIn).getTime()) / 60000);
        parts.push(`  - ${v.name} (CI: ${v.cedula}) de ${v.company || "N/A"} → visita a ${v.personToVisit}, ingresó hace ${elapsed} min`);
      }
    }

    if (todayVisitors.length > 0) {
      parts.push(`\nRegistros de hoy (${todayVisitors.length}):`);
      for (const v of todayVisitors.slice(0, 20)) {
        const entry = new Date(v.checkIn).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
        const exit = v.checkOut ? new Date(v.checkOut).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "EN SITIO";
        parts.push(`  - ${entry} ${v.name} (${v.cedula}) | ${v.company || "—"} → ${v.personToVisit} | Salida: ${exit}`);
      }
    }
  }

  if (module === "lpr" || module === "general") {
    const plateReg = getPlateRegistry();
    const plates = plateReg.getPlates(mapId);
    const logs = plateReg.getAccessLog(mapId, { limit: 50 });
    const todayLogs = plateReg.getAccessLog(mapId, { from: todayStr });

    parts.push(`\n── CONTROL DE MATRÍCULAS (LPR) ──`);
    const authorized = plates.filter(p => p.category === "authorized").length;
    const blocked = plates.filter(p => p.category === "blocked").length;
    const visitors = plates.filter(p => p.category === "visitor").length;
    parts.push(`Matrículas registradas: ${plates.length} (${authorized} autorizadas, ${visitors} visitantes, ${blocked} bloqueadas)`);
    parts.push(`Eventos de acceso hoy: ${todayLogs.length}`);

    // Blocked plates
    const blockedPlates = plates.filter(p => p.category === "blocked");
    if (blockedPlates.length > 0) {
      parts.push(`\nMatrículas BLOQUEADAS:`);
      for (const p of blockedPlates) {
        parts.push(`  - ${p.plate}: ${p.ownerName} ${p.notes ? `(${p.notes})` : ""}`);
      }
    }

    // Recent access events
    if (todayLogs.length > 0) {
      parts.push(`\nÚltimos accesos vehiculares de hoy:`);
      for (const log of todayLogs.slice(0, 25)) {
        const time = new Date(log.timestamp).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
        const result = log.matchResult === "authorized" ? "✅ AUTORIZADO"
          : log.matchResult === "blocked" ? "🚫 BLOQUEADO"
          : log.matchResult === "visitor" ? "🟡 VISITANTE"
          : log.matchResult === "unknown" ? "⚠️ DESCONOCIDO"
          : log.matchResult;
        parts.push(`  - ${time} | ${log.plate} | ${result} | ${log.ownerName || "Desconocido"} | ${log.nodeLabel || log.nodeId}`);
      }
    }

    // Merodeo detection — plates seen multiple times recently
    const plateCounts = new Map<string, number>();
    for (const log of logs) {
      if (log.matchResult === "unknown") {
        plateCounts.set(log.plate, (plateCounts.get(log.plate) || 0) + 1);
      }
    }
    const suspicious = [...plateCounts.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
    if (suspicious.length > 0) {
      parts.push(`\nMatrículas DESCONOCIDAS con actividad repetida (posible merodeo):`);
      for (const [plate, count] of suspicious.slice(0, 10)) {
        parts.push(`  - ${plate}: ${count} detecciones recientes`);
      }
    }
  }

  return parts.join("\n");
}

const SYSTEM_PROMPT = `Eres el Asistente de Inteligencia de Seguridad de KumaMap, un sistema de control de acceso para instalaciones.

Tu rol es ayudar al guardia de seguridad analizando datos de visitantes y vehículos. Respondes en español de forma concisa y profesional.

Capacidades:
- Analizar patrones de acceso de visitantes (frecuencia, horarios, duración)
- Detectar anomalías (visitantes fuera de horario usual, duraciones inusuales, cambios de empresa)
- Analizar tráfico vehicular y matrículas (merodeo, placas bloqueadas, desconocidas)
- Cruzar datos entre visitantes y vehículos
- Generar resúmenes de actividad del día/semana
- Alertar sobre situaciones que requieran atención

Reglas:
- Responde SIEMPRE en español
- Sé conciso: el guardia necesita información rápida y accionable
- Si detectas algo sospechoso, dilo claramente con el motivo
- Usa emojis para indicar niveles: ✅ normal, ⚠️ atención, 🚨 alerta
- No inventes datos que no estén en el contexto proporcionado
- Si no tenés suficiente información, indicalo claramente
- Formatea las respuestas de forma legible (listas cortas, negritas para lo importante)`;

/**
 * POST /api/ai/chat
 * Body: { messages: [{role, content}], mapId, module: "bitacora"|"lpr"|"general" }
 * Returns: SSE stream of AI responses
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, mapId, module = "general" } = body as {
      messages: OllamaChatMessage[];
      mapId: string;
      module: string;
    };

    if (!mapId) {
      return NextResponse.json({ error: "mapId required" }, { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // Build contextual data
    const contextData = buildContext(mapId, module);

    // Construct message chain with system prompt + context
    const fullMessages: OllamaChatMessage[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\n── DATOS EN TIEMPO REAL ──\n${contextData}`,
      },
      ...messages,
    ];

    const stream = ollamaChatStream(fullMessages);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/ai/chat — check Ollama status
 */
export async function GET() {
  const status = await ollamaStatus();
  return NextResponse.json(status);
}
