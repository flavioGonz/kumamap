"use client";

export default function MobileOffline() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div
        className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#666"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
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
      <p className="text-sm text-[#666] mb-6 max-w-xs">
        No se puede conectar al servidor. Verifica tu conexión a internet e intenta de nuevo.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
        style={{
          background: "rgba(59,130,246,0.15)",
          border: "1px solid rgba(59,130,246,0.3)",
          color: "#60a5fa",
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
