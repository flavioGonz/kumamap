import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry, VisitorRecord } from "@/lib/visitor-registry";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const PHOTOS_DIR = path.join(process.cwd(), "data", "visitors", "photos");

function getLatestPhotoBase64(mapId: string, cedula: string): string | null {
  const normalizedCedula = cedula.replace(/\D/g, "");
  const dir = path.join(PHOTOS_DIR, mapId, normalizedCedula);
  const metaPath = path.join(dir, "meta.json");

  try {
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const photos = meta.photos || [];
    if (photos.length === 0) return null;

    const latest = photos[photos.length - 1];
    const filePath = path.join(dir, latest.filename);
    if (!fs.existsSync(filePath)) return null;

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(latest.filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(minutes?: number): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function generateVisitorPdfHtml(
  visitors: VisitorRecord[],
  mapId: string,
  dateRange: string
): string {
  const now = new Date().toLocaleString("es-UY");
  const activeCount = visitors.filter((v) => !v.checkOut).length;
  const completedCount = visitors.filter((v) => v.checkOut).length;

  const rows = visitors
    .map((v) => {
      const photo = getLatestPhotoBase64(mapId, v.cedula);
      const isActive = !v.checkOut;
      const statusColor = isActive ? "#22c55e" : "#94a3b8";
      const statusText = isActive ? "EN SITIO" : "SALIÓ";
      const statusBg = isActive ? "#22c55e15" : "#94a3b815";

      return `
      <tr>
        <td style="padding:10px; text-align:center; vertical-align:middle;">
          ${
            photo
              ? `<img src="${photo}" style="width:48px; height:48px; border-radius:8px; object-fit:cover; border:2px solid #1e293b;" />`
              : `<div style="width:48px; height:48px; border-radius:8px; background:#1e293b; display:inline-flex; align-items:center; justify-content:center; color:#64748b; font-size:18px;">👤</div>`
          }
        </td>
        <td style="padding:10px; vertical-align:middle;">
          <div style="font-weight:600; font-size:13px; color:#f1f5f9;">${v.name}</div>
          <div style="font-size:11px; font-family:monospace; color:#94a3b8;">CI: ${v.cedula}</div>
        </td>
        <td style="padding:10px; font-size:12px; color:#cbd5e1; vertical-align:middle;">${v.company || "—"}</td>
        <td style="padding:10px; font-size:12px; color:#cbd5e1; vertical-align:middle;">${v.personToVisit}</td>
        <td style="padding:10px; font-size:12px; color:#cbd5e1; vertical-align:middle;">${v.reason || "—"}</td>
        <td style="padding:10px; font-size:12px; color:#cbd5e1; vertical-align:middle;">
          ${v.vehiclePlate ? `<span style="font-family:monospace; font-weight:600; background:#1e293b; padding:2px 6px; border-radius:4px; font-size:11px;">${v.vehiclePlate}</span>` : "—"}
        </td>
        <td style="padding:10px; vertical-align:middle;">
          <div style="font-size:12px; color:#e2e8f0;">${fmtDate(v.checkIn)}</div>
          <div style="font-size:11px; color:#94a3b8;">${fmtTime(v.checkIn)}</div>
        </td>
        <td style="padding:10px; vertical-align:middle;">
          ${v.checkOut ? `<div style="font-size:12px; color:#e2e8f0;">${fmtTime(v.checkOut)}</div><div style="font-size:11px; color:#94a3b8;">${fmtDuration(v.durationMinutes)}</div>` : "—"}
        </td>
        <td style="padding:10px; text-align:center; vertical-align:middle;">
          <span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; letter-spacing:0.5px; color:${statusColor}; background:${statusBg}; border:1px solid ${statusColor}25;">${statusText}</span>
        </td>
        <td style="padding:10px; font-size:11px; color:#94a3b8; vertical-align:middle;">${v.guardName || "—"}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Bitácora de Acceso — ${dateRange}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a14; color: #e2e8f0; }
    @page { size: landscape; margin: 15mm; }
    @media print {
      body { background: white; color: #1e293b; }
      .header { background: #0f172a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table { border-color: #e2e8f0 !important; }
      td, th { border-color: #e2e8f0 !important; color: #1e293b !important; }
    }
  </style>
</head>
<body>
  <div class="header" style="background:linear-gradient(135deg, #0f172a, #1e293b); padding:30px 40px; margin-bottom:20px;">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <div>
        <h1 style="font-size:22px; font-weight:800; color:#f8fafc; letter-spacing:-0.5px;">🛡️ Bitácora de Control de Acceso</h1>
        <p style="font-size:12px; color:#94a3b8; margin-top:4px;">Registro de visitantes — ${dateRange}</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px; color:#64748b;">Generado: ${now}</div>
        <div style="font-size:11px; color:#64748b; margin-top:2px;">Total: ${visitors.length} registros</div>
      </div>
    </div>
    <div style="display:flex; gap:20px; margin-top:16px;">
      <div style="background:#22c55e10; border:1px solid #22c55e25; border-radius:10px; padding:10px 18px;">
        <div style="font-size:10px; color:#22c55e; text-transform:uppercase; letter-spacing:1px; font-weight:600;">En sitio</div>
        <div style="font-size:24px; font-weight:800; color:#22c55e;">${activeCount}</div>
      </div>
      <div style="background:#3b82f610; border:1px solid #3b82f625; border-radius:10px; padding:10px 18px;">
        <div style="font-size:10px; color:#3b82f6; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Completadas</div>
        <div style="font-size:24px; font-weight:800; color:#3b82f6;">${completedCount}</div>
      </div>
      <div style="background:#f59e0b10; border:1px solid #f59e0b25; border-radius:10px; padding:10px 18px;">
        <div style="font-size:10px; color:#f59e0b; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Total</div>
        <div style="font-size:24px; font-weight:800; color:#f59e0b;">${visitors.length}</div>
      </div>
    </div>
  </div>

  <table style="width:100%; border-collapse:collapse; margin:0 auto;">
    <thead>
      <tr style="background:#1e293b;">
        <th style="padding:10px 12px; text-align:center; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Foto</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Visitante</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Empresa</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Visita a</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Motivo</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Vehículo</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Entrada</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Salida</th>
        <th style="padding:10px 12px; text-align:center; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Estado</th>
        <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; border-bottom:2px solid #334155;">Guardia</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div style="margin-top:30px; padding:20px 40px; text-align:center; border-top:1px solid #1e293b;">
    <p style="font-size:10px; color:#64748b;">KumaMap — Sistema de Control de Acceso • Documento generado automáticamente</p>
  </div>
</body>
</html>`;
}

/**
 * GET /api/visitors/export-pdf?mapId=xxx[&from=date][&to=date]
 * Export visitor records as a styled HTML document (print-to-PDF).
 */
export async function GET(req: NextRequest) {
  const mapId = req.nextUrl.searchParams.get("mapId");
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;

  const registry = getVisitorRegistry();
  const visitors = registry.getVisitors(mapId, { from, to });

  const dateRange = from && to
    ? `${fmtDate(from)} — ${fmtDate(to)}`
    : from
    ? `Desde ${fmtDate(from)}`
    : to
    ? `Hasta ${fmtDate(to)}`
    : "Todos los registros";

  const html = generateVisitorPdfHtml(visitors, mapId, dateRange);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="bitacora-${mapId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.html"`,
    },
  });
}
