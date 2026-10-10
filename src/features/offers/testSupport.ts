import type { Fare, FlightOffer, SearchParams, SearchResult } from '@/shared/api';
import type { CabinClass } from '@/shared/api';
import type { PopularRoute } from './popularRoutes';

/** Una familia tarifaria de prueba (la forma de la interfaz, ya mapeada). */
export function fare(cents: number, over: Partial<Fare> = {}): Fare {
  const price = { cents, currency: 'USD' };
  return {
    cabin: 'ECONOMY' as CabinClass,
    brand: 'BASIC',
    seatsLeft: 20,
    refundable: false,
    changeable: false,
    baggage: { personalItem: true, carryOn: 1, checked: 0 },
    extraBagPrice: null,
    pricePerAdult: price,
    total: price,
    ...over,
  };
}

interface FlightSpec {
  flight: string;
  departs: string;
  fares: Fare[];
  stops?: number;
  airline?: { code: string; name: string };
}

/** Una oferta de ida con un itinerario (con `stops` escalas, un tramo por escala). */
export function flightOffer(route: PopularRoute, date: string, spec: FlightSpec): FlightOffer {
  const stops = spec.stops ?? 0;
  const segments = Array.from({ length: stops + 1 }, (_, i) => ({
    id: `${spec.flight}-${i}`,
    flightNumber: i === 0 ? spec.flight : `${spec.flight}${i}`,
    carrier: spec.airline?.code ?? 'LA',
    origin: route.origin,
    destination: route.destination,
    departureTime: `${date}T${spec.departs}:00-05:00`,
    arrivalTime: `${date}T${String(Number(spec.departs.slice(0, 2)) + 1).padStart(2, '0')}:${spec.departs.slice(3)}:00-05:00`,
    durationMinutes: 55,
    aircraft: '320',
    layoverMinutes: i === 0 ? null : 60,
  }));
  return {
    id: `offer-${spec.flight}`,
    airline: spec.airline ?? { code: 'LA', name: 'LATAM' },
    itineraries: [{ id: `it-${spec.flight}`, segments, durationMinutes: 55 + stops * 60, stops, fares: spec.fares }],
    grandTotal: spec.fares[0]?.total ?? { cents: 0, currency: 'USD' },
  };
}

export function searchResult(params: SearchParams, offers: FlightOffer[]): SearchResult {
  return { params, offers };
}
