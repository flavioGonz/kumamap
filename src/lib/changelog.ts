// ── KumaMap Changelog ─────────────────────────────────────────────
// Add new entries at the TOP of the array (newest first).
// The app shows entries newer than what the user last dismissed.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const APP_VERSION = "2.0.0";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.0.0",
    date: "2026-04-10",
    title: "Centro de Alertas Profesional",
    items: [
      "Nueva página completa de Centro de Alertas (/alerts) con modo NOC",
      "Hub de seguimiento de alertas en panel lateral",
      "Filtro rápido de eventos seguidos",
      "Timer animado en tiempo real para caídas activas",
      "Notificación sonora para alertas GRAVE (beep two-tone)",
      "Aceptación masiva (ACK) de alertas por grupo",
      "Agrupación de eventos por monitor con acordeón colapsable",
      "KPIs en tiempo real: disponibilidad, graves, leves, seguidos",
      "Gráfico de tendencia de alertas por hora",
      "Filtros rápidos 15m / 30m / 1h / 6h / 24h / 3d / 7d / 30d",
      "Defaults optimizados: agrupado, 6h, solo caídas",
      "Fix: audio de alertas funciona correctamente (AudioContext unlock)",
      "Fix: alineación de íconos en exportación PNG de racks",
      "Mejoras visuales: gradientes, animaciones, glow effects",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-04-04",
    title: "Rack Designer y Exportaciones",
    items: [
      "Diseñador de racks con exportación PNG",
      "Reportes de rack en PDF y XLSX",
      "Importación de templates de rack",
      "Panel de Alert Manager en sidebar",
    ],
  },
];

// Key in localStorage to track last seen version
const CHANGELOG_SEEN_KEY = "kumamap-changelog-seen";

export function getLastSeenVersion(): string {
  if (typeof window === "undefined") return APP_VERSION;
  try {
    return localStorage.getItem(CHANGELOG_SEEN_KEY) || "";
  } catch {
    return "";
  }
}

export function markChangelogSeen(): void {
  try {
    localStorage.setItem(CHANGELOG_SEEN_KEY, APP_VERSION);
  } catch {}
}

export function hasNewChanges(): boolean {
  return getLastSeenVersion() !== APP_VERSION;
}

export function getNewEntries(): ChangelogEntry[] {
  const lastSeen = getLastSeenVersion();
  if (!lastSeen) return CHANGELOG;
  const idx = CHANGELOG.findIndex((e) => e.version === lastSeen);
  if (idx <= 0) return idx === 0 ? [] : CHANGELOG;
  return CHANGELOG.slice(0, idx);
}
