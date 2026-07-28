/**
 * Separación — líneas de "Separación" para dibujar paredes y canalizaciones
 * sobre el plano (no son enlaces de red: son anotaciones estáticas y NO
 * cambian de color según el estado up/down de ningún monitor).
 *
 * Dos familias:
 *   - Pared:        ladrillo, hormigón, durlock, vidrio
 *   - Canalización: bandeja aérea, caño galvanizado, ducto subterráneo, ducto plástico
 *
 * Cada subtipo tiene su color y patrón de línea punteada propios (distintos del
 * wireless naranja). `dash` es un valor de strokeDasharray / dashArray de SVG-Leaflet.
 */

export type SepKind = "pared" | "canalizacion";

export interface SeparationStyle {
  label: string;
  kind: SepKind;
  color: string;
  dash: string;
  weight: number;
}

export const SEPARATION_TYPES: Record<string, SeparationStyle> = {
  // ── Paredes (tonos tierra / gris) ──
  ladrillo:    { label: "Pared · Ladrillo/Mampostería", kind: "pared",        color: "#b45309", dash: "12,7",     weight: 5 },
  hormigon:    { label: "Pared · Hormigón",             kind: "pared",        color: "#6b7280", dash: "12,7",     weight: 6 },
  durlock:     { label: "Pared · Durlock (yeso)",       kind: "pared",        color: "#a8a29e", dash: "9,7",      weight: 4 },
  vidrio:      { label: "Pared · Vidrio",               kind: "pared",        color: "#38bdf8", dash: "4,6",      weight: 4 },
  // ── Canalizaciones (cian / slate / violeta / magenta) ──
  bandeja:     { label: "Canalización · Bandeja aérea",     kind: "canalizacion", color: "#0891b2", dash: "2,7",      weight: 4 },
  galvanizado: { label: "Canalización · Caño galvanizado",  kind: "canalizacion", color: "#64748b", dash: "14,5,3,5",  weight: 4 },
  subterraneo: { label: "Canalización · Ducto subterráneo", kind: "canalizacion", color: "#7c3aed", dash: "3,9",      weight: 4 },
  plastico:    { label: "Canalización · Ducto plástico",    kind: "canalizacion", color: "#db2777", dash: "8,6",      weight: 4 },
};

const FALLBACK: SeparationStyle = { label: "Separación", kind: "pared", color: "#9ca3af", dash: "10,7", weight: 4 };

export function separationStyle(sepType?: string): SeparationStyle {
  return (sepType && SEPARATION_TYPES[sepType]) || FALLBACK;
}
