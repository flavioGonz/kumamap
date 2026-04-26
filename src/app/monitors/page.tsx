"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { safeFetch } from "@/lib/error-handler";

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
  childCount: number;
}

interface Notification {
  id: number;
  name: string;
  type: string;
}

// ─── Monitor type definitions with descriptions ─────
const MONITOR_TYPES: {
  value: string; label: string; icon: string;
  fields: string[]; desc: string; descLong: string;
}[] = [
  { value: "http", label: "HTTP(s)", icon: "🌐",
    fields: ["url", "keyword", "maxretries"],
    desc: "Verifica sitios web",
    descLong: "Realiza una solicitud HTTP/HTTPS al URL especificado y verifica que responda correctamente (código 2xx). Ideal para monitorear sitios web, APIs REST y servicios web." },
  { value: "ping", label: "Ping (ICMP)", icon: "📡",
    fields: ["hostname"],
    desc: "Comprueba conectividad",
    descLong: "Envía paquetes ICMP (ping) al host para verificar que está encendido y accesible en la red. El tipo más básico de monitoreo — si el ping falla, el equipo está apagado o desconectado." },
  { value: "port", label: "TCP Port", icon: "🔌",
    fields: ["hostname", "port"],
    desc: "Verifica puerto abierto",
    descLong: "Intenta una conexión TCP al puerto especificado. Útil para verificar que un servicio está escuchando (ej: SSH en 22, HTTP en 80, RTSP en 554, base de datos en 5432)." },
  { value: "dns", label: "DNS", icon: "📛",
    fields: ["hostname"],
    desc: "Resuelve nombres de dominio",
    descLong: "Verifica que un nombre de dominio resuelve correctamente a una dirección IP. Detecta problemas de DNS que pueden afectar la accesibilidad de servicios." },
  { value: "keyword", label: "HTTP + Keyword", icon: "🔍",
    fields: ["url", "keyword"],
    desc: "Busca texto en página web",
    descLong: "Igual que HTTP, pero además verifica que la respuesta contenga un texto específico. Detecta cuando una página carga pero muestra un error o contenido incorrecto." },
  { value: "push", label: "Push", icon: "📨",
    fields: [],
    desc: "El servicio reporta a Kuma",
    descLong: "Modelo inverso: tu aplicación o script envía un heartbeat periódico a Uptime Kuma. Si Kuma deja de recibir heartbeats, marca el servicio como DOWN. Ideal para cron jobs y tareas programadas." },
  { value: "steam", label: "Steam Game", icon: "🎮",
    fields: ["hostname", "port"],
    desc: "Servidores de juegos Steam",
    descLong: "Monitorea servidores de juegos que usan el protocolo Steam Query. Verifica que el servidor de juego está online y respondiendo." },
  { value: "mqtt", label: "MQTT", icon: "📩",
    fields: ["hostname", "port"],
    desc: "Broker de mensajería IoT",
    descLong: "Verifica conectividad a un broker MQTT. Protocolo común en IoT y domótica para comunicación entre dispositivos." },
  { value: "docker", label: "Docker", icon: "🐳",
    fields: ["hostname"],
    desc: "Contenedores Docker",
    descLong: "Monitorea el estado de contenedores Docker, verificando que estén corriendo y saludables." },
  { value: "grpc", label: "gRPC", icon: "⚡",
    fields: ["url"],
    desc: "Servicios gRPC",
    descLong: "Verifica servicios que usan el protocolo gRPC (Remote Procedure Call). Común en arquitecturas de microservicios." },
  { value: "snmp", label: "SNMP", icon: "📊",
    fields: ["hostname"],
    desc: "Equipos de red (SNMP)",
    descLong: "Consulta equipos de red vía SNMP para obtener métricas como uso de CPU, memoria, interfaces, tráfico. Ideal para switches, routers y servidores." },
  { value: "group", label: "Grupo", icon: "📁",
    fields: [],
    desc: "Agrupa monitores",
    descLong: "No monitorea nada directamente. Es un contenedor para organizar otros monitores. Su estado refleja el peor estado de sus hijos." },
  { value: "json-query", label: "JSON Query", icon: "📋",
    fields: ["url"],
    desc: "Consulta valores en APIs JSON",
    descLong: "Obtiene una respuesta JSON de un URL y evalúa una expresión JSONPath. Útil para verificar valores específicos devueltos por APIs." },
  { value: "real-browser", label: "Real Browser", icon: "🖥️",
    fields: ["url"],
    desc: "Navegador real (Chromium)",
    descLong: "Usa un navegador Chromium real para cargar la página. Detecta errores de JavaScript, timeouts de carga y problemas que solo se ven en un navegador completo." },
  { value: "sqlserver", label: "SQL Server", icon: "🗄️",
    fields: ["hostname", "port"],
    desc: "Microsoft SQL Server",
    descLong: "Verifica conectividad a una instancia de SQL Server ejecutando una consulta de prueba." },
  { value: "postgres", label: "PostgreSQL", icon: "🐘",
    fields: ["hostname", "port"],
    desc: "Base de datos PostgreSQL",
    descLong: "Conecta a PostgreSQL y ejecuta una consulta de prueba para verificar que la base de datos responde." },
  { value: "mysql", label: "MySQL/MariaDB", icon: "🐬",
    fields: ["hostname", "port"],
    desc: "Base de datos MySQL",
    descLong: "Verifica conectividad a MySQL o MariaDB ejecutando una consulta de prueba." },
  { value: "mongodb", label: "MongoDB", icon: "🍃",
    fields: ["hostname", "port"],
    desc: "Base de datos MongoDB",
    descLong: "Verifica conectividad a una instancia de MongoDB." },
  { value: "redis", label: "Redis", icon: "🔴",
    fields: ["hostname", "port"],
    desc: "Cache/broker Redis",
    descLong: "Verifica que Redis está respondiendo mediante un comando PING." },
  { value: "radius", label: "RADIUS", icon: "🛡️",
    fields: ["hostname", "port"],
    desc: "Servidor RADIUS",
    descLong: "Verifica conectividad a un servidor RADIUS usado para autenticación de red (802.1x, VPN, WiFi empresarial)." },
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
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 10,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          color: selected ? "#ededed" : "#666", fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
          transition: "border-color 0.2s",
          ...(open ? { borderColor: "rgba(59,130,246,0.4)" } : {}),
        }}
      >
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
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                width: "100%", padding: "9px 12px", display: "flex", alignItems: "center", gap: 8,
                background: o.value === value ? "rgba(59,130,246,0.12)" : "transparent",
                border: "none", color: o.value === value ? "#60a5fa" : "#ccc", fontSize: 13,
                cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
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
function MonitorFormModal({
  monitor,
  groups,
  notifications,
  onClose,
  onSave,
}: {
  monitor?: KumaMonitor | null;
  groups: KumaGroup[];
  notifications: Notification[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
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

  const typeInfo = getTypeInfo(type);
  const fields = typeInfo.fields || [];

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: name.trim(), type,
        interval: parseInt(interval) || 60,
        description: description.trim(),
      };
      if (fields.includes("url") && url) data.url = url;
      if (fields.includes("hostname") && hostname) data.hostname = hostname;
      if (fields.includes("port") && port) data.port = parseInt(port);
      if (fields.includes("keyword") && keyword) data.keyword = keyword;
      if (fields.includes("maxretries")) data.maxretries = parseInt(maxretries) || 1;
      if (parent) data.parent = parseInt(parent);
      else data.parent = null;
      // Notifications
      const activeNotifs = Object.entries(selectedNotifs).filter(([, v]) => v);
      if (activeNotifs.length > 0) data.notificationIDList = selectedNotifs;
      await onSave(data);
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "#ededed", margin: 0 }}>
            {isEdit ? "Editar Monitor" : "Nuevo Monitor"}
          </h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div>
            <label style={lStyle}>Nombre *</label>
            <input style={iStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi servidor"
              autoFocus onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
          </div>

          {/* Type selector */}
          <div>
            <label style={lStyle}>Tipo de monitor</label>
            <DarkSelect
              value={type}
              onChange={(v) => setType(v)}
              options={MONITOR_TYPES.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))}
            />
            {/* Type description card */}
            <div style={{
              marginTop: 8, padding: "10px 12px", borderRadius: 8,
              background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)",
              fontSize: 11, color: "#8ab4f8", lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 700 }}>{typeInfo.icon} {typeInfo.label}:</span> {typeInfo.descLong}
            </div>
          </div>

          {/* Dynamic fields */}
          {fields.includes("url") && (
            <div>
              <label style={lStyle}>URL</label>
              <input style={iStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
            </div>
          )}
          {fields.includes("hostname") && (
            <div>
              <label style={lStyle}>Hostname / IP</label>
              <input style={iStyle} value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="192.168.1.1"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
            </div>
          )}
          {fields.includes("port") && (
            <div>
              <label style={lStyle}>Puerto</label>
              <input style={iStyle} type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="443"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
            </div>
          )}
          {fields.includes("keyword") && (
            <div>
              <label style={lStyle}>Keyword (texto a buscar)</label>
              <input style={iStyle} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="OK"
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
            </div>
          )}

          {/* Interval + Retries row */}
          {type !== "group" && (
            <div style={{ display: "grid", gridTemplateColumns: fields.includes("maxretries") ? "1fr 1fr" : "1fr", gap: 12 }}>
              <div>
                <label style={lStyle}>Intervalo (seg)</label>
                <input style={iStyle} type="number" value={interval} onChange={(e) => setInterval_(e.target.value)} min="20" max="86400"
                  onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
              </div>
              {fields.includes("maxretries") && (
                <div>
                  <label style={lStyle}>Reintentos</label>
                  <input style={iStyle} type="number" value={maxretries} onChange={(e) => setMaxretries(e.target.value)} min="0" max="100"
                    onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
                    onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
                </div>
              )}
            </div>
          )}

          {/* Group */}
          {type !== "group" && groups.length > 0 && (
            <div>
              <label style={lStyle}>Grupo</label>
              <DarkSelect
                value={parent}
                onChange={(v) => setParent(v)}
                placeholder="Sin grupo"
                options={[{ value: "", label: "Sin grupo" }, ...groups.map((g) => ({ value: String(g.id), label: g.name, icon: "📁" }))]}
              />
            </div>
          )}

          {/* Notifications */}
          {notifications.length > 0 && type !== "group" && (
            <div>
              <label style={lStyle}>Notificaciones</label>
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 6,
                padding: 10, borderRadius: 10,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                {notifications.map((n) => {
                  const active = !!selectedNotifs[String(n.id)];
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => toggleNotif(n.id)}
                      style={{
                        padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                        background: active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`,
                        color: active ? "#4ade80" : "#777",
                        transition: "all 0.15s",
                      }}
                    >
                      {active ? "✓ " : ""}{n.name}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
                Seleccioná los canales que recibirán alertas cuando este monitor cambie de estado.
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <label style={lStyle}>Descripción</label>
            <textarea style={{ ...iStyle, minHeight: 56, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas sobre este monitor..."
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()} className="btn-primary" style={{ opacity: !name.trim() ? 0.4 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear monitor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Form Modal ────────────────────────────────
function GroupFormModal({ group, onClose, onSave }: {
  group?: KumaGroup | null; onClose: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(group?.name || "");
  const [saving, setSaving] = useState(false);
  const handleSubmit = async () => { if (!name.trim()) return; setSaving(true); try { await onSave(name.trim()); } finally { setSaving(false); } };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#ededed", marginBottom: 16, margin: 0 }}>
          {group ? "Editar Grupo" : "Nuevo Grupo"}
        </h2>
        <label style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 5, display: "block" }}>Nombre *</label>
        <input
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 12px", color: "#ededed", fontSize: 13, width: "100%", outline: "none" }}
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Servidores producción" autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <p style={{ fontSize: 10, color: "#555", marginTop: 6 }}>
          Los grupos organizan tus monitores. El estado del grupo refleja el peor estado de sus hijos.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()} className="btn-primary" style={{ opacity: !name.trim() ? 0.4 : 1 }}>
            {saving ? "Guardando..." : group ? "Guardar" : "Crear grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ────────────────────────────
function ConfirmModal({ title, message, onConfirm, onClose }: { title: string; message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 420, borderColor: "rgba(239,68,68,0.15)" }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#f87171", marginBottom: 8, margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={onConfirm} className="btn-danger">Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Monitor Row ─────────────────────────────────────
function MonitorRow({ m, groupName, onEdit, onDelete, onToggle }: {
  m: KumaMonitor; groupName?: string;
  onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) {
  const ti = getTypeInfo(m.type);
  const sc = statusColor(m.active ? m.status : undefined);

  return (
    <div className="monitor-row">
      {/* Status indicator */}
      <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: sc, opacity: m.active ? 1 : 0.3, transition: "background 0.3s" }} />

      {/* Status dot with pulse */}
      <div style={{ position: "relative", width: 10, height: 10, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: sc, opacity: m.active ? 1 : 0.3 }} />
        {m.active && m.status === 0 && <div style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `2px solid ${sc}`, animation: "pulse-ring 1.5s infinite" }} />}
      </div>

      {/* Type icon */}
      <span style={{ fontSize: 18, flexShrink: 0, opacity: m.active ? 1 : 0.4 }}>{ti.icon}</span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: m.active ? "#ededed" : "#777", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {m.name}
        </div>
        <div style={{ fontSize: 10, color: "#555", display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
          <span style={{ color: "#666" }}>{ti.label}</span>
          {m.url && <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.url}</span>}
          {m.hostname && <span>{m.hostname}{m.port ? `:${m.port}` : ""}</span>}
          {groupName && <span style={{ color: "#a78bfa" }}>📁 {groupName}</span>}
        </div>
      </div>

      {/* Status badge */}
      <div className="status-badge" style={{ background: `${sc}15`, borderColor: `${sc}30`, color: sc, opacity: m.active ? 1 : 0.5 }}>
        {statusLabel(m.status, m.active)}
      </div>

      {/* Ping */}
      <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", minWidth: 48, textAlign: "right" }}>
        {m.ping != null && m.active ? `${m.ping}ms` : "—"}
      </div>

      {/* Uptime */}
      <div style={{ fontSize: 10, fontFamily: "monospace", minWidth: 48, textAlign: "right",
        color: !m.active ? "#444" : (m.uptime24 || 0) >= 0.999 ? "#22c55e" : (m.uptime24 || 0) >= 0.95 ? "#f59e0b" : "#ef4444" }}>
        {m.uptime24 != null && m.active ? `${(m.uptime24 * 100).toFixed(1)}%` : "—"}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        <button onClick={onToggle} title={m.active ? "Pausar" : "Reanudar"} className="action-btn"
          style={{ color: m.active ? "#f59e0b" : "#22c55e" }}>
          {m.active
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

// ─── Main Page ──────────────────────────────────────
export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [groups, setGroups] = useState<KumaGroup[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // Modals
  const [formModal, setFormModal] = useState<{ open: boolean; monitor?: KumaMonitor | null }>({ open: false });
  const [groupModal, setGroupModal] = useState<{ open: boolean; group?: KumaGroup | null }>({ open: false });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; id: number; name: string; isGroup: boolean } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchData = useCallback(async () => {
    const [kumaData, groupData, configData] = await Promise.all([
      safeFetch<{ connected: boolean; monitors: KumaMonitor[] }>(apiUrl("/api/kuma")),
      safeFetch<{ groups: KumaGroup[] }>(apiUrl("/api/kuma/groups")),
      safeFetch<{ notifications: Notification[] }>(apiUrl("/api/kuma/config")),
    ]);
    if (kumaData) { setMonitors(kumaData.monitors.filter((m) => m.type !== "group")); setConnected(kumaData.connected); }
    if (groupData) setGroups(groupData.groups);
    if (configData) setNotifications(configData.notifications || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  // Auto-expand all groups on first load
  useEffect(() => {
    if (groups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set(groups.map((g) => g.id)));
    }
  }, [groups]);

  // ── CRUD handlers ──
  const handleCreateMonitor = async (data: Record<string, unknown>) => {
    const res = await safeFetch<{ ok: boolean }>(apiUrl("/api/kuma/monitors"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res?.ok) { setFormModal({ open: false }); fetchData(); }
  };
  const handleEditMonitor = async (data: Record<string, unknown>) => {
    if (!formModal.monitor) return;
    const res = await safeFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${formModal.monitor.id}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res?.ok) { setFormModal({ open: false }); fetchData(); }
  };
  const handleDelete = async () => {
    if (!deleteModal) return;
    const res = await safeFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${deleteModal.id}`), { method: "DELETE" });
    if (res?.ok) { setDeleteModal(null); fetchData(); }
  };
  const handleTogglePause = async (id: number, currentActive: boolean) => {
    await safeFetch(apiUrl(`/api/kuma/monitors/${id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: currentActive ? "pause" : "resume" }) });
    fetchData();
  };
  const handleCreateGroup = async (name: string) => {
    const res = await safeFetch<{ ok: boolean }>(apiUrl("/api/kuma/groups"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (res?.ok) { setGroupModal({ open: false }); fetchData(); }
  };
  const handleEditGroup = async (name: string) => {
    if (!groupModal.group) return;
    const res = await safeFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${groupModal.group.id}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type: "group" }) });
    if (res?.ok) { setGroupModal({ open: false }); fetchData(); }
  };

  // ── Filtered monitors ──
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

  // ── Group hierarchy ──
  const groupedMonitors = useMemo(() => {
    const byGroup: Record<number, KumaMonitor[]> = {};
    const ungrouped: KumaMonitor[] = [];
    filteredMonitors.forEach((m) => {
      if (m.parent) { if (!byGroup[m.parent]) byGroup[m.parent] = []; byGroup[m.parent].push(m); }
      else ungrouped.push(m);
    });
    return { byGroup, ungrouped };
  }, [filteredMonitors]);

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

  // Group status computed from children
  const groupStatus = (gid: number) => {
    const children = monitors.filter((m) => m.parent === gid);
    if (children.length === 0) return { color: "#555", label: "EMPTY" };
    const anyDown = children.some((m) => m.status === 0 && m.active);
    const allUp = children.every((m) => m.status === 1 && m.active);
    if (anyDown) return { color: "#ef4444", label: "DOWN" };
    if (allUp) return { color: "#22c55e", label: "UP" };
    return { color: "#f59e0b", label: "PARTIAL" };
  };

  return (
    <div className="monitors-page">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
                <span style={{ color: "#444" }}>&middot;</span>
                {stats.total} monitores &middot; {groups.length} grupos
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setGroupModal({ open: true })} className="header-btn" style={{ "--btn-color": "#a78bfa" } as React.CSSProperties}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Nuevo Grupo
            </button>
            <button onClick={() => setFormModal({ open: true })} className="header-btn" style={{ "--btn-color": "#60a5fa" } as React.CSSProperties}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo Monitor
            </button>
          </div>
        </header>

        {/* Stats cards */}
        <div className="stats-grid">
          {[
            { label: "Total", value: stats.total, color: "#60a5fa", icon: "📊" },
            { label: "Activos", value: stats.up, color: "#22c55e", icon: "✓" },
            { label: "Caídos", value: stats.down, color: "#ef4444", icon: "✕" },
            { label: "Pausados", value: stats.paused, color: "#f59e0b", icon: "⏸" },
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
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
            <div className="spinner" />
          </div>
        )}

        {/* Main content: hierarchical group view */}
        {!loading && (
          <div className="monitor-list">
            {/* Groups with children */}
            {groups.map((g) => {
              const children = groupedMonitors.byGroup[g.id] || [];
              const gs = groupStatus(g.id);
              const expanded = expandedGroups.has(g.id);
              const allChildren = monitors.filter((m) => m.parent === g.id);

              return (
                <div key={g.id} className="group-section">
                  {/* Group header */}
                  <div className="group-header" onClick={() => toggleGroup(g.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"
                      style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: gs.color, boxShadow: `0 0 6px ${gs.color}` }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#ededed", flex: 1 }}>
                      📁 {g.name}
                    </span>
                    <span className="status-badge" style={{ background: `${gs.color}15`, borderColor: `${gs.color}30`, color: gs.color, fontSize: 9 }}>
                      {gs.label}
                    </span>
                    <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>
                      {allChildren.filter((c) => c.status === 1 && c.active).length}/{allChildren.length}
                    </span>
                    <div style={{ display: "flex", gap: 3 }}>
                      <button onClick={(e) => { e.stopPropagation(); setGroupModal({ open: true, group: g }); }} className="action-btn" style={{ color: "#60a5fa" }} title="Editar grupo">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteModal({ open: true, id: g.id, name: g.name, isGroup: true }); }} className="action-btn" style={{ color: "#ef4444" }} title="Eliminar grupo">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                  {/* Group children */}
                  {expanded && (
                    <div className="group-children">
                      {children.length === 0 && (
                        <div style={{ padding: "12px 16px 12px 40px", fontSize: 12, color: "#444", fontStyle: "italic" }}>
                          {search ? "Sin resultados en este grupo" : "Grupo vacío — arrastrá monitores aquí"}
                        </div>
                      )}
                      {children.map((m) => (
                        <MonitorRow key={m.id} m={m} groupName={undefined}
                          onEdit={() => setFormModal({ open: true, monitor: m })}
                          onDelete={() => setDeleteModal({ open: true, id: m.id, name: m.name, isGroup: false })}
                          onToggle={() => handleTogglePause(m.id, m.active)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped monitors */}
            {groupedMonitors.ungrouped.length > 0 && (
              <div className="group-section">
                {groups.length > 0 && (
                  <div className="group-header" style={{ cursor: "default", opacity: 0.6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#888" }}>Sin grupo</span>
                    <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>{groupedMonitors.ungrouped.length}</span>
                  </div>
                )}
                {groupedMonitors.ungrouped.map((m) => (
                  <MonitorRow key={m.id} m={m}
                    onEdit={() => setFormModal({ open: true, monitor: m })}
                    onDelete={() => setDeleteModal({ open: true, id: m.id, name: m.name, isGroup: false })}
                    onToggle={() => handleTogglePause(m.id, m.active)}
                  />
                ))}
              </div>
            )}

            {filteredMonitors.length === 0 && !loading && (
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
        <GroupFormModal group={groupModal.group} onClose={() => setGroupModal({ open: false })}
          onSave={groupModal.group ? handleEditGroup : handleCreateGroup} />
      )}
      {deleteModal && (
        <ConfirmModal title={`Eliminar ${deleteModal.isGroup ? "grupo" : "monitor"}`}
          message={`¿Estás seguro de que querés eliminar "${deleteModal.name}"? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete} onClose={() => setDeleteModal(null)} />
      )}

      <style>{`
        .monitors-page {
          min-height: 100vh; background: #0a0a0a; padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* Header */
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
        .status-dot {
          width: 6px; height: 6px; border-radius: 50%;
          box-shadow: 0 0 6px currentColor;
        }
        .header-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 10; font-size: 12px; font-weight: 700;
          color: var(--btn-color); background: color-mix(in srgb, var(--btn-color) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--btn-color) 20%, transparent);
          cursor: pointer; transition: all 0.2s;
        }
        .header-btn:hover {
          background: color-mix(in srgb, var(--btn-color) 15%, transparent);
          border-color: color-mix(in srgb, var(--btn-color) 35%, transparent);
          transform: translateY(-1px);
        }

        /* Stats */
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
        .stat-value {
          font-size: 28px; font-weight: 900; color: var(--stat-color);
          font-family: monospace; line-height: 1;
        }
        .stat-label { font-size: 11px; color: #666; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

        /* Toolbar */
        .toolbar {
          display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
          animation: fadeIn 0.5s ease;
        }
        .search-box {
          display: flex; align-items: center; gap: 8px; flex: 1; max-width: 340px;
          padding: 7px 12px; border-radius: 10px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          transition: border-color 0.2s;
        }
        .search-box:focus-within { border-color: rgba(59,130,246,0.3); }
        .search-box input {
          background: none; border: none; outline: none; color: #ededed;
          font-size: 12px; width: 100%;
        }
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
        .pill-count {
          font-size: 9px; padding: 1px 4px; border-radius: 4px;
          background: rgba(255,255,255,0.05); min-width: 16px; text-align: center;
        }

        /* Monitor list */
        .monitor-list { animation: fadeIn 0.6s ease; }
        .group-section {
          margin-bottom: 6px; border-radius: 12px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.04);
        }
        .group-header {
          display: flex; align-items: center; gap: 10px; padding: 12px 14px;
          background: rgba(255,255,255,0.025); cursor: pointer;
          transition: background 0.15s;
        }
        .group-header:hover { background: rgba(255,255,255,0.04); }
        .group-children { }

        /* Monitor row */
        .monitor-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          background: rgba(255,255,255,0.01);
          border-top: 1px solid rgba(255,255,255,0.03);
          transition: background 0.15s;
        }
        .monitor-row:hover { background: rgba(255,255,255,0.035); }

        /* Status badge */
        .status-badge {
          font-size: 10px; font-weight: 800; font-family: monospace;
          padding: 3px 8px; border-radius: 6px; min-width: 50px; text-align: center;
          border: 1px solid; letter-spacing: 0.03em;
        }

        /* Action buttons */
        .action-btn {
          width: 26px; height: 26px; border-radius: 6px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; opacity: 0.5;
        }
        .action-btn:hover { opacity: 1; background: rgba(255,255,255,0.06); transform: scale(1.1); }

        /* Buttons */
        .btn-primary {
          padding: 8px 18px; border-radius: 10px; font-size: 13px; font-weight: 700;
          background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3);
          color: #60a5fa; cursor: pointer; transition: all 0.2s;
        }
        .btn-primary:hover { background: rgba(59,130,246,0.25); transform: translateY(-1px); }
        .btn-primary:disabled { cursor: wait; }
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

        /* Modal */
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

        /* Spinner */
        .spinner {
          width: 32px; height: 32px;
          border: 2px solid rgba(59,130,246,0.15);
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* Animations */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2); opacity: 0; } }

        /* Scrollbar */
        .modal-content::-webkit-scrollbar { width: 6px; }
        .modal-content::-webkit-scrollbar-track { background: transparent; }
        .modal-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

        /* Select dropdown scrollbar */
        div[style*="overflowY: auto"]::-webkit-scrollbar { width: 4px; }
        div[style*="overflowY: auto"]::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
