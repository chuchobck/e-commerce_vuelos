import { useEffect, useRef, useState } from 'react';
import { flightsApi, type Booking, type BookingSummary } from '@/shared/api';
import type { Authorized } from '@/shared/lib/authorized';

/** Lo que la lista no trae y la tarjeta sí muestra: número de vuelo y hora de salida. */
export interface TripExtra {
  flights: string;
  departureTime: string;
  passengers: number;
}

const MAX_PARALLEL = 3;
/**
 * En memoria (nunca en almacenamiento: el detalle lleva datos personales). La clave incluye la fecha y el estado de
 * la lista, así que un cambio de fecha o una cancelación piden el detalle otra vez.
 */
const cache = new Map<string, TripExtra>();
const keyOf = (t: BookingSummary) => `${t.id}|${t.departureDate}|${t.status ?? ''}`;

function extraOf(booking: Booking): TripExtra {
  const segments = booking.outbound.itinerary.segments;
  return {
    flights: segments.map((s) => s.flightNumber).join(' + '),
    departureTime: segments[0].departureTime,
    passengers: booking.passengers.length,
  };
}

/** Vacía la memoria (pruebas). */
export function clearTripExtras(): void {
  cache.clear();
}

/**
 * DISCREPANCIA: la lista de la API (BookingListResponse) no trae número de vuelo ni hora. Para mostrarlos en cada
 * tarjeta se pide el detalle de las reservas a la vista, de a 3 y una sola vez cada una. Si un detalle falla, la
 * tarjeta simplemente no muestra esos datos (la lista no se rompe).
 */
export function useTripExtras(trips: readonly BookingSummary[], authorized: Authorized): Record<string, TripExtra> {
  const [extras, setExtras] = useState<Record<string, TripExtra>>({});
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;
  const signature = trips.map(keyOf).join(',');

  useEffect(() => {
    let cancelled = false;
    const missing = trips.filter((t) => !cache.has(keyOf(t)));
    const snapshot = () => Object.fromEntries(trips.flatMap((t) => (cache.has(keyOf(t)) ? [[t.id, cache.get(keyOf(t))!] as const] : [])));
    setExtras(snapshot());
    let next = 0;
    const worker = async () => {
      while (next < missing.length && !cancelled) {
        const trip = missing[next++];
        try {
          const booking = await authorizedRef.current(() => flightsApi.getBooking(trip.id));
          cache.set(keyOf(trip), extraOf(booking));
          if (!cancelled) setExtras(snapshot());
        } catch {
          /* sin detalle: la tarjeta queda con lo que trae la lista */
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, missing.length) }, worker));
    return () => {
      cancelled = true;
    };
    // `signature` resume a `trips`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return extras;
}
