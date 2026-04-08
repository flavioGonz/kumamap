import { toast } from "sonner";
import type { KumaMonitor } from "@/components/network-map/MonitorPanel";

export interface ExportNode {
  id: string;
  kuma_monitor_id: number | null;
  label: string;
  x: number;
  y: number;
  icon: string;
  custom_data?: string | null;
}

// ── Export as PNG (html2canvas) ──
export async function exportMapPng(container: HTMLElement, mapName: string): Promise<void> {
  toast.info("Generando imagen...", { duration: 2000 });
  try {
    const h2c = (await import("html2canvas")).default;
    const canvas = await h2c(container, {
      useCORS: true,
      allowTaint: true,
      scale: 2,
      backgroundColor: "#0a0a0a",
      logging: false,
    } as any);
    const link = document.createElement("a");
    link.download = `${mapName}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Imagen exportada");
  } catch (err) {
    toast.error("Error al exportar imagen");
    console.error(err);
  }
}

// ── Print map ──
// Before printing: fit all nodes in view, then trigger window.print()
export function printMap(map: any, L: any, nodes: ExportNode[], isImageMode: boolean): void {
  if (!map || nodes.length === 0) { window.print(); return; }

  const filtered = nodes.filter(n => n.icon !== "_polygon");
  if (filtered.length === 0) { window.print(); return; }

  // Compute bounding box of all node positions
  const lats = filtered.map(n => n.x);
  const lngs = filtered.map(n => n.y);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  try {
    if (L) {
      const bounds = L.latLngBounds([[minLat, minLng], [maxLat, maxLng]]);
      map.fitBounds(bounds, { padding: [40, 40], animate: false, maxZoom: isImageMode ? map.getZoom() : 17 });
    }
  } catch { /* ignore fitBounds errors */ }

  // Give Leaflet a moment to settle tiles/markers, then print
  setTimeout(() => window.print(), 400);
}

// ── Export node list as styled XLSX ──
export async function exportNodesXlsx(nodes: ExportNode[], kumaMonitors: KumaMonitor[], mapName: string): Promise<void> {
  const XLSX = (await import("xlsx")).default;

  // ── Collect rows ──
  interface NodeRow { Nombre: string; Tipo: string; IP: string; MAC: string; "Monitor Kuma": string; Estado: string; "Ping (ms)": string; "Uptime 24h": string; URL: string; }
  const dataRows: NodeRow[] = [];
  for (const node of nodes) {
    if (node.icon === "_textLabel" || node.icon === "_waypoint" || node.icon === "_polygon") continue;
    let cd: Record<string, unknown> = {};
    try { cd = JSON.parse(node.custom_data || "{}"); } catch { /* ignore */ }
    const monitor = node.kuma_monitor_id ? kumaMonitors.find(m => m.id === node.kuma_monitor_id) : null;
    const status = monitor ? (monitor.status === 1 ? "UP" : monitor.status === 0 ? "DOWN" : "Pendiente") : "";
    dataRows.push({
      Nombre: node.label || "",
      Tipo: node.icon || "",
      IP: String(cd.ip || ""),
      MAC: String(cd.mac || ""),
      "Monitor Kuma": monitor?.name || "",
      Estado: status,
      "Ping (ms)": monitor?.ping != null ? String(monitor.ping) : "",
      "Uptime 24h": monitor?.uptime24 != null ? `${monitor.uptime24.toFixed(1)}%` : "",
      URL: monitor?.url || "",
    });
  }

  // ── Build workbook ──
  const wb = XLSX.utils.book_new();
  const headers = ["Nombre", "Tipo", "IP", "MAC", "Monitor Kuma", "Estado", "Ping (ms)", "Uptime 24h", "URL"];
  const wsData = [headers, ...dataRows.map(r => headers.map(h => r[h as keyof NodeRow]))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // ── Column widths ──
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 38 }];

  // ── Auto-filter on entire data range ──
  ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };

  // ── Header styles (xlsx supports basic cell styling via !type + s fields) ──
  // Apply bold + colored background to header row
  const headerColors: Record<string, string> = {
    Nombre: "1e293b", Tipo: "1e293b", IP: "0f3460", MAC: "0f3460",
    "Monitor Kuma": "0f3460", Estado: "0f3460", "Ping (ms)": "0f3460",
    "Uptime 24h": "0f3460", URL: "1e293b",
  };
  headers.forEach((h, ci) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (!ws[cellAddr]) ws[cellAddr] = { v: h, t: "s" };
    ws[cellAddr].s = {
      font: { bold: true, color: { rgb: "E2E8F0" }, sz: 11, name: "Calibri" },
      fill: { fgColor: { rgb: headerColors[h] || "1e293b" }, patternType: "solid" },
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: {
        bottom: { style: "medium", color: { rgb: "6366F1" } },
        right: { style: "thin", color: { rgb: "334155" } },
      },
    };
  });

  // ── Data row styles: alternating dark rows, status color ──
  dataRows.forEach((row, ri) => {
    const even = ri % 2 === 0;
    const rowBg = even ? "0F172A" : "1E293B";
    headers.forEach((h, ci) => {
      const cellAddr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      if (!ws[cellAddr]) ws[cellAddr] = { v: row[h as keyof NodeRow] || "", t: "s" };
      let fontColor = "CBD5E1";
      if (h === "Estado") {
        const v = row["Estado"];
        fontColor = v === "UP" ? "4ADE80" : v === "DOWN" ? "F87171" : "FCD34D";
      } else if (h === "IP" || h === "MAC") {
        fontColor = "93C5FD";
      } else if (h === "Nombre") {
        fontColor = "F1F5F9";
      } else if (h === "Uptime 24h") {
        const pct = parseFloat(row["Uptime 24h"]);
        fontColor = isNaN(pct) ? "CBD5E1" : pct >= 99 ? "4ADE80" : pct >= 95 ? "FCD34D" : "F87171";
      }
      ws[cellAddr].s = {
        font: { color: { rgb: fontColor }, sz: 10, name: "Calibri", bold: h === "Estado" || h === "Nombre" },
        fill: { fgColor: { rgb: rowBg }, patternType: "solid" },
        alignment: { vertical: "center", horizontal: h === "Estado" || h === "Ping (ms)" || h === "Uptime 24h" ? "center" : "left" },
        border: {
          bottom: { style: "thin", color: { rgb: "1E293B" } },
          right: { style: "thin", color: { rgb: "334155" } },
        },
      };
    });
  });

  // ── Summary sheet ──
  const total = dataRows.length;
  const up = dataRows.filter(r => r["Estado"] === "UP").length;
  const down = dataRows.filter(r => r["Estado"] === "DOWN").length;
  const noMonitor = dataRows.filter(r => !r["Monitor Kuma"]).length;
  const summaryData = [
    ["KumaMap — Resumen de nodos", ""],
    ["Mapa", mapName || "Sin nombre"],
    ["Generado", new Date().toLocaleString("es-UY")],
    ["", ""],
    ["Total nodos", total],
    ["UP", up],
    ["DOWN", down],
    ["Sin monitor", noMonitor],
    ["Uptime global", total > 0 ? `${((up / (total - noMonitor || 1)) * 100).toFixed(1)}%` : "—"],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 30 }];
  // Style summary header
  if (wsSummary["A1"]) wsSummary["A1"].s = { font: { bold: true, sz: 13, color: { rgb: "A78BFA" }, name: "Calibri" }, fill: { fgColor: { rgb: "0F0F1A" }, patternType: "solid" } };

  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");
  XLSX.utils.book_append_sheet(wb, ws, "Nodos");

  // ── Download ──
  const filename = `${(mapName || "kumamap").replace(/[^a-zA-Z0-9_\-]/g, "_")}-nodos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename, { bookType: "xlsx", compression: true });
  toast.success(`${dataRows.length} nodos exportados como XLSX`);
}
