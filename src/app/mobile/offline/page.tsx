"use client";

import { useState } from "react";

export default function MobileOffline() {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        window.location.href = "/mobile";
        return;
      }
    } catch {}
    setRetrying(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      {/* Animated wifi-off icon */}
      <div
        className="h-20 w-20 rounded-3xl flex items-center justify-center mb-6"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          animation: "offline-pulse 3s ease-in-out infinite",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <h1 className="text-lg font-bold text-[#ededed] mb-2">Sin conexión</h1>
      <p className="text-sm text-[#555] mb-8 max-w-xs leading-relaxed">
        No se puede conectar al servidor de KumaMap. Verificá tu conexión a internet.
      </p>

      <button
        onClick={handleRetry}
        disabled={retrying}
        className="px-6 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
        style={{
          background: "rgba(59,130,246,0.12)",
          border: "1px solid rgba(59,130,246,0.25)",
          color: "#60a5fa",
        }}
      >
        {retrying ? (
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
            </svg>
            Conectando...
          </span>
        ) : "Reintentar"}
      </button>

      <p className="text-[10px] text-[#333] mt-12">
        Las páginas visitadas previamente pueden estar disponibles offline
      </p>

      <style>{`
        @keyframes offline-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.02); }
          50% { box-shadow: 0 0 0 12px rgba(255,255,255,0.01); }
        }
      `}</style>
    </div>
  );
}
