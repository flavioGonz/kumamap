"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Toaster, toast } from "sonner";
import {
  Plus,
  Network,
  Trash2,
  Pencil,
  FolderOpen,
  Sparkles,
  MapIcon,
  Tag,
  Layers,
  Search,
  Grid3X3,
  Globe,
  Image,
  ArrowUpDown,
  Clock,
  Filter,
  ExternalLink,
  Copy,
} from "lucide-react";
import type { KumaMonitor } from "@/components/network-map/MonitorPanel";
import NetworkMapEditor from "@/components/network-map/NetworkMapEditor";
import { apiUrl } from "@/lib/api";

interface MapSummary {
  id: string;
  name: string;
  background_type: string;
  kuma_group_id: number | null;
  updated_at: string;
}

// ─── Hook: Poll Kuma monitors ───────────────────
function useKumaMonitors() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [connected, setConnected] = useState(false);
  const prevStatusRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    let mounted = true;

    const fetchKuma = async () => {
      try {
        const res = await fetch(apiUrl("/api/kuma"));
        if (!res.ok || !mounted) return;
        const data = await res.json();

        const newMonitors: KumaMonitor[] = data.monitors || [];
        setConnected(data.connected || false);

        newMonitors.forEach((m) => {
          const prev = prevStatusRef.current.get(m.id);
          if (prev !== undefined && prev !== m.status) {
            if (m.status === 0) {
              toast.error(`${m.name} DOWN`, { description: m.msg || "Monitor caido", duration: 8000 });
            } else if (m.status === 1 && prev === 0) {
              toast.success(`${m.name} UP`, { description: `${m.ping ?? "?"}ms`, duration: 5000 });
            }
          }
          prevStatusRef.current.set(m.id, m.status ?? 2);
        });

        setMonitors(newMonitors);
      } catch {
        if (mounted) setConnected(false);
      }
    };

    fetchKuma();
    const interval = setInterval(fetchKuma, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return { monitors, connected };
}

// ─── Map List Page ──────────────────────────────
function MapListView({
  onOpenMap,
  kumaMonitors,
  kumaConnected,
}: {
  onOpenMap: (id: string) => void;
  kumaMonitors: KumaMonitor[];
  kumaConnected: boolean;
}) {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "updated" | "type">("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [newMapName, setNewMapName] = useState("");
  const [newMapGroup, setNewMapGroup] = useState<number | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const kumaGroups = useMemo(
    () => kumaMonitors.filter((m) => m.type === "group"),
    [kumaMonitors]
  );

  const fetchMaps = useCallback(async () => {
    const res = await fetch(apiUrl("/api/maps"));
    setMaps(await res.json());
  }, []);

  useEffect(() => { fetchMaps(); }, [fetchMaps]);

  const createMap = async (name: string) => {
    const res = await fetch(apiUrl("/api/maps"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kuma_group_id: newMapGroup || null }),
    });
    const map = await res.json();
    toast.success("Mapa creado", { description: name });
    setNewMapName(""); setNewMapGroup(""); setShowCreate(false);
    onOpenMap(map.id);
  };

  const deleteMap = async (id: string, name: string) => {
    await fetch(apiUrl(`/api/maps/${id}`), { method: "DELETE" });
    toast.success("Mapa eliminado", { description: name });
    fetchMaps();
  };

  const renameMap = async (id: string, name: string) => {
    await fetch(apiUrl(`/api/maps/${id}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setEditingId(null);
    fetchMaps();
  };

  const getGroupName = (groupId: number | null) => {
    if (!groupId) return null;
    return kumaGroups.find((g) => g.id === groupId)?.name || `Grupo #${groupId}`;
  };

  const bgTypeIcon = (t: string) => {
    if (t === "livemap") return <Globe className="h-3.5 w-3.5 text-emerald-400" />;
    if (t === "image") return <Image className="h-3.5 w-3.5 text-purple-400" />;
    return <Grid3X3 className="h-3.5 w-3.5 text-[#888]" />;
  };

  const bgTypeLabel = (t: string) => t === "livemap" ? "Mapa real" : t === "image" ? "Imagen" : "Grilla";

  // Filter & sort
  const filtered = useMemo(() => {
    let result = maps;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(q) || getGroupName(m.kuma_group_id)?.toLowerCase().includes(q));
    }
    if (filterType !== "all") result = result.filter((m) => m.background_type === filterType);
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "type") cmp = a.background_type.localeCompare(b.background_type);
      else cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [maps, search, filterType, sortBy, sortDir]);

  const toggleSort = (col: "name" | "updated" | "type") => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: "name" | "updated" | "type" }) => (
    <ArrowUpDown className={`h-3 w-3 ml-0.5 transition-all ${sortBy === col ? "text-blue-400" : "text-[#555]"}`}
      style={{ transform: sortBy === col && sortDir === "desc" ? "scaleY(-1)" : undefined }} />
  );

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
            <Network className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#ededed] tracking-tight">KumaMap</h1>
            <div className="flex items-center gap-2 text-[10px] text-[#737373]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: kumaConnected ? "#22c55e" : "#ef4444", boxShadow: kumaConnected ? "0 0 6px #22c55e" : "0 0 6px #ef4444" }} />
              {kumaConnected ? "Kuma conectado" : "Kuma desconectado"}
              <span className="text-[#555]">&middot;</span>
              <span>{maps.length} mapa{maps.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
        >
          <Plus className="h-4 w-4" /> Nuevo Mapa
        </button>
      </div>

      {/* Create form (collapsible) */}
      {showCreate && (
        <div className="mb-6 rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex gap-2">
            <input type="text" placeholder="Nombre del mapa..." value={newMapName} autoFocus
              onChange={(e) => setNewMapName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newMapName.trim() && createMap(newMapName.trim())}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <select value={newMapGroup} onChange={(e) => setNewMapGroup(e.target.value ? parseInt(e.target.value) : "")}
              className="rounded-xl px-3 py-2 text-xs text-[#ededed] focus:outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <option value="">Sin grupo</option>
              {kumaGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={() => newMapName.trim() && createMap(newMapName.trim())} disabled={!newMapName.trim()}
              className="rounded-xl px-5 py-2 text-sm font-bold transition-all disabled:opacity-30"
              style={{ background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa" }}>
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Search + Filters bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555]" />
          <input type="text" placeholder="Buscar mapa..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} />
        </div>
        <div className="flex items-center gap-1 rounded-xl p-0.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          {[
            { key: "all", label: "Todos", icon: <Filter className="h-3 w-3" /> },
            { key: "grid", label: "Grilla", icon: <Grid3X3 className="h-3 w-3" /> },
            { key: "image", label: "Imagen", icon: <Image className="h-3 w-3" /> },
            { key: "livemap", label: "Mapa", icon: <Globe className="h-3 w-3" /> },
          ].map(({ key, label, icon }) => (
            <button key={key} onClick={() => setFilterType(key)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all"
              style={{
                background: filterType === key ? "rgba(59,130,246,0.12)" : "transparent",
                color: filterType === key ? "#60a5fa" : "#666",
                border: filterType === key ? "1px solid rgba(59,130,246,0.25)" : "1px solid transparent",
              }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_120px_130px_80px_100px] gap-2 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#555]"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button className="flex items-center gap-1 text-left hover:text-[#ededed] transition-colors" onClick={() => toggleSort("name")}>
            Nombre <SortIcon col="name" />
          </button>
          <button className="flex items-center gap-1 hover:text-[#ededed] transition-colors" onClick={() => toggleSort("type")}>
            Tipo <SortIcon col="type" />
          </button>
          <span>Grupo</span>
          <button className="flex items-center gap-1 hover:text-[#ededed] transition-colors" onClick={() => toggleSort("updated")}>
            Actualizado <SortIcon col="updated" />
          </button>
          <span>Vista</span>
          <span className="text-right">Acciones</span>
        </div>

        {/* Table rows */}
        {filtered.map((map) => {
          const groupName = getGroupName(map.kuma_group_id);
          return (
            <div key={map.id}
              className="grid grid-cols-[1fr_100px_120px_130px_80px_100px] gap-2 items-center px-5 py-3 transition-all cursor-pointer group/row"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.04)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              onDoubleClick={() => onOpenMap(map.id)}
            >
              {/* Name */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}>
                  <MapIcon className="h-4 w-4 text-blue-400" />
                </div>
                {editingId === map.id ? (
                  <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => editValue.trim() ? renameMap(map.id, editValue.trim()) : setEditingId(null)}
                    onKeyDown={(e) => { if (e.key === "Enter" && editValue.trim()) renameMap(map.id, editValue.trim()); if (e.key === "Escape") setEditingId(null); }}
                    className="text-sm font-bold bg-transparent border-b border-blue-500 focus:outline-none text-[#ededed] w-full"
                    onClick={(e) => e.stopPropagation()} />
                ) : (
                  <span className="text-sm font-bold text-[#ededed] truncate">{map.name}</span>
                )}
              </div>

              {/* Type */}
              <div className="flex items-center gap-1.5">
                {bgTypeIcon(map.background_type)}
                <span className="text-[11px] text-[#999]">{bgTypeLabel(map.background_type)}</span>
              </div>

              {/* Group */}
              <div>
                {groupName ? (
                  <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8" }}>
                    <Tag className="h-2.5 w-2.5" /> {groupName}
                  </span>
                ) : (
                  <span className="text-[10px] text-[#444]">—</span>
                )}
              </div>

              {/* Updated */}
              <div className="flex items-center gap-1.5 text-[11px] text-[#777]">
                <Clock className="h-3 w-3 text-[#555]" />
                {new Date(map.updated_at).toLocaleDateString()} {new Date(map.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>

              {/* View URL */}
              <div className="flex items-center gap-1">
                <a href={`/maps/view/${map.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all hover:bg-blue-500/10"
                  style={{ color: "#60a5fa", border: "1px solid rgba(59,130,246,0.15)" }}
                  title="Abrir vista fullscreen">
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={(e) => {
                  e.stopPropagation();
                  const url = `${window.location.origin}/maps/view/${map.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success("URL copiada", { description: url });
                }} title="Copiar URL"
                  className="rounded-lg p-1 text-[#666] hover:text-[#ededed] hover:bg-white/5 transition-all">
                  <Copy className="h-3 w-3" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <button onClick={(e) => { e.stopPropagation(); onOpenMap(map.id); }} title="Abrir"
                  className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-500/10 transition-all opacity-0 group-hover/row:opacity-100">
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(map.id); setEditValue(map.name); }} title="Renombrar"
                  className="rounded-lg p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/5 transition-all opacity-0 group-hover/row:opacity-100">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); confirm(`Eliminar "${map.name}"?`) && deleteMap(map.id, map.name); }} title="Eliminar"
                  className="rounded-lg p-1.5 text-[#888] hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/row:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-[#555]">
            {maps.length === 0 ? (
              <>
                <Sparkles className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No hay mapas. Haz clic en "Nuevo Mapa" para comenzar.</p>
              </>
            ) : (
              <>
                <Search className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No se encontraron mapas con ese filtro.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-[#555]">
        <span>{filtered.length} de {maps.length} mapa{maps.length !== 1 ? "s" : ""}</span>
        <span>Doble clic para abrir</span>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────
export default function Page() {
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const { monitors, connected } = useKumaMonitors();

  return (
    <>
      <Toaster
        position="bottom-left"
        theme="dark"
        toastOptions={{
          style: {
            background: "rgba(20,20,20,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
            color: "#ededed",
          },
        }}
      />
      {selectedMapId ? (
        <NetworkMapEditor
          mapId={selectedMapId}
          kumaMonitors={monitors}
          kumaConnected={connected}
          onBack={() => setSelectedMapId(null)}
        />
      ) : (
        <MapListView
          onOpenMap={setSelectedMapId}
          kumaMonitors={monitors}
          kumaConnected={connected}
        />
      )}
    </>
  );
}
