import { useCallback, useRef, useState } from 'react';
import { flightsApi, type CheckInResult } from '@/shared/api';
import { attemptKeys } from '@/shared/lib/attemptKeys';
import type { Authorized } from '@/shared/lib/authorized';

export type CheckInState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'done'; result: CheckInResult };

/**
 * Cuántos vuelos de los pasajeros quedaron con check-in y cuántos no. Se cuenta por vuelo (`segments[].status`), no por el
 * estado del pasajero: la API (leída en su código) marca al pasajero `NOT_CHECKED_IN` o `FAILED` si le falta CUALQUIER vuelo,
 * aunque otro ya esté `CHECKED_IN`, y responde 200 `IN_PROGRESS` cuando un vuelo está en ventana y otro todavía no. Los
 * infantes viajan en brazos y no traen vuelos propios.
 */
export function checkInProgress(result: CheckInResult): { checked: number; pending: number } {
  let checked = 0;
  let pending = 0;
  for (const passenger of result.passengers) {
    for (const segment of passenger.segments) {
      if (segment.status === 'CHECKED_IN') checked += 1;
      else pending += 1;
    }
  }
  return { checked, pending };
}

/**
 * Check-in de una reserva (POST /bookings/{id}/check-in) con una clave de idempotencia por intento: un reintento tras un
 * error de red o un doble clic reenvía la misma clave y no hace dos check-in. Al terminar bien, el siguiente intento
 * (si hubiera) es otro. El doble envío mientras se procesa se ignora.
 */
export function useCheckIn(bookingId: string, authorized: Authorized) {
  const [state, setState] = useState<CheckInState>({ status: 'idle' });
  const busy = useRef(false);

  const submit = useCallback(async (): Promise<CheckInResult | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setState({ status: 'loading' });
    const scope = `check-in:${bookingId}`;
    try {
      const result = await authorized(() => flightsApi.checkIn(bookingId, attemptKeys.keyFor(scope)));
      attemptKeys.forget(scope);
      setState({ status: 'done', result });
      return result;
    } catch (error) {
      setState({ status: 'error', error });
      return undefined;
    } finally {
      busy.current = false;
    }
  }, [bookingId, authorized]);

  return { state, submit };
}
