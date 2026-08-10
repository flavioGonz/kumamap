/**
 * Cobre (UTP) — regla de largo máximo del cableado de cobre.
 *
 * Ethernet sobre par trenzado tiene ~100 m de límite (90 m de enlace permanente
 * + ~10 m de patch cords). KumaMap AVISA pero NO bloquea: se puede dejar un
 * enlace de cobre más largo, pero se marca visualmente y en el popup del enlace.
 *
 * Sólo aplica a enlaces con EdgeCustomData.linkType === "copper".
 */

export const COPPER_MAX_M = 100; // límite duro → alerta (rojo)
export const COPPER_WARN_M = 90; // margen de diseño → aviso (ámbar)

export type CopperStatus = "ok" | "warn" | "alert";

export function copperStatus(meters: number | null | undefined): CopperStatus {
  if (meters == null || !isFinite(meters)) return "ok";
  if (meters > COPPER_MAX_M) return "alert";
  if (meters >= COPPER_WARN_M) return "warn";
  return "ok";
}

export interface CopperStyle {
  status: CopperStatus;
  /** color de línea a aplicar cuando status !== "ok" ("" si ok) */
  color: string;
  /** emoji para popup/toast ("" si ok) */
  icon: string;
  /** texto corto para popup/toast ("" si ok) */
  label: string;
}

export function copperStyle(meters: number | null | undefined): CopperStyle {
  const status = copperStatus(meters);
  if (status === "alert") {
    return { status, color: "#ef4444", icon: "⚠️", label: `Supera ${COPPER_MAX_M} m` };
  }
  if (status === "warn") {
    return { status, color: "#f59e0b", icon: "⚠️", label: `Cerca del límite de ${COPPER_MAX_M} m` };
  }
  return { status, color: "", icon: "", label: "" };
}
