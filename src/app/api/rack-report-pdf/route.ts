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

// ── Markdown to HTML converter (simple) ──────────────────────────────────────

function generatePDFHtml(rackName: string, totalUnits: number, devices: RackDevice[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
  const usedUnits = devices.reduce((s, d) => s + d.sizeUnits, 0);
  const freeUnits = totalUnits - usedUnits;
  const sorted = [...devices].sort((a, b) => b.unit - a.unit);

  const tableRows = sorted.map((d, i) => {
    const meta = TYPE_LABELS[d.type] || "Otro";
    const connPorts = d.type === "patchpanel"
      ? `${(d.ports||[]).filter(p=>p.connected).length}/${d.portCount||24}`
      : d.type === "switch"
      ? `${(d.switchPorts||[]).filter(p=>p.connected).length}/${d.portCount||24}`
      : "—";
    return `
      <tr style="border-bottom: 1px solid #ddd; background: ${i%2===0?'#fff':'#f9f9f9'}">
        <td style="padding: 8px; text-align: left">U${d.unit}${d.sizeUnits>1?`-${d.unit+d.sizeUnits-1}`:""}</td>
        <td style="padding: 8px; font-weight: 600">${d.label}</td>
        <td style="padding: 8px">${meta}</td>
        <td style="padding: 8px; font-family: monospace; font-size: 12px">${d.model||"—"}</td>
        <td style="padding: 8px; font-family: monospace; font-size: 12px">${d.managementIp||"—"}</td>
        <td style="padding: 8px; font-family: monospace">${connPorts}</td>
        <td style="padding: 8px">${d.notes||"—"}</td>
      </tr>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${rackName} - Reporte</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px; }
    h1 { color: #1e3a5f; margin: 0 0 10px 0; font-size: 28px; }
    .meta { font-size: 12px; color: #666; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
    .summary-box { background: #f5f5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #1e3a5f; }
    .summary-box strong { display: block; font-size: 18px; color: #1e3a5f; }
    .summary-box small { color: #888; display: block; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #1e3a5f; color: white; padding: 12px; text-align: left; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .footer { border-top: 1px solid #ddd; padding-top: 15px; font-size: 11px; color: #999; text-align: right; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${rackName}</h1>
      <div class="meta">Reporte generado ${dateStr}</div>
    </div>

    <div class="summary">
      <div class="summary-box">
        <strong>${totalUnits}U</strong>
        <small>Total del Rack</small>
      </div>
      <div class="summary-box">
        <strong style="color: #f59e0b">${usedUnits}U</strong>
        <small>Espacios Ocupados</small>
      </div>
      <div class="summary-box">
        <strong style="color: #10b981">${freeUnits}U</strong>
        <small>Espacios Libres</small>
      </div>
    </div>

    <h2 style="color: #1e3a5f; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Equipos Instalados</h2>
    <table>
      <thead>
        <tr>
          <th>Posición</th>
          <th>Nombre</th>
          <th>Tipo</th>
          <th>Modelo</th>
          <th>IP Gestión</th>
          <th>Puertos</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div class="footer">
      <p>KumaMap Rack Designer | Reporte confidencial</p>
    </div>
  </div>
</body>
</html>
  `;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { rackName, totalUnits, devices } = await request.json();

    // Generate HTML
    const html = generatePDFHtml(rackName, totalUnits, devices);

    // For now, return HTML as blob that browser can print to PDF
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Content-Disposition": `attachment; filename="rack-${rackName.replace(/\s+/g, "_")}-report.html"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
