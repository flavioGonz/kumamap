/** Light haptic tap (1 short vibration) — no-op when API unavailable */
export function hapticTap() {
  try { navigator.vibrate?.(8); } catch {}
}

/** Medium haptic (double pulse) */
export function hapticMedium() {
  try { navigator.vibrate?.([12, 40, 12]); } catch {}
}

/** Success haptic (triple gentle pulse) */
export function hapticSuccess() {
  try { navigator.vibrate?.([8, 30, 8, 30, 8]); } catch {}
}

/** Error haptic (long buzz) */
export function hapticError() {
  try { navigator.vibrate?.(80); } catch {}
}
