/**
 * Recorrido SNMP de un equipo, y traduccion de lo que se encuentra a "sensores"
 * que tengan sentido para alguien que no quiere leer OIDs.
 *
 * La idea: uno pone la IP y la comunidad, y en vez de un arbol de numeros ve
 * "Gi0/1 — trafico de entrada" o "estado del enlace". El OID queda abajo, para
 * el que lo quiera mirar.
 *
 * Todo esto corre en el servidor de KumaMaps porque el navegador no habla UDP/161.
 */
import snmp from "net-snmp";

export type Version = "1" | "2c";

export interface Fila {
  oid: string;
  tipo: string;
  valor: string;
}

export interface Sensor {
  /** clave estable, sirve de key en React */
  id: string;
  /** lo que se lee en pantalla */
  nombre: string;
  /** de que se trata, en una linea */
  detalle: string;
  grupo: string;
  oid: string;
  /** como conviene evaluarlo en Uptime Kuma */
  operador: "==" | "!=" | "<" | "<=" | ">" | ">=";
  valorEsperado: string;
  /** lectura actual, para que se vea que el OID responde de verdad */
  lectura?: string;
  unidad?: string;
  /**
   * Contador acumulado (solo sube desde que arranco el equipo). No sirve como umbral:
   * la unica condicion con sentido es "responde". El valor se usa para graficar.
   */
  contador?: boolean;
}

export interface Equipo {
  nombre?: string;
  descripcion?: string;
  ubicacion?: string;
  contacto?: string;
  encendidoDesde?: string;
}

const OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysContact: "1.3.6.1.2.1.1.4.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  sysLocation: "1.3.6.1.2.1.1.6.0",
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifSpeed: "1.3.6.1.2.1.2.2.1.5",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifInErrors: "1.3.6.1.2.1.2.2.1.14",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
  ifOutErrors: "1.3.6.1.2.1.2.2.1.20",
  ifName: "1.3.6.1.2.1.31.1.1.1.1",
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",
  ifHighSpeed: "1.3.6.1.2.1.31.1.1.1.15",
  ifAlias: "1.3.6.1.2.1.31.1.1.1.18",
  hrProcessorLoad: "1.3.6.1.2.1.25.3.3.1.2",
  hrStorageDescr: "1.3.6.1.2.1.25.2.3.1.3",
  hrStorageSize: "1.3.6.1.2.1.25.2.3.1.5",
  hrStorageUsed: "1.3.6.1.2.1.25.2.3.1.6",
};

const TOPE_FILAS = 600;
const TIMEOUT_MS = 2500;

/** Acepta IPv4 o un nombre de host. Nada de esquemas, puertos ni espacios. */
export function hostValido(h: string): boolean {
  const s = String(h || "").trim();
  if (!s || s.length > 253) return false;
  if (/[\s/\\:;|&`$<>"']/.test(s)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s.split(".").every((o) => Number(o) >= 0 && Number(o) <= 255);
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(s);
}

export function oidValido(o: string): boolean {
  return /^\d+(\.\d+){1,}$/.test(String(o || "").trim());
}

function texto(v: any): string {
  if (v === null || v === undefined) return "";
  if (Buffer.isBuffer(v)) {
    // Muchos equipos devuelven la MAC o binario puro en un OctetString.
    const s = v.toString("utf8");
    // eslint-disable-next-line no-control-regex
    return /^[\x09\x0a\x0d\x20-\x7e\xa0-\xff]*$/.test(s) ? s.trim() : v.toString("hex");
  }
  return String(v);
}

function nombreTipo(t: number): string {
  const m: Record<number, string> = {
    2: "entero", 4: "texto", 5: "nulo", 6: "oid", 64: "ip",
    65: "contador", 66: "medidor", 67: "tiempo", 70: "contador64",
  };
  return m[t] || "tipo " + t;
}

function sesion(host: string, comunidad: string, version: Version, puerto: number) {
  return snmp.createSession(host, comunidad, {
    port: puerto,
    version: version === "1" ? snmp.Version1 : snmp.Version2c,
    timeout: TIMEOUT_MS,
    retries: 1,
  });
}

/** Recorre un subarbol y devuelve las filas crudas. */
export function caminar(
  host: string, comunidad: string, version: Version, raiz: string, puerto = 161, tope = TOPE_FILAS
): Promise<Fila[]> {
  return new Promise((resolve, reject) => {
    const ses = sesion(host, comunidad, version, puerto);
    const filas: Fila[] = [];
    let cerrado = false;
    const cerrar = (err?: Error) => {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(reloj);
      try { ses.close(); } catch { /* ya estaba cerrada */ }
      if (err && !filas.length) reject(err);
      else resolve(filas);
    };
    // Tope de tiempo propio: un equipo que contesta a medias puede dejar el
    // recorrido colgado, y del otro lado hay alguien esperando en una pantalla.
    const reloj = setTimeout(() => cerrar(new Error("el equipo no terminó de responder a tiempo")), 20000);

    try {
      ses.subtree(
        raiz,
        20,
        (varbinds: any[]) => {
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) continue;
            if (filas.length >= tope) return;
            filas.push({ oid: vb.oid, tipo: nombreTipo(vb.type), valor: texto(vb.value) });
          }
        },
        (error: any) => cerrar(error ? new Error(String(error.message || error)) : undefined)
      );
    } catch (e: any) {
      cerrar(new Error(e?.message || "no se pudo iniciar la consulta"));
    }
  });
}

/** Varios OIDs sueltos de una sola vez. Devuelve un mapa oid -> valor. */
export function leer(
  host: string, comunidad: string, version: Version, oids: string[], puerto = 161
): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const ses = sesion(host, comunidad, version, puerto);
    let cerrado = false;
    const cerrar = (r: Record<string, string>) => {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(reloj);
      try { ses.close(); } catch { /* ya estaba cerrada */ }
      resolve(r);
    };
    const reloj = setTimeout(() => cerrar({}), TIMEOUT_MS * 2 + 1000);
    try {
      ses.get(oids, (error: any, varbinds: any[]) => {
        if (error) return cerrar({});
        const out: Record<string, string> = {};
        for (const vb of varbinds || []) {
          if (snmp.isVarbindError(vb)) continue;
          out[vb.oid] = texto(vb.value);
        }
        cerrar(out);
      });
    } catch { cerrar({}); }
  });
}

const sufijo = (oid: string, raiz: string) => oid.slice(raiz.length + 1);

function porIndice(filas: Fila[], raiz: string): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of filas) if (f.oid.startsWith(raiz + ".")) m[sufijo(f.oid, raiz)] = f.valor;
  return m;
}

function humanoBps(bps: number): string {
  if (!isFinite(bps) || bps <= 0) return "";
  if (bps >= 1e9) return (bps / 1e9).toFixed(bps >= 1e10 ? 0 : 1) + " Gbps";
  if (bps >= 1e6) return (bps / 1e6).toFixed(bps >= 1e7 ? 0 : 1) + " Mbps";
  return Math.round(bps / 1e3) + " kbps";
}

/**
 * Lo que de verdad sirve: mira el equipo y arma una lista de sensores candidatos.
 * Primero el sistema, despues una tanda por interfaz, y si el equipo publica
 * HOST-RESOURCES tambien CPU y discos.
 */
export async function relevarSensores(
  host: string, comunidad: string, version: Version, puerto = 161
): Promise<{ equipo: Equipo; sensores: Sensor[] }> {
  const sys = await leer(host, comunidad, version,
    [OIDS.sysDescr, OIDS.sysUpTime, OIDS.sysName, OIDS.sysLocation, OIDS.sysContact], puerto);

  const equipo: Equipo = {
    nombre: sys[OIDS.sysName] || undefined,
    descripcion: sys[OIDS.sysDescr] || undefined,
    ubicacion: sys[OIDS.sysLocation] || undefined,
    contacto: sys[OIDS.sysContact] || undefined,
    encendidoDesde: sys[OIDS.sysUpTime] || undefined,
  };

  const sensores: Sensor[] = [];

  sensores.push({
    id: "sys-uptime",
    nombre: "Tiempo encendido",
    detalle: "Si el equipo se reinicia, este contador vuelve a cero",
    grupo: "Sistema",
    oid: OIDS.sysUpTime,
    operador: ">=",
    valorEsperado: "0",
    lectura: sys[OIDS.sysUpTime],
    contador: true,
  });

  // ── interfaces ──
  const [descr, nombres, alias, oper, altaVel, vel] = await Promise.all([
    caminar(host, comunidad, version, OIDS.ifDescr, puerto).catch(() => [] as Fila[]),
    caminar(host, comunidad, version, OIDS.ifName, puerto).catch(() => [] as Fila[]),
    caminar(host, comunidad, version, OIDS.ifAlias, puerto).catch(() => [] as Fila[]),
    caminar(host, comunidad, version, OIDS.ifOperStatus, puerto).catch(() => [] as Fila[]),
    caminar(host, comunidad, version, OIDS.ifHighSpeed, puerto).catch(() => [] as Fila[]),
    caminar(host, comunidad, version, OIDS.ifSpeed, puerto).catch(() => [] as Fila[]),
  ]);

  const mDescr = porIndice(descr, OIDS.ifDescr);
  const mNom = porIndice(nombres, OIDS.ifName);
  const mAlias = porIndice(alias, OIDS.ifAlias);
  const mOper = porIndice(oper, OIDS.ifOperStatus);
  const mAlta = porIndice(altaVel, OIDS.ifHighSpeed);
  const mVel = porIndice(vel, OIDS.ifSpeed);
  // Ojo: NO se usan los contadores de 64 bits aunque el equipo los publique.
  // Uptime Kuma no puede convertir un Counter64 y el monitor queda caido para siempre.

  const indices = Object.keys({ ...mDescr, ...mNom }).sort((a, b) => Number(a) - Number(b));
  for (const i of indices) {
    const etiqueta = mNom[i] || mDescr[i] || "if" + i;
    const nota = mAlias[i] ? ` (${mAlias[i]})` : "";
    const bps = Number(mAlta[i]) > 0 ? Number(mAlta[i]) * 1e6 : Number(mVel[i]) || 0;
    const velTxt = humanoBps(bps);
    const arriba = mOper[i] === "1";
    const grupo = `Interfaz ${etiqueta}${nota}`;

    sensores.push({
      id: `if-${i}-estado`,
      nombre: `${etiqueta} — estado del enlace`,
      detalle: arriba ? "ahora está arriba" : "ahora está caída",
      grupo, oid: `${OIDS.ifOperStatus}.${i}`,
      operador: "==", valorEsperado: "1",
      lectura: arriba ? "arriba" : mOper[i] === "2" ? "caída" : mOper[i],
    });

    const entrada = `${OIDS.ifInOctets}.${i}`;
    const salida = `${OIDS.ifOutOctets}.${i}`;
    const notaVel = velTxt ? `puerto de ${velTxt} · ` : "";

    sensores.push({
      id: `if-${i}-in`,
      nombre: `${etiqueta} — tráfico de entrada`,
      detalle: `${notaVel}contador acumulado, sirve para el gráfico del enlace`,
      grupo, oid: entrada, operador: ">=", valorEsperado: "0",
      unidad: "octetos", contador: true,
    });
    sensores.push({
      id: `if-${i}-out`,
      nombre: `${etiqueta} — tráfico de salida`,
      detalle: `${notaVel}contador acumulado, sirve para el gráfico del enlace`,
      grupo, oid: salida, operador: ">=", valorEsperado: "0",
      unidad: "octetos", contador: true,
    });
    sensores.push({
      id: `if-${i}-err`,
      nombre: `${etiqueta} — errores de entrada`,
      detalle: "contador acumulado de errores físicos del enlace",
      grupo, oid: `${OIDS.ifInErrors}.${i}`, operador: ">=", valorEsperado: "0",
      contador: true,
    });
  }

  // ── CPU y discos, si el equipo los publica ──
  const cpu = await caminar(host, comunidad, version, OIDS.hrProcessorLoad, puerto, 32).catch(() => [] as Fila[]);
  cpu.forEach((f, n) => {
    sensores.push({
      id: "cpu-" + n,
      nombre: cpu.length > 1 ? `CPU ${n + 1} — uso` : "CPU — uso",
      detalle: "porcentaje de uso del procesador",
      grupo: "Sistema", oid: f.oid, operador: "<=", valorEsperado: "90",
      lectura: f.valor + " %", unidad: "%",
    });
  });

  const dDescr = await caminar(host, comunidad, version, OIDS.hrStorageDescr, puerto, 64).catch(() => [] as Fila[]);
  if (dDescr.length) {
    const mTam = porIndice(await caminar(host, comunidad, version, OIDS.hrStorageSize, puerto, 64).catch(() => []), OIDS.hrStorageSize);
    const mUso = porIndice(await caminar(host, comunidad, version, OIDS.hrStorageUsed, puerto, 64).catch(() => []), OIDS.hrStorageUsed);
    for (const f of dDescr) {
      const i = sufijo(f.oid, OIDS.hrStorageDescr);
      const tam = Number(mTam[i]) || 0;
      if (!tam) continue;
      const uso = Number(mUso[i]) || 0;
      const pct = Math.round((uso / tam) * 100);
      sensores.push({
        id: "disco-" + i,
        nombre: `${f.valor} — ocupación`,
        detalle: `${pct}% usado ahora`,
        grupo: "Almacenamiento",
        oid: `${OIDS.hrStorageUsed}.${i}`,
        operador: "<=",
        valorEsperado: String(Math.round(tam * 0.9)),
        lectura: pct + " %",
      });
    }
  }

  return { equipo, sensores };
}
