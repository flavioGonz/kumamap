import { NextRequest, NextResponse } from "next/server";

// ── Type definitions ────────────────────────────────────────────────────────

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
  username?: string; password?: string; webUser?: string; webPassword?: string;
  model?: string; location?: string; notes?: string;
}

interface PbxTrunkLine {
  id: string; provider: string; number: string; type: string;
  channels?: number; sipServer?: string; sipUser?: string; sipPassword?: string;
  codec?: string; status?: string; notes?: string;
}

interface NvrChannel {
  channel: number; label: string; enabled: boolean; resolution?: string;
  fps?: number; codec?: string; connectedCamera?: string; cameraIp?: string;
  protocol?: string; recording?: string; notes?: string;
}

interface NvrDisk {
  id: string; slot: number; brand?: string; model?: string;
  capacityTB?: number; type?: string; status?: string; notes?: string;
}

interface RackDevice {
  id: string; unit: number; sizeUnits: number; label: string;
  type: string; color?: string; monitorId?: number | null;
  ports?: PatchPort[]; switchPorts?: SwitchPort[]; routerInterfaces?: RouterInterface[];
  pbxExtensions?: PbxExtension[]; pbxTrunkLines?: PbxTrunkLine[];
  nvrChannels?: NvrChannel[]; nvrDisks?: NvrDisk[];
  nvrTotalChannels?: number; nvrDiskBays?: number;
  portCount?: number; managementIp?: string; model?: string;
  serial?: string; cableLength?: number; isPoeCapable?: boolean; notes?: string;
  brand?: string; snmpCommunity?: string; mgmtUser?: string; mgmtPassword?: string;
  fiberCapacity?: number; fiberConnectorType?: string; fiberMode?: string; spliceCount?: number;
  pduHasBreaker?: boolean; pduInputCount?: number; mountedItems?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  server: "Servidor", switch: "Switch", patchpanel: "Patch Panel",
  ups: "UPS / Energía", router: "Router", pdu: "PDU", pbx: "PBX / Telefonía",
  nvr: "NVR / Grabador", "tray-fiber": "Bandeja de Fibra", "tray-1u": "Bandeja 1U",
  "tray-2u": "Bandeja 2U", "cable-organizer": "Organizador de Cable", other: "Otro",
};

const SPEED_COLORS: Record<string, string> = { "10": "#555", "100": "#2563EB", "1G": "#059669", "10G": "#D97706" };
const TYPE_COLORS: Record<string, string> = { WAN: "#DC2626", LAN: "#059669", MGMT: "#D97706", DMZ: "#EA580C", VPN: "#7C3AED", other: "#6B7280" };
const STATUS_LABELS: Record<string, string> = { active: "Activa", inactive: "Inactiva", backup: "Backup" };
const STATUS_COLORS: Record<string, string> = { active: "#059669", inactive: "#DC2626", backup: "#D97706" };
const REC_COLORS: Record<string, string> = { continuous: "#059669", motion: "#2563EB", schedule: "#D97706", alarm: "#DC2626", off: "#888" };
const REC_LABELS: Record<string, string> = { continuous: "Continuo", motion: "Movimiento", schedule: "Horario", alarm: "Alarma", off: "Apagado" };
const DISK_STATUS_LABELS: Record<string, string> = { healthy: "OK", degraded: "Degradado", failed: "Fallado", empty: "Vacío" };
const DISK_STATUS_COLORS: Record<string, string> = { healthy: "#059669", degraded: "#D97706", failed: "#DC2626", empty: "#888" };

// ── HTML builder ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function generatePDFHtml(rackName: string, totalUnits: number, devices: RackDevice[], rackImage?: string | null): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
  const usedUnits = devices.reduce((s, d) => s + d.sizeUnits, 0);
  const freeUnits = totalUnits - usedUnits;
  const sorted = [...devices].sort((a, b) => b.unit - a.unit);

  // ── Rack image section ──
  const rackImageHtml = rackImage
    ? `<div style="text-align:center;margin:20px 0"><img src="${rackImage}" style="max-width:420px;max-height:600px;border:1px solid #ddd;border-radius:6px" /></div>`
    : "";

  // ── Inventory rows ──
  const inventoryRows = sorted.map((d, i) => {
    const connPorts = d.type === "patchpanel"
      ? `${(d.ports || []).filter(p => p.connected).length}/${d.portCount || 24}`
      : d.type === "switch"
      ? `${(d.switchPorts || []).filter(p => p.connected).length}/${d.portCount || 24}`
      : d.type === "nvr"
      ? `${(d.nvrChannels || []).filter(c => c.enabled).length}/${(d.nvrChannels || []).length}`
      : "—";
    const unitStr = `U${d.unit}${d.sizeUnits > 1 ? `–${d.unit + d.sizeUnits - 1}` : ""}`;
    const modelSerial = [d.model, d.serial ? `S/N: ${d.serial}` : ""].filter(Boolean).join("  ·  ") || "—";
    const bg = i % 2 === 0 ? "#fff" : "#F3F4F6";
    return `<tr style="background:${bg}">
      <td class="c mono">${unitStr}</td>
      <td class="c">${esc(d.label)}</td>
      <td class="c">${TYPE_LABELS[d.type] || d.type}</td>
      <td class="c">${esc(modelSerial)}</td>
      <td class="c mono">${d.managementIp || "—"}</td>
      <td class="c">${esc(d.brand || "—")}</td>
      <td class="c mono">${esc(d.snmpCommunity || "—")}</td>
      <td class="c mono">${esc(d.mgmtUser || "—")}</td>
      <td class="c mono">${esc(d.mgmtPassword || "—")}</td>
      <td class="c mono">${connPorts}</td>
      <td class="c mono">${d.cableLength != null ? `${d.cableLength}m` : "—"}</td>
      <td class="c" style="color:${d.isPoeCapable ? "#D97706" : "#aaa"}">${d.isPoeCapable ? "✓" : "—"}</td>
      <td class="c">${esc(d.notes || "")}</td>
    </tr>`;
  }).join("");

  // ── Port detail sections ──
  const devicesWithDetail = sorted.filter(d =>
    (d.type === "patchpanel" && (d.ports || []).length > 0) ||
    (d.type === "switch" && (d.switchPorts || []).length > 0) ||
    (d.type === "router" && (d.routerInterfaces || []).length > 0) ||
    (d.type === "pbx" && ((d.pbxExtensions || []).length > 0 || (d.pbxTrunkLines || []).length > 0)) ||
    (d.type === "nvr" && ((d.nvrChannels || []).length > 0 || (d.nvrDisks || []).length > 0)) ||
    (d.type === "tray-fiber" && (d.fiberCapacity || d.fiberConnectorType)) ||
    (d.type === "pdu" && (d.pduInputCount || d.pduHasBreaker || d.portCount)) ||
    (d.type === "cable-organizer" && d.mountedItems)
  );

  let portDetailsHtml = "";
  if (devicesWithDetail.length > 0) {
    portDetailsHtml += `<div class="page-break"></div><h2>Detalle de Equipos, Puertos e Interfaces</h2>`;

    for (const d of devicesWithDetail) {
      const unitStr = `U${d.unit}${d.sizeUnits > 1 ? `–${d.unit + d.sizeUnits - 1}` : ""}`;
      portDetailsHtml += `<h3>${esc(d.label)}  ·  ${TYPE_LABELS[d.type] || d.type}  ·  ${unitStr}</h3>`;

      if (d.type === "patchpanel" && d.ports) {
        const connected = d.ports.filter(p => p.connected).length;
        const free = d.ports.filter(p => !p.connected).length;
        portDetailsHtml += `<p class="port-summary"><span style="color:#059669">${connected} conectados</span> · <span style="color:#888">${free} libres</span> · <span style="color:#aaa">Total ${d.ports.length} puertos</span></p>`;
        portDetailsHtml += `<table><thead><tr>${["Puerto","Etiqueta","Destino","Dispositivo","MAC","Cable","Long.","PoE","Notas"].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
        d.ports.forEach((p, ri) => {
          const bg = ri % 2 === 0 ? "#fff" : "#F3F4F6";
          portDetailsHtml += `<tr style="background:${bg}">
            <td class="c mono">${p.port}</td>
            <td class="c">${esc(p.label || `P${p.port}`)}</td>
            <td class="c">${esc(p.destination || "—")}</td>
            <td class="c">${esc(p.connectedDevice || "—")}</td>
            <td class="c mono">${p.macAddress || "—"}</td>
            <td class="c">${p.cableColor ? `<span style="color:${p.cableColor}">●</span>` : "—"}</td>
            <td class="c mono">${p.cableLength || "—"}</td>
            <td class="c" style="color:${p.isPoe ? "#D97706" : "#aaa"}">${p.isPoe ? (p.poeType || "✓") : "—"}</td>
            <td class="c">${esc(p.notes || "")}</td>
          </tr>`;
        });
        portDetailsHtml += `</tbody></table>`;
      }

      if (d.type === "switch" && d.switchPorts) {
        const connected = d.switchPorts.filter(p => p.connected).length;
        portDetailsHtml += `<p class="port-summary"><span style="color:#059669">${connected} conectados</span> · <span style="color:#aaa">Total ${d.switchPorts.length} puertos</span></p>`;
        portDetailsHtml += `<table><thead><tr>${["Puerto","Etiqueta","Velocidad","Dispositivo","MAC","VLAN","PoE","W","Uplink","Notas"].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
        d.switchPorts.forEach((p, ri) => {
          const bg = ri % 2 === 0 ? "#fff" : "#F3F4F6";
          const sc = p.speed ? (SPEED_COLORS[p.speed] || "#555") : "#aaa";
          portDetailsHtml += `<tr style="background:${bg}">
            <td class="c mono">${p.port}</td>
            <td class="c">${esc(p.label || String(p.port))}</td>
            <td class="c mono" style="color:${sc}">${p.speed || "—"}</td>
            <td class="c">${esc(p.connectedDevice || "—")}</td>
            <td class="c mono">${p.macAddress || "—"}</td>
            <td class="c mono">${p.vlan || "—"}</td>
            <td class="c" style="color:${p.isPoe ? "#D97706" : "#aaa"}">${p.isPoe ? "✓" : "—"}</td>
            <td class="c mono">${p.poeWatts ? `${p.poeWatts}W` : "—"}</td>
            <td class="c" style="color:${p.uplink ? "#2563EB" : "#aaa"}">${p.uplink ? "↑" : "—"}</td>
            <td class="c">${esc(p.notes || "")}</td>
          </tr>`;
        });
        portDetailsHtml += `</tbody></table>`;
      }

      if (d.type === "router" && d.routerInterfaces) {
        portDetailsHtml += `<table><thead><tr>${["#","Nombre","Tipo","Dirección IP","Estado","Notas"].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
        d.routerInterfaces.forEach((iface, ri) => {
          const bg = ri % 2 === 0 ? "#fff" : "#F3F4F6";
          const tc = TYPE_COLORS[iface.type] || "#555";
          portDetailsHtml += `<tr style="background:${bg}">
            <td class="c mono">${ri}</td>
            <td class="c mono">${esc(iface.name)}</td>
            <td class="c" style="color:${tc};font-weight:600">${iface.type}</td>
            <td class="c mono">${iface.ipAddress || "—"}</td>
            <td class="c" style="color:${iface.connected ? "#059669" : "#888"}">${iface.connected ? "Activo" : "Inactivo"}</td>
            <td class="c">${esc(iface.notes || "")}</td>
          </tr>`;
        });
        portDetailsHtml += `</tbody></table>`;
      }

      if (d.type === "pbx" && d.pbxExtensions && d.pbxExtensions.length > 0) {
        portDetailsHtml += `<p class="port-summary" style="color:#0891B2">${d.pbxExtensions.length} extensiones</p>`;
        portDetailsHtml += `<table><thead><tr>${["Ext.","Nombre","IP Teléfono","MAC","Modelo","Ubicación","Usuario SIP","Contraseña SIP","User Web","Pass Web","Notas"].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
        d.pbxExtensions.forEach((ext, ri) => {
          const bg = ri % 2 === 0 ? "#fff" : "#F3F4F6";
          portDetailsHtml += `<tr style="background:${bg}">
            <td class="c mono">${ext.extension}</td>
            <td class="c">${esc(ext.name || "—")}</td>
            <td class="c mono">${ext.ipPhone || "—"}</td>
            <td class="c mono">${ext.macAddress || "—"}</td>
            <td class="c">${esc(ext.model || "—")}</td>
            <td class="c">${esc(ext.location || "—")}</td>
            <td class="c mono">${ext.username || "—"}</td>
            <td class="c mono">${ext.password || "—"}</td>
            <td class="c mono">${ext.webUser || "—"}</td>
            <td class="c mono">${ext.webPassword || "—"}</td>
            <td class="c">${esc(ext.notes || "")}</td>
          </tr>`;
        });
        portDetailsHtml += `</tbody></table>`;
      }

      if (d.type === "pbx" && d.pbxTrunkLines && d.pbxTrunkLines.length > 0) {
        portDetailsHtml += `<p class="trunk-title"><strong style="color:#0891B2">Líneas del proveedor</strong> · <span style="color:#888">${d.pbxTrunkLines.length} líneas</span></p>`;
        portDetailsHtml += `<table><thead><tr>${["Proveedor","Número/DID","Tipo","Canales","Servidor SIP","Usuario SIP","Contraseña SIP","Códec","Estado","Notas"].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
        d.pbxTrunkLines.forEach((t, ri) => {
          const bg = ri % 2 === 0 ? "#fff" : "#F3F4F6";
          const sc = STATUS_COLORS[t.status || "active"] || "#555";
          portDetailsHtml += `<tr style="background:${bg}">
            <td class="c">${esc(t.provider || "—")}</td>
            <td class="c mono">${t.number || "—"}</td>
            <td class="c mono" style="color:#0891B2">${t.type}</td>
            <td class="c mono">${t.channels || "—"}</td>
            <td class="c mono">${t.sipServer || "—"}</td>
            <td class="c mono">${t.sipUser || "—"}</td>
            <td class="c mono">${t.sipPassword || "—"}</td>
            <td class="c">${t.codec || "—"}</td>
            <td class="c" style="color:${sc};font-weight:600">${STATUS_LABELS[t.status || "active"] || "—"}</td>
            <td class="c">${esc(t.notes || "")}</td>
          </tr>`;
        });
        portDetailsHtml += `</tbody></table>`;
      }

      // NVR Channels
      if (d.type === "nvr" && d.nvrChannels && d.nvrChannels.length > 0) {
        const enabledCh = d.nvrChannels.filter(c => c.enabled).length;
        portDetailsHtml += `<p class="port-summary"><span style="color:#E11D48;font-weight:700">📹 Canales:</span> <span style="color:#059669">${enabledCh} activos</span> / <span style="color:#aaa">${d.nvrChannels.length} total</span></p>`;
        portDetailsHtml += `<table><thead><tr>${["CH","Estado","Cámara","IP Cámara","Protocolo","Resolución","Codec","FPS","Grabación","Notas"].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
        d.nvrChannels.forEach((ch, ri) => {
          const bg = ri % 2 === 0 ? "#fff" : "#F3F4F6";
          const rc = ch.recording ? (REC_COLORS[ch.recording] || "#555") : "#aaa";
          portDetailsHtml += `<tr style="background:${bg}">
            <td class="c mono">${ch.channel}</td>
            <td class="c" style="color:${ch.enabled ? "#059669" : "#888"}">${ch.enabled ? "Activo" : "Inactivo"}</td>
            <td class="c">${esc(ch.connectedCamera || "—")}</td>
            <td class="c mono">${ch.cameraIp || "—"}</td>
            <td class="c">${ch.protocol || "—"}</td>
            <td class="c">${ch.resolution || "—"}</td>
            <td class="c">${ch.codec || "—"}</td>
            <td class="c mono">${ch.fps || "—"}</td>
            <td class="c" style="color:${rc};font-weight:600">${ch.recording ? (REC_LABELS[ch.recording] || ch.recording) : "—"}</td>
            <td class="c">${esc(ch.notes || "")}</td>
          </tr>`;
        });
        portDetailsHtml += `</tbody></table>`;
      }

      // NVR Disks
      if (d.type === "nvr" && d.nvrDisks && d.nvrDisks.length > 0) {
        const totalTB = d.nvrDisks.reduce((s, dk) => s + (dk.capacityTB || 0), 0);
        const installed = d.nvrDisks.filter(dk => dk.status !== "empty").length;
        portDetailsHtml += `<p class="port-summary"><span style="color:#E11D48;font-weight:700">💾 Discos:</span> <span style="color:#059669">${installed}/${d.nvrDisks.length} instalados</span> · <span style="color:#888">${totalTB}TB total</span></p>`;
        portDetailsHtml += `<table><thead><tr>${["Bahía","Marca","Modelo","Capacidad","Tipo","Estado","Notas"].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
        d.nvrDisks.forEach((disk, ri) => {
          const bg = ri % 2 === 0 ? "#fff" : "#F3F4F6";
          const sc = DISK_STATUS_COLORS[disk.status || "empty"] || "#888";
          portDetailsHtml += `<tr style="background:${bg}">
            <td class="c mono">${disk.slot}</td>
            <td class="c">${esc(disk.brand || "—")}</td>
            <td class="c">${esc(disk.model || "—")}</td>
            <td class="c mono">${disk.capacityTB ? `${disk.capacityTB} TB` : "—"}</td>
            <td class="c">${disk.type || "—"}</td>
            <td class="c" style="color:${sc};font-weight:600">${DISK_STATUS_LABELS[disk.status || "empty"] || "—"}</td>
            <td class="c">${esc(disk.notes || "")}</td>
          </tr>`;
        });
        portDetailsHtml += `</tbody></table>`;
      }

      // Fiber tray
      if (d.type === "tray-fiber" && (d.fiberCapacity || d.fiberConnectorType)) {
        const fParts: string[] = [];
        if (d.fiberCapacity) fParts.push(`${d.fiberCapacity} fibras`);
        if (d.fiberConnectorType) fParts.push(`Conector: ${d.fiberConnectorType}`);
        if (d.fiberMode) fParts.push(`Modo: ${d.fiberMode}`);
        if (d.spliceCount) fParts.push(`${d.spliceCount} empalmes`);
        portDetailsHtml += `<p class="port-summary"><span style="color:#7C3AED;font-weight:700">🔮 Fibra:</span> ${fParts.join(" · ")}</p>`;
      }

      // PDU
      if (d.type === "pdu" && (d.pduInputCount || d.pduHasBreaker || d.portCount)) {
        const pParts: string[] = [];
        if (d.pduInputCount) pParts.push(`${d.pduInputCount} entradas`);
        if (d.pduHasBreaker) pParts.push("Con breaker");
        if (d.portCount) pParts.push(`${d.portCount} tomas`);
        portDetailsHtml += `<p class="port-summary"><span style="color:#D97706;font-weight:700">⚡ PDU:</span> ${pParts.join(" · ")}</p>`;
      }

      // Cable organizer
      if (d.type === "cable-organizer" && d.mountedItems) {
        portDetailsHtml += `<p class="port-summary"><span style="color:#555;font-weight:700">🔧 Contenido:</span> ${esc(d.mountedItems)}</p>`;
      }
    }
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(rackName)} - Reporte de Rack</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #333; line-height: 1.4; }
    .page { max-width: 210mm; margin: 0 auto; padding: 15mm 15mm 20mm 15mm; }
    .doc-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid #eee; margin-bottom: 20px; font-size: 8pt; color: #aaa; }
    .doc-footer { border-top: 1px solid #eee; padding-top: 8px; margin-top: 30px; font-size: 8pt; color: #aaa; text-align: right; }
    .title { font-size: 24pt; font-weight: 700; color: #1E3A5F; margin-bottom: 6px; }
    .subtitle { font-size: 11pt; color: #888; padding-bottom: 8px; border-bottom: 3px solid #1E3A5F; margin-bottom: 18px; }
    .summary { display: flex; gap: 0; margin-bottom: 24px; }
    .summary-box { flex: 1; background: #F8FAFF; padding: 14px 18px; }
    .summary-box .label { font-size: 8pt; color: #888; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .summary-box .value { font-size: 22pt; font-weight: 700; margin-top: 4px; }
    h2 { font-size: 14pt; font-weight: 700; color: #1E3A5F; padding-bottom: 6px; border-bottom: 2px solid #C5D5E8; margin: 24px 0 14px 0; }
    h3 { font-size: 11pt; font-weight: 700; color: #374151; margin: 18px 0 8px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9pt; }
    th { background: #1E3A5F; color: #fff; padding: 6px 8px; text-align: left; font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid #ddd; }
    td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: middle; }
    .c { }
    .mono { font-family: 'Courier New', Courier, monospace; font-size: 8pt; }
    .port-summary { font-size: 9pt; margin-bottom: 8px; }
    .trunk-title { font-size: 10pt; margin: 16px 0 8px 0; }
    .page-break { page-break-before: always; }
    @media print {
      .page { padding: 10mm; max-width: none; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="doc-header">
      <span>KumaMap · ${esc(rackName)}</span>
      <span>${dateStr}</span>
    </div>
    <div class="title">${esc(rackName)}</div>
    <div class="subtitle">Reporte de Rack  ·  ${dateStr}</div>
    <div class="summary">
      <div class="summary-box">
        <div class="label">Total</div>
        <div class="value" style="color:#1E3A5F">${totalUnits}U</div>
      </div>
      <div class="summary-box">
        <div class="label">Ocupadas</div>
        <div class="value" style="color:#D97706">${usedUnits}U</div>
      </div>
      <div class="summary-box">
        <div class="label">Libres</div>
        <div class="value" style="color:#059669">${freeUnits}U</div>
      </div>
    </div>
    ${rackImageHtml}
    <h2>Inventario de Equipos</h2>
    <table>
      <thead>
        <tr>
          <th>U</th><th>Nombre</th><th>Tipo</th><th>Modelo / Serie</th>
          <th>IP de Gestión</th><th>Marca</th><th>SNMP</th><th>Usuario</th><th>Contraseña</th><th>Puertos</th><th>Cable</th><th>PoE</th><th>Notas</th>
        </tr>
      </thead>
      <tbody>${inventoryRows}</tbody>
    </table>
    ${portDetailsHtml}
    <div class="doc-footer">Rack Report — KumaMap</div>
  </div>
</body>
</html>`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { rackName, totalUnits, devices, rackImage } = await request.json();
    const html = generatePDFHtml(rackName, totalUnits, devices, rackImage);

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
