import { NextRequest, NextResponse } from "next/server";

// ── Type definitions (matches RackDesignerDrawer) ─────────────────────────────

interface PatchPort {
  port: number; label: string; connected: boolean; destination?: string;
  cableLength?: string; cableColor?: string; isPoe?: boolean;
  poeType?: string; connectedDevice?: string; macAddress?: string; notes?: string;
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
  id: string; unit: number; sizeUnits: number; label: string;
  type: string; color?: string; monitorId?: number | null;
  ports?: PatchPort[]; switchPorts?: SwitchPort[]; routerInterfaces?: RouterInterface[];
  portCount?: number; managementIp?: string; model?: string;
  serial?: string; cableLength?: number; isPoeCapable?: boolean; notes?: string;
}

// ── Colors ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  server: "Servidor", switch: "Switch", patchpanel: "Patch Panel",
  ups: "UPS / Energía", router: "Router", pdu: "PDU",
  "tray-fiber": "Bandeja de Fibra", "tray-1u": "Bandeja 1U",
  "tray-2u": "Bandeja 2U", other: "Otro",
};

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { rackName, totalUnits, devices } = await request.json();

    // Dynamic import to avoid issues with missing optional dependency
    let XLSX: any;
    try {
      XLSX = require("xlsx");
    } catch (e) {
      // If xlsx is not available, return error
      return NextResponse.json(
        { error: "Excel export not available. Please install the xlsx package." },
        { status: 503 }
      );
    }

    const usedUnits = devices.reduce((s: number, d: RackDevice) => s + d.sizeUnits, 0);
    const freeUnits = totalUnits - usedUnits;
    const sorted = [...devices].sort((a: RackDevice, b: RackDevice) => b.unit - a.unit);

    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
      ["Rack Inventory", rackName],
      [],
      ["Métrica", "Valor"],
      ["Total Unidades", totalUnits],
      ["Ocupadas", usedUnits],
      ["Libres", freeUnits],
      ["Porcentaje Ocupado", `${Math.round((usedUnits / totalUnits) * 100)}%`],
      [],
      ["Fecha Generación", new Date().toLocaleDateString("es-UY")],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");

    // Sheet 2: Equipment Details
    const equipmentHeaders = [
      "Posición U",
      "Nombre",
      "Tipo",
      "Modelo",
      "Serial",
      "IP Gestión",
      "Puertos",
      "Notas",
    ];
    const equipmentData = sorted.map((d: RackDevice) => {
      const meta = TYPE_LABELS[d.type] || "Otro";
      const connPorts = d.type === "patchpanel"
        ? `${(d.ports || []).filter((p: PatchPort) => p.connected).length}/${d.portCount || 24}`
        : d.type === "switch"
        ? `${(d.switchPorts || []).filter((p: SwitchPort) => p.connected).length}/${d.portCount || 24}`
        : "—";
      return [
        `U${d.unit}${d.sizeUnits > 1 ? `-${d.unit + d.sizeUnits - 1}` : ""}`,
        d.label,
        meta,
        d.model || "",
        d.serial || "",
        d.managementIp || "",
        connPorts,
        d.notes || "",
      ];
    });
    const wsEquipment = XLSX.utils.aoa_to_sheet([equipmentHeaders, ...equipmentData]);
    wsEquipment["!cols"] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 15 },
      { wch: 25 },
      { wch: 15 },
      { wch: 18 },
      { wch: 12 },
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsEquipment, "Equipos");

    // Sheet 3: Port Details (if any patch panels or switches)
    const patchDevices = sorted.filter((d: RackDevice) => d.type === "patchpanel" && d.ports);
    const switchDevices = sorted.filter((d: RackDevice) => d.type === "switch" && d.switchPorts);

    if (patchDevices.length > 0) {
      const patchHeaders = [
        "Equipo",
        "Puerto",
        "Etiqueta",
        "Conectado",
        "Destino",
        "Dispositivo",
        "Cable",
        "PoE",
      ];
      const patchData: any[] = [];
      patchDevices.forEach((d: RackDevice) => {
        (d.ports || []).forEach((p: PatchPort) => {
          patchData.push([
            d.label,
            p.port,
            p.label,
            p.connected ? "✓" : "",
            p.destination || "",
            p.connectedDevice || "",
            p.cableLength || "",
            p.isPoe ? (p.poeType || "✓") : "",
          ]);
        });
      });
      const wsPatch = XLSX.utils.aoa_to_sheet([patchHeaders, ...patchData]);
      wsPatch["!cols"] = [
        { wch: 20 },
        { wch: 8 },
        { wch: 15 },
        { wch: 10 },
        { wch: 20 },
        { wch: 20 },
        { wch: 10 },
        { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, wsPatch, "Patch Panel");
    }

    if (switchDevices.length > 0) {
      const switchHeaders = [
        "Equipo",
        "Puerto",
        "Etiqueta",
        "Conectado",
        "Velocidad",
        "Dispositivo",
        "VLAN",
        "PoE",
        "Uplink",
      ];
      const switchData: any[] = [];
      switchDevices.forEach((d: RackDevice) => {
        (d.switchPorts || []).forEach((p: SwitchPort) => {
          switchData.push([
            d.label,
            p.port,
            p.label,
            p.connected ? "✓" : "",
            p.speed || "",
            p.connectedDevice || "",
            p.vlan || "",
            p.isPoe ? `${p.poeWatts || ""}W` : "",
            p.uplink ? "↑" : "",
          ]);
        });
      });
      const wsSwitch = XLSX.utils.aoa_to_sheet([switchHeaders, ...switchData]);
      wsSwitch["!cols"] = [
        { wch: 20 },
        { wch: 8 },
        { wch: 15 },
        { wch: 10 },
        { wch: 12 },
        { wch: 20 },
        { wch: 10 },
        { wch: 10 },
        { wch: 8 },
      ];
      XLSX.utils.book_append_sheet(wb, wsSwitch, "Puertos Switch");
    }

    // Write to buffer
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rack-${rackName.replace(/\s+/g, "_")}-report.xlsx"`,
      },
    });
  } catch (error) {
    console.error("XLSX generation error:", error);
    return NextResponse.json({ error: "Failed to generate Excel file" }, { status: 500 });
  }
}
