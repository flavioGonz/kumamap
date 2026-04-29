"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

type MatchResult = "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";
type TabId = "registry" | "log" | "stats";

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

const matchColors: Record<MatchResult, string> = {
  authorized: "#4ade80",
  visitor: "#a78bfa",
  visitor_expired: "#fb923c",
  blocked: "#f87171",
  unknown: "#fbbf24",
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
  { value: "authorized", label: "Autorizado", color: "#4ade80" },
  { value: "visitor", label: "Visitante", color: "#a78bfa" },
  { value: "blocked", label: "Bloqueado", color: "#f87171" },
];

// ── Main Page ──

export default function PlatesPage() {
  const [maps, setMaps] = useState<{ id: string; name: string }[]>([]);
  const [selectedMap, setSelectedMap] = useState<string>("");
  const [tab, setTab] = useState<TabId>("registry");
  const [loading, setLoading] = useState(true);

  // Load maps
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a14" }}>
        <div className="text-white/40 text-sm">Cargando mapas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a14", color: "#e2e8f0" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 flex items-center gap-4 px-6 py-3"
        style={{
          background: "rgba(10,10,20,0.95)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
        }}
      >
        <a href="/" className="text-white/40 hover:text-white/60 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <Car className="w-5 h-5 text-cyan-400" />
        <h1 className="text-lg font-bold text-white">Control de Accesos LPR</h1>

        {/* Map selector */}
        <div className="ml-auto relative">
          <select
            value={selectedMap}
            onChange={(e) => setSelectedMap(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-sm font-medium"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "#e2e8f0",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {maps.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        </div>
      </header>

      {/* Tabs */}
      <div
        className="flex gap-1 px-6 pt-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {([
          { id: "registry" as TabId, label: "Registro", icon: <Car className="w-3.5 h-3.5" /> },
          { id: "log" as TabId, label: "Accesos", icon: <History className="w-3.5 h-3.5" /> },
          { id: "stats" as TabId, label: "Estadísticas", icon: <BarChart3 className="w-3.5 h-3.5" /> },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
            style={{
              background: tab === t.id ? "rgba(6,182,212,0.1)" : "transparent",
              color: tab === t.id ? "#06b6d4" : "rgba(255,255,255,0.4)",
              borderBottom: tab === t.id ? "2px solid #06b6d4" : "2px solid transparent",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        {selectedMap && tab === "registry" && <RegistryTab mapId={selectedMap} />}
        {selectedMap && tab === "log" && <AccessLogTab mapId={selectedMap} />}
        {selectedMap && tab === "stats" && <StatsTab mapId={selectedMap} />}
      </div>
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

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Buscar matrícula o propietario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0",
            }}
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-white/30" />
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="text-sm rounded-lg px-2 py-2"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0",
            }}
          >
            <option value="all">Todos</option>
            <option value="authorized">Autorizados</option>
            <option value="visitor">Visitantes</option>
            <option value="blocked">Bloqueados</option>
          </select>
        </div>

        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:brightness-110"
          style={{ background: "#06b6d4", color: "#0a0a14" }}
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Matrícula</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Categoría</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Propietario</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Vehículo</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Vigencia</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Notas</th>
              <th className="text-right px-4 py-2.5 text-white/40 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/30">Cargando...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/30">
                  {search ? "Sin resultados" : "No hay matrículas registradas"}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const catColor = matchColors[p.category as MatchResult] || "#fbbf24";
                const catLabel = matchLabels[p.category as MatchResult] || p.category;
                const isExpired =
                  p.category === "visitor" && p.validUntil && new Date(p.validUntil) < new Date();
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-white/[0.02] transition-colors"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className="font-mono font-bold tracking-wider text-sm"
                        style={{ color: catColor }}
                      >
                        {p.plate}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: `${catColor}15`,
                          color: catColor,
                          border: `1px solid ${catColor}25`,
                        }}
                      >
                        {matchIcons[p.category as MatchResult]}
                        {catLabel}
                        {isExpired && (
                          <span className="text-orange-400 ml-1">(vencido)</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-white/70">{p.ownerName}</td>
                    <td className="px-4 py-2.5 text-white/40 text-xs">{p.vehicleDesc || "—"}</td>
                    <td className="px-4 py-2.5 text-white/40 text-xs">
                      {p.category === "visitor" && p.validFrom && p.validUntil
                        ? `${new Date(p.validFrom).toLocaleDateString("es-UY")} – ${new Date(p.validUntil).toLocaleDateString("es-UY")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-white/30 text-xs max-w-[200px] truncate">
                      {p.notes || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditModal(p)}
                          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/40 hover:text-cyan-400"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.plate)}
                          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/40 hover:text-red-400"
                          title="Eliminar"
                        >
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

      {/* Summary */}
      <div className="flex items-center gap-4 mt-3 text-xs text-white/30">
        <span>{filtered.length} matrícula{filtered.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{plates.filter((p) => p.category === "authorized").length} autorizados</span>
        <span>{plates.filter((p) => p.category === "visitor").length} visitantes</span>
        <span>{plates.filter((p) => p.category === "blocked").length} bloqueados</span>
      </div>

      {/* Add/Edit Modal */}
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
// ── Plate Form Modal (Add / Edit) ──
// ═══════════════════════════════════════════════════════

function PlateFormModal({
  mapId,
  plate,
  onClose,
  onSaved,
}: {
  mapId: string;
  plate?: PlateRecord;
  onClose: () => void;
  onSaved: () => void;
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
    if (err) {
      setError(err);
    } else {
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: "rgba(15,15,30,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">
            {isEdit ? "Editar Matrícula" : "Agregar Matrícula"}
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Plate */}
          <div>
            <label className="block text-xs text-white/40 mb-1">Matrícula</label>
            <input
              type="text"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
              placeholder="ABC1234"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono font-bold tracking-wider"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0",
              }}
              disabled={isEdit}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-white/40 mb-1">Categoría</label>
            <div className="flex gap-2">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setCategory(opt.value)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: category === opt.value ? `${opt.color}20` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${category === opt.value ? `${opt.color}40` : "rgba(255,255,255,0.08)"}`,
                    color: category === opt.value ? opt.color : "rgba(255,255,255,0.4)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Owner */}
          <div>
            <label className="block text-xs text-white/40 mb-1">Propietario</label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Nombre completo"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0",
              }}
            />
          </div>

          {/* Vehicle */}
          <div>
            <label className="block text-xs text-white/40 mb-1">Vehículo (opcional)</label>
            <input
              type="text"
              value={vehicleDesc}
              onChange={(e) => setVehicleDesc(e.target.value)}
              placeholder="Toyota Corolla blanco"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0",
              }}
            />
          </div>

          {/* Visitor date range */}
          {category === "visitor" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-white/40 mb-1">Desde</label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e2e8f0",
                    colorScheme: "dark",
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-white/40 mb-1">Hasta</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e2e8f0",
                    colorScheme: "dark",
                  }}
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-white/40 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0",
              }}
            />
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors hover:brightness-110"
              style={{
                background: saving ? "rgba(6,182,212,0.4)" : "#06b6d4",
                color: "#0a0a14",
              }}
            >
              {saving ? "Guardando..." : isEdit ? "Guardar" : "Agregar"}
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

  const handleExport = () => {
    const params = new URLSearchParams({ mapId });
    window.open(apiUrl(`/api/plates/export?${params}`), "_blank");
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Filtrar por matrícula..."
            value={filterPlate}
            onChange={(e) => setFilterPlate(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0",
            }}
          />
        </div>

        <select
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="text-sm rounded-lg px-2 py-2"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#e2e8f0",
          }}
        >
          <option value="all">Todos</option>
          <option value="authorized">Autorizados</option>
          <option value="visitor">Visitantes</option>
          <option value="blocked">Bloqueados</option>
          <option value="unknown">Desconocidos</option>
        </select>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
          style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#06b6d4" }}
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Log table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Fecha/Hora</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Matrícula</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Estado</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Propietario</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Cámara</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Vehículo</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Dirección</th>
              <th className="text-left px-4 py-2.5 text-white/40 font-medium">Imagen</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/30">Cargando...</td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/30">Sin registros</td>
              </tr>
            ) : (
              entries.map((e) => {
                const result = (e.matchResult as MatchResult) || "unknown";
                const color = matchColors[result];
                const label = matchLabels[result];
                const time = new Date(e.timestamp);
                return (
                  <tr
                    key={e.id}
                    className="hover:bg-white/[0.02] transition-colors"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <td className="px-4 py-2 text-white/50 text-xs font-mono">
                      {time.toLocaleDateString("es-UY")} {time.toLocaleTimeString("es-UY")}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono font-bold tracking-wider text-sm" style={{ color }}>
                        {e.plate}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}
                      >
                        {matchIcons[result]} {label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-white/50 text-xs">{e.ownerName || "—"}</td>
                    <td className="px-4 py-2 text-white/40 text-xs">{e.nodeLabel || e.nodeId}</td>
                    <td className="px-4 py-2 text-white/30 text-xs">
                      {[e.vehicleColor, e.vehicleBrand, e.vehicleModel].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-white/30 text-xs">
                      {e.direction === "forward" ? "→ Entrada" : e.direction === "reverse" ? "← Salida" : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {(e.plateImageId || e.fullImageId) ? (
                        <img
                          src={apiUrl(`/api/hik/images/${e.plateImageId || e.fullImageId}`)}
                          alt="Captura"
                          className="w-16 h-10 object-cover rounded"
                          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                        />
                      ) : (
                        <span className="text-white/20 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-white/30 mt-3">
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
    return <div className="text-center text-white/30 py-12">Cargando estadísticas...</div>;
  }

  if (!stats) {
    return <div className="text-center text-white/30 py-12">Sin datos</div>;
  }

  const totalEvents = Object.values(stats.byResult).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Accesos" value={totalEvents} color="#06b6d4" />
        <StatCard label="Autorizados" value={stats.byResult.authorized || 0} color="#4ade80" />
        <StatCard label="Visitantes" value={stats.byResult.visitor || 0} color="#a78bfa" />
        <StatCard label="Bloqueados" value={stats.byResult.blocked || 0} color="#f87171" />
        <StatCard label="Desconocidos" value={stats.byResult.unknown || 0} color="#fbbf24" />
      </div>

      {/* Top plates */}
      <div
        className="rounded-xl p-4"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h3 className="text-sm font-bold text-white/60 mb-3">Top Matrículas (últimos 30 días)</h3>
        {stats.topPlates.length === 0 ? (
          <div className="text-xs text-white/30">Sin datos</div>
        ) : (
          <div className="space-y-2">
            {stats.topPlates.slice(0, 10).map((tp, i) => {
              const pct = totalEvents > 0 ? (tp.count / totalEvents) * 100 : 0;
              return (
                <div key={tp.plate} className="flex items-center gap-3">
                  <span className="text-xs text-white/30 w-4">{i + 1}</span>
                  <span className="font-mono font-bold text-sm text-cyan-400 w-24">{tp.plate}</span>
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: "linear-gradient(90deg, rgba(6,182,212,0.4), rgba(6,182,212,0.2))",
                      }}
                    />
                  </div>
                  <span className="text-xs text-white/40 w-12 text-right">{tp.count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hourly distribution */}
      <div
        className="rounded-xl p-4"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h3 className="text-sm font-bold text-white/60 mb-3">Distribución por Hora</h3>
        <div className="flex items-end gap-0.5 h-24">
          {Array.from({ length: 24 }, (_, h) => {
            const key = String(h).padStart(2, "0");
            const count = stats.byHour[key] || 0;
            const maxH = Math.max(...Object.values(stats.byHour), 1);
            const pct = (count / maxH) * 100;
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${key}:00 — ${count} accesos`}>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(pct, 2)}%`,
                    background: count > 0 ? "rgba(6,182,212,0.5)" : "rgba(255,255,255,0.03)",
                  }}
                />
                {h % 3 === 0 && (
                  <span className="text-[8px] text-white/20">{key}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily trend */}
      <div
        className="rounded-xl p-4"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h3 className="text-sm font-bold text-white/60 mb-3">Tendencia Diaria (últimos 30 días)</h3>
        {Object.keys(stats.byDay).length === 0 ? (
          <div className="text-xs text-white/30">Sin datos</div>
        ) : (
          <div className="flex items-end gap-1 h-20">
            {Object.entries(stats.byDay)
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(-30)
              .map(([day, count]) => {
                const maxD = Math.max(...Object.values(stats.byDay), 1);
                const pct = (count / maxD) * 100;
                return (
                  <div
                    key={day}
                    className="flex-1 rounded-t transition-all"
                    style={{
                      height: `${Math.max(pct, 3)}%`,
                      background: count > 0 ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.03)",
                    }}
                    title={`${day}: ${count} accesos`}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl p-4 text-center"
      style={{
        background: `${color}08`,
        border: `1px solid ${color}15`,
      }}
    >
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: `${color}80` }}>{label}</div>
    </div>
  );
}
