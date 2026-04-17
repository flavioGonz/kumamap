"use client";

import React, { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { safeJsonParse } from "@/lib/error-handler";
import { hapticTap, hapticMedium, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/components/mobile/MobileToast";
import PageTransition from "@/components/mobile/PageTransition";
import type { NodeCustomData } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatchPort {
  port: number; label: string; connected: boolean;
  destination?: string; cableLength?: string; cableColor?: string;
  isPoe?: boolean; poeType?: string; connectedDevice?: string; macAddress?: string; notes?: string;
}

interface SwitchPort {
  port: number; label: string; connected: boolean;
  speed?: string; isPoe?: boolean; poeWatts?: number;
  connectedDevice?: string; macAddress?: string; vlan?: number; uplink?: boolean; notes?: string;
}

interface RouterInterface {
  id: string; name: string; type: string; ipAddress?: string; connected: boolean; notes?: string;
}

interface PbxExtension {
  extension: string; name: string; ipPhone?: string; macAddress?: string;
  username?: string; model?: string; location?: string; notes?: string;
  monitorId?: number | null;
}

interface PbxTrunkLine {
  id: string; provider: string; number: string;
  type: string; channels?: number; sipServer?: string;
  codec?: string; status?: string; notes?: string;
}

interface RackDevice {
  id: string; unit: number; sizeUnits: number; label: string; type: string;
  color?: string; monitorId?: number | null; model?: string; serial?: string;
  managementIp?: string; notes?: string; portCount?: number; isPoeCapable?: boolean;
  ports?: PatchPort[]; switchPorts?: SwitchPort[]; routerInterfaces?: RouterInterface[];
  // PBX
  pbxExtensions?: PbxExtension[]; pbxTrunkLines?: PbxTrunkLine[];
  // Fiber tray
  fiberTrayType?: string; fiberCapacity?: number; fiberConnectorType?: string;
  fiberMode?: string; spliceCount?: number;
  // PDU
  pduHasBreaker?: boolean; pduInputCount?: number;
  // Cable organizer
  mountedItems?: string;
  // Cable length (for patch panels etc)
  cableLength?: number;
}

interface KumaMonitor {
  id: number; name: string; status: number; ping: number | null; msg: string;
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  server: { label: "Servidor", color: "#3b82f6" },
  switch: { label: "Switch", color: "#10b981" },
  patchpanel: { label: "Patch Panel", color: "#8b5cf6" },
  ups: { label: "UPS", color: "#f59e0b" },
  router: { label: "Router", color: "#ef4444" },
  pdu: { label: "PDU", color: "#f97316" },
  pbx: { label: "PBX", color: "#06b6d4" },
  "tray-fiber": { label: "Fibra", color: "#d946ef" },
  "tray-1u": { label: "Bandeja 1U", color: "#52525b" },
  "tray-2u": { label: "Bandeja 2U", color: "#52525b" },
  "cable-organizer": { label: "Organizador", color: "#78716c" },
  other: { label: "Otro", color: "#6b7280" },
};

const STATUS_COLORS: Record<number, string> = { 0: "#ef4444", 1: "#22c55e", 2: "#f59e0b", 3: "#8b5cf6" };

const SPEED_COLORS: Record<string, string> = { "10": "#52525b", "100": "#3b82f6", "1G": "#10b981", "10G": "#f59e0b" };

// ── WhatsApp text generator ──────────────────────────────────────────────────

function generateWhatsAppText(rackName: string, totalUnits: number, devices: RackDevice[], monitors: Map<number, KumaMonitor>): string {
  const sorted = [...devices].sort((a, b) => b.unit - a.unit);
  const usedU = devices.reduce((s, d) => s + d.sizeUnits, 0);
  const date = new Date().toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  let t = `🗄️ *${rackName}*\n`;
  t += `📅 ${date}\n`;
  t += `📊 ${totalUnits}U total · ${usedU}U ocupados · ${totalUnits - usedU}U libres\n`;
  t += `━━━━━━━━━━━━━━━\n\n`;

  sorted.forEach(d => {
    const meta = TYPE_META[d.type] || TYPE_META.other;
    const mon = d.monitorId ? monitors.get(d.monitorId) : null;
    const statusEmoji = mon ? (mon.status === 1 ? "🟢" : mon.status === 0 ? "🔴" : "🟡") : "⚪";
    const uRange = d.sizeUnits > 1 ? `U${d.unit}-${d.unit + d.sizeUnits - 1}` : `U${d.unit}`;

    t += `${statusEmoji} *${d.label}*\n`;
    t += `   📍 ${uRange} · ${meta.label} · ${d.sizeUnits}U\n`;
    if (d.model) t += `   📋 Modelo: ${d.model}\n`;
    if (d.managementIp) t += `   🌐 IP: \`${d.managementIp}\`\n`;
    if (d.serial) t += `   🔢 Serie: ${d.serial}\n`;
    if (mon) {
      t += `   📶 ${mon.status === 1 ? "UP" : mon.status === 0 ? "DOWN" : "PENDING"}`;
      if (mon.ping != null) t += ` · ${mon.ping}ms`;
      t += "\n";
    }

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
    if (d.routerInterfaces && d.routerInterfaces.length > 0) {
      t += `   🔌 Interfaces:\n`;
      d.routerInterfaces.forEach(iface => {
        const status = iface.connected ? "✅" : "❌";
        t += `      ${status} ${iface.name} (${iface.type})${iface.ipAddress ? ` · ${iface.ipAddress}` : ""}\n`;
      });
    }

    // PBX extensions
    if (d.pbxExtensions && d.pbxExtensions.length > 0) {
      t += `   📞 Extensiones: ${d.pbxExtensions.length}\n`;
      d.pbxExtensions.forEach(ext => {
        const parts = [`Ext ${ext.extension}`, ext.name];
        if (ext.ipPhone) parts.push(`IP: ${ext.ipPhone}`);
        if (ext.model) parts.push(ext.model);
        if (ext.location) parts.push(ext.location);
        t += `      • ${parts.join(" · ")}\n`;
      });
    }

    // PBX trunk lines
    if (d.pbxTrunkLines && d.pbxTrunkLines.length > 0) {
      t += `   📡 Troncales: ${d.pbxTrunkLines.length}\n`;
      d.pbxTrunkLines.forEach(tr => {
        const statusEmoji = tr.status === "active" ? "✅" : tr.status === "backup" ? "🟡" : "❌";
        const parts = [tr.provider, tr.number, tr.type];
        if (tr.channels) parts.push(`${tr.channels}ch`);
        t += `      ${statusEmoji} ${parts.join(" · ")}\n`;
      });
    }

    // Fiber tray
    if (d.type === "tray-fiber" && (d.fiberCapacity || d.fiberConnectorType)) {
      t += `   🔮 Fibra:`;
      if (d.fiberCapacity) t += ` ${d.fiberCapacity} fibras`;
      if (d.fiberConnectorType) t += ` · ${d.fiberConnectorType}`;
      if (d.fiberMode) t += ` · ${d.fiberMode}`;
      if (d.spliceCount) t += ` · ${d.spliceCount} empalmes`;
      t += "\n";
    }

    // PDU
    if (d.type === "pdu") {
      const pduParts: string[] = [];
      if (d.pduInputCount) pduParts.push(`${d.pduInputCount} entradas`);
      if (d.pduHasBreaker) pduParts.push("Con breaker");
      if (d.portCount) pduParts.push(`${d.portCount} tomas`);
      if (pduParts.length > 0) t += `   ⚡ PDU: ${pduParts.join(" · ")}\n`;
    }

    // Cable organizer
    if (d.type === "cable-organizer" && d.mountedItems) {
      t += `   🔧 Contenido: ${d.mountedItems}\n`;
    }

    if (d.notes) t += `   📝 ${d.notes}\n`;
    t += "\n";
  });

  t += `━━━━━━━━━━━━━━━\n`;
  t += `_Exportado desde KumaMap_`;
  return t;
}

// ── Port viewer sub-components ───────────────────────────────────────────────

function MobileSwitchPortGrid({ ports }: { ports: SwitchPort[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null ? ports.find(p => p.port === selected) : null;

  return (
    <div>
      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
        Puertos Switch ({ports.filter(p => p.connected).length}/{ports.length} conectados)
      </div>

      {/* Port grid */}
      <div className="flex flex-wrap gap-1 mb-2">
        {ports.map(p => {
          const isSelected = selected === p.port;
          const speedColor = p.speed ? SPEED_COLORS[p.speed] || "#22c55e" : "#22c55e";
          return (
            <button
              key={p.port}
              onClick={() => { setSelected(isSelected ? null : p.port); hapticTap(); }}
              className="relative flex items-center justify-center transition-all active:scale-90"
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: isSelected ? "rgba(59,130,246,0.2)"
                  : p.connected ? `${speedColor}15` : "rgba(255,255,255,0.02)",
                border: `1.5px solid ${isSelected ? "#3b82f6"
                  : p.connected ? `${speedColor}40` : "rgba(255,255,255,0.06)"}`,
                fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                color: isSelected ? "#93c5fd" : p.connected ? speedColor : "#333",
              }}
            >
              {p.port}
              {p.uplink && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: "#60a5fa" }} />
              )}
              {p.isPoe && p.connected && (
                <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected port detail */}
      {sel && (
        <div
          className="rounded-xl p-2.5 space-y-1.5"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", animation: "expand-in 0.2s ease-out" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold text-[#6ee7b7]">Puerto {sel.port}</span>
            <div className="h-2 w-2 rounded-full" style={{ background: sel.connected ? "#22c55e" : "#555" }} />
            <span className="text-[9px] text-[#555]">{sel.connected ? "Conectado" : "Libre"}</span>
            {sel.speed && (
              <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded" style={{ background: `${SPEED_COLORS[sel.speed]}22`, color: SPEED_COLORS[sel.speed] }}>
                {sel.speed}
              </span>
            )}
            {sel.uplink && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>UPLINK</span>}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sel.label && sel.label !== String(sel.port) && <MiniDetail label="Etiqueta" value={sel.label} />}
            {sel.connectedDevice && <MiniDetail label="Dispositivo" value={sel.connectedDevice} />}
            {sel.vlan && <MiniDetail label="VLAN" value={String(sel.vlan)} mono />}
            {sel.macAddress && <MiniDetail label="MAC" value={sel.macAddress} mono />}
            {sel.isPoe && <MiniDetail label="PoE" value={sel.poeWatts ? `${sel.poeWatts}W` : "Activo"} />}
            {sel.notes && <MiniDetail label="Notas" value={sel.notes} span2 />}
          </div>
        </div>
      )}

      {/* Speed legend */}
      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        {Object.entries(SPEED_COLORS).map(([speed, color]) => (
          <span key={speed} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="text-[8px] text-[#444]">{speed}</span>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "#60a5fa" }} />
          <span className="text-[8px] text-[#444]">Uplink</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />
          <span className="text-[8px] text-[#444]">PoE</span>
        </span>
      </div>
    </div>
  );
}

function MobilePatchPortGrid({ ports }: { ports: PatchPort[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null ? ports.find(p => p.port === selected) : null;

  return (
    <div>
      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="8" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="16" cy="12" r="1" /></svg>
        Puertos Patch ({ports.filter(p => p.connected).length}/{ports.length} conectados)
      </div>

      {/* Port grid */}
      <div className="flex flex-wrap gap-1 mb-2">
        {ports.map(p => {
          const isSelected = selected === p.port;
          const portColor = p.cableColor || "#8b5cf6";
          return (
            <button
              key={p.port}
              onClick={() => { setSelected(isSelected ? null : p.port); hapticTap(); }}
              className="relative flex items-center justify-center transition-all active:scale-90"
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: isSelected ? "rgba(59,130,246,0.2)"
                  : p.connected ? `${portColor}15` : "rgba(255,255,255,0.02)",
                border: `1.5px solid ${isSelected ? "#3b82f6"
                  : p.connected ? `${portColor}40` : "rgba(255,255,255,0.06)"}`,
                fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                color: isSelected ? "#93c5fd" : p.connected ? portColor : "#333",
              }}
            >
              {p.port}
              {p.isPoe && p.connected && (
                <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected port detail */}
      {sel && (
        <div
          className="rounded-xl p-2.5 space-y-1.5"
          style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)", animation: "expand-in 0.2s ease-out" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold text-[#c4b5fd]">Puerto {sel.port}</span>
            <div className="h-2 w-2 rounded-full" style={{ background: sel.connected ? "#22c55e" : "#555" }} />
            <span className="text-[9px] text-[#555]">{sel.connected ? "Conectado" : "Libre"}</span>
            {sel.cableColor && <span className="w-3 h-3 rounded-full" style={{ background: sel.cableColor, boxShadow: `0 0 4px ${sel.cableColor}66` }} />}
            {sel.isPoe && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>PoE {sel.poeType || ""}</span>}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sel.label && sel.label !== String(sel.port) && sel.label !== `P${sel.port}` && <MiniDetail label="Etiqueta" value={sel.label} />}
            {sel.destination && <MiniDetail label="Destino" value={sel.destination} />}
            {sel.connectedDevice && <MiniDetail label="Dispositivo" value={sel.connectedDevice} />}
            {sel.cableLength && <MiniDetail label="Cable" value={sel.cableLength} />}
            {sel.macAddress && <MiniDetail label="MAC" value={sel.macAddress} mono />}
            {sel.notes && <MiniDetail label="Notas" value={sel.notes} span2 />}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileRouterInterfaces({ interfaces }: { interfaces: RouterInterface[] }) {
  return (
    <div>
      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
        Interfaces ({interfaces.filter(i => i.connected).length}/{interfaces.length} activas)
      </div>
      <div className="space-y-1">
        {interfaces.map(iface => {
          const typeColors: Record<string, string> = { WAN: "#ef4444", LAN: "#22c55e", MGMT: "#f59e0b", DMZ: "#8b5cf6", VPN: "#06b6d4", other: "#6b7280" };
          const color = typeColors[iface.type] || typeColors.other;
          return (
            <div key={iface.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="h-2 w-2 rounded-full" style={{ background: iface.connected ? "#22c55e" : "#555", boxShadow: iface.connected ? "0 0 4px rgba(34,197,94,0.5)" : "none" }} />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                {iface.type}
              </span>
              <span className="text-[10px] font-mono font-bold text-[#aaa]">{iface.name}</span>
              {iface.ipAddress && <span className="text-[9px] font-mono text-[#60a5fa]">{iface.ipAddress}</span>}
              {iface.notes && <span className="text-[8px] text-[#444] truncate">{iface.notes}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobilePbxExtensions({ extensions, monitors }: { extensions: PbxExtension[]; monitors: Map<number, KumaMonitor> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const sel = selected !== null ? extensions.find(e => e.extension === selected) : null;

  return (
    <div>
      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
        Extensiones ({extensions.length})
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {extensions.map(ext => {
          const isSelected = selected === ext.extension;
          const mon = ext.monitorId ? monitors.get(ext.monitorId) : null;
          const statusColor = mon ? (mon.status === 1 ? "#22c55e" : mon.status === 0 ? "#ef4444" : "#f59e0b") : undefined;
          return (
            <button
              key={ext.extension}
              onClick={() => { setSelected(isSelected ? null : ext.extension); hapticTap(); }}
              className="relative flex items-center justify-center transition-all active:scale-90"
              style={{
                minWidth: 36, height: 28, borderRadius: 6, padding: "0 6px",
                background: isSelected ? "rgba(6,182,212,0.2)" : "rgba(255,255,255,0.02)",
                border: `1.5px solid ${isSelected ? "#06b6d4" : "rgba(255,255,255,0.06)"}`,
                fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                color: isSelected ? "#67e8f9" : "#06b6d4",
              }}
            >
              {ext.extension}
              {statusColor && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: statusColor }} />
              )}
            </button>
          );
        })}
      </div>

      {sel && (
        <div
          className="rounded-xl p-2.5 space-y-1.5"
          style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", animation: "expand-in 0.2s ease-out" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold text-[#67e8f9]">Ext {sel.extension}</span>
            <span className="text-[9px] text-[#aaa]">{sel.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sel.ipPhone && <MiniDetail label="IP Teléfono" value={sel.ipPhone} mono />}
            {sel.model && <MiniDetail label="Modelo" value={sel.model} />}
            {sel.macAddress && <MiniDetail label="MAC" value={sel.macAddress} mono />}
            {sel.location && <MiniDetail label="Ubicación" value={sel.location} />}
            {sel.notes && <MiniDetail label="Notas" value={sel.notes} span2 />}
          </div>
        </div>
      )}
    </div>
  );
}

function MobilePbxTrunkLines({ trunks }: { trunks: PbxTrunkLine[] }) {
  return (
    <div>
      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
        Troncales ({trunks.length})
      </div>
      <div className="space-y-1">
        {trunks.map(tr => {
          const statusColors: Record<string, string> = { active: "#22c55e", inactive: "#ef4444", backup: "#f59e0b" };
          const color = tr.status ? statusColors[tr.status] || "#6b7280" : "#6b7280";
          return (
            <div key={tr.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}66` }} />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(6,182,212,0.1)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.2)" }}>
                {tr.type}
              </span>
              <span className="text-[10px] font-bold text-[#aaa]">{tr.provider}</span>
              <span className="text-[9px] font-mono text-[#67e8f9]">{tr.number}</span>
              {tr.channels && <span className="text-[8px] text-[#555]">{tr.channels}ch</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileFiberTrayInfo({ device }: { device: RackDevice }) {
  return (
    <div>
      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d946ef" strokeWidth="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
        Fibra Óptica
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {device.fiberTrayType && <MiniDetail label="Tipo" value={device.fiberTrayType} />}
        {device.fiberCapacity && <MiniDetail label="Capacidad" value={`${device.fiberCapacity} fibras`} />}
        {device.fiberConnectorType && <MiniDetail label="Conector" value={device.fiberConnectorType} />}
        {device.fiberMode && <MiniDetail label="Modo" value={device.fiberMode} />}
        {device.spliceCount != null && <MiniDetail label="Empalmes" value={`${device.spliceCount}`} />}
      </div>
    </div>
  );
}

function MobilePduInfo({ device }: { device: RackDevice }) {
  return (
    <div>
      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
        PDU
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {device.pduInputCount != null && <MiniDetail label="Entradas" value={`${device.pduInputCount}`} />}
        <MiniDetail label="Breaker" value={device.pduHasBreaker ? "Sí" : "No"} />
        {device.portCount && <MiniDetail label="Tomas" value={`${device.portCount}`} />}
      </div>
    </div>
  );
}

function MiniDetail({ label, value, mono, span2 }: { label: string; value: string; mono?: boolean; span2?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${span2 ? "col-span-2" : ""}`} style={{ background: "rgba(255,255,255,0.03)" }}>
      <div className="text-[7px] uppercase tracking-wider text-[#444]">{label}</div>
      <div className={`text-[10px] text-[#aaa] ${mono ? "font-mono" : ""} break-all`}>{value}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

function MobileRackViewer() {
  const searchParams = useSearchParams();
  const mapId = searchParams.get("mapId") || "";
  const nodeId = searchParams.get("nodeId") || "";
  const { show } = useToast();

  const [rackName, setRackName] = useState("");
  const [totalUnits, setTotalUnits] = useState(0);
  const [devices, setDevices] = useState<RackDevice[]>([]);
  const [monitors, setMonitors] = useState<Map<number, KumaMonitor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!mapId) return;
    try {
      const [mapRes, kumaRes] = await Promise.all([
        fetch(apiUrl(`/api/maps/${mapId}`)),
        fetch(apiUrl("/api/kuma")),
      ]);
      if (mapRes.ok) {
        const data = await mapRes.json();
        const node = (data.nodes || []).find((n: any) => n.id === nodeId);
        if (node) {
          const cd = safeJsonParse<NodeCustomData>(node.custom_data);
          setRackName(cd.rackName || node.label || "Rack");
          setTotalUnits(cd.totalUnits || 24);
          setDevices((cd.devices as any as RackDevice[]) || []);
        }
      }
      if (kumaRes.ok) {
        const data = await kumaRes.json();
        const monMap = new Map<number, KumaMonitor>();
        (data.monitors || []).forEach((m: KumaMonitor) => monMap.set(m.id, m));
        setMonitors(monMap);
      }
    } catch {}
    finally { setLoading(false); }
  }, [mapId, nodeId]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  const occMap = useMemo(() => {
    const m = new Map<number, RackDevice>();
    devices.forEach((d) => { for (let i = 0; i < d.sizeUnits; i++) m.set(d.unit + i, d); });
    return m;
  }, [devices]);

  const stats = useMemo(() => {
    let up = 0, down = 0, unmonitored = 0;
    devices.forEach((d) => {
      if (!d.monitorId) { unmonitored++; return; }
      const m = monitors.get(d.monitorId);
      if (m?.status === 1) up++; else if (m?.status === 0) down++; else unmonitored++;
    });
    const occupiedUnits = devices.reduce((sum, d) => sum + d.sizeUnits, 0);
    return { up, down, unmonitored, occupiedUnits, freeUnits: totalUnits - occupiedUnits };
  }, [devices, monitors, totalUnits]);

  const shareWhatsApp = useCallback(() => {
    hapticMedium();
    const text = generateWhatsAppText(rackName, totalUnits, devices, monitors);

    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        // Fallback to WhatsApp URL
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
    show("Compartiendo por WhatsApp", "success");
    hapticSuccess();
  }, [rackName, totalUnits, devices, monitors, show]);

  const copyToClipboard = useCallback(() => {
    hapticTap();
    const text = generateWhatsAppText(rackName, totalUnits, devices, monitors);
    navigator.clipboard.writeText(text).then(() => {
      show("Copiado al portapapeles", "success");
      hapticSuccess();
    }).catch(() => show("Error al copiar", "error"));
  }, [rackName, totalUnits, devices, monitors, show]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 px-3 py-2.5 flex items-center gap-2" style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link
          href={mapId ? `/mobile/map?id=${mapId}` : "/mobile"}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] active:scale-95"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-bold text-[#ededed] truncate">{rackName}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-[#555]">{totalUnits}U · {devices.length} equipos</span>
            {stats.down > 0 && <span className="text-[9px] font-bold text-red-400">{stats.down} DOWN</span>}
          </div>
        </div>
        {/* Share WhatsApp */}
        <button onClick={shareWhatsApp} className="h-8 w-8 rounded-xl flex items-center justify-center active:scale-90 transition-all" style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#25d366">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </button>
        {/* Copy */}
        <button onClick={copyToClipboard} className="h-8 w-8 rounded-xl flex items-center justify-center text-[#888] active:scale-90 transition-all" style={{ background: "rgba(255,255,255,0.04)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
      </header>

      {/* Stats bar */}
      <div className="px-3 py-2.5 flex gap-2">
        <StatPill label="UP" value={stats.up} color="#22c55e" />
        <StatPill label="DOWN" value={stats.down} color="#ef4444" />
        <StatPill label="Libre" value={`${stats.freeUnits}U`} color="#555" />
        <div className="flex-1" />
        <span className="text-[9px] text-[#444] self-center">
          {Math.round((stats.occupiedUnits / totalUnits) * 100)}% ocupado
        </span>
      </div>

      {/* Occupancy bar */}
      <div className="mx-3 h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(stats.occupiedUnits / totalUnits) * 100}%`, background: stats.down > 0 ? "linear-gradient(90deg, #22c55e, #ef4444)" : "#22c55e" }} />
      </div>

      {/* Rack visual */}
      <div className="px-3 mb-3">
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {Array.from({ length: totalUnits }, (_, i) => totalUnits - i).map((u) => {
            const dev = occMap.get(u);
            const isTop = dev && dev.unit + dev.sizeUnits - 1 === u;
            if (dev && !isTop) return null;

            if (!dev) {
              return (
                <div key={u} className="flex items-center h-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <span className="w-7 text-center text-[8px] font-mono text-[#333]">{u}</span>
                  <div className="flex-1 h-full" style={{ background: "rgba(255,255,255,0.01)" }} />
                </div>
              );
            }

            const meta = TYPE_META[dev.type] || TYPE_META.other;
            const color = dev.color || meta.color;
            const mon = dev.monitorId ? monitors.get(dev.monitorId) : null;
            const statusColor = mon ? (STATUS_COLORS[mon.status] || "#6b7280") : undefined;
            const h = dev.sizeUnits * 24;

            return (
              <button
                key={u}
                onClick={() => { setExpandedDevice(expandedDevice === dev.id ? null : dev.id); hapticTap(); }}
                className="w-full flex items-stretch text-left active:opacity-80 transition-all"
                style={{ height: h, borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="w-7 flex items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.3)" }}>
                  <span className="text-[8px] font-mono text-[#444]">{dev.unit}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 px-2.5 min-w-0" style={{ background: `${color}12`, borderLeft: `3px solid ${color}` }}>
                  {statusColor && (
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: statusColor, boxShadow: mon?.status === 0 ? `0 0 6px ${statusColor}` : "none" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-[#ddd] truncate">{dev.label}</div>
                    {dev.sizeUnits >= 2 && (
                      <div className="text-[8px] text-[#555] truncate">{meta.label}{dev.model ? ` · ${dev.model}` : ""}</div>
                    )}
                  </div>
                  <span className="text-[8px] font-mono text-[#444] shrink-0">{dev.sizeUnits}U</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Device detail cards */}
      <div className="px-3 pb-20 space-y-2">
        <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider px-1">Equipos</div>

        {[...devices].sort((a, b) => b.unit - a.unit).map((dev) => {
          const meta = TYPE_META[dev.type] || TYPE_META.other;
          const color = dev.color || meta.color;
          const mon = dev.monitorId ? monitors.get(dev.monitorId) : null;
          const statusColor = mon ? (STATUS_COLORS[mon.status] || "#6b7280") : undefined;
          const isExpanded = expandedDevice === dev.id;

          return (
            <div key={dev.id}>
              <button
                onClick={() => { setExpandedDevice(isExpanded ? null : dev.id); hapticTap(); }}
                className="w-full rounded-2xl px-3.5 py-3 text-left active:scale-[0.98] transition-all"
                style={{
                  background: mon?.status === 0 ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${mon?.status === 0 ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
                    <span className="text-[10px] font-bold" style={{ color }}>{dev.unit}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#ddd] truncate">{dev.label}</span>
                      {statusColor && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${statusColor}22`, color: statusColor }}>
                          {mon!.status === 1 ? "UP" : mon!.status === 0 ? "DOWN" : "PEND"}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#555] truncate">
                      {meta.label} · U{dev.unit}-{dev.unit + dev.sizeUnits - 1} · {dev.sizeUnits}U
                      {dev.model ? ` · ${dev.model}` : ""}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"
                    className="shrink-0 transition-transform" style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mx-2 mt-1 rounded-xl p-3 space-y-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.04)", animation: "expand-in 0.2s ease-out" }}>
                  {/* Basic details */}
                  <div className="space-y-1.5">
                    {dev.managementIp && <DetailRow label="IP Gestión" value={dev.managementIp} mono />}
                    {dev.model && <DetailRow label="Modelo" value={dev.model} />}
                    {dev.serial && <DetailRow label="Serie" value={dev.serial} mono />}
                    {mon?.ping != null && <DetailRow label="Latencia" value={`${mon.ping}ms`} />}
                    {mon?.msg && <DetailRow label="Mensaje" value={mon.msg} />}
                    {dev.portCount && <DetailRow label="Puertos" value={`${dev.portCount}`} />}
                    {dev.isPoeCapable && <DetailRow label="PoE" value="Sí" />}
                    {dev.notes && <DetailRow label="Notas" value={dev.notes} />}
                  </div>

                  {/* Switch ports */}
                  {dev.switchPorts && dev.switchPorts.length > 0 && (
                    <MobileSwitchPortGrid ports={dev.switchPorts} />
                  )}

                  {/* Patch panel ports */}
                  {dev.ports && dev.ports.length > 0 && (
                    <MobilePatchPortGrid ports={dev.ports} />
                  )}

                  {/* Router interfaces */}
                  {dev.routerInterfaces && dev.routerInterfaces.length > 0 && (
                    <MobileRouterInterfaces interfaces={dev.routerInterfaces} />
                  )}

                  {/* PBX extensions */}
                  {dev.pbxExtensions && dev.pbxExtensions.length > 0 && (
                    <MobilePbxExtensions extensions={dev.pbxExtensions} monitors={monitors} />
                  )}

                  {/* PBX trunk lines */}
                  {dev.pbxTrunkLines && dev.pbxTrunkLines.length > 0 && (
                    <MobilePbxTrunkLines trunks={dev.pbxTrunkLines} />
                  )}

                  {/* Fiber tray */}
                  {dev.type === "tray-fiber" && (dev.fiberCapacity || dev.fiberConnectorType || dev.fiberMode || dev.fiberTrayType) && (
                    <MobileFiberTrayInfo device={dev} />
                  )}

                  {/* PDU */}
                  {dev.type === "pdu" && (dev.pduInputCount != null || dev.pduHasBreaker != null) && (
                    <MobilePduInfo device={dev} />
                  )}

                  {/* Cable organizer */}
                  {dev.type === "cable-organizer" && dev.mountedItems && (
                    <div>
                      <div className="text-[9px] text-[#555] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2.5"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" /></svg>
                        Organizador
                      </div>
                      <MiniDetail label="Contenido" value={dev.mountedItems} span2 />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes expand-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
    </PageTransition>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-[#555]">{label}</span>
      <span className={`text-[10px] text-[#aaa] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="px-2.5 py-1 rounded-lg flex items-center gap-1.5" style={{ background: `${color}11`, border: `1px solid ${color}22` }}>
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[9px] font-bold" style={{ color }}>{value}</span>
      <span className="text-[8px] text-[#555]">{label}</span>
    </div>
  );
}

export default function MobileRackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </div>
    }>
      <MobileRackViewer />
    </Suspense>
  );
}
