import type { SelectedLeg } from '@/shared/api';
import type { SeatSegment } from './types';

/**
 * Convierte lo elegido en el paso 1 (ida y, si hay, vuelta) en los tramos del selector, en orden.
 * La cabina de cada tramo es la de la tarifa elegida en ese itinerario.
 */
export function seatSegmentsFromLegs(outbound: SelectedLeg, inbound?: SelectedLeg): SeatSegment[] {
  const toSegments = (leg: SelectedLeg, kind: SeatSegment['leg']): SeatSegment[] =>
    leg.itinerary.segments.map((segment, index, all) => ({
      id: segment.id,
      flightNumber: segment.flightNumber,
      origin: segment.origin,
      destination: segment.destination,
      departureTime: segment.departureTime,
      cabin: leg.fare.cabin,
      leg: kind,
      indexInLeg: index,
      legSize: all.length,
    }));
  return [...toSegments(outbound, 'outbound'), ...(inbound ? toSegments(inbound, 'inbound') : [])];
}
