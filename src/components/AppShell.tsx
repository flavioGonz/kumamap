"use client";

/**
 * Marco de la aplicacion: una sola barra arriba, con el menu adentro.
 *
 * Por que una sola barra y no barra lateral: con dos paneles la pantalla se lee como
 * dos cosas distintas pegadas, y encima la lateral le roba ancho al contenido — las
 * paginas estaban escritas para ocupar la ventana entera y se les iba afuera, de ahi
 * las barras de desplazamiento de mas. Una barra al tope no compite por ancho con nada.
 *
 * La barra no cruza la pantalla de lado a lado: es una pastilla centrada que se
 * ajusta a su contenido y flota sobre el fondo. Una barra de borde a borde partia la
 * pantalla en dos y sobraba un vacio enorme en el medio; la pastilla ocupa lo que
 * necesita y deja respirar el contenido.
 *
 * Tres reglas que sostienen que se vea como una sola aplicacion:
 *   1. la barra usa el mismo fondo que la pagina, separada por una linea de un pixel:
 *      nada de tarjeta flotante con sombra, que es lo que da el efecto de iframe;
 *   2. hay un unico contenedor con desplazamiento (el contenido), nunca dos anidados;
 *   3. cada seccion entra con una animacion corta, asi el cambio se lee como
 *      navegacion y no como un salto.
 *
 * No se monta en el login, ni en la PWA movil, ni en el kiosco, ni en el editor de
 * mapas, que es un lienzo y necesita la pantalla entera.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/ThemeContext";
import { APP_VERSION } from "@/lib/changelog";

/* ─────────────────────────────────────────── migas ── */
interface Miga { texto: string; href?: string }
const CrumbCtx = createContext<{ set: (m: Miga[] | null) => void; ocultar: (v: boolean) => void }>({
  set: () => {},
  ocultar: () => {},
});

/**
 * Una pagina puede afinar su miga final cuando sabe algo que la ruta no dice
 * (el nombre del mapa, por ejemplo):  useMiga([{ texto: mapa.nombre }])
 */
export function useMiga(migas: Miga[] | null, deps: unknown[] = []) {
  const { set } = useContext(CrumbCtx);
  useEffect(() => {
    set(migas);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Una pagina puede pedir la pantalla entera mientras dura un modo suyo: el muro de
 * camaras o el modo NOC de alertas se miran de lejos y la barra estorba.
 */
export function useSinMarco(activo: boolean) {
  const { ocultar } = useContext(CrumbCtx);
  useEffect(() => {
    ocultar(activo);
    return () => ocultar(false);
  }, [activo, ocultar]);
}

/* ───────────────────────────────────────── secciones ── */
const ic = (d: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

interface Item { href: string; texto: string; icono: React.ReactNode; nota?: string }
interface Menu { id: string; texto: string; items: Item[] }

const MAPAS: Item = {
  href: "/", texto: "Mapas",
  icono: ic(<><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z" /><path d="M9 3v15M15 6v15" /></>),
};

const MENUS: Menu[] = [
  {
    id: "monitoreo", texto: "Monitoreo",
    items: [
      { href: "/monitors", texto: "Monitores", nota: "Todo lo que vigila Uptime Kuma",
        icono: ic(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />) },
      { href: "/alerts", texto: "Alertas", nota: "Qué se cayó y cuándo",
        icono: ic(<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>) },
      { href: "/traps", texto: "Traps SNMP", nota: "Avisos que mandan los equipos solos",
        icono: ic(<><path d="M12 12v8" /><path d="M5 8a7 7 0 0 1 14 0" /><path d="M8.5 10a3.5 3.5 0 0 1 7 0" /><circle cx="12" cy="12" r="1.5" /></>) },
      { href: "/sla", texto: "Disponibilidad", nota: "SLA por cliente, de las estadísticas de Kuma",
        icono: ic(<><path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.6 3.8 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>) },
    ],
  },
  {
    id: "infra", texto: "Infraestructura",
    items: [
      { href: "/monitor-ng", texto: "Servidores", nota: "Agentes monitor-ng en Windows",
        icono: ic(<><rect width="18" height="16" x="3" y="4" rx="2" /><path d="M3 12h4l2-5 3 9 2-4h5" /></>) },
      { href: "/cameras", texto: "Cámaras", nota: "Muro de video por mapa",
        icono: ic(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>) },
    ],
  },
  {
    id: "sistema", texto: "Sistema",
    items: [
      { href: "/metrics", texto: "Métricas", nota: "Salud del propio controlador",
        icono: ic(<><path d="M3 3v18h18" /><path d="m7 15 3-5 4 3 5-8" /></>) },
      { href: "/usuarios", texto: "Usuarios", nota: "Quién entra y con qué alcance",
        icono: ic(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
    ],
  },
];

const TODOS: Item[] = [MAPAS, ...MENUS.flatMap((m) => m.items)];

/** Rutas que se dibujan solas, sin marco. */
function sinMarco(p: string): boolean {
  return p.startsWith("/mobile") || p.startsWith("/view/") || p.startsWith("/embed")
    || p.startsWith("/map/");
}

/* ══════════════════════════════════════════ marco ══ */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [sesion, setSesion] = useState<string | null | undefined>(undefined);
  const [migaPagina, setMigaPagina] = useState<Miga[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [oculto, setOculto] = useState(false);
  const barraRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { setSesion(localStorage.getItem("kumamap_user")); } catch { setSesion(null); }
  }, [pathname]);

  // Cerrar cualquier desplegable al navegar o con Escape.
  useEffect(() => { setAbierto(null); }, [pathname]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const set = useCallback((m: Miga[] | null) => setMigaPagina(m), []);
  const ocultar = useCallback((v: boolean) => setOculto(v), []);
  const ctx = useMemo(() => ({ set, ocultar }), [set, ocultar]);

  const activo = useMemo(() => {
    if (pathname === "/") return MAPAS;
    return TODOS.filter((s) => s.href !== "/" && pathname.startsWith(s.href))
      .sort((a, b) => b.href.length - a.href.length)[0];
  }, [pathname]);

  const menuActivo = useMemo(
    () => MENUS.find((m) => m.items.some((i) => i.href === activo?.href))?.id || null,
    [activo]
  );

  const migas: Miga[] = useMemo(() => {
    if (activo && activo.href !== "/") return [{ texto: activo.texto, href: activo.href }, ...(migaPagina || [])];
    return migaPagina || [];
  }, [activo, migaPagina]);

  const salir = useCallback(() => {
    try { localStorage.removeItem("kumamap_user"); } catch { /* sin storage */ }
    fetch("/api/auth", { method: "DELETE", credentials: "include" }).catch(() => {});
    router.push("/");
    router.refresh();
  }, [router]);

  if (sinMarco(pathname) || sesion === undefined || !sesion) return <>{children}</>;
  if (oculto) return <CrumbCtx.Provider value={ctx}>{children}</CrumbCtx.Provider>;

  const claro = resolvedTheme === "light";

  return (
    <CrumbCtx.Provider value={ctx}>
      <style>{CSS}</style>
      <div className="km-app">
        {abierto && <div className="km-tapa" onClick={() => setAbierto(null)} />}

        <header className="km-barra" ref={barraRef}>
          <div className="km-pill">
          <div className="km-izq">
            <Link href="/" className="km-marca" title="KumaMap">
              <span className="km-logo">
                <svg width="17" height="17" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path d="M4 26V9l8-3 8 3 8-3v17l-8 3-8-3-8 3Z" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
                  <path d="M12 6v17M20 9v17" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
                </svg>
              </span>
              <b>KumaMap</b>
            </Link>

            {/* Migas solo cuando una pagina aporta profundidad propia. El nombre de la
                seccion ya se lee en el menu, repetirlo al lado era ruido. */}
            {migaPagina && migaPagina.length > 0 && (
              <nav className="km-migas" aria-label="Ubicación">
                {migas.map((m, i) => (
                  <span key={i} className="km-miga">
                    {i > 0 && <span className="km-sep">/</span>}
                    {m.href && i < migas.length - 1 ? <Link href={m.href}>{m.texto}</Link> : <b>{m.texto}</b>}
                  </span>
                ))}
              </nav>
            )}
          </div>

          <span className="km-raya" />

          <nav className="km-menu" aria-label="Secciones">
            <Link href={MAPAS.href} className={"km-top" + (activo?.href === "/" ? " km-sel" : "")}>
              {MAPAS.icono}<span>{MAPAS.texto}</span>
            </Link>

            {MENUS.map((m) => (
              <div key={m.id} className="km-grupo">
                <button
                  className={"km-top" + (menuActivo === m.id ? " km-sel" : "") + (abierto === m.id ? " km-abierto" : "")}
                  onClick={() => setAbierto(abierto === m.id ? null : m.id)}
                  aria-expanded={abierto === m.id}
                  aria-haspopup="true">
                  <span>{m.texto}</span>
                  <svg className="km-flecha" width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {abierto === m.id && (
                  <div className="km-desplegable">
                    {m.items.map((i) => (
                      <Link key={i.href} href={i.href}
                        className={"km-sub" + (activo?.href === i.href ? " km-sub-sel" : "")}>
                        <span className="km-sub-ico">{i.icono}</span>
                        <span className="km-sub-txt">
                          <b>{i.texto}</b>
                          {i.nota && <i>{i.nota}</i>}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <span className="km-raya" />

          <div className="km-der">
            <button className="km-icono" onClick={() => setTheme(claro ? "dark" : "light")}
              title={claro ? "Cambiar a oscuro" : "Cambiar a claro"} aria-label="Cambiar tema">
              {claro ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
                </svg>
              )}
            </button>

            <div className="km-grupo">
              <button className={"km-usuario" + (abierto === "usuario" ? " km-abierto" : "")}
                onClick={() => setAbierto(abierto === "usuario" ? null : "usuario")}
                aria-expanded={abierto === "usuario"} aria-haspopup="true">
                <span className="km-avatar">{(sesion || "?").slice(0, 1).toUpperCase()}</span>
                <span className="km-usuario-txt">{sesion}</span>
                <svg className="km-flecha" width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {abierto === "usuario" && (
                <div className="km-desplegable km-desplegable-der">
                  <div className="km-cab">
                    Sesión de <b>{sesion}</b>
                    <span>KumaMap v{APP_VERSION}</span>
                  </div>
                  <button className="km-salir" onClick={salir}>Cerrar sesión</button>
                </div>
              )}
            </div>
          </div>
          </div>
        </header>

        <main className="km-main">
          {/* La clave hace que React remonte al cambiar de seccion, y con eso corre
              la animacion de entrada. Sin esto el cambio se ve como un salto seco. */}
          <div key={pathname} className="km-seccion">{children}</div>
        </main>
      </div>
    </CrumbCtx.Provider>
  );
}

/* ═══════════════════════════════════════════ estilo ══ */
const AZUL = "#1b5fd9";
const AZUL_CLARO = "#4f8cf5";

const CSS = `
.km-app{display:flex;flex-direction:column;height:100dvh;overflow:hidden;
  background:var(--background);color:var(--foreground)}

/* La barra usa el mismo fondo que la pagina. Una linea de un pixel, sin sombra ni
   tarjeta: asi se lee como el borde de arriba del contenido, no como otro panel. */
/* La pastilla: se ajusta a su contenido y queda centrada. La fila que la contiene
   ocupa todo el ancho pero es transparente, asi que lo que se ve es la pastilla sola
   flotando. Fondo translucido con desenfoque y una sombra corta para despegarla del
   contenido, sin que parezca un panel pegado al borde. */
.km-barra{flex:none;position:relative;z-index:30;display:flex;justify-content:center;
  padding:10px 14px 8px;background:var(--background)}
.km-pill{display:flex;align-items:center;gap:5px;max-width:100%;height:46px;
  padding:0 7px 0 13px;border-radius:999px;border:1px solid var(--border);
  background:var(--card);box-shadow:0 6px 24px rgba(0,0,0,.10)}
@supports (backdrop-filter:blur(1px)) and (background:color-mix(in srgb,red 50%,transparent)){
  .km-pill{background:color-mix(in srgb,var(--card) 82%,transparent);
    backdrop-filter:saturate(180%) blur(16px);-webkit-backdrop-filter:saturate(180%) blur(16px)}
}
.km-raya{width:1px;height:20px;flex:none;background:var(--border);margin:0 3px}

.km-izq{display:flex;align-items:center;gap:9px;min-width:0}
.km-marca{display:flex;align-items:center;gap:9px;text-decoration:none;color:inherit;flex:none}
.km-marca b{font-size:14.5px;font-weight:700;letter-spacing:-.3px}
.km-logo{width:26px;height:26px;flex:none;border-radius:8px;display:flex;align-items:center;
  justify-content:center;background:linear-gradient(135deg,${AZUL},#0f3f9e);
  box-shadow:0 1px 2px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.22)}

.km-menu{display:flex;align-items:center;gap:2px;min-width:0}
.km-grupo{position:relative}
.km-top{position:relative;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;
  border-radius:10px;background:transparent;border:none;cursor:pointer;text-decoration:none;font:inherit;
  font-size:13.5px;font-weight:500;color:var(--text-secondary,var(--foreground));white-space:nowrap;
  transition:background .14s,color .14s}
.km-top:hover{background:var(--surface-hover,rgba(127,127,127,.1));color:var(--foreground)}
.km-sel{color:${AZUL_CLARO};font-weight:600;background:${AZUL}1e}
.km-sel:hover{background:${AZUL}1c}
.km-abierto{background:var(--surface-hover,rgba(127,127,127,.12));color:var(--foreground)}
.km-flecha{opacity:.55;transition:transform .15s}
.km-abierto .km-flecha{transform:rotate(180deg)}

.km-tapa{position:fixed;inset:0;z-index:29}
.km-desplegable{position:absolute;left:0;top:calc(100% + 12px);z-index:31;min-width:268px;
  background:var(--card);border:1px solid var(--border);border-radius:12px;padding:6px;
  box-shadow:0 16px 40px rgba(0,0,0,.24);animation:kmBaja .14s cubic-bezier(.22,1,.36,1)}
.km-desplegable-der{left:auto;right:0;min-width:210px}
@keyframes kmBaja{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}

.km-sub{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:9px;
  text-decoration:none;color:var(--foreground);transition:background .12s}
.km-sub:hover{background:var(--surface-hover,rgba(127,127,127,.12))}
.km-sub-sel{background:${AZUL}16}
.km-sub-sel .km-sub-txt b{color:${AZUL_CLARO}}
.km-sub-ico{display:flex;margin-top:1px;color:var(--muted-foreground);flex:none}
.km-sub-sel .km-sub-ico{color:${AZUL_CLARO}}
.km-sub-txt{display:flex;flex-direction:column;gap:1px;min-width:0}
.km-sub-txt b{font-size:13.5px;font-weight:600}
.km-sub-txt i{font-style:normal;font-size:11.5px;color:var(--muted-foreground);line-height:1.35}

.km-migas{min-width:0;display:flex;align-items:center;gap:6px;font-size:12.5px;
  padding-left:10px;margin-left:2px;box-shadow:inset 1px 0 0 var(--border);overflow:hidden}
.km-miga{display:inline-flex;align-items:center;gap:7px;min-width:0}
.km-miga a{color:var(--muted-foreground);text-decoration:none;white-space:nowrap}
.km-miga a:hover{color:${AZUL_CLARO};text-decoration:underline}
.km-miga b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:var(--muted-foreground)}
.km-sep{color:var(--muted-foreground);opacity:.45}

.km-der{display:flex;align-items:center;gap:6px;flex:none}
.km-icono{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;
  background:transparent;border:1px solid var(--border);color:var(--text-secondary,var(--foreground));cursor:pointer}
.km-icono:hover{background:var(--surface-elevated,rgba(127,127,127,.1));color:var(--foreground)}
.km-usuario{display:flex;align-items:center;gap:7px;height:32px;padding:0 10px 0 3px;border-radius:99px;
  background:transparent;border:1px solid var(--border);color:inherit;cursor:pointer;font:inherit;font-size:12.5px}
.km-usuario:hover{background:var(--surface-elevated,rgba(127,127,127,.1))}
.km-avatar{width:25px;height:25px;border-radius:99px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,${AZUL},#0f3f9e);color:#fff;font-size:11.5px;font-weight:700}
.km-usuario-txt{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.km-cab{padding:9px 11px 10px;font-size:12px;color:var(--muted-foreground);display:flex;flex-direction:column;gap:2px}
.km-cab b{color:var(--foreground)}
.km-cab span{font-size:11px;opacity:.75;font-variant-numeric:tabular-nums}
.km-salir{display:block;width:100%;text-align:left;padding:9px 11px;border-radius:9px;background:transparent;
  border:none;border-top:1px solid var(--border);color:var(--foreground);font:inherit;font-size:13px;cursor:pointer}
.km-salir:hover{background:var(--surface-hover,rgba(127,127,127,.12))}

/* Un unico contenedor con desplazamiento. Las paginas de adentro no compiten por
   ancho con nada, asi que no aparecen barras horizontales de la nada. */
.km-main{flex:1;min-height:0;min-width:0;overflow:auto;position:relative}
.km-seccion{min-height:100%;animation:kmEntra .22s cubic-bezier(.22,1,.36,1)}
@keyframes kmEntra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

@media (max-width:1080px){
  .km-pill{padding-left:9px}
  .km-marca b{display:none}
  .km-top span:not(.km-sub-txt){font-size:13px}
  .km-migas{display:none}
  .km-usuario-txt{display:none}
}
@media (max-width:680px){
  .km-barra{padding:8px 10px 6px}
  .km-raya{display:none}
  /* Envolver, no desplazar: un contenedor con scroll recortaria los desplegables. */
  .km-pill{flex-wrap:wrap;height:auto;min-height:46px;border-radius:22px;padding:5px 8px;
    justify-content:center;row-gap:2px}
  .km-menu{flex-wrap:wrap;justify-content:center}
  .km-der{margin-left:auto}
}
@media (prefers-reduced-motion:reduce){
  .km-seccion,.km-desplegable{animation:none}
  .km-flecha{transition:none}
}
`;
