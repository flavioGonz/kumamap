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
} from "lucide-react";

// ── Plate Image with fallback ──

function PlateImg({
  src, alt, className, style, onClick,
}: {
  src: string; alt?: string; className?: string; style?: React.CSSProperties; onClick?: (e: React.MouseEvent) => void;
}) {
  const [error, setError] = useState(false);
  if (error) {
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
      onError={() => setError(true)}
    />
  );
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
}

type MatchResult = "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";
type TabId = "booth" | "registry" | "log" | "stats" | "analytics";

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
    <div className="relative">
      {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20">{icon}</div>}
      <input
        {...props}
        className={`w-full ${icon ? "pl-10" : "pl-4"} pr-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none ${props.className || ""}`}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: palette.text,
          backdropFilter: "blur(12px)",
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
        className={`appearance-none pl-3 pr-8 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none ${props.className || ""}`}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: palette.text,
          backdropFilter: "blur(12px)",
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
            href="/"
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
          disabled={syncing}
          onClick={async () => {
            if (!confirm("¿Sincronizar matrículas autorizadas y bloqueadas a todas las cámaras LPR de este mapa?")) return;
            setSyncing(true);
            setSyncResult(null);
            try {
              // Fetch LPR cameras for this map
              const camRes = await fetch(apiUrl("/api/cameras"), { headers: { Accept: "application/json" } });
              const camData = await camRes.json();
              const allCams = camData.cameras || [];
              const lprCams = allCams.filter((c: any) => {
                const lbl = (c.label || "").toLowerCase();
                return c.mapId === mapId && c.ip && (
                  lbl.includes("lpr") || lbl.includes("placa") || lbl.includes("patente") ||
                  lbl.includes("anpr") || lbl.includes("acceso") || lbl.includes("entrada") ||
                  lbl.includes("salida") || lbl.includes("gate") || lbl.includes("barrera")
                );
              });

              if (lprCams.length === 0) {
                setSyncResult({ ok: false, msg: "No se encontraron cámaras LPR en este mapa. Asegurate de que las cámaras tengan 'LPR' en el nombre." });
                setSyncing(false);
                return;
              }

              const cameras = lprCams.map((c: any) => ({
                ip: c.ip,
                user: c.mgmtUser || "admin",
                pass: c.mgmtPassword || "",
                label: c.label,
              }));

              const res = await fetch(apiUrl("/api/plates/sync"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mapId, cameras, mode: "full" }),
              });
              const result = await res.json();

              if (result.error) {
                setSyncResult({ ok: false, msg: result.error });
              } else {
                const msg = `${result.totalPlates} matrículas → ${result.successCameras}/${result.totalCameras} cámaras sincronizadas`;
                setSyncResult({ ok: result.successCameras > 0, msg });
              }
            } catch (err: any) {
              setSyncResult({ ok: false, msg: err.message || "Error de conexión" });
            }
            setSyncing(false);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
          style={{
            border: `1px solid ${palette.border}`,
            color: palette.accent,
            background: `${palette.accent}08`,
            opacity: syncing ? 0.6 : 1,
          }}
        >
          {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {syncing ? "Sincronizando..." : "Sync a Cámaras"}
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

  return (
    <div className="fade-in">
      <div className="flex items-center gap-3 mb-5">
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

        <button
          onClick={() => {
            const params = new URLSearchParams({ mapId });
            window.open(apiUrl(`/api/plates/export?${params}`), "_blank");
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
          style={{ border: `1px solid ${palette.border}`, color: palette.accent, background: `${palette.accent}08` }}
        >
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </button>
      </div>

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
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: palette.textDim }} />
                <input
                  type="text"
                  placeholder="Buscar matrícula..."
                  value={feedSearch}
                  onChange={(e) => setFeedSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
                  style={{
                    background: `${palette.bg}80`,
                    border: `1px solid ${palette.border}`,
                    color: palette.text,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Events list */}
          <div
            className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5"
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
                return (
                  <div
                    key={ev.id}
                    className="rounded-lg px-3 py-2 transition-all cursor-pointer"
                    style={{
                      background: selectedEvent?.id === ev.id ? color + "12" : "transparent",
                      border: `1px solid ${selectedEvent?.id === ev.id ? color + "30" : "transparent"}`,
                    }}
                    onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                    onMouseEnter={(e) => {
                      if (selectedEvent?.id !== ev.id) e.currentTarget.style.background = palette.surfaceHover;
                    }}
                    onMouseLeave={(e) => {
                      if (selectedEvent?.id !== ev.id) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0" style={{ color }}>
                        {matchIcons[ev.matchResult || "unknown"]}
                      </div>
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
                      <span className="flex-shrink-0 text-[10px] font-mono" style={{ color: palette.textDim }}>
                        {formatTime(ev.timestamp)}
                      </span>
                    </div>
                    {/* Expanded details */}
                    {selectedEvent?.id === ev.id && (
                      <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: `1px solid ${palette.border}` }}>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color }}>
                          {matchIcons[ev.matchResult || "unknown"]}
                          <span className="font-semibold">{matchLabels[ev.matchResult || "unknown"]}</span>
                          {ev.matchOwner && (
                            <span className="ml-1" style={{ color: palette.text }}>— {ev.matchOwner}</span>
                          )}
                        </div>
                        {ev.vehicleBrand && (
                          <div className="text-xs" style={{ color: palette.textMuted }}>
                            <Car className="w-3 h-3 inline mr-1" />
                            {[ev.vehicleColor, ev.vehicleBrand, ev.vehicleModel].filter(Boolean).join(" ")}
                          </div>
                        )}
                        {ev.confidence && (
                          <div className="text-xs" style={{ color: palette.textMuted }}>
                            Confianza: {ev.confidence}%
                          </div>
                        )}
                        {ev.direction && (
                          <div className="text-xs" style={{ color: palette.textMuted }}>
                            Dirección: {ev.direction}
                          </div>
                        )}
                        {/* Images — click to enlarge */}
                        {(ev.plateImageId || ev.fullImageId) && (
                          <div className="flex gap-2 mt-1">
                            {ev.fullImageId && (
                              <PlateImg
                                src={apiUrl(`/api/hik/images/${ev.fullImageId}`)}
                                alt="Escena"
                                className="h-14 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                style={{ border: `1px solid ${palette.border}`, maxWidth: "150px" }}
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
                                className="h-14 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                style={{ border: `1px solid ${palette.border}`, maxWidth: "100px" }}
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
                    )}
                  </div>
                );
              })
            )}
            <div ref={eventsEndRef} />
          </div>

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
