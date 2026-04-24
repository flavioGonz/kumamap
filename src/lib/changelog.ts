// ── KumaMap Changelog ─────────────────────────────────────────────
// Add new entries at the TOP of the array (newest first).
// The app shows entries newer than what the user last dismissed.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const APP_VERSION = "2.3.0";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.3.0",
    date: "2026-04-24",
    title: "ONVIF Discovery, Dashboard de Camaras y MikroTik Refactoring",
    items: [
      "Dashboard de Camaras: nueva pagina /cameras con selector de mapa (cliente) y grilla de video en vivo (1x1, 2x2, 3x3, 4x4)",
      "PWA Camaras: tab Camaras en la barra inferior con selector de cliente y grilla movil optimizada",
      "ONVIF Auto-Discovery: boton 'Escanear red' en el editor de mapas y en el dashboard, escanea la red con WS-Discovery UDP multicast para detectar camaras automaticamente",
      "Modal ONVIF: credenciales configurables, timeout seleccionable, obtiene URI RTSP y snapshot de cada camara detectada",
      "Agregar camara desde ONVIF: un click crea el nodo en el mapa con icono, IP, stream RTSP y fabricante pre-configurados",
      "MikroTik seguridad: credenciales movidas de URL a POST body en todas las llamadas",
      "MikroTik TLS: agente HTTPS scoped por request en vez de bypass TLS global",
      "MikroTik modulo compartido: mikrotik-client.ts centraliza fetch, whitelist de paths y manejo de errores",
      "MikroTik whitelist: solo paths autorizados (/rest/system, /rest/interface, etc.) pueden consultarse via /api/mikrotik/query",
      "Pestana MikroTik solo visible para routers con brand=mikrotik (no para todos los routers)",
      "Selector de marca en rack device editor: MikroTik, Cisco, Ubiquiti, Juniper, Huawei, TP-Link y otros",
      "Ventanas de video redimensionables: drag por bordes/esquinas, multi-view hasta 4 camaras simultaneas con posicionamiento en cuadrantes",
      "Link tooltip: click en un enlace del mapa muestra tooltip con informacion del link (tipo, velocidad, equipos conectados)",
      "Fix PWA: proxy auth ahora permite /api/maps GET sin autenticacion para la app movil",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-04-14",
    title: "PWA Mobile, RTSP Liveview y Herramientas de Operaciones",
    items: [
      "PWA Mobile: app instalable en celular con lista de mapas, visor de mapa con Leaflet, detalle de nodos y modo offline (/mobile)",
      "RTSP Liveview: transcoding server-side RTSP → MJPEG via ffmpeg con FPS configurable y templates para Hikvision, Dahua y Axis",
      "Click en cámara abre popup PiP con stream en vivo (antes requería click derecho)",
      "Fix proxy de cámaras: IPs privadas ahora permitidas (cámaras están en red local)",
      "Fix timer de downtime: cada monitor muestra su tiempo individual real desde la DB en vez de 00:00:00",
      "Health Check: /api/health verifica conexión Kuma, DB, disco, memoria y frescura de heartbeats",
      "Deploy automático: botón para desplegar a servidores remotos via SSH (git pull → build → pm2 restart)",
      "Métricas de rendimiento del servidor en tiempo real",
      "Node Templates: 17 plantillas predefinidas en 6 categorías para crear nodos rápidamente",
      "Auto-Discovery: escaneo de subred con ping sweep + DNS reverse lookup para descubrir hosts",
      "Modularización: 3 modals extraídos de LeafletMapView (-310 líneas)",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-04-13",
    title: "Robustez y Refactoring",
    items: [
      "safeFetch centralizado: ~45 fetch() reemplazados con manejo de errores unificado",
      "safeJsonParse tipado: 55+ JSON.parse inseguros reemplazados con tipos TypeScript estrictos",
      "Interfaces NodeCustomData, EdgeCustomData, RackDeviceSummary para custom_data tipado",
      "Fix: navegación a mapas enlazados — la página parpadeaba sin abrir el mapa",
      "Custom hooks extraídos: useUndoHistory, useMapVisibility, useAnimationTimers, useAlertSound, useMapKeyboard",
      "Reducción de ~60 a ~35 usos de 'any' en LeafletMapView",
      "Reducción de ~100 líneas en LeafletMapView via extracción de hooks",
      "Middleware de autenticación: todas las rutas API ahora requieren sesión válida",
      "Tokens de sesión criptográficos (HMAC-SHA256) en vez de base64 predecible",
      "Rate limiting en login: 5 intentos / 15 min por IP",
      "RackDesignerDrawer modularizado: 3386→1133 líneas (-67%) con 9 sub-módulos en rack/",
      "Tipos compartidos de rack extraídos a rack-types.ts (RackDevice, PatchPort, SwitchPort, etc.)",
      "RackWizard, DeviceEditor, DeviceList, PortEditors extraídos como componentes independientes",
    ],
  },
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
