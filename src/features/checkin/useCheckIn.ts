import { useCallback, useRef, useState } from 'react';
import { flightsApi, type CheckInResult } from '@/shared/api';
import { attemptKeys } from '@/shared/lib/attemptKeys';
import type { Authorized } from '@/shared/lib/authorized';

export type CheckInState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'done'; result: CheckInResult };

/** Pasajeros del resultado que NO quedaron con check-in (la API puede dejar a alguno fuera). */
export function notCheckedIn(result: CheckInResult): string[] {
  return result.passengers.filter((p) => p.status !== 'CHECKED_IN').map((p) => p.passengerId);
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
