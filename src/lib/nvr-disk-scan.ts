/**
 * Tarea diaria de salud de discos de los grabadores.
 *
 * Recorre cada grabador alcanzable, le pide el estado de sus discos (SMART) por
 * ISAPI, lo guarda, y —si un disco falla o está en atención— avisa. El aviso NO
 * inventa un canal nuevo: empuja a un monitor "push" propio en Uptime Kuma (uno
 * por grabador, "Discos NVR · <etiqueta>"), que ya dispara Telegram/email/etc.
 * con las notificaciones que el usuario tenga configuradas.
 *
 * Se corre una vez al día a la hora configurada (settings `nvrDisks.scan`), o a
 * mano desde /cameras.
 */
import { settingsDb, nvrDisksDb } from "./db";
import { credencialesGrabadores } from "./grabadores";
import { sondearDiscosNvr, peorSalud, type DiscoNvr } from "./nvr-isapi";
import { getKumaClient } from "./kuma";
import { randomBytes } from "crypto";

export interface ConfigDiscos {
  habilitado: boolean;
  hora: string;   // "HH:MM" hora local del servidor
  soloProblemas: boolean; // si true, sólo marca DOWN en falla (no en "atención")
}

const CLAVE_CONFIG = "nvrDisks.config";
const CLAVE_ULTIMO = "nvrDisks.lastRun"; // "YYYY-MM-DD" del último día que corrió

export function getConfig(): ConfigDiscos {
  return settingsDb.getJson<ConfigDiscos>(CLAVE_CONFIG, { habilitado: true, hora: "07:00", soloProblemas: false });
}
export function setConfig(c: Partial<ConfigDiscos>): ConfigDiscos {
  const prev = getConfig();
  const next: ConfigDiscos = {
    habilitado: c.habilitado ?? prev.habilitado,
    hora: /^\d{2}:\d{2}$/.test(String(c.hora)) ? c.hora! : prev.hora,
    soloProblemas: c.soloProblemas ?? prev.soloProblemas,
  };
  settingsDb.setJson(CLAVE_CONFIG, next);
  return next;
}

// ── Push a Uptime Kuma ────────────────────────────────────────────────────────

/** Asegura un monitor push por grabador; devuelve su token (lo crea si falta). */
async function asegurarMonitorPush(grabadorId: string, etiqueta: string): Promise<string | null> {
  const prev = nvrDisksDb.get(grabadorId);
  if (prev?.push_token && prev.kuma_monitor_id) return prev.push_token;

  const kuma = getKumaClient();
  if (!kuma.isConnected) return null;
  const token = randomBytes(16).toString("hex");
  const r = await kuma.addMonitor({
    type: "push",
    name: `Discos NVR · ${etiqueta}`,
    pushToken: token,
    interval: 172800,      // 2 días: un push diario lo mantiene arriba con margen
    retryInterval: 3600,
    resendInterval: 0,
    maxretries: 0,
    upsideDown: false,
    active: true,
  });
  if (!r.ok) { console.log(`[Discos] No se pudo crear el monitor push de ${etiqueta}: ${r.msg}`); return null; }
  nvrDisksDb.upsert({ grabador_id: grabadorId, etiqueta, kuma_monitor_id: r.monitorID ?? null, push_token: token });
  return token;
}

/** Empuja un latido al monitor push del grabador. */
async function empujar(token: string, arriba: boolean, msg: string) {
  const base = process.env.KUMA_URL;
  if (!base) return;
  try {
    const url = new URL(`/api/push/${token}`, base);
    url.searchParams.set("status", arriba ? "up" : "down");
    url.searchParams.set("msg", msg.slice(0, 200));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    await fetch(url.toString(), { signal: ctrl.signal }).catch(() => {});
    clearTimeout(t);
  } catch { /* el push es best-effort */ }
}

function resumenDiscos(discos: DiscoNvr[]): string {
  if (!discos.length) return "sin discos detectados";
  const malos = discos.filter((d) => d.salud === "falla");
  const atencion = discos.filter((d) => d.salud === "atencion");
  if (malos.length) return `${malos.length} disco(s) en FALLA: ${malos.map((d) => `${d.nombre} (${d.estado})`).join(", ")}`;
  if (atencion.length) return `${atencion.length} disco(s) en atención: ${atencion.map((d) => `${d.nombre} (${d.estado})`).join(", ")}`;
  return `${discos.length} disco(s) OK`;
}

export interface ResultadoScan {
  grabadorId: string; etiqueta: string; ip: string;
  alcanzable: boolean; peor: string; discos: DiscoNvr[]; error?: string;
}

/** Corre el escaneo de discos de TODOS los grabadores con credenciales. */
export async function escanearDiscos(): Promise<ResultadoScan[]> {
  const cfg = getConfig();
  const grabadores = credencialesGrabadores();
  const resultados: ResultadoScan[] = [];

  for (const g of grabadores) {
    const s = await sondearDiscosNvr(g.ip, g.usuario, g.clave);
    const peor = s.alcanzable ? peorSalud(s.discos) : "desconocido";
    resultados.push({ grabadorId: g.id, etiqueta: g.etiqueta, ip: g.ip, alcanzable: s.alcanzable, peor, discos: s.discos, error: s.error });

    nvrDisksDb.upsert({
      grabador_id: g.id, etiqueta: g.etiqueta, ip: g.ip, ts: Date.now(),
      alcanzable: s.alcanzable ? 1 : 0, peor_salud: peor, discos_json: JSON.stringify(s.discos),
    });

    // Aviso por Kuma: DOWN si falla (o atención, según config); UP si todo bien.
    const hayProblema = s.alcanzable && (peor === "falla" || (!cfg.soloProblemas && peor === "atencion"));
    const noAlcanzable = !s.alcanzable;
    try {
      const token = await asegurarMonitorPush(g.id, g.etiqueta);
      if (token) {
        if (noAlcanzable) await empujar(token, false, s.error || "grabador no alcanzable");
        else await empujar(token, !hayProblema, resumenDiscos(s.discos));
      }
    } catch (e: any) { console.log(`[Discos] push ${g.etiqueta}: ${e?.message}`); }
  }

  settingsDb.set("nvrDisks.lastScanTs", String(Date.now()));
  console.log(`[Discos] Escaneo completado: ${resultados.length} grabador(es)`);
  return resultados;
}

// ── Programador diario ────────────────────────────────────────────────────────

/**
 * Arranca el chequeo minuto a minuto: cuando el reloj del servidor llega a la
 * hora configurada y no corrió hoy, dispara el escaneo. Sencillo y sin
 * dependencias; sobrevive a reinicios porque el "último día" queda en la DB.
 */
export function iniciarProgramadorDiscos() {
  const tick = async () => {
    try {
      const cfg = getConfig();
      if (!cfg.habilitado) return;
      const ahora = new Date();
      const hhmm = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
      if (hhmm !== cfg.hora) return;
      const hoy = ahora.toISOString().slice(0, 10);
      if (settingsDb.get(CLAVE_ULTIMO) === hoy) return; // ya corrió hoy
      settingsDb.set(CLAVE_ULTIMO, hoy);
      console.log(`[Discos] Tarea diaria (${cfg.hora}) — escaneando discos de grabadores…`);
      await escanearDiscos();
    } catch (e: any) {
      console.log(`[Discos] Error en la tarea diaria: ${e?.message}`);
    }
  };
  setInterval(tick, 60_000);
  console.log("[Discos] Programador diario de SMART iniciado");
}
