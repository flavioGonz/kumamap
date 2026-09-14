// Tasa de trafico en vivo de UNA interfaz, leida por SNMP directo.
//
// A diferencia de kuma-traffic (que sale del historial de Uptime Kuma), esto
// lee el equipo en el momento: sirve para la vista previa del modal y para que
// la ventana de trafico se mueva al segundo mientras la mirás, sin esperar a
// que Kuma junte latidos. Guarda la muestra anterior por interfaz para poder
// calcular bits/segundo entre dos lecturas.
import { leer, type Version } from "@/lib/snmp-walk";

const IN_32  = "1.3.6.1.2.1.2.2.1.10.";
const OUT_32 = "1.3.6.1.2.1.2.2.1.16.";
const IN_64  = "1.3.6.1.2.1.31.1.1.1.6.";
const OUT_64 = "1.3.6.1.2.1.31.1.1.1.10.";
const IF_NAME    = "1.3.6.1.2.1.31.1.1.1.1.";
const IF_ALIAS   = "1.3.6.1.2.1.31.1.1.1.18.";
const IF_HISPEED = "1.3.6.1.2.1.31.1.1.1.15.";
const IF_SPEED   = "1.3.6.1.2.1.2.2.1.5.";
const IF_OPER    = "1.3.6.1.2.1.2.2.1.8.";

const WRAP32 = 4294967296;
const WRAP64 = 18446744073709551616;

interface Muestra { t: number; ent: number; sal: number; bits: 32 | 64 }
const ultima = new Map<string, Muestra>();

export interface TasaViva {
  ifIndex: string;
  ifName?: string;
  ifAlias?: string;
  up?: boolean;
  capacidadBps: number | null;
  entradaBps: number | null;
  salidaBps: number | null;
  /** true en la primera lectura: todavia no hay dos muestras para una tasa. */
  primera: boolean;
}

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export async function tasaInterfaz(
  host: string, comunidad: string, version: Version, ifIndex: string, puerto = 161,
): Promise<TasaViva> {
  const r = await leer(host, comunidad, version, [
    IN_64 + ifIndex, OUT_64 + ifIndex, IN_32 + ifIndex, OUT_32 + ifIndex,
    IF_NAME + ifIndex, IF_ALIAS + ifIndex, IF_HISPEED + ifIndex, IF_SPEED + ifIndex, IF_OPER + ifIndex,
  ], puerto);

  // Preferir contadores de 64 bits; caer a los de 32 si el equipo no los tiene.
  let ent = num(r[IN_64 + ifIndex]);
  let sal = num(r[OUT_64 + ifIndex]);
  let bits: 32 | 64 = 64;
  if (ent == null || sal == null) {
    ent = num(r[IN_32 + ifIndex]);
    sal = num(r[OUT_32 + ifIndex]);
    bits = 32;
  }

  const alta = num(r[IF_HISPEED + ifIndex]);
  const baja = num(r[IF_SPEED + ifIndex]);
  const capacidadBps = alta && alta > 0 ? alta * 1e6 : (baja && baja > 0 ? baja : null);

  const out: TasaViva = {
    ifIndex,
    ifName: r[IF_NAME + ifIndex] || undefined,
    ifAlias: r[IF_ALIAS + ifIndex] || undefined,
    up: r[IF_OPER + ifIndex] === "1",
    capacidadBps,
    entradaBps: null,
    salidaBps: null,
    primera: true,
  };

  if (ent == null || sal == null) return out; // interfaz sin contadores legibles

  const clave = `${host}:${puerto}:${ifIndex}`;
  const ahora = Date.now();
  const prev = ultima.get(clave);
  ultima.set(clave, { t: ahora, ent, sal, bits });

  if (prev && prev.bits === bits) {
    const dt = (ahora - prev.t) / 1000;
    // Dos lecturas muy juntas (< 0,8 s) o muy separadas (> 120 s) no dan una
    // tasa confiable.
    if (dt >= 0.8 && dt <= 120) {
      const wrap = bits === 64 ? WRAP64 : WRAP32;
      const tasa = (nuevo: number, viejo: number): number | null => {
        let d = nuevo - viejo;
        if (d < 0) d += wrap;              // el contador dio la vuelta
        if (d > wrap / 2) return null;      // salto imposible: reinicio del equipo
        const bps = (d * 8) / dt;
        return bps >= 0 && bps <= 400e9 ? bps : null;
      };
      out.entradaBps = tasa(ent, prev.ent);
      out.salidaBps = tasa(sal, prev.sal);
      out.primera = out.entradaBps == null && out.salidaBps == null;
    }
  }
  return out;
}
