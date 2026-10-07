import type { Hold } from '@/shared/api';

/**
 * Tiempo del hold con el reloj del SERVIDOR (README, sección 6): la API dice cuántos segundos le
 * quedan (`remainingSeconds`) y aquí se cuentan desde que llegó la respuesta (`receivedAt`, reloj
 * de este equipo). Nunca se compara `expiresAt` con la hora del equipo: un reloj adelantado o
 * atrasado daría un vencimiento falso. Solo importa cuánto tiempo pasó EN este equipo.
 */
export function holdDeadline(hold: Pick<Hold, 'receivedAt' | 'remainingSeconds'>): number {
  return hold.receivedAt + hold.remainingSeconds * 1000;
}

/** Segundos que le quedan al hold según el último dato del servidor (redondeado hacia arriba). */
export function holdSecondsLeft(hold: Pick<Hold, 'receivedAt' | 'remainingSeconds'>, now: number): number {
  return Math.max(0, Math.ceil((holdDeadline(hold) - now) / 1000));
}

/** El hold sigue apartando el cupo: el servidor dice HELD y aún le queda tiempo. */
export function holdIsLive(hold: Hold, now: number): boolean {
  return hold.status === 'HELD' && holdSecondsLeft(hold, now) > 0;
}

/** Cada cuánto se vuelve a preguntar al servidor (además de al volver a la pestaña). */
export const HOLD_RESYNC_MS = 60_000;
