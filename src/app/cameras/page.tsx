"use client";

/**
 * Cámaras y grabadores.
 *
 * Lo que estaba roto: no se podía abrir la grilla de canales de ningún grabador.
 * La pantalla ofrecía "asociar una cámara a un canal" pero no había forma de
 * mirar ese canal, porque el video sólo se generaba para nodos NVR del mapa y en
 * producción los nueve grabadores están documentados dentro de racks.
 *
 * Ahora la pantalla tiene tres partes, que son las tres preguntas que uno le
 * hace: qué estoy viendo (el muro), qué graba cada equipo (los grabadores, con
 * su grilla de canales), y qué falta configurar.
 *
 * Cuando un canal no se puede mirar, lo dice y dice por qué. Un recuadro negro
 * girando para siempre es peor que un cartel que explica que al grabador no se
 * llega desde el servidor.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import { useMjpegStream } from "@/hooks/useMjpegStream";

/* ───────────────────────────────────────────── tipos ── */

interface Camara {
  nodeId: string; mapId: string; mapName: string; label: string; ip: string;
  streamType: string; streamUrl: string; streamRef?: string; streamRefBaja?: string;
  manufacturer: string; source: "camera" | "nvr";
}
interface Canal {
  canal: number; etiqueta: string; documentado: boolean;
  camara: string; camaraIp: string; grabacion: string; resolucion: string; codec: string;
  streamRef?: string; streamRefBaja?: string;
}
interface Grabador {
  id: string; origen: "rack" | "nodo"; etiqueta: string; rack: string;
  mapaId: string; mapa: string; ip: string; modelo: string;
  usuario: string; tieneClave: boolean; patron: "hikvision" | "dahua";
  motivo: "sin-ip" | "sin-credenciales" | null;
  canales: Canal[]; totalCanales: number; documentados: number;
}
interface Prueba {
  ok: boolean; ip?: string; motivo?: string;
  rtsp?: { abierto: boolean; codigo: string; ms: number };
  web?: { abierto: boolean; codigo: string; ms: number };
  diagnostico?: string;
}

/* ── Detección en vivo por ISAPI ── */
type Salud = "ok" | "atencion" | "falla" | "desconocido";
interface DiscoNvr {
  id: string; nombre: string; capacidadGB: number; libreGB: number; usadoPct: number;
  estado: string; salud: Salud; propiedad: string;
  temperatura: number | null; horasEncendido: number | null; sectoresMalos: number | null; evaluacion: string;
}
interface CanalNvr {
  canal: number; nombre: string; camaraIp: string; online: boolean; grabando: boolean;
  resolucion: string; fps: number | null; bitrateKbps: number | null; codec: string;
}
interface EstadoNvr {
  alcanzable: boolean; error?: string;
  info?: { modelo: string; firmware: string; serie: string; nombre: string; mac: string };
  cpuPct?: number; memPct?: number; discos: DiscoNvr[]; canales: CanalNvr[]; ts: number;
}
interface DiscosGrab {
  grabadorId: string; etiqueta: string | null; ip: string | null; ts: number;
  alcanzable: boolean; peor: Salud | null; discos: DiscoNvr[]; kumaMonitorId: number | null;
}
interface ConfigDiscos { habilitado: boolean; hora: string; soloProblemas: boolean; }

const SALUD_COLOR: Record<Salud, string> = { ok: "#16a34a", atencion: "#f59e0b", falla: "#dc2626", desconocido: "#8493a8" };
const SALUD_TXT: Record<Salud, string> = { ok: "OK", atencion: "Atención", falla: "Falla", desconocido: "—" };

/* ─────────────────────────────────────────── paleta ── */

const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const GRIS = "#8493a8";

const MOTIVO: Record<string, string> = {
  "sin-ip": "Sin IP de gestión",
  "sin-credenciales": "Sin usuario o clave",
};

const sv = (d: React.ReactNode, s = 16, w = 2) => (c = "currentColor") => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  camara: sv(<><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></>, 22),
  disco: sv(<><rect x="2" y="4" width="20" height="7" rx="2" /><rect x="2" y="13" width="20" height="7" rx="2" /><path d="M6 7.5h.01M6 16.5h.01" /></>, 15),
  play: sv(<path d="m6 3 14 9-14 9z" />, 13),
  stop: sv(<rect x="5" y="5" width="14" height="14" rx="2" />, 13),
  ampliar: sv(<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>, 14),
  x: sv(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 16),
  lupa: sv(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, 15),
  chevron: sv(<path d="m9 18 6-6-6-6" />, 14),
  pulso: sv(<path d="M3 12h4l3 8 4-16 3 8h4" />, 14),
  radar: sv(<><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" /><path d="M4 6h.01" /><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" /><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" /><path d="M12 18h.01" /><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" /><circle cx="12" cy="12" r="2" /><path d="m13.41 10.59 5.66-5.66" /></>, 14),
  disco2: sv(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>, 15),
  reloj: sv(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 13),
  alerta: sv(<><path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /><path d="M12 9v4M12 17h.01" /></>, 14),
  anterior: sv(<path d="m15 18-6-6 6-6" />, 20),
  siguiente: sv(<path d="m9 18 6-6-6-6" />, 20),
};

function tieneVideo(c: Camara): boolean {
  return !!(c.streamType && c.streamType !== "nvr" && (c.streamRef || c.streamUrl));
}

/* ──────────────────────────────────── recuadro de video ── */

/**
 * Un recuadro. `encendido` importa: en el muro arrancan todos, pero en la grilla
 * de un grabador de 32 canales encender los 32 a la vez es exactamente el error
 * que hacía inusable esta pantalla.
 */
function Recuadro({
  streamRef, streamUrl, titulo, subtitulo, encendido, onEncender, onAmpliar, alto = 150,
}: {
  streamRef?: string; streamUrl?: string;
  titulo: string; subtitulo?: string;
  encendido: boolean; onEncender?: () => void; onAmpliar?: () => void;
  alto?: number;
}) {
  const { canvasRef, status, mode, imgSrcA, imgSrcB, activeBuf } =
    useMjpegStream(streamUrl || null, { streamRef, fps: 1, quality: 12, enabled: encendido });

  return (
    <div className="cm-recuadro" style={{ height: alto }}>
      {encendido ? (
        <>
          {mode === "canvas"
            ? <canvas ref={canvasRef} className="cm-lienzo" />
            : <>
                <img src={imgSrcA} alt="" className="cm-lienzo" style={{ opacity: activeBuf === "a" ? 1 : 0 }} />
                <img src={imgSrcB} alt="" className="cm-lienzo" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />
              </>}
          {status !== "streaming" && (
            <div className="cm-estado">
              {status === "error"
                ? <span style={{ color: ROJO }}>sin imagen</span>
                : <span className="cm-latiendo">conectando…</span>}
            </div>
          )}
        </>
      ) : (
        <button className="cm-encender" onClick={onEncender} title="Encender este canal">
          {I.play("#fff")} Ver
        </button>
      )}

      <div className="cm-pie">
        <span className="cm-pie-txt">
          <b>{titulo}</b>
          {subtitulo && <span className="cm-gris"> · {subtitulo}</span>}
        </span>
        <span className="cm-pie-acc">
          {encendido && onEncender && (
            <button className="cm-icono" onClick={onEncender} title="Apagar">{I.stop("#fff")}</button>
          )}
          {onAmpliar && (
            <button className="cm-icono" onClick={onAmpliar} title="Ampliar">{I.ampliar("#fff")}</button>
          )}
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────── pantalla completa ── */

function Visor({ fuente, titulo, subtitulo, onCerrar, onAnterior, onSiguiente }: {
  fuente: { streamRef?: string; streamUrl?: string };
  titulo: string; subtitulo?: string;
  onCerrar: () => void; onAnterior?: () => void; onSiguiente?: () => void;
}) {
  const { canvasRef, status, mode, imgSrcA, imgSrcB, activeBuf } =
    useMjpegStream(fuente.streamUrl || null, { streamRef: fuente.streamRef, fps: 8, quality: 5, scale: 1280, enabled: true });

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowLeft" && onAnterior) onAnterior();
      if (e.key === "ArrowRight" && onSiguiente) onSiguiente();
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onCerrar, onAnterior, onSiguiente]);

  return (
    <div className="cm-visor" onClick={onCerrar}>
      <div className="cm-visor-caja" onClick={(e) => e.stopPropagation()}>
        <div className="cm-visor-cab">
          <span><b>{titulo}</b>{subtitulo && <span className="cm-gris"> · {subtitulo}</span>}</span>
          <button className="cm-icono" onClick={onCerrar} aria-label="Cerrar">{I.x("#fff")}</button>
        </div>
        <div className="cm-visor-video">
          {mode === "canvas"
            ? <canvas ref={canvasRef} className="cm-lienzo" />
            : <>
                <img src={imgSrcA} alt="" className="cm-lienzo" style={{ opacity: activeBuf === "a" ? 1 : 0 }} />
                <img src={imgSrcB} alt="" className="cm-lienzo" style={{ opacity: activeBuf === "b" ? 1 : 0 }} />
              </>}
          {status !== "streaming" && (
            <div className="cm-estado cm-estado-grande">
              {status === "error" ? <span style={{ color: ROJO }}>sin imagen</span> : <span className="cm-latiendo">conectando…</span>}
            </div>
          )}
          {onAnterior && <button className="cm-flecha izq" onClick={onAnterior} aria-label="Anterior">{I.anterior("#fff")}</button>}
          {onSiguiente && <button className="cm-flecha der" onClick={onSiguiente} aria-label="Siguiente">{I.siguiente("#fff")}</button>}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────── tarjeta grabador ── */

function TarjetaGrabador({ g, onAmpliar, onPatron }: {
  g: Grabador;
  onAmpliar: (canal: Canal) => void;
  onPatron: (id: string, patron: "hikvision" | "dahua") => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [encendidos, setEncendidos] = useState<Set<number>>(new Set());
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [probando, setProbando] = useState(false);
  const [vivo, setVivo] = useState<EstadoNvr | null>(null);
  const [detectando, setDetectando] = useState(false);

  const reproducible = g.motivo === null;
  const vivoPorCanal = useMemo(() => {
    const m = new Map<number, CanalNvr>();
    for (const c of vivo?.canales || []) m.set(c.canal, c);
    return m;
  }, [vivo]);

  const detectar = async () => {
    setDetectando(true);
    try {
      const r = await fetch(apiUrl("/api/grabadores/live"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id }),
      });
      setVivo(await r.json());
    } catch (e: any) {
      setVivo({ alcanzable: false, error: e?.message || "No se pudo detectar", discos: [], canales: [], ts: Date.now() });
    }
    setDetectando(false);
  };

  const alternar = (n: number) => setEncendidos((p) => {
    const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s;
  });

  const probar = async () => {
    setProbando(true); setPrueba(null);
    try {
      const r = await fetch(apiUrl("/api/grabadores"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id }),
      });
      setPrueba(await r.json());
    } catch (e: any) {
      setPrueba({ ok: false, diagnostico: e?.message || "No se pudo probar" });
    }
    setProbando(false);
  };

  return (
    <div className={`cm-grab${abierto ? " abierto" : ""}`}>
      <div className="cm-grab-cab" onClick={() => setAbierto((v) => !v)} role="button" tabIndex={0}
           onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAbierto((v) => !v); } }}>
        <span className={`cm-chevron${abierto ? " abajo" : ""}`}>{I.chevron(GRIS)}</span>
        <span className="cm-grab-ico" style={{ color: reproducible ? AZUL_CLARO : GRIS }}>{I.disco()}</span>
        <span className="cm-grab-nom">
          <b>{g.etiqueta}</b>
          <span className="cm-gris">{g.rack ? ` · ${g.rack}` : ""} · {g.mapa}</span>
        </span>
        <span className="cm-grab-datos">
          {g.ip
            ? <span className="cm-etq cm-mono">{g.ip}</span>
            : <span className="cm-etq cm-etq-alerta">sin IP</span>}
          {g.modelo && <span className="cm-etq">{g.modelo}</span>}
          <span className="cm-etq">{g.totalCanales} canales</span>
          <span className="cm-etq">{g.documentados} documentados</span>
        </span>
      </div>

      {abierto && (
        <div className="cm-grab-cuerpo">
          <div className="cm-grab-barra">
            {reproducible ? (
              <>
                <button className="cm-btn" onClick={() => setEncendidos(new Set(g.canales.map((c) => c.canal)))}>
                  {I.play()} Encender todos
                </button>
                <button className="cm-btn" onClick={() => setEncendidos(new Set())}>{I.stop()} Apagar todos</button>
              </>
            ) : (
              <span className="cm-nota-alerta">{I.alerta(AMBAR)} {MOTIVO[g.motivo!]} — sin eso no se le puede pedir video a este grabador.</span>
            )}
            <span style={{ flex: 1 }} />
            <span className="cm-segmentos" role="group" aria-label="Dialecto RTSP">
              <span className="cm-etq-seg">RTSP</span>
              {(["hikvision", "dahua"] as const).map((p) => (
                <button key={p} className={`cm-seg${g.patron === p ? " act" : ""}`} onClick={() => onPatron(g.id, p)}>
                  {p === "hikvision" ? "Hikvision" : "Dahua"}
                </button>
              ))}
            </span>
            {g.ip && (
              <button className="cm-btn" onClick={probar} disabled={probando}>
                {I.pulso()} {probando ? "Probando…" : "Probar conexión"}
              </button>
            )}
            {reproducible && g.patron === "hikvision" && (
              <button className="cm-btn cm-btn-pri" onClick={detectar} disabled={detectando}>
                {I.radar()} {detectando ? "Detectando…" : vivo ? "Actualizar" : "Detectar en vivo"}
              </button>
            )}
          </div>

          {vivo && (
            vivo.alcanzable ? (
              <div className="cm-vivo">
                <div className="cm-vivo-info">
                  {vivo.info?.modelo && <span className="cm-etq">{vivo.info.modelo}</span>}
                  {vivo.info?.mac && <span className="cm-etq cm-mono">MAC {vivo.info.mac}</span>}
                  {vivo.info?.firmware && <span className="cm-etq">FW {vivo.info.firmware}</span>}
                  {vivo.info?.serie && <span className="cm-etq cm-mono">S/N {vivo.info.serie}</span>}
                  {typeof vivo.cpuPct === "number" && <span className="cm-etq">CPU {vivo.cpuPct}%</span>}
                  {typeof vivo.memPct === "number" && <span className="cm-etq">RAM {vivo.memPct}%</span>}
                </div>
                {vivo.discos.length > 0 && (
                  <div className="cm-vivo-discos">
                    {vivo.discos.map((d) => (
                      <span key={d.id} className="cm-disco-chip" style={{ borderColor: SALUD_COLOR[d.salud] + "88" }} title={`${d.estado}${d.evaluacion ? ` · SMART ${d.evaluacion}` : ""}`}>
                        <span className="cm-punto" style={{ background: SALUD_COLOR[d.salud] }} />
                        <b>{d.nombre}</b> {d.capacidadGB} GB · {d.usadoPct}% usado
                        {d.temperatura != null && ` · ${d.temperatura}°C`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="cm-prueba"><b>Detección en vivo</b><span>{vivo.error || "No se pudo detectar"}</span></div>
            )
          )}

          {prueba && (
            <div className={`cm-prueba${prueba.rtsp?.abierto ? " ok" : ""}`}>
              <b>
                {prueba.rtsp
                  ? `554/tcp ${prueba.rtsp.codigo} (${prueba.rtsp.ms} ms) · 80/tcp ${prueba.web?.codigo}`
                  : "No se pudo probar"}
              </b>
              <span>{prueba.diagnostico || (prueba.motivo === "sin-ip" ? "Este grabador no tiene IP de gestión cargada." : "")}</span>
            </div>
          )}

          <div className="cm-canales">
            {g.canales.map((c) => (
              <div key={c.canal} className="cm-canal">
                {reproducible ? (
                  <Recuadro
                    streamRef={c.streamRefBaja || c.streamRef}
                    titulo={`CH${c.canal}`}
                    subtitulo={c.camara || c.etiqueta}
                    encendido={encendidos.has(c.canal)}
                    onEncender={() => alternar(c.canal)}
                    onAmpliar={() => onAmpliar(c)}
                    alto={128}
                  />
                ) : (
                  <div className="cm-canal-vacio">
                    <span className="cm-canal-num">CH{c.canal}</span>
                    <span className="cm-canal-nom">{c.camara || c.etiqueta}</span>
                    <span className="cm-canal-falta">{MOTIVO[g.motivo!]}</span>
                  </div>
                )}
                {(() => {
                  const v = vivoPorCanal.get(c.canal);
                  const camIp = v?.camaraIp || c.camaraIp;
                  const res = v?.resolucion || c.resolucion;
                  const grab = v?.grabando ? "grabando" : c.grabacion;
                  if (!(camIp || res || grab || v)) return null;
                  return (
                    <div className="cm-canal-meta">
                      {camIp && <span className="cm-mono">{camIp}</span>}
                      {res && <span>{res}{v?.fps ? `@${v.fps}` : ""}</span>}
                      {v?.codec && <span>{v.codec}</span>}
                      {v?.bitrateKbps != null && v.bitrateKbps > 0 && <span>{v.bitrateKbps >= 1024 ? `${(v.bitrateKbps / 1024).toFixed(1)} Mbps` : `${v.bitrateKbps} kbps`}</span>}
                      {v && (v.online ? <span className="cm-vivo-on">● online</span> : <span className="cm-vivo-off">○ offline</span>)}
                      {v?.grabando && <span className="cm-rec">REC</span>}
                      {!v && grab && <span>{grab}</span>}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────── vista discos ── */

function DiscosVista({ faltaSesion }: { faltaSesion: boolean }) {
  const [datos, setDatos] = useState<DiscosGrab[]>([]);
  const [config, setConfig] = useState<ConfigDiscos | null>(null);
  const [ultimo, setUltimo] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [escaneando, setEscaneando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/nvr-disks"), { credentials: "include" });
      if (!r.ok) { setCargando(false); return; }
      const b = await r.json();
      setDatos(b.grabadores || []);
      setConfig(b.config || null);
      setUltimo(b.ultimoScan || null);
    } catch { /* red */ }
    setCargando(false);
  }, []);
  useEffect(() => { if (!faltaSesion) cargar(); else setCargando(false); }, [cargar, faltaSesion]);

  const guardarConfig = async (parcial: Partial<ConfigDiscos>) => {
    const next = { ...(config || { habilitado: true, hora: "07:00", soloProblemas: false }), ...parcial };
    setConfig(next);
    await fetch(apiUrl("/api/nvr-disks"), {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parcial),
    });
    setGuardado(true); setTimeout(() => setGuardado(false), 1500);
  };
  const escanearAhora = async () => {
    setEscaneando(true);
    try {
      await fetch(apiUrl("/api/nvr-disks"), { method: "POST", credentials: "include" });
      await cargar();
    } catch { /* red */ }
    setEscaneando(false);
  };

  if (faltaSesion) return (
    <div className="cm-vacio"><p><b>Hace falta iniciar sesión para ver el estado de los discos.</b></p></div>
  );
  if (cargando) return <p className="cm-gris">Cargando…</p>;

  const fecha = (ts: number) => new Date(ts).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="cm-discos-cfg">
        <div className="cm-cfg-item">
          <label className="cm-check">
            <input type="checkbox" checked={!!config?.habilitado} onChange={(e) => guardarConfig({ habilitado: e.target.checked })} />
            Revisión diaria automática
          </label>
        </div>
        <div className="cm-cfg-item">
          <span className="cm-gris" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{I.reloj(GRIS)} Hora</span>
          <input type="time" className="cm-input" value={config?.hora || "07:00"} onChange={(e) => guardarConfig({ hora: e.target.value })} disabled={!config?.habilitado} />
        </div>
        <div className="cm-cfg-item">
          <label className="cm-check">
            <input type="checkbox" checked={!!config?.soloProblemas} onChange={(e) => guardarConfig({ soloProblemas: e.target.checked })} />
            Avisar sólo ante falla (ignorar "atención")
          </label>
        </div>
        <span style={{ flex: 1 }} />
        {guardado && <span className="cm-guardado">✓ guardado</span>}
        <button className="cm-btn cm-btn-pri" onClick={escanearAhora} disabled={escaneando}>
          {I.radar()} {escaneando ? "Escaneando…" : "Escanear ahora"}
        </button>
      </div>

      <div className="cm-aviso" style={{ borderColor: `${AZUL}55`, background: `${AZUL}0e` }}>
        <span style={{ color: AZUL_CLARO, display: "inline-flex", marginTop: 2 }}>{I.disco2(AZUL_CLARO)}</span>
        <span>
          La revisión recorre el SMART de cada grabador Hikvision alcanzable. Cuando un disco falla, avisa
          por un monitor <b>push en Uptime Kuma</b> ("Discos NVR · …") que dispara las notificaciones que ya
          tenés (Telegram, correo, etc.). Activá la notificación en ese monitor una vez desde Kuma.
          {ultimo && <> · Último escaneo: <b>{fecha(ultimo)}</b></>}
        </span>
      </div>

      {datos.length === 0 ? (
        <div className="cm-vacio"><p><b>Todavía no hay lecturas de discos.</b></p>
          <p>Apretá "Escanear ahora" para consultar los grabadores, o esperá la revisión diaria.</p></div>
      ) : (
        <div className="cm-discos-lista">
          {datos.map((d) => {
            const peor = (d.peor || "desconocido") as Salud;
            return (
              <div key={d.grabadorId} className="cm-disco-card" style={{ borderColor: SALUD_COLOR[peor] + "55" }}>
                <div className="cm-disco-head">
                  <span className="cm-punto" style={{ background: SALUD_COLOR[peor], boxShadow: `0 0 6px ${SALUD_COLOR[peor]}` }} />
                  <b>{d.etiqueta}</b>
                  {d.ip && <span className="cm-etq cm-mono">{d.ip}</span>}
                  <span className="cm-etq" style={{ color: SALUD_COLOR[peor], borderColor: SALUD_COLOR[peor] + "66" }}>{SALUD_TXT[peor]}</span>
                  <span style={{ flex: 1 }} />
                  {!d.alcanzable && <span className="cm-etq cm-etq-alerta">no alcanzable</span>}
                  <span className="cm-gris" style={{ fontSize: 11 }}>{fecha(d.ts)}</span>
                </div>
                {d.discos.length > 0 ? (
                  <div className="cm-disco-tabla-wrap">
                    <table className="cm-disco-tabla">
                      <thead><tr><th>Disco</th><th>Estado</th><th>SMART</th><th>Capacidad</th><th>Uso</th><th>Temp</th><th>Horas</th><th>Sect. malos</th></tr></thead>
                      <tbody>
                        {d.discos.map((h) => (
                          <tr key={h.id}>
                            <td><b>{h.nombre}</b> <span className="cm-gris">{h.propiedad}</span></td>
                            <td><span style={{ color: SALUD_COLOR[h.salud] }}>{h.estado}</span></td>
                            <td>{h.evaluacion || <span className="cm-gris">—</span>}</td>
                            <td className="cm-mono">{h.capacidadGB ? `${h.capacidadGB} GB` : "—"}</td>
                            <td>
                              <div className="cm-barra"><span style={{ width: `${h.usadoPct}%`, background: h.usadoPct > 92 ? ROJO : h.usadoPct > 80 ? AMBAR : VERDE }} /></div>
                              <span className="cm-gris" style={{ fontSize: 10.5 }}>{h.usadoPct}%</span>
                            </td>
                            <td className="cm-mono">{h.temperatura != null ? `${h.temperatura}°C` : "—"}</td>
                            <td className="cm-mono">{h.horasEncendido != null ? h.horasEncendido.toLocaleString() : "—"}</td>
                            <td className="cm-mono" style={{ color: (h.sectoresMalos ?? 0) > 0 ? ROJO : undefined }}>{h.sectoresMalos != null ? h.sectoresMalos : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="cm-gris" style={{ fontSize: 12.5, margin: "2px 2px 0" }}>Sin discos detectados (el equipo no los reportó o no responde ISAPI).</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ────────────────────────────────────────────── página ── */

type Vista = "muro" | "grabadores" | "discos" | "faltan";

export default function CamarasPage() {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [grabadores, setGrabadores] = useState<Grabador[]>([]);
  const [error, setError] = useState<string | null>(null);
  /**
   * Los grabadores traen IPs de gestión y usuarios, así que esa ruta pide sesión
   * mientras que la de cámaras es pública (la usan el quiosco y el móvil). Si no
   * se distinguiera, la pantalla mostraría "0 grabadores" a alguien que en
   * realidad tiene nueve y sólo le falta entrar: el peor cartel posible.
   */
  const [faltaSesion, setFaltaSesion] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>("muro");
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [canalAbierto, setCanalAbierto] = useState<{ canal: Canal; grabador: Grabador } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [rc, rg] = await Promise.all([
        fetch(apiUrl("/api/cameras"), { credentials: "include" }),
        fetch(apiUrl("/api/grabadores"), { credentials: "include" }),
      ]);
      const bc = await rc.json();
      const bg = await rg.json().catch(() => ({}));
      if (!rc.ok) { setError(bc?.error || `HTTP ${rc.status}`); setCargando(false); return; }
      setCamaras(bc.cameras || []);
      setFaltaSesion(rg.status === 401 || rg.status === 403);
      setGrabadores(rg.ok ? (bg.grabadores || []) : []);
      setError(null);
    } catch (e: any) { setError(e?.message || "Error de red"); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarPatron = async (id: string, patron: "hikvision" | "dahua") => {
    setGrabadores((p) => p.map((g) => (g.id === id ? { ...g, patron } : g)));
    await fetch(apiUrl("/api/grabadores"), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patron }),
    });
    await cargar();
  };

  const filtro = q.trim().toLowerCase();
  const enVivo = useMemo(() => camaras.filter(tieneVideo), [camaras]);
  const sinVideo = useMemo(() => camaras.filter((c) => !tieneVideo(c)), [camaras]);

  const muro = useMemo(() => enVivo.filter((c) =>
    !filtro || c.label.toLowerCase().includes(filtro) || c.mapName.toLowerCase().includes(filtro) || c.ip.includes(filtro)),
    [enVivo, filtro]);
  const grabsFiltrados = useMemo(() => grabadores.filter((g) =>
    !filtro || g.etiqueta.toLowerCase().includes(filtro) || g.mapa.toLowerCase().includes(filtro) ||
    g.rack.toLowerCase().includes(filtro) || g.ip.includes(filtro)),
    [grabadores, filtro]);
  const faltan = useMemo(() => sinVideo.filter((c) =>
    !filtro || c.label.toLowerCase().includes(filtro) || c.mapName.toLowerCase().includes(filtro) || c.ip.includes(filtro)),
    [sinVideo, filtro]);

  const porCliente = useMemo(() => {
    const m = new Map<string, Camara[]>();
    for (const c of muro) { const l = m.get(c.mapName) || []; l.push(c); m.set(c.mapName, l); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [muro]);

  const totalCanales = grabadores.reduce((n, g) => n + g.totalCanales, 0);

  return (
    <div className="cm-envoltura">
      <style>{CSS}</style>

      <header className="cm-cab">
        <div className="cm-logo">{I.camara("#fff")}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>Cámaras y grabadores</h1>
          <p>
            El muro son las cámaras que hoy dan imagen. Los grabadores traen su grilla
            de canales: se enciende el que se quiera mirar, y cuando un canal no se puede
            ver, dice por qué.
          </p>
        </div>
        <div className="cm-kpis">
          <div className="cm-kpi"><b style={{ color: enVivo.length ? VERDE : undefined }}>{enVivo.length}</b><span>En vivo</span></div>
          <div className="cm-kpi"><b style={{ color: sinVideo.length ? AMBAR : undefined }}>{sinVideo.length}</b><span>Sin configurar</span></div>
          <div className="cm-kpi"><b>{faltaSesion ? "—" : grabadores.length}</b><span>Grabadores</span></div>
          <div className="cm-kpi"><b>{faltaSesion ? "—" : totalCanales}</b><span>Canales</span></div>
        </div>
      </header>

      {error && <div className="cm-error">{error}</div>}

      <div className="cm-filtros">
        <div className="cm-segmentos" role="group" aria-label="Vista">
          {([["muro", `Muro (${enVivo.length})`], ["grabadores", faltaSesion ? "Grabadores" : `Grabadores (${grabadores.length})`], ["discos", "Discos"], ["faltan", `Sin configurar (${sinVideo.length})`]] as Array<[Vista, string]>).map(([k, t]) => (
            <button key={k} className={`cm-seg${vista === k ? " act" : ""}`} onClick={() => setVista(k)}>{t}</button>
          ))}
        </div>
        <div className="cm-buscador">
          {I.lupa(GRIS)}
          <input className="cm-input cm-limpio" placeholder="Buscar cámara, cliente o IP…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="cm-btn cm-mini" onClick={() => setQ("")} aria-label="Limpiar">{I.x()}</button>}
        </div>
      </div>

      {cargando ? <p className="cm-gris">Cargando…</p> : (
        <>
          {vista === "muro" && (
            enVivo.length === 0 ? (
              <div className="cm-vacio">
                <p><b>Ninguna cámara tiene video configurado.</b></p>
                <p>Hay {sinVideo.length} nodos de cámara en los mapas sin URL de stream. Están en la pestaña "Sin configurar".</p>
              </div>
            ) : porCliente.map(([cliente, lista]) => (
              <section key={cliente} className="cm-bloque">
                <h2>{cliente} <span className="cm-gris">· {lista.length}</span></h2>
                <div className="cm-muro">
                  {lista.map((c) => {
                    const i = muro.indexOf(c);
                    return (
                      <Recuadro key={c.nodeId}
                        streamRef={c.streamRefBaja || c.streamRef}
                        streamUrl={c.streamUrl}
                        titulo={c.label}
                        subtitulo={c.ip}
                        encendido
                        onAmpliar={() => setAbierta(i)}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          )}

          {vista === "grabadores" && (
            faltaSesion ? (
              <div className="cm-vacio">
                <p><b>Hace falta iniciar sesión para ver los grabadores.</b></p>
                <p>
                  El muro se puede mirar sin entrar —lo usan el quiosco y el móvil—, pero la lista de
                  grabadores trae las IP de gestión y los usuarios de cada equipo, así que sólo se
                  muestra a un operador con sesión abierta.
                </p>
              </div>
            ) : grabsFiltrados.length === 0 ? (
              <div className="cm-vacio"><p><b>No hay grabadores documentados.</b></p>
                <p>Se leen de los dispositivos NVR/DVR dentro de los racks y de los nodos de grabador de los mapas.</p></div>
            ) : (
              <div className="cm-lista-grab">
                {grabsFiltrados.map((g) => (
                  <TarjetaGrabador key={g.id} g={g}
                    onAmpliar={(canal) => setCanalAbierto({ canal, grabador: g })}
                    onPatron={cambiarPatron} />
                ))}
              </div>
            )
          )}

          {vista === "discos" && <DiscosVista faltaSesion={faltaSesion} />}

          {vista === "faltan" && (
            faltan.length === 0 ? (
              <div className="cm-vacio"><p><b>Todas las cámaras tienen video configurado.</b></p></div>
            ) : (
              <>
                <div className="cm-aviso">
                  <span style={{ color: AMBAR, display: "inline-flex", marginTop: 2 }}>{I.alerta(AMBAR)}</span>
                  <span>
                    Estos nodos están dibujados como cámara en el mapa pero <b>no tienen URL de stream</b>.
                    Antes se pintaban en el muro como recuadros negros para siempre; ahora se cuentan acá.
                    Se arreglan desde el mapa, en el nodo, cargando el RTSP.
                  </span>
                </div>
                <div className="cm-tabla-wrap">
                  <table className="cm-tabla">
                    <thead><tr><th>Cliente</th><th>Cámara</th><th>IP</th><th>Falta</th></tr></thead>
                    <tbody>
                      {faltan.map((c) => (
                        <tr key={c.nodeId}>
                          <td>{c.mapName}</td>
                          <td><b>{c.label}</b></td>
                          <td className="cm-mono">{c.ip || <span className="cm-gris">—</span>}</td>
                          <td className="cm-gris">{c.ip ? "URL de stream" : "IP y URL de stream"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
        </>
      )}

      {abierta != null && muro[abierta] && (
        <Visor
          fuente={{ streamRef: muro[abierta].streamRef, streamUrl: muro[abierta].streamUrl }}
          titulo={muro[abierta].label}
          subtitulo={`${muro[abierta].mapName} · ${muro[abierta].ip}`}
          onCerrar={() => setAbierta(null)}
          onAnterior={muro.length > 1 ? () => setAbierta((i) => ((i ?? 0) - 1 + muro.length) % muro.length) : undefined}
          onSiguiente={muro.length > 1 ? () => setAbierta((i) => ((i ?? 0) + 1) % muro.length) : undefined}
        />
      )}

      {canalAbierto && (
        <Visor
          fuente={{ streamRef: canalAbierto.canal.streamRef }}
          titulo={`${canalAbierto.grabador.etiqueta} · CH${canalAbierto.canal.canal}`}
          subtitulo={canalAbierto.canal.camara || canalAbierto.grabador.mapa}
          onCerrar={() => setCanalAbierto(null)}
        />
      )}
    </div>
  );
}

const CSS = `
.cm-envoltura{max-width:1400px;margin:0 auto;padding:26px 20px 70px;color:var(--foreground)}
.cm-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.cm-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${AZUL},#0f3f9e);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px ${AZUL}45;flex:none}
.cm-cab h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.3px}
.cm-cab p{color:var(--muted-foreground);margin:3px 0 0;font-size:13px;max-width:72ch;line-height:1.55}
.cm-kpis{display:flex;gap:8px;flex-wrap:wrap}
.cm-kpi{text-align:center;padding:7px 15px;border-radius:10px;background:var(--surface-card);border:1px solid var(--border);min-width:86px}
.cm-kpi b{display:block;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.cm-kpi span{font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.5px}
.cm-error{background:rgba(220,38,38,.12);border:1px solid ${ROJO};color:#f87171;padding:10px 14px;border-radius:9px;margin-bottom:12px;font-size:13px}
.cm-gris{color:var(--muted-foreground)}
.cm-mono{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}

.cm-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.cm-segmentos{display:flex;align-items:center;background:var(--surface-elevated);border:1px solid var(--border);border-radius:9px;padding:2px;gap:2px}
.cm-etq-seg{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground);padding:0 8px 0 7px}
.cm-seg{background:transparent;border:none;color:var(--muted-foreground);font:inherit;font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:7px;cursor:pointer;white-space:nowrap}
.cm-seg:hover{color:var(--text-secondary)}
.cm-seg.act{background:var(--card);color:${AZUL_CLARO};box-shadow:0 1px 3px rgba(0,0,0,.14)}
.cm-buscador{display:flex;align-items:center;gap:7px;flex:1;min-width:200px;max-width:340px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:0 8px 0 11px}
.cm-input{background:var(--card);border:1px solid var(--border);color:var(--foreground);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;outline:none}
.cm-limpio{flex:1;min-width:0;border:none!important;background:transparent!important;padding-left:0}
.cm-btn{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);color:var(--foreground);font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}
.cm-btn:hover{background:var(--surface-hover)}
.cm-btn:disabled{opacity:.55;cursor:default}
.cm-mini{padding:3px 6px;border:none;background:transparent}

.cm-bloque{margin-bottom:20px}
.cm-bloque h2{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-secondary);margin:0 0 8px}
.cm-muro{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}

.cm-recuadro{position:relative;border-radius:11px;overflow:hidden;background:#0b0f17;border:1px solid var(--border);display:flex;align-items:center;justify-content:center}
.cm-lienzo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .18s}
.cm-estado{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11.5px;color:#8493a8;pointer-events:none}
.cm-estado-grande{font-size:14px}
.cm-latiendo{animation:cm-late 1.4s ease-in-out infinite}
@keyframes cm-late{0%,100%{opacity:.35}50%{opacity:.9}}
.cm-encender{position:relative;z-index:2;display:inline-flex;align-items:center;gap:7px;background:rgba(27,95,217,.9);border:none;color:#fff;font:inherit;font-size:12.5px;font-weight:600;padding:7px 15px;border-radius:99px;cursor:pointer}
.cm-encender:hover{background:${AZUL_CLARO}}
.cm-pie{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:6px 9px;background:linear-gradient(transparent,rgba(0,0,0,.82));color:#fff;font-size:11.5px}
.cm-pie-txt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-pie .cm-gris{color:rgba(255,255,255,.55)}
.cm-pie-acc{display:flex;gap:4px;flex:none}
.cm-icono{display:inline-flex;background:rgba(255,255,255,.12);border:none;color:#fff;padding:4px;border-radius:6px;cursor:pointer}
.cm-icono:hover{background:rgba(255,255,255,.24)}

.cm-lista-grab{display:flex;flex-direction:column;gap:9px}
.cm-grab{border:1px solid var(--border);border-radius:13px;background:var(--card);overflow:hidden}
.cm-grab.abierto{border-color:${AZUL}55}
.cm-grab-cab{display:flex;align-items:center;gap:10px;padding:11px 13px;cursor:pointer;outline:none}
.cm-grab-cab:hover{background:var(--surface-hover)}
.cm-chevron{display:inline-flex;color:var(--muted-foreground);flex:none;transition:transform .14s}
.cm-chevron.abajo{transform:rotate(90deg)}
.cm-grab-ico{display:inline-flex;flex:none}
.cm-grab-nom{flex:1;min-width:0;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-grab-datos{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;flex:none}
.cm-etq{font-size:10.5px;font-weight:600;color:var(--text-secondary);border:1px solid var(--border);border-radius:5px;padding:1px 7px;white-space:nowrap}
.cm-etq-alerta{color:${AMBAR};border-color:${AMBAR}66}

.cm-grab-cuerpo{border-top:1px solid var(--border);padding:11px 13px 13px}
.cm-grab-barra{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.cm-nota-alerta{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text-secondary)}
.cm-prueba{display:flex;flex-direction:column;gap:2px;border:1px solid ${AMBAR}55;background:${AMBAR}0e;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.5}
.cm-prueba.ok{border-color:${VERDE}55;background:${VERDE}0e}
.cm-prueba b{font-variant-numeric:tabular-nums;font-size:12px}
.cm-prueba span{color:var(--text-secondary)}

.cm-canales{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:9px}
.cm-canal{display:flex;flex-direction:column;gap:3px}
.cm-canal-vacio{height:128px;border:1px dashed var(--border);border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:var(--surface-card);padding:8px;text-align:center}
.cm-canal-num{font-size:12px;font-weight:700;color:var(--text-secondary)}
.cm-canal-nom{font-size:11.5px;color:var(--muted-foreground);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-canal-falta{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:${AMBAR};margin-top:2px}
.cm-canal-meta{display:flex;gap:7px;flex-wrap:wrap;font-size:10.5px;color:var(--muted-foreground);padding-left:2px}

.cm-aviso{display:flex;align-items:flex-start;gap:9px;border:1px solid ${AMBAR}55;background:${AMBAR}0e;border-radius:11px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:var(--text-secondary)}
.cm-vacio{border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--muted-foreground);font-size:13px;line-height:1.6}
.cm-vacio p{margin:0 0 6px;max-width:62ch;margin-inline:auto}
.cm-vacio b{color:var(--foreground)}

.cm-tabla-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card)}
.cm-tabla{width:100%;min-width:640px;border-collapse:collapse;font-size:13px}
.cm-tabla thead th{text-align:left;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-foreground);padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
.cm-tabla td{padding:9px 12px;border-top:1px solid var(--border)}
.cm-tabla tbody tr:hover{background:var(--surface-hover)}

.cm-visor{position:fixed;inset:0;z-index:60;background:rgba(4,7,12,.9);display:flex;align-items:center;justify-content:center;padding:22px}
.cm-visor-caja{width:min(1180px,100%);background:#0b0f17;border:1px solid rgba(255,255,255,.12);border-radius:14px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.6)}
.cm-visor-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 13px;color:#e6edf6;font-size:13.5px;border-bottom:1px solid rgba(255,255,255,.1)}
.cm-visor-cab .cm-gris{color:rgba(255,255,255,.5)}
.cm-visor-video{position:relative;aspect-ratio:16/9;background:#05080d}
.cm-flecha{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.45);border:none;color:#fff;padding:12px 9px;cursor:pointer;border-radius:9px}
.cm-flecha:hover{background:rgba(0,0,0,.7)}
.cm-flecha.izq{left:10px}
.cm-flecha.der{right:10px}

.cm-btn-pri{background:${AZUL};border-color:${AZUL};color:#fff}
.cm-btn-pri:hover{background:${AZUL_CLARO};border-color:${AZUL_CLARO}}
.cm-btn-pri:disabled{opacity:.6}

/* Detección en vivo dentro de la tarjeta del grabador */
.cm-vivo{display:flex;flex-direction:column;gap:8px;border:1px solid ${AZUL}44;background:${AZUL}0c;border-radius:10px;padding:9px 12px;margin-bottom:10px}
.cm-vivo-info{display:flex;gap:6px;flex-wrap:wrap}
.cm-vivo-discos{display:flex;gap:6px;flex-wrap:wrap}
.cm-disco-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);border:1px solid var(--border);border-radius:7px;padding:3px 9px;white-space:nowrap}
.cm-disco-chip b{color:var(--foreground)}
.cm-punto{width:8px;height:8px;border-radius:99px;flex:none}
.cm-vivo-on{color:${VERDE};font-weight:600}
.cm-vivo-off{color:${GRIS}}
.cm-rec{color:#fff;background:${ROJO};font-weight:700;font-size:9px;padding:1px 5px;border-radius:4px;letter-spacing:.5px}

/* Pestaña Discos */
.cm-discos-cfg{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid var(--border);background:var(--card);border-radius:12px;padding:11px 14px;margin-bottom:12px}
.cm-cfg-item{display:flex;align-items:center;gap:8px;font-size:13px}
.cm-check{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--foreground)}
.cm-check input{width:15px;height:15px;accent-color:${AZUL}}
.cm-guardado{color:${VERDE};font-size:12px;font-weight:600}
.cm-discos-lista{display:flex;flex-direction:column;gap:10px}
.cm-disco-card{border:1px solid var(--border);border-radius:13px;background:var(--card);padding:11px 13px 13px}
.cm-disco-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:9px;font-size:13.5px}
.cm-disco-tabla-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:10px}
.cm-disco-tabla{width:100%;min-width:640px;border-collapse:collapse;font-size:12.5px}
.cm-disco-tabla thead th{text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted-foreground);padding:8px 11px;border-bottom:1px solid var(--border);white-space:nowrap}
.cm-disco-tabla td{padding:8px 11px;border-top:1px solid var(--border);white-space:nowrap;vertical-align:middle}
.cm-barra{display:inline-block;width:70px;height:6px;border-radius:99px;background:var(--surface-elevated);overflow:hidden;vertical-align:middle;margin-right:6px}
.cm-barra span{display:block;height:100%;border-radius:99px}

@media(max-width:640px){
  .cm-envoltura{padding:18px 14px 60px}
  .cm-kpis{width:100%}
  .cm-kpi{flex:1;min-width:0;padding:7px 8px}
  .cm-muro{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
  .cm-canales{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
  .cm-grab-datos{width:100%;justify-content:flex-start}
}
`;
