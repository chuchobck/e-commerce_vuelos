import { useCallback, useRef } from 'react';
import { flightsApi, isApiError, type BoardingPass } from '@/shared/api';
import type { Authorized } from '@/shared/lib/authorized';
import { useAsync } from '@/shared/lib/useAsync';

export interface BoardingPassesState {
  /** `ready` también mientras se actualiza (la lista anterior sigue a la vista). */
  status: 'loading' | 'ready' | 'error';
  /** Pases de los vuelos con check-in hecho; lista vacía antes del check-in. `undefined` si aún no se sabe o falló. */
  passes: BoardingPass[] | undefined;
  error: unknown;
  /** Vuelve a pedir los pases (después de confirmar el check-in). */
  refresh: () => Promise<void>;
}

/**
 * Pases de abordar de una reserva (GET /bookings/{id}/boarding-passes, con sesión). Es la única forma de saber qué vuelos
 * ya tienen check-in sin escribir nada: la API solo entrega pases de esos vuelos. Antes del check-in responde 200 con la
 * lista vacía; un 409/404 también se trata como «aún no hay pases» (README, sección 6). `authorized` se lee por ref: cambia
 * de identidad en cada render del proveedor y repetiría la carga.
 */
export function useBoardingPasses(bookingId: string, authorized: Authorized): BoardingPassesState {
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;
  const request = useAsync(() => authorizedRef.current(() => flightsApi.getBoardingPasses(bookingId)), [bookingId]);
  const { execute } = request;

  const notYet = request.status === 'error' && isApiError(request.error) && (request.error.status === 409 || request.error.status === 404);
  const passes = notYet ? [] : request.data;
  const refresh = useCallback(async () => {
    await execute();
  }, [execute]);

  return {
    status: passes ? 'ready' : request.status === 'error' ? 'error' : 'loading',
    passes,
    error: notYet ? undefined : request.error,
    refresh,
  };
}
