import { itinerarySignature, type FlightOffer, type Itinerary } from '@/shared/api';

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
