/**
 * URLs de los proxis de cámara.
 *
 * Hay dos formas de mirar una cámara y no son la misma:
 *
 *  - **el muro**: muchos recuadros a la vez, chicos, para darse cuenta de que algo
 *    pasa. Ahí no hace falta video: alcanza con un cuadro por segundo, escalado a
 *    640 px. El muro pedía el stream principal a 15 cuadros por segundo — unos
 *    420 KB por cuadro — y con tres cámaras eso son casi 19 MB/s hacia el
 *    navegador. No es que anduviera lento: mataba la pestaña.
 *
 *  - **una cámara abierta**: una sola, grande, para mirar de verdad. Ahí sí vale
 *    subir los cuadros y la resolución.
 *
 * SIEMPRE se prefiere `streamRef` (una referencia firmada por el servidor) sobre
 * `streamUrl`. La URL cruda lleva las credenciales RTSP y sólo llega a un operador
 * autenticado; al quiosco y al móvil les llega tachada.
 */

import { apiUrl } from "./api";

export interface StreamSource {
  streamUrl?: string;
  streamRef?: string;
  /** Referencia al sub-stream, cuando el equipo tiene uno derivable. */
  streamRefBaja?: string;
  streamType?: string;
  rtspFps?: number;
}

export interface PerfilVideo { fps: number; scale: number; quality: number }

/** Un recuadro de muro. Poco cuadro, chico y liviano. */
export const PERFIL_MURO: PerfilVideo = { fps: 1, scale: 640, quality: 12 };
/** Una cámara abierta en grande. */
export const PERFIL_VIVO: PerfilVideo = { fps: 8, scale: 1280, quality: 5 };

/**
 * Qué referencia usar. En el muro conviene el sub-stream: el equipo ya lo emite
 * chico y el servidor no tiene que decodificar 4K para mandar una estampilla.
 */
function completar(p?: Partial<PerfilVideo>): PerfilVideo {
  return { ...PERFIL_MURO, ...(p || {}) };
}

function targetParam(cam: StreamSource, preferirBaja = false): string | null {
  if (preferirBaja && cam.streamRefBaja) return `ref=${encodeURIComponent(cam.streamRefBaja)}`;
  if (cam.streamRef) return `ref=${encodeURIComponent(cam.streamRef)}`;
  if (cam.streamUrl) return `url=${encodeURIComponent(cam.streamUrl)}`;
  return null;
}

/** Foto única. `bust` fuerza un cuadro nuevo. */
export function snapshotSrc(cam: StreamSource, bust: number = Date.now(), perfil?: Partial<PerfilVideo>): string {
  const p = perfil ? completar(perfil) : null;
  const target = targetParam(cam, !!p && p.scale <= 800);
  if (!target) return "";
  const extra = p ? `&scale=${p.scale}&quality=${p.quality}` : "";
  return apiUrl(`/api/camera/snapshot?${target}${extra}&_t=${bust}`);
}

/** RTSP → MJPEG. */
export function rtspSrc(cam: StreamSource, perfil: Partial<PerfilVideo> = PERFIL_MURO): string {
  const p = completar(perfil);
  const target = targetParam(cam, p.scale <= 800);
  if (!target) return "";
  return apiUrl(
    `/api/camera/rtsp-stream?${target}&fps=${p.fps}&quality=${p.quality}&scale=${p.scale}`
  );
}

/** Lo que va en un recuadro del muro. */
export function streamSrc(cam: StreamSource): string {
  switch (cam.streamType) {
    case "rtsp":
      return rtspSrc(cam, PERFIL_MURO);
    case "snapshot":
      return snapshotSrc(cam, Date.now(), PERFIL_MURO);
    case "mjpeg":
    default:
      // MJPEG e iframe los abre el navegador solo; no hay proxy en el medio.
      return cam.streamUrl || "";
  }
}

/** Lo que va cuando se abre una cámara sola, en grande. */
export function streamSrcVivo(cam: StreamSource): string {
  switch (cam.streamType) {
    case "rtsp":
      return rtspSrc(cam, PERFIL_VIVO);
    case "snapshot":
      return snapshotSrc(cam, Date.now());
    case "mjpeg":
    default:
      return cam.streamUrl || "";
  }
}

/** True cuando la cámara tiene con qué mostrar algo. */
export function tieneVideo(cam: StreamSource): boolean {
  return !!(cam.streamType && cam.streamType !== "nvr" && (cam.streamRef || cam.streamUrl));
}
