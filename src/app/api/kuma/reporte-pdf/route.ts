/**
 * Reporte mensual por cliente (N2) — hoja imprimible.
 *
 * Devuelve HTML preparado para imprimir a PDF (A4, `@page`), que es como ya se
 * hace el informe de rack. No se usa un generador de PDF del lado del servidor a
 * propósito: el navegador ya sabe paginar, tiene las fuentes y deja al operador
 * revisar la hoja antes de mandarla.
 *
 * Todo lo que dice esta hoja sale de `src/lib/reporte-mensual.ts`. La sección
 * final explica cómo se midió cada número: un reporte que se factura tiene que
 * poder defenderse cuando el cliente pregunta.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  armarReporte, mesAnterior, monitoresPorMapa, catalogoMonitores,
  fmtDuracion, fmtPct, type Reporte, type DiaReporte, type Corte,
} from "@/lib/reporte-mensual";

export const dynamic = "force-dynamic";

const AZUL = "#1b5fd9";
const VERDE = "#16a34a";
const AMBAR = "#f59e0b";
const ROJO = "#dc2626";
const VIOLETA = "#8b5cf6";
const TINTA = "#16202e";
const SUAVE = "#6b7a8d";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function color(p: number | null): string {
  if (p == null) return SUAVE;
  if (p >= 99.9) return VERDE;
  if (p >= 99) return "#65a30d";
  if (p >= 95) return AMBAR;
  return ROJO;
}

/** "2026-08-03 14:22:10" → "03/08 14:22" */
function fmtMomento(s: string | null): string {
  if (!s) return "—";
  const [f, h] = s.split(" ");
  const [, m, d] = f.split("-");
  return `${d}/${m} ${(h || "").slice(0, 5)}`;
}
function fmtDia(f: string): string {
  const [, m, d] = f.split("-");
  return `${d}/${m}`;
}

/* ── gráficos, dibujados a mano en SVG para que impriman sin depender de nada ── */

/**
 * Una barra por día. La escala arranca en 90 % a propósito: entre 99,9 y 100 no
 * se ve nada si el eje va de 0 a 100, y justamente ahí está toda la información.
 */
function barrasDiarias(serie: DiaReporte[]): string {
  if (!serie.length) return `<p class="vacio">Sin datos del mes.</p>`;
  const ancho = 720, alto = 120, pie = 16;
  const paso = ancho / serie.length;
  const barra = Math.max(3, Math.min(18, paso - 3));
  const y = (p: number | null) => {
    if (p == null) return { y: alto - pie - 4, h: 4 };
    const rel = Math.max(0, Math.min(1, (p - 90) / 10));
    const h = Math.max(3, rel * (alto - pie - 6));
    return { y: alto - pie - h, h };
  };
  const barras = serie.map((d, i) => {
    const { y: yy, h } = y(d.pct);
    const x = i * paso + (paso - barra) / 2;
    const c = d.pct == null ? "#d7dee8" : color(d.pct);
    return `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${barra.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${c}"><title>${fmtDia(d.fecha)} · ${fmtPct(d.pct)} %</title></rect>`;
  }).join("");
  // Una etiqueta cada cinco días: más apretado no se lee impreso.
  const etiquetas = serie.map((d, i) =>
    (i % 5 === 0 || i === serie.length - 1)
      ? `<text x="${(i * paso + paso / 2).toFixed(1)}" y="${alto - 4}" text-anchor="${i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"}" font-size="8" fill="${SUAVE}">${fmtDia(d.fecha)}</text>`
      : "").join("");
  const guias = [95, 99, 100].map((p) => {
    const yy = alto - pie - ((p - 90) / 10) * (alto - pie - 6);
    return `<line x1="0" y1="${yy.toFixed(1)}" x2="${ancho}" y2="${yy.toFixed(1)}" stroke="#e4e9f0" stroke-width="1"/>` +
           `<text x="${ancho - 2}" y="${(yy - 2).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${SUAVE}">${p} %</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" height="${alto}" role="img" aria-label="Disponibilidad por día">${guias}${barras}${etiquetas}</svg>`;
}

/** Latencia media diaria. Sin datos de un día, la línea se corta: no se inventa. */
function lineaLatencia(serie: DiaReporte[]): string {
  const pts = serie.map((d, i) => ({ i, v: d.ping, f: d.fecha }));
  const con = pts.filter((p) => p.v != null) as Array<{ i: number; v: number; f: string }>;
  if (con.length < 2) return `<p class="vacio">Sin latencia registrada en el mes.</p>`;
  const ancho = 720, alto = 100, pie = 16;
  const max = Math.max(...con.map((p) => p.v)) * 1.15 || 1;
  const px = (i: number) => (i / Math.max(1, serie.length - 1)) * (ancho - 34) + 2;
  const py = (v: number) => (alto - pie) - (v / max) * (alto - pie - 8);

  let d = "", abierto = false;
  for (const p of pts) {
    if (p.v == null) { abierto = false; continue; }
    d += `${abierto ? "L" : "M"}${px(p.i).toFixed(1)} ${py(p.v).toFixed(1)} `;
    abierto = true;
  }
  const guias = [0.5, 1].map((f) => {
    const v = max * f, yy = py(v);
    return `<line x1="0" y1="${yy.toFixed(1)}" x2="${ancho - 32}" y2="${yy.toFixed(1)}" stroke="#e4e9f0" stroke-width="1"/>` +
           `<text x="${ancho - 30}" y="${(yy + 3).toFixed(1)}" font-size="7.5" fill="${SUAVE}">${Math.round(v)} ms</text>`;
  }).join("");
  const marcas = con.map((p) =>
    `<circle cx="${px(p.i).toFixed(1)}" cy="${py(p.v).toFixed(1)}" r="1.6" fill="${AZUL}"/>`).join("");
  const etiquetas = serie.map((s, i) =>
    (i % 5 === 0 || i === serie.length - 1)
      // La primera y la última se anclan al borde: centradas se cortan.
      ? `<text x="${px(i).toFixed(1)}" y="${alto - 4}" text-anchor="${i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"}" font-size="8" fill="${SUAVE}">${fmtDia(s.fecha)}</text>`
      : "").join("");
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" height="${alto}" role="img" aria-label="Latencia media por día">${guias}<path d="${d}" fill="none" stroke="${AZUL}" stroke-width="1.6" stroke-linejoin="round"/>${marcas}${etiquetas}</svg>`;
}

/* ── la hoja ── */

/**
 * La tabla de cortes.
 *
 * Un mes con 654 cortes de un minuto no se puede imprimir ni se puede leer: la
 * mayoría son parpadeos de un enlace que se recupera en el siguiente sondeo. Se
 * listan los que superan el umbral y los demás se resumen en una línea — el
 * total de tiempo sigue estando arriba, en la tapa, sin recortar.
 */
function tablaEventos(
  lista: Corte[], nombres: Map<number, string>, programado: boolean,
  minSeg = 0, maxFilas = 60
): string {
  if (!lista.length) {
    return `<p class="vacio">${programado
      ? "No hubo mantenimiento programado en el mes."
      : "No hubo cortes de servicio en el mes."}</p>`;
  }
  const grandes = lista.filter((c) => c.segundos >= minSeg);
  const chicos = lista.filter((c) => c.segundos < minSeg);
  const mostrados = grandes.length > maxFilas
    ? [...grandes].sort((a, b) => b.segundos - a.segundos).slice(0, maxFilas).sort((a, b) => a.inicio.localeCompare(b.inicio))
    : grandes;
  const recortados = grandes.length - mostrados.length;

  const resumen: string[] = [];
  if (recortados > 0) {
    resumen.push(`Se listan los ${mostrados.length} cortes más largos; hubo ${grandes.length} de más de ${esc(fmtDuracion(minSeg))} en total.`);
  }
  if (chicos.length > 0) {
    const seg = chicos.reduce((a, c) => a + c.segundos, 0);
    resumen.push(`Además hubo ${chicos.length} interrupciones breves, de menos de ${esc(fmtDuracion(minSeg))} cada una (${esc(fmtDuracion(seg))} en total), que no se listan una por una.`);
  }
  const pie = resumen.length ? `<p class="vacio" style="margin-top:6px">${resumen.join(" ")}</p>` : "";

  if (!mostrados.length) return `<p class="vacio">${resumen.join(" ") || "Sin cortes que listar."}</p>`;

  const filas = mostrados.map((c) => `
      <tr>
        <td class="num">${esc(fmtMomento(c.inicio))}</td>
        <td class="num">${c.fin ? esc(fmtMomento(c.fin)) : '<span class="gris">seguía al cierre</span>'}</td>
        <td><b>${esc(fmtDuracion(c.segundos))}</b></td>
        <td>${esc(nombres.get(c.monitorId) || `monitor ${c.monitorId}`)}</td>
        <td class="motivo">${esc(c.motivo || "—")}</td>
      </tr>`).join("");
  return `<table class="t">
      <thead><tr><th>Inicio</th><th>Fin</th><th>Duración</th><th>Enlace</th><th>Detalle</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>${pie}`;
}

function hoja(r: Reporte, objetivo: number, minCorte: number): string {
  const nombres = new Map(r.monitores.map((m) => [m.id, m.nombre] as const));
  const cumple = r.pct != null && r.pct >= objetivo;
  const segMant = r.mantenimientos.reduce((a, c) => a + c.segundos, 0);

  /*
   * La cifra de la tapa tiene que cerrar con el porcentaje de la tapa.
   *
   * La primera versión mostraba la unión de todos los cortes —el tiempo en que
   * había algo caído— y quedaba 5,6 días al lado de un 98,31 %. Las dos cosas
   * eran ciertas y juntas no se entendían: con quince enlaces, que alguno esté
   * caído es casi permanente aunque cada uno esté disponible el 98 % del tiempo.
   *
   * Lo que se informa es la indisponibilidad MEDIA por enlace, que sale de los
   * mismos latidos que el porcentaje, así que los dos números siempre cierran.
   * El tiempo de cada enlace está en la tabla, que es donde se lo busca.
   */
  const mediaCaido = r.monitores.length
    ? Math.round(r.monitores.reduce((a, m) => a + m.down * m.intervalo, 0) / r.monitores.length)
    : 0;
  const cortesLargos = r.cortes.filter((c) => c.segundos >= minCorte).length;
  const peor = r.monitores.find((m) => m.pct != null) || null;

  const filasMonitores = r.monitores.map((m) => `
      <tr>
        <td><span class="punto" style="background:${color(m.pct)}"></span>${esc(m.nombre)}
            <span class="tipo">${esc(m.tipo)}</span></td>
        <td class="c"><b style="color:${color(m.pct)}">${fmtPct(m.pct)}</b><small>%</small></td>
        <td class="c num">${esc(fmtDuracion(m.segundosCaido))}</td>
        <td class="c num">${m.cortes || "—"}</td>
        <td class="c num">${m.mant > 0 ? esc(fmtDuracion(m.mant * m.intervalo)) : "—"}</td>
        <td class="c num">${m.ping != null ? `${m.ping} ms` : "—"}</td>
        <td class="c num gris">${m.pingMax != null ? `${m.pingMax} ms` : "—"}</td>
      </tr>`).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${esc(r.cliente)} — disponibilidad ${esc(r.rango.etiqueta)}</title>
<style>
  @page { size: A4; margin: 14mm 13mm 15mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:${TINTA}; font-size:10.5px; line-height:1.5; background:#fff; }
  .hoja { max-width: 190mm; margin: 0 auto; padding: 10mm 4mm; }
  h1 { font-size:19px; margin:0; letter-spacing:-.3px; }
  h2 { font-size:12px; margin:0 0 7px; text-transform:uppercase; letter-spacing:.7px; color:${SUAVE}; }
  .cab { display:flex; align-items:flex-start; justify-content:space-between; gap:18px;
         border-bottom:2px solid ${AZUL}; padding-bottom:10px; margin-bottom:14px; }
  .cab .sub { color:${SUAVE}; font-size:11px; margin-top:2px; }
  .marca { text-align:right; font-size:10px; color:${SUAVE}; line-height:1.45; }
  .marca b { display:block; color:${AZUL}; font-size:13px; letter-spacing:.4px; }

  .tapa { display:flex; gap:16px; align-items:stretch; margin-bottom:16px; }
  .grande { flex:0 0 158px; border:1px solid #e4e9f0; border-radius:10px; padding:12px 14px; }
  .grande .n { font-size:38px; font-weight:800; line-height:1; letter-spacing:-1.5px; font-variant-numeric:tabular-nums; }
  .grande .n small { font-size:15px; font-weight:700; margin-left:2px; }
  .grande .r { font-size:9.5px; text-transform:uppercase; letter-spacing:.6px; color:${SUAVE}; margin-bottom:6px; }
  .veredicto { margin-top:8px; font-size:10px; font-weight:700; padding:3px 8px; border-radius:99px; display:inline-block; }
  .kpis { flex:1; display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .kpi { border:1px solid #e4e9f0; border-radius:10px; padding:10px 12px; }
  .kpi b { display:block; font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1.15; }
  .kpi span { font-size:8.5px; text-transform:uppercase; letter-spacing:.45px; color:${SUAVE}; line-height:1.35; display:block; margin-top:2px; }

  .bloque { margin-bottom:15px; break-inside:avoid; }
  .caja { border:1px solid #e4e9f0; border-radius:10px; padding:10px 12px; }
  table.t { width:100%; border-collapse:collapse; font-size:9.8px; }
  table.t th { text-align:left; font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.5px;
               color:${SUAVE}; padding:5px 7px; border-bottom:1px solid #e4e9f0; }
  table.t td { padding:5px 7px; border-bottom:1px solid #f0f3f7; vertical-align:middle; }
  table.t tbody tr:last-child td { border-bottom:none; }
  .c { text-align:center; } .num { font-variant-numeric:tabular-nums; white-space:nowrap; }
  .gris { color:${SUAVE}; }
  .punto { display:inline-block; width:6px; height:6px; border-radius:99px; margin-right:6px; vertical-align:middle; }
  .tipo { color:${SUAVE}; font-size:8.5px; margin-left:5px; text-transform:uppercase; letter-spacing:.4px; }
  .motivo { color:${SUAVE}; max-width:62mm; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .vacio { color:${SUAVE}; font-size:10px; margin:2px 0; }
  .aviso { border:1px solid ${AMBAR}66; background:${AMBAR}12; border-radius:9px; padding:8px 11px; font-size:9.8px; margin-bottom:12px; }
  .metodo { border-top:1px solid #e4e9f0; padding-top:9px; font-size:8.8px; color:${SUAVE}; line-height:1.6; }
  .metodo b { color:${TINTA}; }
  .metodo ul { margin:5px 0 0; padding-left:15px; }

  .imprimir { position:fixed; bottom:18px; right:18px; z-index:9; background:${AZUL}; color:#fff; border:none;
              font:inherit; font-size:12px; font-weight:600; padding:8px 16px; border-radius:8px; cursor:pointer;
              box-shadow:0 4px 14px rgba(27,95,217,.35); }
  @media print { .imprimir { display:none; } .hoja { padding:0; } body { font-size:9.8px; } }
</style></head>
<body>
<button class="imprimir" onclick="window.print()">Imprimir o guardar como PDF</button>
<div class="hoja">

  <div class="cab">
    <div>
      <h1>${esc(r.cliente)}</h1>
      <div class="sub">Informe de disponibilidad · ${esc(r.rango.etiqueta)}</div>
    </div>
    <div class="marca">
      <b>INFRATEC</b>
      Monitoreo de red<br>
      Emitido el ${esc(fmtMomento(r.generado))}
    </div>
  </div>

  ${r.cobertura != null && r.cobertura < 0.98 ? `<div class="aviso">
    <b>Registro incompleto —</b> este mes hay medición de aproximadamente
    ${Math.round(r.cobertura * r.rango.dias)} de los ${r.rango.dias} días.
    El porcentaje de abajo se calcula sobre lo que hay medido, no sobre el mes entero.
  </div>` : ""}

  ${r.huerfanos.length > 0 ? `<div class="aviso">
    <b>Atención interna —</b> ${r.huerfanos.length} nodo${r.huerfanos.length === 1 ? "" : "s"} de este mapa
    apunta${r.huerfanos.length === 1 ? "" : "n"} a monitores que ya no existen en el sistema, así que
    <b>no están incluidos en estas cifras</b>. Revisar antes de enviar el informe.
  </div>` : ""}

  <div class="tapa">
    <div class="grande">
      <div class="r">Disponibilidad</div>
      <div class="n" style="color:${color(r.pct)}">${fmtPct(r.pct)}<small>%</small></div>
      <div class="veredicto" style="color:${cumple ? VERDE : ROJO};background:${cumple ? VERDE : ROJO}14;border:1px solid ${cumple ? VERDE : ROJO}44">
        ${r.pct == null ? "Sin datos" : cumple ? `Cumple el objetivo de ${String(objetivo).replace(".", ",")} %` : `Por debajo de ${String(objetivo).replace(".", ",")} %`}
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><b style="color:${mediaCaido > 0 ? ROJO : TINTA}">${esc(fmtDuracion(mediaCaido))}</b><span>Fuera de servicio<br>por enlace</span></div>
      <div class="kpi"><b>${cortesLargos}</b><span>Cortes<br>de más de ${esc(fmtDuracion(minCorte))}</span></div>
      <div class="kpi"><b style="color:${segMant > 0 ? VIOLETA : TINTA}">${esc(fmtDuracion(segMant))}</b><span>Mantenimiento<br>programado</span></div>
      <div class="kpi">${peor
        ? `<b style="color:${color(peor.pct)}">${fmtPct(peor.pct)}<small>%</small></b><span>Peor enlace<br>${esc(peor.nombre)}</span>`
        : `<b>${r.monitores.length}</b><span>Enlaces<br>vigilados</span>`}</div>
    </div>
  </div>

  <div class="bloque">
    <h2>Disponibilidad día por día</h2>
    <div class="caja">${barrasDiarias(r.serie)}</div>
  </div>

  <div class="bloque">
    <h2>Detalle por enlace</h2>
    <div class="caja">
      <table class="t">
        <thead><tr>
          <th>Enlace</th><th class="c">Disponible</th><th class="c">Fuera</th>
          <th class="c">Cortes</th><th class="c">Manten.</th><th class="c">Latencia</th><th class="c">Máxima</th>
        </tr></thead>
        <tbody>${filasMonitores || `<tr><td colspan="7" class="vacio">Este cliente no tiene enlaces vigilados.</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <div class="bloque">
    <h2>Cortes de servicio</h2>
    <div class="caja">${tablaEventos(r.cortes, nombres, false, minCorte)}</div>
  </div>

  <div class="bloque">
    <h2>Mantenimiento programado</h2>
    <div class="caja">${tablaEventos(r.mantenimientos, nombres, true)}</div>
  </div>

  <div class="bloque">
    <h2>Latencia media diaria</h2>
    <div class="caja">${lineaLatencia(r.serie)}</div>
  </div>

  <div class="metodo">
    <b>Cómo se midió.</b>
    <ul>
      <li>Cada enlace se sondea cada ${esc(r.monitores[0]?.intervalo || 60)} segundos. La <b>disponibilidad</b>
          es la proporción de sondeos con respuesta sobre el total del mes, y la del cliente es la suma de
          todos sus sondeos — no el promedio de los porcentajes, para que un enlace con pocos datos no pese
          igual que uno con el mes completo.</li>
      <li>Los <b>cortes</b> no se estiman: se leen de las transiciones registradas, con la hora exacta en que
          el enlace dejó de responder y en la que volvió.</li>
      <li>El tiempo de la tapa es la <b>indisponibilidad media por enlace</b>: sale de los mismos sondeos
          que el porcentaje, así que las dos cifras siempre cierran entre sí. Este cliente tiene
          ${r.monitores.length} enlace${r.monitores.length === 1 ? "" : "s"}; el tiempo de cada uno está
          en la tabla de arriba.</li>
      <li>Se listan los cortes de más de ${esc(fmtDuracion(minCorte))}. Las interrupciones más breves
          —un sondeo sin respuesta que se recupera en el siguiente— se resumen al pie de la tabla, pero
          su tiempo sí está incluido en las cifras de arriba.</li>
      <li>El <b>mantenimiento programado</b> se declara por adelantado y no cuenta como indisponibilidad:
          son interrupciones acordadas, no fallas. Se listan igual para que el corte quede explicado.</li>
      <li>Los horarios de los cortes son de Uruguay. Los días de disponibilidad son los que cierra el
          sistema de monitoreo, que corta a las 21:00 de Uruguay: lo que pasa entre las 21:00 y la
          medianoche cuenta en el día siguiente.</li>
      <li>Cobertura de la medición: ${r.cobertura != null ? `${Math.round(r.cobertura * 100)} % de los días del mes` : "sin datos"}.
          ${r.cobertura != null && r.cobertura < 0.98 ? "<b>Este mes está incompleto</b> y el porcentaje sale de los días medidos." : ""}</li>
      ${r.datosDesde ? `<li>Hay registro continuo de este cliente desde el ${esc(fmtMomento(r.datosDesde))}.</li>` : ""}
    </ul>
  </div>

</div></body></html>`;
}

export async function GET(req: NextRequest) {
  const a = requireAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    const sp = req.nextUrl.searchParams;
    const mapId = sp.get("mapId");
    if (!mapId) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });

    const mapa = monitoresPorMapa().find((x) => x.id === mapId);
    if (!mapa) return NextResponse.json({ error: "No existe ese cliente" }, { status: 404 });

    const hoy = mesAnterior();
    const anio = Number(sp.get("anio")) || hoy.anio;
    const mes = Number(sp.get("mes")) || hoy.mes;
    const objetivo = Number(sp.get("objetivo")) || 99.5;
    const minCorte = Number(sp.get("minCorte")) || 120;

    const r = await armarReporte(mapa, catalogoMonitores(), anio, mes);
    return new Response(hoja(r, objetivo, minCorte), {
      status: 200,
      headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}
