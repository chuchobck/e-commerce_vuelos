import type { AssignedSeat, SeatAssignments, SeatPassenger, SeatSegment } from '../types';

/** Quienes ocupan asiento: los bebés viajan en brazos. */
export function seatablePassengers(passengers: SeatPassenger[]): SeatPassenger[] {
  return passengers.filter((p) => p.type !== 'INFANT');
}

export function seatOf(value: SeatAssignments, passengerId: string, segmentId: string): string | undefined {
  return value[passengerId]?.[segmentId];
}

/** Pasajero que ya eligió ese asiento en el tramo. */
export function holderOf(value: SeatAssignments, segmentId: string, seatNumber: string): string | undefined {
  return Object.keys(value).find((passengerId) => value[passengerId]?.[segmentId] === seatNumber);
}

/** Asientos elegidos en un tramo por todos los pasajeros. */
export function seatsInSegment(value: SeatAssignments, segmentId: string): Set<string> {
  const seats = new Set<string>();
  for (const bySegment of Object.values(value)) if (bySegment[segmentId]) seats.add(bySegment[segmentId]);
  return seats;
}

export function assignSeat(value: SeatAssignments, passengerId: string, segmentId: string, seatNumber: string): SeatAssignments {
  return { ...value, [passengerId]: { ...value[passengerId], [segmentId]: seatNumber } };
}

/** Quita la elección de un pasajero en un tramo; si no le queda ninguna, quita también su entrada. */
export function clearSeat(value: SeatAssignments, passengerId: string, segmentId: string): SeatAssignments {
  const current = value[passengerId];
  if (!current || !(segmentId in current)) return value;
  const { [segmentId]: _removed, ...rest } = current;
  const { [passengerId]: _passenger, ...others } = value;
  return Object.keys(rest).length > 0 ? { ...others, [passengerId]: rest } : others;
}

export function clearSegment(value: SeatAssignments, segmentId: string): SeatAssignments {
  return Object.keys(value).reduce((acc, passengerId) => clearSeat(acc, passengerId, segmentId), value);
}

/** Cuántos pasajeros que ocupan asiento ya eligieron en el tramo. */
export function countChosen(value: SeatAssignments, passengers: SeatPassenger[], segmentId: string): number {
  return seatablePassengers(passengers).filter((p) => seatOf(value, p.id, segmentId)).length;
}

/**
 * Siguiente pasajero sin asiento en el tramo, empezando después de `afterId` y dando la vuelta.
 * Devuelve `undefined` si todos ya eligieron.
 */
export function nextWithoutSeat(
  passengers: SeatPassenger[],
  value: SeatAssignments,
  segmentId: string,
  afterId?: string,
): SeatPassenger | undefined {
  const seatable = seatablePassengers(passengers);
  const start = Math.max(0, seatable.findIndex((p) => p.id === afterId) + 1);
  for (let i = 0; i < seatable.length; i++) {
    const candidate = seatable[(start + i) % seatable.length];
    if (!seatOf(value, candidate.id, segmentId)) return candidate;
  }
  return undefined;
}

/**
 * Asientos de un pasajero en el formato de `PassengerItem.assignedSeats` del contrato, en el orden de
 * los tramos. Vacío = la reserva asigna automáticamente (en ese caso conviene omitir el campo).
 */
export function toAssignedSeats(value: SeatAssignments, passengerId: string, segments: Pick<SeatSegment, 'id'>[]): AssignedSeat[] {
  const chosen = value[passengerId];
  if (!chosen) return [];
  return segments.flatMap((segment) => (chosen[segment.id] ? [{ segmentId: segment.id, seatNumber: chosen[segment.id] }] : []));
}
