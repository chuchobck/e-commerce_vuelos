import type { BookingSummary } from '@/shared/api';

export type TripFilter = 'upcoming' | 'past' | 'cancelled';
export const TRIP_FILTERS: readonly TripFilter[] = ['upcoming', 'past', 'cancelled'];

/**
 * En qué lista cae una reserva. Lo decide el estado y la fecha de salida que da la lista de la API:
 *  - Cancelados: CANCELLED y también FAILED (DISCREPANCIA: el contrato no dice dónde va una reserva que falló; no
 *    tiene viaje, así que se agrupa con las canceladas).
 *  - Pasados: salida anterior a hoy.
 *  - Próximos: el resto (incluye reservas con un trámite en proceso y las que no traen fecha).
 * `today` es la fecha local de hoy (yyyy-MM-dd). La salida es la fecha local del aeropuerto de salida.
 */
export function classifyTrip(trip: Pick<BookingSummary, 'status' | 'departureDate'>, today: string): TripFilter {
  if (trip.status === 'CANCELLED' || trip.status === 'FAILED') return 'cancelled';
  if (trip.departureDate && trip.departureDate < today) return 'past';
  return 'upcoming';
}

/** Próximos: el más cercano primero. Pasados y cancelados: el más reciente primero. */
export function tripsFor(items: readonly BookingSummary[], filter: TripFilter, today: string): BookingSummary[] {
  const inFilter = items.filter((t) => classifyTrip(t, today) === filter);
  const dir = filter === 'upcoming' ? 1 : -1;
  return inFilter
    .map((item, index) => ({ item, index }))
    .sort((a, b) => dir * a.item.departureDate.localeCompare(b.item.departureDate) || a.index - b.index)
    .map((x) => x.item);
}

export function countTrips(items: readonly BookingSummary[], today: string): Record<TripFilter, number> {
  const counts: Record<TripFilter, number> = { upcoming: 0, past: 0, cancelled: 0 };
  for (const item of items) counts[classifyTrip(item, today)] += 1;
  return counts;
}
