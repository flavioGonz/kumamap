/**
 * Centralized type definitions for KumaMap
 * Single source of truth for shared interfaces used across client & server code.
 */


// ── Kuma Monitor Types ──

export interface KumaMonitor {
  id: number;
  name: string;
  type: string;
  url: string;
  hostname: string;
  port?: number;
  interval?: number;
  active: boolean;
  parent?: number | null;
  tags?: { name: string; color: string }[];
  status?: number; // 0=down, 1=up, 2=pending, 3=maintenance
  ping?: number | null;
  msg?: string;
  uptime24?: number;
  downTime?: string; // ISO timestamp of when this monitor first went DOWN in the current streak

  // ── Data Uptime Kuma already publishes but KumaMap used to discard ──────────
  /** Uptime ratio (0–1) per period in hours. Kuma emits 1, 24, 720, 8760. */
  uptime?: Record<number, number>;
  /** Rolling average ping (ms) as computed by Kuma itself. */
  avgPing?: number | null;
  /** TLS certificate info for https monitors — surfaces upcoming expiries. */
  certExpiryDays?: number | null;
  certValid?: boolean;
  /** True while the monitor sits inside a scheduled maintenance window. */
  maintenance?: boolean;

  /** monitor-ng: detalle de sensores del agente (solo type "monitor-ng") */
  mng?: {
    state: string;
    ts: string;
    ok: number;
    warn: number;
    crit: number;
    stale: boolean;
    metrics: { id: string; state: string; value: string; label?: string }[];
  };
}

/** Payload of Kuma's `certInfo` event (JSON string in the wire format). */
export interface KumaCertInfo {
  valid?: boolean;
  certInfo?: {
    daysRemaining?: number;
    validTo?: string;
    issuer?: unknown;
    subject?: unknown;
  } | null;
}

export interface KumaHeartbeat {
  monitorID: number;
  status: number;
  time: string;
  msg: string;
  ping: number | null;
  duration: number;
}

// ── Node / Edge Custom Data (parsed from JSON stored in custom_data column) ──

/** Parsed shape of `node.custom_data` for regular nodes, cameras, labels, polygons, racks, etc. */
export interface NodeCustomData {
  // Common
  type?: string;              // e.g. "rack", "polygon", "camera"
  ip?: string;
  mac?: string;
  nodeSize?: number;
  nodeColor?: string;
  labelHidden?: boolean;
  labelSize?: number;
  description?: string;

  // Camera / FOV
  rotation?: number;
  fov?: number;
  fovRange?: number;
  fovColor?: string;
  fovOpacity?: number;
  streamType?: string;
  streamUrl?: string;
  /** Server-signed opaque stream token — preferred over `streamUrl` for proxy calls. */
  streamRef?: string;
  snapshotInterval?: number;
  rtspFps?: number;
  cameraType?: "ip" | "lpr" | "face";  // Camera intelligence type
  eventEndpoint?: string;               // Auto-generated webhook path for Hikvision events

  // Text label
  fontSize?: number;
  color?: string;
  bgEnabled?: boolean;

  // Polygon
  points?: [number, number][];
  fillOpacity?: number;

  // Linked maps / submaps
  linkedMaps?: { id: string; name: string }[];
  submapId?: string;
  submapName?: string;

  // Rack
  devices?: RackDeviceSummary[];
  totalUnits?: number;

  // Antenna / PTP Link
  antennaType?: "ptp" | "ptmp" | "omni" | "sector";  // Point-to-point, Point-to-multipoint, Omni, Sector
  frequency?: string;       // e.g. "5.8 GHz", "2.4 GHz", "60 GHz"
  antennaGain?: number;     // dBi
  txPower?: number;         // dBm
  beamWidth?: number;       // degrees (horizontal beam width for rendering)
  beamRange?: number;       // coverage range in map units
  beamColor?: string;       // color for the beam visualization
  ssid?: string;            // wireless SSID
  bandwidth?: string;       // e.g. "20 MHz", "40 MHz", "80 MHz"
  protocol?: string;        // e.g. "802.11ac", "AirMax", "NanoBeam"
  peerNodeId?: string;      // ID of the other antenna in a PTP pair

  // Panel de UPS fijado al mapa: vuelve a abrirse solo al entrar
  upsPanelFijo?: boolean;
  /** Contraído: sólo el renglón de resumen, para poder fijar varias UPS. */
  upsPanelMini?: boolean;
  upsPanelPos?: [number, number];

  // Credentials (stored locally)
  credUser?: string;
  credPass?: string;

  // SNMP
  snmpMonitorId?: number;

  // UPS monitoring — field names must match what src/app/api/ups/poll reads
  upsProtocol?: "snmp" | "nut";
  upsSnmpCommunity?: string;  // SNMP community for UPS polling (default: "public")
  nutPort?: number;           // default 3493
  nutUpsName?: string;        // ups.conf section name
  nutUser?: string;
  nutPassword?: string;
  kumaMonitorId?: number | null;
  alertChargeBelow?: number;
  alertLoadAbove?: number;
  alertRuntimeBelow?: number;

  // Allow additional dynamic fields
  [key: string]: unknown;
}

/** Minimal rack device shape used in map node custom_data (full type lives in RackDesignerDrawer). */
export interface RackDeviceSummary {
  label?: string;
  type?: string;
  unit?: number;
  sizeUnits?: number;
  monitorId?: number;
  brand?: string;
  model?: string;
  switchPorts?: { port: number; label?: string; speed?: string; connected?: boolean; vlan?: string }[];
  ports?: { port: number; label?: string; connected?: boolean; destination?: string }[];
  routerInterfaces?: { id: string; name: string; type?: string; ipAddress?: string; connected?: boolean }[];
  [key: string]: unknown;
}

/** Parsed shape of `edge.custom_data` for link/edge metadata. */
export interface EdgeCustomData {
  linkType?: "ethernet" | "fiber" | "copper" | "wireless" | "vpn" | "separation" | string;
  /** For linkType "separation": wall vs conduit/tray. Static annotation, never status-colored. */
  sepKind?: "pared" | "canalizacion";
  /** For linkType "separation": specific material/conduit subtype (key into SEPARATION_TYPES). */
  sepType?: string;
  sourceInterface?: string;
  targetInterface?: string;
  snmpMonitorId?: number;
  hideTraffic?: boolean;
  trafficLabelPos?: [number, number];
  /** MikroTik direct traffic source — polls router REST API for live bps */
  mikrotikTraffic?: {
    host: string;
    user: string;
    pass: string;
    interface: string;
    port?: number;
  };
  [key: string]: unknown;
}

// ── Map Data Types ──

export interface SavedNode {
  id: string;
  kuma_monitor_id?: number | null;
  label: string;
  x: number;
  y: number;
  icon: string;
  custom_data?: string | null;
}

export interface SavedEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  label?: string;
  color?: string;
  custom_data?: string;
}

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

// ── Timeline / Alert Types ──

export interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  status: number;
  prevStatus: number;
  time: string;
  msg: string;
  ping: number | null;
  duration: number;
}

// ── Hikvision Camera Event Types ──

export type HikEventType = "anpr" | "face" | "vmd" | "line" | "field" | "tamper" | "unknown";

export interface HikEvent {
  id: string;               // unique event ID (uuid)
  nodeId: string;            // map node ID receiving this event
  mapId?: string;            // map the node belongs to
  eventType: HikEventType;
  timestamp: string;         // ISO datetime
  cameraIp: string;
  channelId?: string;

  // ANPR / LPR fields
  licensePlate?: string;
  plateColor?: string;
  vehicleType?: string;
  vehicleColor?: string;
  vehicleBrand?: string;     // decoded from Hikvision brand code
  vehicleModel?: string;
  direction?: string;        // "forward" | "reverse" | "unknown"
  confidence?: number;       // 0–100
  listType?: string;         // "whiteList" | "blackList" | "otherList"

  // Face Recognition fields
  faceName?: string;         // matched person name (if any)
  faceScore?: number;        // detection confidence
  similarity?: number;       // match similarity %
  employeeNo?: string;       // matched employee ID

  // Image references
  plateImageId?: string;     // ID to fetch via /api/hik/images/[id]
  faceImageId?: string;
  fullImageId?: string;

  // Plate match result (from registry)
  matchResult?: "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";
  matchOwner?: string;       // owner name from plate record

  // Raw metadata
  macAddress?: string;       // camera MAC
}
