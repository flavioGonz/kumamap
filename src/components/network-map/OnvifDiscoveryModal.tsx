"use client";

import React, { useState, useCallback } from "react";
import { Radar, Loader2, Camera, Check, AlertTriangle, X, Plus, Wifi, Crosshair } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface DiscoveredDevice {
  ip: string;
  port: number;
  manufacturer: string;
  model: string;
  name: string;
  streamUri: string | null;
  snapshotUri: string | null;
  connected: boolean;
  error: string | null;
}

interface OnvifDiscoveryModalProps {
  onClose: () => void;
  onAddCamera: (device: DiscoveredDevice) => void;
  existingIps: string[];
}

type ScanMode = "multicast" | "range";

export default function OnvifDiscoveryModal({ onClose, onAddCamera, existingIps }: OnvifDiscoveryModalProps) {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [timeout, setTimeout_] = useState(5);
  const [addedIps, setAddedIps] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ScanMode>("multicast");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [scanProgress, setScanProgress] = useState<{ scanned?: number; total?: number } | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setDevices([]);
    setScanProgress(null);
    try {
      const payload: any = { timeout: timeout * 1000, user, pass };
      if (mode === "range") {
        if (!rangeStart || !rangeEnd) {
          setError("Indicá IP inicio y fin del rango");
          setScanning(false);
          return;
        }
        payload.mode = "range";
        payload.rangeStart = rangeStart;
        payload.rangeEnd = rangeEnd;
      }
      const res = await fetch(apiUrl("/api/onvif/discover"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setDevices(data.devices || []);
        if (data.scanned) {
          setScanProgress({ scanned: data.scanned, total: data.count });
        }
      }
      setScanned(true);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
      setScanned(true);
    } finally {
      setScanning(false);
    }
  }, [user, pass, timeout, mode, rangeStart, rangeEnd]);

  const handleAdd = (dev: DiscoveredDevice) => {
    onAddCamera(dev);
    setAddedIps((prev) => new Set(prev).add(dev.ip));
  };

  const alreadyExists = (ip: string) => existingIps.includes(ip) || addedIps.has(ip);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div
        className="relative rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          width: "min(600px, 90vw)",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.12)" }}>
              <Radar className="w-5 h-5" style={{ color: "#06b6d4" }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">ONVIF Discovery</h2>
              <p className="text-[10px] text-white/40">Escanear la red en busca de cámaras</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#666" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5 pt-3 pb-1 flex gap-1" style={{ borderBottom: "none" }}>
          <button
            onClick={() => setMode("multicast")}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: mode === "multicast" ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${mode === "multicast" ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.06)"}`,
              color: mode === "multicast" ? "#06b6d4" : "#666",
            }}
          >
            <Wifi className="w-3.5 h-3.5" />
            Multicast
          </button>
          <button
            onClick={() => setMode("range")}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: mode === "range" ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${mode === "range" ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.06)"}`,
              color: mode === "range" ? "#a855f7" : "#666",
            }}
          >
            <Crosshair className="w-3.5 h-3.5" />
            Rango IP
          </button>
        </div>

        {/* IP Range inputs (only in range mode) */}
        {mode === "range" && (
          <div className="px-5 pt-2 pb-1 flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-white/40 block mb-1">IP Inicio</label>
              <input
                type="text"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                placeholder="192.168.1.1"
                className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-white/40 block mb-1">IP Fin</label>
              <input
                type="text"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                placeholder="192.168.1.254"
                className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          </div>
        )}

        {/* Credentials */}
        <div className="px-5 py-3 flex gap-3 items-end" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex-1">
            <label className="text-[10px] text-white/40 block mb-1">Usuario</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="admin"
              className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-white/40 block mb-1">Contraseña</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div className="w-20">
            <label className="text-[10px] text-white/40 block mb-1">Timeout</label>
            <select
              value={timeout}
              onChange={(e) => setTimeout_(parseInt(e.target.value))}
              className="w-full rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <option value={3} style={{ background: "#1a1a2e" }}>3s</option>
              <option value={5} style={{ background: "#1a1a2e" }}>5s</option>
              <option value={10} style={{ background: "#1a1a2e" }}>10s</option>
              <option value={15} style={{ background: "#1a1a2e" }}>15s</option>
            </select>
          </div>
          <button
            onClick={scan}
            disabled={scanning || (mode === "range" && (!rangeStart || !rangeEnd))}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2"
            style={{
              background: scanning ? "rgba(6,182,212,0.1)" : "rgba(6,182,212,0.2)",
              border: "1px solid rgba(6,182,212,0.3)",
              color: "#06b6d4",
              opacity: scanning || (mode === "range" && (!rangeStart || !rangeEnd)) ? 0.6 : 1,
            }}
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
            {scanning ? "Escaneando..." : "Escanear"}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2" style={{ minHeight: "200px" }}>
          {!scanned && !scanning && (
            <div className="flex flex-col items-center justify-center py-12 text-white/20">
              {mode === "multicast" ? <Wifi className="w-10 h-10 mb-3" /> : <Crosshair className="w-10 h-10 mb-3" />}
              <p className="text-xs">Presiona "Escanear" para buscar cámaras ONVIF</p>
              <p className="text-[10px] mt-1 text-white/15">
                {mode === "multicast"
                  ? "Se envía un probe WS-Discovery UDP multicast"
                  : "Se conecta directamente a cada IP del rango buscando ONVIF"}
              </p>
            </div>
          )}

          {scanning && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <Radar className="w-12 h-12 text-cyan-400 animate-pulse" />
                <div className="absolute inset-0 animate-ping">
                  <Radar className="w-12 h-12 text-cyan-400/30" />
                </div>
              </div>
              <p className="text-xs text-white/40 mt-4">
                {mode === "multicast" ? "Buscando dispositivos ONVIF..." : `Probando rango ${rangeStart} → ${rangeEnd}...`}
              </p>
              <p className="text-[10px] text-white/20 mt-1">
                {mode === "multicast"
                  ? `Esto puede tomar hasta ${timeout} segundos`
                  : "Conectando a cada IP en busca de ONVIF — esto puede tomar un rato"}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {scanned && !scanning && devices.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-10 text-white/25">
              <Camera className="w-8 h-8 mb-2" />
              <p className="text-xs">No se encontraron dispositivos ONVIF</p>
              <p className="text-[10px] mt-1">Verifica que las cámaras estén en la misma subred</p>
            </div>
          )}

          {devices.map((dev, i) => {
            const exists = alreadyExists(dev.ip);
            return (
              <div
                key={`${dev.ip}-${i}`}
                className="rounded-xl p-3 flex items-center gap-3 transition-all"
                style={{
                  background: exists ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${exists ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                {/* Icon */}
                <div
                  className="p-2 rounded-lg shrink-0"
                  style={{
                    background: dev.connected ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  <Camera
                    className="w-5 h-5"
                    style={{ color: dev.connected ? "#22c55e" : "#666" }}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white font-mono">{dev.ip}</span>
                    {dev.port !== 80 && (
                      <span className="text-[10px] text-white/30 font-mono">:{dev.port}</span>
                    )}
                    {dev.connected && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                        Conectado
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5 truncate">
                    {[dev.manufacturer, dev.model].filter(Boolean).join(" — ") || "Dispositivo ONVIF"}
                  </div>
                  {dev.streamUri && (
                    <div className="text-[9px] text-cyan-400/60 font-mono mt-0.5 truncate">
                      {dev.streamUri}
                    </div>
                  )}
                  {dev.error && (
                    <div className="text-[9px] text-amber-400/70 mt-0.5">
                      ⚠ {dev.error}
                    </div>
                  )}
                </div>

                {/* Add button */}
                <button
                  onClick={() => handleAdd(dev)}
                  disabled={exists}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1.5"
                  style={{
                    background: exists ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.15)",
                    border: `1px solid ${exists ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.3)"}`,
                    color: exists ? "#22c55e" : "#60a5fa",
                    opacity: exists ? 0.6 : 1,
                    cursor: exists ? "default" : "pointer",
                  }}
                >
                  {exists ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {exists ? "Agregada" : "Agregar"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {scanned && devices.length > 0 && (
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[10px] text-white/30">
              {devices.length} dispositivo{devices.length !== 1 ? "s" : ""} encontrado{devices.length !== 1 ? "s" : ""}
              {devices.filter((d) => d.connected).length > 0 && ` · ${devices.filter((d) => d.connected).length} autenticado${devices.filter((d) => d.connected).length !== 1 ? "s" : ""}`}
              {scanProgress?.scanned && ` · ${scanProgress.scanned} IPs escaneadas`}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa" }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
