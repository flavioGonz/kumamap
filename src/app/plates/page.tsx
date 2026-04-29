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
} from "lucide-react";

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

type MatchResult = "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";
type TabId = "registry" | "log" | "stats" | "analytics";

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

// ── Main Page ──

export default function PlatesPage() {
  const [maps, setMaps] = useState<{ id: string; name: string }[]>([]);
  const [selectedMap, setSelectedMap] = useState<string>("");
  const [tab, setTab] = useState<TabId>("registry");
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

  const loadLog = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ mapId, limit: "200" });
    if (filterResult !== "all") params.set("matchResult", filterResult);
    if (filterPlate) params.set("plate", filterPlate);
    apiFetch<{ log: AccessLogEntry[] }>(apiUrl(`/api/plates/log?${params}`)).then(({ data }) => {
      setEntries(data?.log || []);
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
                        <img
                          src={apiUrl(`/api/hik/images/${e.plateImageId || e.fullImageId}`)}
                          alt="Captura"
                          className="w-20 h-12 object-cover rounded-lg"
                          style={{ border: `1px solid ${palette.border}` }}
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
                                <img
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
