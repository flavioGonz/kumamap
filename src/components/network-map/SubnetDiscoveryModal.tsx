"use client";

import React, { useState, useCallback } from "react";
import { Search, Loader2, X as XIcon, Network } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import { DEFAULT_TEMPLATES, type NodeTemplate } from "@/lib/node-templates";
import { getIconSvg } from "@/utils/map-icons";

interface DiscoveredHost {
  ip: string;
  hostname: string | null;
  rtt: number | null;
  selected: boolean;
  template: NodeTemplate;
}

export interface SubnetDiscoveryModalProps {
  /** IPs already present as nodes in the map */
  existingIps: Set<string>;
  onAddNodes: (nodes: { label: string; ip: string; icon: string; color: string; size: number; customData: Record<string, unknown> }[]) => void;
  onClose: () => void;
}

const defaultTemplate = DEFAULT_TEMPLATES.find((t) => t.id === "generic")!;
const quickTemplates = DEFAULT_TEMPLATES.filter((t) =>
  ["switch-access", "router", "ap-wifi", "server", "camera-ip", "printer", "pc-workstation"].includes(t.id)
);

export default function SubnetDiscoveryModal({ existingIps, onAddNodes, onClose }: SubnetDiscoveryModalProps) {
  const [subnet, setSubnet] = useState("192.168.1");
  const [startIp, setStartIp] = useState(1);
  const [endIp, setEndIp] = useState(254);
  const [scanning, setScanning] = useState(false);
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [scanned, setScanned] = useState(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    setHosts([]);
    setScanned(false);
    try {
      const res = await fetch(apiUrl("/api/discovery"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subnet, startIp, endIp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error en el escaneo");
        return;
      }
      const discovered: DiscoveredHost[] = (data.hosts || []).map((h: any) => ({
        ip: h.ip,
        hostname: h.hostname,
        rtt: h.rtt,
        selected: !existingIps.has(h.ip), // auto-select new hosts
        template: defaultTemplate,
      }));
      setHosts(discovered);
      setScanned(true);
      if (discovered.length === 0) {
        toast.info("No se encontraron hosts en el rango");
      } else {
        const newCount = discovered.filter((h) => !existingIps.has(h.ip)).length;
        toast.success(`${discovered.length} hosts encontrados${newCount < discovered.length ? ` (${existingIps.size > 0 ? discovered.length - newCount : 0} ya en mapa)` : ""}`);
      }
    } catch (err: any) {
      toast.error("Error de conexión al escanear");
    } finally {
      setScanning(false);
    }
  }, [subnet, startIp, endIp, existingIps]);

  const selectedCount = hosts.filter((h) => h.selected).length;

  const handleAdd = () => {
    const toAdd = hosts
      .filter((h) => h.selected)
      .map((h) => ({
        label: h.hostname || h.ip,
        ip: h.ip,
        icon: h.template.icon,
        color: h.template.color,
        size: h.template.size,
        customData: { ...h.template.customData, ip: h.ip },
      }));
    if (toAdd.length === 0) {
      toast.error("Seleccioná al menos un host");
      return;
    }
    onAddNodes(toAdd);
    toast.success(`${toAdd.length} nodos agregados al mapa`);
    onClose();
  };

  const toggleAll = (selected: boolean) => {
    setHosts((prev) => prev.map((h) => ({ ...h, selected })));
  };

  const setHostTemplate = (ip: string, template: NodeTemplate) => {
    setHosts((prev) => prev.map((h) => (h.ip === ip ? { ...h, template } : h)));
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
        style={{ background: "rgba(14,14,14,0.99)", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}
          >
            <Network className="h-4 w-4 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[#ededed]">Auto-descubrimiento de red</h3>
            <p className="text-[10px] text-[#666]">Escanear subnet para encontrar dispositivos</p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-[#ededed] text-xl leading-none">&times;</button>
        </div>

        {/* Scan config */}
        <div className="px-5 py-3 flex items-end gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-[#666] block mb-1">Subnet</label>
            <input
              type="text"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="192.168.1"
              className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-green-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div className="w-20">
            <label className="text-[9px] font-bold uppercase tracking-wider text-[#666] block mb-1">Desde</label>
            <input
              type="number"
              min={1}
              max={254}
              value={startIp}
              onChange={(e) => setStartIp(parseInt(e.target.value) || 1)}
              className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono focus:outline-none focus:ring-1 focus:ring-green-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div className="w-20">
            <label className="text-[9px] font-bold uppercase tracking-wider text-[#666] block mb-1">Hasta</label>
            <input
              type="number"
              min={1}
              max={254}
              value={endIp}
              onChange={(e) => setEndIp(parseInt(e.target.value) || 254)}
              className="w-full rounded-xl px-3 py-2 text-xs text-[#ededed] font-mono focus:outline-none focus:ring-1 focus:ring-green-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {scanning ? "Escaneando..." : "Escanear"}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!scanned && !scanning && (
            <div className="flex flex-col items-center py-12 text-[#555]">
              <Network className="h-8 w-8 mb-3 opacity-20" />
              <p className="text-[11px]">Configurá el rango y hacé clic en Escanear</p>
              <p className="text-[10px] text-[#444] mt-1">Se enviarán pings ICMP a cada IP del rango</p>
            </div>
          )}

          {scanning && (
            <div className="flex flex-col items-center py-12 text-[#555]">
              <Loader2 className="h-8 w-8 mb-3 animate-spin text-green-400/50" />
              <p className="text-[11px] text-[#888]">Escaneando {subnet}.{startIp} - {subnet}.{endIp}...</p>
              <p className="text-[10px] text-[#444] mt-1">Esto puede tardar 20-60 segundos</p>
            </div>
          )}

          {scanned && hosts.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[#666]">{hosts.length} hosts encontrados · {selectedCount} seleccionados</span>
                <div className="flex gap-2">
                  <button onClick={() => toggleAll(true)} className="text-[9px] text-[#60a5fa] hover:underline">Seleccionar todos</button>
                  <button onClick={() => toggleAll(false)} className="text-[9px] text-[#888] hover:underline">Ninguno</button>
                </div>
              </div>

              <div className="space-y-1">
                {hosts.map((h) => {
                  const inMap = existingIps.has(h.ip);
                  return (
                    <div
                      key={h.ip}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-all"
                      style={{
                        background: h.selected ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.01)",
                        border: `1px solid ${h.selected ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)"}`,
                        opacity: inMap ? 0.4 : 1,
                      }}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => !inMap && setHosts((prev) => prev.map((x) => (x.ip === h.ip ? { ...x, selected: !x.selected } : x)))}
                        disabled={inMap}
                        className="h-4 w-4 rounded border flex items-center justify-center shrink-0"
                        style={{
                          background: h.selected ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.04)",
                          borderColor: h.selected ? "#22c55e" : "rgba(255,255,255,0.15)",
                        }}
                      >
                        {h.selected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                      </button>

                      {/* Icon preview */}
                      <div
                        className="h-6 w-6 flex items-center justify-center rounded-md shrink-0"
                        style={{ background: `${h.template.color || "#666"}22`, border: `1px solid ${h.template.color || "#666"}44` }}
                        dangerouslySetInnerHTML={{ __html: getIconSvg(h.template.icon, 12) }}
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-[#ededed]">{h.ip}</span>
                          {h.rtt != null && <span className="text-[9px] text-[#555] font-mono">{h.rtt}ms</span>}
                          {inMap && <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">EN MAPA</span>}
                        </div>
                        {h.hostname && <div className="text-[10px] text-[#888] truncate">{h.hostname}</div>}
                      </div>

                      {/* Template selector */}
                      {!inMap && (
                        <select
                          value={h.template.id}
                          onChange={(e) => {
                            const t = DEFAULT_TEMPLATES.find((t) => t.id === e.target.value);
                            if (t) setHostTemplate(h.ip, t);
                          }}
                          className="rounded-lg px-2 py-1 text-[10px] text-[#aaa] focus:outline-none cursor-pointer"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", maxWidth: "130px" }}
                        >
                          {DEFAULT_TEMPLATES.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {scanned && hosts.length === 0 && !scanning && (
            <div className="flex flex-col items-center py-12 text-[#555]">
              <XIcon className="h-6 w-6 mb-2 opacity-30" />
              <p className="text-[11px]">No se encontraron hosts activos</p>
              <p className="text-[10px] text-[#444] mt-1">Verificá el rango o que los dispositivos respondan a ping</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {scanned && hosts.length > 0 && (
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[9px] text-[#444]">Los nodos se agregarán al centro del mapa</span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-[#888] hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdd}
                disabled={selectedCount === 0}
                className="rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-30"
                style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
              >
                Agregar {selectedCount} nodo{selectedCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
