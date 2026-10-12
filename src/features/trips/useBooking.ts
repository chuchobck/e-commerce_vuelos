import { useCallback, useEffect, useRef, useState } from 'react';
import { flightsApi, type Booking } from '@/shared/api';
import type { Authorized } from '@/shared/lib/authorized';

/** Al volver a la pestaña no se vuelve a pedir si el dato tiene menos de esto (sin polling agresivo). */
const MIN_REFRESH_GAP_MS = 20_000;

export interface BookingState {
  status: 'loading' | 'ready' | 'error';
  booking: Booking | undefined;
  /** Error de la primera carga (si ya hay reserva, un fallo al actualizar no la borra). */
  error: unknown;
  /** Hay una actualización en curso (la reserva anterior sigue a la vista). */
  refreshing: boolean;
  /** Vuelve a pedir la reserva. Devuelve la nueva o `undefined` si falló. */
  refresh: () => Promise<Booking | undefined>;
}

/**
 * Reserva de una pantalla de "Mis viajes" (GET /bookings/{id}, con sesión). No se guarda en ninguna caché: cada pantalla
 * la pide de nuevo al abrirse, así que tras un cambio de fecha, equipaje o cancelación siempre muestra lo último.
 * `refresh()` sirve para ver el final de un trámite en proceso (202); también se actualiza al volver a la pestaña.
 */
export function useBooking(bookingId: string, authorized: Authorized): BookingState {
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [refreshing, setRefreshing] = useState(true);
  const call = useRef(0);
  const last = useRef(0);
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;

  const load = useCallback(async (): Promise<Booking | undefined> => {
    const id = ++call.current;
    setRefreshing(true);
    try {
      const next = await authorizedRef.current(() => flightsApi.getBooking(bookingId));
      if (id !== call.current) return undefined;
      last.current = Date.now();
      setBooking(next);
      setError(undefined);
      return next;
    } catch (e) {
      if (id === call.current) setError(e);
      return undefined;
    } finally {
      if (id === call.current) setRefreshing(false);
    }
  }, [bookingId]);

  useEffect(() => {
    setBooking(undefined);
    setError(undefined);
    void load();
    const calls = call;
    return () => {
      calls.current++;
    };
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last.current > MIN_REFRESH_GAP_MS) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return { status: booking ? 'ready' : error ? 'error' : 'loading', booking, error, refreshing, refresh: load };
}
