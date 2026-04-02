"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Toaster, toast } from "sonner";
import {
  Plus,
  Network,
  Trash2,
  Pencil,
  Crosshair,
  Sparkles,
  MapIcon,
  Tag,
  Layers,
  Search,
  Globe,
  Image,
  ArrowUpDown,
  Clock,
  Filter,
  ExternalLink,
  Download,
  Upload,
  Copy,
} from "lucide-react";
import type { KumaMonitor } from "@/components/network-map/MonitorPanel";
import NetworkMapEditor from "@/components/network-map/NetworkMapEditor";
import LoginPage from "@/components/LoginPage";
import { apiUrl } from "@/lib/api";
import Tooltip from "@/components/network-map/Tooltip";

interface MapSummary {
  id: string;
  name: string;
  background_type: string;
  kuma_group_id: number | null;
  parent_id: string | null;
  updated_at: string;
  node_count: number;
  edge_count: number;
  monitor_ids: number[];
}

// ─── Hook: Real-time Kuma monitors via Socket.IO ──
function useKumaMonitors() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [connected, setConnected] = useState(false);
  const prevStatusRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    import("@/lib/socket").then(({ getSocket }) => {
      const socket = getSocket();

      const handleMonitors = (data: { connected: boolean; monitors: KumaMonitor[] }) => {
        setConnected(data.connected);
        const newMonitors = data.monitors || [];

        // Toast notifications on status change
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
      };

      socket.on("kuma:monitors", handleMonitors);
      socket.on("disconnect", () => setConnected(false));

      return () => {
        socket.off("kuma:monitors", handleMonitors);
      };
    });
  }, []);

  return { monitors, connected };
}

// ─── Map List Page ──────────────────────────────
function MapListView({
  onOpenMap,
  kumaMonitors,
  kumaConnected,
  onLogout,
}: {
  onOpenMap: (id: string) => void;
  kumaMonitors: KumaMonitor[];
  kumaConnected: boolean;
  onLogout: () => void;
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
  const [importPreview, setImportPreview] = useState<{ maps: any[]; isBulk: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [expandedMaps, setExpandedMaps] = useState<Set<string>>(new Set());
  const [creatingSubmapFor, setCreatingSubmapFor] = useState<string | null>(null);
  const [newSubmapName, setNewSubmapName] = useState("");
  // Drag-and-drop reparenting
  const [draggingMapId, setDraggingMapId] = useState<string | null>(null);
  const [dragOverMapId, setDragOverMapId] = useState<string | null>(null);

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

  const createSubmap = async (parentId: string, name: string) => {
    if (!name.trim()) return;
    const res = await fetch(apiUrl("/api/maps"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), parent_id: parentId, background_type: "livemap" }),
    });
    const map = await res.json();
    toast.success("Submap creado", { description: name.trim() });
    setCreatingSubmapFor(null);
    setNewSubmapName("");
    setExpandedMaps(prev => new Set([...prev, parentId]));
    fetchMaps();
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

  // ── Reparent map (drag-and-drop) ──
  const reparentMap = async (draggedId: string, newParentId: string | null) => {
    if (draggedId === newParentId) return;
    await fetch(apiUrl(`/api/maps/${draggedId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: newParentId }),
    });
    fetchMaps();
    if (newParentId) {
      setExpandedMaps(prev => new Set([...prev, newParentId]));
      const draggedName = maps.find(m => m.id === draggedId)?.name || "";
      const parentName = maps.find(m => m.id === newParentId)?.name || "";
      toast.success("Mapa reubicado", { description: `"${draggedName}" ahora es submap de "${parentName}"` });
    } else {
      const draggedName = maps.find(m => m.id === draggedId)?.name || "";
      toast.success("Mapa movido a raíz", { description: draggedName });
    }
  };

  // ── Clone map ──
  const cloneMap = async (map: MapSummary) => {
    try {
      const res = await fetch(apiUrl(`/api/maps/${map.id}/export`));
      const data = await res.json();
      const cloneRes = await fetch(apiUrl("/api/maps/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, map: { ...data.map, name: `${data.map?.name || map.name} (copia)` } }),
      });
      if (cloneRes.ok) {
        toast.success("Mapa clonado", { description: `${map.name} (copia)` });
        fetchMaps();
      } else {
        toast.error("Error al clonar mapa");
      }
    } catch {
      toast.error("Error al clonar mapa");
    }
  };

  // ── Export all maps ──
  const exportAllMaps = async () => {
    setExportingAll(true);
    try {
      const allData = await Promise.all(
        maps.map(async (m) => {
          const res = await fetch(apiUrl(`/api/maps/${m.id}/export`));
          return await res.json();
        })
      );
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kumamap-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportación completa", { description: `${maps.length} mapas exportados` });
    } catch {
      toast.error("Error al exportar todos los mapas");
    } finally {
      setExportingAll(false);
    }
  };

  // ── Import with preview ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const isBulk = Array.isArray(data);
      const mapsToImport = isBulk ? data : [data];
      setImportPreview({ maps: mapsToImport, isBulk });
    } catch {
      toast.error("Archivo inválido — asegurate de seleccionar un JSON exportado de KumaMap");
    }
    e.target.value = "";
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    let ok = 0, failed = 0;
    for (const mapData of importPreview.maps) {
      try {
        const res = await fetch(apiUrl("/api/maps/import"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mapData),
        });
        if (res.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setImporting(false);
    setImportPreview(null);
    fetchMaps();
    if (failed === 0) toast.success("Importación completa", { description: `${ok} mapa${ok !== 1 ? "s" : ""} importado${ok !== 1 ? "s" : ""}` });
    else toast.warning(`${ok} importados, ${failed} fallaron`);
  };

  const getGroupName = (groupId: number | null) => {
    if (!groupId) return null;
    return kumaGroups.find((g) => g.id === groupId)?.name || `Grupo #${groupId}`;
  };

  const bgTypeIcon = (t: string) => {
    if (t === "livemap") return <Globe className="h-3.5 w-3.5 text-emerald-400" />;
    if (t === "image") return <Image className="h-3.5 w-3.5 text-purple-400" />;
    return <Globe className="h-3.5 w-3.5 text-[#888]" />;
  };

  const bgTypeLabel = (t: string) => t === "livemap" ? "Mapa real" : t === "image" ? "Imagen" : "Mapa";

  // Compute live UP/DOWN per map using kumaMonitors
  const getMapStatus = (map: MapSummary) => {
    const monitorIds: number[] = map.monitor_ids || [];
    let up = 0, down = 0, pending = 0;
    for (const id of monitorIds) {
      const m = kumaMonitors.find((km) => km.id === id);
      if (!m) continue;
      if (m.status === 1) up++;
      else if (m.status === 0) down++;
      else pending++;
    }
    return { up, down, pending, total: monitorIds.length };
  };

  // Submapas por parent
  const submapsOf = useMemo(() => {
    const m: Record<string, MapSummary[]> = {};
    maps.filter(x => x.parent_id).forEach(x => {
      if (!m[x.parent_id!]) m[x.parent_id!] = [];
      m[x.parent_id!].push(x);
    });
    return m;
  }, [maps]);

  // Filter & sort — solo mapas raíz; cuando hay búsqueda también filtra por submapas
  const filtered = useMemo(() => {
    let result = maps.filter((m) => !m.parent_id); // Solo raíz
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) => {
        const nameMatch = m.name.toLowerCase().includes(q) || getGroupName(m.kuma_group_id)?.toLowerCase().includes(q);
        const childMatch = (submapsOf[m.id] || []).some(c => c.name.toLowerCase().includes(q));
        return nameMatch || childMatch;
      });
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
  }, [maps, search, filterType, sortBy, sortDir, submapsOf]);

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
        <div className="flex items-center gap-2">
          {/* Export All */}
          <Tooltip content="Exportar todos los mapas como un solo archivo">
          <button
            onClick={exportAllMaps}
            disabled={exportingAll || maps.length === 0}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#818cf8" }}
          >
            <Layers className="h-4 w-4" />
            {exportingAll ? "Exportando..." : "Exportar Todo"}
          </button>
          </Tooltip>
          {/* Import */}
          <label
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer"
            style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}
          >
            <Upload className="h-4 w-4" /> Importar
            <input type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
          </label>
          {/* Create */}
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
          >
            <Plus className="h-4 w-4" /> Nuevo Mapa
          </button>
          <Tooltip content="Cerrar sesión">
          <button
            onClick={() => {
              localStorage.removeItem("kumamap_user");
              fetch(apiUrl("/api/auth"), { method: "DELETE" });
              onLogout();
            }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#666" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
          </button>
          </Tooltip>
        </div>
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
        <div className="grid grid-cols-[1fr_90px_90px_100px_120px_130px_70px_165px] gap-2 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#555]"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button className="flex items-center gap-1 text-left hover:text-[#ededed] transition-colors" onClick={() => toggleSort("name")}>
            Nombre <SortIcon col="name" />
          </button>
          <button className="flex items-center gap-1 hover:text-[#ededed] transition-colors" onClick={() => toggleSort("type")}>
            Tipo <SortIcon col="type" />
          </button>
          <span>Nodos</span>
          <span className="text-emerald-500">Estado</span>
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
          const { up, down, pending, total } = getMapStatus(map);
          const allChildren = submapsOf[map.id] || [];
          // When searching, filter children to matching names and auto-expand
          const children = search
            ? allChildren.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
            : allChildren;
          const isExpanded = search ? children.length > 0 : expandedMaps.has(map.id);
          return (
            <div key={map.id}>
            <div
              draggable
              className="grid grid-cols-[1fr_90px_90px_100px_120px_130px_70px_165px] gap-2 items-center px-5 py-3 transition-all cursor-pointer group/row"
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                background: dragOverMapId === map.id && draggingMapId !== map.id ? "rgba(99,102,241,0.12)" : "transparent",
                outline: dragOverMapId === map.id && draggingMapId !== map.id ? "1px solid rgba(99,102,241,0.4)" : "none",
                opacity: draggingMapId === map.id ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (dragOverMapId !== map.id) (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.04)"; }}
              onMouseLeave={(e) => { if (dragOverMapId !== map.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              onDragStart={(e) => {
                setDraggingMapId(map.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", map.id);
              }}
              onDragEnd={() => { setDraggingMapId(null); setDragOverMapId(null); }}
              onDragOver={(e) => {
                if (draggingMapId && draggingMapId !== map.id) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverMapId(map.id);
                }
              }}
              onDragLeave={() => { setDragOverMapId(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/plain");
                if (draggedId && draggedId !== map.id) {
                  reparentMap(draggedId, map.id);
                }
                setDraggingMapId(null);
                setDragOverMapId(null);
              }}
              onClick={() => onOpenMap(map.id)}
            >
              {/* Name */}
              <div className="flex items-center gap-2 min-w-0">
                {/* Expand/collapse submaps */}
                <Tooltip content={isExpanded ? "Colapsar submaps" : `${children.length} submap(s)`}>
                <button onClick={(e) => {
                  e.stopPropagation();
                  setExpandedMaps(prev => {
                    const next = new Set(prev);
                    if (next.has(map.id)) next.delete(map.id); else next.add(map.id);
                    return next;
                  });
                }}
                  className="shrink-0 rounded-lg p-0.5 transition-all"
                  style={{ color: children.length > 0 ? "#6366f1" : "transparent", cursor: children.length > 0 ? "pointer" : "default" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </button>
                </Tooltip>
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

              {/* Nodes count */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-bold text-[#bbb]">{map.node_count}</span>
                <span className="text-[#555]">/</span>
                <span className="text-[10px] text-[#666]">{map.edge_count}L</span>
              </div>

              {/* Status UP/DOWN */}
              <div className="flex items-center gap-1.5">
                {total === 0 ? (
                  <span className="text-[10px] text-[#444]">—</span>
                ) : (
                  <>
                    {up > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {up}
                      </span>
                    )}
                    {down > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        {down}
                      </span>
                    )}
                    {pending > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {pending}
                      </span>
                    )}
                  </>
                )}
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
                <Tooltip content="Abrir vista fullscreen">
                <a href={apiUrl(`/view/${map.id}`)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all hover:bg-blue-500/10"
                  style={{ color: "#60a5fa", border: "1px solid rgba(59,130,246,0.15)" }}>
                  <ExternalLink className="h-3 w-3" />
                </a>
                </Tooltip>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <Tooltip content="Nuevo submap">
                <button onClick={(e) => { e.stopPropagation(); setCreatingSubmapFor(creatingSubmapFor === map.id ? null : map.id); setNewSubmapName(""); }}
                  className="rounded-lg p-1.5 transition-all opacity-0 group-hover/row:opacity-100"
                  style={{ color: creatingSubmapFor === map.id ? "#818cf8" : "#6366f1" }}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
                </Tooltip>
                <Tooltip content="Copiar ubicación y coordenadas">
                <button onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const res = await fetch(apiUrl(`/api/maps/${map.id}/export`));
                    const data = await res.json();
                    const vs = data.map?.view_state ? JSON.parse(data.map.view_state) : null;
                    const lines: string[] = [`📍 ${data.map?.name || map.name}`];
                    if (vs?.center) lines.push(`Centro: ${vs.center[0].toFixed(5)}, ${vs.center[1].toFixed(5)}  zoom: ${vs.zoom ?? "?"}`);
                    if (data.nodes?.length) {
                      lines.push(`\nNodos (${data.nodes.length}):`);
                      data.nodes
                        .filter((n: any) => n.icon !== "_textLabel" && n.icon !== "_waypoint" && n.icon !== "_polygon")
                        .forEach((n: any) => {
                          lines.push(`  ${n.label || n.id}: ${Number(n.x).toFixed(5)}, ${Number(n.y).toFixed(5)}`);
                        });
                    }
                    const text = lines.join("\n");
                    // Fallback for HTTP (non-secure) contexts where clipboard API is unavailable
                    if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(text);
                    } else {
                      const el = document.createElement("textarea");
                      el.value = text;
                      el.style.cssText = "position:fixed;top:0;left:0;opacity:0";
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand("copy");
                      document.body.removeChild(el);
                    }
                    toast.success("Ubicación copiada", { description: `${data.nodes?.length ?? 0} nodos` });
                  } catch {
                    toast.error("No se pudo copiar la ubicación");
                  }
                }}
                  className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition-all opacity-0 group-hover/row:opacity-100">
                  <Crosshair className="h-3.5 w-3.5" />
                </button>
                </Tooltip>
                <Tooltip content="Renombrar">
                <button onClick={(e) => { e.stopPropagation(); setEditingId(map.id); setEditValue(map.name); }}
                  className="rounded-lg p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/5 transition-all opacity-0 group-hover/row:opacity-100">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                </Tooltip>
                <Tooltip content="Exportar JSON">
                <button onClick={(e) => { e.stopPropagation(); window.open(apiUrl(`/api/maps/${map.id}/export`), "_blank"); }}
                  className="rounded-lg p-1.5 text-[#888] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all opacity-0 group-hover/row:opacity-100">
                  <Download className="h-3.5 w-3.5" />
                </button>
                </Tooltip>
                <Tooltip content="Clonar mapa">
                <button onClick={(e) => { e.stopPropagation(); cloneMap(map); }}
                  className="rounded-lg p-1.5 text-[#888] hover:text-amber-400 hover:bg-amber-500/10 transition-all opacity-0 group-hover/row:opacity-100">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                </Tooltip>
                <Tooltip content="Eliminar">
                <button onClick={(e) => { e.stopPropagation(); confirm(`Eliminar "${map.name}"?`) && deleteMap(map.id, map.name); }}
                  className="rounded-lg p-1.5 text-[#888] hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/row:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                </Tooltip>
              </div>
            </div>

            {/* ─── Child submaps (expandidas) ─── */}
            {isExpanded && children.map((child) => {
              const childStatus = getMapStatus(child);
              return (
                <div key={child.id}
                  draggable
                  className="grid grid-cols-[1fr_90px_90px_100px_120px_130px_70px_165px] gap-2 items-center py-2 cursor-pointer group/child"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.02)",
                    paddingLeft: "72px", paddingRight: "20px",
                    background: "rgba(99,102,241,0.025)",
                    opacity: draggingMapId === child.id ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.025)"; }}
                  onDragStart={(e) => {
                    setDraggingMapId(child.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", child.id);
                    e.stopPropagation();
                  }}
                  onDragEnd={() => { setDraggingMapId(null); setDragOverMapId(null); }}
                  onClick={() => onOpenMap(child.id)}
                >
                  {/* Submap name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    {editingId === child.id ? (
                      <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => editValue.trim() ? renameMap(child.id, editValue.trim()) : setEditingId(null)}
                        onKeyDown={(e) => { if (e.key === "Enter" && editValue.trim()) renameMap(child.id, editValue.trim()); if (e.key === "Escape") setEditingId(null); }}
                        className="text-xs font-semibold bg-transparent border-b border-indigo-500 focus:outline-none text-[#a5b4fc] w-full"
                        onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <span className="text-xs font-semibold text-[#a5b4fc] truncate">{child.name}</span>
                    )}
                  </div>
                  {/* Type */}
                  <div className="flex items-center gap-1.5">
                    {bgTypeIcon(child.background_type)}
                    <span className="text-[10px] text-[#888]">{bgTypeLabel(child.background_type)}</span>
                  </div>
                  {/* Nodes */}
                  <div className="text-[10px] text-[#777]">{child.node_count} <span className="text-[#555]">/ {child.edge_count}L</span></div>
                  {/* Status */}
                  <div className="flex items-center gap-1">
                    {childStatus.total === 0 ? <span className="text-[10px] text-[#444]">—</span> : (
                      <>
                        {childStatus.up > 0 && <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{childStatus.up}</span>}
                        {childStatus.down > 0 && <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />{childStatus.down}</span>}
                        {childStatus.pending > 0 && <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{childStatus.pending}</span>}
                      </>
                    )}
                  </div>
                  {/* Group (empty for submaps) */}
                  <div />
                  {/* Updated */}
                  <div className="text-[10px] text-[#666]">{new Date(child.updated_at).toLocaleDateString()}</div>
                  {/* View */}
                  <div className="flex items-center gap-1">
                    <a href={apiUrl(`/view/${child.id}`)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all hover:bg-indigo-500/10"
                      style={{ color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip content="Renombrar">
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(child.id); setEditValue(child.name); }}
                      className="rounded-lg p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/5 transition-all opacity-0 group-hover/child:opacity-100">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    </Tooltip>
                    <Tooltip content="Eliminar submap">
                    <button onClick={(e) => { e.stopPropagation(); confirm(`Eliminar "${child.name}"?`) && deleteMap(child.id, child.name); }}
                      className="rounded-lg p-1.5 text-[#888] hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/child:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}

            {/* ─── Inline create submap form ─── */}
            {creatingSubmapFor === map.id && (
              <div className="flex items-center gap-2 py-2"
                style={{ paddingLeft: "72px", paddingRight: "20px", background: "rgba(99,102,241,0.04)", borderBottom: "1px solid rgba(99,102,241,0.1)" }}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <Plus className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <input autoFocus
                  value={newSubmapName}
                  onChange={(e) => setNewSubmapName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createSubmap(map.id, newSubmapName);
                    if (e.key === "Escape") { setCreatingSubmapFor(null); setNewSubmapName(""); }
                  }}
                  placeholder="Nombre del submap..."
                  className="flex-1 rounded-lg px-3 py-1.5 text-xs text-[#ededed] placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.2)" }}
                />
                <button onClick={() => createSubmap(map.id, newSubmapName)} disabled={!newSubmapName.trim()}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-30"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8" }}>
                  Crear
                </button>
                <button onClick={() => { setCreatingSubmapFor(null); setNewSubmapName(""); }}
                  className="rounded-lg px-2 py-1.5 text-xs text-[#555] hover:text-[#888] transition-all">
                  Cancelar
                </button>
              </div>
            )}
            </div>
          );
        })}

        {/* Drop zone: move to root level (only visible when dragging a child map) */}
        {draggingMapId && maps.find(m => m.id === draggingMapId)?.parent_id && (
          <div
            className="flex items-center justify-center gap-2 py-3 transition-all"
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: dragOverMapId === "__root__" ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.01)",
              outline: dragOverMapId === "__root__" ? "1px dashed rgba(59,130,246,0.4)" : "1px dashed rgba(255,255,255,0.08)",
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverMapId("__root__"); }}
            onDragLeave={() => setDragOverMapId(null)}
            onDrop={(e) => {
              e.preventDefault();
              const draggedId = e.dataTransfer.getData("text/plain");
              if (draggedId) reparentMap(draggedId, null);
              setDraggingMapId(null);
              setDragOverMapId(null);
            }}
          >
            <span className="text-[10px] text-[#555]" style={{ color: dragOverMapId === "__root__" ? "#60a5fa" : "#555" }}>
              Soltar aquí para mover a raíz
            </span>
          </div>
        )}

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
        <span>Click para abrir · Hover para acciones · Arrastrar para reubicar</span>
      </div>

      {/* ═══ Import Preview Modal ═══ */}
      {importPreview && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl" style={{ background: "rgba(14,14,14,0.99)", border: "1px solid rgba(255,255,255,0.1)" }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
                <Upload className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#ededed]">
                  {importPreview.isBulk ? `Importación masiva — ${importPreview.maps.length} mapas` : "Importar mapa"}
                </h3>
                <p className="text-[10px] text-[#666] mt-0.5">
                  {importPreview.isBulk ? "Se importarán los siguientes mapas:" : "Se importará el siguiente mapa:"}
                </p>
              </div>
              <button onClick={() => setImportPreview(null)} className="ml-auto text-[#555] hover:text-[#ededed] text-lg">&times;</button>
            </div>

            {/* Preview list */}
            <div className="px-5 py-3 max-h-[50vh] overflow-y-auto space-y-1.5">
              {importPreview.maps.map((m, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <MapIcon className="h-4 w-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#ededed] truncate">{m.name || `Mapa #${i + 1}`}</div>
                    <div className="text-[10px] text-[#666]">
                      {m.nodes?.length ?? 0} nodos · {m.edges?.length ?? 0} links
                      {m.background_type && ` · ${m.background_type}`}
                    </div>
                  </div>
                  <span className="text-[9px] font-bold text-emerald-400 shrink-0">NUEVO</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button onClick={() => setImportPreview(null)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}>
                Cancelar
              </button>
              <button onClick={confirmImport} disabled={importing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", color: "#4ade80" }}>
                <Upload className="h-4 w-4" />
                {importing ? "Importando..." : `Importar ${importPreview.maps.length} mapa${importPreview.maps.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────
export default function Page() {
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { monitors, connected } = useKumaMonitors();

  // Check session on mount
  useEffect(() => {
    const user = localStorage.getItem("kumamap_user");
    setIsAuthenticated(!!user);
  }, []);

  // Loading
  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>;
  }

  // Login
  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

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
          onLogout={() => setIsAuthenticated(false)}
        />
      )}
    </>
  );
}
