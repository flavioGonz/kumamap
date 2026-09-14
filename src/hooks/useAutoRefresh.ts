"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/SileoToast";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * Auto-refresh the page after a period of inactivity to prevent memory leaks.
 *
 * - After `idleMinutes` of no user interaction, shows a toast and reloads.
 * - Any mouse/keyboard/touch activity resets the idle timer.
 * - Uses a hard reload to fully clear Leaflet/marker memory.
 *
 * @param idleMinutes  Minutes of inactivity before refresh (default: 20)
 * @param enabled      Pass false to disable (e.g. during editing)
 */
export function useAutoRefresh(idleMinutes = 20, enabled = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const idleMs = idleMinutes * 60 * 1000;
    const warningMs = idleMs - 30_000; // warn 30s before reload

    function clearTimers() {
      if (warningRef.current) { clearTimeout(warningRef.current); warningRef.current = null; }
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }

    function scheduleRefresh() {
      clearTimers();

      // Show warning toast 30 seconds before reload
      warningRef.current = setTimeout(() => {
        toast.info("Recarga automática en 30s", {
          description: "Mové el mouse para cancelar",
          duration: 28_000,
          id: "auto-refresh-warning",
        });
      }, Math.max(warningMs, 0));

      // Actual reload
      timerRef.current = setTimeout(() => {
        toast.dismiss("auto-refresh-warning");
        window.location.reload();
      }, idleMs);
    }

    function resetTimer() {
      // Dismiss warning toast if it was showing
      toast.dismiss("auto-refresh-warning");
      scheduleRefresh();
    }

    // Track user activity
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    // Start the initial timer
    scheduleRefresh();

    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [idleMinutes, enabled]);
}
