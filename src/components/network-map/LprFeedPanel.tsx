"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  Clock,
  UserPlus,
  Ban,
  History,
  Camera,
  X,
  Volume2,
  Download,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
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

interface HistoryEntry {
  id: string;
  timestamp: string;
  plate: string;
  matchResult: string;
  nodeLabel?: string;
  nodeId: string;
  direction?: string;
}

type MatchResult = "authorized" | "visitor" | "visitor_expired" | "blocked" | "unknown";

// ── Match result styling ──

const matchStyles: Record<MatchResult, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  authorized: { color: "#4ade80", bg: "rgba(74,222,128,0.12)", icon: <ShieldCheck className="w-3.5 h-3.5" />, label: "Autorizado" },
  visitor: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: <Clock className="w-3.5 h-3.5" />, label: "Visitante" },
  visitor_expired: { color: "#fb923c", bg: "rgba(251,146,60,0.12)", icon: <ShieldAlert className="w-3.5 h-3.5" />, label: "Vencido" },
  blocked: { color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: <ShieldX className="w-3.5 h-3.5" />, label: "Bloqueado" },
  unknown: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", icon: <ShieldQuestion className="w-3.5 h-3.5" />, label: "Desconocido" },
};

// ── Props ──

interface LprFeedPanelProps {
  events: HikEvent[];
  mapId: string;
  nodeLabels?: Record<string, string>; // nodeId → camera label
  onOpenStream?: (nodeId: string) => void;
  soundEnabled?: boolean;
}

// ── Quick Add Modal ──

function QuickAddModal({
  plate,
  mapId,
  onClose,
  onSaved,
}: {
  plate: string;
  mapId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<"authorized" | "visitor" | "blocked">("authorized");
  const [ownerName, setOwnerName] = useState("");
  const [vehicleDesc, setVehicleDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!ownerName.trim()) return;
    setSaving(true);
    try {
      await fetch(apiUrl("/api/plates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapId,
          plate,
          category,
          ownerName: ownerName.trim(),
          vehicleDesc: vehicleDesc.trim() || undefined,
          notes: notes.trim() || undefined,
          validFrom: category === "visitor" ? validFrom || undefined : undefined,
          validUntil: category === "visitor" ? validUntil || undefined : undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Error saving plate:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-5 w-[380px] max-w-[90vw]"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Registrar matrícula</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Plate display */}
        <div
          className="text-center py-2 mb-4 rounded-lg font-mono text-xl font-black tracking-[0.2em]"
          style={{ background: "rgba(6,182,212,0.1)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.2)" }}
        >
          {plate}
        </div>

        {/* Category selector */}
        <div className="flex gap-2 mb-4">
          {(["authorized", "visitor", "blocked"] as const).map((cat) => {
            const s = matchStyles[cat];
            const active = category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: active ? s.bg : "rgba(255,255,255,0.03)",
                  color: active ? s.color : "rgba(255,255,255,0.4)",
                  border: `1px solid ${active ? s.color + "40" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <input
            placeholder="Nombre del propietario *"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm text-white"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            autoFocus
          />
          <input
            placeholder="Vehículo (ej: Toyota Hilux gris)"
            value={vehicleDesc}
            onChange={(e) => setVehicleDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm text-white"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          {category === "visitor" && (
            <div className="flex gap-2">
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm text-white"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm text-white"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
          )}
          <input
            placeholder="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm text-white"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>

        <button
          onClick={save}
          disabled={saving || !ownerName.trim()}
          className="w-full mt-4 py-2.5 rounded-lg text-sm font-bold transition-all"
          style={{
            background: ownerName.trim() ? "rgba(6,182,212,0.2)" : "rgba(255,255,255,0.03)",
            color: ownerName.trim() ? "#06b6d4" : "rgba(255,255,255,0.3)",
            border: `1px solid ${ownerName.trim() ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.06)"}`,
          }}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// ── Plate History Modal ──

function PlateHistoryModal({
  plate,
  mapId,
  onClose,
}: {
  plate: string;
  mapId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl(`/api/plates/history?mapId=${mapId}&plate=${encodeURIComponent(plate)}`))
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mapId, plate]);

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-5 w-[450px] max-w-[90vw] max-h-[70vh] overflow-y-auto"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Historial de matrícula</h3>
            <span className="font-mono text-base font-black tracking-widest" style={{ color: "#06b6d4" }}>
              {plate}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-8 text-sm">Cargando...</div>
        ) : data ? (
          <>
            {/* Registration info */}
            {data.registration && (
              <div
                className="mb-4 p-3 rounded-lg"
                style={{ background: matchStyles[data.status as MatchResult]?.bg || "rgba(255,255,255,0.03)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {matchStyles[data.status as MatchResult]?.icon}
                  <span className="text-xs font-semibold" style={{ color: matchStyles[data.status as MatchResult]?.color }}>
                    {matchStyles[data.status as MatchResult]?.label}
                  </span>
                </div>
                <div className="text-sm text-white font-semibold">{data.registration.ownerName}</div>
                {data.registration.vehicleDesc && (
                  <div className="text-xs text-white/50">{data.registration.vehicleDesc}</div>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="text-lg font-bold text-white">{data.summary.totalAccesses}</div>
                <div className="text-[10px] text-white/40">Accesos</div>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="text-[10px] text-white/60 font-mono">
                  {data.summary.firstSeen ? new Date(data.summary.firstSeen).toLocaleDateString("es-UY") : "—"}
                </div>
                <div className="text-[10px] text-white/40">Primer acceso</div>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="text-[10px] text-white/60 font-mono">
                  {data.summary.lastSeen ? new Date(data.summary.lastSeen).toLocaleDateString("es-UY") : "—"}
                </div>
                <div className="text-[10px] text-white/40">Último acceso</div>
              </div>
            </div>

            {/* Cameras seen at */}
            {data.summary.cameras?.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-white/30 mb-1">Cámaras:</div>
                <div className="flex flex-wrap gap-1">
                  {data.summary.cameras.map((cam: string) => (
                    <span key={cam} className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(6,182,212,0.1)", color: "#06b6d4" }}>
                      {cam}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* History entries */}
            <div className="text-[10px] text-white/30 mb-2">Últimos accesos:</div>
            <div className="space-y-1">
              {data.history?.slice(0, 20).map((entry: HistoryEntry) => {
                const ms = matchStyles[entry.matchResult as MatchResult] || matchStyles.unknown;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    <span style={{ color: ms.color }}>{ms.icon}</span>
                    <span className="text-[10px] text-white/50 font-mono w-28 shrink-0">
                      {new Date(entry.timestamp).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-[10px] text-white/40 truncate flex-1">
                      {entry.nodeLabel || entry.nodeId}
                    </span>
                    {entry.direction && (
                      <span className="text-[9px] text-white/30">
                        {entry.direction === "forward" ? "→" : "←"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center text-white/30 py-8 text-sm">Sin datos</div>
        )}
      </div>
    </div>
  );
}

// ── Main Feed Panel ──

export default function LprFeedPanel({
  events,
  mapId,
  nodeLabels = {},
  onOpenStream,
}: LprFeedPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [addModal, setAddModal] = useState<string | null>(null); // plate to add
  const [historyModal, setHistoryModal] = useState<string | null>(null); // plate to view
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter to only ANPR events
  const anprEvents = events
    .filter((e) => e.eventType === "anpr" && e.licensePlate && e.licensePlate !== "NO_LEIDA")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50);

  // Auto-scroll to newest on new event
  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [anprEvents.length, collapsed]);

  // Play alert sound for blocked/unknown
  const lastAlertRef = useRef<string>("");
  useEffect(() => {
    if (anprEvents.length === 0) return;
    const latest = anprEvents[0];
    if (latest.id === lastAlertRef.current) return;
    lastAlertRef.current = latest.id;

    if (latest.matchResult === "blocked" || latest.matchResult === "unknown") {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = latest.matchResult === "blocked" ? "square" : "triangle";
        osc.frequency.value = latest.matchResult === "blocked" ? 880 : 660;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } catch {}
    }
  }, [anprEvents]);

  if (anprEvents.length === 0) return null;

  return (
    <>
      {/* Feed panel */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[10000] transition-transform duration-300"
        style={{
          transform: collapsed ? "translateY(calc(100% - 36px))" : "translateY(0)",
        }}
      >
        {/* Collapse toggle */}
        <div className="flex justify-center">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="px-4 py-1 rounded-t-lg flex items-center gap-2 text-[10px] font-semibold"
            style={{
              background: "rgba(15,15,25,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderBottom: "none",
              color: "#06b6d4",
            }}
          >
            {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            LPR LIVE · {anprEvents.length} detecciones
            {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Cards container */}
        <div
          className="overflow-x-auto pb-2 pt-1 px-3"
          ref={scrollRef}
          style={{
            background: "linear-gradient(180deg, rgba(10,10,20,0.96) 0%, rgba(15,15,30,0.98) 100%)",
            borderTop: "1px solid rgba(6,182,212,0.15)",
            backdropFilter: "blur(20px)",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(6,182,212,0.3) transparent",
          }}
        >
          <div className="flex gap-2.5" style={{ minHeight: 110 }}>
            {anprEvents.map((event) => {
              const match = (event.matchResult as MatchResult) || "unknown";
              const ms = matchStyles[match];
              const imageId = event.plateImageId || event.fullImageId;
              const cameraName = nodeLabels[event.nodeId] || event.nodeId;
              const time = new Date(event.timestamp).toLocaleTimeString("es-UY", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              return (
                <div
                  key={event.id}
                  className="shrink-0 rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
                  style={{
                    width: 260,
                    background: "rgba(20,20,40,0.8)",
                    border: `1px solid ${ms.color}25`,
                  }}
                >
                  {/* Top: image + plate */}
                  <div className="flex">
                    {/* Image */}
                    <div
                      className="shrink-0 relative"
                      style={{ width: 90, height: 65, background: "rgba(0,0,0,0.3)" }}
                    >
                      {imageId ? (
                        <img
                          src={apiUrl(`/api/hik/images/${imageId}`)}
                          alt="Captura"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white/10" />
                        </div>
                      )}
                      {/* Status badge overlay */}
                      <div
                        className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                        style={{ background: ms.bg, border: `1px solid ${ms.color}30` }}
                      >
                        <span style={{ color: ms.color }}>{ms.icon}</span>
                        <span className="text-[8px] font-bold" style={{ color: ms.color }}>{ms.label}</span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-2 min-w-0">
                      {/* Plate number */}
                      <div
                        className="text-base font-black tracking-[0.15em] font-mono leading-tight"
                        style={{ color: ms.color }}
                      >
                        {event.licensePlate}
                      </div>

                      {/* Owner name if known */}
                      {event.matchOwner && (
                        <div className="text-[10px] text-white/70 font-semibold truncate mt-0.5">
                          {event.matchOwner}
                        </div>
                      )}

                      {/* Camera name */}
                      <div className="flex items-center gap-1 mt-1">
                        <Camera className="w-2.5 h-2.5 text-white/25" />
                        <span className="text-[9px] text-white/40 truncate">{cameraName}</span>
                      </div>

                      {/* Time + direction */}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-white/30 font-mono">{time}</span>
                        {event.direction && (
                          <span className="text-[9px] text-white/25">
                            {event.direction === "forward" ? "→ Entrada" : event.direction === "reverse" ? "← Salida" : ""}
                          </span>
                        )}
                        {event.confidence && (
                          <span className="text-[9px] text-white/20">{event.confidence}%</span>
                        )}
                      </div>

                      {/* Vehicle info */}
                      {(event.vehicleBrand || event.vehicleColor) && (
                        <div className="text-[8px] text-white/20 truncate mt-0.5">
                          {[event.vehicleColor, event.vehicleBrand, event.vehicleModel].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom: action buttons */}
                  <div
                    className="flex border-t"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}
                  >
                    <button
                      onClick={() => setAddModal(event.licensePlate!)}
                      className="flex-1 py-1.5 flex items-center justify-center gap-1 text-[9px] font-semibold hover:bg-white/5 transition-colors"
                      style={{ color: "#4ade80" }}
                      title="Registrar matrícula"
                    >
                      <UserPlus className="w-3 h-3" />
                      Registrar
                    </button>
                    <div style={{ width: 1, background: "rgba(255,255,255,0.04)" }} />
                    <button
                      onClick={() => setHistoryModal(event.licensePlate!)}
                      className="flex-1 py-1.5 flex items-center justify-center gap-1 text-[9px] font-semibold hover:bg-white/5 transition-colors"
                      style={{ color: "#a78bfa" }}
                      title="Ver historial"
                    >
                      <History className="w-3 h-3" />
                      Historial
                    </button>
                    {onOpenStream && (
                      <>
                        <div style={{ width: 1, background: "rgba(255,255,255,0.04)" }} />
                        <button
                          onClick={() => onOpenStream(event.nodeId)}
                          className="flex-1 py-1.5 flex items-center justify-center gap-1 text-[9px] font-semibold hover:bg-white/5 transition-colors"
                          style={{ color: "#06b6d4" }}
                          title="Ver cámara"
                        >
                          <Camera className="w-3 h-3" />
                          Video
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modals */}
      {addModal && (
        <QuickAddModal
          plate={addModal}
          mapId={mapId}
          onClose={() => setAddModal(null)}
          onSaved={() => {}}
        />
      )}
      {historyModal && (
        <PlateHistoryModal
          plate={historyModal}
          mapId={mapId}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </>
  );
}
