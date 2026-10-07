import type { SeatAssignments, SeatConflict, SeatPassenger, SeatSegment } from '../types';
import type { SeatLayout } from './layout';
import { nearestAvailable } from './recommend';
import { assignSeat, clearSeat, seatablePassengers, seatsInSegment } from './selection';

export interface ReconcileResult {
  value: SeatAssignments;
  conflicts: SeatConflict[];
}

/**
 * Revisa lo elegido en un tramo contra un mapa recién cargado. Un asiento que ya no está libre
 * (SEAT_TAKEN) o que no es de la cabina de la tarifa (CABIN_MISMATCH) se quita; lo demás se conserva.
 * A cada conflicto se le propone el asiento libre más cercano de la cabina correcta, sin repetir.
 */
export function reconcileSegment(
  value: SeatAssignments,
  segment: Pick<SeatSegment, 'id' | 'cabin'>,
  layout: SeatLayout,
  passengers: SeatPassenger[],
): ReconcileResult {
  const cabin = segment.cabin;
  let next = value;
  const conflicts: SeatConflict[] = [];
  const reserved = seatsInSegment(value, segment.id);

  for (const passenger of seatablePassengers(passengers)) {
    const seatNumber = value[passenger.id]?.[segment.id];
    if (!seatNumber) continue;
    const seat = layout.bySeat.get(seatNumber);
    let kind: SeatConflict['kind'] | null = null;
    if (seat && seat.cabin !== cabin) kind = 'CABIN_MISMATCH';
    else if (!seat?.available) kind = 'SEAT_TAKEN';
    if (!kind) continue;
    next = clearSeat(next, passenger.id, segment.id);
    reserved.delete(seatNumber);
    const alternative = nearestAvailable(layout, seatNumber, { cabin, blocked: reserved });
    if (alternative) reserved.add(alternative);
    conflicts.push({ kind, segmentId: segment.id, passengerId: passenger.id, seatNumber, alternative });
  }
  return { value: next, conflicts };
}

/** Pone el asiento alternativo de un conflicto (si sigue libre y el pasajero no tiene otro). */
export function applyAlternative(value: SeatAssignments, conflict: SeatConflict): SeatAssignments {
  if (!conflict.passengerId || !conflict.alternative) return value;
  return assignSeat(value, conflict.passengerId, conflict.segmentId, conflict.alternative);
}
