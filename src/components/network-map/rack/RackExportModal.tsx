"use client";

import React, { useState } from "react";
import { X, FileText, FileSpreadsheet, Printer, FileDown, Download, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { apiUrl } from "@/lib/api";
import type { RackDevice } from "./rack-types";
import { TYPE_META } from "./rack-constants";

// ── WhatsApp text generator ─────────────────────────────────────────────────

function generateWhatsAppText(rackName: string, totalUnits: number, devices: RackDevice[]): string {
  const sorted = [...devices].sort((a, b) => b.unit - a.unit);
  const usedU = devices.reduce((s, d) => s + d.sizeUnits, 0);
  const date = new Date().toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  let t = `🗄️ *${rackName}*\n`;
  t += `📅 ${date}\n`;
  t += `📊 ${totalUnits}U total · ${usedU}U ocupados · ${totalUnits - usedU}U libres\n`;
  t += `━━━━━━━━━━━━━━━\n\n`;

  sorted.forEach(d => {
    const meta = TYPE_META[d.type] || TYPE_META.other;
    const uRange = d.sizeUnits > 1 ? `U${d.unit}-${d.unit + d.sizeUnits - 1}` : `U${d.unit}`;

    t += `⚪ *${d.label}*\n`;
    t += `   📍 ${uRange} · ${meta.label} · ${d.sizeUnits}U\n`;
    if (d.model) t += `   📋 Modelo: ${d.model}\n`;
    if (d.managementIp) t += `   🌐 IP: \`${d.managementIp}\`\n`;
    if (d.serial) t += `   🔢 Serie: ${d.serial}\n`;

    // Switch ports summary
    if (d.type === "switch" && d.switchPorts && d.switchPorts.length > 0) {
      const connected = d.switchPorts.filter(p => p.connected);
      const total = d.switchPorts.length;
      t += `   🔌 Puertos: ${connected.length}/${total} conectados\n`;
      connected.forEach(p => {
        const parts = [`P${p.port}`];
        if (p.speed) parts.push(p.speed);
        if (p.connectedDevice) parts.push(`→ ${p.connectedDevice}`);
        if (p.vlan) parts.push(`VLAN ${p.vlan}`);
        if (p.uplink) parts.push("⬆ UPLINK");
        if (p.isPoe) parts.push(`⚡PoE${p.poeWatts ? ` ${p.poeWatts}W` : ""}`);
        t += `      • ${parts.join(" · ")}\n`;
      });
    }

    // Patch ports summary
    if (d.type === "patchpanel" && d.ports && d.ports.length > 0) {
      const connected = d.ports.filter(p => p.connected);
      const total = d.ports.length;
      t += `   🔌 Puertos: ${connected.length}/${total} conectados\n`;
      connected.forEach(p => {
        const parts = [`P${p.port}`];
        if (p.destination) parts.push(`→ ${p.destination}`);
        if (p.connectedDevice) parts.push(`(${p.connectedDevice})`);
        if (p.cableLength) parts.push(p.cableLength);
        if (p.isPoe) parts.push("⚡PoE");
        t += `      • ${parts.join(" · ")}\n`;
      });
    }

    // Router interfaces
    if (d.type === "router" && d.routerInterfaces && d.routerInterfaces.length > 0) {
      t += `   🔌 Interfaces:\n`;
      d.routerInterfaces.forEach(iface => {
        const status = iface.connected ? "✅" : "❌";
        t += `      ${status} ${iface.name} (${iface.type})${iface.ipAddress ? ` · ${iface.ipAddress}` : ""}\n`;
      });
    }

    if (d.notes) t += `   📝 ${d.notes}\n`;
    t += "\n";
  });

  t += `━━━━━━━━━━━━━━━\n`;
  t += `_Exportado desde KumaMap_`;
  return t;
}

// ── Export Modal ──────────────────────────────────────────────────────────────

interface RackExportModalProps {
  rackName: string;
  totalUnits: number;
  devices: RackDevice[];
  onClose: () => void;
  onPng: () => void;
}

export default function RackExportModal({ rackName, totalUnits, devices, onClose, onPng }: RackExportModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const safeName = rackName.replace(/\s+/g, "_");

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const download = async (type: string) => {
    setLoading(type);
    setError(null);
    try {
      if (type === "word") {
        const res = await fetch(apiUrl("/api/rack-report"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rackName, totalUnits, devices }),
        });
        if (!res.ok) throw new Error(await res.text());
        triggerDownload(await res.blob(), `rack-${safeName}-report.docx`);
      } else if (type === "excel") {
        const res = await fetch(apiUrl("/api/rack-report-xlsx"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rackName, totalUnits, devices }),
        });
        if (!res.ok) throw new Error(await res.text());
        triggerDownload(await res.blob(), `rack-${safeName}-report.xlsx`);
      } else if (type === "pdf") {
        const res = await fetch(apiUrl("/api/rack-report-pdf"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rackName, totalUnits, devices }),
        });
        if (!res.ok) throw new Error(await res.text());
        const html = await res.text();
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 800);
        }
      } else if (type === "whatsapp") {
        const text = generateWhatsAppText(rackName, totalUnits, devices);
        // Try Web Share API first, then copy + open wa.me
        if (navigator.share) {
          await navigator.share({ text });
        } else {
          await navigator.clipboard.writeText(text);
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
        }
      } else if (type === "markdown") {
        const sorted = [...devices].sort((a, b) => b.unit - a.unit);
        const usedU = devices.reduce((s, d) => s + d.sizeUnits, 0);
        let md = `# ${rackName}\n\n`;
        md += `**Total:** ${totalUnits}U | **Ocupados:** ${usedU}U | **Libres:** ${totalUnits - usedU}U\n\n`;
        md += `**Exportado:** ${new Date().toLocaleDateString("es-UY")}\n\n`;
        md += `## Equipos\n\n| U | Nombre | Tipo | Modelo | IP | Puertos | Notas |\n|---|--------|------|--------|----|---------|---------|\n`;
        sorted.forEach(d => {
          const meta = TYPE_META[d.type] || TYPE_META.other;
          const connPorts = d.type === "patchpanel"
            ? `${(d.ports || []).filter(p => p.connected).length}/${d.portCount || 24}`
            : d.type === "switch"
            ? `${(d.switchPorts || []).filter(p => p.connected).length}/${d.portCount || 24}`
            : "—";
          md += `| U${d.unit}${d.sizeUnits > 1 ? `-${d.unit + d.sizeUnits - 1}` : ""} | ${d.label} | ${meta.label} | ${d.model || ""} | ${d.managementIp || ""} | ${connPorts} | ${d.notes || ""} |\n`;
        });
        triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), `rack-${safeName}-report.md`);
      }
      setDone(type);
      setTimeout(() => { setDone(null); onClose(); }, 900);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  type ExportCardProps = {
    type: string; icon: React.ElementType; label: string; ext: string;
    desc: string; accentColor: string; glowColor: string; bgGradient: string;
  };

  const ExportCard = ({ type, icon: Icon, label, ext, desc, accentColor, glowColor, bgGradient }: ExportCardProps) => {
    const isLoading = loading === type;
    const isDone = done === type;
    return (
      <button
        onClick={() => download(type)}
        disabled={loading !== null}
        className="relative group rounded-xl p-4 text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
        style={{ background: bgGradient, border: `1px solid ${accentColor}33`, boxShadow: isLoading ? `0 0 20px ${glowColor}` : "none" }}
        onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = `0 0 16px ${glowColor}`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = isLoading ? `0 0 20px ${glowColor}` : "none"; }}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 60%)` }} />
        <div className="flex items-start gap-3 relative z-10">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}40` }}>
            {isLoading
              ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accentColor} transparent transparent transparent` }} />
              : isDone
              ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={accentColor} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              : <Icon className="w-4 h-4" style={{ color: accentColor }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-white/90">{label}</span>
              <span className="text-[10px] font-mono font-medium px-1 py-0.5 rounded" style={{ background: `${accentColor}20`, color: accentColor }}>{ext}</span>
            </div>
            <div className="text-xs text-white/45 mt-0.5 leading-tight">{desc}</div>
          </div>
        </div>
      </button>
    );
  };

  const usedUnits = devices.reduce((s, d) => s + d.sizeUnits, 0);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="rounded-2xl w-[500px]"
        style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #141420 50%, #0f0f1a 100%)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 0 14px rgba(99,102,241,0.4)" }}>
              <FileDown className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white/95 leading-none">Exportar Datos del Rack</h3>
              <p className="text-[11px] text-white/40 mt-0.5">{rackName} · {devices.length} equipos · {usedUnits}/{totalUnits}U</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <ExportCard type="word"     icon={FileText}        label="Word"     ext=".docx" desc="Documento profesional con tablas y formato"    accentColor="#3b82f6" glowColor="rgba(59,130,246,0.25)"  bgGradient="linear-gradient(135deg,#1e2a3a,#151f2d)" />
            <ExportCard type="excel"    icon={FileSpreadsheet} label="Excel"    ext=".xlsx" desc="Planilla multi-hoja con datos y estadísticas"   accentColor="#22c55e" glowColor="rgba(34,197,94,0.25)"   bgGradient="linear-gradient(135deg,#1a2e1f,#13201a)" />
            <ExportCard type="pdf"      icon={Printer}         label="PDF"      ext="print" desc="Abre el reporte listo para imprimir o guardar"  accentColor="#f97316" glowColor="rgba(249,115,22,0.25)"  bgGradient="linear-gradient(135deg,#2e1f10,#201508)" />
            <ExportCard type="markdown" icon={FileDown}         label="Markdown" ext=".md"  desc="Texto plano con tablas Markdown estándar"       accentColor="#a855f7" glowColor="rgba(168,85,247,0.25)"  bgGradient="linear-gradient(135deg,#231430,#180d25)" />
          </div>

          {/* WhatsApp — full width */}
          <button
            onClick={() => download("whatsapp")}
            disabled={loading !== null}
            className="relative group w-full rounded-xl p-3.5 text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
            style={{ background: "linear-gradient(135deg,#1a2e1f,#13201a)", border: "1px solid rgba(37,211,102,0.2)" }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px rgba(37,211,102,0.2)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = loading === "whatsapp" ? "0 0 20px rgba(37,211,102,0.25)" : "none"; }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: "linear-gradient(135deg,rgba(37,211,102,0.06) 0%, transparent 60%)" }} />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.3)" }}>
                {loading === "whatsapp"
                  ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#25d366 transparent transparent transparent" }} />
                  : done === "whatsapp"
                  ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#25d366" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : <MessageCircle className="w-3.5 h-3.5" style={{ color: "#25d366" }} />}
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-white/80">WhatsApp</span>
                  <span className="text-[10px] font-mono font-medium px-1 py-0.5 rounded" style={{ background: "rgba(37,211,102,0.15)", color: "#25d366" }}>compartir</span>
                </div>
                <div className="text-xs text-white/40">Texto estilizado con emojis listo para enviar por WhatsApp</div>
              </div>
            </div>
          </button>

          {/* PNG — full width */}
          <button
            onClick={onPng}
            disabled={loading !== null}
            className="relative group w-full rounded-xl p-3.5 text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
            style={{ background: "linear-gradient(135deg,#1e1e28,#18181f)", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.03) 0%, transparent 60%)" }} />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Download className="w-3.5 h-3.5 text-white/60" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-white/80">Imagen PNG</span>
                  <span className="text-[10px] font-mono font-medium px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>.png</span>
                </div>
                <div className="text-xs text-white/40">Captura visual del rack como imagen de alta resolución</div>
              </div>
            </div>
          </button>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs text-red-400" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
              <span className="leading-snug">{error}</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
