"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   Sileo Toast — silent, smooth, animated notification system
   Drop-in replacement for sonner's toast API
   ═══════════════════════════════════════════════════════════════════════ */

type ToastType = "success" | "error" | "info" | "warning";

interface SileoToast {
  id: string;
  message: string;
  description?: string;
  type: ToastType;
  icon?: ReactNode;
  duration: number;
  exiting?: boolean;
  ts: number;
}

/* ── Event bus (allows toast() from non-React code) ── */
type Listener = (t: SileoToast) => void;
type DismissListener = (id: string) => void;
const listeners: Set<Listener> = new Set();
const dismissListeners: Set<DismissListener> = new Set();
let _idCounter = 0;

function emit(t: SileoToast) {
  listeners.forEach((fn) => fn(t));
}

function emitDismiss(id: string) {
  dismissListeners.forEach((fn) => fn(id));
}

/* ── Public toast API (matches Sonner interface) ── */
interface ToastOptions {
  description?: string;
  duration?: number;
  id?: string;
  icon?: ReactNode | string;
}

function createToast(message: string, type: ToastType, opts?: ToastOptions): string {
  const id = opts?.id || `sileo-${++_idCounter}`;
  const icon = typeof opts?.icon === "string" ? <span>{opts.icon}</span> : opts?.icon;
  emit({
    id,
    message,
    description: opts?.description,
    type,
    icon: icon || undefined,
    duration: opts?.duration ?? (type === "error" ? 5000 : 3500),
    ts: Date.now(),
  });
  return id;
}

function toastFn(message: string, opts?: ToastOptions) {
  return createToast(message, "info", opts);
}
toastFn.success = (msg: string, opts?: ToastOptions) => createToast(msg, "success", opts);
toastFn.error = (msg: string, opts?: ToastOptions) => createToast(msg, "error", opts);
toastFn.info = (msg: string, opts?: ToastOptions) => createToast(msg, "info", opts);
toastFn.warning = (msg: string, opts?: ToastOptions) => createToast(msg, "warning", opts);
toastFn.dismiss = (id: string | number) => emitDismiss(String(id));

export { toastFn as toast };

/* ── Animated SVG Icons ── */

function SuccessIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2" opacity="0.25">
        <animate attributeName="opacity" values="0.15;0.35;0.15" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2" strokeDasharray="63" strokeDashoffset="63" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from="63" to="0" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" />
      </circle>
      <polyline points="8 12 11 15 16 9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14" strokeDashoffset="14">
        <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.3s" begin="0.35s" fill="freeze" />
      </polyline>
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2" opacity="0.25">
        <animate attributeName="r" values="10;10.5;10" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2" strokeDasharray="63" strokeDashoffset="63" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from="63" to="0" dur="0.45s" fill="freeze" />
      </circle>
      <g strokeDasharray="8.5" strokeDashoffset="8.5">
        <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
          <animate attributeName="stroke-dashoffset" from="8.5" to="0" dur="0.25s" begin="0.3s" fill="freeze" />
        </line>
        <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
          <animate attributeName="stroke-dashoffset" from="8.5" to="0" dur="0.25s" begin="0.45s" fill="freeze" />
        </line>
      </g>
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="2" opacity="0.25">
        <animate attributeName="opacity" values="0.15;0.3;0.15" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="2" strokeDasharray="63" strokeDashoffset="63" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from="63" to="0" dur="0.5s" fill="freeze" />
      </circle>
      <circle cx="12" cy="8" r="1" fill="#3b82f6" opacity="0">
        <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="0.4s" fill="freeze" />
      </circle>
      <line x1="12" y1="12" x2="12" y2="16" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4" strokeDashoffset="4">
        <animate attributeName="stroke-dashoffset" from="4" to="0" dur="0.2s" begin="0.5s" fill="freeze" />
      </line>
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" opacity="0.25">
        <animate attributeName="opacity" values="0.15;0.4;0.15" dur="1.8s" repeatCount="indefinite" />
      </path>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset="60">
        <animate attributeName="stroke-dashoffset" from="60" to="0" dur="0.5s" fill="freeze" />
      </path>
      <line x1="12" y1="10" x2="12" y2="14" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" opacity="0">
        <animate attributeName="opacity" from="0" to="1" dur="0.15s" begin="0.4s" fill="freeze" />
      </line>
      <circle cx="12" cy="17" r="1" fill="#f59e0b" opacity="0">
        <animate attributeName="opacity" from="0" to="1" dur="0.15s" begin="0.5s" fill="freeze" />
        <animate attributeName="r" values="0;1.2;1" dur="0.2s" begin="0.5s" fill="freeze" />
      </circle>
    </svg>
  );
}

const defaultIcons: Record<ToastType, ReactNode> = {
  success: <SuccessIcon />,
  error: <ErrorIcon />,
  info: <InfoIcon />,
  warning: <WarningIcon />,
};

/* ── Color palettes ── */
const palettes: Record<ToastType, { bg: string; border: string; text: string; desc: string; glow: string; progress: string }> = {
  success: {
    bg: "rgba(22, 101, 52, 0.92)",
    border: "rgba(34,197,94,0.35)",
    text: "#dcfce7",
    desc: "#86efac",
    glow: "0 8px 32px rgba(34,197,94,0.25), 0 0 0 1px rgba(34,197,94,0.1)",
    progress: "#22c55e",
  },
  error: {
    bg: "rgba(127, 29, 29, 0.92)",
    border: "rgba(239,68,68,0.35)",
    text: "#fee2e2",
    desc: "#fca5a5",
    glow: "0 8px 32px rgba(239,68,68,0.25), 0 0 0 1px rgba(239,68,68,0.1)",
    progress: "#ef4444",
  },
  warning: {
    bg: "rgba(113, 63, 18, 0.92)",
    border: "rgba(245,158,11,0.35)",
    text: "#fef3c7",
    desc: "#fde68a",
    glow: "0 8px 32px rgba(245,158,11,0.2), 0 0 0 1px rgba(245,158,11,0.1)",
    progress: "#f59e0b",
  },
  info: {
    bg: "rgba(30, 58, 138, 0.92)",
    border: "rgba(59,130,246,0.35)",
    text: "#dbeafe",
    desc: "#93c5fd",
    glow: "0 8px 32px rgba(59,130,246,0.2), 0 0 0 1px rgba(59,130,246,0.1)",
    progress: "#3b82f6",
  },
};

/* ── Individual toast ── */
function SileoToastItem({ toast, onDismiss }: { toast: SileoToast; onDismiss: (id: string) => void }) {
  const p = palettes[toast.type];
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!progressRef.current) return;
    // Start the progress bar animation
    requestAnimationFrame(() => {
      if (progressRef.current) {
        progressRef.current.style.transition = `width ${toast.duration}ms linear`;
        progressRef.current.style.width = "0%";
      }
    });
  }, [toast.duration]);

  return (
    <div
      style={{
        animation: toast.exiting
          ? "sileo-out 0.3s cubic-bezier(0.4, 0, 1, 1) forwards"
          : "sileo-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: "12px 14px",
          borderRadius: "14px",
          background: p.bg,
          border: `1px solid ${p.border}`,
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: p.glow,
          minWidth: "240px",
          maxWidth: "360px",
          overflow: "hidden",
          cursor: "pointer",
        }}
        onClick={() => onDismiss(toast.id)}
      >
        {/* Icon */}
        <div style={{ flexShrink: 0, marginTop: "1px" }}>
          {toast.icon || defaultIcons[toast.type]}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: p.text,
              lineHeight: 1.35,
              letterSpacing: "-0.01em",
            }}
          >
            {toast.message}
          </div>
          {toast.description && (
            <div
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: p.desc,
                marginTop: "3px",
                lineHeight: 1.3,
                opacity: 0.85,
              }}
            >
              {toast.description}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
          style={{
            flexShrink: 0,
            width: "18px",
            height: "18px",
            borderRadius: "6px",
            border: "none",
            background: "rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: p.text,
            opacity: 0.5,
            transition: "opacity 0.15s, background 0.15s",
            marginTop: "1px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Progress bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "2px",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <div
            ref={progressRef}
            style={{
              width: "100%",
              height: "100%",
              background: p.progress,
              borderRadius: "0 1px 0 0",
              opacity: 0.6,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Toaster container (renders the stack) ── */
export function SileoToaster() {
  const [toasts, setToasts] = useState<SileoToast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Clear auto-dismiss timer
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    // Mark exiting
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after animation
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  useEffect(() => {
    const handleToast = (t: SileoToast) => {
      setToasts((prev) => {
        // If same id exists, replace it
        const filtered = prev.filter((p) => p.id !== t.id);
        // Max 5 toasts visible
        const trimmed = filtered.length >= 5 ? filtered.slice(1) : filtered;
        return [...trimmed, t];
      });
      // Auto-dismiss
      const timer = setTimeout(() => dismiss(t.id), t.duration);
      // Clear any existing timer for same id
      const old = timers.current.get(t.id);
      if (old) clearTimeout(old);
      timers.current.set(t.id, timer);
    };

    const handleDismiss = (id: string) => dismiss(id);

    listeners.add(handleToast);
    dismissListeners.add(handleDismiss);
    return () => {
      listeners.delete(handleToast);
      dismissListeners.delete(handleDismiss);
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "none",
          alignItems: "flex-end",
        }}
      >
        {toasts.map((t) => (
          <SileoToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
      <style>{`
        @keyframes sileo-in {
          0% { opacity: 0; transform: translateX(80px) scale(0.92); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes sileo-out {
          0% { opacity: 1; transform: translateX(0) scale(1); }
          100% { opacity: 0; transform: translateX(100px) scale(0.9); }
        }
      `}</style>
    </>
  );
}
