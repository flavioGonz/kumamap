import { NextRequest, NextResponse } from "next/server";

// ── Shared types ─────────────────────────────────────────────────────────────

interface PatchPort {
  port: number; label: string; connected: boolean; destination?: string;
  cableLength?: string; cableColor?: string; isPoe?: boolean;
  poeType?: string; connectedDevice?: string; notes?: string;
}

interface SwitchPort {
  port: number; label: string; connected: boolean; speed?: string;
  isPoe?: boolean; poeWatts?: number; connectedDevice?: string;
  macAddress?: string; vlan?: number; uplink?: boolean; notes?: string;
}

interface RouterInterface {
  id: string; name: string; type: string; ipAddress?: string; connected: boolean; notes?: string;
}

interface RackDevice {
  id: string; unit: number; sizeUnits: number; label: string; type: string;
  color?: string; monitorId?: number | null;
  ports?: PatchPort[]; switchPorts?: SwitchPort[]; routerInterfaces?: RouterInterface[];
  portCount?: number; managementIp?: string; model?: string; brand?: string;
  serial?: string; notes?: string;
}

const TYPE_LABELS: Record<string, string> = {
  server: "Servidor", switch: "Switch", patchpanel: "Patch Panel",
  ups: "UPS", router: "Router", pdu: "PDU",
  "tray-fiber": "Bandeja de Fibra", "tray-1u": "Bandeja 1U", "tray-2u": "Bandeja 2U", other: "Otro",
};

const VALID_TYPES = Object.keys(TYPE_LABELS);

// ── Cell styling helpers ─────────────────────────────────────────────────────

function hdr(fill: string, bold = true) {
  return {
    font: { bold, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: fill } },
    alignment: { horizontal: "center", vertical: "center", wrapText: false },
    border: { bottom: { style: "thin", color: { rgb: "333333" } } },
  };
}

function cell(value: any, style?: any) {
  return { v: value, t: typeof value === "number" ? "n" : "s", s: style };
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { rackName, totalUnits, devices } = await request.json();

    let XLSX: any;
    try { XLSX = require("xlsx"); } catch {
      return NextResponse.json({ error: "xlsx package not available" }, { status: 503 });
    }

    const sorted: RackDevice[] = [...devices].sort((a, b) => b.unit - a.unit);
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Instrucciones ────────────────────────────────────────────────
    const instrData = [
      ["PLANTILLA DE RACK — " + rackName.toUpperCase()],
      [],
      ["INSTRUCCIONES:"],
      ["1. Edite la hoja 'Equipos' para modificar datos de dispositivos (no cambiar la columna 'ID')."],
      ["2. Edite 'Puertos del Panel' y 'Puertos del Switch' para actualizar ports."],
      ["3. Para agregar un nuevo equipo: copie una fila existente y cambie el ID por 'NUEVO'."],
      ["4. No elimine ni reordene columnas. No cambie los nombres de las hojas."],
      ["5. Guarde el archivo y use el botón 'Importar' en el Rack Designer."],
      [],
      ["Tipos válidos:", VALID_TYPES.join(", ")],
      ["Velocidades válidas (switch):", "10M, 100M, 1G, 2.5G, 10G, 25G, 40G, 100G"],
      ["Colores de cable válidos:", "blue, red, green, yellow, orange, white, gray, black, purple"],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
    wsInstr["!cols"] = [{ wch: 90 }];
    wsInstr["A1"] = { v: "PLANTILLA DE RACK — " + rackName.toUpperCase(), t: "s", s: hdr("1d4ed8") };
    XLSX.utils.book_append_sheet(wb, wsInstr, "Instrucciones");

    // ── Sheet 2: Equipos ──────────────────────────────────────────────────────
    const eqHeaders = [
      "ID", "U", "Tamaño (U)", "Nombre", "Tipo", "Modelo", "Marca", "IP Gestión", "Serial", "Notas",
    ];
    const eqRows = sorted.map((d) => [
      d.id,
      d.unit,
      d.sizeUnits,
      d.label,
      d.type,
      d.model || "",
      (d as any).brand || "",
      d.managementIp || "",
      d.serial || "",
      d.notes || "",
    ]);
    // Add one blank "NUEVO" row at the bottom for easy addition
    eqRows.push(["NUEVO", totalUnits, 1, "Nuevo Equipo", "server", "", "", "", "", ""]);

    const wsEq = XLSX.utils.aoa_to_sheet([eqHeaders, ...eqRows]);
    wsEq["!cols"] = [
      { wch: 22 }, { wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 20 },
      { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 30 },
    ];
    // Style header row
    eqHeaders.forEach((h, i) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: i });
      wsEq[addr] = cell(h, hdr("1d4ed8"));
    });
    // Freeze header row
    wsEq["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsEq, "Equipos");

    // ── Sheet 3: Puertos del Panel ────────────────────────────────────────────
    const patchHeaders = [
      "ID Equipo", "Equipo", "Puerto #", "Etiqueta", "Conectado (1/0)",
      "Destino", "Dispositivo Conectado", "Largo Cable (m)", "Color Cable", "PoE (1/0)", "Tipo PoE",
    ];
    const patchRows: any[][] = [];
    sorted.filter(d => d.type === "patchpanel").forEach((d) => {
      (d.ports || []).forEach((p) => {
        patchRows.push([
          d.id, d.label, p.port, p.label, p.connected ? 1 : 0,
          p.destination || "", p.connectedDevice || "",
          p.cableLength || "", p.cableColor || "",
          p.isPoe ? 1 : 0, p.poeType || "",
        ]);
      });
    });
    const wsPatch = XLSX.utils.aoa_to_sheet([patchHeaders, ...patchRows]);
    wsPatch["!cols"] = [
      { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
      { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];
    patchHeaders.forEach((h, i) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: i });
      wsPatch[addr] = cell(h, hdr("065f46"));
    });
    wsPatch["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsPatch, "Puertos del Panel");

    // ── Sheet 4: Puertos del Switch ───────────────────────────────────────────
    const swHeaders = [
      "ID Equipo", "Equipo", "Puerto #", "Etiqueta", "Conectado (1/0)",
      "Velocidad", "Dispositivo Conectado", "VLAN", "PoE (1/0)", "PoE Watts", "Uplink (1/0)", "Notas",
    ];
    const swRows: any[][] = [];
    sorted.filter(d => d.type === "switch").forEach((d) => {
      (d.switchPorts || []).forEach((p) => {
        swRows.push([
          d.id, d.label, p.port, p.label, p.connected ? 1 : 0,
          p.speed || "1G", p.connectedDevice || "",
          p.vlan ?? "", p.isPoe ? 1 : 0, p.poeWatts ?? "",
          p.uplink ? 1 : 0, p.notes || "",
        ]);
      });
    });
    const wsSw = XLSX.utils.aoa_to_sheet([swHeaders, ...swRows]);
    wsSw["!cols"] = [
      { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
      { wch: 10 }, { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 },
    ];
    swHeaders.forEach((h, i) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: i });
      wsSw[addr] = cell(h, hdr("7c2d12"));
    });
    wsSw["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsSw, "Puertos del Switch");

    // ── Write and return ──────────────────────────────────────────────────────
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rack-template.xlsx"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
