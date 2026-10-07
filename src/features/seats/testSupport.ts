import { addDays, format } from 'date-fns';
import { mapSearchResponse, toSearchRequest } from '@/shared/api/mapping';
import { mockSearch, mockSeatMap } from '@/shared/api/mock/generators';
import type { SeatMap } from '@/shared/api';
import { seatSegmentsFromLegs } from './segments';
import type { SeatPassenger, SeatSegment } from './types';

/** Datos deterministas para las pruebas: ofertas del mock (sin latencia ni errores aleatorios). */
export function offerFor(origin: string, destination: string, adults = 1) {
  const params = {
    origin,
    destination,
    departDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    passengers: { adults, children: 0, infants: 0 },
    cabin: 'ECONOMY' as const,
  };
  return mapSearchResponse(mockSearch(toSearchRequest(params)), params).offers[0];
}

export function seatMapFor(origin: string, destination: string): { offerId: string; segmentId: string; map: SeatMap } {
  const offer = offerFor(origin, destination);
  const segment = offer.itineraries[0].segments[0];
  return { offerId: offer.id, segmentId: segment.id, map: mockSeatMap(offer.id, segment.id) };
}

export function segmentsFor(origin: string, destination: string, cabin: 'ECONOMY' | 'BUSINESS' = 'ECONOMY'): { offerId: string; segments: SeatSegment[] } {
  const offer = offerFor(origin, destination);
  const itinerary = offer.itineraries[0];
  const fare = itinerary.fares.find((f) => f.cabin === cabin)!;
  return { offerId: offer.id, segments: seatSegmentsFromLegs({ itinerary, fare }) };
}

export const FAMILY: SeatPassenger[] = [
  { id: 'p1', name: 'Ana', type: 'ADULT' },
  { id: 'p2', name: 'Luis', type: 'ADULT' },
  { id: 'p3', name: 'Sofía', type: 'CHILD' },
  { id: 'p4', name: 'Mateo', type: 'INFANT' },
];
