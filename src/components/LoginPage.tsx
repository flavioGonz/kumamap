"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import { useTheme } from "@/components/ThemeContext";
import { APP_VERSION } from "@/lib/changelog";
import createGlobe from "cobe";

interface LoginPageProps {
  onLogin: () => void;
}

interface AgentInfo {
  available: boolean;
  version?: string;
  file?: string;
  bytes?: number;
  url?: string;
  platform?: string;
}

/**
 * Los puntos del globo son resolvers DNS publicos reales y la latencia es una consulta
 * DNS de verdad hecha desde este controlador. No hay nada simulado aca.
 */
interface Resolver {
  id: string;
  nombre: string;
  operador: string;
  ip: string;
  ciudad: string;
  lat: number;
  lng: number;
  ms: number | null;
  estado: "ok" | "lento" | "caido" | "sin-dato";
}

const COLOR_ESTADO: Record<string, string> = {
  ok: "var(--kml-ok)",
  lento: "var(--kml-warn)",
  caido: "var(--kml-crit)",
  "sin-dato": "var(--kml-stage-muted)",
};

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  return (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
}


export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [resolvers, setResolvers] = useState<Resolver[]>([]);
  const [medidoEn, setMedidoEn] = useState<number>(0);

  const { resolvedTheme, setTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const phiRef = useRef(4.3);
  const marcadoresRef = useRef<Array<{ location: [number, number]; size: number }>>([]);

  // cobe recibe los marcadores al construirse: los dejamos en un ref para que el
  // efecto del globo los lea sin volver a montarse en cada medicion.
  marcadoresRef.current = resolvers.length
    ? resolvers.map((r) => ({
        location: [r.lat, r.lng] as [number, number],
        size: r.estado === "caido" ? 0.09 : r.estado === "lento" ? 0.06 : 0.04,
      }))
    : [];

  // ---- agente disponible para descargar -----------------------------------
  useEffect(() => {
    let alive = true;
    fetch(apiUrl("/api/agent/latest"))
      .then((r) => r.json())
      .then((d: AgentInfo) => {
        if (alive) setAgent(d);
      })
      .catch(() => {
        if (alive) setAgent({ available: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  // ---- estado real de los resolvers DNS publicos ---------------------------
  useEffect(() => {
    let vivo = true;
    const traer = () => {
      fetch(apiUrl("/api/dns-watch"))
        .then((r) => r.json())
        .then((d: { at: number; resolvers: Resolver[] }) => {
          if (!vivo || !d?.resolvers) return;
          setResolvers(d.resolvers);
          setMedidoEn(d.at || 0);
        })
        .catch(() => {});
    };
    traer();
    const t = setInterval(traer, 60000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  // ---- globo ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const dark = resolvedTheme !== "light";
    let globe: { destroy: () => void } | null = null;
    let raf = 0;

    const build = () => {
      if (globe) {
        globe.destroy();
        globe = null;
      }
      const box = stage.getBoundingClientRect();
      const size = Math.round(Math.max(260, Math.min(box.height * 0.82, box.width * 0.86, 760)));
      canvas.style.width = size + "px";
      canvas.style.height = size + "px";
      // Escala de cobe/phenomenon, medida en esta pagina:
      //   buffer del canvas = tamano CSS x devicePixelRatio (lo fija phenomenon)
      //   diametro del globo (en px de buffer) = width / devicePixelRatio
      // Con dpr 1 y width = tamano CSS, el globo ocupa exactamente el lienzo.
      // OJO con la version: la 0.6.4 no dibuja el mapa de puntos (solo la
      // esfera), por eso el proyecto usa cobe 0.6.3.
      globe = createGlobe(canvas, {
        devicePixelRatio: 1,
        width: size,
        height: size,
        phi: phiRef.current,
        theta: 0.24,
        dark: 0,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: dark ? 4.2 : 6,
        baseColor: dark ? [0.19, 0.26, 0.4] : [1, 1, 1],
        markerColor: dark ? [0.33, 0.72, 1] : [0.1, 0.35, 0.84],
        glowColor: dark ? [0.24, 0.39, 0.75] : [0.8, 0.86, 0.96],
        opacity: 1,
        // Un punto por resolver. cobe no admite un color por marcador, asi que el
        // estado se nota en el tamano: el que no responde se dibuja mas grande.
        markers: marcadoresRef.current,
        onRender: (state: Record<string, number>) => {
          state.phi = phiRef.current;
          phiRef.current += 0.0028;
        },
      });
    };

    build();
    let t: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(build, 220);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t) clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
      if (globe) globe.destroy();
    };
  }, [resolvedTheme, resolvers]);

  // ---- login ---------------------------------------------------------------
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);
      try {
        const res = await fetch(apiUrl("/api/auth"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("kumamap_user", data.username);
          onLogin();
        } else {
          setError(data.error || "Credenciales inválidas");
        }
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    },
    [username, password, onLogin]
  );

  const isLight = resolvedTheme === "light";

  // Cuatro chapas sobre el globo. Muestran primero lo que no esta bien; si esta todo
  // en orden, un operador distinto en cada una — repetir Cloudflare cuatro veces no
  // le dice nada a nadie.
  const destacados = (() => {
    const malos = resolvers.filter((r) => r.estado === "caido" || r.estado === "lento");
    const elegidos: Resolver[] = malos.slice(0, 4);
    const vistos = new Set(elegidos.map((r) => r.operador));
    for (const r of resolvers) {
      if (elegidos.length >= 4) break;
      if (vistos.has(r.operador)) continue;
      vistos.add(r.operador);
      elegidos.push(r);
    }
    return elegidos;
  })();

  return (
    <div className="kml">
      <style>{CSS}</style>

      <section className="kml-side">
        <div className="kml-top">
          <div className="kml-brand">
            <div className="kml-mark">
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path
                  d="M4 26V9l8-3 8 3 8-3v17l-8 3-8-3-8 3Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  opacity="0.35"
                />
                <path d="M12 6v17M20 9v17" stroke="currentColor" strokeWidth="1.8" opacity="0.35" />
                <circle cx="12" cy="13" r="3" fill="var(--kml-brand)" />
                <circle cx="22" cy="20" r="2.4" fill="var(--kml-signal)" />
                <path d="M12 13 22 20" stroke="var(--kml-brand)" strokeWidth="1.6" />
              </svg>
              <span className="kml-name">
                Kuma<b>Map</b>
              </span>
            </div>
            <div className="kml-tag">Monitoreo de infraestructura</div>
          </div>

          <button
            type="button"
            className="kml-theme"
            onClick={() => setTheme(isLight ? "dark" : "light")}
            aria-label={isLight ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
            title={isLight ? "Tema oscuro" : "Tema claro"}
          >
            {isLight ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
              </svg>
            )}
          </button>
        </div>

        <div className="kml-form-wrap">
          <form onSubmit={handleSubmit} autoComplete="off">
            <h1>Bienvenido de nuevo</h1>
            <p className="kml-lede">Ingresá para ver el estado de tus nodos, enlaces y servidores.</p>

            <div className="kml-field">
              <div className="kml-lbl">
                <label htmlFor="kml-user">Usuario</label>
              </div>
              <div className="kml-input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
                </svg>
                <input
                  id="kml-user"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  autoComplete="username"
                  placeholder="admin"
                />
              </div>
            </div>

            <div className="kml-field">
              <div className="kml-lbl">
                <label htmlFor="kml-pass">Contraseña</label>
                <span className="kml-hint-inline">Credenciales de Uptime Kuma</span>
              </div>
              <div className="kml-input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                  <rect x="4" y="10" width="16" height="10" rx="2.4" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  id="kml-pass"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="........"
                />
                <button
                  type="button"
                  className="kml-reveal"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Ocultar la contraseña" : "Mostrar la contraseña"}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            {error && <div className="kml-error">{error}</div>}

            <button className="kml-submit" type="submit" disabled={loading || !username || !password}>
              <span>{loading ? "Conectando a Kuma..." : "Acceder al panel"}</span>
              {!loading && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>

            <div className="kml-rule">Agente para servidores</div>

            {agent && agent.available ? (
              <a className="kml-agent" href={apiUrl(agent.url || "")} download={agent.file}>
                <span className="kml-agent-ico">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3 5.6l7.2-1v7.1H3V5.6Zm8.5-1.2L21 3v8.7h-9.5V4.4ZM3 12.9h7.2V20L3 19V12.9Zm8.5 0H21V21l-9.5-1.3v-6.8Z" />
                  </svg>
                </span>
                <span className="kml-agent-txt">
                  <b>Descargar monitor-ng para Windows</b>
                  <span className="kml-mono">
                    v{agent.version} - {agent.platform} - {formatSize(agent.bytes)}
                  </span>
                </span>
                <svg className="kml-agent-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v12M6 12l6 6 6-6" />
                </svg>
              </a>
            ) : (
              <div className="kml-agent kml-agent-off">
                <span className="kml-agent-ico">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3 5.6l7.2-1v7.1H3V5.6Zm8.5-1.2L21 3v8.7h-9.5V4.4ZM3 12.9h7.2V20L3 19V12.9Zm8.5 0H21V21l-9.5-1.3v-6.8Z" />
                  </svg>
                </span>
                <span className="kml-agent-txt">
                  <b>Agente monitor-ng para Windows</b>
                  <span className="kml-mono">Todavía no hay instalador publicado</span>
                </span>
              </div>
            )}
          </form>
        </div>

        <div className="kml-foot">
          <span>Infratec - KumaMap</span>
          <span className="kml-mono kml-ver">
            <i />v{APP_VERSION}
          </span>
        </div>
      </section>

      <section className="kml-stage" ref={stageRef} aria-hidden="true">
        <div className="kml-stage-head">
          <div className="kml-eyebrow">Red en vivo</div>
          <h2>Todos tus sitios, enlaces y servidores en un solo mapa.</h2>
        </div>

        <div className="kml-globe-hold">
          <canvas ref={canvasRef} className="kml-globe" />
        </div>

        {destacados.map((r, i) => (
          <div key={r.id} className={"kml-badge kml-e-" + r.estado} style={BADGE_SPOTS[i]}>
            <i />
            <span className="kml-who">
              <b>{r.nombre}</b>
              <span className="kml-mono">{r.ip}</span>
            </span>
            <span className="kml-ms kml-mono">{r.ms === null ? "s/r" : r.ms + " ms"}</span>
          </div>
        ))}

        <div className="kml-feed">
          <div className="kml-feed-head">
            DNS públicos · latencia desde Montevideo
          </div>
          {resolvers.length === 0 && <div className="kml-feed-row">midiendo…</div>}
          {resolvers.slice(0, 12).map((r) => (
            <div className="kml-feed-row" key={r.id}>
              <span className="kml-dot" style={{ background: COLOR_ESTADO[r.estado] }} />
              <span className="kml-feed-ip">
                {r.nombre} <span className="kml-mono kml-feed-addr">{r.ip}</span>
              </span>
              <span className="kml-feed-v kml-mono">{r.ms === null ? "—" : r.ms + " ms"}</span>
            </div>
          ))}
          {medidoEn > 0 && (
            <div className="kml-feed-pie">
              medido {new Date(medidoEn).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const BADGE_SPOTS: React.CSSProperties[] = [
  { top: "26%", left: "3%" },
  { top: "41%", left: "20%" },
  { top: "60%", left: "5%" },
  { top: "73%", left: "23%" },
];

/* --------------------------------------------------------------------------
   Estilos del login. Oscuro por defecto (igual que el resto de la app) y
   claro cuando el ThemeProvider pone data-theme="light" en <html>.
   No se usan webfonts: la CSP del proyecto es font-src 'self' data:.
   -------------------------------------------------------------------------- */
const CSS = `
.kml{
  --kml-brand:#4f8cf5; --kml-brand-deep:#1b5fd9; --kml-signal:#38bdf8;
  --kml-brand-soft:rgba(79,140,245,.16);
  --kml-panel:#0b1220; --kml-ink:#e9f0fb; --kml-ink-2:#b7c6dc; --kml-muted:#7f92ad;
  --kml-field:#101a2c; --kml-line:#1a2537; --kml-line-2:#22304a;
  --kml-stage-1:#0a1020; --kml-stage-2:#111e3a;
  --kml-stage-ink:#e9f0fb; --kml-stage-muted:#93a8c8;
  --kml-stage-card:rgba(12,20,38,.72); --kml-stage-line:rgba(255,255,255,.14);
  --kml-radius:12px;
  position:fixed; inset:0; display:grid; grid-template-columns:minmax(380px,44%) 1fr;
  background:var(--kml-panel); color:var(--kml-ink); overflow:hidden;
  font-family:var(--font-sans,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);
  font-size:15px; line-height:1.5;
}
:root[data-theme="light"] .kml{
  --kml-brand:#1b5fd9; --kml-brand-deep:#0b3c8f; --kml-signal:#0ea5e9;
  --kml-brand-soft:rgba(27,95,217,.10);
  --kml-panel:#ffffff; --kml-ink:#0c1524; --kml-ink-2:#3d4c63; --kml-muted:#7387a3;
  --kml-field:#eef2f9; --kml-line:#e3eaf5; --kml-line-2:#d9e2f0;
}
.kml *{box-sizing:border-box}
.kml-mono{font-family:ui-monospace,"Cascadia Mono",Consolas,"Liberation Mono",monospace;
  font-variant-numeric:tabular-nums}

/* ---- panel izquierdo ---- */
.kml-side{display:flex;flex-direction:column;gap:16px;padding:clamp(22px,3vw,44px);overflow-y:auto}
.kml-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.kml-brand{display:flex;flex-direction:column;gap:3px;color:var(--kml-ink)}
.kml-mark{display:flex;align-items:center;gap:9px}
.kml-name{font-size:19px;font-weight:700;letter-spacing:-.02em}
.kml-name b{color:var(--kml-brand);font-weight:700}
.kml-tag{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--kml-muted);font-weight:600}
.kml-theme{width:38px;height:38px;flex:0 0 38px;border-radius:50%;border:1px solid var(--kml-line);
  background:transparent;color:var(--kml-ink-2);cursor:pointer;display:grid;place-items:center;transition:.18s}
.kml-theme:hover{border-color:var(--kml-brand);color:var(--kml-brand)}
.kml-theme:focus-visible{outline:2px solid var(--kml-brand);outline-offset:2px}

/* margin auto en vez de align-items:center: si el formulario no entra, desborda
   hacia abajo y la columna scrollea, en vez de montarse sobre la marca */
.kml-form-wrap{flex:1;display:flex;justify-content:center;min-height:0}
.kml-form-wrap form{width:100%;max-width:380px;margin-block:auto}
.kml h1{font-size:clamp(26px,3vw,33px);line-height:1.15;font-weight:700;letter-spacing:-.03em;
  margin:0 0 6px;text-wrap:balance}
.kml-lede{color:var(--kml-muted);margin:0 0 26px;font-size:14.5px}

.kml-field{margin-bottom:16px}
.kml-lbl{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:7px}
.kml-lbl label{font-size:12.5px;font-weight:600;color:var(--kml-ink-2)}
.kml-hint-inline{font-size:11.5px;color:var(--kml-muted)}
.kml-input{display:flex;align-items:center;gap:10px;background:var(--kml-field);
  border:1px solid transparent;border-radius:var(--kml-radius);padding:0 13px;transition:.16s}
.kml-input:focus-within{border-color:var(--kml-brand);box-shadow:0 0 0 4px var(--kml-brand-soft)}
.kml-input > svg{width:17px;height:17px;color:var(--kml-muted);flex:0 0 17px}
.kml-input input{flex:1;min-width:0;border:0;background:none;outline:none;color:var(--kml-ink);
  font:inherit;padding:12px 0}
.kml-input input::placeholder{color:var(--kml-muted)}
.kml-reveal{border:0;background:none;color:var(--kml-muted);cursor:pointer;padding:4px;
  display:grid;place-items:center;border-radius:6px}
.kml-reveal:hover{color:var(--kml-brand)}
.kml-reveal:focus-visible{outline:2px solid var(--kml-brand);outline-offset:1px}

.kml-error{margin-top:4px;margin-bottom:12px;border-radius:var(--kml-radius);padding:10px 13px;
  font-size:12.5px;font-weight:500;background:rgba(239,68,68,.10);
  border:1px solid rgba(239,68,68,.28);color:#f87171}

.kml-submit{width:100%;margin-top:10px;border:0;border-radius:var(--kml-radius);padding:14px 18px;
  cursor:pointer;font:inherit;font-weight:600;color:#fff;
  background:linear-gradient(135deg,var(--kml-brand),var(--kml-brand-deep));
  display:flex;align-items:center;justify-content:center;gap:10px;transition:.16s;
  box-shadow:0 10px 24px -10px var(--kml-brand)}
.kml-submit:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.06)}
.kml-submit:disabled{opacity:.45;cursor:default;box-shadow:none}
.kml-submit:focus-visible{outline:2px solid var(--kml-brand);outline-offset:3px}
.kml-submit svg{width:16px;height:16px}

.kml-rule{display:flex;align-items:center;gap:14px;margin:24px 0 16px;color:var(--kml-muted);
  font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
.kml-rule::before,.kml-rule::after{content:"";height:1px;background:var(--kml-line);flex:1}

.kml-agent{display:flex;align-items:center;gap:13px;width:100%;padding:13px 15px;
  border-radius:var(--kml-radius);border:1px solid var(--kml-line);background:transparent;
  color:var(--kml-ink);text-decoration:none;transition:.18s}
.kml-agent:hover{border-color:var(--kml-brand);background:var(--kml-brand-soft);transform:translateY(-1px)}
.kml-agent-off{opacity:.55;pointer-events:none}
.kml-agent-ico{width:34px;height:34px;flex:0 0 34px;border-radius:9px;background:var(--kml-brand-soft);
  color:var(--kml-brand);display:grid;place-items:center}
.kml-agent-ico svg{width:17px;height:17px}
.kml-agent-txt{flex:1;min-width:0}
.kml-agent-txt b{display:block;font-size:13.5px;font-weight:600}
.kml-agent-txt span{display:block;font-size:12px;color:var(--kml-muted)}
.kml-agent-arrow{width:16px;height:16px;flex:0 0 16px;color:var(--kml-muted)}

.kml-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;
  color:var(--kml-muted);font-size:11.5px}
.kml-ver{display:flex;align-items:center;gap:7px}
.kml-ver i{width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block}

/* ---- panel derecho: el globo ---- */
.kml-stage{position:relative;overflow:hidden;min-height:0;color:var(--kml-stage-ink);
  background:radial-gradient(120% 100% at 78% 6%,var(--kml-stage-2) 0%,var(--kml-stage-1) 58%)}
.kml-stage::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(60% 50% at 50% 45%,transparent 40%,rgba(3,7,16,.55) 100%)}
.kml-globe-hold{position:absolute;inset:0}
.kml-globe{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;
  max-width:100%;filter:drop-shadow(0 30px 70px rgba(0,0,0,.45))}

.kml-stage-head{position:absolute;top:clamp(20px,3vw,34px);left:clamp(20px,3vw,38px);
  right:clamp(20px,3vw,38px);z-index:3}
.kml-eyebrow{font-size:10px;letter-spacing:.24em;text-transform:uppercase;
  color:var(--kml-stage-muted);font-weight:600}
.kml-stage h2{margin:8px 0 0;font-size:clamp(18px,1.9vw,24px);font-weight:600;
  letter-spacing:-.02em;max-width:22ch;text-wrap:balance}

.kml-badge{position:absolute;z-index:3;display:flex;align-items:center;gap:9px;padding:8px 11px;
  border-radius:10px;background:var(--kml-stage-card);border:1px solid var(--kml-stage-line);
  backdrop-filter:blur(9px);box-shadow:0 12px 30px rgba(0,0,0,.4);animation:kmlFloat 7s ease-in-out infinite}
@keyframes kmlFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.kml-badge > i{width:7px;height:7px;border-radius:50%;flex:0 0 7px;position:relative;background:currentColor}
.kml-badge > i::after{content:"";position:absolute;inset:-4px;border-radius:50%;
  border:1px solid currentColor;opacity:.5;animation:kmlPing 2.4s ease-out infinite}
@keyframes kmlPing{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.7);opacity:0}}
.kml-who{display:flex;flex-direction:column;line-height:1.25}
.kml-who b{font-size:12px;font-weight:600;color:var(--kml-stage-ink)}
.kml-who span{font-size:10.5px;color:var(--kml-stage-muted)}
.kml-ms{font-size:12px;font-weight:600}
.kml-s-ok{color:#4ade80}.kml-s-warn{color:#fbbf24}.kml-s-crit{color:#f87171}
.kml-e-ok{color:#4ade80}.kml-e-lento{color:#fbbf24}.kml-e-caido{color:#f87171}
.kml-e-sin-dato{color:var(--kml-stage-muted)}
.kml-dot{width:6px;height:6px;border-radius:50%;flex:0 0 6px;background:currentColor}

.kml-feed{position:absolute;right:clamp(20px,3vw,38px);bottom:clamp(58px,7vh,86px);z-index:3;
  width:224px;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;
  border:1px solid var(--kml-stage-line);background:var(--kml-stage-card);backdrop-filter:blur(9px)}
.kml-feed-head{padding:9px 12px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--kml-stage-muted);font-weight:600;border-bottom:1px solid var(--kml-stage-line)}
.kml-feed-row{display:flex;align-items:center;gap:9px;padding:8px 12px;font-size:11.5px}
.kml-feed-ip{flex:1;min-width:0;color:var(--kml-stage-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kml-feed-v{color:var(--kml-stage-muted);font-variant-numeric:tabular-nums}
.kml-feed{max-height:min(48vh,400px);overflow-y:auto;scrollbar-width:thin;
  scrollbar-color:var(--kml-stage-line) transparent}
.kml-feed::-webkit-scrollbar{width:6px}
.kml-feed::-webkit-scrollbar-thumb{background:var(--kml-stage-line);border-radius:99px}
.kml-feed::-webkit-scrollbar-track{background:transparent}
.kml-feed-head{position:sticky;top:0;z-index:1;background:var(--kml-stage-card)}

.kml-feed-addr{opacity:.6;font-size:10.5px}
.kml-feed-pie{padding:7px 12px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--kml-stage-muted);border-top:1px solid var(--kml-stage-line)}
.kml-badge-ms{font-variant-numeric:tabular-nums}

.kml-stage-foot{position:absolute;left:clamp(20px,3vw,38px);right:clamp(20px,3vw,38px);
  bottom:clamp(20px,3vw,30px);z-index:3;display:flex;justify-content:flex-start}
.kml-legend{display:flex;gap:14px;font-size:11.5px;color:var(--kml-stage-muted);flex-wrap:wrap}
.kml-legend div{display:flex;align-items:center;gap:6px}
.kml-legend i{width:7px;height:7px;border-radius:50%;display:inline-block}

@media (max-width:980px){
  .kml{grid-template-columns:1fr;grid-template-rows:38vh 1fr;overflow-y:auto}
  .kml-stage{order:-1;min-height:280px}
  .kml-feed{display:none}
  .kml-badge{display:none}
  .kml-stage h2{font-size:17px}
  .kml-side{padding-block:24px}
}
@media (prefers-reduced-motion:reduce){
  .kml *{animation:none !important;transition:none !important}
}
`;
