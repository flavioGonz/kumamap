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

// ─── Monitor types ──────────────────────────────────
const MONITOR_TYPES = [
  { value: "http", label: "HTTP(s)", icon: "🌐", fields: ["url", "keyword", "maxretries"] },
  { value: "ping", label: "Ping", icon: "📡", fields: ["hostname"] },
  { value: "port", label: "TCP Port", icon: "🔌", fields: ["hostname", "port"] },
  { value: "dns", label: "DNS", icon: "📛", fields: ["hostname"] },
  { value: "keyword", label: "HTTP Keyword", icon: "🔍", fields: ["url", "keyword"] },
  { value: "push", label: "Push", icon: "📨", fields: [] },
  { value: "steam", label: "Steam", icon: "🎮", fields: ["hostname", "port"] },
  { value: "mqtt", label: "MQTT", icon: "📩", fields: ["hostname", "port"] },
  { value: "docker", label: "Docker", icon: "🐳", fields: ["hostname"] },
  { value: "grpc", label: "gRPC", icon: "⚡", fields: ["url"] },
  { value: "snmp", label: "SNMP", icon: "📊", fields: ["hostname"] },
  { value: "group", label: "Grupo", icon: "📁", fields: [] },
  { value: "json-query", label: "JSON Query", icon: "📋", fields: ["url"] },
  { value: "real-browser", label: "Real Browser", icon: "🖥️", fields: ["url"] },
  { value: "sqlserver", label: "SQL Server", icon: "🗄️", fields: ["hostname", "port"] },
  { value: "postgres", label: "PostgreSQL", icon: "🐘", fields: ["hostname", "port"] },
  { value: "mysql", label: "MySQL", icon: "🐬", fields: ["hostname", "port"] },
  { value: "mongodb", label: "MongoDB", icon: "🍃", fields: ["hostname", "port"] },
  { value: "redis", label: "Redis", icon: "🔴", fields: ["hostname", "port"] },
  { value: "radius", label: "RADIUS", icon: "🛡️", fields: ["hostname", "port"] },
] as const;

type MonitorFieldName = "url" | "hostname" | "port" | "keyword" | "maxretries";

const typeMap = Object.fromEntries(MONITOR_TYPES.map((t) => [t.value, t]));

function getTypeInfo(type: string): { value: string; label: string; icon: string; fields: readonly MonitorFieldName[] } {
  const entry = typeMap[type];
  if (entry) return entry as unknown as { value: string; label: string; icon: string; fields: readonly MonitorFieldName[] };
  return { value: type, label: type, icon: "❓", fields: [] };
}

function statusColor(status?: number) {
  if (status === 1) return "#22c55e";
  if (status === 0) return "#ef4444";
  if (status === 2) return "#f59e0b";
  return "#555";
}

function statusLabel(status?: number, active?: boolean) {
  if (!active) return "Pausado";
  if (status === 1) return "UP";
  if (status === 0) return "DOWN";
  if (status === 2) return "Pendiente";
  return "—";
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
  const [saving, setSaving] = useState(false);

  const typeInfo = getTypeInfo(type);
  const fields = typeInfo.fields || [];

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: name.trim(),
        type,
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
      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#ededed",
    fontSize: 13,
    width: "100%",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4, display: "block" };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "none" as const, cursor: "pointer" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}>
      <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, width: 520, maxHeight: "85vh", overflow: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#ededed" }}>
            {isEdit ? "Editar Monitor" : "Nuevo Monitor"}
          </h2>
          <button onClick={onClose} style={{ color: "#555", fontSize: 20, background: "none", border: "none", cursor: "pointer" }}>&times;</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi servidor" autoFocus />
          </div>

          {/* Type */}
          <div>
            <label style={labelStyle}>Tipo</label>
            <select style={selectStyle} value={type} onChange={(e) => setType(e.target.value)} disabled={isEdit}>
              {MONITOR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>

          {/* URL */}
          {fields.includes("url") && (
            <div>
              <label style={labelStyle}>URL</label>
              <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
            </div>
          )}

          {/* Hostname */}
          {fields.includes("hostname") && (
            <div>
              <label style={labelStyle}>Hostname / IP</label>
              <input style={inputStyle} value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="192.168.1.1" />
            </div>
          )}

          {/* Port */}
          {fields.includes("port") && (
            <div>
              <label style={labelStyle}>Puerto</label>
              <input style={inputStyle} type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="443" />
            </div>
          )}

          {/* Keyword */}
          {fields.includes("keyword") && (
            <div>
              <label style={labelStyle}>Keyword</label>
              <input style={inputStyle} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Texto a buscar en la respuesta" />
            </div>
          )}

          {/* Interval */}
          {type !== "group" && (
            <div>
              <label style={labelStyle}>Intervalo (seg)</label>
              <input style={inputStyle} type="number" value={interval} onChange={(e) => setInterval_(e.target.value)} min="20" max="86400" />
            </div>
          )}

          {/* Max retries */}
          {fields.includes("maxretries") && (
            <div>
              <label style={labelStyle}>Reintentos máximos</label>
              <input style={inputStyle} type="number" value={maxretries} onChange={(e) => setMaxretries(e.target.value)} min="0" max="100" />
            </div>
          )}

          {/* Group */}
          {type !== "group" && groups.length > 0 && (
            <div>
              <label style={labelStyle}>Grupo (opcional)</label>
              <select style={selectStyle} value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">Sin grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label style={labelStyle}>Descripción (opcional)</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas sobre este monitor..." />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()}
            style={{ padding: "8px 20px", borderRadius: 8, background: saving ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: !name.trim() ? 0.4 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Form Modal ────────────────────────────────
function GroupFormModal({
  group,
  onClose,
  onSave,
}: {
  group?: KumaGroup | null;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(group?.name || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}>
      <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, width: 400, padding: 24 }}
        onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#ededed", marginBottom: 16 }}>
          {group ? "Editar Grupo" : "Nuevo Grupo"}
        </h2>
        <label style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4, display: "block" }}>Nombre del grupo *</label>
        <input
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", color: "#ededed", fontSize: 13, width: "100%", outline: "none" }}
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Servidores producción" autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()}
            style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: !name.trim() ? 0.4 : 1 }}>
            {saving ? "Guardando..." : group ? "Guardar" : "Crear Grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ────────────────────────────
function ConfirmModal({
  title,
  message,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}>
      <div style={{ background: "#141414", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 16, width: 400, padding: 24 }}
        onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#f87171", marginBottom: 8 }}>{title}</h2>
        <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={onConfirm}
            style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Eliminar
          </button>
        </div>
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
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [view, setView] = useState<"monitors" | "groups">("monitors");

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

    if (kumaData) {
      setMonitors(kumaData.monitors.filter((m) => m.type !== "group"));
      setConnected(kumaData.connected);
    }
    if (groupData) setGroups(groupData.groups);
    if (configData) setNotifications(configData.notifications || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  // ── CRUD handlers ──
  const handleCreateMonitor = async (data: Record<string, unknown>) => {
    const res = await safeFetch<{ ok: boolean; msg?: string }>(apiUrl("/api/kuma/monitors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res?.ok) {
      setFormModal({ open: false });
      fetchData();
    }
  };

  const handleEditMonitor = async (data: Record<string, unknown>) => {
    if (!formModal.monitor) return;
    const res = await safeFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${formModal.monitor.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res?.ok) {
      setFormModal({ open: false });
      fetchData();
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    const res = await safeFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${deleteModal.id}`), {
      method: "DELETE",
    });
    if (res?.ok) {
      setDeleteModal(null);
      fetchData();
    }
  };

  const handleTogglePause = async (id: number, currentActive: boolean) => {
    await safeFetch(apiUrl(`/api/kuma/monitors/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: currentActive ? "pause" : "resume" }),
    });
    fetchData();
  };

  const handleCreateGroup = async (name: string) => {
    const res = await safeFetch<{ ok: boolean }>(apiUrl("/api/kuma/groups"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res?.ok) {
      setGroupModal({ open: false });
      fetchData();
    }
  };

  const handleEditGroup = async (name: string) => {
    if (!groupModal.group) return;
    const res = await safeFetch<{ ok: boolean }>(apiUrl(`/api/kuma/monitors/${groupModal.group.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: "group" }),
    });
    if (res?.ok) {
      setGroupModal({ open: false });
      fetchData();
    }
  };

  // ── Filtered & sorted ──
  const filtered = useMemo(() => {
    let result = monitors;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.url?.toLowerCase().includes(q) ||
        m.hostname?.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q)
      );
    }
    if (filterGroup !== "all") {
      const gid = parseInt(filterGroup);
      result = result.filter((m) => m.parent === gid);
    }
    if (filterStatus === "up") result = result.filter((m) => m.status === 1 && m.active);
    else if (filterStatus === "down") result = result.filter((m) => m.status === 0 && m.active);
    else if (filterStatus === "paused") result = result.filter((m) => !m.active);
    return result;
  }, [monitors, search, filterGroup, filterStatus]);

  // ── Stats ──
  const stats = useMemo(() => {
    const up = monitors.filter((m) => m.status === 1 && m.active).length;
    const down = monitors.filter((m) => m.status === 0 && m.active).length;
    const paused = monitors.filter((m) => !m.active).length;
    return { total: monitors.length, up, down, paused };
  }, [monitors]);

  // ── Header button style ──
  const hBtn = (color: string, hoverBg: string) => ({
    display: "flex" as const, alignItems: "center" as const, gap: 6,
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700 as const,
    color, border: `1px solid ${color}33`, background: `${color}15`, cursor: "pointer" as const,
    transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/" style={{ color: "#555", textDecoration: "none", fontSize: 13 }}>← Mapas</a>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#ededed", margin: 0 }}>Monitores</h1>
              <div style={{ fontSize: 10, color: "#737373", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444", boxShadow: `0 0 6px ${connected ? "#22c55e" : "#ef4444"}` }} />
                {connected ? "Kuma conectado" : "Kuma desconectado"}
                <span style={{ color: "#555" }}>&middot;</span>
                {stats.total} monitor{stats.total !== 1 ? "es" : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setGroupModal({ open: true })} style={hBtn("#a78bfa", "rgba(167,139,250,0.15)")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
              Nuevo Grupo
            </button>
            <button onClick={() => setFormModal({ open: true })} style={hBtn("#60a5fa", "rgba(59,130,246,0.15)")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Nuevo Monitor
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total", value: stats.total, color: "#60a5fa" },
            { label: "UP", value: stats.up, color: "#22c55e" },
            { label: "DOWN", value: stats.down, color: "#ef4444" },
            { label: "Pausados", value: stats.paused, color: "#f59e0b" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}15`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: s.color, fontFamily: "monospace" }}>
                {s.value}
              </div>
              <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Tab bar + filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {/* Tab: Monitors / Groups */}
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 2, border: "1px solid rgba(255,255,255,0.04)" }}>
            {[
              { key: "monitors" as const, label: "Monitores" },
              { key: "groups" as const, label: "Grupos" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setView(key)}
                style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                  background: view === key ? "rgba(59,130,246,0.12)" : "transparent",
                  color: view === key ? "#60a5fa" : "#666",
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#ededed", fontSize: 12, outline: "none" }}
              placeholder="Buscar monitor..." value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status filter */}
          {view === "monitors" && (
            <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 2, border: "1px solid rgba(255,255,255,0.04)" }}>
              {[
                { key: "all", label: "Todos" },
                { key: "up", label: "UP" },
                { key: "down", label: "DOWN" },
                { key: "paused", label: "Pausados" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFilterStatus(key)}
                  style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none",
                    background: filterStatus === key ? "rgba(59,130,246,0.12)" : "transparent",
                    color: filterStatus === key ? "#60a5fa" : "#666",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Group filter */}
          {view === "monitors" && groups.length > 0 && (
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#aaa", fontSize: 11, outline: "none", cursor: "pointer" }}
            >
              <option value="all">Todos los grupos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <div style={{ width: 32, height: 32, border: "2px solid rgba(59,130,246,0.2)", borderTop: "2px solid #3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {/* Monitor list */}
        {!loading && view === "monitors" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>
                {search ? "Sin resultados" : "No hay monitores configurados"}
              </div>
            )}
            {filtered.map((m) => {
              const ti = getTypeInfo(m.type);
              const groupName = groups.find((g) => g.id === m.parent)?.name;
              return (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 10, transition: "all 0.15s", cursor: "default",
                }}>
                  {/* Status dot */}
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(m.active ? m.status : undefined), boxShadow: `0 0 6px ${statusColor(m.active ? m.status : undefined)}`, flexShrink: 0, opacity: m.active ? 1 : 0.4 }} />

                  {/* Type icon */}
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{ti.icon}</span>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ededed", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: "#666", display: "flex", gap: 8, marginTop: 2 }}>
                      <span>{ti.label}</span>
                      {m.url && <span style={{ color: "#555" }}>{m.url.length > 40 ? m.url.slice(0, 40) + "..." : m.url}</span>}
                      {m.hostname && <span style={{ color: "#555" }}>{m.hostname}{m.port ? `:${m.port}` : ""}</span>}
                      {groupName && <span style={{ color: "#a78bfa" }}>📁 {groupName}</span>}
                    </div>
                  </div>

                  {/* Status label */}
                  <div style={{ fontSize: 10, fontWeight: 800, color: statusColor(m.active ? m.status : undefined), fontFamily: "monospace", minWidth: 50, textAlign: "center", opacity: m.active ? 1 : 0.5 }}>
                    {statusLabel(m.status, m.active)}
                  </div>

                  {/* Ping */}
                  {m.ping != null && m.active && (
                    <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", minWidth: 50, textAlign: "right" }}>
                      {m.ping}ms
                    </div>
                  )}

                  {/* Uptime */}
                  {m.uptime24 != null && m.active && (
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: (m.uptime24 || 0) >= 99.9 ? "#22c55e" : (m.uptime24 || 0) >= 95 ? "#f59e0b" : "#ef4444", minWidth: 45, textAlign: "right" }}>
                      {(m.uptime24 * 100).toFixed(1)}%
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => handleTogglePause(m.id, m.active)} title={m.active ? "Pausar" : "Reanudar"}
                      style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: m.active ? "#f59e0b" : "#22c55e", fontSize: 12 }}>
                      {m.active ? "⏸" : "▶"}
                    </button>
                    <button onClick={() => setFormModal({ open: true, monitor: m })} title="Editar"
                      style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#60a5fa", fontSize: 12 }}>
                      ✏️
                    </button>
                    <button onClick={() => setDeleteModal({ open: true, id: m.id, name: m.name, isGroup: false })} title="Eliminar"
                      style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: 12 }}>
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Groups list */}
        {!loading && view === "groups" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {groups.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>No hay grupos configurados</div>
            )}
            {groups.map((g) => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10,
              }}>
                <span style={{ fontSize: 18 }}>📁</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ededed" }}>{g.name}</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{g.childCount} monitor{g.childCount !== 1 ? "es" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setGroupModal({ open: true, group: g })} title="Editar grupo"
                    style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#60a5fa", fontSize: 12 }}>
                    ✏️
                  </button>
                  <button onClick={() => setDeleteModal({ open: true, id: g.id, name: g.name, isGroup: true })} title="Eliminar grupo"
                    style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: 12 }}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {formModal.open && (
        <MonitorFormModal
          monitor={formModal.monitor}
          groups={groups}
          notifications={notifications}
          onClose={() => setFormModal({ open: false })}
          onSave={formModal.monitor ? handleEditMonitor : handleCreateMonitor}
        />
      )}
      {groupModal.open && (
        <GroupFormModal
          group={groupModal.group}
          onClose={() => setGroupModal({ open: false })}
          onSave={groupModal.group ? handleEditGroup : handleCreateGroup}
        />
      )}
      {deleteModal && (
        <ConfirmModal
          title={`Eliminar ${deleteModal.isGroup ? "grupo" : "monitor"}`}
          message={`¿Estás seguro de que querés eliminar "${deleteModal.name}"? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onClose={() => setDeleteModal(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
