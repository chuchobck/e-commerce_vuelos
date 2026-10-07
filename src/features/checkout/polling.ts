import type { Booking } from '@/shared/api';

/**
 * Seguimiento de una reserva "en proceso" (202: pago o emisión asíncronos). Se consulta
 * GET /bookings/{id} con esperas crecientes (2, 4, 8, 16 y luego cada 30 s) hasta un estado final
 * o hasta el tope de 2 minutos. Pasado el tope NO se reintenta la compra: la reserva existe y
 * terminará sola; la interfaz manda a Mis viajes. (La API local confirmó a los ~20 s.)
 */
export const POLL_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
export const POLL_LIMIT_MS = 120_000;

/** Estados que ya no cambian solos. */
export function isFinalBooking(booking: Booking): boolean {
  return booking.status === 'CONFIRMED' || booking.status === 'FAILED' || booking.status === 'CANCELLED';
}

/** Espera antes del intento `attempt` (0, 1, 2…): crece y luego se mantiene en el último valor. */
export function pollDelay(attempt: number): number {
  return POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)];
}

export interface PollDeps {
  get: () => Promise<Booking>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  limitMs?: number;
  /** Para dejar de consultar (salir de la pantalla). */
  cancelled?: () => boolean;
}

/**
 * Consulta hasta un estado final. Devuelve la reserva final, o `null` si se alcanzó el tope (o se
 * canceló). Un error de red en una consulta no corta el seguimiento: se sigue con la próxima espera.
 */
export async function pollBooking({ get, sleep, now, limitMs = POLL_LIMIT_MS, cancelled = () => false }: PollDeps): Promise<Booking | null> {
  const start = now();
  for (let attempt = 0; ; attempt++) {
    const wait = pollDelay(attempt);
    if (now() - start + wait > limitMs) return null;
    await sleep(wait);
    if (cancelled()) return null;
    try {
      const booking = await get();
      if (isFinalBooking(booking)) return booking;
    } catch {
      /* se intenta en la próxima espera */
    }
  }
}
