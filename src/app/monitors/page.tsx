"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { safeFetch } from "@/lib/error-handler";

/** Fetch that returns {data, error} instead of swallowing errors */
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { data: null, error: body?.error || body?.msg || `HTTP ${res.status}` };
    }
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Error de red" };
  }
}

// ─── Types ──────────────────────────────────────────
interface KumaMonitor {
  id: number;
  name: string;
  type: string;
  url: string;
  hostname: string;
  port?: number;
  interval?: number;
  active: boolean;
  parent?: number | null;
  status?: number;
  ping?: number | null;
  msg?: string;
  uptime24?: number;
  description?: string;
  maxretries?: number;
  keyword?: string;
  notificationIDList?: Record<string, boolean>;
  tags?: { name: string; color: string }[];
}

interface KumaGroup {
  id: number;
  name: string;
  active: boolean;
  parent: number | null;
  childCount: number;
}

interface Notification {
  id: number;
  name: string;
  type: string;
}

interface Heartbeat {
  monitorID: number;
  status: number;
  time: string;
  ping: number | null;
  msg: string;
}

interface MapInfo {
  id: number;
  name: string;
  monitor_ids: number[];
}

// ─── Monitor type definitions with descriptions ─────
const MONITOR_TYPES: {
  value: string; label: string; icon: string;
  fields: string[]; desc: string; descLong: string;
}[] = [
  { value: "http", label: "HTTP(s)", icon: "🌐", fields: ["url", "keyword", "maxretries"], desc: "Verifica sitios web", descLong: "Realiza una solicitud HTTP/HTTPS al URL especificado y verifica que responda correctamente (código 2xx). Ideal para monitorear sitios web, APIs REST y servicios web." },
  { value: "ping", label: "Ping (ICMP)", icon: "📡", fields: ["hostname"], desc: "Comprueba conectividad", descLong: "Envía paquetes ICMP (ping) al host para verificar que está encendido y accesible en la red. El tipo más básico de monitoreo — si el ping falla, el equipo está apagado o desconectado." },
  { value: "port", label: "TCP Port", icon: "🔌", fields: ["hostname", "port"], desc: "Verifica puerto abierto", descLong: "Intenta una conexión TCP al puerto especificado. Útil para verificar que un servicio está escuchando (ej: SSH en 22, HTTP en 80, RTSP en 554, base de datos en 5432)." },
  { value: "dns", label: "DNS", icon: "📛", fields: ["hostname"], desc: "Resuelve nombres de dominio", descLong: "Verifica que un nombre de dominio resuelve correctamente a una dirección IP." },
  { value: "keyword", label: "HTTP + Keyword", icon: "🔍", fields: ["url", "keyword"], desc: "Busca texto en página web", descLong: "Igual que HTTP, pero además verifica que la respuesta contenga un texto específico." },
  { value: "push", label: "Push", icon: "📨", fields: [], desc: "El servicio reporta a Kuma", descLong: "Modelo inverso: tu aplicación envía un heartbeat periódico a Uptime Kuma. Si deja de recibir heartbeats, marca DOWN." },
  { value: "steam", label: "Steam Game", icon: "🎮", fields: ["hostname", "port"], desc: "Servidores de juegos Steam", descLong: "Monitorea servidores de juegos que usan el protocolo Steam Query." },
  { value: "mqtt", label: "MQTT", icon: "📩", fields: ["hostname", "port"], desc: "Broker de mensajería IoT", descLong: "Verifica conectividad a un broker MQTT." },
  { value: "docker", label: "Docker", icon: "🐳", fields: ["hostname"], desc: "Contenedores Docker", descLong: "Monitorea el estado de contenedores Docker." },
  { value: "grpc", label: "gRPC", icon: "⚡", fields: ["url"], desc: "Servicios gRPC", descLong: "Verifica servicios que usan el protocolo gRPC." },
  { value: "snmp", label: "SNMP", icon: "📊", fields: ["hostname"], desc: "Equipos de red (SNMP)", descLong: "Consulta equipos de red vía SNMP para obtener métricas." },
  { value: "group", label: "Grupo", icon: "📁", fields: [], desc: "Agrupa monitores", descLong: "Contenedor para organizar otros monitores. Su estado refleja el peor estado de sus hijos." },
  { value: "json-query", label: "JSON Query", icon: "📋", fields: ["url"], desc: "Consulta valores en APIs JSON", descLong: "Obtiene una respuesta JSON y evalúa una expresión JSONPath." },
  { value: "real-browser", label: "Real Browser", icon: "🖥️", fields: ["url"], desc: "Navegador real (Chromium)", descLong: "Usa Chromium real para cargar la página." },
  { value: "sqlserver", label: "SQL Server", icon: "🗄️", fields: ["hostname", "port"], desc: "Microsoft SQL Server", descLong: "Verifica conectividad a SQL Server." },
  { value: "postgres", label: "PostgreSQL", icon: "🐘", fields: ["hostname", "port"], desc: "Base de datos PostgreSQL", descLong: "Conecta a PostgreSQL y ejecuta una consulta de prueba." },
  { value: "mysql", label: "MySQL/MariaDB", icon: "🐬", fields: ["hostname", "port"], desc: "Base de datos MySQL", descLong: "Verifica conectividad a MySQL o MariaDB." },
  { value: "mongodb", label: "MongoDB", icon: "🍃", fields: ["hostname", "port"], desc: "Base de datos MongoDB", descLong: "Verifica conectividad a MongoDB." },
  { value: "redis", label: "Redis", icon: "🔴", fields: ["hostname", "port"], desc: "Cache/broker Redis", descLong: "Verifica que Redis está respondiendo." },
  { value: "radius", label: "RADIUS", icon: "🛡️", fields: ["hostname", "port"], desc: "Servidor RADIUS", descLong: "Verifica conectividad a un servidor RADIUS." },
];

type MonitorFieldName = "url" | "hostname" | "port" | "keyword" | "maxretries";

const typeMap = Object.fromEntries(MONITOR_TYPES.map((t) => [t.value, t]));
function getTypeInfo(type: string) {
  return typeMap[type] || { value: type, label: type, icon: "❓", fields: [], desc: "", descLong: "" };
}

function statusColor(status?: number) {
  if (status === 1) return "#22c55e";
  if (status === 0) return "#ef4444";
  if (status === 2) return "#f59e0b";
  return "#555";
}

function statusLabel(status?: number, active?: boolean) {
  if (!active) return "PAUSED";
  if (status === 1) return "UP";
  if (status === 0) return "DOWN";
  if (status === 2) return "PENDING";
  return "—";
}

// ─── Toast system ───────────────────────────────────
let toastId = 0;
interface ToastMsg { id: number; text: string; type: "success" | "error" | "info"; }

function useToasts() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const add = useCallback((text: string, type: ToastMsg["type"] = "success") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          color: t.type === "error" ? "#fca5a5" : t.type === "info" ? "#93c5fd" : "#86efac",
          background: t.type === "error" ? "rgba(239,68,68,0.15)" : t.type === "info" ? "rgba(59,130,246,0.15)" : "rgba(34,197,94,0.15)",
          border: `1px solid ${t.type === "error" ? "rgba(239,68,68,0.3)" : t.type === "info" ? "rgba(59,130,246,0.3)" : "rgba(34,197,94,0.3)"}`,
          backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          animation: "toastIn 0.3s cubic-bezier(0.16,1,0.3,1)",
          maxWidth: 360,
        }}>
          {t.type === "success" ? "✓ " : t.type === "error" ? "✕ " : "ℹ "}{t.text}
        </div>
      ))}
    </div>
  );
}

// ─── Heartbeat Bar (interactive, Uptime-Kuma-inspired) ──
function HeartbeatBar({ beats: rawBeats, width = 300, height = 28 }: {
  beats: Heartbeat[];
  width?: number;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const beats = Array.isArray(rawBeats) ? rawBeats : [];
  const barW = 4;
  const gap = 1.5;
  const maxBars = Math.floor(width / (barW + gap));
  const displayed = beats.slice(-maxBars);

  if (displayed.length === 0) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 9, color: "#333", fontStyle: "italic" }}>sin datos</span>
      </div>
    );
  }

  const totalW = displayed.length * (barW + gap) - gap;
  const offsetX = width - totalW;

  return (
    <div style={{ width, height, position: "relative", flexShrink: 0 }}>
      <svg width={width} height={height} style={{ display: "block" }}
        onMouseLeave={() => setHoverIdx(null)}>
        {displayed.map((b, i) => {
          const x = offsetX + i * (barW + gap);
          const color = b.status === 1 ? "#22c55e" : b.status === 0 ? "#ef4444" : b.status === 2 ? "#f59e0b" : "#333";
          const isHover = hoverIdx === i;
          const barH = height - 6;
          const y = (height - barH) / 2;
          return (
            <rect
              key={i}
              x={x} y={isHover ? y - 2 : y}
              width={barW} height={isHover ? barH + 4 : barH}
              rx={2} fill={color}
              opacity={isHover ? 1 : 0.75}
              style={{ transition: "all 0.1s ease", cursor: "pointer" }}
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>
      {/* Tooltip */}
      {hoverIdx !== null && displayed[hoverIdx] && (
        <div style={{
          position: "absolute", bottom: height + 4,
          left: Math.min(Math.max(offsetX + hoverIdx * (barW + gap) - 60, 0), width - 140),
          background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
          padding: "6px 10px", fontSize: 10, color: "#ccc", whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.6)", zIndex: 50,
          animation: "fadeIn 0.1s ease",
          pointerEvents: "none",
        }}>
          <div style={{ fontWeight: 700, color: statusColor(displayed[hoverIdx].status), marginBottom: 2 }}>
            {displayed[hoverIdx].status === 1 ? "UP" : displayed[hoverIdx].status === 0 ? "DOWN" : "PENDING"}
            {displayed[hoverIdx].ping != null && <span style={{ color: "#888", fontWeight: 400 }}> · {displayed[hoverIdx].ping}ms</span>}
          </div>
          <div style={{ color: "#666" }}>{new Date(displayed[hoverIdx].time).toLocaleString()}</div>
          {displayed[hoverIdx].msg && displayed[hoverIdx].status !== 1 && (
            <div style={{ color: "#ef4444", marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{displayed[hoverIdx].msg}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Group Heartbeat Bar (aggregate children beats) ──
function GroupHeartbeatBar({ groupId, heartbeats, monitors, width = 300, height = 20 }: {
  groupId: number;
  heartbeats: Record<number, Heartbeat[]>;
  monitors: KumaMonitor[];
  width?: number;
  height?: number;
}) {
  // Get all children IDs recursively (for nested groups this includes sub-children)
  const safeMonitors = monitors || [];
  const safeHeartbeats = heartbeats || {};
  const childIds = safeMonitors.filter((m) => m.parent === groupId).map((m) => m.id);
  if (childIds.length === 0) return null;

  // Merge beats: for each time slot, compute aggregate status
  // Collect all beats sorted by time, then bucket into ~90 slots
  const allBeats: Heartbeat[] = [];
  childIds.forEach((id) => {
    const b = safeHeartbeats[id];
    if (Array.isArray(b)) allBeats.push(...b);
  });
  if (allBeats.length === 0) return null;

  allBeats.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Bucket into max 90 slots
  const maxSlots = Math.floor(width / 5.5);
  const bucketSize = Math.max(1, Math.ceil(allBeats.length / maxSlots));
  const aggregated: Heartbeat[] = [];
  for (let i = 0; i < allBeats.length; i += bucketSize) {
    const bucket = allBeats.slice(i, i + bucketSize);
    const anyDown = bucket.some((b) => b.status === 0);
    const allUp = bucket.every((b) => b.status === 1);
    const avgPing = Math.round(bucket.reduce((s, b) => s + (b.ping || 0), 0) / bucket.length);
    aggregated.push({
      monitorID: groupId,
      status: anyDown ? 0 : allUp ? 1 : 2,
      time: bucket[Math.floor(bucket.length / 2)].time,
      ping: avgPing,
      msg: anyDown ? `${bucket.filter((b) => b.status === 0).length} DOWN` : "",
    });
  }

  return <HeartbeatBar beats={aggregated} width={width} height={height} />;
}

// ─── Notification indicator ──────────────────────────
function NotifIndicator({ monitor }: { monitor: KumaMonitor }) {
  const nList = monitor.notificationIDList;
  const hasNotifs = nList && typeof nList === "object" && Object.values(nList).some(Boolean);
  return (
    <div title={hasNotifs ? "Notificaciones activas" : "Sin notificaciones"} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 20, height: 20, flexShrink: 0, position: "relative",
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill={hasNotifs ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
        style={{ color: hasNotifs ? "#f59e0b" : "#333" }}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {hasNotifs && (
        <div style={{ position: "absolute", top: 0, right: 0, width: 5, height: 5, borderRadius: "50%", background: "#f59e0b" }} />
      )}
    </div>
  );
}

// ─── Map Indicator ──────────────────────────────────
function MapIndicator({ monitorId, mapMonitorIds, maps }: {
  monitorId: number;
  mapMonitorIds: Set<number>;
  maps: MapInfo[];
}) {
  const hasMap = mapMonitorIds.has(monitorId);
  const mapNames = hasMap ? maps.filter((m) => m.monitor_ids.includes(monitorId)).map((m) => m.name) : [];
  return (
    <div title={hasMap ? `En mapa: ${mapNames.join(", ")}` : "Sin mapa asignado"} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 20, height: 20, flexShrink: 0, position: "relative",
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill={hasMap ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
        style={{ color: hasMap ? "#22d3ee" : "#333" }}>
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
      {hasMap && (
        <div style={{ position: "absolute", top: 0, right: 0, width: 5, height: 5, borderRadius: "50%", background: "#22d3ee" }} />
      )}
    </div>
  );
}

// ─── Alert History Button (opens inline modal) ─────
function AlertHistoryBtn({ monitorId, monitorName }: { monitorId: number; monitorName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button title={`Ver historial de alertas de "${monitorName}"`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="action-btn" style={{ color: "#a78bfa", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>
      {open && <AlertHistoryModal monitorId={monitorId} monitorName={monitorName} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Alert History Modal ────────────────────────────
interface TimelineEvent {
  monitorId: number;
  monitorName: string;
  time: string;
  status: number;
  prevStatus: number;
  ping: number | null;
  msg: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d ${hrs % 24}h`;
}

function AlertHistoryModal({ monitorId, monitorName, onClose }: { monitorId: number; monitorName: string; onClose: () => void }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl(`/api/kuma/timeline?monitorIds=${monitorId}&hours=${hours}`))
      .then((r) => r.json())
      .then((data) => {
        const evts = Array.isArray(data?.events) ? data.events : [];
        setEvents(evts);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [monitorId, hours]);

  const statusLabel = (s: number) => {
    if (s === 0) return { text: "CAÍDO", color: "#ef4444", bg: "rgba(239,68,68,0.15)" };
    if (s === 1) return { text: "ACTIVO", color: "#22c55e", bg: "rgba(34,197,94,0.15)" };
    if (s === 2) return { text: "PENDIENTE", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" };
    if (s === 3) return { text: "MANTENIMIENTO", color: "#60a5fa", bg: "rgba(96,165,250,0.15)" };
    return { text: `Estado ${s}`, color: "#888", bg: "rgba(136,136,136,0.15)" };
  };

  const hourOptions = [1, 6, 12, 24, 48, 72, 168];

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, width: "min(560px, 95vw)", maxHeight: "80vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div>
              <div style={{ color: "#ededed", fontWeight: 600, fontSize: 14 }}>Historial de Alertas</div>
              <div style={{ color: "#888", fontSize: 11 }}>{monitorName}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, color: "#ccc", padding: "4px 8px", fontSize: 11, cursor: "pointer",
            }}>
              {hourOptions.map((h) => (
                <option key={h} value={h}>{h < 24 ? `${h}h` : `${h / 24}d`}</option>
              ))}
            </select>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8,
              color: "#888", cursor: "pointer", padding: "4px 8px", fontSize: 16,
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
              <div style={{ width: 20, height: 20, border: "2px solid #333", borderTopColor: "#a78bfa", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
              Cargando eventos...
            </div>
          ) : events.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#555" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block", color: "#333" }}>
                <circle cx="12" cy="12" r="10" /><path d="M8 15h8" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="9" r="1" />
              </svg>
              Sin eventos en las últimas {hours < 24 ? `${hours} horas` : `${hours / 24} días`}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {events.map((ev, i) => {
                const st = statusLabel(ev.status);
                const prev = statusLabel(ev.prevStatus);
                const date = new Date(ev.time);
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 10,
                    background: "rgba(255,255,255,0.02)",
                    borderLeft: `3px solid ${st.color}`,
                  }}>
                    <div style={{ flex: "0 0 auto" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 6px", borderRadius: 6,
                        fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                        color: st.color, background: st.bg,
                      }}>{st.text}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#ccc", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {prev.text} → {st.text}
                        {ev.msg && <span style={{ color: "#666", marginLeft: 6 }}>— {ev.msg}</span>}
                      </div>
                      {ev.ping != null && ev.ping > 0 && (
                        <span style={{ color: "#555", fontSize: 10 }}>{ev.ping}ms</span>
                      )}
                    </div>
                    <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                      <div style={{ color: "#666", fontSize: 10, fontFamily: "monospace" }}>
                        {date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      <div style={{ color: "#444", fontSize: 9 }}>{timeAgo(ev.time)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: "#555", fontSize: 10 }}>
            {events.length} evento{events.length !== 1 ? "s" : ""}
          </span>
          <a href={`/alerts?monitorIds=${monitorId}`} style={{
            color: "#a78bfa", fontSize: 11, textDecoration: "none",
          }}>
            Ver en Alert Manager →
          </a>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─── Group Notif Indicator (aggregate) ──────────────
function GroupNotifIndicator({ groupId, monitors }: { groupId: number; monitors: KumaMonitor[] }) {
  const children = monitors.filter((m) => m.parent === groupId);
  const withNotifs = children.filter((m) => {
    const n = m.notificationIDList;
    return n && typeof n === "object" && Object.values(n).some(Boolean);
  });
  const count = withNotifs.length;
  return (
    <div title={count > 0 ? `${count}/${children.length} con notificaciones` : "Sin notificaciones en el grupo"} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
      flexShrink: 0, position: "relative",
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill={count > 0 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
        style={{ color: count > 0 ? "#f59e0b" : "#333" }}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", fontFamily: "monospace" }}>{count}</span>
      )}
    </div>
  );
}

// ─── Group Map Indicator ────────────────────────────
function GroupMapIndicator({ groupId, monitors, mapMonitorIds }: {
  groupId: number; monitors: KumaMonitor[]; mapMonitorIds: Set<number>;
}) {
  const children = monitors.filter((m) => m.parent === groupId);
  const withMap = children.filter((m) => mapMonitorIds.has(m.id));
  const count = withMap.length;
  return (
    <div title={count > 0 ? `${count}/${children.length} en mapas` : "Sin monitores en mapas"} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
      flexShrink: 0,
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill={count > 0 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
        style={{ color: count > 0 ? "#22d3ee" : "#333" }}>
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
      {count > 0 && (
        <span style={{ fontSize: 9, fontWeight: 700, color: "#22d3ee", fontFamily: "monospace" }}>{count}</span>
      )}
    </div>
  );
}

// ─── Styled custom select (dark theme) ──────────────
function DarkSelect({ value, onChange, options, placeholder, style }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: string }[];
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button type="button" onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 10,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          color: selected ? "#ededed" : "#666", fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
          transition: "border-color 0.2s",
          ...(open ? { borderColor: "rgba(59,130,246,0.4)" } : {}),
        }}>
        <span>{selected ? `${selected.icon || ""} ${selected.label}`.trim() : (placeholder || "Seleccionar...")}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
          maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "dropIn 0.15s ease-out",
        }}>
          {options.map((o) => (
            <button key={o.value} type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                width: "100%", padding: "9px 12px", display: "flex", alignItems: "center", gap: 8,
                background: o.value === value ? "rgba(59,130,246,0.12)" : "transparent",
                border: "none", color: o.value === value ? "#60a5fa" : "#ccc", fontSize: 13,
                cursor: "pointer", textAlign: "left", transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              {o.icon && <span style={{ fontSize: 14, flexShrink: 0 }}>{o.icon}</span>}
              <span style={{ fontWeight: o.value === value ? 600 : 400 }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Monitor Form Modal ─────────────────────────────
function MonitorFormModal({ monitor, groups, notifications, onClose, onSave }: {
  monitor?: KumaMonitor | null; groups: KumaGroup[]; notifications: Notification[];
  onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const isEdit = !!monitor;
  const [name, setName] = useState(monitor?.name || "");
  const [type, setType] = useState(monitor?.type || "http");
  const [url, setUrl] = useState(monitor?.url || "");
  const [hostname, setHostname] = useState(monitor?.hostname || "");
  const [port, setPort] = useState(monitor?.port?.toString() || "");
  const [interval, setInterval_] = useState(monitor?.interval?.toString() || "60");
  const [keyword, setKeyword] = useState(monitor?.keyword || "");
  const [maxretries, setMaxretries] = useState(monitor?.maxretries?.toString() || "1");
  const [parent, setParent] = useState<string>(monitor?.parent?.toString() || "");
  const [description, setDescription] = useState(monitor?.description || "");
  const [selectedNotifs, setSelectedNotifs] = useState<Record<string, boolean>>(monitor?.notificationIDList || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const typeInfo = getTypeInfo(type);
  const fields = typeInfo.fields || [];

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const data: Record<string, unknown> = {
        name: name.trim(), type,
        interval: parseInt(interval) || 60,
        description: description.trim(),
        notificationIDList: selectedNotifs,
      };
      if (fields.includes("url") && url) data.url = url;
      if (fields.includes("hostname") && hostname) data.hostname = hostname;
      if (fields.includes("port") && port) data.port = parseInt(port);
      if (fields.includes("keyword") && keyword) data.keyword = keyword;
      if (fields.includes("maxretries")) data.maxretries = parseInt(maxretries) || 1;
      if (parent) data.parent = parseInt(parent);
      else data.parent = null;

      const ok = await onSave(data);
      if (!ok) setError("No se pudo guardar. Revisá el toast de error para más detalles.");
    } finally { setSaving(false); }
  };

  const iStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, padding: "9px 12px", color: "#ededed", fontSize: 13,
    width: "100%", outline: "none", transition: "border-color 0.2s",
  };
  const lStyle: React.CSSProperties = { fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 5, display: "block", letterSpacing: "0.02em" };

  const toggleNotif = (id: number) => {
    setSelectedNotifs((prev) => ({ ...prev, [String(id)]: !prev[String(id)] }));
  };

  // All groups flat for parent selector (for monitors, show all groups)
  const allGroups = groups;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "#ededed", margin: 0 }}>
            {isEdit ? "Editar Monitor" : "Nuevo Monitor"}
          </h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={lStyle}>Nombre *</label>
            <input style={iStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi servidor" autoFocus
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
          </div>

          <div>
            <label style={lStyle}>Tipo de monitor</label>
            <DarkSelect value={type} onChange={(v) => setType(v)}
              options={MONITOR_TYPES.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} />
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)", fontSize: 11, color: "#8ab4f8", lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700 }}>{typeInfo.icon} {typeInfo.label}:</span> {typeInfo.descLong}
            </div>
          </div>

          {fields.includes("url") && (
            <div><label style={lStyle}>URL</label>
              <input style={iStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} /></div>
          )}
          {fields.includes("hostname") && (
            <div><label style={lStyle}>Hostname / IP</label>
              <input style={iStyle} value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="192.168.1.1"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} /></div>
          )}
          {fields.includes("port") && (
            <div><label style={lStyle}>Puerto</label>
              <input style={iStyle} type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="443"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} /></div>
          )}
          {fields.includes("keyword") && (
            <div><label style={lStyle}>Keyword</label>
              <input style={iStyle} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="OK"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} /></div>
          )}

          {type !== "group" && (
            <div style={{ display: "grid", gridTemplateColumns: fields.includes("maxretries") ? "1fr 1fr" : "1fr", gap: 12 }}>
              <div><label style={lStyle}>Intervalo (seg)</label>
                <input style={iStyle} type="number" value={interval} onChange={(e) => setInterval_(e.target.value)} min="20" max="86400"
                  onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} /></div>
              {fields.includes("maxretries") && (
                <div><label style={lStyle}>Reintentos</label>
                  <input style={iStyle} type="number" value={maxretries} onChange={(e) => setMaxretries(e.target.value)} min="0" max="100"
                    onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                    onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} /></div>
              )}
            </div>
          )}

          {allGroups.length > 0 && (
            <div><label style={lStyle}>Grupo padre</label>
              <DarkSelect value={parent} onChange={(v) => setParent(v)} placeholder="Sin grupo"
                options={[{ value: "", label: "Sin grupo" }, ...allGroups.filter((g) => monitor ? g.id !== monitor.id : true).map((g) => ({ value: String(g.id), label: g.name, icon: "📁" }))]} /></div>
          )}

          {notifications.length > 0 && type !== "group" && (
            <div><label style={lStyle}>Notificaciones</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {notifications.map((n) => {
                  const active = !!selectedNotifs[String(n.id)];
                  return (
                    <button key={n.id} type="button" onClick={() => toggleNotif(n.id)}
                      style={{
                        padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                        background: active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`,
                        color: active ? "#4ade80" : "#777", transition: "all 0.15s",
                      }}>
                      {active ? "✓ " : ""}{n.name}
                    </button>
                  );
                })}
              </div></div>
          )}

          <div><label style={lStyle}>Descripción</label>
            <textarea style={{ ...iStyle, minHeight: 56, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas..."
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} /></div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()} className="btn-primary"
            style={{ opacity: !name.trim() ? 0.4 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            {saving && <span className="btn-spinner" />}
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear monitor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Form Modal ────────────────────────────────
function GroupFormModal({ group, groups, onClose, onSave }: {
  group?: KumaGroup | null; groups: KumaGroup[]; onClose: () => void;
  onSave: (name: string, parent: number | null) => Promise<boolean>;
}) {
  const [name, setName] = useState(group?.name || "");
  const [parent, setParent] = useState<string>(group?.parent?.toString() || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const ok = await onSave(name.trim(), parent ? parseInt(parent) : null);
    if (!ok) setError("Error al guardar el grupo.");
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#ededed", marginBottom: 16, margin: 0 }}>
          {group ? "Editar Grupo" : "Nuevo Grupo"}
        </h2>
        {error && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}
        <label style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 5, display: "block" }}>Nombre *</label>
        <input
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 12px", color: "#ededed", fontSize: 13, width: "100%", outline: "none" }}
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Servidores producción" autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />

        {groups.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 5, display: "block" }}>Grupo padre</label>
            <DarkSelect value={parent} onChange={(v) => setParent(v)} placeholder="Ninguno (raíz)"
              options={[{ value: "", label: "Ninguno (raíz)" }, ...groups.filter((g) => group ? g.id !== group.id : true).map((g) => ({ value: String(g.id), label: g.name, icon: "📁" }))]} />
          </div>
        )}

        <p style={{ fontSize: 10, color: "#555", marginTop: 6 }}>
          Los grupos organizan tus monitores. Podés anidar grupos dentro de otros grupos.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()} className="btn-primary"
            style={{ opacity: !name.trim() ? 0.4 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            {saving && <span className="btn-spinner" />}
            {saving ? "Guardando..." : group ? "Guardar" : "Crear grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ────────────────────────────
function ConfirmModal({ title, message, onConfirm, onClose }: { title: string; message: string; onConfirm: () => void; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 420, borderColor: "rgba(239,68,68,0.15)" }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#f87171", marginBottom: 8, margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => { setDeleting(true); onConfirm(); }} disabled={deleting} className="btn-danger"
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {deleting && <span className="btn-spinner" />}
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Monitor Row ─────────────────────────────────────
function MonitorRow({ m, beats, onEdit, onDelete, onToggle, loadingAction, onDragStart, onDragEnd, mapMonitorIds, maps }: {
  m: KumaMonitor; beats: Heartbeat[];
  onEdit: () => void; onDelete: () => void; onToggle: () => void;
  loadingAction?: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  mapMonitorIds: Set<number>;
  maps: MapInfo[];
}) {
  const ti = getTypeInfo(m.type);
  const sc = statusColor(m.active ? m.status : undefined);
  const isTogglingThis = loadingAction === `toggle-${m.id}`;

  return (
    <div className="monitor-row" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{ opacity: loadingAction === `delete-${m.id}` ? 0.3 : 1 }}>
      <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: sc, opacity: m.active ? 1 : 0.3, transition: "background 0.3s" }} />

      <div style={{ position: "relative", width: 10, height: 10, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: sc, opacity: m.active ? 1 : 0.3 }} />
        {m.active && m.status === 0 && <div style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `2px solid ${sc}`, animation: "pulse-ring 1.5s infinite" }} />}
      </div>

      <span style={{ fontSize: 16, flexShrink: 0, opacity: m.active ? 1 : 0.4, cursor: "grab" }}>{ti.icon}</span>

      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 100, maxWidth: 220, flexShrink: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: m.active ? "#ededed" : "#777", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {m.name}
          </div>
          <div style={{ fontSize: 10, color: "#555", display: "flex", gap: 6, marginTop: 1, flexWrap: "wrap" }}>
            <span style={{ color: "#666" }}>{ti.label}</span>
            {m.url && <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.url}</span>}
            {m.hostname && <span>{m.hostname}{m.port ? `:${m.port}` : ""}</span>}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 60 }}>
          <HeartbeatBar beats={beats} width={260} height={24} />
        </div>
      </div>

      <NotifIndicator monitor={m} />
      <MapIndicator monitorId={m.id} mapMonitorIds={mapMonitorIds} maps={maps} />

      <div className="status-badge" style={{ background: `${sc}15`, borderColor: `${sc}30`, color: sc, opacity: m.active ? 1 : 0.5 }}>
        {statusLabel(m.status, m.active)}
      </div>

      <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", minWidth: 44, textAlign: "right" }}>
        {m.ping != null && m.active ? `${m.ping}ms` : "—"}
      </div>

      <div style={{ fontSize: 10, fontFamily: "monospace", minWidth: 44, textAlign: "right",
        color: !m.active ? "#444" : (m.uptime24 || 0) >= 0.999 ? "#22c55e" : (m.uptime24 || 0) >= 0.95 ? "#f59e0b" : "#ef4444" }}>
        {m.uptime24 != null && m.active ? `${(m.uptime24 * 100).toFixed(1)}%` : "—"}
      </div>

      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        <AlertHistoryBtn monitorId={m.id} monitorName={m.name} />
        <button onClick={onToggle} title={m.active ? "Pausar" : "Reanudar"} className="action-btn"
          style={{ color: m.active ? "#f59e0b" : "#22c55e" }} disabled={isTogglingThis}>
          {isTogglingThis
            ? <span className="btn-spinner" style={{ width: 12, height: 12 }} />
            : m.active
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
        </button>
        <button onClick={onEdit} title="Editar" className="action-btn" style={{ color: "#60a5fa" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button onClick={onDelete} title="Eliminar" className="action-btn" style={{ color: "#ef4444" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Recursive Group Node ────────────────────────────
function GroupNode({ group, allGroups, allMonitors, heartbeats, expandedGroups,
  toggleGroup, filterStatus, search, loadingAction,
  onEditGroup, onDeleteGroup, onEditMonitor, onDeleteMonitor, onTogglePause,
  onDragStartMonitor, onDragEndMonitor, onDragOver, onDrop, dragOverGroup,
  mapMonitorIds, maps,
}: {
  group: KumaGroup;
  allGroups: KumaGroup[];
  allMonitors: KumaMonitor[];
  heartbeats: Record<number, Heartbeat[]>;
  expandedGroups: Set<number>;
  toggleGroup: (id: number) => void;
  filterStatus: string;
  search: string;
  loadingAction: string;
  onEditGroup: (g: KumaGroup) => void;
  onDeleteGroup: (g: KumaGroup) => void;
  onEditMonitor: (m: KumaMonitor) => void;
  onDeleteMonitor: (m: KumaMonitor) => void;
  onTogglePause: (id: number, active: boolean) => void;
  onDragStartMonitor: (e: React.DragEvent, monitorId: number) => void;
  onDragEndMonitor: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, groupId: number) => void;
  onDrop: (e: React.DragEvent, groupId: number | null) => void;
  dragOverGroup: number | null;
  mapMonitorIds: Set<number>;
  maps: MapInfo[];
}) {
  const expanded = expandedGroups.has(group.id);

  // Safe arrays (guard against undefined props)
  const safeGroups = allGroups || [];
  const safeMonitors = allMonitors || [];

  // Child groups
  const childGroups = safeGroups.filter((g) => g.parent === group.id);
  // Child monitors (non-group)
  const childMonitors = safeMonitors.filter((m) => m.parent === group.id);
  // Filtered child monitors
  const filteredChildren = childMonitors.filter((m) => {
    let pass = true;
    if (search) {
      const q = search.toLowerCase();
      pass = m.name.toLowerCase().includes(q) || m.url?.toLowerCase().includes(q) || m.hostname?.toLowerCase().includes(q) || m.type.toLowerCase().includes(q);
    }
    if (pass && filterStatus === "up") pass = m.status === 1 && m.active;
    else if (pass && filterStatus === "down") pass = m.status === 0 && m.active;
    else if (pass && filterStatus === "paused") pass = !m.active;
    return pass;
  });

  // Group status from ALL children (not filtered)
  const allChildMons = safeMonitors.filter((m) => m.parent === group.id);
  const gs = (() => {
    if (allChildMons.length === 0 && childGroups.length === 0) return { color: "#555", label: "EMPTY" };
    const anyDown = allChildMons.some((m) => m.status === 0 && m.active);
    const allUp = allChildMons.length > 0 && allChildMons.every((m) => m.status === 1 && m.active);
    if (anyDown) return { color: "#ef4444", label: "DOWN" };
    if (allUp) return { color: "#22c55e", label: "UP" };
    return { color: "#f59e0b", label: "PARTIAL" };
  })();

  const isDragTarget = dragOverGroup === group.id;

  return (
    <div className="group-section" style={isDragTarget ? { borderColor: "rgba(96,165,250,0.5)", background: "rgba(59,130,246,0.03)" } : undefined}>
      <div className="group-header"
        onClick={() => toggleGroup(group.id)}
        onDragOver={(e) => onDragOver(e, group.id)}
        onDrop={(e) => onDrop(e, group.id)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"
          style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: gs.color, boxShadow: `0 0 6px ${gs.color}`, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: "#ededed", minWidth: 80 }}>
          📁 {group.name}
        </span>

        {/* Group heartbeat bar */}
        <div style={{ flex: 1, minWidth: 60 }} onClick={(e) => e.stopPropagation()}>
          <GroupHeartbeatBar groupId={group.id} heartbeats={heartbeats || {}} monitors={safeMonitors} width={200} height={16} />
        </div>

        <GroupNotifIndicator groupId={group.id} monitors={safeMonitors} />
        <GroupMapIndicator groupId={group.id} monitors={safeMonitors} mapMonitorIds={mapMonitorIds} />

        <span className="status-badge" style={{ background: `${gs.color}15`, borderColor: `${gs.color}30`, color: gs.color, fontSize: 9 }}>
          {gs.label}
        </span>
        <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>
          {allChildMons.filter((c) => c.status === 1 && c.active).length}/{allChildMons.length}
        </span>
        <div style={{ display: "flex", gap: 3 }}>
          <AlertHistoryBtn monitorId={group.id} monitorName={group.name} />
          <button onClick={(e) => { e.stopPropagation(); onEditGroup(group); }} className="action-btn" style={{ color: "#60a5fa" }} title="Editar grupo">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDeleteGroup(group); }} className="action-btn" style={{ color: "#ef4444" }} title="Eliminar grupo">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="group-children" style={{ animation: "slideDown 0.2s ease-out" }}>
          {/* Nested sub-groups */}
          {childGroups.map((cg) => (
            <div key={cg.id} style={{ paddingLeft: 16 }}>
              <GroupNode
                group={cg} allGroups={allGroups} allMonitors={allMonitors} heartbeats={heartbeats}
                expandedGroups={expandedGroups} toggleGroup={toggleGroup}
                filterStatus={filterStatus} search={search} loadingAction={loadingAction}
                onEditGroup={onEditGroup} onDeleteGroup={onDeleteGroup}
                onEditMonitor={onEditMonitor} onDeleteMonitor={onDeleteMonitor}
                onTogglePause={onTogglePause}
                onDragStartMonitor={onDragStartMonitor} onDragEndMonitor={onDragEndMonitor}
                onDragOver={onDragOver} onDrop={onDrop} dragOverGroup={dragOverGroup}
                mapMonitorIds={mapMonitorIds} maps={maps}
              />
            </div>
          ))}

          {/* Child monitors */}
          {filteredChildren.length === 0 && childGroups.length === 0 && (
            <div style={{ padding: "12px 16px 12px 40px", fontSize: 12, color: "#444", fontStyle: "italic" }}>
              {search ? "Sin resultados en este grupo" : "Grupo vacío — arrastrá monitores aquí"}
            </div>
          )}
          {filteredChildren.map((m) => (
            <MonitorRow key={m.id} m={m} beats={heartbeats[m.id] || []}
              loadingAction={loadingAction}
              onEdit={() => onEditMonitor(m)}
              onDelete={() => onDeleteMonitor(m)}
              onToggle={() => onTogglePause(m.id, m.active)}
              onDragStart={(e) => onDragStartMonitor(e, m.id)}
              onDragEnd={onDragEndMonitor}
              mapMonitorIds={mapMonitorIds} maps={maps}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────
export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [groups, setGroups] = useState<KumaGroup[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [heartbeats, setHeartbeats] = useState<Record<number, Heartbeat[]>>({});
  const [maps, setMaps] = useState<MapInfo[]>([]);
  const [mapMonitorIds, setMapMonitorIds] = useState<Set<number>>(new Set());
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [loadingAction, setLoadingAction] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const draggedMonitorId = useRef<number | null>(null);

  const { toasts, add: addToast } = useToasts();

  // Modals
  const [formModal, setFormModal] = useState<{ open: boolean; monitor?: KumaMonitor | null }>({ open: false });
  const [groupModal, setGroupModal] = useState<{ open: boolean; group?: KumaGroup | null }>({ open: false });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; id: number; name: string; isGroup: boolean } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchData = useCallback(async () => {
    try {
      const [kumaData, groupData, configData, hbData, mapsData] = await Promise.all([
        safeFetch<{ connected: boolean; monitors: KumaMonitor[] }>(apiUrl("/api/kuma")),
        safeFetch<{ groups: KumaGroup[] }>(apiUrl("/api/kuma/groups")),
        safeFetch<{ notifications: Notification[] }>(apiUrl("/api/kuma/config")),
        safeFetch<{ heartbeats: Record<number, Heartbeat[]> }>(apiUrl("/api/kuma/heartbeats?count=90")),
        safeFetch<MapInfo[]>(apiUrl("/api/maps")),
      ]);
      if (kumaData) {
        const mons = Array.isArray(kumaData.monitors) ? kumaData.monitors : [];
        setMonitors(mons.filter((m) => m.type !== "group"));
        setConnected(kumaData.connected);
      }
      if (groupData) setGroups(Array.isArray(groupData.groups) ? groupData.groups : []);
      if (configData) setNotifications(Array.isArray(configData.notifications) ? configData.notifications : []);
      if (hbData && hbData.heartbeats && typeof hbData.heartbeats === "object") {
        setHeartbeats(hbData.heartbeats);
      }
      if (Array.isArray(mapsData)) {
        setMaps(mapsData);
        const ids = new Set<number>();
        mapsData.forEach((m) => {
          if (Array.isArray(m.monitor_ids)) m.monitor_ids.forEach((id) => ids.add(id));
        });
        setMapMonitorIds(ids);
      }
    } catch (e) {
      console.error("[monitors] fetchData error:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch with retry: if Kuma is not connected, retry sooner
    let retryCount = 0;
    const doInitial = async () => {
      await fetchData();
      // After first fetch, if not connected and retries left, retry faster
      if (!connected && retryCount < 3) {
        retryCount++;
        setTimeout(doInitial, 1500);
      }
    };
    doInitial();
    pollRef.current = setInterval(fetchData, 4000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  // ── CRUD handlers (return {ok, error}) ──
  const handleCreateMonitor = async (data: Record<string, unknown>): Promise<boolean> => {
    const { data: res, error } = await apiFetch<{ ok: boolean }>(apiUrl("/api/kuma/monitors"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res?.ok) { setFormModal({ open: false }); addToast(`Monitor "${data.name}" creado`); setTimeout(fetchData, 800); return true; }
    addToast(error || "Error al crear monitor", "error");
    return false;
  };

  const handleEditMonitor = async (data: Record<string, unknown>): Promise<boolean> => {
    if (!formModal.monitor) return false;
    const { data: res, error } = await apiFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${formModal.monitor.id}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res?.ok) { setFormModal({ open: false }); addToast(`Monitor "${data.name}" actualizado`); setTimeout(fetchData, 800); return true; }
    addToast(error || "Error al editar monitor", "error");
    return false;
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setLoadingAction(`delete-${deleteModal.id}`);
    const { data: res, error } = await apiFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${deleteModal.id}`), { method: "DELETE" });
    if (res?.ok) {
      addToast(`"${deleteModal.name}" eliminado`);
      // Optimistic: remove from list immediately
      setMonitors((prev) => prev.filter((m) => m.id !== deleteModal.id));
      setDeleteModal(null);
      fetchData();
    } else {
      addToast(error || "Error al eliminar", "error");
    }
    setLoadingAction("");
  };

  const handleTogglePause = async (id: number, currentActive: boolean) => {
    setLoadingAction(`toggle-${id}`);
    const action = currentActive ? "pause" : "resume";
    const { data: res, error } = await apiFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (res) {
      const mon = monitors.find((m) => m.id === id);
      addToast(`${mon?.name || "Monitor"} ${currentActive ? "pausado" : "reanudado"}`);
      setMonitors((prev) => prev.map((m) => m.id === id ? { ...m, active: !currentActive } : m));
    } else {
      addToast(error || `Error al ${action}`, "error");
    }
    setLoadingAction("");
    fetchData();
  };

  const handleCreateGroup = async (name: string, parent: number | null): Promise<boolean> => {
    const body: Record<string, unknown> = { name };
    if (parent != null) body.parent = parent;
    const { data: res, error } = await apiFetch<{ ok: boolean }>(apiUrl("/api/kuma/groups"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res?.ok) { setGroupModal({ open: false }); addToast(`Grupo "${name}" creado`); setTimeout(fetchData, 800); return true; }
    addToast(error || "Error al crear grupo", "error");
    return false;
  };

  const handleEditGroup = async (name: string, parent: number | null): Promise<boolean> => {
    if (!groupModal.group) return false;
    const data: Record<string, unknown> = { name, type: "group" };
    if (parent != null) data.parent = parent;
    const { data: res, error } = await apiFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${groupModal.group.id}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res?.ok) { setGroupModal({ open: false }); addToast(`Grupo "${name}" actualizado`); setTimeout(fetchData, 800); return true; }
    addToast(error || "Error al editar grupo", "error");
    return false;
  };

  // ── Drag & Drop ──
  const handleDragStartMonitor = (e: React.DragEvent, monitorId: number) => {
    draggedMonitorId.current = monitorId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(monitorId));
  };
  const handleDragEndMonitor = () => {
    draggedMonitorId.current = null;
    setDragOverGroup(null);
  };
  const handleDragOver = (e: React.DragEvent, groupId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroup(groupId);
  };
  const handleDropOnGroup = async (e: React.DragEvent, groupId: number | null) => {
    e.preventDefault();
    setDragOverGroup(null);
    const mid = draggedMonitorId.current;
    if (mid == null) return;
    const monitor = monitors.find((m) => m.id === mid);
    if (!monitor || monitor.parent === groupId) return;

    setLoadingAction(`move-${mid}`);
    const { data: res, error } = await apiFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${mid}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent: groupId }),
    });
    if (res?.ok) {
      const gName = groupId ? groups.find((g) => g.id === groupId)?.name || "grupo" : "Sin grupo";
      addToast(`"${monitor.name}" movido a ${gName}`);
      setMonitors((prev) => prev.map((m) => m.id === mid ? { ...m, parent: groupId } : m));
    } else {
      addToast(error || "Error al mover", "error");
    }
    setLoadingAction("");
    fetchData();
  };

  // ── Export/Import ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error } = await apiFetch<any>(apiUrl("/api/kuma/export"));
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kumamap-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addToast(`Exportados ${data.totalGroups} grupos y ${data.totalMonitors} monitores`);
      } else {
        addToast(error || "Error al exportar", "error");
      }
    } catch (err: any) {
      addToast(err.message || "Error al exportar", "error");
    }
    setExporting(false);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const { data, error } = await apiFetch<{ ok: boolean; groupsCreated: number; monitorsCreated: number; errors: string[] }>(
        apiUrl("/api/kuma/import"),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) },
      );
      if (data?.ok) {
        addToast(`Importados: ${data.groupsCreated} grupos, ${data.monitorsCreated} monitores`);
        if (data.errors.length > 0) {
          addToast(`${data.errors.length} errores durante la importación`, "error");
        }
        fetchData();
      } else {
        addToast(error || "Error al importar", "error");
      }
    } catch (err: any) {
      addToast(err.message || "Error al leer archivo", "error");
    }
    setImporting(false);
    // Reset file input
    if (importFileRef.current) importFileRef.current.value = "";
  };

  // ── Filtered monitors (for ungrouped section) ──
  const filteredMonitors = useMemo(() => {
    let result = monitors;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(q) || m.url?.toLowerCase().includes(q) || m.hostname?.toLowerCase().includes(q) || m.type.toLowerCase().includes(q));
    }
    if (filterStatus === "up") result = result.filter((m) => m.status === 1 && m.active);
    else if (filterStatus === "down") result = result.filter((m) => m.status === 0 && m.active);
    else if (filterStatus === "paused") result = result.filter((m) => !m.active);
    return result;
  }, [monitors, search, filterStatus]);

  // Ungrouped monitors (no parent)
  const ungroupedMonitors = filteredMonitors.filter((m) => !m.parent);

  // Root-level groups (no parent)
  const rootGroups = groups.filter((g) => !g.parent);

  // ── Stats ──
  const stats = useMemo(() => {
    const up = monitors.filter((m) => m.status === 1 && m.active).length;
    const down = monitors.filter((m) => m.status === 0 && m.active).length;
    const paused = monitors.filter((m) => !m.active).length;
    return { total: monitors.length, up, down, paused };
  }, [monitors]);

  const toggleGroup = (id: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedGroups(new Set(groups.map((g) => g.id)));
  };
  const collapseAll = () => setExpandedGroups(new Set());

  return (
    <div className="monitors-page">
      <div style={{ maxWidth: 1600, margin: "0 auto" }}>
        {/* Header */}
        <header className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <a href="/" className="back-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Mapas
            </a>
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.06)" }} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                <h1 style={{ fontSize: 20, fontWeight: 900, color: "#ededed", margin: 0 }}>Monitores</h1>
              </div>
              <div style={{ fontSize: 10, color: "#666", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span className="status-dot" style={{ background: connected ? "#22c55e" : "#ef4444" }} />
                {connected ? "Kuma conectado" : "Kuma desconectado"}
                {!connected && (
                  <button onClick={fetchData} className="reconnect-btn">Reintentar</button>
                )}
                <span style={{ color: "#444" }}>&middot;</span>
                {stats.total} monitores &middot; {groups.length} grupos
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="icon-btn-tooltip">
              <button onClick={handleExport} disabled={exporting} className="icon-btn" style={{ "--btn-color": "#22d3ee" } as React.CSSProperties}>
                {exporting ? <span className="btn-spinner" style={{ width: 14, height: 14 }} /> : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                )}
              </button>
              <span className="icon-btn-tip">Exportar</span>
            </div>
            <div className="icon-btn-tooltip">
              <button onClick={() => importFileRef.current?.click()} disabled={importing} className="icon-btn" style={{ "--btn-color": "#f472b6" } as React.CSSProperties}>
                {importing ? <span className="btn-spinner" style={{ width: 14, height: 14 }} /> : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                )}
              </button>
              <span className="icon-btn-tip">Importar</span>
            </div>
            <input ref={importFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
            <div className="icon-btn-tooltip">
              <button onClick={() => setGroupModal({ open: true })} className="icon-btn" style={{ "--btn-color": "#a78bfa" } as React.CSSProperties}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </button>
              <span className="icon-btn-tip">Nuevo Grupo</span>
            </div>
            <div className="icon-btn-tooltip">
              <button onClick={() => setFormModal({ open: true })} className="icon-btn" style={{ "--btn-color": "#60a5fa" } as React.CSSProperties}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <span className="icon-btn-tip">Nuevo Monitor</span>
            </div>
          </div>
        </header>

        {/* Stats cards */}
        <div className="stats-grid">
          {[
            { label: "Total", value: stats.total, color: "#60a5fa" },
            { label: "Activos", value: stats.up, color: "#22c55e" },
            { label: "Caídos", value: stats.down, color: "#ef4444" },
            { label: "Pausados", value: stats.paused, color: "#f59e0b" },
          ].map((s) => (
            <div key={s.label} className="stat-card" style={{ "--stat-color": s.color } as React.CSSProperties}>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div className="toolbar">
          <div className="search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Buscar monitor, IP, URL..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="filter-pills">
            {[
              { key: "all", label: "Todos", count: stats.total },
              { key: "up", label: "UP", count: stats.up, color: "#22c55e" },
              { key: "down", label: "DOWN", count: stats.down, color: "#ef4444" },
              { key: "paused", label: "Pausados", count: stats.paused, color: "#f59e0b" },
            ].map(({ key, label, count, color }) => (
              <button key={key} onClick={() => setFilterStatus(key)}
                className={`pill ${filterStatus === key ? "active" : ""}`}
                style={filterStatus === key && color ? { "--pill-color": color } as React.CSSProperties : undefined}>
                {label} <span className="pill-count">{count}</span>
              </button>
            ))}
          </div>
          {groups.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              <button onClick={expandAll} className="expand-btn" title="Expandir todos">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <button onClick={collapseAll} className="expand-btn" title="Colapsar todos">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 15 12 9 18 15"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* Skeleton loader */}
        {loading && (
          <div className="skeleton-container">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="skeleton-dot" />
                <div className="skeleton-bar" style={{ width: `${40 + Math.random() * 30}%` }} />
                <div className="skeleton-bar-sm" />
                <div className="skeleton-bar-sm" />
              </div>
            ))}
          </div>
        )}

        {/* Main content */}
        {!loading && (
          <div className="monitor-list">
            {/* Root-level groups (recursive) */}
            {rootGroups.map((g) => (
              <GroupNode key={g.id} group={g} allGroups={groups} allMonitors={monitors}
                heartbeats={heartbeats} expandedGroups={expandedGroups} toggleGroup={toggleGroup}
                filterStatus={filterStatus} search={search} loadingAction={loadingAction}
                onEditGroup={(gr) => setGroupModal({ open: true, group: gr })}
                onDeleteGroup={(gr) => setDeleteModal({ open: true, id: gr.id, name: gr.name, isGroup: true })}
                onEditMonitor={(m) => setFormModal({ open: true, monitor: m })}
                onDeleteMonitor={(m) => setDeleteModal({ open: true, id: m.id, name: m.name, isGroup: false })}
                onTogglePause={handleTogglePause}
                onDragStartMonitor={handleDragStartMonitor}
                onDragEndMonitor={handleDragEndMonitor}
                onDragOver={handleDragOver}
                onDrop={handleDropOnGroup}
                dragOverGroup={dragOverGroup}
                mapMonitorIds={mapMonitorIds} maps={maps}
              />
            ))}

            {/* Ungrouped monitors */}
            {ungroupedMonitors.length > 0 && (
              <div className="group-section"
                style={dragOverGroup === -1 ? { borderColor: "rgba(96,165,250,0.5)", background: "rgba(59,130,246,0.03)" } : undefined}
                onDragOver={(e) => { e.preventDefault(); setDragOverGroup(-1); }}
                onDrop={(e) => handleDropOnGroup(e, null)}>
                {groups.length > 0 && (
                  <div className="group-header" style={{ cursor: "default", opacity: 0.6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#888" }}>Sin grupo</span>
                    <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>{ungroupedMonitors.length}</span>
                  </div>
                )}
                {ungroupedMonitors.map((m) => (
                  <MonitorRow key={m.id} m={m} beats={heartbeats[m.id] || []}
                    loadingAction={loadingAction}
                    onEdit={() => setFormModal({ open: true, monitor: m })}
                    onDelete={() => setDeleteModal({ open: true, id: m.id, name: m.name, isGroup: false })}
                    onToggle={() => handleTogglePause(m.id, m.active)}
                    onDragStart={(e) => handleDragStartMonitor(e, m.id)}
                    onDragEnd={handleDragEndMonitor}
                    mapMonitorIds={mapMonitorIds} maps={maps}
                  />
                ))}
              </div>
            )}

            {filteredMonitors.length === 0 && rootGroups.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: 60, color: "#444" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" style={{ margin: "0 auto 12px" }}>
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{search ? "Sin resultados" : "No hay monitores configurados"}</p>
                <p style={{ fontSize: 12, color: "#333", marginTop: 4 }}>
                  {search ? "Probá con otro término de búsqueda" : "Creá tu primer monitor para empezar a monitorear"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {formModal.open && (
        <MonitorFormModal monitor={formModal.monitor} groups={groups} notifications={notifications}
          onClose={() => setFormModal({ open: false })}
          onSave={formModal.monitor ? handleEditMonitor : handleCreateMonitor} />
      )}
      {groupModal.open && (
        <GroupFormModal group={groupModal.group} groups={groups}
          onClose={() => setGroupModal({ open: false })}
          onSave={groupModal.group ? handleEditGroup : handleCreateGroup} />
      )}
      {deleteModal && (
        <ConfirmModal title={`Eliminar ${deleteModal.isGroup ? "grupo" : "monitor"}`}
          message={`¿Estás seguro de que querés eliminar "${deleteModal.name}"? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete} onClose={() => setDeleteModal(null)} />
      )}

      <ToastContainer toasts={toasts} />

      <style>{`
        .monitors-page {
          min-height: 100vh; background: #0a0a0a; padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .page-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 24px; animation: fadeIn 0.3s ease;
        }
        .back-link {
          display: flex; align-items: center; gap: 4px;
          color: #555; text-decoration: none; font-size: 12px; font-weight: 600;
          transition: color 0.15s;
        }
        .back-link:hover { color: #888; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }
        .icon-btn {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: var(--btn-color); background: color-mix(in srgb, var(--btn-color) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--btn-color) 20%, transparent);
          cursor: pointer; transition: all 0.2s;
        }
        .icon-btn:hover {
          background: color-mix(in srgb, var(--btn-color) 18%, transparent);
          border-color: color-mix(in srgb, var(--btn-color) 40%, transparent);
          transform: translateY(-1px);
        }
        .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .icon-btn-tooltip { position: relative; }
        .icon-btn-tip {
          position: absolute; bottom: -28px; left: 50%; transform: translateX(-50%);
          font-size: 9px; font-weight: 700; color: #ccc; white-space: nowrap;
          padding: 3px 8px; border-radius: 6px;
          background: rgba(0,0,0,0.9); border: 1px solid rgba(255,255,255,0.1);
          opacity: 0; pointer-events: none; transition: opacity 0.15s;
          z-index: 50;
        }
        .icon-btn-tooltip:hover .icon-btn-tip { opacity: 1; }
        .reconnect-btn {
          font-size: 9px; font-weight: 700; color: #60a5fa; cursor: pointer;
          background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2);
          padding: 1px 8px; border-radius: 4px; margin-left: 4px;
          transition: all 0.15s;
        }
        .reconnect-btn:hover { background: rgba(59,130,246,0.2); }
        .skeleton-container { padding: 8px 0; }
        .skeleton-row {
          display: flex; align-items: center; gap: 12px; padding: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          animation: skeletonFade 1.2s ease-in-out infinite;
        }
        .skeleton-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: rgba(255,255,255,0.06);
        }
        .skeleton-bar {
          height: 12px; border-radius: 6px;
          background: rgba(255,255,255,0.04);
        }
        .skeleton-bar-sm {
          width: 50px; height: 10px; border-radius: 5px;
          background: rgba(255,255,255,0.03); margin-left: auto;
        }
        @keyframes skeletonFade {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .stats-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
          margin-bottom: 20px; animation: fadeIn 0.4s ease;
        }
        .stat-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px; padding: 16px;
          border-left: 3px solid var(--stat-color);
          transition: transform 0.2s, border-color 0.2s;
        }
        .stat-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.1); }
        .stat-value { font-size: 28px; font-weight: 900; color: var(--stat-color); font-family: monospace; line-height: 1; }
        .stat-label { font-size: 11px; color: #666; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .toolbar {
          display: flex; align-items: center; gap: 12px; margin-bottom: 16px; animation: fadeIn 0.5s ease;
        }
        .search-box {
          display: flex; align-items: center; gap: 8px; flex: 1; max-width: 340px;
          padding: 7px 12px; border-radius: 10px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          transition: border-color 0.2s;
        }
        .search-box:focus-within { border-color: rgba(59,130,246,0.3); }
        .search-box input { background: none; border: none; outline: none; color: #ededed; font-size: 12px; width: 100%; }
        .search-box input::placeholder { color: #444; }
        .filter-pills { display: flex; gap: 4px; }
        .pill {
          padding: 5px 10px; border-radius: 8px; font-size: 10px; font-weight: 700;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
          color: #555; cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; gap: 4px;
        }
        .pill:hover { background: rgba(255,255,255,0.04); color: #888; }
        .pill.active {
          background: color-mix(in srgb, var(--pill-color, #60a5fa) 10%, transparent);
          border-color: color-mix(in srgb, var(--pill-color, #60a5fa) 25%, transparent);
          color: var(--pill-color, #60a5fa);
        }
        .pill-count { font-size: 9px; padding: 1px 4px; border-radius: 4px; background: rgba(255,255,255,0.05); min-width: 16px; text-align: center; }
        .expand-btn {
          width: 26px; height: 26px; border-radius: 6px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          color: #555; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .expand-btn:hover { background: rgba(255,255,255,0.06); color: #888; }
        .monitor-list { animation: fadeIn 0.6s ease; }
        .group-section {
          margin-bottom: 6px; border-radius: 12px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.04);
          transition: border-color 0.2s, background 0.2s;
        }
        .group-header {
          display: flex; align-items: center; gap: 10px; padding: 12px 14px;
          background: rgba(255,255,255,0.025); cursor: pointer;
          transition: background 0.15s;
        }
        .group-header:hover { background: rgba(255,255,255,0.04); }
        .group-children { }
        .monitor-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          background: rgba(255,255,255,0.01);
          border-top: 1px solid rgba(255,255,255,0.03);
          transition: background 0.15s, opacity 0.3s;
        }
        .monitor-row:hover { background: rgba(255,255,255,0.035); }
        .monitor-row[draggable] { cursor: grab; }
        .monitor-row[draggable]:active { cursor: grabbing; opacity: 0.6; }
        .status-badge {
          font-size: 10px; font-weight: 800; font-family: monospace;
          padding: 3px 8px; border-radius: 6px; min-width: 50px; text-align: center;
          border: 1px solid; letter-spacing: 0.03em;
        }
        .action-btn {
          width: 26px; height: 26px; border-radius: 6px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; opacity: 0.5;
        }
        .action-btn:hover { opacity: 1; background: rgba(255,255,255,0.06); transform: scale(1.1); }
        .action-btn:disabled { cursor: wait; opacity: 0.3; }
        .btn-primary {
          padding: 8px 18px; border-radius: 10px; font-size: 13px; font-weight: 700;
          background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3);
          color: #60a5fa; cursor: pointer; transition: all 0.2s;
        }
        .btn-primary:hover { background: rgba(59,130,246,0.25); transform: translateY(-1px); }
        .btn-primary:disabled { cursor: wait; opacity: 0.6; }
        .btn-secondary {
          padding: 8px 16px; border-radius: 10px; font-size: 13px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          color: #888; cursor: pointer; transition: all 0.15s;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.06); }
        .btn-danger {
          padding: 8px 18px; border-radius: 10px; font-size: 13px; font-weight: 700;
          background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.25);
          color: #f87171; cursor: pointer; transition: all 0.2s;
        }
        .btn-danger:hover { background: rgba(239,68,68,0.2); }
        .btn-danger:disabled { cursor: wait; opacity: 0.6; }
        .btn-spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.15); border-top-color: currentColor;
          border-radius: 50%; animation: spin 0.6s linear infinite;
        }
        .modal-backdrop {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.65); backdrop-filter: blur(12px);
          animation: fadeIn 0.15s ease;
        }
        .modal-content {
          background: #141414; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; max-height: 85vh; overflow: auto; padding: 24px;
          animation: slideUp 0.25s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        }
        .close-btn {
          color: #555; font-size: 22px; background: none; border: none; cursor: pointer;
          width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .close-btn:hover { background: rgba(255,255,255,0.06); color: #aaa; }
        .spinner {
          width: 32px; height: 32px;
          border: 2px solid rgba(59,130,246,0.15); border-top: 2px solid #3b82f6;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 4000px; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        .modal-content::-webkit-scrollbar { width: 6px; }
        .modal-content::-webkit-scrollbar-track { background: transparent; }
        .modal-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        @media (max-width: 900px) { .monitor-row { flex-wrap: wrap; } .stats-grid { grid-template-columns: repeat(2, 1fr); } }
      `}</style>
    </div>
  );
}
