import { faresForCabin, type Fare, type FlightOffer, type Itinerary, type Money } from '@/shared/api';
import { POPULAR_ROUTES, type PopularRoute } from './popularRoutes';

/**
 * Una «oferta» NO es un descuento: es la tarifa económica más baja que devolvió la búsqueda real de una
 * ruta en una fecha. No hay precio anterior, porcentaje ni escasez inventada; todo sale de la respuesta.
 */
export interface Offer {
  /** Origen-destino-fecha: identifica la tarjeta y la entrada de la caché. */
  id: string;
  origin: string;
  destination: string;
  /** Fecha local de salida, yyyy-MM-dd. */
  date: string;
  /** Precio de un adulto en economía, con la moneda que respondió la API. */
  price: Money;
  airline: { code: string; name: string };
  /** Números de vuelo del itinerario (más de uno si hay escala). */
  flightNumbers: string[];
  /** Hora local de salida del primer tramo y de llegada del último, ISO con desfase. */
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stops: number;
  /** Asientos disponibles en esa tarifa, tal como los informa la API. */
  seatsLeft: number;
}

export function offerId(route: PopularRoute, date: string): string {
  return `${route.origin}-${route.destination}-${date}`;
}

interface Candidate {
  offer: FlightOffer;
  itinerary: Itinerary;
  fare: Fare;
}

/** Menor precio; a igual precio, sale antes; a igual salida, menos escalas; y por último el número de vuelo. */
function compare(a: Candidate, b: Candidate): number {
  const departure = (c: Candidate) => c.itinerary.segments[0]?.departureTime ?? '';
  const flight = (c: Candidate) => c.itinerary.segments[0]?.flightNumber ?? '';
  return (
    a.fare.pricePerAdult.cents - b.fare.pricePerAdult.cents ||
    departure(a).localeCompare(departure(b)) ||
    a.itinerary.stops - b.itinerary.stops ||
    flight(a).localeCompare(flight(b))
  );
}

/**
 * La oferta más barata de una búsqueda de ida, un adulto, economía: entre todos los itinerarios, la tarifa
 * económica de menor precio. `null` si la ruta no tiene vuelos esa fecha. Si la respuesta mezclara monedas
 * (no pasa), solo se comparan las de la primera: nunca se suman ni comparan montos de monedas distintas.
 */
export function cheapestOffer(route: PopularRoute, date: string, offers: FlightOffer[]): Offer | null {
  const candidates: Candidate[] = [];
  for (const offer of offers) {
    const itinerary = offer.itineraries[0];
    if (!itinerary || itinerary.segments.length === 0) continue;
    for (const fare of faresForCabin(itinerary, 'ECONOMY')) candidates.push({ offer, itinerary, fare });
  }
  const currency = candidates[0]?.fare.pricePerAdult.currency;
  const best = candidates.filter((c) => c.fare.pricePerAdult.currency === currency).sort(compare)[0];
  if (!best) return null;

  const { offer, itinerary, fare } = best;
  const first = itinerary.segments[0];
  const last = itinerary.segments[itinerary.segments.length - 1];
  return {
    id: offerId(route, date),
    origin: route.origin,
    destination: route.destination,
    date,
    price: fare.pricePerAdult,
    airline: offer.airline,
    flightNumbers: itinerary.segments.map((s) => s.flightNumber),
    departureTime: first.departureTime,
    arrivalTime: last.arrivalTime,
    durationMinutes: itinerary.durationMinutes,
    stops: itinerary.stops,
    seatsLeft: fare.seatsLeft,
  };
}

/** De menor a mayor precio; a igual precio, la que sale antes. */
export function sortOffers(offers: readonly Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.price.cents - b.price.cents || a.departureTime.localeCompare(b.departureTime) || a.id.localeCompare(b.id));
}

/** Lo que se ve: las del origen elegido (todas si es `null`), ordenadas y con el tope de tarjetas. */
export function visibleOffers(offers: readonly Offer[], origin: string | null, limit: number): Offer[] {
  return sortOffers(origin ? offers.filter((o) => o.origin === origin) : offers).slice(0, limit);
}

/** Orígenes que tienen alguna oferta, en el orden fijo de la lista de rutas populares (para los chips de filtro). */
export function originsOf(offers: readonly Offer[], routes: readonly PopularRoute[] = POPULAR_ROUTES): string[] {
  const order = [...new Set(routes.map((r) => r.origin))];
  const present = new Set(offers.map((o) => o.origin));
  return [...order.filter((o) => present.has(o)), ...[...present].filter((o) => !order.includes(o))];
}
