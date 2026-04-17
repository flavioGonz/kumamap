"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import PageTransition from "@/components/mobile/PageTransition";
import { useToast } from "@/components/mobile/MobileToast";
import { hapticTap, hapticSuccess, hapticError, hapticMedium } from "@/lib/haptics";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

interface VersionInfo {
  appVersion: string;
  local: { commit: string; date: string; message: string; branch: string };
}

interface HealthData {
  status: string;
  kuma: string;
  db: string;
  disk: { usedPercent: number };
  memory: { usedPercent: number };
}

export default function MobileSettings() {
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [swStatus, setSwStatus] = useState<string>("Verificando...");
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pingResult, setPingResult] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const { show } = useToast();
  const online = useOnlineStatus();

  useEffect(() => {
    // Check push support
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if ("Notification" in window) {
      setPushPermission(Notification.permission);
    }

    // Check subscription
    if (supported) {
      navigator.serviceWorker.ready.then((reg) => {
        setSwStatus("Activo");
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }

    // Fetch version + health
    fetch(apiUrl("/api/version"))
      .then((r) => r.json())
      .then(setVersion)
      .catch(() => {});

    fetch(apiUrl("/api/health"))
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});

    // Estimate cache size
    if ("storage" in navigator && "estimate" in navigator.storage) {
      navigator.storage.estimate().then((est) => {
        const used = est.usage || 0;
        if (used < 1024) setCacheSize(`${used} B`);
        else if (used < 1024 * 1024) setCacheSize(`${(used / 1024).toFixed(1)} KB`);
        else setCacheSize(`${(used / 1024 / 1024).toFixed(1)} MB`);
      });
    }

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const togglePush = useCallback(async () => {
    if (!pushSupported) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch(apiUrl("/api/push"), {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        show("Notificaciones desactivadas", "info");
      } else {
        const perm = await Notification.requestPermission();
        setPushPermission(perm);
        if (perm !== "granted") {
          show("Permiso denegado", "warning");
          setPushLoading(false);
          return;
        }
        const keyRes = await fetch(apiUrl("/api/push"));
        const { publicKey } = await keyRes.json();
        if (!publicKey) { setPushLoading(false); return; }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
        await fetch(apiUrl("/api/push"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        setPushEnabled(true);
        hapticSuccess();
        show("Notificaciones activadas", "success");
      }
    } catch (err) {
      console.error("[push]", err);
      hapticError();
      show("Error al configurar push", "error");
    } finally {
      setPushLoading(false);
    }
  }, [pushEnabled, pushSupported, show]);

  const runPing = useCallback(async () => {
    setPinging(true);
    hapticTap();
    try {
      const start = performance.now();
      const res = await fetch(apiUrl("/api/health"), { cache: "no-store" });
      const elapsed = Math.round(performance.now() - start);
      setPingResult(elapsed);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        show(`Servidor OK — ${elapsed}ms`, "success");
        hapticSuccess();
      } else {
        show(`Servidor error — ${elapsed}ms`, "error");
        hapticError();
      }
    } catch {
      setPingResult(-1);
      show("Servidor inalcanzable", "error");
      hapticError();
    } finally {
      setPinging(false);
    }
  }, [show]);

  const clearCache = useCallback(async () => {
    hapticMedium();
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // Re-register SW to rebuild cache
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.update();
      }
      setCacheSize("0 B");
      show("Caché limpiada", "success");
      hapticSuccess();
    } catch {
      show("Error al limpiar caché", "error");
    }
  }, [show]);

  const installPWA = useCallback(async () => {
    if (!deferredPrompt) return;
    hapticTap();
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      show("App instalada", "success");
      hapticSuccess();
    }
    setDeferredPrompt(null);
  }, [deferredPrompt, show]);

  const shareApp = useCallback(async () => {
    hapticTap();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "KumaMap",
          text: "Monitoreo de red en tiempo real",
          url: window.location.origin + "/mobile",
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.origin + "/mobile");
      show("URL copiada al portapapeles", "info");
    }
  }, [show]);

  return (
    <PageTransition>
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-4 py-3"
        style={{
          background: "rgba(10,10,10,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-bold text-[#ededed]">Configuración</h1>
          <div className="flex items-center gap-1.5">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: online ? "#22c55e" : "#ef4444",
                boxShadow: online ? "0 0 4px rgba(34,197,94,0.6)" : "0 0 4px rgba(239,68,68,0.6)",
              }}
            />
            <span className="text-[9px] text-[#555]">{online ? "Online" : "Offline"}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 space-y-3">

        {/* ── Quick Ping / Server Status ── */}
        <SettingsSection title="Servidor">
          {/* Server health summary */}
          {health && (
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <MiniGauge label="CPU" value={health.memory?.usedPercent} />
                <MiniGauge label="Disco" value={health.disk?.usedPercent} />
                <MiniGauge label="Memoria" value={health.memory?.usedPercent} />
              </div>
            </div>
          )}

          {/* Ping button */}
          <button
            onClick={runPing}
            disabled={pinging}
            className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all border-t"
            style={{ borderColor: "rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-3">
              <SettingsIcon color="#f59e0b" bg="rgba(245,158,11,0.12)" border="rgba(245,158,11,0.25)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </SettingsIcon>
              <div className="text-left">
                <div className="text-xs font-bold text-[#ddd]">Ping al servidor</div>
                <div className="text-[10px] text-[#555]">
                  {pinging
                    ? "Probando conexión..."
                    : pingResult !== null
                    ? pingResult > 0 ? `Última respuesta: ${pingResult}ms` : "Servidor no responde"
                    : "Medir latencia al servidor"}
                </div>
              </div>
            </div>
            {pinging ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
              </svg>
            ) : (
              <span className="text-[10px] font-mono font-bold" style={{ color: pingResult !== null ? (pingResult > 0 && pingResult < 200 ? "#22c55e" : pingResult > 0 ? "#f59e0b" : "#ef4444") : "#555" }}>
                {pingResult !== null ? (pingResult > 0 ? `${pingResult}ms` : "---") : ""}
              </span>
            )}
          </button>

          {/* Health endpoint link */}
          <a
            href={apiUrl("/api/health")}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all border-t"
            style={{ borderColor: "rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-3">
              <SettingsIcon color="#60a5fa" bg="rgba(59,130,246,0.12)" border="rgba(59,130,246,0.25)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </SettingsIcon>
              <div>
                <div className="text-xs font-bold text-[#ddd]">Health endpoint</div>
                <div className="text-[10px] text-[#555]">JSON completo del servidor</div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </a>
        </SettingsSection>

        {/* ── Notifications ── */}
        <SettingsSection title="Notificaciones">
          <button
            onClick={() => { hapticTap(); togglePush(); }}
            disabled={pushLoading || !pushSupported}
            className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all"
          >
            <div className="flex items-center gap-3">
              <SettingsIcon
                color={pushEnabled ? "#22c55e" : "#555"}
                bg={pushEnabled ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)"}
                border={pushEnabled ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={pushEnabled ? "#22c55e" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </SettingsIcon>
              <div className="text-left">
                <div className="text-xs font-bold text-[#ddd]">Notificaciones Push</div>
                <div className="text-[10px] text-[#555]">
                  {!pushSupported
                    ? "No soportado en este navegador"
                    : pushPermission === "denied"
                    ? "Bloqueado — habilitá en ajustes"
                    : pushEnabled
                    ? "Alertas de caídas activadas"
                    : "Toca para activar"}
                </div>
              </div>
            </div>
            <IOSSwitch on={pushEnabled} loading={pushLoading} />
          </button>

          <div className="px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: pushPermission === "granted" ? "#22c55e" : pushPermission === "denied" ? "#ef4444" : "#f59e0b",
              }}
            />
            <span className="text-[10px] text-[#555]">
              Permiso: {pushPermission === "granted" ? "Concedido" : pushPermission === "denied" ? "Denegado" : "No solicitado"}
            </span>
          </div>
        </SettingsSection>

        {/* ── Storage & Cache ── */}
        <SettingsSection title="Almacenamiento">
          <button
            onClick={clearCache}
            className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all"
          >
            <div className="flex items-center gap-3">
              <SettingsIcon color="#a78bfa" bg="rgba(167,139,250,0.12)" border="rgba(167,139,250,0.25)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </SettingsIcon>
              <div className="text-left">
                <div className="text-xs font-bold text-[#ddd]">Limpiar caché</div>
                <div className="text-[10px] text-[#555]">
                  {cacheSize ? `Usando ${cacheSize}` : "Liberar espacio y recargar datos"}
                </div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </SettingsSection>

        {/* ── App Actions ── */}
        <SettingsSection title="Aplicación">
          {/* Install PWA */}
          {deferredPrompt && (
            <button
              onClick={installPWA}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all"
            >
              <div className="flex items-center gap-3">
                <SettingsIcon color="#22c55e" bg="rgba(34,197,94,0.12)" border="rgba(34,197,94,0.25)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </SettingsIcon>
                <div className="text-left">
                  <div className="text-xs font-bold text-[#22c55e]">Instalar App</div>
                  <div className="text-[10px] text-[#555]">Agregar a pantalla de inicio</div>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}

          {/* Share */}
          <button
            onClick={shareApp}
            className={`w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all ${deferredPrompt ? "border-t" : ""}`}
            style={deferredPrompt ? { borderColor: "rgba(255,255,255,0.04)" } : {}}
          >
            <div className="flex items-center gap-3">
              <SettingsIcon color="#ec4899" bg="rgba(236,72,153,0.12)" border="rgba(236,72,153,0.25)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </SettingsIcon>
              <div className="text-left">
                <div className="text-xs font-bold text-[#ddd]">Compartir</div>
                <div className="text-[10px] text-[#555]">Enviar link de KumaMap</div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => {
              hapticTap();
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                document.documentElement.requestFullscreen().catch(() => {
                  show("Tu navegador no soporta pantalla completa", "warning");
                });
              }
            }}
            className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all border-t"
            style={{ borderColor: "rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-3">
              <SettingsIcon color="#14b8a6" bg="rgba(20,184,166,0.12)" border="rgba(20,184,166,0.25)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </SettingsIcon>
              <div className="text-left">
                <div className="text-xs font-bold text-[#ddd]">Pantalla completa</div>
                <div className="text-[10px] text-[#555]">Modo inmersivo sin barras</div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </SettingsSection>

        {/* ── About ── */}
        <SettingsSection title="Acerca de">
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <InfoRow label="Versión" value={version?.appVersion || "..."} />
            <InfoRow label="Commit" value={version?.local.commit || "..."} mono />
            <InfoRow label="Branch" value={version?.local.branch || "..."} />
            <InfoRow label="Service Worker" value={swStatus} />
            <InfoRow
              label="Última actualización"
              value={version?.local.date ? new Date(version.local.date).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "..."}
            />
          </div>
        </SettingsSection>

        {/* Bottom breathing room */}
        <div className="h-4" />
      </div>
    </div>
    </PageTransition>
  );
}

/* ── Shared sub-components ── */

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider">{title}</div>
      </div>
      {children}
    </div>
  );
}

function SettingsIcon({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg, border: `1px solid ${border}` }}>
      {children}
    </div>
  );
}

function IOSSwitch({ on, loading }: { on: boolean; loading: boolean }) {
  return (
    <div
      className="w-11 h-6 rounded-full relative transition-all"
      style={{
        background: on ? "#22c55e" : "rgba(255,255,255,0.1)",
        opacity: loading ? 0.5 : 1,
      }}
    >
      <div
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{ left: on ? "calc(100% - 22px)" : "2px" }}
      />
    </div>
  );
}

function MiniGauge({ label, value }: { label: string; value?: number }) {
  const pct = value ?? 0;
  const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
  return (
    <div className="text-center">
      <div className="relative mx-auto" style={{ width: 36, height: 36 }}>
        <svg viewBox="0 0 36 36" width="36" height="36">
          <path
            d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${pct}, 100`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold font-mono" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <span className="text-[8px] text-[#555] mt-0.5 block">{label}</span>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[11px] text-[#888]">{label}</span>
      <span className={`text-[11px] text-[#ddd] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
