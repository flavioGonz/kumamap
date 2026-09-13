/**
 * Aviso de cambios de estado, desde el latido de Kuma.
 *
 * Este archivo ERA el emisor: guardaba el estado anterior, decidia y mandaba el
 * push a TODOS los suscriptos. El problema es que server.ts hacia exactamente lo
 * mismo desde su sondeo de 2 s, asi que cada caida generaba dos notificaciones.
 *
 * Ahora los dos reportan a src/lib/avisos.ts, que decide una sola vez y sabe a
 * quien le interesa cada cliente. Queda el envoltorio para conservar la firma
 * que kuma.ts ya usaba.
 */

import { reportarEstado } from "./avisos";

export function onHeartbeat(
  monitorId: number,
  monitorName: string,
  status: number,
  msg: string,
  ping: number | null,
): void {
  void reportarEstado(monitorId, monitorName, status, msg, ping);
}
