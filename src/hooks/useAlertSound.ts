"use client";

import { useCallback } from "react";

/**
 * Returns a callback that plays a short two-tone beep for alert notifications.
 * Uses the Web Audio API — silently fails if unavailable.
 */
export function useAlertSound() {
  const playAlertSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      gain.gain.value = 0.15;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  return playAlertSound;
}
