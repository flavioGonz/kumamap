"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X, Link2, KeyRound, Hash, Send, BellRing, Users, Plus, Trash2,
  CheckCircle2, AlertTriangle, Loader2, Search, Eye, EyeOff,
  MessageSquare, Save, Signal, Clock,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { safeFetch } from "@/lib/error-handler";

/* ── Types ─────────────────────────────────────────────────────────── */

interface WhatsAppRecipient {
  id: string;
  name: string;
  phone: string;
  enabled: boolean;
}

interface MonitorNotify {
  id: number;
  name: string;
  type: string;
  status: number;
  notify: boolean;
  customPhone: string;
}

interface WhatsAppConfigData {
  enabled: boolean;
  openwaUrl: string;
  apiKey: string;
  sessionId: string;
  alertsEnabled: boolean;
  reportEnabled: boolean;
  throttleMinutes: number;
  recipients: WhatsAppRecipient[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  sidebarWidth?: number; // unused (modal) — kept for API compatibility
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function WhatsAppSettingsPanel({ open, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ online: boolean; error?: string; session?: any; sendResult?: any } | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportResult, setReportResult] = useState<{ ok: boolean; sent?: number; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  // Form fields
  const [openwaUrl, setOpenwaUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [reportEnabled, setReportEnabled] = useState(true);
  const [throttleMinutes, setThrottleMinutes] = useState(5);

  // Recipients
  const [recipients, setRecipients] = useState<WhatsAppRecipient[]>([]);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Monitors
  const [monitors, setMonitors] = useState<MonitorNotify[]>([]);
  const [monitorFilter, setMonitorFilter] = useState("");

  /* ── Load ────────────────────────────────────────────────────────── */

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const [cfg, recs, mons] = await Promise.all([
      safeFetch<WhatsAppConfigData>(apiUrl("/api/whatsapp/config")),
      safeFetch<WhatsAppRecipient[]>(apiUrl("/api/whatsapp/recipients")),
      safeFetch<MonitorNotify[]>(apiUrl("/api/whatsapp/monitors")),
    ]);
    if (cfg) {
      setOpenwaUrl(cfg.openwaUrl);
      setApiKey(cfg.apiKey);
      setSessionId(cfg.sessionId);
      setEnabled(cfg.enabled);
      setAlertsEnabled(cfg.alertsEnabled);
      setReportEnabled(cfg.reportEnabled);
      setThrottleMinutes(cfg.throttleMinutes);
    }
    if (recs) setRecipients(recs);
    if (mons) setMonitors(mons);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setTestResult(null);
      setReportResult(null);
      setSaved(false);
      loadConfig();
    }
  }, [open, loadConfig]);

  /* ── Actions ─────────────────────────────────────────────────────── */

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    const body: Record<string, any> = {
      enabled, openwaUrl, sessionId, alertsEnabled, reportEnabled, throttleMinutes,
    };
    if (apiKey && !apiKey.includes("...")) body.apiKey = apiKey;
    const res = await safeFetch(apiUrl("/api/whatsapp/config"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, "Guardar config WhatsApp");
    setSaving(false);
    if (res) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }, [enabled, openwaUrl, apiKey, sessionId, alertsEnabled, reportEnabled, throttleMinutes]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const res = await safeFetch<any>(apiUrl("/api/whatsapp/test"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setTestResult(res);
    setTesting(false);
  }, []);

  const sendReport = useCallback(async () => {
    setSendingReport(true);
    setReportResult(null);
    const res = await safeFetch<any>(apiUrl("/api/whatsapp/send"), { method: "POST" }, "Enviar reporte");
    setReportResult(res);
    setSendingReport(false);
  }, []);

  const addRecipient = useCallback(async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const recs = await safeFetch<WhatsAppRecipient[]>(apiUrl("/api/whatsapp/recipients"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() }),
    }, "Agregar destinatario");
    if (recs) setRecipients(recs);
    setNewName("");
    setNewPhone("");
  }, [newName, newPhone]);

  const toggleRecipient = useCallback(async (id: string, on: boolean) => {
    const recs = await safeFetch<WhatsAppRecipient[]>(apiUrl("/api/whatsapp/recipients"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: on }),
    });
    if (recs) setRecipients(recs);
  }, []);

  const removeRecipient = useCallback(async (id: string) => {
    const recs = await safeFetch<WhatsAppRecipient[]>(apiUrl("/api/whatsapp/recipients"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (recs) setRecipients(recs);
  }, []);

  const toggleMonitorNotify = useCallback(async (monitorId: number, notify: boolean) => {
    setMonitors((prev) => prev.map((m) => (m.id === monitorId ? { ...m, notify } : m)));
    const res = await safeFetch<{ ok: boolean }>(apiUrl("/api/whatsapp/monitors"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monitorId, notify }),
    });
    if (!res?.ok) {
      setMonitors((prev) => prev.map((m) => (m.id === monitorId ? { ...m, notify: !notify } : m)));
    }
  }, []);

  const setMonitorCustomPhone = useCallback((monitorId: number, customPhone: string) => {
    // Local update while typing
    setMonitors((prev) => prev.map((m) => (m.id === monitorId ? { ...m, customPhone } : m)));
  }, []);

  const saveMonitorCustomPhone = useCallback(async (monitorId: number, customPhone: string) => {
    await safeFetch<{ ok: boolean }>(apiUrl("/api/whatsapp/monitors"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monitorId, customPhone }),
    });
  }, []);

  /* ── Render ──────────────────────────────────────────────────────── */

  if (!open) return null;

  const notifyCount = monitors.filter((m) => m.notify).length;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full flex flex-col rounded-2xl overflow-hidden"
        style={{
          maxWidth: 860,
          maxHeight: "88vh",
          background: "#101014",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.28)" }}
            >
              <MessageSquare className="h-5 w-5" style={{ color: "#25d366" }} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white leading-tight">Configuración de WhatsApp</h2>
              <p className="text-[11px] text-[#8a8a93]">Integración OpenWA — alertas y reportes de monitoreo</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {testResult && (
              <div
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  background: testResult.online ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                  border: `1px solid ${testResult.online ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                  color: testResult.online ? "#4ade80" : "#f87171",
                }}
              >
                <Signal className="h-3 w-3" />
                {testResult.online ? "Conectado" : "Sin conexión"}
              </div>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors text-[#8a8a93] hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#2a2a30 transparent" }}>
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-[#8a8a93] text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ═══ Columna izquierda ═══ */}
              <div className="space-y-5">
                {/* Conexión */}
                <SectionCard icon={<Link2 className="h-3.5 w-3.5" />} title="Conexión OpenWA"
                  action={
                    <ToggleSwitch checked={enabled} onChange={setEnabled} color="#25d366" label={enabled ? "Habilitado" : "Deshabilitado"} />
                  }>
                  <Field label="URL del servidor" icon={<Link2 className="h-3.5 w-3.5" />}>
                    <input
                      type="text"
                      placeholder="http://192.168.99.22:2886"
                      value={openwaUrl}
                      onChange={(e) => setOpenwaUrl(e.target.value)}
                      className="input-pro"
                    />
                  </Field>
                  <Field label="API Key" icon={<KeyRound className="h-3.5 w-3.5" />}>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        placeholder="owa_k1_…"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="input-pro pr-9"
                      />
                      <button
                        onClick={() => setShowApiKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6a6a72] hover:text-white transition-colors"
                      >
                        {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Session ID" icon={<Hash className="h-3.5 w-3.5" />}>
                    <input
                      type="text"
                      placeholder="UUID de la sesión"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      className="input-pro"
                    />
                  </Field>

                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={testConnection} disabled={testing} className="btn-secondary">
                      {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Signal className="h-3.5 w-3.5" />}
                      Probar conexión
                    </button>
                    {testResult?.session && (
                      <span className="text-[11px] text-[#8a8a93]">
                        {testResult.session.pushName} · +{testResult.session.phone}
                      </span>
                    )}
                    {testResult && !testResult.online && (
                      <span className="flex items-center gap-1 text-[11px] text-[#f87171]">
                        <AlertTriangle className="h-3 w-3" /> {testResult.error}
                      </span>
                    )}
                  </div>
                </SectionCard>

                {/* Alertas */}
                <SectionCard icon={<BellRing className="h-3.5 w-3.5" />} title="Alertas automáticas"
                  action={<ToggleSwitch checked={alertsEnabled} onChange={setAlertsEnabled} color="#f59e0b" />}>
                  <p className="text-[11px] text-[#8a8a93] leading-relaxed">
                    Envía un mensaje cuando un monitor cae o se recupera. Aplica a los monitores habilitados en la lista de la derecha.
                  </p>
                  <div className="flex items-center gap-2.5 pt-1">
                    <Clock className="h-3.5 w-3.5 text-[#6a6a72]" />
                    <span className="text-[12px] text-[#c9c9cf]">Intervalo mínimo entre alertas</span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={throttleMinutes}
                      onChange={(e) => setThrottleMinutes(parseInt(e.target.value) || 5)}
                      className="input-pro !w-16 text-center"
                    />
                    <span className="text-[11px] text-[#8a8a93]">min por monitor</span>
                  </div>
                </SectionCard>

                {/* Reporte */}
                <SectionCard icon={<Send className="h-3.5 w-3.5" />} title="Reporte de estado"
                  action={<ToggleSwitch checked={reportEnabled} onChange={setReportEnabled} color="#8b5cf6" />}>
                  <p className="text-[11px] text-[#8a8a93] leading-relaxed">
                    Envía un resumen completo del estado de todos los monitores a los destinatarios habilitados.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={sendReport}
                      disabled={sendingReport || !enabled || !reportEnabled}
                      className="btn-secondary"
                    >
                      {sendingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Enviar reporte ahora
                    </button>
                    {reportResult && (
                      <span
                        className="flex items-center gap-1 text-[11px] font-medium"
                        style={{ color: reportResult.ok ? "#4ade80" : "#f87171" }}
                      >
                        {reportResult.ok
                          ? <><CheckCircle2 className="h-3 w-3" /> Enviado a {reportResult.sent} destinatario{reportResult.sent === 1 ? "" : "s"}</>
                          : <><AlertTriangle className="h-3 w-3" /> {reportResult.error}</>}
                      </span>
                    )}
                  </div>
                </SectionCard>
              </div>

              {/* ═══ Columna derecha ═══ */}
              <div className="space-y-5">
                {/* Destinatarios */}
                <SectionCard icon={<Users className="h-3.5 w-3.5" />} title={`Destinatarios (${recipients.length})`}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="input-pro flex-1"
                    />
                    <input
                      type="text"
                      placeholder="59899123456"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addRecipient()}
                      className="input-pro !w-36"
                    />
                    <button
                      onClick={addRecipient}
                      disabled={!newName.trim() || !newPhone.trim()}
                      className="btn-icon"
                      style={{
                        background: "rgba(37,211,102,0.12)",
                        border: "1px solid rgba(37,211,102,0.3)",
                        color: "#25d366",
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {recipients.length === 0 ? (
                    <div className="text-center py-4 text-[11px] text-[#6a6a72]">Sin destinatarios configurados</div>
                  ) : (
                    <div className="space-y-1">
                      {recipients.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg group transition-colors"
                          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <ToggleSwitch checked={r.enabled} onChange={(v) => toggleRecipient(r.id, v)} color="#25d366" small />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-white truncate">{r.name}</div>
                            <div className="text-[10px] text-[#8a8a93] font-mono">+{r.phone}</div>
                          </div>
                          <button
                            onClick={() => removeRecipient(r.id)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-[#f87171] hover:bg-red-500/15"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Monitores */}
                <SectionCard
                  icon={<BellRing className="h-3.5 w-3.5" />}
                  title={`Notificar por monitor (${notifyCount}/${monitors.length})`}
                >
                  <p className="text-[11px] text-[#8a8a93] leading-relaxed -mt-1">
                    Todos los monitores notifican por defecto a los destinatarios generales. Podés asignar un número adicional por monitor (por ej. el cliente final) — la alerta se envía a ambos.
                  </p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6a6a72]" />
                    <input
                      type="text"
                      placeholder="Filtrar monitores…"
                      value={monitorFilter}
                      onChange={(e) => setMonitorFilter(e.target.value)}
                      className="input-pro !pl-8"
                    />
                  </div>
                  <div
                    className="space-y-0.5 overflow-y-auto rounded-lg"
                    style={{ maxHeight: 300, scrollbarWidth: "thin", scrollbarColor: "#2a2a30 transparent" }}
                  >
                    {monitors
                      .filter((m) => !monitorFilter || m.name.toLowerCase().includes(monitorFilter.toLowerCase()))
                      .map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                        >
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              background: m.status === 1 ? "#22c55e" : m.status === 0 ? "#ef4444" : "#6a6a72",
                              boxShadow: m.status === 1 ? "0 0 5px rgba(34,197,94,0.5)" : m.status === 0 ? "0 0 5px rgba(239,68,68,0.5)" : "none",
                            }}
                          />
                          <span className="flex-1 min-w-0 text-[12px] text-[#c9c9cf] truncate" title={m.name}>
                            {m.name}
                          </span>
                          <input
                            type="text"
                            placeholder="Nº adicional"
                            value={m.customPhone}
                            onChange={(e) => setMonitorCustomPhone(m.id, e.target.value)}
                            onBlur={(e) => saveMonitorCustomPhone(m.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            className="input-pro !w-[110px] !py-1 !text-[11px] font-mono shrink-0"
                            style={{
                              borderColor: m.customPhone ? "rgba(37,211,102,0.35)" : undefined,
                            }}
                            title="Número adicional de notificación para este monitor (ej: cliente final)"
                          />
                          <ToggleSwitch checked={m.notify} onChange={(v) => toggleMonitorNotify(m.id, v)} color="#25d366" small />
                        </div>
                      ))}
                    {monitors.length === 0 && (
                      <div className="text-center py-4 text-[11px] text-[#6a6a72]">Sin monitores disponibles</div>
                    )}
                  </div>
                </SectionCard>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}
        >
          <div className="text-[11px] text-[#6a6a72]">
            {saved && (
              <span className="flex items-center gap-1.5 text-[#4ade80] font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Configuración guardada
              </span>
            )}
          </div>
          <button onClick={saveConfig} disabled={saving || loading} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar configuración
          </button>
        </div>
      </div>

      <style jsx global>{`
        .input-pro {
          width: 100%;
          padding: 7px 10px;
          border-radius: 8px;
          font-size: 12px;
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
          outline: none;
          transition: border-color 0.15s ease;
        }
        .input-pro:focus {
          border-color: rgba(37, 211, 102, 0.5);
        }
        .input-pro::placeholder {
          color: #55555e;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          color: #06251380;
          color: #052e16;
          background: #25d366;
          border: 1px solid #25d366;
          transition: all 0.15s ease;
        }
        .btn-primary:hover:not(:disabled) {
          background: #2ee673;
        }
        .btn-primary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 500;
          color: #c9c9cf;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.15s ease;
        }
        .btn-secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .btn-secondary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .btn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          width: 36px;
          border-radius: 8px;
          transition: all 0.15s ease;
        }
        .btn-icon:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function SectionCard({
  icon, title, action, children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#c9c9cf]">
          <span className="text-[#8a8a93]">{icon}</span>
          <span className="text-[12px] font-bold uppercase tracking-wide">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#8a8a93]">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleSwitch({
  checked, onChange, color, label, small,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
  label?: string;
  small?: boolean;
}) {
  const w = small ? 32 : 38;
  const h = small ? 18 : 21;
  const knob = small ? 12 : 15;
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[11px] font-medium" style={{ color: checked ? color : "#6a6a72" }}>
          {label}
        </span>
      )}
      <button
        onClick={() => onChange(!checked)}
        className="relative rounded-full transition-all duration-200 shrink-0"
        style={{
          width: w,
          height: h,
          background: checked ? `${color}30` : "rgba(255,255,255,0.08)",
          border: `1px solid ${checked ? `${color}70` : "rgba(255,255,255,0.13)"}`,
        }}
      >
        <div
          className="absolute rounded-full transition-all duration-200"
          style={{
            top: (h - knob) / 2 - 1,
            left: checked ? w - knob - 3 : 2,
            height: knob,
            width: knob,
            background: checked ? color : "#8a8a93",
          }}
        />
      </button>
    </div>
  );
}
