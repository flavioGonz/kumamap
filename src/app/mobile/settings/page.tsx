"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import PageTransition from "@/components/mobile/PageTransition";
import { hapticTap, hapticSuccess, hapticError } from "@/lib/haptics";

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

export default function MobileSettings() {
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [swStatus, setSwStatus] = useState<string>("Verificando...");

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

    // Fetch version
    fetch(apiUrl("/api/version"))
      .then((r) => r.json())
      .then(setVersion)
      .catch(() => {});
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
      } else {
        // Request permission first
        const perm = await Notification.requestPermission();
        setPushPermission(perm);
        if (perm !== "granted") {
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
      }
    } catch (err) {
      console.error("[push]", err);
      hapticError();
    } finally {
      setPushLoading(false);
    }
  }, [pushEnabled, pushSupported]);

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
        <h1 className="text-sm font-bold text-[#ededed]">Configuración</h1>
      </header>

      <div className="flex-1 px-4 py-4 space-y-3">
        {/* ── Notifications ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Notificaciones</div>
          </div>

          {/* Push toggle */}
          <button
            onClick={() => { hapticTap(); togglePush(); }}
            disabled={pushLoading || !pushSupported}
            className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all"
          >
            <div className="flex items-center gap-3">
              <div
                className="h-8 w-8 rounded-xl flex items-center justify-center"
                style={{
                  background: pushEnabled ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${pushEnabled ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={pushEnabled ? "#22c55e" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-[#ddd]">Notificaciones Push</div>
                <div className="text-[10px] text-[#555]">
                  {!pushSupported
                    ? "No soportado en este navegador"
                    : pushPermission === "denied"
                    ? "Bloqueado — habilitá en ajustes del navegador"
                    : pushEnabled
                    ? "Recibirás alertas cuando un monitor caiga"
                    : "Toca para activar alertas de caídas"}
                </div>
              </div>
            </div>
            <div
              className="w-11 h-6 rounded-full relative transition-all"
              style={{
                background: pushEnabled ? "#22c55e" : "rgba(255,255,255,0.1)",
              }}
            >
              <div
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                style={{ left: pushEnabled ? "calc(100% - 22px)" : "2px" }}
              />
            </div>
          </button>

          {/* Permission status */}
          <div className="px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: pushPermission === "granted" ? "#22c55e"
                  : pushPermission === "denied" ? "#ef4444" : "#f59e0b",
              }}
            />
            <span className="text-[10px] text-[#555]">
              Permiso: {pushPermission === "granted" ? "Concedido" : pushPermission === "denied" ? "Denegado" : "No solicitado"}
            </span>
          </div>
        </div>

        {/* ── App Info ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Acerca de</div>
          </div>

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
        </div>

        {/* ── Server ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Servidor</div>
          </div>
          <a
            href={apiUrl("/api/health")}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              </div>
              <div>
                <div className="text-xs font-bold text-[#ddd]">Estado del servidor</div>
                <div className="text-[10px] text-[#555]">Health check en tiempo real</div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </a>
        </div>
      </div>
    </div>
    </PageTransition>
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
