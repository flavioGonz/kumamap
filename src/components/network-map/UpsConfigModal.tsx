"use client";

import { useState } from "react";
import {
  X, Zap, Network, Server, Eye, EyeOff, Search,
  Activity, BellRing, CheckCircle2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { UpsConfig, UpsProtocol, UpsResult } from "@/lib/ups";

interface UpsConfigModalProps {
  currentConfig: UpsConfig;
  upsName: string;
  availableMonitors?: { id: number; name: string }[];
  onSave: (config: UpsConfig) => void;
  onClose: () => void;
}

const PROTOCOLS: { value: UpsProtocol; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "snmp", label: "SNMP", desc: "Tarjeta de red de la UPS (APC / RFC1628)", icon: <Network className="h-3.5 w-3.5" /> },
  { value: "nut", label: "NUT", desc: "Servidor upsd (Network UPS Tools)", icon: <Server className="h-3.5 w-3.5" /> },
];

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; result: UpsResult }
  | { status: "fail"; error: string };

export default function UpsConfigModal({
  currentConfig,
  upsName,
  availableMonitors = [],
  onSave,
  onClose,
}: UpsConfigModalProps) {
  const [config, setConfig] = useState<UpsConfig>({
    protocol: currentConfig.protocol || "snmp",
    ip: currentConfig.ip || "",
    snmpCommunity: currentConfig.snmpCommunity || "public",
    nutPort: currentConfig.nutPort ?? 3493,
    nutUpsName: currentConfig.nutUpsName || "",
    nutUser: currentConfig.nutUser || "",
    nutPassword: currentConfig.nutPassword || "",
    kumaMonitorId: currentConfig.kumaMonitorId ?? null,
    alertChargeBelow: currentConfig.alertChargeBelow ?? 30,
    alertLoadAbove: currentConfig.alertLoadAbove ?? 90,
    alertRuntimeBelow: currentConfig.alertRuntimeBelow ?? 5,
  });
  const [showSecret, setShowSecret] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<{ name: string; description?: string }[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const isNut = config.protocol === "nut";

  const update = <K extends keyof UpsConfig>(key: K, value: UpsConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setTest({ status: "idle" });
  };

  const detectNutUps = async () => {
    if (!config.ip) { setDiscoverError("Ingresá el host del servidor NUT"); return; }
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const res = await fetch(apiUrl("/api/ups/discover-nut"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: config.ip, port: config.nutPort,
          user: config.nutUser || undefined, password: config.nutPassword || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setDiscovered([]);
        setDiscoverError(json.error || "El servidor NUT no respondió");
        return;
      }
      const list: { name: string; description?: string }[] = json.ups || [];
      setDiscovered(list);
      if (list.length === 0) setDiscoverError("El servidor no expone ninguna UPS");
      else if (!config.nutUpsName) setConfig((p) => ({ ...p, nutUpsName: list[0].name }));
    } catch (err: any) {
      setDiscovered([]);
      setDiscoverError(err?.message || "Error consultando el servidor NUT");
    } finally {
      setDiscovering(false);
    }
  };

  // Ad-hoc poll: the node may not be saved yet, so credentials travel in the body.
  const testConnection = async () => {
    if (!config.ip) { setTest({ status: "fail", error: isNut ? "Falta el host NUT" : "Falta la IP" }); return; }
    setTest({ status: "testing" });
    try {
      const res = await fetch(apiUrl("/api/ups/poll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: config.ip,
          community: config.snmpCommunity,
          protocol: config.protocol,
          nutPort: config.nutPort,
          nutUpsName: config.nutUpsName || undefined,
        }),
      });
      const result: UpsResult & { error?: string } = await res.json();
      if (!res.ok || !result.reachable) {
        setTest({ status: "fail", error: result.error || "No se pudo alcanzar la UPS" });
        return;
      }
      setTest({ status: "ok", result });
    } catch (err: any) {
      setTest({ status: "fail", error: err?.message || "Error de red" });
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-elevated)",
    border: "1px solid var(--glass-border)",
    color: "var(--text-primary)",
    borderRadius: "10px",
    padding: "6px 10px",
    fontSize: "12px",
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "4px",
    display: "block",
  };

  const sectionStyle: React.CSSProperties = {
    background: "var(--surface-card)",
    border: "1px solid var(--glass-border)",
    borderRadius: "14px",
    padding: "14px",
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          maxWidth: "680px",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--glass-border)" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ width: 38, height: 38, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
            >
              <Zap className="h-5 w-5" style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Configurar UPS</h3>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{upsName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-all hover:bg-[var(--surface-hover)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 2-column layout */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(80vh - 120px)" }}>
          <div className="grid grid-cols-2 gap-4">

            {/* ══════ LEFT COLUMN ══════ */}
            <div className="space-y-3">

              {/* ── Protocol ── */}
              <div style={sectionStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <Network className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Protocolo</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PROTOCOLS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => update("protocol", p.value)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all"
                      style={{
                        background: config.protocol === p.value ? "rgba(245,158,11,0.12)" : "var(--surface-hover)",
                        border: `1px solid ${config.protocol === p.value ? "rgba(245,158,11,0.35)" : "var(--glass-border)"}`,
                        color: config.protocol === p.value ? "#f59e0b" : "var(--text-secondary)",
                      }}
                    >
                      {p.icon}
                      <div>
                        <div className="text-[10px] font-bold leading-tight">{p.label}</div>
                        <div className="text-[8px] opacity-50 leading-tight">{p.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Connection ── */}
              <div style={sectionStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Conexión</span>
                </div>

                {!isNut ? (
                  <>
                    <div className="mb-2">
                      <label style={labelStyle}>Dirección IP</label>
                      <input
                        type="text"
                        value={config.ip || ""}
                        onChange={(e) => update("ip", e.target.value)}
                        placeholder="192.168.1.50"
                        style={{ ...inputStyle, fontFamily: "monospace" }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Comunidad SNMP</label>
                      <div className="relative">
                        <input
                          type={showSecret ? "text" : "password"}
                          value={config.snmpCommunity || ""}
                          onChange={(e) => update("snmpCommunity", e.target.value)}
                          placeholder="public"
                          autoComplete="off"
                          style={{ ...inputStyle, fontFamily: "monospace", paddingRight: "32px" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 transition-all"
                          style={{ color: "var(--text-tertiary)" }}
                          title={showSecret ? "Ocultar" : "Mostrar"}
                        >
                          {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div className="col-span-2">
                        <label style={labelStyle}>Host NUT</label>
                        <input
                          type="text"
                          value={config.ip || ""}
                          onChange={(e) => update("ip", e.target.value)}
                          placeholder="192.168.1.10"
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Puerto</label>
                        <input
                          type="number"
                          value={config.nutPort ?? 3493}
                          onChange={(e) => update("nutPort", Number(e.target.value) || 3493)}
                          placeholder="3493"
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                        />
                      </div>
                    </div>

                    <div className="mb-2">
                      <label style={labelStyle}>Nombre de la UPS</label>
                      <div className="flex items-center gap-1.5">
                        {discovered.length > 0 ? (
                          <select
                            value={config.nutUpsName || ""}
                            onChange={(e) => update("nutUpsName", e.target.value)}
                            style={{ ...inputStyle, cursor: "pointer" }}
                          >
                            <option value="">— Autodetectar —</option>
                            {discovered.map((u) => (
                              <option key={u.name} value={u.name}>
                                {u.name}{u.description ? ` — ${u.description}` : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={config.nutUpsName || ""}
                            onChange={(e) => update("nutUpsName", e.target.value)}
                            placeholder="ups (sección de ups.conf)"
                            style={{ ...inputStyle, fontFamily: "monospace" }}
                          />
                        )}
                        <button
                          onClick={detectNutUps}
                          disabled={discovering}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all shrink-0"
                          style={{
                            background: "rgba(59,130,246,0.12)",
                            border: "1px solid rgba(59,130,246,0.3)",
                            color: "#3b82f6",
                            opacity: discovering ? 0.6 : 1,
                          }}
                        >
                          {discovering
                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                            : <Search className="h-3 w-3" />}
                          Detectar
                        </button>
                      </div>
                      {discoverError && (
                        <p className="text-[9px] mt-1" style={{ color: "#ef4444" }}>{discoverError}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Usuario</label>
                        <input
                          type="text"
                          value={config.nutUser || ""}
                          onChange={(e) => update("nutUser", e.target.value)}
                          placeholder="upsmon"
                          autoComplete="off"
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Contraseña</label>
                        <div className="relative">
                          <input
                            type={showSecret ? "text" : "password"}
                            value={config.nutPassword || ""}
                            onChange={(e) => update("nutPassword", e.target.value)}
                            autoComplete="new-password"
                            style={{ ...inputStyle, fontFamily: "monospace", paddingRight: "32px" }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecret((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 transition-all"
                            style={{ color: "var(--text-tertiary)" }}
                            title={showSecret ? "Ocultar" : "Mostrar"}
                          >
                            {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ══════ RIGHT COLUMN ══════ */}
            <div className="space-y-3">

              {/* ── Uptime Kuma linkage ── */}
              <div style={sectionStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Monitor Uptime Kuma</span>
                </div>
                <select
                  value={config.kumaMonitorId ?? ""}
                  onChange={(e) => update("kumaMonitorId", e.target.value ? Number(e.target.value) : null)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">— Sin monitor —</option>
                  {availableMonitors.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <p className="text-[9px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                  Vincula la UPS a un monitor existente para correlacionar caídas
                </p>
              </div>

              {/* ── Alert thresholds ── */}
              <div style={sectionStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <BellRing className="h-3.5 w-3.5" style={{ color: "#8b5cf6" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Umbrales de Alerta</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label style={labelStyle}>Carga &lt; %</label>
                    <input
                      type="number" min={0} max={100}
                      value={config.alertChargeBelow ?? 30}
                      onChange={(e) => update("alertChargeBelow", Number(e.target.value))}
                      style={{ ...inputStyle, fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Uso &gt; %</label>
                    <input
                      type="number" min={0} max={100}
                      value={config.alertLoadAbove ?? 90}
                      onChange={(e) => update("alertLoadAbove", Number(e.target.value))}
                      style={{ ...inputStyle, fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Autonom. &lt; min</label>
                    <input
                      type="number" min={0}
                      value={config.alertRuntimeBelow ?? 5}
                      onChange={(e) => update("alertRuntimeBelow", Number(e.target.value))}
                      style={{ ...inputStyle, fontFamily: "monospace" }}
                    />
                  </div>
                </div>
                <p className="text-[9px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                  Batería por debajo, carga por encima, autonomía restante por debajo
                </p>
              </div>

              {/* ── Connection test ── */}
              <div style={{ ...sectionStyle, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)" }}>
                <button
                  onClick={testConnection}
                  disabled={test.status === "testing"}
                  className="flex items-center justify-center gap-1.5 w-full rounded-xl px-3 py-2 text-xs font-bold transition-all"
                  style={{
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    color: "#f59e0b",
                    opacity: test.status === "testing" ? 0.6 : 1,
                  }}
                >
                  {test.status === "testing"
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Zap className="h-3.5 w-3.5" />}
                  Probar conexión
                </button>

                {test.status === "ok" && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#22c55e" }} />
                    <div className="text-[10px] leading-tight" style={{ color: "var(--text-secondary)" }}>
                      <div className="font-bold" style={{ color: "#22c55e" }}>UPS alcanzable</div>
                      {test.result.identity?.model && <div>Modelo: {test.result.identity.model}</div>}
                      {test.result.battery && <div>Batería: {test.result.battery.charge}%</div>}
                      {test.result.output?.loadPercent != null && <div>Carga: {test.result.output.loadPercent}%</div>}
                      <div style={{ color: "var(--text-tertiary)" }}>Vendor: {test.result.vendor}</div>
                    </div>
                  </div>
                )}

                {test.status === "fail" && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                    <span className="text-[10px] leading-tight" style={{ color: "#ef4444" }}>{test.error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--glass-border)" }}>
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-all"
            style={{
              background: "var(--surface-hover)",
              border: "1px solid var(--glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(config); onClose(); }}
            className="rounded-xl px-5 py-2 text-xs font-bold transition-all"
            style={{
              background: "rgba(245,158,11,0.15)",
              border: "1px solid rgba(245,158,11,0.35)",
              color: "#f59e0b",
            }}
          >
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
}
