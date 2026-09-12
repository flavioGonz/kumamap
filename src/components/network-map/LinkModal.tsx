"use client";

/**
 * Editar una conexion del mapa.
 *
 * Dos columnas a proposito: a la izquierda lo que describe el cable (puertos,
 * etiqueta, de donde sale el trafico), y a la derecha un explorador SNMP del equipo.
 *
 * El explorador no muestra un arbol de OIDs: pregunta al equipo y traduce lo que
 * encuentra a sensores con nombre ("ether1_Uplink — trafico de entrada"). De ahi se
 * elige uno, se le da una carpeta, y se crea el monitor en Uptime Kuma sin salir de
 * esta ventana. El OID queda a la vista para el que lo quiera verificar.
 *
 * La pestana MikroTik se retiro: pedia usuario y contrasena del router para hacer por
 * API lo mismo que SNMP hace sin credenciales de administrador.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Link2, Cable, ArrowRight, X, Plug, Tag, Network, Check, Activity, Search,
  ChevronDown, Radar, Loader2, FolderTree, AlertCircle, Plus,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

type TrafficSource = "none" | "snmp";

export interface LinkFormData {
  sourceInterface: string;
  targetInterface: string;
  label: string;
  snmpMonitorId?: number | null;
  mikrotikTraffic?: {
    host: string;
    user: string;
    pass: string;
    interface: string;
    port?: number;
  } | null;
}

interface SnmpMonitorOption {
  id: number;
  name: string;
  type: string;
  ping?: number | null;
}

interface LinkModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: LinkFormData) => void;
  sourceName?: string;
  targetName?: string;
  initial?: Partial<LinkFormData>;
  title?: string;
  snmpMonitors?: SnmpMonitorOption[];
}

/* ─────────────────────────────────── tipos del explorador ── */
interface SensorSnmp {
  id: string;
  nombre: string;
  detalle: string;
  grupo: string;
  oid: string;
  operador: string;
  valorEsperado: string;
  lectura?: string;
  unidad?: string;
  contador?: boolean;
}
interface EquipoSnmp {
  nombre?: string;
  descripcion?: string;
  ubicacion?: string;
}
interface Carpeta { id: number; name: string; childCount?: number }

const PRESETS = ["eth0", "eth1", "Gi0/0", "Gi0/1", "Fa0/1", "Fa0/24", "Te1/1", "wan", "lan", "trunk", "po1"];
const PRESETS_CABLE = ["fibra", "cat6", "cat5e", "coaxial", "10G", "1G", "100M", "wireless", "vpn"];

export default function LinkModal({
  open, onClose, onSubmit, sourceName, targetName, initial,
  title = "Nueva conexión", snmpMonitors = [],
}: LinkModalProps) {
  const [srcIf, setSrcIf] = useState("");
  const [tgtIf, setTgtIf] = useState("");
  const [label, setLabel] = useState("");
  const [snmpId, setSnmpId] = useState<number | null>(null);
  const [trafficSrc, setTrafficSrc] = useState<TrafficSource>("none");
  const [teniaMikrotik, setTeniaMikrotik] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Monitores recien creados desde esta ventana, para que aparezcan sin recargar. */
  const [nuevos, setNuevos] = useState<SnmpMonitorOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setSrcIf(initial?.sourceInterface || "");
    setTgtIf(initial?.targetInterface || "");
    setLabel(initial?.label || "");
    setSnmpId(initial?.snmpMonitorId ?? null);
    setTeniaMikrotik(!!initial?.mikrotikTraffic);
    setTrafficSrc(initial?.snmpMonitorId ? "snmp" : "none");
    setNuevos([]);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const monitores = useMemo(() => {
    const vistos = new Set(snmpMonitors.map((m) => m.id));
    return [...snmpMonitors, ...nuevos.filter((m) => !vistos.has(m.id))];
  }, [snmpMonitors, nuevos]);

  const usarMonitor = useCallback((m: SnmpMonitorOption) => {
    setNuevos((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
    setTrafficSrc("snmp");
    setSnmpId(m.id);
  }, []);

  if (!open) return null;

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      sourceInterface: srcIf,
      targetInterface: tgtIf,
      label,
      snmpMonitorId: trafficSrc === "snmp" ? snmpId : null,
      // La fuente MikroTik ya no se ofrece; al guardar queda descartada.
      mikrotikTraffic: null,
    });
  };

  const elegido = monitores.find((m) => m.id === snmpId) || null;

  return (
    <div className="lk-velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <form className="lk-caja" onSubmit={guardar} onMouseDown={(e) => e.stopPropagation()}>
        <header className="lk-cab">
          <span className="lk-ico"><Link2 size={17} /></span>
          <div className="lk-cab-txt">
            <h2>{title}</h2>
            <p>
              <Network size={11} />
              <b>{sourceName || "origen"}</b>
              <ArrowRight size={11} />
              <b>{targetName || "destino"}</b>
            </p>
          </div>
          <button type="button" className="lk-cerrar" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </header>

        <div className="lk-cuerpo">
          {/* ───────── columna izquierda: el cable ───────── */}
          <section className="lk-col lk-col-izq">
            <div className="lk-bloque">
              <div className="lk-titulo"><Plug size={13} /> Puertos</div>
              <div className="lk-dos">
                <Campo
                  etiqueta="En origen" nota={sourceName} valor={srcIf} onChange={setSrcIf}
                  refIn={inputRef} placeholder="ej: eth0, Gi0/1, puerto 24" presets={PRESETS} />
                <Campo
                  etiqueta="En destino" nota={targetName} valor={tgtIf} onChange={setTgtIf}
                  placeholder="ej: eth1, Gi0/2, puerto 1" presets={PRESETS} />
              </div>
            </div>

            <div className="lk-bloque">
              <div className="lk-titulo"><Tag size={13} /> Etiqueta del cable <i>opcional</i></div>
              <input className="lk-input" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="ej: fibra, cat6, 10 Gbps" />
              <div className="lk-chips">
                {PRESETS_CABLE.map((p) => (
                  <button key={p} type="button" className="lk-chip" onClick={() => setLabel(p)}>{p}</button>
                ))}
              </div>
            </div>

            <div className="lk-bloque">
              <div className="lk-titulo"><Activity size={13} /> Tráfico del enlace <i>opcional</i></div>
              <div className="lk-segmento">
                <button type="button" className={trafficSrc === "none" ? "act" : ""} onClick={() => setTrafficSrc("none")}>
                  Sin tráfico
                </button>
                <button type="button" className={trafficSrc === "snmp" ? "act" : ""} onClick={() => setTrafficSrc("snmp")}>
                  Monitor SNMP
                </button>
              </div>

              {trafficSrc === "snmp" && (
                <>
                  <SelectorMonitor monitores={monitores} valor={snmpId} onChange={setSnmpId} />
                  {monitores.length === 0 && (
                    <p className="lk-nota">
                      Todavía no hay monitores SNMP en Uptime Kuma. Escaneá el equipo en el panel
                      de la derecha y creá uno desde ahí.
                    </p>
                  )}
                </>
              )}

              {teniaMikrotik && (
                <p className="lk-aviso">
                  <AlertCircle size={13} />
                  Esta conexión traía una fuente MikroTik por API. Se retiró esa opción: al guardar
                  queda sin fuente, y conviene reemplazarla por un monitor SNMP.
                </p>
              )}
            </div>

            <div className="lk-previa">
              <span className="lk-previa-t">Vista previa</span>
              <div className="lk-previa-fila">
                <span className="lk-puerto">{srcIf || "—"}</span>
                <span className="lk-cable">
                  <Cable size={13} />
                  {label && <em>{label}</em>}
                </span>
                <span className="lk-puerto">{tgtIf || "—"}</span>
              </div>
              {elegido && <div className="lk-previa-mon"><Activity size={11} /> {elegido.name}</div>}
            </div>
          </section>

          {/* ───────── columna derecha: explorador SNMP ───────── */}
          <PanelSnmp
            hostSugerido={initial?.sourceInterface ? "" : ""}
            onCreado={usarMonitor}
            nombreOrigen={sourceName}
          />
        </div>

        <footer className="lk-pie">
          <button type="button" className="lk-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="lk-btn lk-btn-ok"><Check size={15} /> Guardar</button>
        </footer>
      </form>
    </div>
  );
}

/* ══════════════════════════════════ explorador SNMP ══ */
function PanelSnmp({ onCreado, nombreOrigen }: {
  hostSugerido?: string;
  onCreado: (m: SnmpMonitorOption) => void;
  nombreOrigen?: string;
}) {
  const [host, setHost] = useState("");
  const [comunidad, setComunidad] = useState("public");
  const [version, setVersion] = useState<"1" | "2c">("2c");
  const [escaneando, setEscaneando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<EquipoSnmp | null>(null);
  const [sensores, setSensores] = useState<SensorSnmp[]>([]);
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<SensorSnmp | null>(null);

  // formulario de alta
  const [nombre, setNombre] = useState("");
  const [carpeta, setCarpeta] = useState<number | null>(null);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [intervalo, setIntervalo] = useState("60");
  const [operador, setOperador] = useState("<=");
  const [esperado, setEsperado] = useState("");
  const [creando, setCreando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/kuma/groups"), { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCarpetas(d?.groups || []))
      .catch(() => {});
  }, []);

  const escanear = async () => {
    setError(null); setListo(null); setSel(null); setEscaneando(true);
    try {
      const r = await fetch(apiUrl("/api/snmp/walk"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host.trim(), comunidad, version, modo: "sensores" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "No se pudo consultar el equipo");
      setEquipo(d.equipo || null);
      setSensores(d.sensores || []);
    } catch (e: any) {
      setError(e.message); setSensores([]); setEquipo(null);
    } finally {
      setEscaneando(false);
    }
  };

  const elegir = (s: SensorSnmp) => {
    setSel(s);
    setListo(null);
    const base = equipo?.nombre || nombreOrigen || host;
    setNombre(`${base} — ${s.nombre.replace(/^.*? — /, "")}`.slice(0, 150));
    setOperador(s.operador);
    setEsperado(s.valorEsperado);
  };

  const crear = async () => {
    if (!sel) return;
    setCreando(true); setError(null); setListo(null);
    try {
      const r = await fetch(apiUrl("/api/kuma/monitors"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nombre.trim() || sel.nombre,
          type: "snmp",
          hostname: host.trim(),
          port: 161,
          snmpOid: sel.oid,
          snmpVersion: version,
          radiusPassword: comunidad,
          jsonPath: "$",
          jsonPathOperator: operador,
          expectedValue: String(esperado),
          interval: Math.max(20, Number(intervalo) || 60),
          retryInterval: Math.max(20, Number(intervalo) || 60),
          timeout: 5,
          maxretries: 0,
          ...(carpeta ? { parent: carpeta } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Uptime Kuma rechazó el monitor");
      const id = Number(d?.monitorID);
      if (id) {
        onCreado({ id, name: nombre.trim() || sel.nombre, type: "snmp" });
        setListo(`Creado en Uptime Kuma y asignado a esta conexión.`);
      } else {
        setListo("Creado en Uptime Kuma.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  };

  const f = filtro.trim().toLowerCase();
  const visibles = f
    ? sensores.filter((s) => (s.nombre + " " + s.grupo + " " + s.oid).toLowerCase().includes(f))
    : sensores;
  const grupos = useMemo(() => {
    const m = new Map<string, SensorSnmp[]>();
    for (const s of visibles) {
      if (!m.has(s.grupo)) m.set(s.grupo, []);
      m.get(s.grupo)!.push(s);
    }
    return [...m.entries()];
  }, [visibles]);

  return (
    <section className="lk-col lk-col-der">
      <div className="lk-titulo lk-titulo-der"><Radar size={13} /> Explorar el equipo por SNMP</div>

      <div className="lk-snmp-form">
        <input className="lk-input" placeholder="IP del equipo (ej: 192.168.99.1)"
          value={host} onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (host.trim()) escanear(); } }} />
        <div className="lk-snmp-fila">
          <input className="lk-input" placeholder="comunidad" value={comunidad}
            onChange={(e) => setComunidad(e.target.value)} />
          <select className="lk-input lk-select" value={version} onChange={(e) => setVersion(e.target.value as "1" | "2c")}>
            <option value="2c">v2c</option>
            <option value="1">v1</option>
          </select>
          <button type="button" className="lk-btn lk-btn-ok lk-btn-sm"
            onClick={escanear} disabled={escaneando || !host.trim()}>
            {escaneando ? <><Loader2 size={14} className="lk-girar" /> Escaneando…</> : <><Radar size={14} /> Escanear</>}
          </button>
        </div>
      </div>

      {error && <div className="lk-error"><AlertCircle size={14} /> {error}</div>}

      {equipo && (
        <div className="lk-equipo">
          <b>{equipo.nombre || host}</b>
          {equipo.descripcion && <span>{equipo.descripcion}</span>}
          <em>{sensores.length} sensores encontrados</em>
        </div>
      )}

      {sensores.length > 0 && (
        <>
          <div className="lk-buscar">
            <Search size={13} />
            <input placeholder="Filtrar por interfaz, nombre u OID…" value={filtro}
              onChange={(e) => setFiltro(e.target.value)} />
          </div>

          <div className="lk-lista">
            {grupos.map(([g, items]) => (
              <div key={g} className="lk-grupo">
                <div className="lk-grupo-t">{g}</div>
                {items.map((s) => (
                  <button key={s.id} type="button"
                    className={"lk-sensor" + (sel?.id === s.id ? " lk-sensor-sel" : "")}
                    onClick={() => elegir(s)}>
                    <span className="lk-sensor-n">{s.nombre.replace(/^.*? — /, "")}</span>
                    <span className="lk-sensor-d">{s.detalle}</span>
                    <code className="lk-sensor-oid">{s.oid}</code>
                    {s.lectura && <span className="lk-sensor-v">{s.lectura}</span>}
                  </button>
                ))}
              </div>
            ))}
            {grupos.length === 0 && <p className="lk-nota">Nada coincide con ese filtro.</p>}
          </div>
        </>
      )}

      {sel && (
        <div className="lk-alta">
          <div className="lk-titulo"><Plus size={13} /> Crear este sensor en Uptime Kuma</div>
          <input className="lk-input" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del monitor" />
          <div className="lk-snmp-fila">
            <label className="lk-mini"><FolderTree size={12} /> Carpeta</label>
            <select className="lk-input lk-select" value={carpeta ?? ""}
              onChange={(e) => setCarpeta(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin carpeta</option>
              {carpetas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="lk-snmp-fila">
            <label className="lk-mini">Alerta si</label>
            <select className="lk-input lk-select lk-op" value={operador} onChange={(e) => setOperador(e.target.value)}>
              {["==", "!=", "<", "<=", ">", ">="].map((o) => <option key={o} value={o}>no {o}</option>)}
            </select>
            <input className="lk-input" value={esperado} onChange={(e) => setEsperado(e.target.value)}
              placeholder="valor" />
            <input className="lk-input lk-int" value={intervalo} onChange={(e) => setIntervalo(e.target.value)}
              placeholder="seg" title="Cada cuántos segundos consulta" />
          </div>
          <p className="lk-nota">
            OID <code>{sel.oid}</code> · consulta cada {Math.max(20, Number(intervalo) || 60)} s.
            {sel.contador
              ? " Es un contador acumulado: solo sube desde que arrancó el equipo, así que no sirve como umbral. Queda en «responde», y el valor alimenta el gráfico de tráfico del enlace."
              : " Uptime Kuma marca caída cuando el valor deja de cumplir la condición."}
          </p>
          <button type="button" className="lk-btn lk-btn-ok" onClick={crear} disabled={creando}>
            {creando ? <><Loader2 size={14} className="lk-girar" /> Creando…</> : <><Check size={14} /> Crear y usar en este enlace</>}
          </button>
          {listo && <div className="lk-listo"><Check size={14} /> {listo}</div>}
        </div>
      )}

      {!equipo && !error && !escaneando && (
        <div className="lk-vacio">
          <Radar size={26} />
          <b>Poné la IP y escaneá</b>
          <span>
            El equipo se consulta por SNMP y se traduce lo que publica a sensores con nombre:
            estado de cada puerto, tráfico de entrada y salida, errores, CPU y discos.
            Después elegís uno y se crea el monitor en Uptime Kuma sin salir de acá.
          </span>
        </div>
      )}
    </section>
  );
}

/* ══════════════════════════════════════ piezas ══ */
function Campo({ etiqueta, nota, valor, onChange, placeholder, presets, refIn }: {
  etiqueta: string; nota?: string; valor: string; onChange: (v: string) => void;
  placeholder: string; presets: string[]; refIn?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="lk-campo">
      <label>{etiqueta} {nota && <i>{nota}</i>}</label>
      <input ref={refIn} className="lk-input" value={valor} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
      <div className="lk-chips">
        {presets.slice(0, 6).map((p) => (
          <button key={p} type="button" className="lk-chip" onClick={() => onChange(p)}>{p}</button>
        ))}
      </div>
    </div>
  );
}

function SelectorMonitor({ monitores, valor, onChange }: {
  monitores: SnmpMonitorOption[]; valor: number | null; onChange: (v: number | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const sel = monitores.find((m) => m.id === valor);
  const f = q.trim().toLowerCase();
  const lista = f ? monitores.filter((m) => m.name.toLowerCase().includes(f)) : monitores;

  return (
    <div className="lk-sel" ref={caja}>
      <button type="button" className="lk-input lk-sel-btn" onClick={() => setAbierto((v) => !v)}>
        <span className={sel ? "" : "lk-ph"}>{sel ? sel.name : "Seleccionar monitor…"}</span>
        <ChevronDown size={15} />
      </button>
      {abierto && (
        <div className="lk-sel-pop">
          <div className="lk-buscar">
            <Search size={13} />
            <input autoFocus placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="lk-sel-lista">
            <button type="button" className="lk-sel-item" onClick={() => { onChange(null); setAbierto(false); }}>
              <span className="lk-ph">Ninguno</span>
            </button>
            {lista.map((m) => (
              <button key={m.id} type="button"
                className={"lk-sel-item" + (m.id === valor ? " act" : "")}
                onClick={() => { onChange(m.id); setAbierto(false); }}>
                <span>{m.name}</span>
                <code>{m.type}</code>
              </button>
            ))}
            {lista.length === 0 && <p className="lk-nota">Sin resultados.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ estilo ══ */
const AZUL = "#4f8cf5";
const VERDE = "#22c55e";

const CSS = `
.lk-velo{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;
  padding:20px;background:rgba(4,8,18,.62);backdrop-filter:blur(3px);animation:lkVelo .14s ease-out}
@keyframes lkVelo{from{opacity:0}to{opacity:1}}
.lk-caja{display:flex;flex-direction:column;width:min(1060px,100%);max-height:min(880px,92vh);
  background:var(--card,#111827);color:var(--foreground,#e5e7eb);border:1px solid var(--border,#243049);
  border-radius:16px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.5);
  animation:lkEntra .18s cubic-bezier(.22,1,.36,1)}
@keyframes lkEntra{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}

.lk-cab{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border,#243049)}
.lk-ico{width:34px;height:34px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#1b5fd9,#0f3f9e);color:#fff}
.lk-cab-txt{flex:1;min-width:0}
.lk-cab-txt h2{margin:0;font-size:16px;font-weight:700;letter-spacing:-.2px}
.lk-cab-txt p{margin:3px 0 0;display:flex;align-items:center;gap:6px;font-size:12px;
  color:var(--muted-foreground,#8b9bb4);flex-wrap:wrap}
.lk-cab-txt p b{color:var(--text-secondary,#c7d3e6);font-weight:600}
.lk-cerrar{width:32px;height:32px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:9px;
  background:transparent;border:1px solid var(--border,#243049);color:var(--muted-foreground,#8b9bb4);cursor:pointer}
.lk-cerrar:hover{background:rgba(127,127,127,.12);color:var(--foreground,#e5e7eb)}

.lk-cuerpo{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.lk-col{min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px}
.lk-col-der{box-shadow:inset 1px 0 0 var(--border,#243049);background:rgba(127,143,180,.04)}

.lk-bloque{display:flex;flex-direction:column;gap:8px}
.lk-titulo{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;text-transform:uppercase;
  letter-spacing:.09em;color:var(--muted-foreground,#8b9bb4)}
.lk-titulo i{font-style:normal;text-transform:none;letter-spacing:0;font-weight:500;opacity:.75}
.lk-titulo-der{margin-bottom:-6px}
.lk-dos{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.lk-campo{display:flex;flex-direction:column;gap:6px;min-width:0}
.lk-campo label{font-size:11.5px;color:var(--text-secondary,#c7d3e6);font-weight:600}
.lk-campo label i{font-style:normal;font-weight:400;color:var(--muted-foreground,#8b9bb4)}

.lk-input{width:100%;background:var(--background,#0b1220);border:1px solid var(--border,#243049);
  color:var(--foreground,#e5e7eb);border-radius:9px;padding:9px 11px;font:inherit;font-size:13px;outline:none;
  transition:border-color .12s,box-shadow .12s}
.lk-input:focus{border-color:${AZUL};box-shadow:0 0 0 3px rgba(79,140,245,.18)}
.lk-input::placeholder{color:var(--muted-foreground,#7b8aa3)}
.lk-select{cursor:pointer}
.lk-op{max-width:96px}
.lk-int{max-width:74px}

.lk-chips{display:flex;flex-wrap:wrap;gap:4px}
.lk-chip{font-size:10.5px;padding:2px 7px;border-radius:6px;background:rgba(127,143,180,.1);
  border:1px solid var(--border,#243049);color:var(--muted-foreground,#8b9bb4);cursor:pointer;font:inherit;font-size:10.5px}
.lk-chip:hover{color:${AZUL};border-color:rgba(79,140,245,.4)}

.lk-segmento{display:flex;gap:4px;padding:3px;border-radius:10px;background:rgba(127,143,180,.08);
  border:1px solid var(--border,#243049)}
.lk-segmento button{flex:1;padding:7px 10px;border-radius:8px;background:transparent;border:none;font:inherit;
  font-size:12.5px;font-weight:600;color:var(--muted-foreground,#8b9bb4);cursor:pointer;transition:all .13s}
.lk-segmento button:hover{color:var(--foreground,#e5e7eb)}
.lk-segmento .act{background:rgba(34,197,94,.14);color:${VERDE};box-shadow:inset 0 0 0 1px rgba(34,197,94,.3)}

.lk-nota{margin:0;font-size:11.5px;line-height:1.55;color:var(--muted-foreground,#8b9bb4)}
.lk-nota code{font-size:11px;opacity:.9}
.lk-aviso{display:flex;align-items:flex-start;gap:7px;margin:0;padding:9px 11px;border-radius:9px;font-size:11.5px;
  line-height:1.5;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#fcd34d}
.lk-error{display:flex;align-items:flex-start;gap:7px;padding:9px 11px;border-radius:9px;font-size:12px;
  background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#fca5a5}
.lk-listo{display:flex;align-items:center;gap:7px;padding:8px 11px;border-radius:9px;font-size:12px;
  background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:#86efac}

.lk-previa{margin-top:auto;padding:12px;border-radius:12px;border:1px dashed var(--border,#243049);
  display:flex;flex-direction:column;gap:9px;align-items:center}
.lk-previa-t{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted-foreground,#8b9bb4)}
.lk-previa-fila{display:flex;align-items:center;gap:10px}
.lk-puerto{padding:4px 10px;border-radius:7px;background:rgba(79,140,245,.14);color:${AZUL};
  font-family:ui-monospace,monospace;font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lk-cable{display:flex;align-items:center;gap:6px;color:var(--muted-foreground,#8b9bb4);font-size:11px}
.lk-cable em{font-style:normal}
.lk-previa-mon{display:flex;align-items:center;gap:6px;font-size:11.5px;color:${VERDE}}

/* explorador */
.lk-snmp-form{display:flex;flex-direction:column;gap:8px}
.lk-snmp-fila{display:flex;gap:8px;align-items:center}
.lk-mini{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted-foreground,#8b9bb4);
  white-space:nowrap;min-width:62px}
.lk-girar{animation:lkGira 1s linear infinite}
@keyframes lkGira{to{transform:rotate(360deg)}}

.lk-equipo{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:10px;
  background:rgba(79,140,245,.08);border:1px solid rgba(79,140,245,.22)}
.lk-equipo b{font-size:13.5px}
.lk-equipo span{font-size:11.5px;color:var(--muted-foreground,#8b9bb4);line-height:1.45}
.lk-equipo em{font-style:normal;font-size:11px;color:${AZUL};margin-top:2px}

.lk-buscar{display:flex;align-items:center;gap:8px;padding:0 11px;border-radius:9px;
  background:var(--background,#0b1220);border:1px solid var(--border,#243049);color:var(--muted-foreground,#8b9bb4)}
.lk-buscar input{flex:1;background:transparent;border:none;outline:none;padding:9px 0;font:inherit;font-size:12.5px;
  color:var(--foreground,#e5e7eb)}

.lk-lista{flex:1;min-height:120px;max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;
  padding-right:2px}
.lk-grupo{display:flex;flex-direction:column;gap:3px}
.lk-grupo-t{position:sticky;top:0;z-index:1;padding:4px 2px;font-size:10.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:.08em;color:var(--muted-foreground,#8b9bb4);background:var(--card,#111827)}
.lk-sensor{display:grid;grid-template-columns:1fr auto;grid-template-areas:"n v" "d v" "o v";gap:1px 10px;
  text-align:left;padding:7px 10px;border-radius:9px;background:transparent;border:1px solid transparent;
  cursor:pointer;font:inherit;color:inherit;transition:background .12s,border-color .12s}
.lk-sensor:hover{background:rgba(127,143,180,.08);border-color:var(--border,#243049)}
.lk-sensor-sel{background:rgba(79,140,245,.12);border-color:rgba(79,140,245,.4)}
.lk-sensor-n{grid-area:n;font-size:12.5px;font-weight:600}
.lk-sensor-d{grid-area:d;font-size:11px;color:var(--muted-foreground,#8b9bb4)}
.lk-sensor-oid{grid-area:o;font-size:10.5px;color:var(--muted-foreground,#7b8aa3);opacity:.8}
.lk-sensor-v{grid-area:v;align-self:center;font-size:11.5px;font-weight:600;color:${VERDE};white-space:nowrap}

.lk-alta{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;
  background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.22)}

.lk-vacio{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
  text-align:center;padding:28px 16px;color:var(--muted-foreground,#8b9bb4)}
.lk-vacio b{font-size:13.5px;color:var(--text-secondary,#c7d3e6)}
.lk-vacio span{font-size:12px;line-height:1.6;max-width:320px}

/* selector de monitor */
.lk-sel{position:relative}
.lk-sel-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;text-align:left}
.lk-ph{color:var(--muted-foreground,#7b8aa3)}
.lk-sel-pop{position:absolute;left:0;right:0;top:calc(100% + 5px);z-index:20;border-radius:10px;overflow:hidden;
  background:var(--card,#111827);border:1px solid var(--border,#243049);box-shadow:0 14px 34px rgba(0,0,0,.42)}
.lk-sel-lista{max-height:230px;overflow-y:auto;padding:4px}
.lk-sel-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;
  padding:8px 10px;border-radius:8px;background:transparent;border:none;color:inherit;font:inherit;font-size:12.5px;cursor:pointer}
.lk-sel-item:hover{background:rgba(127,143,180,.1)}
.lk-sel-item.act{background:rgba(79,140,245,.14);color:${AZUL}}
.lk-sel-item code{font-size:10.5px;color:var(--muted-foreground,#8b9bb4)}

.lk-pie{flex:none;display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;
  border-top:1px solid var(--border,#243049);background:rgba(127,143,180,.04)}
.lk-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 18px;border-radius:9px;
  background:transparent;border:1px solid var(--border,#243049);color:var(--text-secondary,#c7d3e6);font:inherit;
  font-size:13px;font-weight:600;cursor:pointer;transition:all .13s}
.lk-btn:hover:not(:disabled){background:rgba(127,143,180,.1)}
.lk-btn:disabled{opacity:.5;cursor:default}
.lk-btn-ok{background:#1b5fd9;border-color:#1b5fd9;color:#fff}
.lk-btn-ok:hover:not(:disabled){background:#1550bd}
.lk-btn-sm{padding:8px 13px;font-size:12.5px;white-space:nowrap}

@media (max-width:900px){
  .lk-cuerpo{grid-template-columns:1fr;overflow-y:auto}
  .lk-col{overflow:visible}
  .lk-col-der{box-shadow:inset 0 1px 0 var(--border,#243049)}
  .lk-dos{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){
  .lk-caja,.lk-velo{animation:none}
  .lk-girar{animation:none}
}
`;
