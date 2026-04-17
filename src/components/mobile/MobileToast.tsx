"use client";

import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { hapticTap } from "@/lib/haptics";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

const ToastContext = createContext<{
  show: (message: string, type?: ToastType) => void;
}>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

/* ── Icons (inline SVG, 16×16) ── */
const icons: Record<ToastType, ReactNode> = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
};

/* ── Color palettes ── */
const palettes: Record<ToastType, { bg: string; border: string; text: string; glow: string }> = {
  success: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.2)", text: "#86efac", glow: "0 4px 24px rgba(34,197,94,0.15)" },
  error:   { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.2)", text: "#fca5a5", glow: "0 4px 24px rgba(239,68,68,0.15)" },
  warning: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.2)", text: "#fde68a", glow: "0 4px 24px rgba(245,158,11,0.15)" },
  info:    { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.2)", text: "#93c5fd", glow: "0 4px 24px rgba(59,130,246,0.15)" },
};

/* ── Individual toast with swipe-to-dismiss ── */
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const palette = palettes[toast.type];
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    swiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping.current || !ref.current) return;
    const dx = e.touches[0].clientX - startX.current;
    currentX.current = dx;
    ref.current.style.transform = `translateX(${dx}px)`;
    ref.current.style.opacity = `${Math.max(0, 1 - Math.abs(dx) / 200)}`;
  };

  const handleTouchEnd = () => {
    swiping.current = false;
    if (Math.abs(currentX.current) > 80) {
      hapticTap();
      onDismiss(toast.id);
    } else if (ref.current) {
      ref.current.style.transform = "translateX(0)";
      ref.current.style.opacity = "1";
    }
    currentX.current = 0;
  };

  return (
    <div
      ref={ref}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="pointer-events-auto"
      style={{
        transition: swiping.current ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
        animation: toast.exiting ? "toast-out 0.25s ease-in forwards" : "toast-in 0.35s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div
        className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5"
        style={{
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: palette.glow,
        }}
      >
        <div className="shrink-0">{icons[toast.type]}</div>
        <span className="text-[12px] font-semibold leading-tight" style={{ color: palette.text }}>
          {toast.message}
        </span>
      </div>
    </div>
  );
}

/* ── Provider ── */
export function MobileToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 250);
  }, []);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((prev) => {
      // Max 3 visible toasts
      const next = prev.length >= 3 ? prev.slice(1) : prev;
      return [...next, { id, message, type }];
    });
    // Auto-dismiss after 2.5s
    setTimeout(() => dismiss(id), 2500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Toast container — centered at top, above everything */}
      <div
        className="fixed left-0 right-0 z-[9999] flex flex-col items-center gap-1.5 pointer-events-none px-6"
        style={{ top: "max(env(safe-area-inset-top, 12px), 12px)" }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
      <style>{`
        @keyframes toast-in {
          0% { opacity: 0; transform: translateY(-16px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-out {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-12px) scale(0.92); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
