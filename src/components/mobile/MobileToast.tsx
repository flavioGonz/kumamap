"use client";

import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

const ToastContext = createContext<{
  show: (message: string, type?: Toast["type"]) => void;
}>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function MobileToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-16 left-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const colors = {
            success: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)", text: "#86efac" },
            error: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", text: "#fca5a5" },
            info: { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.3)", text: "#93c5fd" },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className="rounded-2xl px-4 py-2.5 text-xs font-bold text-center"
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
                backdropFilter: "blur(12px)",
                animation: "toast-in 0.3s ease-out",
              }}
            >
              {toast.message}
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
