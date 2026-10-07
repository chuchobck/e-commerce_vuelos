import { es, fmt } from '@/shared/i18n';

const f = es.checkoutForms;

interface SegmentLike {
  id: string;
  origin: string;
  destination: string;
}

interface LegLike {
  itinerary: { segments: SegmentLike[] };
}

interface SeatedPassenger {
  id: string;
  type: string;
  firstName: string;
  lastName: string;
  seats?: { segmentId: string; seatNumber: string }[];
}

export interface SeatLine {
  passengerId: string;
  name: string;
  /** "UIO → GYE: 12A · GYE → UIO: 14C", "Asignación automática" o "En brazos". */
  text: string;
  /** Hay al menos un asiento elegido. */
  chosen: boolean;
}

/**
 * Qué asiento lleva cada pasajero en cada tramo, en el orden del viaje. Sirve igual para lo elegido
 * en el paso 2 (selección y borrador) que para la reserva que devuelve la API (BookedLeg).
 */
export function seatLines(passengers: SeatedPassenger[], outbound: LegLike, inbound?: LegLike): SeatLine[] {
  const segments = [...outbound.itinerary.segments, ...(inbound?.itinerary.segments ?? [])];
  return passengers.map((p, i) => {
    // Sin nombre escrito todavía, "Pasajero 1" (no una línea que empiece con dos puntos).
    const name = `${p.firstName} ${p.lastName}`.trim() || fmt(f.passengerShort, { number: i + 1 });
    if (p.type === 'INFANT') return { passengerId: p.id, name, text: f.seatInfant, chosen: false };
    const parts = segments.flatMap((s) => {
      const seat = p.seats?.find((x) => x.segmentId === s.id)?.seatNumber;
      return seat ? [fmt(f.seatInSegment, { origin: s.origin, destination: s.destination, seat })] : [];
    });
    return { passengerId: p.id, name, text: parts.length > 0 ? parts.join(' · ') : f.seatAutoShort, chosen: parts.length > 0 };
  });
}

/** ¿Alguien eligió asiento? (sin elecciones todo es automático). */
export const anySeatChosen = (lines: SeatLine[]) => lines.some((l) => l.chosen);
