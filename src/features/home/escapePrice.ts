import type { Fare, FlightOffer, Itinerary } from '@/shared/api';
import { addMoney, minMoney, type Money } from '@/shared/lib/money';
import { createTtlCache } from '@/shared/lib/ttlCache';

export interface Escape {
  code: string;
  /** Precio más bajo ida y vuelta por persona (adulto), o null si no hay vuelos ese fin de semana. */
  price: Money | null;
  durationMinutes: number | null;
  direct: boolean;
}

/** "Escápate" consulta poco y guarda 10 minutos (memoria + sessionStorage) para cuidar el límite de la API. */
export const escapesCache = createTtlCache<Escape>('quinde.escapes', 10 * 60_000);

/**
 * Precio "desde" de una escapada: en cada oferta, la familia más barata de cada tramo para un
 * adulto, sumada en centavos; luego la oferta más barata. Todo sale de la respuesta de la API.
 */
export function escapeFromOffers(code: string, offers: FlightOffer[], fares: (it: Itinerary) => Fare[]): Escape {
  const perOffer = offers
    .map((o) => {
      const legs = o.itineraries.map((it) => minMoney(fares(it).map((f) => f.pricePerAdult)));
      return legs.length === 2 && legs.every(Boolean) ? (legs as Money[]).reduce(addMoney) : undefined;
    })
    .filter((m): m is Money => m !== undefined);
  const fastest = offers
    .map((o) => o.itineraries[0])
    .filter(Boolean)
    .sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  return {
    code,
    price: minMoney(perOffer) ?? null,
    durationMinutes: fastest?.durationMinutes ?? null,
    direct: fastest?.stops === 0,
  };
}
