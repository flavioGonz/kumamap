/**
 * Node Templates — predefined presets for common network device types.
 * Each template defines a default label, icon, color, and custom_data fields
 * so users can quickly add devices without manual configuration.
 */

export interface NodeTemplate {
  /** Unique key for this template */
  id: string;
  /** Display name shown in the template picker */
  name: string;
  /** Category for grouping in the UI */
  category: "red" | "seguridad" | "almacenamiento" | "energía" | "acceso" | "otro";
  /** Default label for new nodes created from this template */
  defaultLabel: string;
  /** Icon key from map-icons.ts */
  icon: string;
  /** Default node color (hex or empty for auto) */
  color: string;
  /** Default node size multiplier */
  size: number;
  /** Pre-filled custom_data fields */
  customData: Record<string, unknown>;
  /** Short description shown in the picker */
  description: string;
}

export const NODE_TEMPLATE_CATEGORIES: Record<string, { label: string; color: string }> = {
  red: { label: "Red", color: "#3b82f6" },
  seguridad: { label: "Seguridad", color: "#ef4444" },
  almacenamiento: { label: "Almacenamiento", color: "#8b5cf6" },
  energía: { label: "Energía", color: "#f59e0b" },
  acceso: { label: "Acceso", color: "#22c55e" },
  otro: { label: "Otro", color: "#6b7280" },
};

export const DEFAULT_TEMPLATES: NodeTemplate[] = [
  // ── Red ──
  {
    id: "switch-access",
    name: "Switch de acceso",
    category: "red",
    defaultLabel: "Switch acceso",
    icon: "switch",
    color: "#3b82f6",
    size: 1.0,
    customData: {},
    description: "Switch L2 para distribución de red local",
  },
  {
    id: "switch-core",
    name: "Switch core",
    category: "red",
    defaultLabel: "Switch core",
    icon: "switch",
    color: "#06b6d4",
    size: 1.4,
    customData: {},
    description: "Switch L3 troncal / núcleo de red",
  },
  {
    id: "router",
    name: "Router",
    category: "red",
    defaultLabel: "Router",
    icon: "router",
    color: "#22c55e",
    size: 1.2,
    customData: {},
    description: "Router de borde o distribución",
  },
  {
    id: "ap-wifi",
    name: "Access Point WiFi",
    category: "red",
    defaultLabel: "AP WiFi",
    icon: "wifi",
    color: "#8b5cf6",
    size: 0.8,
    customData: {},
    description: "Punto de acceso inalámbrico",
  },
  {
    id: "firewall",
    name: "Firewall",
    category: "red",
    defaultLabel: "Firewall",
    icon: "firewall",
    color: "#ef4444",
    size: 1.2,
    customData: {},
    description: "Firewall / UTM perimetral",
  },
  {
    id: "antenna",
    name: "Antena / Radio enlace",
    category: "red",
    defaultLabel: "Antena",
    icon: "antenna",
    color: "#f59e0b",
    size: 1.0,
    customData: {},
    description: "Antena punto a punto o sectorial",
  },

  // ── Seguridad ──
  {
    id: "camera-ip",
    name: "Cámara IP",
    category: "seguridad",
    defaultLabel: "Cámara",
    icon: "camera",
    color: "#ef4444",
    size: 0.8,
    customData: {},
    description: "Cámara IP de vigilancia (sin campo de visión)",
  },
  {
    id: "nvr",
    name: "NVR / DVR",
    category: "seguridad",
    defaultLabel: "NVR",
    icon: "harddrive",
    color: "#ef4444",
    size: 1.0,
    customData: {},
    description: "Grabador de video en red",
  },

  // ── Almacenamiento ──
  {
    id: "server",
    name: "Servidor",
    category: "almacenamiento",
    defaultLabel: "Servidor",
    icon: "server",
    color: "",
    size: 1.2,
    customData: {},
    description: "Servidor físico o virtual",
  },
  {
    id: "nas",
    name: "NAS",
    category: "almacenamiento",
    defaultLabel: "NAS",
    icon: "nas",
    color: "#8b5cf6",
    size: 1.0,
    customData: {},
    description: "Almacenamiento conectado a red",
  },
  {
    id: "database",
    name: "Base de datos",
    category: "almacenamiento",
    defaultLabel: "DB Server",
    icon: "database",
    color: "#f59e0b",
    size: 1.0,
    customData: {},
    description: "Servidor de base de datos",
  },

  // ── Energía ──
  {
    id: "ups",
    name: "UPS",
    category: "energía",
    defaultLabel: "UPS",
    icon: "ups",
    color: "#f59e0b",
    size: 1.0,
    customData: {},
    description: "Sistema de alimentación ininterrumpida",
  },

  // ── Acceso ──
  {
    id: "pc-workstation",
    name: "PC / Workstation",
    category: "acceso",
    defaultLabel: "PC",
    icon: "monitor",
    color: "",
    size: 0.8,
    customData: {},
    description: "Estación de trabajo o desktop",
  },
  {
    id: "printer",
    name: "Impresora",
    category: "acceso",
    defaultLabel: "Impresora",
    icon: "printer",
    color: "#6b7280",
    size: 0.8,
    customData: {},
    description: "Impresora de red",
  },
  {
    id: "phone-ip",
    name: "Teléfono IP",
    category: "acceso",
    defaultLabel: "Teléfono IP",
    icon: "phone",
    color: "#22c55e",
    size: 0.6,
    customData: {},
    description: "Teléfono VoIP",
  },

  // ── Otro ──
  {
    id: "cloud-service",
    name: "Servicio cloud",
    category: "otro",
    defaultLabel: "Cloud",
    icon: "cloud",
    color: "#60a5fa",
    size: 1.0,
    customData: {},
    description: "Servicio en la nube (AWS, Azure, etc.)",
  },
  {
    id: "generic",
    name: "Dispositivo genérico",
    category: "otro",
    defaultLabel: "Dispositivo",
    icon: "circle",
    color: "",
    size: 1.0,
    customData: {},
    description: "Cualquier dispositivo sin tipo específico",
  },
];
