import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

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

interface PbxExtension {
  extension: string; name: string; ipPhone?: string; macAddress?: string;
  username?: string; password?: string; model?: string; location?: string; notes?: string;
  webUser?: string; webPassword?: string;
}

interface PbxTrunkLine {
  id: string; provider: string; number: string; type: string;
  channels?: number; sipServer?: string; sipUser?: string; sipPassword?: string;
  codec?: string; status?: string; notes?: string;
}

interface RackDevice {
  id: string; unit: number; sizeUnits: number; label: string;
  type: string; color?: string; monitorId?: number | null;
  ports?: PatchPort[]; switchPorts?: SwitchPort[]; routerInterfaces?: RouterInterface[];
  pbxExtensions?: PbxExtension[];
  pbxTrunkLines?: PbxTrunkLine[];
  portCount?: number; managementIp?: string; model?: string;
  serial?: string; cableLength?: number; isPoeCapable?: boolean; notes?: string;
}

// ── Brand palette ─────────────────────────────────────────────────────────────

const BRAND_DARK  = "1E3A5F"; // navy header background
const BRAND_MID   = "2D6A9F"; // accent / sub-header
const ROW_ALT     = "EBF3FB"; // alternating row tint
const ROW_WHITE   = "FFFFFF";
const GREEN_FILL  = "D6F4DC"; // connected port
const GRAY_FILL   = "F0F0F0"; // free port
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const BORDER_THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD0D0D0" } };
const ALL_BORDERS = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

const TYPE_LABELS: Record<string, string> = {
  server: "Servidor", switch: "Switch", patchpanel: "Patch Panel",
  ups: "UPS / Energía", router: "Router", pdu: "PDU", pbx: "PBX / Telefonía",
  "tray-fiber": "Bandeja de Fibra", "tray-1u": "Bandeja 1U",
  "tray-2u": "Bandeja 2U", other: "Otro",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND_DARK}` } };
    cell.border = ALL_BORDERS;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
  });
}

function styleDataRow(row: ExcelJS.Row, even: boolean) {
  row.height = 18;
  const bg = even ? ROW_ALT : ROW_WHITE;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bg}` } };
    cell.border = ALL_BORDERS;
    cell.alignment = { vertical: "middle", wrapText: false };
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { rackName, totalUnits, devices } = await request.json();

    const usedUnits = (devices as RackDevice[]).reduce((s, d) => s + d.sizeUnits, 0);
    const freeUnits = totalUnits - usedUnits;
    const occupancy  = totalUnits > 0 ? Math.round((usedUnits / totalUnits) * 100) : 0;
    const sorted     = [...(devices as RackDevice[])].sort((a, b) => b.unit - a.unit);
    const dateStr    = new Date().toLocaleDateString("es-UY", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    const wb = new ExcelJS.Workbook();
    wb.creator  = "KumaMap";
    wb.created  = new Date();
    wb.modified = new Date();

    // ────────────────────────────────────────────────────────────────────────
    // SHEET 1 — Resumen
    // ────────────────────────────────────────────────────────────────────────
    const wsSummary = wb.addWorksheet("Resumen");
    wsSummary.columns = [
      { key: "metric", width: 28 },
      { key: "value",  width: 32 },
    ];

    // Title row
    const titleRow = wsSummary.addRow(["Inventario de Rack", rackName]);
    titleRow.height = 28;
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: `FF${BRAND_DARK}` } };
    titleRow.getCell(2).font = { bold: true, size: 14 };

    wsSummary.addRow([]);

    // Sub-header
    const sh = wsSummary.addRow(["Métrica", "Valor"]);
    styleHeaderRow(sh);

    const metrics: [string, string | number][] = [
      ["Total Unidades",     totalUnits],
      ["Unidades Ocupadas",  usedUnits],
      ["Unidades Libres",    freeUnits],
      ["Porcentaje Ocupado", `${occupancy}%`],
      ["Total Equipos",      devices.length],
      ["Fecha Generación",   dateStr],
    ];

    metrics.forEach(([label, val], i) => {
      const row = wsSummary.addRow([label, val]);
      styleDataRow(row, i % 2 === 0);
      row.getCell(1).font = { bold: true, size: 10 };
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    });

    // Occupancy bar (visual progress using fill)
    wsSummary.addRow([]);
    const barLabel = wsSummary.addRow([`Ocupación: ${occupancy}%`]);
    barLabel.getCell(1).font = { bold: true, color: { argb: `FF${BRAND_MID}` } };

    // ────────────────────────────────────────────────────────────────────────
    // SHEET 2 — Equipos
    // ────────────────────────────────────────────────────────────────────────
    const wsEq = wb.addWorksheet("Equipos");
    wsEq.columns = [
      { key: "pos",     header: "Posición U",  width: 13 },
      { key: "name",    header: "Nombre",       width: 24 },
      { key: "type",    header: "Tipo",         width: 18 },
      { key: "model",   header: "Modelo",       width: 26 },
      { key: "serial",  header: "Serial",       width: 18 },
      { key: "ip",      header: "IP Gestión",   width: 18 },
      { key: "ports",   header: "Puertos",      width: 14 },
      { key: "notes",   header: "Notas",        width: 34 },
    ];

    const eqHeader = wsEq.getRow(1);
    styleHeaderRow(eqHeader);
    wsEq.autoFilter = { from: "A1", to: "H1" };

    sorted.forEach((d, i) => {
      const connPorts =
        d.type === "patchpanel"
          ? `${(d.ports || []).filter(p => p.connected).length}/${d.portCount || 24}`
          : d.type === "switch"
          ? `${(d.switchPorts || []).filter(p => p.connected).length}/${d.portCount || 24}`
          : "—";

      const row = wsEq.addRow({
        pos:    `U${d.unit}${d.sizeUnits > 1 ? `–${d.unit + d.sizeUnits - 1}` : ""}`,
        name:   d.label,
        type:   TYPE_LABELS[d.type] || "Otro",
        model:  d.model   || "",
        serial: d.serial  || "",
        ip:     d.managementIp || "",
        ports:  connPorts,
        notes:  d.notes   || "",
      });
      styleDataRow(row, i % 2 === 0);
      row.getCell("ports").alignment = { horizontal: "center", vertical: "middle" };
    });

    // ────────────────────────────────────────────────────────────────────────
    // SHEET 3 — Patch Panel
    // ────────────────────────────────────────────────────────────────────────
    const patchDevices = sorted.filter(d => d.type === "patchpanel" && d.ports);
    if (patchDevices.length > 0) {
      const wsPatch = wb.addWorksheet("Patch Panel");
      wsPatch.columns = [
        { key: "device",  header: "Equipo",       width: 22 },
        { key: "port",    header: "Puerto",        width: 9  },
        { key: "label",   header: "Etiqueta",      width: 18 },
        { key: "conn",    header: "Conectado",     width: 11 },
        { key: "dest",    header: "Destino",       width: 22 },
        { key: "cdv",     header: "Dispositivo",   width: 22 },
        { key: "cable",   header: "Cable",         width: 10 },
        { key: "poe",     header: "PoE",           width: 10 },
        { key: "notes",   header: "Notas",         width: 28 },
      ];

      styleHeaderRow(wsPatch.getRow(1));
      wsPatch.autoFilter = { from: "A1", to: "I1" };

      let rowIdx = 0;
      patchDevices.forEach(d => {
        (d.ports || []).forEach(p => {
          const row = wsPatch.addRow({
            device: d.label,
            port:   p.port,
            label:  p.label,
            conn:   p.connected ? "✓" : "",
            dest:   p.destination   || "",
            cdv:    p.connectedDevice || "",
            cable:  p.cableLength   || "",
            poe:    p.isPoe ? (p.poeType || "✓") : "",
            notes:  p.notes || "",
          });

          // Color by connection status
          const bg = p.connected ? GREEN_FILL : GRAY_FILL;
          row.height = 17;
          row.eachCell({ includeEmpty: true }, cell => {
            cell.fill    = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bg}` } };
            cell.border  = ALL_BORDERS;
            cell.alignment = { vertical: "middle" };
          });
          row.getCell("conn").alignment  = { horizontal: "center", vertical: "middle" };
          row.getCell("port").alignment  = { horizontal: "center", vertical: "middle" };
          rowIdx++;
        });
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // SHEET 4 — Puertos Switch
    // ────────────────────────────────────────────────────────────────────────
    const switchDevices = sorted.filter(d => d.type === "switch" && d.switchPorts);
    if (switchDevices.length > 0) {
      const wsSwitch = wb.addWorksheet("Puertos Switch");
      wsSwitch.columns = [
        { key: "device",  header: "Equipo",       width: 22 },
        { key: "port",    header: "Puerto",        width: 9  },
        { key: "label",   header: "Etiqueta",      width: 18 },
        { key: "conn",    header: "Conectado",     width: 11 },
        { key: "speed",   header: "Velocidad",     width: 13 },
        { key: "cdv",     header: "Dispositivo",   width: 22 },
        { key: "vlan",    header: "VLAN",          width: 10 },
        { key: "poe",     header: "PoE",           width: 10 },
        { key: "uplink",  header: "Uplink",        width: 9  },
        { key: "notes",   header: "Notas",         width: 28 },
      ];

      styleHeaderRow(wsSwitch.getRow(1));
      wsSwitch.autoFilter = { from: "A1", to: "J1" };

      switchDevices.forEach(d => {
        (d.switchPorts || []).forEach((p, i) => {
          const row = wsSwitch.addRow({
            device: d.label,
            port:   p.port,
            label:  p.label,
            conn:   p.connected ? "✓" : "",
            speed:  p.speed || "",
            cdv:    p.connectedDevice || "",
            vlan:   p.vlan || "",
            poe:    p.isPoe ? `${p.poeWatts || ""}W` : "",
            uplink: p.uplink ? "↑" : "",
            notes:  p.notes || "",
          });

          const bg = p.connected ? GREEN_FILL : (i % 2 === 0 ? ROW_ALT : ROW_WHITE);
          row.height = 17;
          row.eachCell({ includeEmpty: true }, cell => {
            cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bg}` } };
            cell.border = ALL_BORDERS;
            cell.alignment = { vertical: "middle" };
          });
          row.getCell("conn").alignment   = { horizontal: "center", vertical: "middle" };
          row.getCell("port").alignment   = { horizontal: "center", vertical: "middle" };
          row.getCell("uplink").alignment = { horizontal: "center", vertical: "middle" };
        });
      });
    }

    // ── PBX Extensions sheet ────────────────────────────────────────────────
    const pbxDevices = sorted.filter((d: RackDevice) => d.type === "pbx" && d.pbxExtensions && d.pbxExtensions.length > 0);
    if (pbxDevices.length > 0) {
      const wsPbx = wb.addWorksheet("Extensiones PBX");
      wsPbx.columns = [
        { header: "Equipo",     key: "device",    width: 22 },
        { header: "Extensión",  key: "extension", width: 12 },
        { header: "Nombre",     key: "name",      width: 22 },
        { header: "IP Teléfono", key: "ipPhone",  width: 16 },
        { header: "MAC Address", key: "mac",      width: 20 },
        { header: "Modelo",     key: "model",     width: 18 },
        { header: "Ubicación",  key: "location",  width: 18 },
        { header: "Usuario SIP", key: "username", width: 14 },
        { header: "Contraseña SIP", key: "password", width: 14 },
        { header: "User Web",   key: "webUser",   width: 14 },
        { header: "Pass Web",   key: "webPassword", width: 14 },
        { header: "Notas",      key: "notes",     width: 28 },
      ];
      // Style header
      const pbxHeaderRow = wsPbx.getRow(1);
      pbxHeaderRow.height = 26;
      pbxHeaderRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0891B2" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: "FF06B6D4" } } };
      });
      wsPbx.autoFilter = { from: "A1", to: "L1" };

      pbxDevices.forEach((dev: RackDevice) => {
        (dev.pbxExtensions || []).forEach((ext: PbxExtension) => {
          const row = wsPbx.addRow({
            device: dev.label,
            extension: ext.extension,
            name: ext.name,
            ipPhone: ext.ipPhone || "",
            mac: ext.macAddress || "",
            model: ext.model || "",
            location: ext.location || "",
            username: ext.username || "",
            password: ext.password || "",
            webUser: ext.webUser || "",
            webPassword: ext.webPassword || "",
            notes: ext.notes || "",
          });
          row.getCell("extension").font = { bold: true, family: 3 };
          row.getCell("extension").alignment = { horizontal: "center", vertical: "middle" };
          row.getCell("ipPhone").font = { family: 3 };
          row.getCell("mac").font = { family: 3, size: 9 };
          row.getCell("username").font = { family: 3 };
          row.getCell("password").font = { family: 3 };
        });
      });
    }

    // ── PBX Trunk Lines sheet ──────────────────────────────────────────────
    const trunkDevices = sorted.filter((d: RackDevice) => d.type === "pbx" && d.pbxTrunkLines && d.pbxTrunkLines.length > 0);
    if (trunkDevices.length > 0) {
      const wsTrunk = wb.addWorksheet("Líneas PBX");
      wsTrunk.columns = [
        { header: "Equipo",       key: "device",    width: 22 },
        { header: "Proveedor",    key: "provider",  width: 22 },
        { header: "Número / DID", key: "number",    width: 18 },
        { header: "Tipo",         key: "type",      width: 10 },
        { header: "Canales",      key: "channels",  width: 10 },
        { header: "Servidor SIP", key: "sipServer", width: 22 },
        { header: "Usuario SIP",  key: "sipUser",   width: 16 },
        { header: "Contraseña",   key: "sipPassword", width: 14 },
        { header: "Códec",        key: "codec",     width: 16 },
        { header: "Estado",       key: "status",    width: 12 },
        { header: "Notas",        key: "notes",     width: 28 },
      ];
      const trunkHeaderRow = wsTrunk.getRow(1);
      trunkHeaderRow.height = 26;
      trunkHeaderRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0891B2" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: "FF06B6D4" } } };
      });
      wsTrunk.autoFilter = { from: "A1", to: "K1" };

      trunkDevices.forEach((dev: RackDevice) => {
        (dev.pbxTrunkLines || []).forEach((trunk: PbxTrunkLine) => {
          const row = wsTrunk.addRow({
            device: dev.label,
            provider: trunk.provider,
            number: trunk.number,
            type: trunk.type,
            channels: trunk.channels || "",
            sipServer: trunk.sipServer || "",
            sipUser: trunk.sipUser || "",
            sipPassword: trunk.sipPassword || "",
            codec: trunk.codec || "",
            status: trunk.status === "active" ? "Activa" : trunk.status === "inactive" ? "Inactiva" : trunk.status === "backup" ? "Backup" : "",
            notes: trunk.notes || "",
          });
          row.getCell("number").font = { bold: true, family: 3 };
          row.getCell("sipServer").font = { family: 3 };
          row.getCell("sipUser").font = { family: 3 };
          row.getCell("sipPassword").font = { family: 3 };
        });
      });
    }

    // ── Serialize and return ─────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rack-${rackName.replace(/\s+/g, "_")}-report.xlsx"`,
      },
    });
  } catch (error) {
    console.error("XLSX generation error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate Excel file" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
