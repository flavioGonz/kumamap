/**
 * Medición de distancias sobre el mapa.
 *
 * - Mapa geográfico (background_type "livemap"): Leaflet usa un CRS real, así que
 *   `map.distance(a, b)` devuelve METROS reales. No hace falta calibrar.
 * - Mapa de imagen / grilla ("image" / "grid"): el CRS es L.CRS.Simple, así que
 *   `map.distance(a, b)` devuelve UNIDADES de mapa (≈ píxeles). Para pasar a metros
 *   se multiplica por `metersPerUnit`, la calibración por-mapa que hace el usuario
 *   dibujando una referencia de largo conocido.
 *
 * a / b son [lat, lng] = [node.x, node.y].
 */

export type MapBackgroundType = "grid" | "image" | "livemap";

/** Interfaz estructural mínima de la instancia Leaflet (evita importar leaflet acá). */
export interface DistanceProvider {
  distance(a: [number, number], b: [number, number]): number;
}

export interface DistanceResult {
  /** metros reales, o null si no se puede resolver (imagen sin calibrar) */
  meters: number | null;
  /** unidades crudas del CRS (metros en livemap, ≈px en image/grid) */
  raw: number;
  /** true si `meters` es una medida real (livemap, o image/grid calibrado) */
  calibrated: boolean;
}

export function measure(
  map: DistanceProvider,
  a: [number, number],
  b: [number, number],
  backgroundType: MapBackgroundType,
  metersPerUnit?: number | null,
): DistanceResult {
  const raw = map.distance(a, b);
  if (backgroundType === "livemap") {
    return { meters: raw, raw, calibrated: true };
  }
  if (metersPerUnit != null && isFinite(metersPerUnit) && metersPerUnit > 0) {
    return { meters: raw * metersPerUnit, raw, calibrated: true };
  }
  return { meters: null, raw, calibrated: false };
}

/**
 * metros-por-unidad a partir de una referencia dibujada:
 * `rawUnits` = distancia cruda (map.distance) de la referencia,
 * `realMeters` = cuánto mide de verdad esa referencia.
 */
export function calibrationFromReference(
  rawUnits: number,
  realMeters: number,
): number | null {
  if (!rawUnits || !isFinite(rawUnits) || rawUnits <= 0) return null;
  if (!realMeters || !isFinite(realMeters) || realMeters <= 0) return null;
  return realMeters / rawUnits;
}

export function formatMeters(m: number | null | undefined): string {
  if (m == null || !isFinite(m)) return "—";
  if (m < 1) return `${Math.round(m * 100)} cm`;
  if (m < 1000) return `${m.toFixed(m < 10 ? 1 : 0)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}
