"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import PageTransition from "@/components/mobile/PageTransition";
import { useToast } from "@/components/mobile/MobileToast";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import type { HikEvent } from "@/lib/types";

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
}

interface AccessLogEntry {
  id: string;
  timestamp: string;
  plate: string;
  matchResult: string;
  ownerName?: string;
  nodeId: string;
  nodeLabel?: string;
  direction?: string;
  vehicleColor?: string;
  vehicleBrand?: string;
  fullImageId?: string;
  plateImageId?: string;
}

type MatchResult = "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";
type ViewMode = "live" | "log" | "registry";

// ── Match styling ──

const matchStyles: Record<MatchResult, { color: string; bg: string; label: string; emoji: string }> = {
  authorized: { color: "#4ade80", bg: "rgba(74,222,128,0.1)", label: "Autorizado", emoji: "✓" },
  visitor: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", label: "Visitante", emoji: "⏱" },
  visitor_expired: { color: "#fb923c", bg: "rgba(251,146,60,0.1)", label: "Vencido", emoji: "!" },
  blocked: { color: "#f87171", bg: "rgba(248,113,113,0.1)", label: "Bloqueado", emoji: "✕" },
  unknown: { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", label: "Desconocido", emoji: "?" },
};

// ── Page ──

export default function AccesosPage() {
  const [maps, setMaps] = useState<{ id: string; name: string }[]>([]);
  const [selectedMap, setSelectedMap] = useState("");
  const [view, setView] = useState<ViewMode>("live");
  const [loading, setLoading] = useState(true);
  const { show } = useToast();

  useEffect(() => {
    fetch(apiUrl("/api/maps"))
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setMaps(list);
        if (list.length > 0) setSelectedMap(list[0].id);
      })
      .catch(() => show("Error cargando mapas", "error"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Cargando...</div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="px-4 pt-3 pb-2 safe-top">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(59,130,246,0.15))",
              border: "1px solid rgba(6,182,212,0.25)",
              boxShadow: "0 4px 16px rgba(6,182,212,0.15)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="m16 8 5 3-5 3z" />
              <path d="M3 20h4M8 20h3" strokeWidth="2.5" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>
              Accesos LPR
            </h1>
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              Control de matrículas
            </p>
          </div>

          {/* Map selector */}
          {maps.length > 1 && (
            <select
              value={selectedMap}
              onChange={(e) => { setSelectedMap(e.target.value); hapticTap(); }}
              className="text-xs rounded-xl px-2 py-1.5"
              style={{
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* View tabs */}
        <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--card-bg)" }}>
          {([
            { id: "live" as ViewMode, label: "En Vivo" },
            { id: "log" as ViewMode, label: "Historial" },
            { id: "registry" as ViewMode, label: "Registro" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => { setView(t.id); hapticTap(); }}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: view === t.id ? "rgba(6,182,212,0.15)" : "transparent",
                color: view === t.id ? "#06b6d4" : "var(--text-tertiary)",
                border: view === t.id ? "1px solid rgba(6,182,212,0.2)" : "1px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {selectedMap && view === "live" && <LiveFeed mapId={selectedMap} />}
        {selectedMap && view === "log" && <HistoryLog mapId={selectedMap} />}
        {selectedMap && view === "registry" && <RegistryView mapId={selectedMap} />}
      </div>
    </PageTransition>
  );
}

// ═════════════════════════════════════════════════════
// ── Live Feed (SSE events) ──
// ═════════════════════════════════════════════════════

function LiveFeed({ mapId }: { mapId: string }) {
  const [events, setEvents] = useState<HikEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [addPlate, setAddPlate] = useState<string | null>(null);
  const [historyPlate, setHistoryPlate] = useState<string | null>(null);
  const { show } = useToast();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = apiUrl(`/api/hik/events/stream?mapId=${encodeURIComponent(mapId)}`);
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as HikEvent;
        if (ev.eventType === "anpr") {
          setEvents((prev) => [ev, ...prev].slice(0, 100));
          if (ev.matchResult === "blocked") {
            hapticTap();
            show(`Vehículo BLOQUEADO: ${ev.licensePlate}`, "error");
          } else if (ev.matchResult === "unknown") {
            show(`Matrícula desconocida: ${ev.licensePlate}`, "warning");
          }
        }
      } catch {}
    };

    return () => { es.close(); };
  }, [mapId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PullToRefresh onRefresh={async () => { hapticSuccess(); }}>
      {/* Connection status */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="h-2 w-2 rounded-full"
          style={{
            background: connected ? "#22c55e" : "#ef4444",
            boxShadow: connected ? "0 0 8px rgba(34,197,94,0.6)" : "0 0 8px rgba(239,68,68,0.6)",
          }}
        />
        <span className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>
          {connected ? "Conectado · esperando detecciones" : "Conectando..."}
        </span>
        {events.length > 0 && (
          <span className="text-[10px] ml-auto" style={{ color: "var(--text-tertiary)" }}>
            {events.length} detecciones
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="h-16 w-16 rounded-3xl flex items-center justify-center"
            style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.12)" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="m16 8 5 3-5 3z" />
            </svg>
          </div>
          <p className="text-xs text-center" style={{ color: "var(--text-tertiary)" }}>
            Esperando detecciones de matrículas...
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              onRegister={() => setAddPlate(ev.licensePlate!)}
              onHistory={() => setHistoryPlate(ev.licensePlate!)}
            />
          ))}
        </div>
      )}

      {addPlate && (
        <AddPlateSheet
          plate={addPlate}
          mapId={mapId}
          onClose={() => setAddPlate(null)}
          onSaved={() => { setAddPlate(null); show("Matrícula registrada", "success"); hapticSuccess(); }}
        />
      )}

      {historyPlate && (
        <PlateHistorySheet
          plate={historyPlate}
          mapId={mapId}
          onClose={() => setHistoryPlate(null)}
        />
      )}
    </PullToRefresh>
  );
}

// ── Event Card ──

function EventCard({
  event,
  onRegister,
  onHistory,
}: {
  event: HikEvent;
  onRegister: () => void;
  onHistory: () => void;
}) {
  const match = (event.matchResult as MatchResult) || "unknown";
  const ms = matchStyles[match];
  const imageId = event.plateImageId || event.fullImageId;
  const time = new Date(event.timestamp).toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--card-bg)",
        border: `1px solid ${ms.color}20`,
      }}
    >
      <div className="flex">
        {/* Image */}
        <div className="shrink-0 relative" style={{ width: 80, height: 72, background: "rgba(0,0,0,0.2)" }}>
          {imageId ? (
            <img
              src={apiUrl(`/api/hik/images/${imageId}`)}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5">
                <rect x="1" y="3" width="15" height="13" rx="2" /><path d="m16 8 5 3-5 3z" />
              </svg>
            </div>
          )}
          {/* Status badge */}
          <div
            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
            style={{ background: ms.bg, border: `1px solid ${ms.color}30`, backdropFilter: "blur(8px)" }}
          >
            <span className="text-[8px] font-black" style={{ color: ms.color }}>{ms.emoji}</span>
            <span className="text-[8px] font-bold" style={{ color: ms.color }}>{ms.label}</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 p-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-lg font-black tracking-[0.15em] font-mono"
              style={{ color: ms.color }}
            >
              {event.licensePlate}
            </span>
          </div>

          {event.matchOwner && (
            <div className="text-[11px] font-semibold truncate" style={{ color: "var(--text-secondary)" }}>
              {event.matchOwner}
            </div>
          )}

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{time}</span>
            {event.direction && (
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {event.direction === "forward" ? "→ Entrada" : event.direction === "reverse" ? "← Salida" : ""}
              </span>
            )}
          </div>

          {(event.vehicleBrand || event.vehicleColor) && (
            <div className="text-[9px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {[event.vehicleColor, event.vehicleBrand].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          onClick={() => { onRegister(); hapticTap(); }}
          className="flex-1 py-2 flex items-center justify-center gap-1 text-[10px] font-bold"
          style={{ color: "#4ade80" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          Registrar
        </button>
        <div style={{ width: 1, background: "var(--border-subtle)" }} />
        <button
          onClick={() => { onHistory(); hapticTap(); }}
          className="flex-1 py-2 flex items-center justify-center gap-1 text-[10px] font-bold"
          style={{ color: "#a78bfa" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Historial
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════
// ── History Log ──
// ═════════════════════════════════════════════════════

function HistoryLog({ mapId }: { mapId: string }) {
  const [entries, setEntries] = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const { show } = useToast();

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mapId, limit: "100" });
      if (filter !== "all") params.set("matchResult", filter);
      const res = await fetch(apiUrl(`/api/plates/log?${params}`));
      const data = await res.json();
      setEntries(data.log || []);
    } catch {
      show("Error cargando historial", "error");
    } finally {
      setLoading(false);
    }
  }, [mapId, filter, show]);

  useEffect(() => { loadLog(); }, [loadLog]);

  return (
    <PullToRefresh onRefresh={async () => { await loadLog(); hapticSuccess(); show("Actualizado", "success"); }}>
      {/* Filter */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {([
          { id: "all", label: "Todos", color: "#06b6d4" },
          { id: "authorized", label: "Autorizados", color: "#4ade80" },
          { id: "blocked", label: "Bloqueados", color: "#f87171" },
          { id: "unknown", label: "Desconocidos", color: "#fbbf24" },
        ]).map((f) => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); hapticTap(); }}
            className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all"
            style={{
              background: filter === f.id ? `${f.color}20` : "var(--card-bg)",
              color: filter === f.id ? f.color : "var(--text-tertiary)",
              border: `1px solid ${filter === f.id ? `${f.color}30` : "var(--border-subtle)"}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--card-bg)" }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Sin registros
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => {
            const result = (e.matchResult as MatchResult) || "unknown";
            const ms = matchStyles[result];
            const time = new Date(e.timestamp);
            const imageId = e.plateImageId || e.fullImageId;
            return (
              <div
                key={e.id}
                className="flex items-center gap-2.5 rounded-2xl p-2.5"
                style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}
              >
                {/* Mini image */}
                <div className="shrink-0 w-12 h-9 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.2)" }}>
                  {imageId ? (
                    <img src={apiUrl(`/api/hik/images/${imageId}`)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm tracking-wider" style={{ color: ms.color }}>
                      {e.plate}
                    </span>
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: ms.bg, color: ms.color }}
                    >
                      {ms.label}
                    </span>
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                    {time.toLocaleDateString("es-UY")} {time.toLocaleTimeString("es-UY")} · {e.nodeLabel || e.nodeId}
                  </div>
                </div>

                {/* Direction */}
                {e.direction && (
                  <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
                    {e.direction === "forward" ? "→" : e.direction === "reverse" ? "←" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PullToRefresh>
  );
}

// ═════════════════════════════════════════════════════
// ── Registry View ──
// ═════════════════════════════════════════════════════

function RegistryView({ mapId }: { mapId: string }) {
  const [plates, setPlates] = useState<PlateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addPlate, setAddPlate] = useState<string | null>(null);
  const [editPlate, setEditPlate] = useState<PlateRecord | null>(null);
  const { show } = useToast();

  const loadPlates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/plates?mapId=${mapId}`));
      const data = await res.json();
      setPlates(data.plates || []);
    } catch {
      show("Error cargando registro", "error");
    } finally {
      setLoading(false);
    }
  }, [mapId, show]);

  useEffect(() => { loadPlates(); }, [loadPlates]);

  const filtered = search
    ? plates.filter((p) => p.plate.includes(search.toUpperCase()) || p.ownerName.toLowerCase().includes(search.toLowerCase()))
    : plates;

  const handleDelete = async (id: string, plate: string) => {
    if (!confirm(`¿Eliminar ${plate}?`)) return;
    try {
      await fetch(apiUrl(`/api/plates/${id}?mapId=${mapId}`), { method: "DELETE" });
      loadPlates();
      show("Eliminada", "success");
      hapticSuccess();
    } catch {
      show("Error eliminando", "error");
    }
  };

  return (
    <PullToRefresh onRefresh={async () => { await loadPlates(); hapticSuccess(); show("Actualizado", "success"); }}>
      {/* Search + Add */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)"
            strokeWidth="2" strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        <button
          onClick={() => { setAddPlate(""); hapticTap(); }}
          className="px-4 rounded-xl flex items-center gap-1 text-xs font-bold"
          style={{ background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.2)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Agregar
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 mb-3">
        <SummaryChip label="Autorizados" count={plates.filter((p) => p.category === "authorized").length} color="#4ade80" />
        <SummaryChip label="Visitantes" count={plates.filter((p) => p.category === "visitor").length} color="#a78bfa" />
        <SummaryChip label="Bloqueados" count={plates.filter((p) => p.category === "blocked").length} color="#f87171" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--card-bg)" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {search ? "Sin resultados" : "No hay matrículas registradas"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((p) => {
            const catColor = matchStyles[p.category as MatchResult]?.color || "#fbbf24";
            const catLabel = matchStyles[p.category as MatchResult]?.label || p.category;
            const isExpired = p.category === "visitor" && p.validUntil && new Date(p.validUntil) < new Date();
            return (
              <div
                key={p.id}
                className="rounded-2xl p-3"
                style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base tracking-wider" style={{ color: catColor }}>
                    {p.plate}
                  </span>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}25` }}
                  >
                    {catLabel}
                    {isExpired && " · vencido"}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => { setEditPlate(p); hapticTap(); }}
                    className="p-1.5 rounded-lg"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.plate)}
                    className="p-1.5 rounded-lg"
                    style={{ color: "#f8717180" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {p.ownerName}
                  {p.vehicleDesc && <span style={{ color: "var(--text-tertiary)" }}> · {p.vehicleDesc}</span>}
                </div>
                {p.category === "visitor" && p.validFrom && p.validUntil && (
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {new Date(p.validFrom).toLocaleDateString("es-UY")} – {new Date(p.validUntil).toLocaleDateString("es-UY")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addPlate !== null && (
        <AddPlateSheet
          plate={addPlate}
          mapId={mapId}
          onClose={() => setAddPlate(null)}
          onSaved={() => { setAddPlate(null); loadPlates(); show("Registrada", "success"); hapticSuccess(); }}
        />
      )}

      {editPlate && (
        <AddPlateSheet
          plate={editPlate.plate}
          mapId={mapId}
          existing={editPlate}
          onClose={() => setEditPlate(null)}
          onSaved={() => { setEditPlate(null); loadPlates(); show("Actualizada", "success"); hapticSuccess(); }}
        />
      )}
    </PullToRefresh>
  );
}

function SummaryChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      className="flex-1 rounded-xl py-2 flex flex-col items-center"
      style={{ background: `${color}08`, border: `1px solid ${color}12` }}
    >
      <span className="text-lg font-bold" style={{ color }}>{count}</span>
      <span className="text-[9px] font-medium" style={{ color: `${color}90` }}>{label}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════
// ── Add/Edit Plate Sheet ──
// ═════════════════════════════════════════════════════

function AddPlateSheet({
  plate,
  mapId,
  existing,
  onClose,
  onSaved,
}: {
  plate: string;
  mapId: string;
  existing?: PlateRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [plateNumber, setPlateNumber] = useState(existing?.plate || plate);
  const [category, setCategory] = useState<PlateRecord["category"]>(existing?.category || "authorized");
  const [ownerName, setOwnerName] = useState(existing?.ownerName || "");
  const [vehicleDesc, setVehicleDesc] = useState(existing?.vehicleDesc || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [validFrom, setValidFrom] = useState(existing?.validFrom?.split("T")[0] || "");
  const [validUntil, setValidUntil] = useState(existing?.validUntil?.split("T")[0] || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!plateNumber.trim() || !ownerName.trim()) {
      setError("Matrícula y propietario obligatorios");
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

    try {
      const url = isEdit ? apiUrl(`/api/plates/${existing!.id}`) : apiUrl("/api/plates");
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl p-5 pb-8"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border-subtle)",
          borderBottom: "none",
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--text-tertiary)" }} />
        </div>

        <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Editar Matrícula" : "Registrar Matrícula"}
        </h3>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Matrícula"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
            disabled={isEdit}
            className="w-full px-3 py-2.5 rounded-xl text-sm font-mono font-bold tracking-wider"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              opacity: isEdit ? 0.5 : 1,
            }}
          />

          {/* Category selector */}
          <div className="flex gap-2">
            {([
              { v: "authorized" as const, l: "Autorizado", c: "#4ade80" },
              { v: "visitor" as const, l: "Visitante", c: "#a78bfa" },
              { v: "blocked" as const, l: "Bloqueado", c: "#f87171" },
            ]).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setCategory(opt.v)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                style={{
                  background: category === opt.v ? `${opt.c}20` : "var(--card-bg)",
                  color: category === opt.v ? opt.c : "var(--text-tertiary)",
                  border: `1px solid ${category === opt.v ? `${opt.c}40` : "var(--border-subtle)"}`,
                }}
              >
                {opt.l}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Propietario"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          />

          <input
            type="text"
            placeholder="Vehículo (opcional)"
            value={vehicleDesc}
            onChange={(e) => setVehicleDesc(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          />

          {category === "visitor" && (
            <div className="flex gap-2">
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", colorScheme: "dark" }}
              />
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", colorScheme: "dark" }}
              />
            </div>
          )}

          <textarea
            placeholder="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
            style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: "var(--card-bg)", color: "var(--text-secondary)" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{
                background: saving ? "rgba(6,182,212,0.3)" : "#06b6d4",
                color: "#0a0a14",
              }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════
// ── Plate History Sheet ──
// ═════════════════════════════════════════════════════

function PlateHistorySheet({
  plate,
  mapId,
  onClose,
}: {
  plate: string;
  mapId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    registration: PlateRecord | null;
    status: string;
    summary: { totalAccesses: number; firstSeen: string | null; lastSeen: string | null; cameras: string[] };
    history: AccessLogEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl(`/api/plates/history?mapId=${mapId}&plate=${encodeURIComponent(plate)}&limit=50`))
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mapId, plate]);

  const ms = matchStyles[(data?.status as MatchResult) || "unknown"];

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border-subtle)",
          borderBottom: "none",
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--text-tertiary)" }} />
        </div>

        {loading ? (
          <div className="text-center py-8 text-xs" style={{ color: "var(--text-tertiary)" }}>Cargando...</div>
        ) : !data ? (
          <div className="text-center py-8 text-xs" style={{ color: "var(--text-tertiary)" }}>Error</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl font-black font-mono tracking-wider" style={{ color: ms.color }}>
                {plate}
              </span>
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-full"
                style={{ background: ms.bg, color: ms.color, border: `1px solid ${ms.color}30` }}
              >
                {ms.label}
              </span>
            </div>

            {/* Registration info */}
            {data.registration && (
              <div
                className="rounded-2xl p-3 mb-3"
                style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>
                  {data.registration.ownerName}
                </div>
                {data.registration.vehicleDesc && (
                  <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{data.registration.vehicleDesc}</div>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--card-bg)" }}>
                <div className="text-lg font-bold" style={{ color: "#06b6d4" }}>{data.summary.totalAccesses}</div>
                <div className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>Accesos</div>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--card-bg)" }}>
                <div className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
                  {data.summary.firstSeen ? new Date(data.summary.firstSeen).toLocaleDateString("es-UY") : "—"}
                </div>
                <div className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>Primer acceso</div>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--card-bg)" }}>
                <div className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
                  {data.summary.lastSeen ? new Date(data.summary.lastSeen).toLocaleDateString("es-UY") : "—"}
                </div>
                <div className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>Último acceso</div>
              </div>
            </div>

            {/* History list */}
            <h4 className="text-[11px] font-bold mb-2" style={{ color: "var(--text-secondary)" }}>
              Últimos accesos
            </h4>
            <div className="space-y-1">
              {data.history.slice(0, 20).map((h) => {
                const hms = matchStyles[(h.matchResult as MatchResult) || "unknown"];
                const time = new Date(h.timestamp);
                return (
                  <div
                    key={h.id}
                    className="flex items-center gap-2 py-2 px-2.5 rounded-xl"
                    style={{ background: "var(--card-bg)" }}
                  >
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: hms.color }} />
                    <span className="text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>
                      {time.toLocaleDateString("es-UY")} {time.toLocaleTimeString("es-UY")}
                    </span>
                    <span className="text-[10px] truncate flex-1" style={{ color: "var(--text-tertiary)" }}>
                      {h.nodeLabel || h.nodeId}
                    </span>
                    {h.direction && (
                      <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
                        {h.direction === "forward" ? "→" : "←"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
