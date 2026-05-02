import { NextRequest, NextResponse } from "next/server";
import { getVisitorRegistry } from "@/lib/visitor-registry";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const PHOTOS_DIR = path.join(process.cwd(), "data", "visitors", "photos");

function getLatestPhotoBuffer(mapId: string, cedula: string): { buffer: Buffer; ext: string } | null {
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

    return {
      buffer: fs.readFileSync(filePath),
      ext: path.extname(latest.filename).toLowerCase().replace(".", "") as string,
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/visitors/export-xlsx?mapId=xxx[&from=date][&to=date]
 * Export visitor records as a formatted Excel file with photos.
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

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KumaMap";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Bitácora de Acceso", {
    properties: { defaultRowHeight: 22 },
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // ── Title row ──
  ws.mergeCells("A1:L1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "🛡️ BITÁCORA DE CONTROL DE ACCESO";
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFF8FAFC" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  ws.getRow(1).height = 38;

  // ── Subtitle row ──
  ws.mergeCells("A2:L2");
  const subtitleCell = ws.getCell("A2");
  const dateRange = from && to ? `${from} — ${to}` : from ? `Desde ${from}` : to ? `Hasta ${to}` : "Todos los registros";
  subtitleCell.value = `Período: ${dateRange} • Total: ${visitors.length} registros • Generado: ${new Date().toLocaleString("es-UY")}`;
  subtitleCell.font = { name: "Arial", size: 9, color: { argb: "FF94A3B8" } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  ws.getRow(2).height = 24;

  // ── Headers ──
  const headers = [
    "Foto", "Cédula", "Nombre", "Empresa", "Visita a", "Motivo",
    "Vehículo", "Matrícula", "Entrada", "Salida", "Duración", "Estado", "Guardia", "Observaciones",
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFE2E8F0" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF475569" } },
    };
  });

  // ── Column widths ──
  ws.getColumn(1).width = 10;  // Foto
  ws.getColumn(2).width = 14;  // Cédula
  ws.getColumn(3).width = 22;  // Nombre
  ws.getColumn(4).width = 18;  // Empresa
  ws.getColumn(5).width = 18;  // Visita a
  ws.getColumn(6).width = 18;  // Motivo
  ws.getColumn(7).width = 16;  // Vehículo
  ws.getColumn(8).width = 12;  // Matrícula
  ws.getColumn(9).width = 16;  // Entrada
  ws.getColumn(10).width = 10; // Salida
  ws.getColumn(11).width = 10; // Duración
  ws.getColumn(12).width = 10; // Estado
  ws.getColumn(13).width = 14; // Guardia
  ws.getColumn(14).width = 20; // Observaciones

  // ── Data rows ──
  for (let i = 0; i < visitors.length; i++) {
    const v = visitors[i];
    const isActive = !v.checkOut;
    const fmtDuration = (min?: number) => {
      if (min == null) return "—";
      if (min < 60) return `${min} min`;
      return `${Math.floor(min / 60)}h ${min % 60}m`;
    };

    const entryDate = new Date(v.checkIn);
    const entryStr = `${entryDate.toLocaleDateString("es-UY")} ${entryDate.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}`;
    const exitStr = v.checkOut ? new Date(v.checkOut).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "—";

    const row = ws.addRow([
      "", // Photo placeholder
      v.cedula,
      v.name,
      v.company || "—",
      v.personToVisit,
      v.reason || "—",
      v.vehicleDesc || "—",
      v.vehiclePlate || "—",
      entryStr,
      exitStr,
      fmtDuration(v.durationMinutes),
      isActive ? "EN SITIO" : "SALIÓ",
      v.guardName || "—",
      v.observations || "—",
    ]);

    row.height = 45;

    // Alternating row colors
    const bgColor = i % 2 === 0 ? "FF0F172A" : "FF1A1A2E";
    row.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FFE2E8F0" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF2D2D44" } },
      };
    });

    // Status cell coloring
    const statusCell = row.getCell(12);
    if (isActive) {
      statusCell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF22C55E" } };
    } else {
      statusCell.font = { name: "Arial", size: 9, color: { argb: "FF94A3B8" } };
    }
    statusCell.alignment = { horizontal: "center", vertical: "middle" };

    // Cédula mono font
    row.getCell(2).font = { name: "Courier New", size: 10, color: { argb: "FFF59E0B" } };

    // Matrícula mono font
    row.getCell(8).font = { name: "Courier New", size: 10, bold: true, color: { argb: "FFE2E8F0" } };
    row.getCell(8).alignment = { horizontal: "center", vertical: "middle" };

    // Try to add photo
    try {
      const photo = getLatestPhotoBuffer(mapId, v.cedula);
      if (photo) {
        const imageId = workbook.addImage({
          buffer: photo.buffer as any,
          extension: photo.ext as "jpeg" | "png",
        });
        ws.addImage(imageId, {
          tl: { col: 0.15, row: row.number - 1 + 0.1 },
          ext: { width: 55, height: 40 },
        });
      }
    } catch {}
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bitacora-${mapId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
