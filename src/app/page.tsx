"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Toaster, toast } from "sonner";
import {
  Plus,
  Network,
  Trash2,
  Pencil,
  FolderOpen,
  Sparkles,
  MapIcon,
} from "lucide-react";
import type { KumaMonitor } from "@/components/network-map/MonitorPanel";
import NetworkMapEditor from "@/components/network-map/NetworkMapEditor";

interface MapSummary {
  id: string;
  name: string;
  background_type: string;
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
        const res = await fetch("/api/kuma");
        if (!res.ok || !mounted) return;
        const data = await res.json();

        const newMonitors: KumaMonitor[] = data.monitors || [];
        setConnected(data.connected || false);

        // Detect status changes
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
}: {
  onOpenMap: (id: string) => void;
}) {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [newMapName, setNewMapName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchMaps = useCallback(async () => {
    const res = await fetch("/api/maps");
    setMaps(await res.json());
  }, []);

  useEffect(() => { fetchMaps(); }, [fetchMaps]);

  const createMap = async (name: string) => {
    const res = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const map = await res.json();
    toast.success("Mapa creado", { description: name });
    onOpenMap(map.id);
  };

  const deleteMap = async (id: string, name: string) => {
    await fetch(`/api/maps/${id}`, { method: "DELETE" });
    toast.success("Mapa eliminado", { description: name });
    fetchMaps();
  };

  const renameMap = async (id: string, name: string) => {
    await fetch(`/api/maps/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setEditingId(null);
    fetchMaps();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-3">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-400"
            style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}
          >
            <Network className="h-3.5 w-3.5" /> KumaMap
          </div>
          <h1 className="text-4xl font-black text-[#ededed] tracking-tight">
            Mapas de Red Interactivos
          </h1>
          <p className="text-sm text-[#737373] max-w-md mx-auto">
            Crea mapas de conexiones con monitores de Uptime Kuma en tiempo real.
            Arrastra, conecta y visualiza tu infraestructura.
          </p>
        </div>

        <div className="flex gap-2 max-w-md mx-auto">
          <input
            type="text"
            placeholder="Nombre del nuevo mapa..."
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newMapName.trim() && createMap(newMapName.trim())}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm text-[#ededed] placeholder:text-[#737373] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <button
            onClick={() => newMapName.trim() && createMap(newMapName.trim())}
            disabled={!newMapName.trim()}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-30"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
          >
            <Plus className="h-4 w-4" /> Crear
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((map) => (
            <div
              key={map.id}
              className="group relative rounded-2xl p-5 transition-all hover:scale-[1.02]"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-start justify-between mb-3">
                {editingId === map.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => editValue.trim() ? renameMap(map.id, editValue.trim()) : setEditingId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editValue.trim()) renameMap(map.id, editValue.trim());
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="text-lg font-bold bg-transparent border-b border-blue-500 focus:outline-none text-[#ededed] w-full"
                  />
                ) : (
                  <h3 className="text-lg font-bold text-[#ededed] truncate">{map.name}</h3>
                )}
                <MapIcon className="h-5 w-5 text-[#404040] shrink-0 ml-2" />
              </div>
              <p className="text-[11px] text-[#737373] mb-4">
                {map.background_type === "image" ? "Imagen" : "Grilla"} &middot;{" "}
                {new Date(map.updated_at).toLocaleDateString()}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onOpenMap(map.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                  style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Abrir
                </button>
                <button
                  onClick={() => { setEditingId(map.id); setEditValue(map.name); }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-[#737373] hover:text-[#ededed] transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => confirm(`Eliminar "${map.name}"?`) && deleteMap(map.id, map.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-[#737373] hover:text-red-400 transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {maps.length === 0 && (
            <div className="col-span-full flex flex-col items-center py-16 text-[#737373]">
              <Sparkles className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No hay mapas. Crea tu primer mapa de red.</p>
            </div>
          )}
        </div>
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
        <MapListView onOpenMap={setSelectedMapId} />
      )}
    </>
  );
}
