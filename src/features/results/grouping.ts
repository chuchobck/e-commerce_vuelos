import { faresForCabin, itinerarySignature, type FlightOffer, type Itinerary, type SearchCabin } from '@/shared/api';
import { minMoney, type Money } from '@/shared/lib/money';

/**
 * Un itinerario de ida y todas las ofertas que lo contienen.
 * En ida y vuelta la API devuelve combinaciones (ida + vuelta de la misma aerolínea): se agrupan
 * por la ida para que el viajero elija primero la ida y después, entre esas ofertas, la vuelta.
 */
export interface OutboundGroup {
  key: string;
  itinerary: Itinerary;
  airlineName: string;
  offers: FlightOffer[];
}

/** Agrupa por itinerario de ida conservando el orden de la API (de la más barata a la más cara). */
export function groupOutbound(offers: FlightOffer[]): OutboundGroup[] {
  const groups = new Map<string, OutboundGroup>();
  for (const offer of offers) {
    const outbound = offer.itineraries[0];
    if (!outbound) continue;
    const key = `${offer.airline.code}:${itinerarySignature(outbound)}`;
    const group = groups.get(key);
    if (group) group.offers.push(offer);
    else groups.set(key, { key, itinerary: outbound, airlineName: offer.airline.name, offers: [offer] });
  }
  return [...groups.values()];
}

/** Vueltas posibles para una ida elegida: cada una con la oferta que la contiene. */
export function inboundFor(group: OutboundGroup): { offer: FlightOffer; itinerary: Itinerary }[] {
  return group.offers
    .filter((o) => o.itineraries[1])
    .map((offer) => ({ offer, itinerary: offer.itineraries[1] }));
}

/**
 * Ofertas que se pueden mostrar: la API devuelve todas las cabinas juntas, así que solo quedan las ida con
 * familias de la cabina pedida y, en ida y vuelta, las que además tienen alguna vuelta en esa cabina.
 */
export function usableGroups(offers: FlightOffer[], cabin: SearchCabin, roundTrip: boolean): OutboundGroup[] {
  return groupOutbound(offers).filter(
    (g) =>
      faresForCabin(g.itinerary, cabin).length > 0 &&
      (!roundTrip || inboundFor(g).some((i) => faresForCabin(i.itinerary, cabin).length > 0)),
  );
}

/** Precio por adulto más bajo de un itinerario en la cabina pedida. */
export function cheapestFare(itinerary: Itinerary, cabin: SearchCabin): Money | undefined {
  return minMoney(faresForCabin(itinerary, cabin).map((f) => f.pricePerAdult));
}

/** Precio más bajo de todo un conjunto de ida (para "desde $X" en fechas cercanas). */
export function cheapestOf(groups: OutboundGroup[], cabin: SearchCabin): Money | undefined {
  return minMoney(groups.flatMap((g) => cheapestFare(g.itinerary, cabin) ?? []));
}

export type SortKey = 'price' | 'departure' | 'duration';
export const SORT_KEYS: readonly SortKey[] = ['price', 'departure', 'duration'];

/** Ordena sin tocar el original. Los empates conservan el orden de la API (de la más barata a la más cara). */
export function sortItems<T>(items: readonly T[], itineraryOf: (item: T) => Itinerary, key: SortKey, cabin: SearchCabin): T[] {
  const value = (item: T): number => {
    const it = itineraryOf(item);
    if (key === 'duration') return it.durationMinutes;
    if (key === 'departure') return new Date(it.segments[0].departureTime).getTime();
    return cheapestFare(it, cabin)?.cents ?? Number.MAX_SAFE_INTEGER;
  };
  return items
    .map((item, index) => ({ item, index, v: value(item) }))
    .sort((a, b) => a.v - b.v || a.index - b.index)
    .map((x) => x.item);
}
