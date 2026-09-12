/**
 * Grabadores (NVR / DVR / XVR) y sus canales.
 *
 * Por qué existe este archivo: la grilla de canales no se podía abrir desde
 * ningún lado. `/api/cameras` sólo convertía en canales reproducibles a los
 * **nodos** NVR del mapa (icono `harddrive` con `ip`), y en producción no hay
 * ninguno: los nueve grabadores están documentados como **dispositivos dentro de
 * racks**, que esa ruta sólo publicaba para el modal de "asociar cámara". Es
 * decir, la pantalla ofrecía asociar cámaras a canales que nunca se podían mirar.
 *
 * Acá se juntan las dos fuentes en una sola lista y, sobre todo, se dice por qué
 * un canal no se puede reproducir en vez de dejar un recuadro negro girando:
 * falta la IP de gestión, faltan las credenciales, o el servidor no tiene ruta a
 * esa red (medido en producción: los tres grabadores con IP viven en
 * 192.168.1.0/24 y 192.168.10.0/24, y el servidor sólo rutea 192.168.99.0/24).
 */
import db from "./db";
import { mintStreamRef } from "./stream-token";

/** Los dos dialectos que cubren todo lo que hay instalado. */
export type Patron = "hikvision" | "dahua";

export interface CanalGrabador {
  canal: number;
  etiqueta: string;
  /** Lo que dice la documentación del rack, no lo que está pasando. */
  documentado: boolean;
  camara: string;
  camaraIp: string;
  grabacion: string;
  resolucion: string;
  codec: string;
  /** Referencia firmada para pedirle video al proxy. Sólo si se puede. */
  streamRef?: string;
  streamRefBaja?: string;
}

export type MotivoSinVideo = "sin-ip" | "sin-credenciales" | null;

export interface Grabador {
  id: string;              // rackNodeId::deviceId, o el id del nodo
  origen: "rack" | "nodo";
  etiqueta: string;
  rack: string;
  mapaId: string;
  mapa: string;
  ip: string;
  modelo: string;
  usuario: string;
  tieneClave: boolean;
  patron: Patron;
  /** null = se puede pedir video; si no, qué falta. */
  motivo: MotivoSinVideo;
  canales: CanalGrabador[];
  totalCanales: number;
  documentados: number;
}

function json(s: string | null | undefined): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * El patrón se deduce del modelo y se puede fijar a mano (`rtspPatron`).
 * Se deduce, no se adivina a ciegas: si el modelo no dice nada, Hikvision es lo
 * que hay instalado en la mayoría y además es el que ya usaba la ruta vieja.
 */
export function patronDe(dev: any): Patron {
  const fijado = String(dev?.rtspPatron || "").toLowerCase();
  if (fijado === "dahua" || fijado === "hikvision") return fijado as Patron;
  const txt = `${dev?.model || ""} ${dev?.label || ""} ${dev?.brand || ""}`.toLowerCase();
  if (/dahua|\bdh-|xvr|hdcvi/.test(txt)) return "dahua";
  return "hikvision";
}

/** La URL RTSP de un canal. Devuelve [principal, sub] o null si falta algo. */
export function urlDeCanal(
  ip: string, usuario: string, clave: string, canal: number, patron: Patron
): { principal: string; sub: string } | null {
  if (!ip || !usuario || !clave) return null;
  const cred = `${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}`;
  if (patron === "dahua") {
    const base = `rtsp://${cred}@${ip}:554/cam/realmonitor?channel=${canal}`;
    return { principal: `${base}&subtype=0`, sub: `${base}&subtype=1` };
  }
  const base = `rtsp://${cred}@${ip}:554/Streaming/Channels/${canal}`;
  return { principal: `${base}01`, sub: `${base}02` };
}

function armarCanales(
  crudos: any[], ip: string, usuario: string, clave: string, patron: Patron
): CanalGrabador[] {
  return crudos.map((ch: any, i: number) => {
    const canal = Number(ch?.channel ?? ch?.id ?? i + 1) || i + 1;
    const urls = urlDeCanal(ip, usuario, clave, canal, patron);
    return {
      canal,
      etiqueta: String(ch?.label || ch?.name || `CH${canal}`),
      documentado: !!(ch?.enabled || ch?.connectedCamera || ch?.cameraIp),
      camara: String(ch?.connectedCamera || ""),
      camaraIp: String(ch?.cameraIp || ""),
      grabacion: String(ch?.recording || ""),
      resolucion: String(ch?.resolution || ""),
      codec: String(ch?.codec || ""),
      ...(urls
        ? { streamRef: mintStreamRef(urls.principal), streamRefBaja: mintStreamRef(urls.sub) }
        : {}),
    };
  });
}

/**
 * Todos los grabadores, vengan de un rack o de un nodo suelto del mapa.
 *
 * Importante: los canales se arman aunque estén sin documentar. `enabled` es una
 * anotación de quien dibujó el rack, no el estado del equipo — si hay IP y
 * credenciales, el canal se puede probar igual, y probarlo es justamente cómo se
 * completa la documentación.
 */
export function listarGrabadores(): Grabador[] {
  const mapas = db.prepare("SELECT id, name FROM network_maps").all() as any[];
  const nombrePorMapa = new Map(mapas.map((m) => [m.id, m.name as string]));
  const nodos = db.prepare(
    "SELECT id, map_id, label, icon, custom_data FROM network_map_nodes"
  ).all() as any[];

  const salida: Grabador[] = [];

  for (const nodo of nodos) {
    const d = json(nodo.custom_data) || {};
    const icono = nodo.icon || d.icon || "";
    const mapa = nombrePorMapa.get(nodo.map_id) || "";

    // 1. Grabadores documentados dentro de un rack.
    if (icono === "_rack" && d.type === "rack" && Array.isArray(d.devices)) {
      for (const dev of d.devices) {
        if (dev?.type !== "nvr") continue;
        const ip = String(dev.managementIp || dev.ipAddress || dev.ip || "");
        const usuario = String(dev.mgmtUser || dev.username || "");
        const clave = String(dev.mgmtPassword || dev.password || "");
        const patron = patronDe(dev);
        const crudos: any[] = Array.isArray(dev.nvrChannels) ? dev.nvrChannels : [];
        const totales = Number(dev.nvrTotalChannels) || crudos.length;
        // Si el rack declara 32 canales y sólo documentó 16, los otros existen igual.
        const completos = crudos.length >= totales
          ? crudos
          : [...crudos, ...Array.from({ length: totales - crudos.length }, (_, i) => ({ channel: crudos.length + i + 1 }))];
        const canales = armarCanales(completos, ip, usuario, clave, patron);
        salida.push({
          id: `${nodo.id}::${dev.id}`,
          origen: "rack",
          etiqueta: String(dev.label || "NVR"),
          rack: String(nodo.label || "Rack"),
          mapaId: nodo.map_id, mapa,
          ip, modelo: String(dev.model || ""),
          usuario, tieneClave: !!clave, patron,
          motivo: !ip ? "sin-ip" : (!usuario || !clave) ? "sin-credenciales" : null,
          canales,
          totalCanales: canales.length,
          documentados: canales.filter((c) => c.documentado).length,
        });
      }
    }

    // 2. Grabadores que son un nodo del mapa.
    if (icono === "harddrive" || d.deviceType === "nvr") {
      const ip = String(d.ip || "");
      const usuario = String(d.mgmtUser || "");
      const clave = String(d.mgmtPassword || "");
      const patron = patronDe(d);
      const crudos: any[] = Array.isArray(d.nvrChannels) ? d.nvrChannels : [];
      const canales = armarCanales(
        crudos.length ? crudos : Array.from({ length: 8 }, (_, i) => ({ channel: i + 1 })),
        ip, usuario, clave, patron
      );
      salida.push({
        id: nodo.id,
        origen: "nodo",
        etiqueta: String(nodo.label || "NVR"),
        rack: "",
        mapaId: nodo.map_id, mapa,
        ip, modelo: String(d.model || d.description || ""),
        usuario, tieneClave: !!clave, patron,
        motivo: !ip ? "sin-ip" : (!usuario || !clave) ? "sin-credenciales" : null,
        canales,
        totalCanales: canales.length,
        documentados: canales.filter((c) => c.documentado).length,
      });
    }
  }

  return salida.sort((a, b) =>
    a.mapa.localeCompare(b.mapa) || a.rack.localeCompare(b.rack) || a.etiqueta.localeCompare(b.etiqueta));
}

/** Guarda el dialecto RTSP elegido en el dispositivo del rack. */
export function guardarPatron(id: string, patron: Patron): boolean {
  const [nodoId, devId] = id.split("::");
  const fila = db.prepare("SELECT custom_data FROM network_map_nodes WHERE id = ?").get(nodoId) as any;
  if (!fila) return false;
  const d = json(fila.custom_data) || {};

  if (devId) {
    if (!Array.isArray(d.devices)) return false;
    const dev = d.devices.find((x: any) => x?.id === devId);
    if (!dev) return false;
    dev.rtspPatron = patron;
  } else {
    d.rtspPatron = patron;
  }
  db.prepare("UPDATE network_map_nodes SET custom_data = ? WHERE id = ?").run(JSON.stringify(d), nodoId);
  return true;
}
