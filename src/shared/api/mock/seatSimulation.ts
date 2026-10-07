import type { SeatMapDto } from '../contract';
import { ApiError } from '../errors';

/**
 * Simulación de conflictos de asientos para el mock (solo desarrollo y pruebas).
 *
 * La API real responde SEAT_TAKEN (409) o SEAT_CABIN_MISMATCH (422) al crear la reserva. Esos errores
 * no dicen qué asiento falló, así que para ensayarlos el mock puede, además, marcar asientos como
 * ocupados: el siguiente `getSeatMap` ya los devuelve con `isAvailable: false`.
 */
const taken = new Map<string, Set<string>>();

/** Marca un asiento como ocupado en el mock desde ahora (como si otra persona lo hubiera comprado). */
export function simulateSeatTaken(segmentId: string, seatNumber: string): void {
  const seats = taken.get(segmentId) ?? new Set<string>();
  seats.add(seatNumber);
  taken.set(segmentId, seats);
}

export function clearSeatSimulation(): void {
  taken.clear();
}

/** Asientos ocupados por la simulación en un tramo. */
export function simulatedSeats(segmentId: string | undefined): ReadonlySet<string> {
  return (segmentId ? taken.get(segmentId) : undefined) ?? new Set();
}

/** Aplica al mapa los asientos ocupados por la simulación. Sin simulación activa devuelve el mismo mapa. */
export function applySimulatedSeats(map: SeatMapDto): SeatMapDto {
  return markSeatsTaken(map, simulatedSeats(map.segmentId));
}

/** Devuelve el mapa con esos asientos en `isAvailable: false` (el mismo mapa si no hay ninguno). */
export function markSeatsTaken(map: SeatMapDto, seats: ReadonlySet<string>): SeatMapDto {
  if (seats.size === 0) return map;
  return {
    ...map,
    cabins: map.cabins?.map((cabin) => ({
      ...cabin,
      rows: cabin.rows?.map((row) => ({
        ...row,
        seats: row.seats?.map((seat) => (seat.seatNumber && seats.has(seat.seatNumber) ? { ...seat, isAvailable: false } : seat)),
      })),
    })),
  };
}

/** El error que daría la API al reservar: 409 SEAT_TAKEN o 422 SEAT_CABIN_MISMATCH (ProblemDetails normalizado). */
export function seatConflictError(kind: 'SEAT_TAKEN' | 'SEAT_CABIN_MISMATCH'): ApiError {
  return kind === 'SEAT_TAKEN'
    ? new ApiError({ status: 409, code: 'SEAT_TAKEN', detail: 'Seat already assigned (simulated)' })
    : new ApiError({ status: 422, code: 'SEAT_CABIN_MISMATCH', detail: 'Seat cabin does not match the purchased cabin (simulated)' });
}
