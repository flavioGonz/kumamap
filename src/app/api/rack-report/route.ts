import { NextRequest, NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak,
} from "docx";

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

// ── Colors ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  server: "Servidor", switch: "Switch", patchpanel: "Patch Panel",
  ups: "UPS / Energía", router: "Router", pdu: "PDU", pbx: "PBX / Telefonía",
  "tray-fiber": "Bandeja de Fibra", "tray-1u": "Bandeja 1U",
  "tray-2u": "Bandeja 2U", other: "Otro",
};

// ── Shared border/shading helpers ─────────────────────────────────────────────

const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: "1E3A5F", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18, font: "Arial" })],
    })],
  });
}

function dataCell(text: string, width: number, opts: { mono?: boolean; color?: string; shade?: string } = {}): TableCell {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : { fill: "F9FAFB", type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({
        text,
        size: 18,
        font: opts.mono ? "Courier New" : "Arial",
        color: opts.color || "333333",
      })],
    })],
  });
}

// ── Main report builder ───────────────────────────────────────────────────────

function buildRackReport(rackName: string, totalUnits: number, devices: RackDevice[]): Buffer {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
  const usedUnits = devices.reduce((s, d) => s + d.sizeUnits, 0);
  const freeUnits = totalUnits - usedUnits;
  const sorted = [...devices].sort((a, b) => b.unit - a.unit);

  // ── Content width: A4 with 1" margins = 11906 - 2*1440 = 9026 DXA ──
  const CW = 9026;

  const children: any[] = [];

  // ── Title block ──
  children.push(
    new Paragraph({
      children: [new TextRun({ text: rackName, bold: true, size: 48, font: "Arial", color: "1E3A5F" })],
      spacing: { before: 0, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Reporte de Rack  ·  ${dateStr}`, size: 22, font: "Arial", color: "888888" })],
      spacing: { before: 0, after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1E3A5F", space: 1 } },
    }),
    new Paragraph({ children: [], spacing: { before: 160, after: 0 } }),
  );

  // ── Summary stats row ──
  children.push(
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [Math.floor(CW / 3), Math.floor(CW / 3), CW - 2 * Math.floor(CW / 3)],
      rows: [
        new TableRow({
          children: [
            makeSummaryCell("TOTAL", `${totalUnits}U`, "1E3A5F"),
            makeSummaryCell("OCUPADAS", `${usedUnits}U`, "D97706"),
            makeSummaryCell("LIBRES", `${freeUnits}U`, "059669"),
          ],
        }),
      ],
    }),
    new Paragraph({ children: [], spacing: { before: 280, after: 0 } }),
  );

  // ── Device inventory table ──
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Inventario de Equipos", font: "Arial" })],
      spacing: { before: 80, after: 160 },
    }),
  );

  // Column widths for inventory table
  const invCols = [520, 1900, 1020, 1800, 1200, 600, 580, 600, 806];  // = 9026
  const invHeaders = ["U", "Nombre", "Tipo", "Modelo / Serie", "IP de Gestión", "Puertos", "Cable", "PoE", "Notas"];

  children.push(
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: invCols,
      rows: [
        // Header row
        new TableRow({
          tableHeader: true,
          children: invHeaders.map((h, i) => headerCell(h, invCols[i])),
        }),
        // Data rows
        ...sorted.map((d, rowIdx) => {
          const shade = rowIdx % 2 === 0 ? "FFFFFF" : "F3F4F6";
          const connPorts = d.type === "patchpanel"
            ? `${(d.ports || []).filter(p => p.connected).length}/${d.portCount || 24}`
            : d.type === "switch"
            ? `${(d.switchPorts || []).filter(p => p.connected).length}/${d.portCount || 24}`
            : "—";
          const unitStr = `U${d.unit}${d.sizeUnits > 1 ? `–${d.unit + d.sizeUnits - 1}` : ""}`;
          const modelSerial = [d.model, d.serial ? `S/N: ${d.serial}` : ""].filter(Boolean).join("  ·  ") || "—";
          return new TableRow({
            children: [
              dataCell(unitStr, invCols[0], { mono: true, shade }),
              dataCell(d.label, invCols[1], { shade }),
              dataCell(TYPE_LABELS[d.type] || d.type, invCols[2], { shade }),
              dataCell(modelSerial, invCols[3], { shade }),
              dataCell(d.managementIp || "—", invCols[4], { mono: true, shade }),
              dataCell(connPorts, invCols[5], { mono: true, shade }),
              dataCell(d.cableLength != null ? `${d.cableLength}m` : "—", invCols[6], { mono: true, shade }),
              dataCell(d.isPoeCapable ? "✓" : "—", invCols[7], {
                shade,
                color: d.isPoeCapable ? "D97706" : "AAAAAA",
              }),
              dataCell(d.notes || "", invCols[8], { shade }),
            ],
          });
        }),
      ],
    }),
    new Paragraph({ children: [], spacing: { before: 320, after: 0 } }),
  );

  // ── Port details per device ──
  const devicesWithPorts = sorted.filter(d =>
    (d.type === "patchpanel" && (d.ports || []).length > 0) ||
    (d.type === "switch" && (d.switchPorts || []).length > 0) ||
    (d.type === "router" && (d.routerInterfaces || []).length > 0) ||
    (d.type === "pbx" && (d.pbxExtensions || []).length > 0)
  );

  if (devicesWithPorts.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Detalle de Puertos e Interfaces", font: "Arial" })],
        spacing: { before: 80, after: 160 },
      }),
    );

    for (const d of devicesWithPorts) {
      const unitStr = `U${d.unit}${d.sizeUnits > 1 ? `–${d.unit + d.sizeUnits - 1}` : ""}`;

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: `${d.label}  ·  ${TYPE_LABELS[d.type] || d.type}  ·  ${unitStr}`, font: "Arial" })],
          spacing: { before: 200, after: 120 },
        }),
      );

      if (d.type === "patchpanel" && d.ports) {
        children.push(...buildPatchTable(d.ports, CW));
      } else if (d.type === "switch" && d.switchPorts) {
        children.push(...buildSwitchTable(d.switchPorts, CW));
      } else if (d.type === "router" && d.routerInterfaces) {
        children.push(...buildRouterTable(d.routerInterfaces, CW));
      } else if (d.type === "pbx" && d.pbxExtensions) {
        children.push(...buildPbxTable(d.pbxExtensions, CW));
      }

      // Add trunk lines section for PBX devices
      if (d.type === "pbx" && (d.pbxTrunkLines || []).length > 0) {
        children.push(...buildTrunkTable(d.pbxTrunkLines!, CW));
      }

      children.push(new Paragraph({ children: [], spacing: { before: 160, after: 0 } }));
    }
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
      paragraphStyles: [
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: "1E3A5F" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C5D5E8", space: 1 } } },
        },
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 22, bold: true, font: "Arial", color: "374151" },
          paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `KumaMap · ${rackName}`, size: 16, font: "Arial", color: "AAAAAA" }),
              new TextRun({ text: `\t${dateStr}`, size: 16, font: "Arial", color: "CCCCCC" }),
            ],
            tabStops: [{ type: 4, position: 9026 }] as any,
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "EEEEEE", space: 1 } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: "Rack Report — KumaMap  ", size: 16, font: "Arial", color: "AAAAAA" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Arial", color: "888888" }),
              new TextRun({ text: " / ", size: 16, font: "Arial", color: "AAAAAA" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: "Arial", color: "888888" }),
            ],
            alignment: AlignmentType.RIGHT,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: "EEEEEE", space: 1 } },
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBuffer(doc) as unknown as Buffer;
}

function makeSummaryCell(label: string, value: string, color: string): TableCell {
  const CW3 = Math.floor(9026 / 3);
  return new TableCell({
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    width: { size: CW3, type: WidthType.DXA },
    shading: { fill: "F8FAFF", type: ShadingType.CLEAR },
    margins: { top: 200, bottom: 200, left: 240, right: 240 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: label, size: 16, font: "Arial", color: "888888", bold: true })],
        spacing: { before: 0, after: 40 },
      }),
      new Paragraph({
        children: [new TextRun({ text: value, size: 44, font: "Arial", color, bold: true })],
        spacing: { before: 0, after: 0 },
      }),
    ],
  });
}

function buildPatchTable(ports: PatchPort[], CW: number): any[] {
  const connected = ports.filter(p => p.connected);
  const free = ports.filter(p => !p.connected);

  const cols = [420, 520, 1200, 1300, 1200, 800, 600, 600, 2386];  // = 9026
  const headers = ["Puerto", "Etiqueta", "Destino", "Dispositivo", "MAC", "Cable", "Long.", "PoE", "Notas"];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => headerCell(h, cols[i])),
    }),
    ...ports.map((p, ri) => {
      const shade = ri % 2 === 0 ? "FFFFFF" : "F3F4F6";
      return new TableRow({ children: [
        dataCell(String(p.port), cols[0], { mono: true, shade }),
        dataCell(p.label || `P${p.port}`, cols[1], { shade }),
        dataCell(p.destination || "—", cols[2], { shade }),
        dataCell(p.connectedDevice || "—", cols[3], { shade }),
        dataCell(p.macAddress || "—", cols[4], { mono: true, shade }),
        dataCell(p.cableColor ? `●` : "—", cols[5], { shade, color: p.cableColor || "AAAAAA" }),
        dataCell(p.cableLength || "—", cols[6], { mono: true, shade }),
        dataCell(p.isPoe ? (p.poeType || "✓") : "—", cols[7], { shade, color: p.isPoe ? "D97706" : "AAAAAA" }),
        dataCell(p.notes || "", cols[8], { shade }),
      ]});
    }),
  ];

  return [
    new Paragraph({
      children: [
        new TextRun({ text: `${connected.length} conectados`, size: 18, font: "Arial", color: "059669" }),
        new TextRun({ text: `  ·  ${free.length} libres`, size: 18, font: "Arial", color: "888888" }),
        new TextRun({ text: `  ·  Total ${ports.length} puertos`, size: 18, font: "Arial", color: "AAAAAA" }),
      ],
      spacing: { before: 0, after: 100 },
    }),
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: cols,
      rows,
    }),
  ];
}

function buildSwitchTable(ports: SwitchPort[], CW: number): any[] {
  const connected = ports.filter(p => p.connected);
  const cols = [420, 520, 600, 1400, 1300, 500, 500, 540, 600, 2646]; // = 9026
  const headers = ["Puerto", "Etiqueta", "Velocidad", "Dispositivo", "MAC", "VLAN", "PoE", "W", "Uplink", "Notas"];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => headerCell(h, cols[i])),
    }),
    ...ports.map((p, ri) => {
      const shade = ri % 2 === 0 ? "FFFFFF" : "F3F4F6";
      const speedColors: Record<string, string> = { "10": "555555", "100": "2563EB", "1G": "059669", "10G": "D97706" };
      return new TableRow({ children: [
        dataCell(String(p.port), cols[0], { mono: true, shade }),
        dataCell(p.label || String(p.port), cols[1], { shade }),
        dataCell(p.speed || "—", cols[2], { mono: true, shade, color: p.speed ? speedColors[p.speed] : "AAAAAA" }),
        dataCell(p.connectedDevice || "—", cols[3], { shade }),
        dataCell(p.macAddress || "—", cols[4], { mono: true, shade }),
        dataCell(p.vlan ? String(p.vlan) : "—", cols[5], { mono: true, shade }),
        dataCell(p.isPoe ? "✓" : "—", cols[6], { shade, color: p.isPoe ? "D97706" : "AAAAAA" }),
        dataCell(p.poeWatts ? `${p.poeWatts}W` : "—", cols[7], { mono: true, shade }),
        dataCell(p.uplink ? "↑" : "—", cols[8], { shade, color: p.uplink ? "2563EB" : "AAAAAA" }),
        dataCell(p.notes || "", cols[9], { shade }),
      ]});
    }),
  ];

  return [
    new Paragraph({
      children: [
        new TextRun({ text: `${connected.length} conectados`, size: 18, font: "Arial", color: "059669" }),
        new TextRun({ text: `  ·  Total ${ports.length} puertos`, size: 18, font: "Arial", color: "AAAAAA" }),
      ],
      spacing: { before: 0, after: 100 },
    }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: cols, rows }),
  ];
}

function buildRouterTable(interfaces: RouterInterface[], CW: number): any[] {
  const cols = [600, 900, 800, 2200, 600, 3926]; // = 9026
  const headers = ["#", "Nombre", "Tipo", "Dirección IP", "Estado", "Notas"];
  const typeColors: Record<string, string> = {
    WAN: "DC2626", LAN: "059669", MGMT: "D97706", DMZ: "EA580C", VPN: "7C3AED", other: "6B7280",
  };

  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => headerCell(h, cols[i])),
    }),
    ...interfaces.map((iface, ri) => {
      const shade = ri % 2 === 0 ? "FFFFFF" : "F3F4F6";
      return new TableRow({ children: [
        dataCell(String(ri), cols[0], { mono: true, shade }),
        dataCell(iface.name, cols[1], { mono: true, shade }),
        dataCell(iface.type, cols[2], { shade, color: typeColors[iface.type] || "555555" }),
        dataCell(iface.ipAddress || "—", cols[3], { mono: true, shade }),
        dataCell(iface.connected ? "Activo" : "Inactivo", cols[4], { shade, color: iface.connected ? "059669" : "888888" }),
        dataCell(iface.notes || "", cols[5], { shade }),
      ]});
    }),
  ];

  return [
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: cols, rows }),
  ];
}

function buildTrunkTable(trunks: PbxTrunkLine[], CW: number): any[] {
  const cols = [1400, 1200, 700, 700, 1600, 1200, 700, 1526]; // = 9026
  const headers = ["Proveedor", "Número/DID", "Tipo", "Canales", "Servidor SIP", "Códec", "Estado", "Notas"];
  const statusLabels: Record<string, string> = { active: "Activa", inactive: "Inactiva", backup: "Backup" };
  const statusColors: Record<string, string> = { active: "059669", inactive: "DC2626", backup: "D97706" };

  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => headerCell(h, cols[i])),
    }),
    ...trunks.map((t, ri) => {
      const shade = ri % 2 === 0 ? "FFFFFF" : "F3F4F6";
      return new TableRow({ children: [
        dataCell(t.provider || "—", cols[0], { shade }),
        dataCell(t.number || "—", cols[1], { mono: true, shade }),
        dataCell(t.type, cols[2], { mono: true, shade, color: "0891B2" }),
        dataCell(t.channels ? String(t.channels) : "—", cols[3], { mono: true, shade }),
        dataCell(t.sipServer || "—", cols[4], { mono: true, shade }),
        dataCell(t.codec || "—", cols[5], { shade }),
        dataCell(statusLabels[t.status || "active"] || "—", cols[6], { shade, color: statusColors[t.status || "active"] || "555555" }),
        dataCell(t.notes || "", cols[7], { shade }),
      ]});
    }),
  ];

  return [
    new Paragraph({
      children: [
        new TextRun({ text: `Líneas del proveedor`, size: 20, font: "Arial", color: "0891B2", bold: true }),
        new TextRun({ text: `  ·  ${trunks.length} líneas`, size: 18, font: "Arial", color: "888888" }),
      ],
      spacing: { before: 200, after: 100 },
    }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: cols, rows }),
  ];
}

function buildPbxTable(extensions: PbxExtension[], CW: number): any[] {
  const cols = [600, 1400, 1200, 1200, 900, 1000, 900, 826]; // = 9026
  const headers = ["Ext.", "Nombre", "IP Teléfono", "MAC", "Modelo", "Ubicación", "Usuario SIP", "Notas"];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => headerCell(h, cols[i])),
    }),
    ...extensions.map((ext, ri) => {
      const shade = ri % 2 === 0 ? "FFFFFF" : "F3F4F6";
      return new TableRow({ children: [
        dataCell(ext.extension, cols[0], { mono: true, shade }),
        dataCell(ext.name || "—", cols[1], { shade }),
        dataCell(ext.ipPhone || "—", cols[2], { mono: true, shade }),
        dataCell(ext.macAddress || "—", cols[3], { mono: true, shade }),
        dataCell(ext.model || "—", cols[4], { shade }),
        dataCell(ext.location || "—", cols[5], { shade }),
        dataCell(ext.username || "—", cols[6], { mono: true, shade }),
        dataCell(ext.notes || "", cols[7], { shade }),
      ]});
    }),
  ];

  return [
    new Paragraph({
      children: [
        new TextRun({ text: `${extensions.length} extensiones`, size: 18, font: "Arial", color: "0891B2" }),
      ],
      spacing: { before: 0, after: 100 },
    }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: cols, rows }),
  ];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rackName, totalUnits, devices } = body;

    if (!rackName || !totalUnits || !Array.isArray(devices)) {
      return NextResponse.json({ error: "Missing rack data" }, { status: 400 });
    }

    const buffer = await buildRackReport(rackName, totalUnits, devices);
    const uint8 = new Uint8Array(buffer);

    const filename = encodeURIComponent(`rack-${rackName}-report.docx`);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("Rack report error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
