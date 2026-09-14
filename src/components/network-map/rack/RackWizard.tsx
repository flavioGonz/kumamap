"use client";

import { useState, useMemo } from "react";
import { X, Server, Network, Zap, Cable, Inbox, Router, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { TYPE_META } from "./rack-constants";
import { RackDevice } from "./rack-types";

// ── Rack Wizard ──────────────────────────────────────────────────────────────

type WizardStep = "type" | "structure" | "network" | "power" | "extras" | "review";

interface WizardConfig {
  rackType: "network" | "server" | "mixed" | "telecom";
  hasPatchPanels: boolean;
  patchPanelCount: number;
  patchPanelPorts: number;
  hasSwitches: boolean;
  switchCount: number;
  switchPorts: number;
  switchModel: string;
  hasRouters: boolean;
  routerCount: number;
  routerModel: string;
  hasServers: boolean;
  serverCount: number;
  serverSize: number;
  serverModel: string;
  hasUPS: boolean;
  upsSize: number;
  upsModel: string;
  hasPDU: boolean;
  pduCount: number;
  hasFiberTray: boolean;
  fiberTrayCount: number;
  hasCableOrganizer: boolean;
  cableOrganizerCount: number;
  hasTray: boolean;
  trayCount: number;
}

const defaultWizardConfig: WizardConfig = {
  rackType: "network",
  hasPatchPanels: true, patchPanelCount: 2, patchPanelPorts: 24,
  hasSwitches: true, switchCount: 1, switchPorts: 24, switchModel: "",
  hasRouters: false, routerCount: 1, routerModel: "",
  hasServers: false, serverCount: 1, serverSize: 2, serverModel: "",
  hasUPS: false, upsSize: 2, upsModel: "",
  hasPDU: false, pduCount: 1,
  hasFiberTray: false, fiberTrayCount: 1,
  hasCableOrganizer: true, cableOrganizerCount: 2,
  hasTray: false, trayCount: 1,
};

export default function RackWizard({ totalUnits, existingDevices, onComplete, onClose }: {
  totalUnits: number;
  existingDevices: RackDevice[];
  onComplete: (devices: RackDevice[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizardStep>("type");
  const [config, setConfig] = useState<WizardConfig>(defaultWizardConfig);

  const steps: { id: WizardStep; label: string }[] = [
    { id: "type", label: "Tipo" },
    { id: "structure", label: "Estructura" },
    { id: "network", label: "Red" },
    { id: "power", label: "Energía" },
    { id: "extras", label: "Extras" },
    { id: "review", label: "Resumen" },
  ];

  const stepIdx = steps.findIndex(s => s.id === step);
  const canNext = stepIdx < steps.length - 1;
  const canPrev = stepIdx > 0;

  const upd = (partial: Partial<WizardConfig>) => setConfig(c => ({ ...c, ...partial }));

  // Auto-configure based on rack type
  const handleTypeSelect = (type: WizardConfig["rackType"]) => {
    const base = { ...defaultWizardConfig, rackType: type };
    if (type === "network") {
      Object.assign(base, { hasPatchPanels: true, hasSwitches: true, hasCableOrganizer: true, hasRouters: true });
    } else if (type === "server") {
      Object.assign(base, { hasServers: true, serverCount: 4, hasPDU: true, hasUPS: true, hasPatchPanels: false, hasSwitches: true, switchCount: 1 });
    } else if (type === "mixed") {
      Object.assign(base, { hasPatchPanels: true, hasSwitches: true, hasServers: true, serverCount: 2, hasUPS: true });
    } else if (type === "telecom") {
      Object.assign(base, { hasPatchPanels: true, patchPanelCount: 4, hasFiberTray: true, fiberTrayCount: 2, hasSwitches: true });
    }
    setConfig(base);
  };

  // Generate devices from wizard config
  const generateDevices = (): RackDevice[] => {
    const result: RackDevice[] = [];
    const occupiedUnits = new Set<number>();
    existingDevices.forEach(d => {
      for (let u = d.unit; u < d.unit + d.sizeUnits; u++) occupiedUnits.add(u);
    });

    let nextUnit = 1; // start from bottom
    const findSlot = (size: number): number => {
      for (let u = nextUnit; u <= totalUnits - size + 1; u++) {
        let free = true;
        for (let i = 0; i < size; i++) { if (occupiedUnits.has(u + i)) { free = false; break; } }
        if (free) {
          for (let i = 0; i < size; i++) occupiedUnits.add(u + i);
          if (u + size > nextUnit) nextUnit = u + size;
          return u;
        }
      }
      return nextUnit; // fallback
    };

    // PDU at bottom
    if (config.hasPDU) {
      for (let i = 0; i < config.pduCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-pdu-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `PDU ${i + 1}`, type: "pdu", color: TYPE_META.pdu.color, pduHasBreaker: true });
      }
    }

    // UPS
    if (config.hasUPS) {
      const u = findSlot(config.upsSize);
      result.push({ id: `wiz-ups-${Date.now()}`, unit: u, sizeUnits: config.upsSize, label: config.upsModel || "UPS", type: "ups", color: TYPE_META.ups.color, model: config.upsModel || undefined });
    }

    // Cable organizers between sections
    const addOrganizer = () => {
      if (config.hasCableOrganizer && config.cableOrganizerCount > 0) {
        const u = findSlot(1);
        result.push({ id: `wiz-org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, unit: u, sizeUnits: 1, label: "Organizador de Cable", type: "cable-organizer", color: TYPE_META["cable-organizer"].color });
      }
    };

    // Patch panels
    if (config.hasPatchPanels) {
      for (let i = 0; i < config.patchPanelCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-pp-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `Patch Panel ${i + 1}`, type: "patchpanel", color: TYPE_META.patchpanel.color, portCount: config.patchPanelPorts });
      }
      addOrganizer();
    }

    // Fiber trays
    if (config.hasFiberTray) {
      for (let i = 0; i < config.fiberTrayCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-fiber-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `Bandeja Fibra ${i + 1}`, type: "tray-fiber", color: TYPE_META["tray-fiber"].color });
      }
    }

    // Switches
    if (config.hasSwitches) {
      for (let i = 0; i < config.switchCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-sw-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: config.switchModel || `Switch ${i + 1}`, type: "switch", color: TYPE_META.switch.color, portCount: config.switchPorts, model: config.switchModel || undefined });
      }
      addOrganizer();
    }

    // Routers
    if (config.hasRouters) {
      for (let i = 0; i < config.routerCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-rt-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: config.routerModel || `Router ${i + 1}`, type: "router", color: TYPE_META.router.color, model: config.routerModel || undefined });
      }
    }

    // Servers
    if (config.hasServers) {
      for (let i = 0; i < config.serverCount; i++) {
        const u = findSlot(config.serverSize);
        result.push({ id: `wiz-srv-${Date.now()}-${i}`, unit: u, sizeUnits: config.serverSize, label: config.serverModel || `Servidor ${i + 1}`, type: "server", color: TYPE_META.server.color, model: config.serverModel || undefined });
      }
    }

    // Shelves
    if (config.hasTray) {
      for (let i = 0; i < config.trayCount; i++) {
        const u = findSlot(1);
        result.push({ id: `wiz-tray-${Date.now()}-${i}`, unit: u, sizeUnits: 1, label: `Bandeja ${i + 1}`, type: "tray-1u", color: TYPE_META["tray-1u"].color });
      }
    }

    return result;
  };

  const previewDevices = useMemo(() => step === "review" ? generateDevices() : [], [step, config]);
  const totalUs = previewDevices.reduce((s, d) => s + d.sizeUnits, 0);
  const freeUs = totalUnits - existingDevices.reduce((s, d) => s + d.sizeUnits, 0) - totalUs;

  // Shared styles
  const toggleBtn = (active: boolean, color: string) => ({
    background: active ? `${color}15` : "rgba(255,255,255,0.03)",
    border: `1px solid ${active ? `${color}40` : "rgba(255,255,255,0.06)"}`,
    color: active ? color : "#555",
  });

  const numInput = (val: number, set: (n: number) => void, min = 1, max = 20) => (
    <div className="flex items-center gap-1">
      <button onClick={() => set(Math.max(min, val - 1))} className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white/80 transition-colors" style={{ background: "rgba(255,255,255,0.05)" }}>-</button>
      <span className="text-[12px] font-bold text-white/80 w-6 text-center">{val}</span>
      <button onClick={() => set(Math.min(max, val + 1))} className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white/80 transition-colors" style={{ background: "rgba(255,255,255,0.05)" }}>+</button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[30000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          width: 520, maxHeight: "85vh",
          background: "rgba(12,12,16,0.98)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 32px 100px rgba(0,0,0,0.8)",
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L9 10H3L12 22L21 10H15L12 2Z" fill="rgba(99,102,241,0.3)" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="5" r="1" fill="#c4b5fd" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-white/90">Asistente de Rack</div>
                <div className="text-[10px] text-white/35">Configuración paso a paso</div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Step indicator */}
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full h-1 rounded-full transition-all" style={{ background: i <= stepIdx ? "#818cf8" : "rgba(255,255,255,0.06)" }} />
                <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: i <= stepIdx ? "#818cf8" : "#333" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
          {step === "type" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué tipo de rack vas a configurar?</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "network" as const, label: "Rack de Red", desc: "Switches, patch panels, routers", color: "#10b981", icon: <Network className="w-5 h-5" /> },
                  { id: "server" as const, label: "Rack de Servidores", desc: "Servidores, UPS, PDU", color: "#3b82f6", icon: <Server className="w-5 h-5" /> },
                  { id: "mixed" as const, label: "Rack Mixto", desc: "Red + servidores + energía", color: "#f59e0b", icon: <Zap className="w-5 h-5" /> },
                  { id: "telecom" as const, label: "Rack Telecom", desc: "Fibra, patch panels, switches", color: "#d946ef", icon: <Cable className="w-5 h-5" /> },
                ]).map(t => (
                  <button key={t.id} onClick={() => handleTypeSelect(t.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all cursor-pointer"
                    style={toggleBtn(config.rackType === t.id, t.color)}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${t.color}18`, color: t.color }}>{t.icon}</div>
                    <div className="text-[11px] font-bold" style={{ color: config.rackType === t.id ? t.color : "#aaa" }}>{t.label}</div>
                    <div className="text-[9px] text-white/30">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "structure" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué estructura de cableado tendrá?</div>
              {/* Patch Panels */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)" }}>
                    <Cable className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Patch Panels</div>
                    <div className="text-[9px] text-white/30">Paneles de parcheo para cableado estructurado</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasPatchPanels && numInput(config.patchPanelCount, n => upd({ patchPanelCount: n }))}
                  <button onClick={() => upd({ hasPatchPanels: !config.hasPatchPanels })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasPatchPanels ? "#8b5cf6" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasPatchPanels ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasPatchPanels && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Puertos:</span>
                  {[24, 48].map(p => (
                    <button key={p} onClick={() => upd({ patchPanelPorts: p })} className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.patchPanelPorts === p, "#8b5cf6")}>{p} puertos</button>
                  ))}
                </div>
              )}

              {/* Fiber Trays */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(217,70,239,0.15)" }}>
                    <Inbox className="w-4 h-4" style={{ color: "#d946ef" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Bandejas de Fibra</div>
                    <div className="text-[9px] text-white/30">Bandejas para empalme y distribución de fibra óptica</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasFiberTray && numInput(config.fiberTrayCount, n => upd({ fiberTrayCount: n }))}
                  <button onClick={() => upd({ hasFiberTray: !config.hasFiberTray })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasFiberTray ? "#d946ef" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasFiberTray ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>

              {/* Cable Organizers */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(120,113,108,0.15)" }}>
                    <Cable className="w-4 h-4" style={{ color: "#78716c" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Organizadores de Cable</div>
                    <div className="text-[9px] text-white/30">Guías horizontales para orden del cableado</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasCableOrganizer && numInput(config.cableOrganizerCount, n => upd({ cableOrganizerCount: n }), 1, 10)}
                  <button onClick={() => upd({ hasCableOrganizer: !config.hasCableOrganizer })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasCableOrganizer ? "#78716c" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasCableOrganizer ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "network" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué equipos de red tendrá el rack?</div>
              {/* Switches */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                    <Network className="w-4 h-4" style={{ color: "#10b981" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Switches</div>
                    <div className="text-[9px] text-white/30">Switches de red gestionables o no gestionables</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasSwitches && numInput(config.switchCount, n => upd({ switchCount: n }))}
                  <button onClick={() => upd({ hasSwitches: !config.hasSwitches })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasSwitches ? "#10b981" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasSwitches ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasSwitches && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Puertos:</span>
                  {[8, 16, 24, 48].map(p => (
                    <button key={p} onClick={() => upd({ switchPorts: p })} className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.switchPorts === p, "#10b981")}>{p}</button>
                  ))}
                  <input placeholder="Modelo" value={config.switchModel} onChange={e => upd({ switchModel: e.target.value })}
                    className="ml-2 flex-1 h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}

              {/* Routers */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)" }}>
                    <Router className="w-4 h-4" style={{ color: "#ef4444" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Routers</div>
                    <div className="text-[9px] text-white/30">Routers, firewalls, gateways</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasRouters && numInput(config.routerCount, n => upd({ routerCount: n }))}
                  <button onClick={() => upd({ hasRouters: !config.hasRouters })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasRouters ? "#ef4444" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasRouters ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasRouters && (
                <div className="ml-11">
                  <input placeholder="Modelo (ej: MikroTik CCR1036)" value={config.routerModel} onChange={e => upd({ routerModel: e.target.value })}
                    className="w-full h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}

              {/* Servers */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)" }}>
                    <Server className="w-4 h-4" style={{ color: "#3b82f6" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Servidores</div>
                    <div className="text-[9px] text-white/30">Servidores rack-mount</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasServers && numInput(config.serverCount, n => upd({ serverCount: n }), 1, 10)}
                  <button onClick={() => upd({ hasServers: !config.hasServers })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasServers ? "#3b82f6" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasServers ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
              {config.hasServers && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Tamaño:</span>
                  {[1, 2, 4].map(u => (
                    <button key={u} onClick={() => upd({ serverSize: u })} className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.serverSize === u, "#3b82f6")}>{u}U</button>
                  ))}
                  <input placeholder="Modelo" value={config.serverModel} onChange={e => upd({ serverModel: e.target.value })}
                    className="ml-2 flex-1 h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}
            </div>
          )}

          {step === "power" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Qué equipos de energía tendrá?</div>
              {/* UPS */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
                    <Zap className="w-4 h-4" style={{ color: "#f59e0b" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">UPS</div>
                    <div className="text-[9px] text-white/30">Respaldo de energía ininterrumpida</div>
                  </div>
                </div>
                <button onClick={() => upd({ hasUPS: !config.hasUPS })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasUPS ? "#f59e0b" : "rgba(255,255,255,0.1)" }}>
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasUPS ? "translateX(14px)" : "translateX(2px)" }} />
                </button>
              </div>
              {config.hasUPS && (
                <div className="ml-11 flex items-center gap-3">
                  <span className="text-[10px] text-white/40">Tamaño:</span>
                  {[2, 3, 4, 6].map(u => (
                    <button key={u} onClick={() => upd({ upsSize: u })} className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer" style={toggleBtn(config.upsSize === u, "#f59e0b")}>{u}U</button>
                  ))}
                  <input placeholder="Modelo" value={config.upsModel} onChange={e => upd({ upsModel: e.target.value })}
                    className="ml-2 flex-1 h-7 px-2 rounded-lg text-[10px] text-white/80 placeholder-white/25 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              )}

              {/* PDU */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.15)" }}>
                    <Zap className="w-4 h-4" style={{ color: "#f97316" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">PDU</div>
                    <div className="text-[9px] text-white/30">Unidad de distribución de energía</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasPDU && numInput(config.pduCount, n => upd({ pduCount: n }), 1, 4)}
                  <button onClick={() => upd({ hasPDU: !config.hasPDU })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasPDU ? "#f97316" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasPDU ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "extras" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">¿Algo más que agregar?</div>
              {/* Bandeja */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(82,82,91,0.15)" }}>
                    <Inbox className="w-4 h-4" style={{ color: "#52525b" }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/80">Bandejas</div>
                    <div className="text-[9px] text-white/30">Bandejas fijas 1U para equipos pequeños</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {config.hasTray && numInput(config.trayCount, n => upd({ trayCount: n }), 1, 6)}
                  <button onClick={() => upd({ hasTray: !config.hasTray })} className="w-8 h-5 rounded-full transition-all cursor-pointer" style={{ background: config.hasTray ? "#52525b" : "rgba(255,255,255,0.1)" }}>
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: config.hasTray ? "translateX(14px)" : "translateX(2px)" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <div className="text-[11px] text-white/50 mb-2">Se agregarán los siguientes equipos al rack:</div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold text-white/40">{previewDevices.length} equipos</span>
                <span className="text-[10px] text-white/25">·</span>
                <span className="text-[10px] font-bold text-white/40">{totalUs}U ocupadas</span>
                <span className="text-[10px] text-white/25">·</span>
                <span className="text-[10px] font-bold" style={{ color: freeUs >= 0 ? "#22c55e" : "#ef4444" }}>{freeUs}U libres</span>
              </div>
              {freeUs < 0 && (
                <div className="rounded-lg p-3 text-[10px] text-red-400 font-semibold" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  ⚠ No hay suficiente espacio en el rack. Reduce equipos o ajusta el tamaño.
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {previewDevices.map((d, i) => {
                  const meta = TYPE_META[d.type] || TYPE_META.other;
                  return (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: d.color || meta.color }}>
                        <span className="text-white/90 scale-75">{meta.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold text-white/80 truncate block">{d.label}</span>
                        <span className="text-[9px] text-white/30">{meta.label} · U{d.unit}{d.sizeUnits > 1 ? `–U${d.unit + d.sizeUnits - 1}` : ""} · {d.sizeUnits}U</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[9px] text-white/25 mt-2">
                Luego de finalizar, podrás editar cada equipo individualmente: cambiar posición, agregar IP de gestión, modelo, serial, y asociar monitores de Uptime Kuma.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <button onClick={canPrev ? () => setStep(steps[stepIdx - 1].id) : onClose}
            className="px-4 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.06)" }}>
            {canPrev ? "Anterior" : "Cancelar"}
          </button>
          {step === "review" ? (
            <button onClick={() => onComplete(previewDevices)} disabled={freeUs < 0}
              className="px-5 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:opacity-30"
              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
              Crear {previewDevices.length} equipos
            </button>
          ) : (
            <button onClick={() => setStep(steps[stepIdx + 1].id)}
              className="px-5 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
              Siguiente
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
