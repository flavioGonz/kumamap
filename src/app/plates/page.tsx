"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiUrl } from "@/lib/api";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  Clock,
  Plus,
  Search,
  Trash2,
  Pencil,
  Download,
  History,
  ArrowLeft,
  ChevronDown,
  Car,
  BarChart3,
  X,
  Filter,
  AlertTriangle,
  Eye,
  Radar,
  TrendingUp,
  MapPin,
  Moon,
  Sun,
  Activity,
  ChevronRight,
  Camera,
  Fingerprint,
  RefreshCw,
  Video,
  Wifi,
  WifiOff,
  Volume2,
  Shield,
  Zap,
  Upload,
  ClipboardList,
  LogIn,
  LogOut,
  UserCheck,
  Users,
  Building2,
  ScanLine,
  FileSpreadsheet,
  CameraIcon,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  Loader2,
  ImageIcon,
} from "lucide-react";

// ── Plate Image with fallback ──
// Module-level cache of URLs that returned errors — survives re-renders/remounts
const _failedImgUrls = new Set<string>();

function PlateImg({
  src, alt, className, style, onClick,
}: {
  src: string; alt?: string; className?: string; style?: React.CSSProperties; onClick?: (e: React.MouseEvent) => void;
}) {
  // Use ref so setting error doesn't trigger parent re-render cascades
  const [error, setError] = useState(() => _failedImgUrls.has(src));
  const errorRef = useRef(error);

  // If src changes and the new src is already known-bad, sync immediately
  if (_failedImgUrls.has(src) && !errorRef.current) {
    errorRef.current = true;
    // We can't call setError during render, but we return the fallback below
  }

  const handleError = useCallback(() => {
    if (!errorRef.current) {
      errorRef.current = true;
      _failedImgUrls.add(src);
      setError(true);
    }
  }, [src]);

  if (error || _failedImgUrls.has(src)) {
    return (
      <div
        className={className}
        style={{
          ...style,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.15)",
          color: "rgba(255,255,255,0.25)", fontSize: "0.65rem", textAlign: "center",
        }}
        onClick={onClick}
      >
        <Camera className="w-4 h-4 opacity-30" />
      </div>
    );
  }
  return (
    <img
      src={src} alt={alt || ""} className={className} style={style}
      onClick={onClick}
      onError={handleError}
    />
  );
}

// ── Car brand logo lookup ──
// Uses logo.clearbit.com for high-quality brand logos (free, no API key needed)
const CAR_BRAND_DOMAINS: Record<string, string> = {
  toyota: "toyota.com",
  volkswagen: "volkswagen.com",
  vw: "volkswagen.com",
  chevrolet: "chevrolet.com",
  ford: "ford.com",
  fiat: "fiat.com",
  renault: "renault.com",
  peugeot: "peugeot.com",
  citroen: "citroen.com",
  honda: "honda.com",
  hyundai: "hyundai.com",
  kia: "kia.com",
  nissan: "nissan.com",
  mazda: "mazda.com",
  mitsubishi: "mitsubishi-motors.com",
  subaru: "subaru.com",
  suzuki: "suzuki.com",
  bmw: "bmw.com",
  "mercedes-benz": "mercedes-benz.com",
  mercedes: "mercedes-benz.com",
  audi: "audi.com",
  volvo: "volvocars.com",
  jeep: "jeep.com",
  ram: "ramtrucks.com",
  dodge: "dodge.com",
  chrysler: "chrysler.com",
  tesla: "tesla.com",
  lexus: "lexus.com",
  infiniti: "infiniti.com",
  acura: "acura.com",
  porsche: "porsche.com",
  "land rover": "landrover.com",
  jaguar: "jaguar.com",
  mini: "mini.com",
  seat: "seat.com",
  skoda: "skoda.com",
  chery: "cheryinternational.com",
  geely: "global.geely.com",
  byd: "byd.com",
  changan: "globalchangan.com",
  haval: "haval.com",
  greatwall: "gwm.com.cn",
  lifan: "lifan.com",
  jac: "jac.com.cn",
  ssangyong: "ssangyong.com",
  isuzu: "isuzu.com",
  daihatsu: "daihatsu.com",
  iveco: "iveco.com",
  scania: "scania.com",
  man: "man.eu",
  hino: "hino.com",
};

function getCarBrandLogo(brand: string): string | null {
  const normalized = brand.toLowerCase().trim();
  const domain = CAR_BRAND_DOMAINS[normalized];
  if (domain) return `https://logo.clearbit.com/${domain}`;
  // Try fuzzy match
  for (const [key, val] of Object.entries(CAR_BRAND_DOMAINS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return `https://logo.clearbit.com/${val}`;
    }
  }
  return null;
}

// ── Types ──

interface PlateRecord {
  id: string;
  plate: string;
  category: "authorized" | "visitor" | "blocked";
  ownerName: string;
  vehicleDesc?: string;
  notes?: string;
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

interface AccessLogEntry {
  id: string;
  timestamp: string;
  plate: string;
  matchResult: string;
  ownerName?: string;
  nodeId: string;
  nodeLabel?: string;
  cameraIp?: string;
  vehicleColor?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  direction?: string;
  confidence?: number;
  fullImageId?: string;
  plateImageId?: string;
  eventId?: string;
}

interface StatsData {
  byResult: Record<string, number>;
  topPlates: { plate: string; count: number }[];
  byHour: Record<string, number>;
  byDay: Record<string, number>;
}

interface LoiteringEntry {
  plate: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  cameras: string[];
  avgInterval: number;
  riskScore: number;
  timePattern: "day" | "night" | "mixed";
  sightings: {
    timestamp: string;
    nodeId: string;
    nodeLabel?: string;
    direction?: string;
    vehicleColor?: string;
    vehicleBrand?: string;
    plateImageId?: string;
    fullImageId?: string;
  }[];
}

interface AnalyticsResponse {
  mapId: string;
  type: string;
  days: number;
  minCount: number;
  totalUnknownAccesses: number;
  loiteringCount: number;
  loitering: LoiteringEntry[];
}

interface LprCamera {
  nodeId: string;
  label: string;
  ip: string;
  streamUrl: string;
  streamType: string;
  rtspFps?: number;
}

interface HikEvent {
  id: string;
  nodeId: string;
  mapId?: string;
  eventType: string;
  timestamp: string;
  cameraIp: string;
  licensePlate?: string;
  vehicleColor?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  direction?: string;
  confidence?: number;
  plateImageId?: string;
  fullImageId?: string;
  matchResult?: string;
  matchOwner?: string;
  macAddress?: string;
}

type MatchResult = "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";
type TabId = "booth" | "registry" | "log" | "stats" | "analytics" | "bitacora";

// ── Helpers ──

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: body?.error || `HTTP ${res.status}` };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Error de red" };
  }
}

// ── Design System ──

const palette = {
  bg: "#05050f",
  surface: "rgba(255,255,255,0.025)",
  surfaceHover: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.12)",
  text: "#e8ecf4",
  textMuted: "rgba(255,255,255,0.5)",
  textDim: "rgba(255,255,255,0.25)",
  accent: "#00d4ff",
  accentGlow: "rgba(0,212,255,0.15)",
  authorized: "#34d399",
  visitor: "#a78bfa",
  visitorExpired: "#fb923c",
  blocked: "#f87171",
  unknown: "#fbbf24",
  danger: "#ef4444",
  gold: "#f59e0b",
};

const matchColors: Record<MatchResult, string> = {
  authorized: palette.authorized,
  visitor: palette.visitor,
  visitor_expired: palette.visitorExpired,
  blocked: palette.blocked,
  unknown: palette.unknown,
};

const matchLabels: Record<MatchResult, string> = {
  authorized: "Autorizado",
  visitor: "Visitante",
  visitor_expired: "Vencido",
  blocked: "Bloqueado",
  unknown: "Desconocido",
};

const matchIcons: Record<MatchResult, React.ReactNode> = {
  authorized: <ShieldCheck className="w-4 h-4" />,
  visitor: <Clock className="w-4 h-4" />,
  visitor_expired: <ShieldAlert className="w-4 h-4" />,
  blocked: <ShieldX className="w-4 h-4" />,
  unknown: <ShieldQuestion className="w-4 h-4" />,
};

const categoryOptions: { value: PlateRecord["category"]; label: string; color: string }[] = [
  { value: "authorized", label: "Autorizado", color: palette.authorized },
  { value: "visitor", label: "Visitante", color: palette.visitor },
  { value: "blocked", label: "Bloqueado", color: palette.blocked },
];

// ── Shared Components ──

function GlassInput({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
  return (
    <div className="relative group">
      {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 group-focus-within:text-white/50 transition-colors">{icon}</div>}
      <input
        {...props}
        className={`w-full ${icon ? "pl-10" : "pl-4"} pr-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none focus:ring-1 ${props.className || ""}`}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: palette.text,
          backdropFilter: "blur(16px)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)",
          // @ts-ignore
          "--tw-ring-color": `${palette.accent}40`,
          ...props.style,
        }}
      />
    </div>
  );
}

function GlassSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`appearance-none cursor-pointer pl-3.5 pr-9 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-1 hover:border-white/15 ${props.className || ""}`}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: palette.text,
          backdropFilter: "blur(16px)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)",
          // @ts-ignore
          "--tw-ring-color": `${palette.accent}40`,
          ...props.style,
        }}
      >
        {children}
      </select>
      <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
    </div>
  );
}

function StatusBadge({ result }: { result: MatchResult }) {
  const color = matchColors[result];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider"
      style={{
        background: `${color}12`,
        color,
        border: `1px solid ${color}20`,
        boxShadow: `0 0 12px ${color}08`,
      }}
    >
      {matchIcons[result]} {matchLabels[result]}
    </span>
  );
}

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-pulse ${className || ""}`}
      style={{ background: "rgba(255,255,255,0.04)" }}
    />
  );
}

// ── Image Lightbox ──

function ImageLightbox({
  src,
  alt,
  onClose,
  extraImages,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
  extraImages?: { src: string; label: string }[];
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const allImages = [{ src, label: alt || "Captura" }, ...(extraImages || [])];
  const active = allImages[activeIdx];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && activeIdx < allImages.length - 1) setActiveIdx(activeIdx + 1);
      if (e.key === "ArrowLeft" && activeIdx > 0) setActiveIdx(activeIdx - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIdx, allImages.length, onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 rounded-full transition-colors"
        style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={active.src}
          alt={active.label}
          className="max-w-full max-h-[75vh] object-contain rounded-xl"
          style={{ boxShadow: "0 0 60px rgba(0,0,0,0.5)" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div className="flex items-center gap-3">
          {allImages.length > 1 && (
            <div className="flex items-center gap-2">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  className="rounded-lg overflow-hidden transition-all"
                  style={{
                    border: `2px solid ${i === activeIdx ? palette.accent : "rgba(255,255,255,0.15)"}`,
                    opacity: i === activeIdx ? 1 : 0.6,
                  }}
                  onClick={() => setActiveIdx(i)}
                >
                  <img src={img.src} alt={img.label} className="w-16 h-10 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }} />
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-white/50">{active.label}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function PlatesPage() {
  const [maps, setMaps] = useState<{ id: string; name: string }[]>([]);
  const [selectedMap, setSelectedMap] = useState<string>("");
  const [tab, setTab] = useState<TabId>("booth");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/api/maps"))
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setMaps(list);
        if (list.length > 0 && !selectedMap) setSelectedMap(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: palette.bg }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${palette.accent}15`, border: `1px solid ${palette.accent}25` }}>
            <Radar className="w-6 h-6 animate-spin" style={{ color: palette.accent }} />
          </div>
          <span className="text-sm" style={{ color: palette.textMuted }}>Inicializando sistema...</span>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode; accent: string }[] = [
    { id: "booth", label: "Garita", icon: <Video className="w-4 h-4" />, accent: palette.accent },
    { id: "registry", label: "Registro", icon: <ShieldCheck className="w-4 h-4" />, accent: palette.authorized },
    { id: "log", label: "Accesos", icon: <History className="w-4 h-4" />, accent: palette.accent },
    { id: "stats", label: "Estadísticas", icon: <BarChart3 className="w-4 h-4" />, accent: palette.visitor },
    { id: "analytics", label: "Analíticas", icon: <Radar className="w-4 h-4" />, accent: palette.danger },
    { id: "bitacora", label: "Bitácora Garita", icon: <ClipboardList className="w-4 h-4" />, accent: palette.gold },
  ];

  return (
    <div className="min-h-screen" style={{ background: palette.bg, color: palette.text }}>
      {/* ── Premium Header ── */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: "rgba(5,5,15,0.85)",
          borderBottom: `1px solid ${palette.border}`,
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
        }}
      >
        <div className="max-w-[1600px] mx-auto flex items-center gap-5 px-8 py-4">
          <a
            href={apiUrl("/")}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-all hover:scale-105"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}` }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: palette.textMuted }} />
          </a>

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${palette.accent}20, ${palette.accent}05)`,
                border: `1px solid ${palette.accent}25`,
                boxShadow: `0 0 24px ${palette.accent}10`,
              }}
            >
              <Fingerprint className="w-5 h-5" style={{ color: palette.accent }} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight" style={{ color: "#fff" }}>
                Control de Accesos
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.15em]" style={{ color: palette.textDim }}>
                Sistema de identificación vehicular
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Map selector */}
          <GlassSelect value={selectedMap} onChange={(e) => setSelectedMap(e.target.value)}>
            {maps.map((m) => (
              <option key={m.id} value={m.id} style={{ background: "#111" }}>{m.name}</option>
            ))}
          </GlassSelect>
        </div>

        {/* ── Navigation Tabs ── */}
        <div className="max-w-[1600px] mx-auto px-8">
          <div className="flex gap-1">
            {tabs.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all rounded-t-xl"
                  style={{
                    color: isActive ? t.accent : palette.textDim,
                    background: isActive ? `${t.accent}08` : "transparent",
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {isActive && (
                    <div
                      className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${t.accent}, transparent)`,
                        boxShadow: `0 0 8px ${t.accent}60`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="max-w-[1600px] mx-auto px-8 py-6">
        {selectedMap && tab === "booth" && <BoothTab mapId={selectedMap} />}
        {selectedMap && tab === "registry" && <RegistryTab mapId={selectedMap} />}
        {selectedMap && tab === "log" && <AccessLogTab mapId={selectedMap} />}
        {selectedMap && tab === "stats" && <StatsTab mapId={selectedMap} />}
        {selectedMap && tab === "analytics" && <AnalyticsTab mapId={selectedMap} />}
        {selectedMap && tab === "bitacora" && <BitacoraTab mapId={selectedMap} />}
      </div>

      <style>{`
        @keyframes threat-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        @keyframes scan-line {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fade-in 0.3s ease-out both; }
        @keyframes boothDetectionIn {
          0% { opacity: 0; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes boothScanLine {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
        @keyframes boothPlatePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ── Registry Tab ──
// ═══════════════════════════════════════════════════════

function RegistryTab({ mapId }: { mapId: string }) {
  const [plates, setPlates] = useState<PlateRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<PlateRecord | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncModal, setSyncModal] = useState(false);

  const loadPlates = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ mapId });
    if (filterCat !== "all") params.set("category", filterCat);
    apiFetch<{ plates: PlateRecord[] }>(apiUrl(`/api/plates?${params}`)).then(({ data }) => {
      setPlates(data?.plates || []);
      setLoading(false);
    });
  }, [mapId, filterCat]);

  useEffect(() => { loadPlates(); }, [loadPlates]);

  const filtered = useMemo(() => {
    if (!search) return plates;
    const q = search.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return plates.filter(
      (p) =>
        p.plate.includes(q) ||
        p.ownerName.toLowerCase().includes(search.toLowerCase())
    );
  }, [plates, search]);

  const handleDelete = async (id: string, plate: string) => {
    if (!confirm(`¿Eliminar matrícula ${plate}?`)) return;
    const { error } = await apiFetch(apiUrl(`/api/plates/${id}?mapId=${mapId}`), { method: "DELETE" });
    if (error) alert(error);
    else loadPlates();
  };

  const counts = useMemo(() => ({
    authorized: plates.filter((p) => p.category === "authorized").length,
    visitor: plates.filter((p) => p.category === "visitor").length,
    blocked: plates.filter((p) => p.category === "blocked").length,
  }), [plates]);

  return (
    <div className="fade-in">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {([
          { label: "Autorizados", value: counts.authorized, color: palette.authorized, icon: <ShieldCheck className="w-4 h-4" /> },
          { label: "Visitantes", value: counts.visitor, color: palette.visitor, icon: <Clock className="w-4 h-4" /> },
          { label: "Bloqueados", value: counts.blocked, color: palette.blocked, icon: <ShieldX className="w-4 h-4" /> },
        ]).map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-all"
            style={{
              background: `${s.color}06`,
              border: `1px solid ${s.color}12`,
            }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15`, color: s.color }}>
              {s.icon}
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: `${s.color}80` }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <GlassInput
          icon={<Search className="w-4 h-4" />}
          placeholder="Buscar matrícula o propietario..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="max-w-md"
        />

        <GlassSelect value={filterCat} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterCat(e.target.value)}>
          <option value="all" style={{ background: "#111" }}>Todos</option>
          <option value="authorized" style={{ background: "#111" }}>Autorizados</option>
          <option value="visitor" style={{ background: "#111" }}>Visitantes</option>
          <option value="blocked" style={{ background: "#111" }}>Bloqueados</option>
        </GlassSelect>

        <div className="flex-1" />

        <button
          onClick={() => setSyncModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
          style={{
            border: `1px solid ${palette.accent}30`,
            color: palette.accent,
            background: `${palette.accent}08`,
          }}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Sync a Cámaras
        </button>

        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]"
          style={{
            background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent}cc)`,
            color: palette.bg,
            boxShadow: `0 4px 20px ${palette.accent}30`,
          }}
        >
          <Plus className="w-4 h-4" /> Agregar Matrícula
        </button>
      </div>

      {/* Sync Modal */}
      {syncModal && (
        <SyncModal
          mapId={mapId}
          onClose={() => setSyncModal(false)}
          onSyncComplete={() => { loadPlates(); setSyncResult({ ok: true, msg: "Sincronización completada" }); }}
        />
      )}

      {/* Sync result notification */}
      {syncResult && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-4 text-sm"
          style={{
            background: syncResult.ok ? `${palette.authorized}10` : `${palette.blocked}10`,
            border: `1px solid ${syncResult.ok ? palette.authorized : palette.blocked}30`,
            color: syncResult.ok ? palette.authorized : palette.blocked,
          }}
        >
          {syncResult.ok ? <ShieldCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{syncResult.msg}</span>
          <button onClick={() => setSyncResult(null)} className="ml-auto">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${palette.border}`, background: palette.surface }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Matrícula", "Estado", "Propietario", "Vehículo", "Vigencia", "Notas", ""].map((h, i) => (
                <th key={i} className={`${i === 6 ? "text-right" : "text-left"} px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider`} style={{ color: palette.textDim }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${palette.border}` }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-5 py-3"><SkeletonPulse className="h-5 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <ShieldQuestion className="w-8 h-8 mx-auto mb-3" style={{ color: palette.textDim }} />
                  <p style={{ color: palette.textMuted }}>{search ? "Sin resultados" : "No hay matrículas registradas"}</p>
                </td>
              </tr>
            ) : (
              filtered.map((p, idx) => {
                const catColor = matchColors[p.category as MatchResult] || palette.unknown;
                const isExpired = p.category === "visitor" && p.validUntil && new Date(p.validUntil) < new Date();
                return (
                  <tr
                    key={p.id}
                    className="transition-colors group"
                    style={{
                      borderTop: `1px solid ${palette.border}`,
                      animationDelay: `${idx * 30}ms`,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = palette.surfaceHover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-black tracking-[0.15em] text-[15px]" style={{ color: catColor, textShadow: `0 0 20px ${catColor}30` }}>
                        {p.plate}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge result={isExpired ? "visitor_expired" : (p.category as MatchResult)} />
                    </td>
                    <td className="px-5 py-3.5 text-white/70 font-medium">{p.ownerName}</td>
                    <td className="px-5 py-3.5 text-white/35 text-xs">{p.vehicleDesc || "—"}</td>
                    <td className="px-5 py-3.5 text-white/35 text-xs">
                      {p.category === "visitor" && p.validFrom && p.validUntil
                        ? `${new Date(p.validFrom).toLocaleDateString("es-UY")} – ${new Date(p.validUntil).toLocaleDateString("es-UY")}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-white/25 text-xs max-w-[200px] truncate">{p.notes || "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditModal(p)} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-white/30 hover:text-cyan-400" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(p.id, p.plate)} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-white/30 hover:text-red-400" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4 text-xs" style={{ color: palette.textDim }}>
        <span>{filtered.length} matrícula{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {(addModal || editModal) && (
        <PlateFormModal
          mapId={mapId}
          plate={editModal || undefined}
          onClose={() => { setAddModal(false); setEditModal(null); }}
          onSaved={() => { setAddModal(false); setEditModal(null); loadPlates(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ── Plate Form Modal ──
// ═══════════════════════════════════════════════════════

function PlateFormModal({
  mapId, plate, onClose, onSaved,
}: {
  mapId: string; plate?: PlateRecord; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!plate;
  const [plateNumber, setPlateNumber] = useState(plate?.plate || "");
  const [category, setCategory] = useState<PlateRecord["category"]>(plate?.category || "authorized");
  const [ownerName, setOwnerName] = useState(plate?.ownerName || "");
  const [vehicleDesc, setVehicleDesc] = useState(plate?.vehicleDesc || "");
  const [notes, setNotes] = useState(plate?.notes || "");
  const [validFrom, setValidFrom] = useState(plate?.validFrom?.split("T")[0] || "");
  const [validUntil, setValidUntil] = useState(plate?.validUntil?.split("T")[0] || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!plateNumber.trim() || !ownerName.trim()) {
      setError("Matrícula y propietario son obligatorios");
      return;
    }
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      mapId,
      plate: plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      category,
      ownerName: ownerName.trim(),
      vehicleDesc: vehicleDesc.trim() || undefined,
      notes: notes.trim() || undefined,
      validFrom: category === "visitor" && validFrom ? validFrom : undefined,
      validUntil: category === "visitor" && validUntil ? validUntil : undefined,
    };

    const url = isEdit ? apiUrl(`/api/plates/${plate!.id}`) : apiUrl("/api/plates");
    const method = isEdit ? "PUT" : "POST";
    const { error: err } = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (err) setError(err);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}>
      <div
        className="w-full max-w-lg rounded-3xl p-8 fade-in"
        style={{
          background: "rgba(10,10,25,0.98)",
          border: `1px solid ${palette.border}`,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${palette.accent}15`, border: `1px solid ${palette.accent}20` }}>
              {isEdit ? <Pencil className="w-4 h-4" style={{ color: palette.accent }} /> : <Plus className="w-4 h-4" style={{ color: palette.accent }} />}
            </div>
            <h2 className="text-lg font-bold text-white">{isEdit ? "Editar Matrícula" : "Nueva Matrícula"}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 transition-colors text-white/30 hover:text-white/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: palette.textDim }}>Matrícula</label>
            <input
              type="text" value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
              placeholder="ABC1234"
              disabled={isEdit}
              className="w-full px-4 py-3 rounded-xl text-lg font-mono font-black tracking-[0.2em] text-center focus:outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${palette.accent}20`,
                color: palette.accent,
                boxShadow: `0 0 20px ${palette.accent}08`,
              }}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: palette.textDim }}>Categoría</label>
            <div className="grid grid-cols-3 gap-2">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setCategory(opt.value)}
                  className="py-3 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: category === opt.value ? `${opt.color}18` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${category === opt.value ? `${opt.color}40` : palette.border}`,
                    color: category === opt.value ? opt.color : palette.textDim,
                    boxShadow: category === opt.value ? `0 0 16px ${opt.color}15` : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: palette.textDim }}>Propietario</label>
            <GlassInput value={ownerName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOwnerName(e.target.value)} placeholder="Nombre completo" />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: palette.textDim }}>Vehículo</label>
            <GlassInput value={vehicleDesc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVehicleDesc(e.target.value)} placeholder="Toyota Corolla blanco" />
          </div>

          {category === "visitor" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: palette.textDim }}>Desde</label>
                <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.text, colorScheme: "dark" }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: palette.textDim }}>Hasta</label>
                <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.text, colorScheme: "dark" }}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: palette.textDim }}>Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 rounded-xl text-sm resize-none focus:outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.text }}
            />
          </div>

          {error && <div className="text-xs font-medium px-3 py-2 rounded-lg" style={{ background: `${palette.danger}15`, color: palette.danger, border: `1px solid ${palette.danger}20` }}>{error}</div>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all" style={{ background: "rgba(255,255,255,0.04)", color: palette.textMuted, border: `1px solid ${palette.border}` }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.01]"
              style={{
                background: saving ? `${palette.accent}40` : `linear-gradient(135deg, ${palette.accent}, ${palette.accent}cc)`,
                color: palette.bg,
                boxShadow: `0 4px 20px ${palette.accent}25`,
              }}
            >
              {saving ? "Guardando..." : isEdit ? "Actualizar" : "Registrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ── Access Log Tab ──
// ═══════════════════════════════════════════════════════

function AccessLogTab({ mapId }: { mapId: string }) {
  const [entries, setEntries] = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResult, setFilterResult] = useState("all");
  const [filterPlate, setFilterPlate] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; extras?: { src: string; label: string }[] } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportStatus, setExportStatus] = useState("all");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");

  const loadLog = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ mapId, limit: "200" });
    if (filterResult !== "all") params.set("matchResult", filterResult);
    if (filterPlate) params.set("plate", filterPlate);
    apiFetch<{ entries: AccessLogEntry[] }>(apiUrl(`/api/plates/log?${params}`)).then(({ data }) => {
      setEntries(data?.entries || []);
      setLoading(false);
    });
  }, [mapId, filterResult, filterPlate]);

  useEffect(() => { loadLog(); }, [loadLog]);

  const handleExport = () => {
    const params = new URLSearchParams({ mapId });
    if (exportStatus !== "all") params.set("matchResult", exportStatus);
    if (exportDateFrom) params.set("from", new Date(exportDateFrom).toISOString());
    if (exportDateTo) params.set("to", new Date(exportDateTo + "T23:59:59").toISOString());
    if (exportFormat === "json") params.set("format", "json");
    window.open(apiUrl(`/api/plates/export?${params}`), "_blank");
    setShowExport(false);
  };

  // Stats for current entries
  const stats = useMemo(() => {
    const s = { authorized: 0, visitor: 0, blocked: 0, unknown: 0, total: entries.length };
    entries.forEach((e) => {
      if (e.matchResult === "authorized") s.authorized++;
      else if (e.matchResult === "visitor" || e.matchResult === "visitor_expired") s.visitor++;
      else if (e.matchResult === "blocked") s.blocked++;
      else s.unknown++;
    });
    return s;
  }, [entries]);

  return (
    <div className="fade-in">
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <GlassInput
          icon={<Search className="w-4 h-4" />}
          placeholder="Filtrar por matrícula..."
          value={filterPlate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterPlate(e.target.value)}
          className="max-w-xs"
        />

        <GlassSelect value={filterResult} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterResult(e.target.value)}>
          <option value="all" style={{ background: "#111" }}>Todos los estados</option>
          <option value="authorized" style={{ background: "#111" }}>Autorizados</option>
          <option value="visitor" style={{ background: "#111" }}>Visitantes</option>
          <option value="blocked" style={{ background: "#111" }}>Bloqueados</option>
          <option value="unknown" style={{ background: "#111" }}>Desconocidos</option>
        </GlassSelect>

        <div className="flex-1" />

        {/* Stats pills */}
        {!loading && entries.length > 0 && (
          <div className="flex items-center gap-1.5 mr-2">
            {[
              { label: "Total", count: stats.total, color: palette.accent },
              { label: "Auth", count: stats.authorized, color: palette.authorized },
              { label: "Visit", count: stats.visitor, color: palette.visitor },
              { label: "Bloq", count: stats.blocked, color: palette.blocked },
              { label: "Desc", count: stats.unknown, color: palette.unknown },
            ].filter((p) => p.count > 0).map((pill) => (
              <span
                key={pill.label}
                className="text-[10px] px-2 py-1 rounded-full font-mono font-semibold"
                style={{ background: `${pill.color}12`, color: pill.color, border: `1px solid ${pill.color}20` }}
              >
                {pill.count} {pill.label.toLowerCase()}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg"
          style={{
            border: `1px solid ${palette.accent}30`,
            color: palette.accent,
            background: `linear-gradient(135deg, ${palette.accent}10, ${palette.accent}05)`,
            boxShadow: `0 2px 8px ${palette.accent}10`,
          }}
        >
          <Download className="w-4 h-4" /> Exportar
        </button>
      </div>

      {/* Export Modal */}
      {showExport && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowExport(false)}
        >
          <div
            className="rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm mx-4"
            style={{
              background: palette.surface,
              border: `1px solid ${palette.accent}20`,
              boxShadow: `0 0 60px ${palette.accent}10, 0 25px 50px rgba(0,0,0,0.5)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: `${palette.accent}06`, borderBottom: `1px solid ${palette.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${palette.accent}15`, border: `1px solid ${palette.accent}25` }}>
                  <Download className="w-4 h-4" style={{ color: palette.accent }} />
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ color: palette.text }}>Exportar Registros</div>
                  <div className="text-[10px]" style={{ color: palette.textDim }}>Configura los filtros de exportación</div>
                </div>
              </div>
              <button onClick={() => setShowExport(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: palette.textMuted }} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Date range */}
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-2 block" style={{ color: palette.textDim }}>Rango de fechas</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.text, colorScheme: "dark" }}
                    placeholder="Desde"
                  />
                  <input
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.text, colorScheme: "dark" }}
                    placeholder="Hasta"
                  />
                </div>
              </div>

              {/* Status filter */}
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-2 block" style={{ color: palette.textDim }}>Estado</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "all", label: "Todos", color: palette.accent },
                    { value: "authorized", label: "Autorizados", color: palette.authorized },
                    { value: "visitor", label: "Visitantes", color: palette.visitor },
                    { value: "blocked", label: "Bloqueados", color: palette.blocked },
                    { value: "unknown", label: "Desconocidos", color: palette.unknown },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setExportStatus(opt.value)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                      style={{
                        background: exportStatus === opt.value ? `${opt.color}20` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${exportStatus === opt.value ? `${opt.color}40` : palette.border}`,
                        color: exportStatus === opt.value ? opt.color : palette.textMuted,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-2 block" style={{ color: palette.textDim }}>Formato</label>
                <div className="flex gap-2">
                  {(["csv", "json"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className="flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-center"
                      style={{
                        background: exportFormat === fmt ? `${palette.accent}15` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${exportFormat === fmt ? `${palette.accent}30` : palette.border}`,
                        color: exportFormat === fmt ? palette.accent : palette.textMuted,
                      }}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex gap-3" style={{ borderTop: `1px solid ${palette.border}` }}>
              <button
                onClick={() => setShowExport(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.04)", color: palette.textMuted, border: `1px solid ${palette.border}` }}
              >
                Cancelar
              </button>
              <button
                onClick={handleExport}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent}cc)`,
                  color: "#fff",
                  boxShadow: `0 4px 12px ${palette.accent}30`,
                }}
              >
                <Download className="w-4 h-4" /> Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${palette.border}`, background: palette.surface }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Fecha/Hora", "Matrícula", "Estado", "Propietario", "Cámara", "Vehículo", "Dir.", "Captura"].map((h, i) => (
                <th key={i} className="text-left px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette.textDim }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${palette.border}` }}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-5 py-3"><SkeletonPulse className="h-5 w-16" /></td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <History className="w-8 h-8 mx-auto mb-3" style={{ color: palette.textDim }} />
                  <p style={{ color: palette.textMuted }}>Sin registros de acceso</p>
                </td>
              </tr>
            ) : (
              entries.map((e) => {
                const result = (e.matchResult as MatchResult) || "unknown";
                const color = matchColors[result];
                const time = new Date(e.timestamp);
                return (
                  <tr
                    key={e.id}
                    className="transition-colors"
                    style={{ borderTop: `1px solid ${palette.border}` }}
                    onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = palette.surfaceHover; }}
                    onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: palette.textMuted }}>
                      {time.toLocaleDateString("es-UY")} {time.toLocaleTimeString("es-UY")}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono font-black tracking-[0.12em] text-[14px]" style={{ color, textShadow: `0 0 16px ${color}25` }}>
                        {e.plate}
                      </span>
                    </td>
                    <td className="px-5 py-3"><StatusBadge result={result} /></td>
                    <td className="px-5 py-3 text-xs" style={{ color: palette.textMuted }}>{e.ownerName || "—"}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: palette.textDim }}>{e.nodeLabel || e.nodeId}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: palette.textDim }}>
                      {[e.vehicleColor, e.vehicleBrand, e.vehicleModel].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: palette.textDim }}>
                      {e.direction === "forward" ? "→" : e.direction === "reverse" ? "←" : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {(e.plateImageId || e.fullImageId) ? (
                        <PlateImg
                          src={apiUrl(`/api/hik/images/${e.plateImageId || e.fullImageId}`)}
                          alt="Captura"
                          className="w-20 h-12 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ border: `1px solid ${palette.border}` }}
                          onClick={() => {
                            const mainId = e.fullImageId || e.plateImageId;
                            const extras: { src: string; label: string }[] = [];
                            if (e.fullImageId && e.plateImageId) extras.push({ src: apiUrl(`/api/hik/images/${e.plateImageId}`), label: "Placa" });
                            setLightbox({ src: apiUrl(`/api/hik/images/${mainId!}`), alt: `${e.plate} — Captura`, extras });
                          }}
                        />
                      ) : (
                        <span style={{ color: palette.textDim }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs mt-4" style={{ color: palette.textDim }}>
        {entries.length} registro{entries.length !== 1 ? "s" : ""}
      </div>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
          extraImages={lightbox.extras}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ── Stats Tab ──
// ═══════════════════════════════════════════════════════

function StatsTab({ mapId }: { mapId: string }) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<StatsData>(apiUrl(`/api/plates/stats?mapId=${mapId}`)).then(({ data }) => {
      setStats(data);
      setLoading(false);
    });
  }, [mapId]);

  if (loading) {
    return (
      <div className="fade-in space-y-6">
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonPulse key={i} className="h-28 rounded-2xl" />)}
        </div>
        <SkeletonPulse className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (!stats) return <div className="text-center py-16" style={{ color: palette.textMuted }}>Sin datos disponibles</div>;

  const totalEvents = Object.values(stats.byResult).reduce((a, b) => a + b, 0);

  return (
    <div className="fade-in space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {([
          { label: "Total Accesos", value: totalEvents, color: palette.accent, icon: <Activity className="w-5 h-5" /> },
          { label: "Autorizados", value: stats.byResult.authorized || 0, color: palette.authorized, icon: <ShieldCheck className="w-5 h-5" /> },
          { label: "Visitantes", value: stats.byResult.visitor || 0, color: palette.visitor, icon: <Clock className="w-5 h-5" /> },
          { label: "Bloqueados", value: stats.byResult.blocked || 0, color: palette.blocked, icon: <ShieldX className="w-5 h-5" /> },
          { label: "Desconocidos", value: stats.byResult.unknown || 0, color: palette.unknown, icon: <ShieldQuestion className="w-5 h-5" /> },
        ]).map((s) => (
          <div
            key={s.label}
            className="relative overflow-hidden rounded-2xl p-5"
            style={{ background: `${s.color}06`, border: `1px solid ${s.color}12` }}
          >
            <div className="absolute top-3 right-3 opacity-10" style={{ color: s.color }}>{s.icon}</div>
            <div className="text-3xl font-black tabular-nums" style={{ color: s.color }}>{s.value.toLocaleString()}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] mt-1" style={{ color: `${s.color}70` }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top Plates */}
      <div className="rounded-2xl p-6" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
        <h3 className="text-sm font-bold mb-5 flex items-center gap-2" style={{ color: palette.textMuted }}>
          <TrendingUp className="w-4 h-4" style={{ color: palette.accent }} />
          Top Matrículas — últimos 30 días
        </h3>
        {stats.topPlates.length === 0 ? (
          <div className="text-center py-8" style={{ color: palette.textDim }}>Sin datos</div>
        ) : (
          <div className="space-y-3">
            {stats.topPlates.slice(0, 10).map((tp, i) => {
              const pct = totalEvents > 0 ? (tp.count / stats.topPlates[0].count) * 100 : 0;
              return (
                <div key={tp.plate} className="flex items-center gap-4">
                  <span className="text-xs font-bold w-5 text-right tabular-nums" style={{ color: palette.textDim }}>{i + 1}</span>
                  <span className="font-mono font-black tracking-[0.1em] text-sm w-28" style={{ color: palette.accent }}>{tp.plate}</span>
                  <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div
                      className="h-full rounded-lg transition-all duration-700"
                      style={{
                        width: `${Math.max(pct, 3)}%`,
                        background: `linear-gradient(90deg, ${palette.accent}40, ${palette.accent}15)`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums w-12 text-right" style={{ color: palette.textMuted }}>{tp.count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly */}
        <div className="rounded-2xl p-6" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
          <h3 className="text-sm font-bold mb-5 flex items-center gap-2" style={{ color: palette.textMuted }}>
            <Clock className="w-4 h-4" style={{ color: palette.visitor }} />
            Distribución por Hora
          </h3>
          <div className="flex items-end gap-[3px] h-32">
            {Array.from({ length: 24 }, (_, h) => {
              const key = String(h).padStart(2, "0");
              const count = stats.byHour[key] || 0;
              const maxH = Math.max(...Object.values(stats.byHour), 1);
              const pct = (count / maxH) * 100;
              const isNight = h >= 20 || h < 6;
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${key}:00 — ${count}`}>
                  <div
                    className="w-full rounded-md transition-all duration-500"
                    style={{
                      height: `${Math.max(pct, 2)}%`,
                      background: count > 0
                        ? isNight ? `linear-gradient(180deg, ${palette.visitor}60, ${palette.visitor}20)` : `linear-gradient(180deg, ${palette.accent}60, ${palette.accent}20)`
                        : "rgba(255,255,255,0.02)",
                    }}
                  />
                  {h % 4 === 0 && <span className="text-[9px] font-mono" style={{ color: palette.textDim }}>{key}</span>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px]" style={{ color: palette.textDim }}>
            <span className="flex items-center gap-1"><Sun className="w-3 h-3" style={{ color: palette.accent }} /> Día</span>
            <span className="flex items-center gap-1"><Moon className="w-3 h-3" style={{ color: palette.visitor }} /> Noche</span>
          </div>
        </div>

        {/* Daily */}
        <div className="rounded-2xl p-6" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
          <h3 className="text-sm font-bold mb-5 flex items-center gap-2" style={{ color: palette.textMuted }}>
            <BarChart3 className="w-4 h-4" style={{ color: palette.authorized }} />
            Tendencia Diaria — 30 días
          </h3>
          {Object.keys(stats.byDay).length === 0 ? (
            <div className="text-center py-12" style={{ color: palette.textDim }}>Sin datos</div>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {Object.entries(stats.byDay)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-30)
                .map(([day, count]) => {
                  const maxD = Math.max(...Object.values(stats.byDay), 1);
                  const pct = (count / maxD) * 100;
                  return (
                    <div
                      key={day}
                      className="flex-1 rounded-md transition-all duration-500"
                      style={{
                        height: `${Math.max(pct, 3)}%`,
                        background: count > 0
                          ? `linear-gradient(180deg, ${palette.authorized}50, ${palette.authorized}15)`
                          : "rgba(255,255,255,0.02)",
                      }}
                      title={`${day}: ${count}`}
                    />
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ── Booth Tab — Guard Booth / Garita ──
// ═══════════════════════════════════════════════════════

function BoothTab({ mapId }: { mapId: string }) {
  const [lprCameras, setLprCameras] = useState<LprCamera[]>([]);
  const [events, setEvents] = useState<HikEvent[]>([]);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingCams, setLoadingCams] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<HikEvent | null>(null);
  const [latestEvent, setLatestEvent] = useState<HikEvent | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string; extras?: { src: string; label: string }[] } | null>(null);
  const [cameraDetections, setCameraDetections] = useState<Map<string, HikEvent>>(new Map());
  const [clock, setClock] = useState(new Date());
  const [feedSearch, setFeedSearch] = useState("");

  const filteredEvents = useMemo(() => {
    if (!feedSearch) return events;
    const q = feedSearch.toUpperCase();
    return events.filter((ev) =>
      ev.licensePlate?.toUpperCase().includes(q) ||
      ev.matchOwner?.toUpperCase().includes(q) ||
      ev.vehicleBrand?.toUpperCase().includes(q) ||
      ev.vehicleModel?.toUpperCase().includes(q)
    );
  }, [events, feedSearch]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch LPR cameras
  useEffect(() => {
    setLoadingCams(true);
    fetch(apiUrl("/api/cameras"), { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data) => {
        const allCams = data.cameras || [];
        const lpr = allCams.filter((c: any) => {
          const lbl = (c.label || "").toLowerCase();
          return (
            (c.mapId === mapId) &&
            c.streamUrl &&
            (lbl.includes("lpr") || lbl.includes("placa") || lbl.includes("patente") ||
             lbl.includes("anpr") || lbl.includes("acceso") || lbl.includes("entrada") ||
             lbl.includes("salida") || lbl.includes("gate") || lbl.includes("barrera"))
          );
        });
        // If no LPR-specific cameras found, show all cameras with stream for this map
        if (lpr.length === 0) {
          const mapCams = allCams.filter((c: any) => c.mapId === mapId && c.streamUrl && c.streamType !== "nvr");
          setLprCameras(mapCams.slice(0, 4));
        } else {
          setLprCameras(lpr.slice(0, 4));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCams(false));
  }, [mapId]);

  // Fetch access log history
  useEffect(() => {
    fetch(apiUrl(`/api/plates/log?mapId=${mapId}&limit=50`), { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data) => setAccessLog(data.entries || []))
      .catch(() => {});
  }, [mapId]);

  // SSE connection for live events
  useEffect(() => {
    const url = apiUrl(`/api/hik/events/stream?mapId=${encodeURIComponent(mapId)}`);
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") { setConnected(true); return; }
        if (data.type === "history") {
          const anprEvents = (data.events || []).filter((ev: HikEvent) => ev.eventType === "anpr" && ev.licensePlate);
          setEvents(anprEvents);
          return;
        }
        const event = data as HikEvent;
        if (event.id && event.eventType === "anpr" && event.licensePlate) {
          setLatestEvent(event);
          setShowFlash(true);
          setTimeout(() => setShowFlash(false), 2000);
          setEvents((prev) => {
            const updated = [event, ...prev];
            if (updated.length > 100) return updated.slice(0, 100);
            return updated;
          });
          // Track detection on camera feed for overlay animation
          if (event.cameraIp) {
            setCameraDetections((prev) => {
              const next = new Map(prev);
              next.set(event.cameraIp, event);
              return next;
            });
            // Clear overlay after 5 seconds
            setTimeout(() => {
              setCameraDetections((prev) => {
                const next = new Map(prev);
                if (next.get(event.cameraIp)?.id === event.id) {
                  next.delete(event.cameraIp);
                }
                return next;
              });
            }, 5000);
          }
        }
      } catch {}
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      setTimeout(() => {
        const retry = new EventSource(url);
        esRef.current = retry;
        retry.onopen = () => setConnected(true);
        retry.onmessage = es.onmessage;
        retry.onerror = es.onerror;
      }, 3000);
    };

    return () => { esRef.current?.close(); };
  }, [mapId]);

  const getStreamUrl = (cam: LprCamera) => {
    if (!cam.streamUrl) return "";
    if (cam.streamType === "rtsp") {
      return apiUrl(`/api/camera/rtsp-stream?url=${encodeURIComponent(cam.streamUrl)}&fps=${cam.rtspFps || 2}`);
    }
    if (cam.streamType === "snapshot") {
      return apiUrl(`/api/camera/snapshot?url=${encodeURIComponent(cam.streamUrl)}&_t=${Date.now()}`);
    }
    if (cam.streamType === "mjpeg") return cam.streamUrl;
    return cam.streamUrl;
  };

  const matchColors: Record<string, string> = {
    authorized: palette.authorized,
    visitor: palette.visitor,
    visitor_expired: palette.visitorExpired,
    blocked: palette.blocked,
    unknown: palette.unknown,
  };

  const matchLabels: Record<string, string> = {
    authorized: "AUTORIZADO",
    visitor: "VISITANTE",
    visitor_expired: "VISITA EXPIRADA",
    blocked: "BLOQUEADO",
    unknown: "DESCONOCIDO",
  };

  const matchIcons: Record<string, React.ReactNode> = {
    authorized: <ShieldCheck className="w-4 h-4" />,
    visitor: <ShieldQuestion className="w-4 h-4" />,
    visitor_expired: <ShieldAlert className="w-4 h-4" />,
    blocked: <ShieldX className="w-4 h-4" />,
    unknown: <AlertTriangle className="w-4 h-4" />,
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch { return ""; }
  };

  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
    } catch { return ""; }
  };

  return (
    <div className="space-y-4">
      {/* ── Status Bar ── */}
      <div
        className="flex items-center justify-between px-4 py-2 rounded-xl"
        style={{
          background: connected
            ? "linear-gradient(135deg, rgba(0,212,255,0.08), rgba(52,211,153,0.06))"
            : "linear-gradient(135deg, rgba(248,113,113,0.1), rgba(239,68,68,0.06))",
          border: `1px solid ${connected ? "rgba(0,212,255,0.2)" : "rgba(248,113,113,0.2)"}`,
        }}
      >
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5" style={{ color: palette.accent }} />
          <span className="font-semibold text-sm tracking-wide" style={{ color: palette.text }}>
            CONTROL DE ACCESO — GARITA
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs" style={{ color: palette.textMuted }}>
            <Camera className="w-3.5 h-3.5" />
            <span>{lprCameras.length} cámaras</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: palette.textMuted }}>
            <Activity className="w-3.5 h-3.5" />
            <span>{events.length} lecturas</span>
          </div>
          <div className="flex items-center gap-1.5">
            {connected ? (
              <Wifi className="w-4 h-4" style={{ color: palette.authorized }} />
            ) : (
              <WifiOff className="w-4 h-4" style={{ color: palette.blocked }} />
            )}
            <span className="text-xs font-medium" style={{ color: connected ? palette.authorized : palette.blocked }}>
              {connected ? "EN LÍNEA" : "SIN CONEXIÓN"}
            </span>
          </div>
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: palette.accent }}>
            {clock.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
      </div>

      {/* ── Main Layout: Cameras + Events ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 380px" }}>
        {/* Left: Camera Grid */}
        <div className="space-y-3">
          {/* Camera feeds */}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: lprCameras.length <= 1 ? "1fr" : "1fr 1fr",
            }}
          >
            {loadingCams ? (
              Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl aspect-video animate-pulse"
                  style={{ background: palette.surface, border: `1px solid ${palette.border}` }}
                />
              ))
            ) : lprCameras.length === 0 ? (
              <div
                className="col-span-2 flex flex-col items-center justify-center py-16 rounded-xl"
                style={{ background: palette.surface, border: `1px solid ${palette.border}` }}
              >
                <Video className="w-10 h-10 mb-3" style={{ color: palette.textDim }} />
                <p className="text-sm" style={{ color: palette.textMuted }}>
                  No hay cámaras con stream configurado en este mapa
                </p>
              </div>
            ) : (
              lprCameras.map((cam) => {
                const streamSrc = getStreamUrl(cam);
                return (
                  <div
                    key={cam.nodeId}
                    className="relative rounded-xl overflow-hidden group"
                    style={{
                      background: "#000",
                      border: `1px solid ${palette.border}`,
                      aspectRatio: "16/9",
                    }}
                  >
                    {streamSrc ? (
                      <img
                        src={streamSrc}
                        alt={cam.label}
                        className="w-full h-full object-cover"
                        style={{ imageRendering: "auto" }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-8 h-8" style={{ color: palette.textDim }} />
                      </div>
                    )}
                    {/* Camera label overlay */}
                    <div
                      className="absolute bottom-0 left-0 right-0 px-3 py-1.5 flex items-center justify-between"
                      style={{
                        background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
                      }}
                    >
                      <span className="text-xs font-medium text-white truncate">{cam.label}</span>
                      <span className="text-[10px] text-white/50">{cam.ip}</span>
                    </div>
                    {/* Recording indicator */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider">REC</span>
                    </div>

                    {/* ── Detection Overlay Animation ── */}
                    {(() => {
                      const det = cameraDetections.get(cam.ip);
                      if (!det) return null;
                      const detColor = matchColors[det.matchResult || "unknown"] || palette.unknown;
                      const vehicleInfo = [det.vehicleColor, det.vehicleBrand, det.vehicleModel].filter(Boolean).join(" ");
                      return (
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            animation: "boothDetectionIn 0.3s ease-out",
                            background: `linear-gradient(135deg, ${detColor}20, transparent 60%)`,
                            border: `2px solid ${detColor}80`,
                            borderRadius: "0.75rem",
                          }}
                        >
                          {/* Scanning line animation */}
                          <div
                            className="absolute left-0 right-0 h-0.5"
                            style={{
                              background: `linear-gradient(90deg, transparent, ${detColor}, transparent)`,
                              animation: "boothScanLine 1.5s ease-in-out infinite",
                              boxShadow: `0 0 12px ${detColor}`,
                            }}
                          />
                          {/* Corner brackets */}
                          <div className="absolute top-3 left-3 w-6 h-6" style={{ borderLeft: `2px solid ${detColor}`, borderTop: `2px solid ${detColor}` }} />
                          <div className="absolute top-3 right-3 w-6 h-6" style={{ borderRight: `2px solid ${detColor}`, borderTop: `2px solid ${detColor}` }} />
                          <div className="absolute bottom-3 left-3 w-6 h-6" style={{ borderLeft: `2px solid ${detColor}`, borderBottom: `2px solid ${detColor}` }} />
                          <div className="absolute bottom-3 right-3 w-6 h-6" style={{ borderRight: `2px solid ${detColor}`, borderBottom: `2px solid ${detColor}` }} />

                          {/* Left side: plate + status + vehicle info */}
                          <div className="absolute bottom-8 left-3 flex flex-col gap-1.5" style={{ maxWidth: "60%" }}>
                            {/* Plate badge */}
                            <div
                              className="px-4 py-1.5 rounded-lg font-mono text-lg font-black tracking-[0.2em] inline-block w-fit"
                              style={{
                                background: "rgba(0,0,0,0.85)",
                                color: detColor,
                                border: `2px solid ${detColor}`,
                                boxShadow: `0 0 24px ${detColor}40`,
                                animation: "boothPlatePulse 1s ease-in-out infinite",
                              }}
                            >
                              {det.licensePlate}
                            </div>
                            {/* Status badge */}
                            <div
                              className="px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 w-fit"
                              style={{ background: "rgba(0,0,0,0.8)", color: detColor }}
                            >
                              {matchIcons[det.matchResult || "unknown"]}
                              {matchLabels[det.matchResult || "unknown"]}
                              {det.matchOwner && <span className="font-normal ml-1 text-white/70">— {det.matchOwner}</span>}
                            </div>
                            {/* Vehicle info */}
                            {vehicleInfo && (
                              <div
                                className="px-3 py-1 rounded-lg text-[10px] flex items-center gap-1.5 w-fit"
                                style={{ background: "rgba(0,0,0,0.75)", color: "rgba(255,255,255,0.8)" }}
                              >
                                <Car className="w-3 h-3" style={{ color: detColor }} />
                                <span>{vehicleInfo}</span>
                              </div>
                            )}
                            {/* Confidence */}
                            {det.confidence && (
                              <div
                                className="px-3 py-1 rounded-lg text-[10px] flex items-center gap-1.5 w-fit"
                                style={{ background: "rgba(0,0,0,0.75)", color: "rgba(255,255,255,0.7)" }}
                              >
                                <Fingerprint className="w-3 h-3" style={{ color: detColor }} />
                                <span>Precisión: <strong style={{ color: detColor }}>{det.confidence}%</strong></span>
                              </div>
                            )}
                          </div>

                          {/* Right side: plate image */}
                          {det.plateImageId && (
                            <div className="absolute bottom-8 right-3 flex flex-col items-end gap-1">
                              <PlateImg
                                src={apiUrl(`/api/hik/images/${det.plateImageId}`)}
                                alt="Placa"
                                className="rounded-lg"
                                style={{
                                  height: "52px",
                                  maxWidth: "120px",
                                  objectFit: "cover",
                                  border: `2px solid ${detColor}80`,
                                  boxShadow: `0 0 16px ${detColor}30`,
                                }}
                              />
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)", color: detColor }}>
                                CAPTURA
                              </span>
                            </div>
                          )}

                          {/* Top-right confidence meter */}
                          {det.confidence && (
                            <div className="absolute top-2 right-10 flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(0,0,0,0.7)" }}>
                              <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${det.confidence}%`,
                                    background: det.confidence > 80 ? palette.authorized : det.confidence > 50 ? palette.unknown : palette.blocked,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-mono font-bold" style={{ color: detColor }}>{det.confidence}%</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>

          {/* ── Latest Detection Banner ── */}
          {latestEvent && (
            <div
              className="rounded-xl px-4 py-3 transition-all duration-500"
              style={{
                background: showFlash
                  ? `linear-gradient(135deg, ${matchColors[latestEvent.matchResult || "unknown"]}20, ${matchColors[latestEvent.matchResult || "unknown"]}08)`
                  : palette.surface,
                border: `1px solid ${showFlash ? matchColors[latestEvent.matchResult || "unknown"] + "40" : palette.border}`,
                boxShadow: showFlash ? `0 0 30px ${matchColors[latestEvent.matchResult || "unknown"]}15` : "none",
              }}
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5" style={{ color: matchColors[latestEvent.matchResult || "unknown"] }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: matchColors[latestEvent.matchResult || "unknown"] }}>
                    ÚLTIMA LECTURA
                  </span>
                </div>
                <div
                  className="px-4 py-1.5 rounded-lg font-mono text-lg font-black tracking-[0.2em]"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    color: matchColors[latestEvent.matchResult || "unknown"],
                    border: `1px solid ${matchColors[latestEvent.matchResult || "unknown"]}40`,
                  }}
                >
                  {latestEvent.licensePlate}
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: matchColors[latestEvent.matchResult || "unknown"] }}>
                  {matchIcons[latestEvent.matchResult || "unknown"]}
                  <span className="font-semibold">{matchLabels[latestEvent.matchResult || "unknown"]}</span>
                </div>
                {latestEvent.matchOwner && (
                  <span className="text-sm" style={{ color: palette.text }}>{latestEvent.matchOwner}</span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {latestEvent.vehicleBrand && (
                    <span className="text-xs" style={{ color: palette.textMuted }}>
                      {latestEvent.vehicleColor} {latestEvent.vehicleBrand} {latestEvent.vehicleModel}
                    </span>
                  )}
                  <span className="text-xs font-mono" style={{ color: palette.textMuted }}>
                    {formatTime(latestEvent.timestamp)}
                  </span>
                </div>
              </div>
              {/* Plate/scene images — click to enlarge */}
              {(latestEvent.plateImageId || latestEvent.fullImageId) && (
                <div className="flex gap-2 mt-2">
                  {latestEvent.fullImageId && (
                    <PlateImg
                      src={apiUrl(`/api/hik/images/${latestEvent.fullImageId}`)}
                      alt="Escena"
                      className="h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ border: `1px solid ${palette.border}`, maxWidth: "200px" }}
                      onClick={() => {
                        const extras: { src: string; label: string }[] = [];
                        if (latestEvent.plateImageId) extras.push({ src: apiUrl(`/api/hik/images/${latestEvent.plateImageId}`), label: "Placa" });
                        setLightboxSrc({ src: apiUrl(`/api/hik/images/${latestEvent.fullImageId!}`), alt: "Escena completa", extras });
                      }}
                    />
                  )}
                  {latestEvent.plateImageId && (
                    <PlateImg
                      src={apiUrl(`/api/hik/images/${latestEvent.plateImageId}`)}
                      alt="Placa"
                      className="h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ border: `1px solid ${palette.border}`, maxWidth: "120px" }}
                      onClick={() => {
                        const extras: { src: string; label: string }[] = [];
                        if (latestEvent.fullImageId) extras.push({ src: apiUrl(`/api/hik/images/${latestEvent.fullImageId}`), label: "Escena" });
                        setLightboxSrc({ src: apiUrl(`/api/hik/images/${latestEvent.plateImageId!}`), alt: "Placa", extras });
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Access History Table ── */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: palette.surface, border: `1px solid ${palette.border}` }}
          >
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${palette.border}` }}>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" style={{ color: palette.accent }} />
                <span className="text-sm font-semibold" style={{ color: palette.text }}>Historial de Accesos</span>
              </div>
              <span className="text-xs" style={{ color: palette.textMuted }}>{accessLog.length} registros</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: `${palette.border} transparent` }}>
              {accessLog.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: palette.textMuted }}>
                  Sin registros de acceso
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: palette.textMuted }}>Hora</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: palette.textMuted }}>Placa</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: palette.textMuted }}>Estado</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: palette.textMuted }}>Propietario</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: palette.textMuted }}>Vehículo</th>
                      <th className="text-center px-3 py-2 font-medium" style={{ color: palette.textMuted }}>Foto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLog.map((entry, i) => {
                      const color = matchColors[entry.matchResult] || palette.textMuted;
                      return (
                        <tr
                          key={entry.id || i}
                          className="transition-colors"
                          style={{
                            borderBottom: `1px solid ${palette.border}`,
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = palette.surfaceHover)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: palette.textMuted }}>
                            {formatDate(entry.timestamp)} {formatTime(entry.timestamp)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className="font-mono font-bold tracking-wider px-2 py-0.5 rounded"
                              style={{ color, background: color + "15" }}
                            >
                              {entry.plate}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1" style={{ color }}>
                              {matchIcons[entry.matchResult] || <ShieldQuestion className="w-3 h-3" />}
                              <span className="font-medium">{matchLabels[entry.matchResult] || entry.matchResult}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2" style={{ color: palette.text }}>
                            {entry.ownerName || "—"}
                          </td>
                          <td className="px-3 py-2" style={{ color: palette.textMuted }}>
                            {[entry.vehicleColor, entry.vehicleBrand, entry.vehicleModel].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {(entry.plateImageId || entry.fullImageId) ? (
                              <PlateImg
                                src={apiUrl(`/api/hik/images/${entry.plateImageId || entry.fullImageId}`)}
                                alt="Cap"
                                className="w-14 h-9 object-cover rounded inline-block cursor-pointer hover:opacity-80 transition-opacity"
                                style={{ border: `1px solid ${palette.border}` }}
                                onClick={() => {
                                  const mainId = entry.fullImageId || entry.plateImageId;
                                  const extras: { src: string; label: string }[] = [];
                                  if (entry.fullImageId && entry.plateImageId) {
                                    extras.push({ src: apiUrl(`/api/hik/images/${entry.plateImageId}`), label: "Placa" });
                                  }
                                  setLightboxSrc({ src: apiUrl(`/api/hik/images/${mainId!}`), alt: `${entry.plate} — ${formatDate(entry.timestamp)} ${formatTime(entry.timestamp)}`, extras });
                                }}
                              />
                            ) : (
                              <span style={{ color: palette.textDim }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right: Live Event Feed */}
        <div
          className="rounded-xl overflow-hidden flex flex-col"
          style={{
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            maxHeight: "calc(100vh - 220px)",
          }}
        >
          {/* Feed header */}
          <div className="flex-shrink-0" style={{ borderBottom: `1px solid ${palette.border}` }}>
            <div className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" style={{ color: palette.accent }} />
                <span className="text-sm font-semibold" style={{ color: palette.text }}>Lecturas en Vivo</span>
                {events.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: `${palette.accent}18`, color: palette.accent }}>
                    {events.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: connected ? palette.authorized : palette.blocked,
                    boxShadow: connected ? `0 0 6px ${palette.authorized}` : "none",
                    animation: connected ? "pulse 2s infinite" : "none",
                  }}
                />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: palette.textMuted }}>
                  SSE
                </span>
              </div>
            </div>
            {/* Feed search */}
            <div className="px-3 pb-2">
              <div className="relative group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors group-focus-within:opacity-80" style={{ color: palette.textDim }} />
                <input
                  type="text"
                  placeholder="Buscar matrícula, marca, dueño..."
                  value={feedSearch}
                  onChange={(e) => setFeedSearch(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 rounded-xl text-xs outline-none transition-all focus:ring-1"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${palette.border}`,
                    color: palette.text,
                    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
                    // @ts-ignore
                    "--tw-ring-color": `${palette.accent}40`,
                  }}
                />
                {feedSearch && (
                  <button
                    onClick={() => setFeedSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    <X className="w-3 h-3" style={{ color: palette.textDim }} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Events list */}
          <div
            className="flex-1 overflow-y-auto px-2 py-2 space-y-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: `${palette.border} transparent` }}
          >
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Radar className="w-8 h-8 mb-3 animate-spin" style={{ color: palette.textDim, animationDuration: "3s" }} />
                <p className="text-sm" style={{ color: palette.textMuted }}>
                  {feedSearch ? "Sin resultados" : "Esperando detecciones..."}
                </p>
                <p className="text-xs mt-1" style={{ color: palette.textDim }}>
                  {feedSearch ? `No hay lecturas que coincidan con "${feedSearch}"` : "Las lecturas LPR aparecerán aquí en tiempo real"}
                </p>
              </div>
            ) : (
              filteredEvents.map((ev) => {
                const color = matchColors[ev.matchResult || "unknown"] || palette.textMuted;
                const evTime = new Date(ev.timestamp);
                const timeStr = evTime.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <div
                    key={ev.id}
                    className="rounded-lg px-2.5 py-2 transition-all cursor-pointer group"
                    style={{
                      background: "transparent",
                      border: `1px solid transparent`,
                    }}
                    onClick={() => setSelectedEvent(ev)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = palette.surfaceHover;
                      e.currentTarget.style.borderColor = `${color}20`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {/* Time — prominent */}
                      <div className="flex-shrink-0 text-right" style={{ minWidth: 52 }}>
                        <div className="font-mono font-bold text-[13px] leading-none" style={{ color: palette.text }}>
                          {timeStr.slice(0, 5)}
                        </div>
                        <div className="font-mono text-[9px] mt-0.5 opacity-50" style={{ color: palette.textMuted }}>
                          {timeStr.slice(6)}s
                        </div>
                      </div>
                      {/* Status icon */}
                      <div className="flex-shrink-0 w-5 flex justify-center" style={{ color }}>
                        {matchIcons[ev.matchResult || "unknown"]}
                      </div>
                      {/* Plate + info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm tracking-wider" style={{ color }}>
                            {ev.licensePlate}
                          </span>
                          {ev.confidence && (
                            <span className="text-[9px] px-1 py-0.5 rounded font-mono" style={{ background: `${palette.accent}15`, color: palette.accent }}>
                              {ev.confidence}%
                            </span>
                          )}
                        </div>
                        {(ev.vehicleBrand || ev.vehicleColor || ev.matchOwner) && (
                          <div className="text-[10px] truncate mt-0.5" style={{ color: palette.textDim }}>
                            {ev.matchOwner ? ev.matchOwner : [ev.vehicleColor, ev.vehicleBrand, ev.vehicleModel].filter(Boolean).join(" ")}
                          </div>
                        )}
                      </div>
                      {/* Chevron hint */}
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: palette.textDim }} />
                    </div>
                  </div>
                );
              })
            )}
            <div ref={eventsEndRef} />
          </div>

          {/* ── Event Detail Modal ── */}
          {selectedEvent && (() => {
            const ev = selectedEvent;
            const color = matchColors[ev.matchResult || "unknown"] || palette.textMuted;
            const evTime = new Date(ev.timestamp);
            const brandLogo = ev.vehicleBrand ? getCarBrandLogo(ev.vehicleBrand) : null;
            return (
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
                onClick={() => setSelectedEvent(null)}
              >
                <div
                  className="relative rounded-3xl overflow-hidden shadow-2xl w-full max-w-md mx-4"
                  style={{
                    background: palette.surface,
                    border: `1px solid ${color}30`,
                    boxShadow: `0 0 60px ${color}15, 0 25px 50px rgba(0,0,0,0.5)`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header band */}
                  <div
                    className="px-6 py-4 flex items-center justify-between"
                    style={{ background: `linear-gradient(135deg, ${color}18, ${color}06)`, borderBottom: `1px solid ${color}20` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
                        {matchIcons[ev.matchResult || "unknown"]}
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>{matchLabels[ev.matchResult || "unknown"]}</div>
                        {ev.matchOwner && <div className="text-xs mt-0.5" style={{ color: palette.text }}>{ev.matchOwner}</div>}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                    >
                      <X className="w-4 h-4" style={{ color: palette.textMuted }} />
                    </button>
                  </div>

                  {/* Plate number — big */}
                  <div className="px-6 pt-5 pb-3 text-center">
                    <div
                      className="font-mono font-black text-3xl tracking-[0.25em] inline-block px-5 py-2 rounded-xl"
                      style={{
                        color,
                        background: `${color}08`,
                        border: `2px solid ${color}25`,
                        textShadow: `0 0 30px ${color}30`,
                      }}
                    >
                      {ev.licensePlate}
                    </div>
                  </div>

                  {/* Timestamp — very prominent */}
                  <div className="text-center pb-4">
                    <div className="font-mono text-xl font-bold" style={{ color: palette.text }}>
                      {evTime.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: palette.textDim }}>
                      {evTime.toLocaleDateString("es-UY", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="px-6 pb-4 space-y-2">
                    {/* Vehicle info */}
                    {(ev.vehicleBrand || ev.vehicleColor) && (
                      <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                        {brandLogo ? (
                          <img src={brandLogo} alt={ev.vehicleBrand} className="w-8 h-8 object-contain" style={{ filter: "brightness(0) invert(0.7)" }} />
                        ) : (
                          <Car className="w-5 h-5 flex-shrink-0" style={{ color: palette.textMuted }} />
                        )}
                        <div>
                          <div className="text-sm font-medium" style={{ color: palette.text }}>
                            {[ev.vehicleBrand, ev.vehicleModel].filter(Boolean).join(" ") || "Vehículo"}
                          </div>
                          {ev.vehicleColor && (
                            <div className="text-[11px]" style={{ color: palette.textDim }}>Color: {ev.vehicleColor}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-2">
                      {ev.confidence && (
                        <div className="rounded-xl px-4 py-2.5 text-center" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                          <div className="text-lg font-bold font-mono" style={{ color: palette.accent }}>{ev.confidence}%</div>
                          <div className="text-[9px] uppercase tracking-widest font-semibold mt-0.5" style={{ color: palette.textDim }}>Confianza</div>
                        </div>
                      )}
                      {ev.direction && (
                        <div className="rounded-xl px-4 py-2.5 text-center" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                          <div className="text-lg font-bold" style={{ color: palette.text }}>{ev.direction === "approaching" ? "↓ Entrada" : ev.direction === "leaving" ? "↑ Salida" : ev.direction}</div>
                          <div className="text-[9px] uppercase tracking-widest font-semibold mt-0.5" style={{ color: palette.textDim }}>Dirección</div>
                        </div>
                      )}
                    </div>

                    {/* Images */}
                    {(ev.plateImageId || ev.fullImageId) && (
                      <div className="flex gap-3 pt-1">
                        {ev.fullImageId && (
                          <PlateImg
                            src={apiUrl(`/api/hik/images/${ev.fullImageId}`)}
                            alt="Escena"
                            className="flex-1 h-28 rounded-xl object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ border: `1px solid ${palette.border}` }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const extras: { src: string; label: string }[] = [];
                              if (ev.plateImageId) extras.push({ src: apiUrl(`/api/hik/images/${ev.plateImageId}`), label: "Placa" });
                              setLightboxSrc({ src: apiUrl(`/api/hik/images/${ev.fullImageId!}`), alt: `${ev.licensePlate} — Escena`, extras });
                            }}
                          />
                        )}
                        {ev.plateImageId && (
                          <PlateImg
                            src={apiUrl(`/api/hik/images/${ev.plateImageId}`)}
                            alt="Placa"
                            className="w-28 h-28 rounded-xl object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ border: `1px solid ${palette.border}` }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const extras: { src: string; label: string }[] = [];
                              if (ev.fullImageId) extras.push({ src: apiUrl(`/api/hik/images/${ev.fullImageId}`), label: "Escena" });
                              setLightboxSrc({ src: apiUrl(`/api/hik/images/${ev.plateImageId!}`), alt: `${ev.licensePlate} — Placa`, extras });
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer — Camera info */}
                  {(() => {
                    const cam = lprCameras.find((c) => c.ip === ev.cameraIp || c.nodeId === ev.nodeId);
                    const camLabel = cam?.label || ev.cameraIp || "—";
                    return (
                      <div className="px-6 py-3 space-y-1" style={{ borderTop: `1px solid ${palette.border}` }}>
                        <div className="flex items-center gap-2">
                          <Camera className="w-3.5 h-3.5" style={{ color: palette.textDim }} />
                          <span className="text-xs font-medium" style={{ color: palette.textMuted }}>{camLabel}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]" style={{ color: palette.textDim }}>
                          <span className="font-mono">IP: {ev.cameraIp || "—"}{ev.macAddress ? ` · MAC: ${ev.macAddress}` : ""}</span>
                          <span className="font-mono">{ev.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

          {/* Feed footer with stats */}
          <div
            className="px-4 py-2 flex items-center justify-between flex-shrink-0 text-[10px]"
            style={{ borderTop: `1px solid ${palette.border}`, color: palette.textDim }}
          >
            <span>
              {events.filter((e) => e.matchResult === "authorized").length} autorizados ·{" "}
              {events.filter((e) => e.matchResult === "unknown").length} desconocidos ·{" "}
              {events.filter((e) => e.matchResult === "blocked").length} bloqueados
            </span>
            <span className="font-mono">
              {new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc.src}
          alt={lightboxSrc.alt}
          onClose={() => setLightboxSrc(null)}
          extraImages={lightboxSrc.extras}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ── Analytics Tab — Merodeo Repetitivo ──
// ═══════════════════════════════════════════════════════

function AnalyticsTab({ mapId }: { mapId: string }) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [minCount, setMinCount] = useState(3);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadAnalytics = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ mapId, days: String(days), minCount: String(minCount) });
    apiFetch<AnalyticsResponse>(apiUrl(`/api/plates/analytics?${params}`)).then(({ data: result }) => {
      setData(result);
      setLoading(false);
    });
  }, [mapId, days, minCount]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const getRiskColor = (score: number) => {
    if (score >= 70) return palette.danger;
    if (score >= 40) return palette.gold;
    return palette.unknown;
  };

  const getRiskLabel = (score: number) => {
    if (score >= 70) return "ALTO";
    if (score >= 40) return "MEDIO";
    return "BAJO";
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${palette.danger}20, ${palette.danger}05)`,
              border: `1px solid ${palette.danger}20`,
              animation: data && data.loiteringCount > 0 ? "threat-pulse 3s ease-in-out infinite" : "none",
            }}
          >
            <Radar className="w-6 h-6" style={{ color: palette.danger }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Merodeo Repetitivo</h2>
            <p className="text-xs" style={{ color: palette.textDim }}>
              Vehículos no registrados con apariciones recurrentes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <GlassSelect value={String(days)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDays(Number(e.target.value))}>
            <option value="7" style={{ background: "#111" }}>7 días</option>
            <option value="14" style={{ background: "#111" }}>14 días</option>
            <option value="30" style={{ background: "#111" }}>30 días</option>
            <option value="60" style={{ background: "#111" }}>60 días</option>
            <option value="90" style={{ background: "#111" }}>90 días</option>
          </GlassSelect>

          <GlassSelect value={String(minCount)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMinCount(Number(e.target.value))}>
            <option value="2" style={{ background: "#111" }}>2+ visitas</option>
            <option value="3" style={{ background: "#111" }}>3+ visitas</option>
            <option value="5" style={{ background: "#111" }}>5+ visitas</option>
            <option value="10" style={{ background: "#111" }}>10+ visitas</option>
          </GlassSelect>

          <button
            onClick={loadAnalytics}
            className="p-2.5 rounded-xl transition-all hover:scale-105"
            style={{ background: `${palette.accent}10`, border: `1px solid ${palette.accent}20`, color: palette.accent }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && !loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl p-5" style={{ background: `${palette.accent}06`, border: `1px solid ${palette.accent}12` }}>
            <div className="text-3xl font-black tabular-nums" style={{ color: palette.accent }}>{data.totalUnknownAccesses}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] mt-1" style={{ color: `${palette.accent}60` }}>Accesos desconocidos</div>
          </div>
          <div className="rounded-2xl p-5" style={{ background: `${palette.danger}06`, border: `1px solid ${palette.danger}12` }}>
            <div className="text-3xl font-black tabular-nums" style={{ color: palette.danger }}>{data.loiteringCount}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] mt-1" style={{ color: `${palette.danger}60` }}>Alertas de merodeo</div>
          </div>
          <div className="rounded-2xl p-5" style={{ background: `${palette.gold}06`, border: `1px solid ${palette.gold}12` }}>
            <div className="text-3xl font-black tabular-nums" style={{ color: palette.gold }}>
              {data.loitering.filter((l) => l.riskScore >= 70).length}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] mt-1" style={{ color: `${palette.gold}60` }}>Riesgo alto</div>
          </div>
        </div>
      )}

      {/* Loitering List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonPulse key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : !data || data.loitering.length === 0 ? (
        <div className="text-center py-20 rounded-2xl" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
          <ShieldCheck className="w-12 h-12 mx-auto mb-4" style={{ color: palette.authorized }} />
          <p className="text-base font-semibold" style={{ color: palette.textMuted }}>Sin alertas de merodeo</p>
          <p className="text-xs mt-1" style={{ color: palette.textDim }}>No se detectaron vehículos no registrados con visitas repetidas en el período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.loitering.map((entry) => {
            const riskColor = getRiskColor(entry.riskScore);
            const riskLabel = getRiskLabel(entry.riskScore);
            const isExpanded = expanded === entry.plate;

            return (
              <div
                key={entry.plate}
                className="rounded-2xl overflow-hidden transition-all"
                style={{
                  background: palette.surface,
                  border: `1px solid ${isExpanded ? `${riskColor}30` : palette.border}`,
                  boxShadow: isExpanded ? `0 0 30px ${riskColor}08` : "none",
                }}
              >
                {/* Main Row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : entry.plate)}
                  className="w-full flex items-center gap-5 px-6 py-5 text-left transition-colors"
                  style={{ background: isExpanded ? `${riskColor}04` : "transparent" }}
                  onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = palette.surfaceHover; }}
                  onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Risk Indicator */}
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center"
                      style={{
                        background: `${riskColor}12`,
                        border: `2px solid ${riskColor}30`,
                        boxShadow: entry.riskScore >= 70 ? `0 0 20px ${riskColor}20` : "none",
                      }}
                    >
                      <span className="text-lg font-black tabular-nums" style={{ color: riskColor }}>{entry.riskScore}</span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: riskColor }}>{riskLabel}</span>
                  </div>

                  {/* Plate */}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-black tracking-[0.2em] text-xl" style={{ color: riskColor, textShadow: `0 0 24px ${riskColor}20` }}>
                      {entry.plate}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs" style={{ color: palette.textDim }}>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {entry.count} avistamientos
                      </span>
                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {entry.cameras.length} cámara{entry.cameras.length !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        {entry.timePattern === "night" ? <Moon className="w-3 h-3" /> : entry.timePattern === "day" ? <Sun className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                        {entry.timePattern === "night" ? "Nocturno" : entry.timePattern === "day" ? "Diurno" : "Mixto"}
                      </span>
                      {entry.avgInterval > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ~{entry.avgInterval < 24 ? `${entry.avgInterval}h` : `${Math.round(entry.avgInterval / 24)}d`} entre visitas
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="text-right text-xs" style={{ color: palette.textDim }}>
                    <div>Primer registro: <span style={{ color: palette.textMuted }}>{new Date(entry.firstSeen).toLocaleDateString("es-UY")}</span></div>
                    <div>Último registro: <span style={{ color: palette.textMuted }}>{new Date(entry.lastSeen).toLocaleDateString("es-UY")}</span></div>
                  </div>

                  <ChevronRight
                    className="w-4 h-4 transition-transform"
                    style={{ color: palette.textDim, transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}
                  />
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-6 pb-5 fade-in" style={{ borderTop: `1px solid ${palette.border}` }}>
                    {/* Cameras */}
                    <div className="flex items-center gap-2 py-4">
                      <MapPin className="w-3.5 h-3.5" style={{ color: palette.textDim }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: palette.textDim }}>Cámaras:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.cameras.map((cam) => (
                          <span
                            key={cam}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                            style={{ background: `${palette.accent}10`, color: palette.accent, border: `1px solid ${palette.accent}15` }}
                          >
                            {cam}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Sightings Timeline */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: palette.textDim }}>
                        Últimos avistamientos
                      </span>
                      <div className="grid gap-2">
                        {entry.sightings.map((s, i) => {
                          const t = new Date(s.timestamp);
                          const isNight = t.getHours() >= 20 || t.getHours() < 6;
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-4 px-4 py-2.5 rounded-xl"
                              style={{ background: "rgba(255,255,255,0.015)", border: `1px solid ${palette.border}` }}
                            >
                              {/* Time indicator */}
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: isNight ? `${palette.visitor}12` : `${palette.accent}08` }}>
                                {isNight ? <Moon className="w-3.5 h-3.5" style={{ color: palette.visitor }} /> : <Sun className="w-3.5 h-3.5" style={{ color: palette.accent }} />}
                              </div>

                              <div className="flex-1 min-w-0">
                                <span className="font-mono text-xs" style={{ color: palette.textMuted }}>
                                  {t.toLocaleDateString("es-UY")} {t.toLocaleTimeString("es-UY")}
                                </span>
                                <div className="flex items-center gap-3 text-[11px] mt-0.5" style={{ color: palette.textDim }}>
                                  <span>{s.nodeLabel || s.nodeId}</span>
                                  {s.direction && <span>{s.direction === "forward" ? "→ Entrada" : "← Salida"}</span>}
                                  {(s.vehicleColor || s.vehicleBrand) && (
                                    <span>{[s.vehicleColor, s.vehicleBrand].filter(Boolean).join(" ")}</span>
                                  )}
                                </div>
                              </div>

                              {(s.plateImageId || s.fullImageId) && (
                                <PlateImg
                                  src={apiUrl(`/api/hik/images/${s.plateImageId || s.fullImageId}`)}
                                  alt="Captura"
                                  className="w-20 h-12 object-cover rounded-lg"
                                  style={{ border: `1px solid ${palette.border}` }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Webcam Cédula Scanner ────────────────────────────────────────────────────

function CedulaWebcamScanner({ onScanResult }: { onScanResult: (cedula: string, name?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>("Iniciando cámara...");
  const [scanMode, setScanMode] = useState<"barcode" | "ocr">("barcode");
  const scannerInstanceRef = useRef<any>(null);
  const mountedRef = useRef(true);

  // Start webcam
  useEffect(() => {
    mountedRef.current = true;
    let localStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        if (!mountedRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
        localStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setScanStatus("Apunte la cédula a la cámara");
        setScanning(true);
      })
      .catch((err) => {
        setScanStatus(`Error: ${err.message}`);
      });

    return () => {
      mountedRef.current = false;
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (scannerInstanceRef.current) {
        try { scannerInstanceRef.current.stop(); } catch {}
      }
    };
  }, []);

  // Barcode scanning loop using html5-qrcode
  useEffect(() => {
    if (!scanning || scanMode !== "barcode" || !videoRef.current) return;
    let active = true;

    const startBarcodeScanner = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        // We scan frames from the video manually instead of using Html5QrcodeScanner
        // which needs a container. Use the raw decode approach.
        const scanner = new Html5Qrcode("cedula-scanner-hidden");
        scannerInstanceRef.current = scanner;

        const poll = async () => {
          if (!active || !videoRef.current || !canvasRef.current) return;

          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");
          if (!ctx || video.readyState < 2) {
            if (active) setTimeout(poll, 500);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          try {
            const imageData = canvas.toDataURL("image/jpeg", 0.9);
            // Create a temporary image file from the data URL
            const blob = await (await fetch(imageData)).blob();
            const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
            const result = await scanner.scanFileV2(file, false);
            if (result && result.decodedText) {
              const text = result.decodedText.trim();
              // Try to parse cédula data from barcode
              const parsed = parseCedulaBarcode(text);
              onScanResult(parsed.cedula, parsed.name);
              return; // Stop polling on success
            }
          } catch {
            // No barcode found in this frame — continue
          }

          if (active) setTimeout(poll, 800);
        };

        // Start after video is ready
        setTimeout(poll, 1000);
      } catch (err) {
        console.error("Barcode scanner init error:", err);
        setScanStatus("Error al iniciar scanner de barcode");
      }
    };

    startBarcodeScanner();

    return () => {
      active = false;
      if (scannerInstanceRef.current) {
        try { scannerInstanceRef.current.clear(); } catch {}
        scannerInstanceRef.current = null;
      }
    };
  }, [scanning, scanMode, onScanResult]);

  // OCR capture
  const handleOcrCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    setOcrProcessing(true);
    setScanStatus("Procesando imagen con OCR...");

    try {
      const Tesseract = await import("tesseract.js");
      const { data } = await Tesseract.recognize(canvas, "spa", {
        logger: (m: any) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            setScanStatus(`Reconociendo texto... ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const text = data.text;
      // Try to extract cédula number (Uruguayan format: X.XXX.XXX-X)
      const cedulaMatch = text.match(/(\d[\d.]{5,9}-?\d)/);
      const cedula = cedulaMatch ? cedulaMatch[1].replace(/[.\-]/g, "") : "";

      // Try to extract name (usually on lines above/below the cédula)
      const lines = text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 3);
      const nameCandidate = lines.find((l: string) =>
        /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(l) && !l.match(/\d{4,}/) && l.length > 5
      );

      if (cedula) {
        onScanResult(cedula, nameCandidate || undefined);
      } else {
        setScanStatus("No se pudo leer la cédula. Intente nuevamente.");
      }
    } catch (err) {
      setScanStatus("Error en OCR. Intente nuevamente.");
    }
    setOcrProcessing(false);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${palette.border}` }}>
      {/* Video preview */}
      <div className="relative aspect-video bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />

        {/* Scan overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-[80%] h-[60%] rounded-2xl"
            style={{
              border: `2px solid ${palette.gold}60`,
              boxShadow: `0 0 30px ${palette.gold}15, inset 0 0 30px ${palette.gold}05`,
            }}
          >
            {scanMode === "barcode" && scanning && (
              <div className="absolute top-0 left-0 right-0 h-[2px] animate-scan-line" style={{ background: `linear-gradient(90deg, transparent, ${palette.gold}, transparent)` }} />
            )}
          </div>
        </div>

        {/* Status */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <span className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: "rgba(0,0,0,0.7)", color: palette.gold }}>
            {ocrProcessing ? <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> : <ScanLine className="w-3 h-3 inline mr-1" />}
            {scanStatus}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setScanMode("barcode")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: scanMode === "barcode" ? `${palette.gold}20` : "transparent",
            border: `1px solid ${scanMode === "barcode" ? palette.gold : palette.border}`,
            color: scanMode === "barcode" ? palette.gold : palette.textMuted,
          }}
        >
          <ScanLine className="w-3.5 h-3.5" /> Barcode Auto
        </button>
        <button
          type="button"
          onClick={() => { setScanMode("ocr"); setScanStatus("Posicione la cédula y capture"); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: scanMode === "ocr" ? `${palette.accent}20` : "transparent",
            border: `1px solid ${scanMode === "ocr" ? palette.accent : palette.border}`,
            color: scanMode === "ocr" ? palette.accent : palette.textMuted,
          }}
        >
          <ImageIcon className="w-3.5 h-3.5" /> OCR Manual
        </button>
        {scanMode === "ocr" && (
          <button
            type="button"
            disabled={ocrProcessing}
            onClick={handleOcrCapture}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent}cc)`,
              color: "#000",
            }}
          >
            <CameraIcon className="w-3.5 h-3.5" /> {ocrProcessing ? "Procesando..." : "Capturar"}
          </button>
        )}
      </div>

      {/* Hidden elements for html5-qrcode */}
      <div id="cedula-scanner-hidden" style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <style>{`
        @keyframes scan-line-move {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(100% - 2px)); }
        }
        .animate-scan-line {
          animation: scan-line-move 2s ease-in-out infinite alternate;
          position: absolute;
        }
      `}</style>
    </div>
  );
}

/** Parse Uruguayan cédula barcode data */
function parseCedulaBarcode(raw: string): { cedula: string; name?: string } {
  // PDF417 barcodes on Uruguayan cédulas often contain pipe-separated or fixed-width fields
  // Common format: CEDULA|APELLIDO|NOMBRE|...
  // Also handle raw number (just the cédula number)

  // If it's just digits, it's the cédula number
  const digitsOnly = raw.replace(/[^0-9]/g, "");
  if (/^\d{6,8}$/.test(digitsOnly)) {
    return { cedula: digitsOnly };
  }

  // Try pipe-separated
  if (raw.includes("|")) {
    const parts = raw.split("|");
    const cedula = parts[0]?.replace(/\D/g, "") || digitsOnly;
    const name = [parts[2], parts[1]].filter(Boolean).join(" ").trim();
    return { cedula, name: name || undefined };
  }

  // Try to find a cédula pattern in the text
  const match = raw.match(/(\d[\d.]{5,9}-?\d?)/);
  if (match) {
    return { cedula: match[1].replace(/[.\-]/g, "") };
  }

  // Fallback: return raw as cédula
  return { cedula: raw.replace(/\D/g, "").slice(0, 8) || raw };
}

// ── Sync Comparison Modal ────────────────────────────────────────────────────

interface CameraPlate {
  id: string;
  plate: string;
  listType: string;
  ownerInfo?: string;
}

interface SyncComparisonData {
  cameraIp: string;
  cameraLabel: string;
  cameraPlates: CameraPlate[];
  loading: boolean;
  error?: string;
}

function SyncModal({
  mapId,
  onClose,
  onSyncComplete,
}: {
  mapId: string;
  onClose: () => void;
  onSyncComplete: () => void;
}) {
  const [lprCameras, setLprCameras] = useState<any[]>([]);
  const [cameraData, setCameraData] = useState<Map<string, SyncComparisonData>>(new Map());
  const [systemPlates, setSystemPlates] = useState<PlateRecord[]>([]);
  const [loadingCams, setLoadingCams] = useState(true);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ step: string; progress: number; detail: string }>({ step: "", progress: 0, detail: "" });
  const [syncDone, setSyncDone] = useState(false);
  const [syncResults, setSyncResults] = useState<any>(null);
  const [importPlates, setImportPlates] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // Load cameras and system plates
  useEffect(() => {
    const load = async () => {
      // Fetch system plates
      const { data: plateData } = await apiFetch<{ plates: PlateRecord[] }>(apiUrl(`/api/plates?mapId=${mapId}`));
      setSystemPlates(plateData?.plates || []);

      // Fetch LPR cameras
      const camRes = await fetch(apiUrl("/api/cameras"), { headers: { Accept: "application/json" } });
      const camData = await camRes.json();
      const allCams = camData.cameras || [];
      const lprs = allCams.filter((c: any) => {
        const lbl = (c.label || "").toLowerCase();
        return c.mapId === mapId && c.ip && (
          lbl.includes("lpr") || lbl.includes("placa") || lbl.includes("patente") ||
          lbl.includes("anpr") || lbl.includes("acceso") || lbl.includes("entrada") ||
          lbl.includes("salida") || lbl.includes("gate") || lbl.includes("barrera")
        );
      });
      setLprCameras(lprs);
      if (lprs.length > 0) setSelectedCamera(lprs[0].ip);
      setLoadingCams(false);

      // Load plates from each camera
      for (const cam of lprs) {
        setCameraData((prev) => {
          const next = new Map(prev);
          next.set(cam.ip, { cameraIp: cam.ip, cameraLabel: cam.label, cameraPlates: [], loading: true });
          return next;
        });

        try {
          const params = new URLSearchParams({
            ip: cam.ip,
            user: cam.mgmtUser || "admin",
            pass: cam.mgmtPassword || "",
          });
          const res = await fetch(apiUrl(`/api/plates/sync?${params}`));
          const data = await res.json();
          setCameraData((prev) => {
            const next = new Map(prev);
            next.set(cam.ip, {
              cameraIp: cam.ip,
              cameraLabel: cam.label,
              cameraPlates: data.plates || [],
              loading: false,
              error: data.error,
            });
            return next;
          });
        } catch (err: any) {
          setCameraData((prev) => {
            const next = new Map(prev);
            next.set(cam.ip, {
              cameraIp: cam.ip,
              cameraLabel: cam.label,
              cameraPlates: [],
              loading: false,
              error: err.message,
            });
            return next;
          });
        }
      }
    };

    load();
  }, [mapId]);

  const currentCam = cameraData.get(selectedCamera);
  const systemSet = new Set(systemPlates.map((p) => p.plate));
  const cameraSet = new Set(currentCam?.cameraPlates.map((p) => p.plate) || []);

  const onlyInSystem = systemPlates.filter((p) => !cameraSet.has(p.plate) && (p.category === "authorized" || p.category === "blocked"));
  const onlyInCamera = (currentCam?.cameraPlates || []).filter((p) => !systemSet.has(p.plate));
  const inBoth = systemPlates.filter((p) => cameraSet.has(p.plate));

  // Push to camera (sync system → camera)
  const handlePushToCamera = async () => {
    setSyncing(true);
    setSyncDone(false);
    setSyncProgress({ step: "Preparando sincronización...", progress: 5, detail: "" });

    try {
      const cam = lprCameras.find((c: any) => c.ip === selectedCamera);
      if (!cam) return;

      setSyncProgress({ step: "Limpiando matrículas de cámara...", progress: 20, detail: cam.label });
      await new Promise((r) => setTimeout(r, 500));

      setSyncProgress({ step: "Subiendo matrículas del sistema...", progress: 40, detail: `${systemPlates.filter((p) => p.category !== "visitor").length} matrículas` });

      const res = await fetch(apiUrl("/api/plates/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapId,
          cameras: [{
            ip: cam.ip,
            user: cam.mgmtUser || "admin",
            pass: cam.mgmtPassword || "",
            label: cam.label,
          }],
          mode: "full",
        }),
      });
      const result = await res.json();

      setSyncProgress({ step: "Verificando...", progress: 80, detail: "" });
      await new Promise((r) => setTimeout(r, 500));

      setSyncProgress({ step: "¡Completado!", progress: 100, detail: "" });
      setSyncResults(result);
      setSyncDone(true);

      // Reload camera data
      const params = new URLSearchParams({
        ip: cam.ip,
        user: cam.mgmtUser || "admin",
        pass: cam.mgmtPassword || "",
      });
      const reloadRes = await fetch(apiUrl(`/api/plates/sync?${params}`));
      const reloadData = await reloadRes.json();
      setCameraData((prev) => {
        const next = new Map(prev);
        next.set(cam.ip, {
          cameraIp: cam.ip,
          cameraLabel: cam.label,
          cameraPlates: reloadData.plates || [],
          loading: false,
        });
        return next;
      });

      onSyncComplete();
    } catch (err: any) {
      setSyncProgress({ step: "Error", progress: 0, detail: err.message });
    }
    setSyncing(false);
  };

  // Import plates from camera to system
  const handleImportFromCamera = async () => {
    if (importPlates.size === 0) return;
    setImporting(true);

    for (const plate of importPlates) {
      const camPlate = (currentCam?.cameraPlates || []).find((p) => p.plate === plate);
      if (!camPlate) continue;

      await apiFetch(apiUrl("/api/plates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapId,
          plate: camPlate.plate,
          category: camPlate.listType === "blackList" ? "blocked" : "authorized",
          ownerName: camPlate.ownerInfo || "Importado de cámara",
        }),
      });
    }

    // Reload system plates
    const { data: plateData } = await apiFetch<{ plates: PlateRecord[] }>(apiUrl(`/api/plates?mapId=${mapId}`));
    setSystemPlates(plateData?.plates || []);
    setImportPlates(new Set());
    setImporting(false);
    onSyncComplete();
  };

  const toggleImport = (plate: string) => {
    setImportPlates((prev) => {
      const next = new Set(prev);
      if (next.has(plate)) next.delete(plate); else next.add(plate);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl"
        style={{
          background: "rgba(10,10,25,0.98)",
          border: `1px solid ${palette.accent}20`,
          boxShadow: `0 0 80px rgba(0,0,0,0.6), 0 0 40px ${palette.accent}08`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4" style={{ borderBottom: `1px solid ${palette.border}` }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${palette.accent}15`, border: `1px solid ${palette.accent}25` }}>
              <ArrowLeftRight className="w-5 h-5" style={{ color: palette.accent }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "#fff" }}>Sincronización de Matrículas</h2>
              <p className="text-xs" style={{ color: palette.textDim }}>Compara y sincroniza matrículas entre el sistema y las cámaras LPR</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:scale-105 transition-all" style={{ color: palette.textMuted }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {loadingCams ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: palette.accent }} />
            <p className="text-sm" style={{ color: palette.textMuted }}>Cargando cámaras LPR...</p>
          </div>
        ) : lprCameras.length === 0 ? (
          <div className="p-12 text-center">
            <CameraIcon className="w-12 h-12 mx-auto mb-3" style={{ color: palette.textDim }} />
            <p className="text-sm" style={{ color: palette.textMuted }}>No se encontraron cámaras LPR en este mapa.</p>
            <p className="text-xs mt-1" style={{ color: palette.textDim }}>Las cámaras deben tener "LPR", "acceso" u otro keyword en su nombre.</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Camera selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium" style={{ color: palette.textDim }}>Cámara:</span>
              <div className="flex gap-2 flex-wrap">
                {lprCameras.map((cam: any) => {
                  const data = cameraData.get(cam.ip);
                  const isSelected = selectedCamera === cam.ip;
                  return (
                    <button
                      key={cam.ip}
                      onClick={() => setSelectedCamera(cam.ip)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                      style={{
                        background: isSelected ? `${palette.accent}15` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isSelected ? palette.accent + "40" : palette.border}`,
                        color: isSelected ? palette.accent : palette.textMuted,
                      }}
                    >
                      <CameraIcon className="w-3.5 h-3.5" />
                      {cam.label}
                      {data && !data.loading && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `${palette.accent}10`, color: palette.accent }}>
                          {data.cameraPlates.length}
                        </span>
                      )}
                      {data?.loading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sync progress overlay */}
            {syncing && (
              <div className="rounded-2xl p-6 space-y-4" style={{ background: `${palette.accent}08`, border: `1px solid ${palette.accent}20` }}>
                <div className="flex items-center gap-3">
                  {syncDone ? (
                    <CheckCircle2 className="w-6 h-6" style={{ color: palette.authorized }} />
                  ) : (
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: palette.accent }} />
                  )}
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#fff" }}>{syncProgress.step}</p>
                    {syncProgress.detail && <p className="text-xs" style={{ color: palette.textMuted }}>{syncProgress.detail}</p>}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${syncProgress.progress}%`,
                      background: syncDone
                        ? `linear-gradient(90deg, ${palette.authorized}, ${palette.authorized}cc)`
                        : `linear-gradient(90deg, ${palette.accent}, ${palette.accent}cc)`,
                      boxShadow: `0 0 10px ${syncDone ? palette.authorized : palette.accent}40`,
                    }}
                  />
                </div>
                {syncResults && syncDone && (
                  <div className="text-xs space-y-1" style={{ color: palette.textMuted }}>
                    {(syncResults.results || []).map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        {r.success ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: palette.authorized }} /> : <XCircle className="w-3.5 h-3.5" style={{ color: palette.danger }} />}
                        <span>{r.cameraLabel}: {r.added} subidas{r.deleted > 0 ? `, ${r.deleted} eliminadas` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comparison */}
            {!syncing && currentCam && !currentCam.loading && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-4 text-center" style={{ background: `${palette.authorized}08`, border: `1px solid ${palette.authorized}15` }}>
                    <div className="text-2xl font-bold" style={{ color: palette.authorized }}>{inBoth.length}</div>
                    <div className="text-[10px] uppercase tracking-wider font-medium mt-1" style={{ color: `${palette.authorized}80` }}>En ambos</div>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ background: `${palette.accent}08`, border: `1px solid ${palette.accent}15` }}>
                    <div className="text-2xl font-bold" style={{ color: palette.accent }}>{onlyInSystem.length}</div>
                    <div className="text-[10px] uppercase tracking-wider font-medium mt-1" style={{ color: `${palette.accent}80` }}>Solo en sistema</div>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ background: `${palette.gold}08`, border: `1px solid ${palette.gold}15` }}>
                    <div className="text-2xl font-bold" style={{ color: palette.gold }}>{onlyInCamera.length}</div>
                    <div className="text-[10px] uppercase tracking-wider font-medium mt-1" style={{ color: `${palette.gold}80` }}>Solo en cámara</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handlePushToCamera}
                    disabled={syncing}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.01]"
                    style={{
                      background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent}bb)`,
                      color: "#000",
                      boxShadow: `0 4px 20px ${palette.accent}30`,
                    }}
                  >
                    <ArrowUpFromLine className="w-4 h-4" /> Subir Sistema → Cámara (Full Sync)
                  </button>
                  {onlyInCamera.length > 0 && (
                    <button
                      onClick={() => {
                        // Select all camera-only plates for import
                        setImportPlates(new Set(onlyInCamera.map((p) => p.plate)));
                      }}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01]"
                      style={{
                        background: `${palette.gold}12`,
                        border: `1px solid ${palette.gold}30`,
                        color: palette.gold,
                      }}
                    >
                      <ArrowDownToLine className="w-4 h-4" /> Seleccionar todas para importar
                    </button>
                  )}
                </div>

                {/* Plates comparison tables */}
                <div className="grid grid-cols-2 gap-4">
                  {/* System plates */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4" style={{ color: palette.accent }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: palette.accent }}>
                        Sistema ({systemPlates.filter((p) => p.category !== "visitor").length})
                      </span>
                    </div>
                    <div className="space-y-1 max-h-[300px] overflow-auto pr-1">
                      {systemPlates.filter((p) => p.category !== "visitor").map((p) => {
                        const inCamera = cameraSet.has(p.plate);
                        return (
                          <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${palette.border}` }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: inCamera ? palette.authorized : palette.gold }} />
                            <span className="font-mono font-bold flex-1" style={{ color: palette.text }}>{p.plate}</span>
                            <span className="truncate max-w-[100px]" style={{ color: palette.textDim }}>{p.ownerName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                              background: `${p.category === "authorized" ? palette.authorized : palette.blocked}15`,
                              color: p.category === "authorized" ? palette.authorized : palette.blocked,
                            }}>
                              {p.category === "authorized" ? "OK" : "BLK"}
                            </span>
                            {inCamera ? (
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: palette.authorized }} />
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${palette.gold}15`, color: palette.gold }}>pendiente</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Camera plates */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CameraIcon className="w-4 h-4" style={{ color: palette.gold }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: palette.gold }}>
                        Cámara: {currentCam.cameraLabel} ({currentCam.cameraPlates.length})
                      </span>
                    </div>
                    {currentCam.error ? (
                      <div className="rounded-xl p-4 text-center" style={{ background: `${palette.danger}08`, border: `1px solid ${palette.danger}20` }}>
                        <XCircle className="w-6 h-6 mx-auto mb-2" style={{ color: palette.danger }} />
                        <p className="text-xs" style={{ color: palette.danger }}>{currentCam.error}</p>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-[300px] overflow-auto pr-1">
                        {currentCam.cameraPlates.map((p) => {
                          const inSystem = systemSet.has(p.plate);
                          const isSelected = importPlates.has(p.plate);
                          return (
                            <div
                              key={p.id || p.plate}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-all"
                              style={{
                                background: isSelected ? `${palette.gold}10` : "rgba(255,255,255,0.02)",
                                border: `1px solid ${isSelected ? palette.gold + "40" : palette.border}`,
                              }}
                              onClick={() => { if (!inSystem) toggleImport(p.plate); }}
                            >
                              {!inSystem && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleImport(p.plate)}
                                  className="accent-amber-500 w-3.5 h-3.5"
                                />
                              )}
                              <span className="w-2 h-2 rounded-full" style={{ background: inSystem ? palette.authorized : palette.gold }} />
                              <span className="font-mono font-bold flex-1" style={{ color: palette.text }}>{p.plate}</span>
                              <span className="truncate max-w-[100px]" style={{ color: palette.textDim }}>{p.ownerInfo || "—"}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                                background: `${p.listType === "blackList" ? palette.blocked : palette.authorized}15`,
                                color: p.listType === "blackList" ? palette.blocked : palette.authorized,
                              }}>
                                {p.listType === "blackList" ? "BLK" : "OK"}
                              </span>
                              {inSystem ? (
                                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: palette.authorized }} />
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${palette.gold}15`, color: palette.gold }}>nueva</span>
                              )}
                            </div>
                          );
                        })}
                        {currentCam.cameraPlates.length === 0 && (
                          <p className="text-xs text-center py-6" style={{ color: palette.textDim }}>Cámara vacía — sin matrículas</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Import action */}
                {importPlates.size > 0 && (
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: `${palette.gold}08`, border: `1px solid ${palette.gold}20` }}>
                    <ArrowDownToLine className="w-5 h-5" style={{ color: palette.gold }} />
                    <span className="text-sm font-medium flex-1" style={{ color: palette.gold }}>
                      {importPlates.size} matrícula(s) seleccionada(s) para importar de cámara al sistema
                    </span>
                    <button
                      onClick={handleImportFromCamera}
                      disabled={importing}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]"
                      style={{
                        background: `linear-gradient(135deg, ${palette.gold}, ${palette.gold}cc)`,
                        color: "#000",
                      }}
                    >
                      {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {importing ? "Importando..." : "Importar al sistema"}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Camera loading */}
            {currentCam?.loading && (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: palette.accent }} />
                <p className="text-xs" style={{ color: palette.textMuted }}>Leyendo matrículas de {currentCam.cameraLabel}...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bitácora Garita Tab ──────────────────────────────────────────────────────

interface Visitor {
  id: string;
  cedula: string;
  name: string;
  company?: string;
  personToVisit: string;
  vehiclePlate?: string;
  vehicleDesc?: string;
  reason?: string;
  observations?: string;
  checkIn: string;
  checkOut?: string;
  durationMinutes?: number;
  mapId: string;
  guardName?: string;
}

interface VisitorStatsData {
  totalToday: number;
  activeNow: number;
  totalThisWeek: number;
  totalThisMonth: number;
  avgDurationMinutes: number;
}

function BitacoraTab({ mapId }: { mapId: string }) {
  // ── State ──
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [stats, setStats] = useState<VisitorStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [historyModal, setHistoryModal] = useState<{ cedula: string; name: string } | null>(null);
  const [history, setHistory] = useState<Visitor[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scannerRef = useRef<HTMLInputElement>(null);
  const LIMIT = 30;

  // ── Form State ──
  const [form, setForm] = useState({
    cedula: "",
    name: "",
    company: "",
    personToVisit: "",
    vehiclePlate: "",
    vehicleDesc: "",
    reason: "",
    observations: "",
    guardName: "",
  });

  // ── Load visitors ──
  const loadVisitors = useCallback(async () => {
    const params = new URLSearchParams({ mapId, limit: String(LIMIT), offset: String(page * LIMIT) });
    if (search) params.set("q", search);
    if (activeOnly) params.set("activeOnly", "true");
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    const { data } = await apiFetch<{ visitors: Visitor[]; total: number }>(
      apiUrl(`/api/visitors?${params}`)
    );
    if (data) {
      setVisitors(data.visitors);
      setTotal(data.total);
    }
    setLoading(false);
  }, [mapId, search, activeOnly, dateFrom, dateTo, page]);

  const loadStats = useCallback(async () => {
    const { data } = await apiFetch<VisitorStatsData>(apiUrl(`/api/visitors/stats?mapId=${mapId}`));
    if (data) setStats(data);
  }, [mapId]);

  useEffect(() => {
    setLoading(true);
    loadVisitors();
  }, [loadVisitors]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── Auto-focus scanner input ──
  useEffect(() => {
    if (showForm && scannerRef.current) {
      scannerRef.current.focus();
    }
  }, [showForm]);

  // ── Scan handler: lookup cédula history when scanned ──
  const handleScan = useCallback(
    async (cedula: string) => {
      if (!cedula.trim()) return;

      // Look up previous visits for auto-fill
      const { data } = await apiFetch<{ visits: Visitor[] }>(
        apiUrl(`/api/visitors/history?mapId=${mapId}&cedula=${encodeURIComponent(cedula.trim())}`)
      );

      if (data && data.visits.length > 0) {
        const last = data.visits[0];
        setForm((f) => ({
          ...f,
          cedula: cedula.trim(),
          name: last.name || f.name,
          company: last.company || f.company,
          vehiclePlate: last.vehiclePlate || f.vehiclePlate,
          vehicleDesc: last.vehicleDesc || f.vehicleDesc,
        }));
      } else {
        setForm((f) => ({ ...f, cedula: cedula.trim() }));
      }
    },
    [mapId]
  );

  // ── Submit check-in ──
  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cedula || !form.name || !form.personToVisit) return;

    setSaving(true);
    const { data, error } = await apiFetch<Visitor>(apiUrl("/api/visitors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapId, ...form }),
    });

    if (error) {
      alert(error);
    } else if (data) {
      setForm({ cedula: "", name: "", company: "", personToVisit: "", vehiclePlate: "", vehicleDesc: "", reason: "", observations: "", guardName: "" });
      setShowForm(false);
      loadVisitors();
      loadStats();
    }
    setSaving(false);
  };

  // ── Check-out ──
  const handleCheckOut = async (id: string) => {
    setCheckingOut(id);
    const { data } = await apiFetch<Visitor>(apiUrl(`/api/visitors/${id}/checkout?mapId=${mapId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (data) {
      loadVisitors();
      loadStats();
    }
    setCheckingOut(null);
  };

  // ── Load cédula history ──
  const openHistory = async (cedula: string, name: string) => {
    setHistoryModal({ cedula, name });
    const { data } = await apiFetch<{ visits: Visitor[] }>(
      apiUrl(`/api/visitors/history?mapId=${mapId}&cedula=${encodeURIComponent(cedula)}`)
    );
    if (data) setHistory(data.visits);
  };

  // ── Export ──
  const handleExport = () => {
    const params = new URLSearchParams({ mapId, format: "csv" });
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    window.open(apiUrl(`/api/visitors/export?${params}`), "_blank");
  };

  // ── Duration formatter ──
  const fmtDuration = (minutes?: number) => {
    if (minutes == null) return "—";
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  const fmtElapsed = (checkIn: string) => {
    const elapsed = Math.round((Date.now() - new Date(checkIn).getTime()) / 60000);
    if (elapsed < 60) return `${elapsed} min`;
    const h = Math.floor(elapsed / 60);
    const m = elapsed % 60;
    return `${h}h ${m}m`;
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      {/* ── Stats Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "En sitio", value: stats.activeNow, color: palette.authorized, icon: <Users className="w-4 h-4" /> },
            { label: "Hoy", value: stats.totalToday, color: palette.accent, icon: <LogIn className="w-4 h-4" /> },
            { label: "Semana", value: stats.totalThisWeek, color: palette.visitor, icon: <ClipboardList className="w-4 h-4" /> },
            { label: "Mes", value: stats.totalThisMonth, color: palette.gold, icon: <BarChart3 className="w-4 h-4" /> },
            { label: "Duración prom.", value: fmtDuration(stats.avgDurationMinutes), color: palette.textMuted, icon: <Clock className="w-4 h-4" /> },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl p-4 flex flex-col gap-1"
              style={{
                background: `${s.color}08`,
                border: `1px solid ${s.color}18`,
              }}
            >
              <div className="flex items-center gap-2 text-xs font-medium" style={{ color: `${s.color}90` }}>
                {s.icon} {s.label}
              </div>
              <div className="text-2xl font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => { setShowForm(true); setEditingVisitor(null); setForm({ cedula: "", name: "", company: "", personToVisit: "", vehiclePlate: "", vehicleDesc: "", reason: "", observations: "", guardName: "" }); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
          style={{
            background: `linear-gradient(135deg, ${palette.gold}, ${palette.gold}cc)`,
            color: "#000",
            boxShadow: `0 4px 20px ${palette.gold}30`,
          }}
        >
          <ScanLine className="w-4 h-4" /> Registrar Ingreso
        </button>

        <div className="flex-1 min-w-[200px]">
          <GlassInput
            icon={<Search className="w-4 h-4" />}
            placeholder="Buscar por cédula, nombre, empresa..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl text-xs font-medium transition-all" style={{ background: activeOnly ? `${palette.authorized}15` : "rgba(255,255,255,0.04)", border: `1px solid ${activeOnly ? `${palette.authorized}30` : palette.border}`, color: activeOnly ? palette.authorized : palette.textMuted }}>
          <input type="checkbox" className="hidden" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); setPage(0); }} />
          <UserCheck className="w-3.5 h-3.5" />
          En sitio
        </label>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl text-xs transition-all focus:outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.text }}
        />
        <span className="text-xs" style={{ color: palette.textDim }}>→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl text-xs transition-all focus:outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.text }}
        />

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-[1.02]"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.textMuted }}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar CSV
        </button>

        <button
          onClick={() => { loadVisitors(); loadStats(); }}
          className="p-2 rounded-xl transition-all hover:scale-[1.05]"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.textMuted }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Check-In Form Modal ── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowForm(false)}
        >
          <form
            onSubmit={handleCheckIn}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(15,15,30,0.98)",
              border: `1px solid ${palette.gold}25`,
              boxShadow: `0 0 60px rgba(0,0,0,0.5), 0 0 30px ${palette.gold}10`,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${palette.gold}15`, border: `1px solid ${palette.gold}25` }}>
                  <ScanLine className="w-5 h-5" style={{ color: palette.gold }} />
                </div>
                <div>
                  <h3 className="text-base font-bold" style={{ color: "#fff" }}>Registrar Ingreso</h3>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: palette.textDim }}>Escanee la cédula o ingrese manualmente</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="p-1.5 rounded-lg" style={{ color: palette.textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scanner: text input + webcam toggle */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: palette.gold }}>
                    <ScanLine className="w-5 h-5" />
                  </div>
                  <input
                    ref={scannerRef}
                    type="text"
                    placeholder="Escanear cédula / código..."
                    value={form.cedula}
                    onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleScan(form.cedula);
                      }
                    }}
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl text-lg font-mono transition-all focus:outline-none focus:ring-2"
                    style={{
                      background: `${palette.gold}08`,
                      border: `2px solid ${palette.gold}30`,
                      color: palette.gold,
                      // @ts-ignore
                      "--tw-ring-color": `${palette.gold}50`,
                    }}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCameraOpen(!cameraOpen)}
                  className="flex items-center gap-2 px-4 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
                  style={{
                    background: cameraOpen ? `${palette.accent}20` : `${palette.gold}10`,
                    border: `2px solid ${cameraOpen ? palette.accent : palette.gold}30`,
                    color: cameraOpen ? palette.accent : palette.gold,
                  }}
                >
                  <CameraIcon className="w-5 h-5" />
                  {cameraOpen ? "Cerrar" : "Cámara"}
                </button>
              </div>

              {/* Webcam scanner area */}
              {cameraOpen && (
                <CedulaWebcamScanner
                  onScanResult={(cedula, name) => {
                    setForm((f) => ({ ...f, cedula, name: name || f.name }));
                    handleScan(cedula);
                    setCameraOpen(false);
                  }}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Nombre completo *</label>
                <GlassInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellido" required />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Empresa</label>
                <GlassInput icon={<Building2 className="w-3.5 h-3.5" />} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Empresa u organización" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Visita a *</label>
                <GlassInput icon={<UserCheck className="w-3.5 h-3.5" />} value={form.personToVisit} onChange={(e) => setForm({ ...form, personToVisit: e.target.value })} placeholder="Persona a visitar" required />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Matrícula</label>
                <GlassInput icon={<Car className="w-3.5 h-3.5" />} value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} placeholder="ABC 1234" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Vehículo</label>
                <GlassInput value={form.vehicleDesc} onChange={(e) => setForm({ ...form, vehicleDesc: e.target.value })} placeholder="Ej: Toyota Hilux gris" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Motivo de visita</label>
                <GlassInput value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Motivo de la visita" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Observaciones</label>
                <GlassInput value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Notas del guardia" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1 block" style={{ color: palette.textDim }}>Guardia</label>
                <GlassInput icon={<Shield className="w-3.5 h-3.5" />} value={form.guardName} onChange={(e) => setForm({ ...form, guardName: e.target.value })} placeholder="Nombre del guardia" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.textMuted }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !form.cedula || !form.name || !form.personToVisit}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.01] disabled:opacity-40"
                style={{
                  background: `linear-gradient(135deg, ${palette.gold}, ${palette.gold}cc)`,
                  color: "#000",
                  boxShadow: `0 4px 20px ${palette.gold}30`,
                }}
              >
                <LogIn className="w-4 h-4" />
                {saving ? "Registrando..." : "Registrar Ingreso"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── History Modal ── */}
      {historyModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => { setHistoryModal(null); setHistory([]); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-2xl p-6"
            style={{
              background: "rgba(15,15,30,0.98)",
              border: `1px solid ${palette.accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold" style={{ color: "#fff" }}>Historial de visitas</h3>
                <p className="text-xs" style={{ color: palette.textMuted }}>{historyModal.name} — CI: {historyModal.cedula}</p>
              </div>
              <button onClick={() => { setHistoryModal(null); setHistory([]); }} className="p-1.5 rounded-lg" style={{ color: palette.textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {history.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: palette.textDim }}>Sin registros anteriores</p>
            ) : (
              <div className="space-y-2">
                {history.map((v) => (
                  <div key={v.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${palette.border}` }}>
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium" style={{ color: palette.text }}>
                        {fmtDate(v.checkIn)} — {fmtTime(v.checkIn)}
                        {v.checkOut && <> → {fmtTime(v.checkOut)}</>}
                      </div>
                      <div className="text-xs" style={{ color: v.checkOut ? palette.textMuted : palette.authorized }}>
                        {v.checkOut ? fmtDuration(v.durationMinutes) : "En sitio"}
                      </div>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: palette.textMuted }}>
                      Visita a: {v.personToVisit}
                      {v.company && <> · {v.company}</>}
                      {v.reason && <> · {v.reason}</>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Visitor Table ── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonPulse key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : visitors.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="w-12 h-12 mx-auto mb-3" style={{ color: palette.textDim }} />
          <p className="text-sm" style={{ color: palette.textMuted }}>
            {search || activeOnly || dateFrom ? "Sin resultados con los filtros actuales" : "No hay registros de visitas"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visitors.map((v) => {
            const isActive = !v.checkOut;
            const isExpanded = expandedId === v.id;

            return (
              <div
                key={v.id}
                className="rounded-xl transition-all cursor-pointer"
                style={{
                  background: isActive ? `${palette.authorized}06` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? `${palette.authorized}20` : palette.border}`,
                }}
                onClick={() => setExpandedId(isExpanded ? null : v.id)}
              >
                {/* Main row */}
                <div className="flex items-center gap-4 px-4 py-3">
                  {/* Status indicator */}
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      background: isActive ? palette.authorized : palette.textDim,
                      boxShadow: isActive ? `0 0 8px ${palette.authorized}60` : "none",
                    }}
                  />

                  {/* Name & cédula */}
                  <div className="min-w-[180px]">
                    <div className="text-sm font-semibold" style={{ color: palette.text }}>{v.name}</div>
                    <div className="text-[11px] font-mono" style={{ color: palette.textMuted }}>CI: {v.cedula}</div>
                  </div>

                  {/* Company */}
                  <div className="min-w-[120px] hidden md:block">
                    {v.company ? (
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: palette.textMuted }}>
                        <Building2 className="w-3 h-3" /> {v.company}
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: palette.textDim }}>—</span>
                    )}
                  </div>

                  {/* Person to visit */}
                  <div className="min-w-[120px] hidden lg:block">
                    <div className="text-xs" style={{ color: palette.textMuted }}>
                      <span style={{ color: palette.textDim }}>Visita:</span> {v.personToVisit}
                    </div>
                  </div>

                  {/* Vehicle */}
                  {v.vehiclePlate && (
                    <div className="hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${palette.border}`, color: palette.text }}>
                      <Car className="w-3 h-3" style={{ color: palette.textDim }} />
                      {v.vehiclePlate}
                    </div>
                  )}

                  <div className="flex-1" />

                  {/* Time */}
                  <div className="text-right min-w-[80px]">
                    <div className="text-xs font-medium" style={{ color: palette.text }}>
                      {fmtTime(v.checkIn)}
                    </div>
                    <div className="text-[10px]" style={{ color: isActive ? palette.authorized : palette.textDim }}>
                      {isActive ? `↻ ${fmtElapsed(v.checkIn)}` : v.checkOut ? `→ ${fmtTime(v.checkOut)}` : ""}
                    </div>
                  </div>

                  {/* Duration / Status */}
                  <div className="min-w-[70px] text-right">
                    {isActive ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase"
                        style={{ background: `${palette.authorized}15`, color: palette.authorized, border: `1px solid ${palette.authorized}25` }}
                      >
                        <Activity className="w-3 h-3" /> En sitio
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: palette.textMuted }}>
                        {fmtDuration(v.durationMinutes)}
                      </span>
                    )}
                  </div>

                  {/* Checkout button */}
                  {isActive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCheckOut(v.id); }}
                      disabled={checkingOut === v.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-[1.03]"
                      style={{
                        background: `${palette.visitor}15`,
                        border: `1px solid ${palette.visitor}30`,
                        color: palette.visitor,
                      }}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {checkingOut === v.id ? "..." : "Salida"}
                    </button>
                  )}

                  {/* History */}
                  <button
                    onClick={(e) => { e.stopPropagation(); openHistory(v.cedula, v.name); }}
                    className="p-1.5 rounded-lg transition-all hover:scale-105"
                    style={{ color: palette.textDim }}
                    title="Ver historial"
                  >
                    <History className="w-4 h-4" />
                  </button>

                  <ChevronRight
                    className="w-4 h-4 transition-transform"
                    style={{ color: palette.textDim, transform: isExpanded ? "rotate(90deg)" : "none" }}
                  />
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs" style={{ borderTop: `1px solid ${palette.border}` }}>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Empresa</span>
                      <span style={{ color: palette.textMuted }}>{v.company || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Visita a</span>
                      <span style={{ color: palette.textMuted }}>{v.personToVisit}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Vehículo</span>
                      <span style={{ color: palette.textMuted }}>{v.vehiclePlate || "—"} {v.vehicleDesc && `(${v.vehicleDesc})`}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Motivo</span>
                      <span style={{ color: palette.textMuted }}>{v.reason || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Entrada</span>
                      <span style={{ color: palette.textMuted }}>{fmtDate(v.checkIn)} {fmtTime(v.checkIn)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Salida</span>
                      <span style={{ color: v.checkOut ? palette.textMuted : palette.authorized }}>
                        {v.checkOut ? `${fmtDate(v.checkOut)} ${fmtTime(v.checkOut)}` : "En sitio"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Guardia</span>
                      <span style={{ color: palette.textMuted }}>{v.guardName || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: palette.textDim }}>Observaciones</span>
                      <span style={{ color: palette.textMuted }}>{v.observations || "—"}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.textMuted }}
          >
            ← Anterior
          </button>
          <span className="text-xs" style={{ color: palette.textDim }}>
            {page + 1} / {totalPages} ({total} registros)
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${palette.border}`, color: palette.textMuted }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
