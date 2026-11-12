import type { CheckInResult, KioskFlight, KioskSession } from '@/shared/api';

/**
 * Qué se le ofrece al pasajero en un vuelo:
 *  - `registered`: todos sus pasajeros ya tienen check-in → «Ver pases» (gana sobre la ventana: un vuelo registrado se sigue viendo).
 *  - `open` / `not-yet` / `closed`: la ventana que dio la API.
 */
export type FlightOffer = 'registered' | 'open' | 'not-yet' | 'closed';

export function flightOffer(flight: KioskFlight): FlightOffer {
  if (flight.passengers.length > 0 && flight.passengers.every((p) => p.checkInStatus === 'CHECKED_IN')) return 'registered';
  if (flight.checkIn.window === 'OPEN') return 'open';
  return flight.checkIn.window === 'NOT_YET_OPEN' ? 'not-yet' : 'closed';
}

/** Refleja en la reserva en pantalla el resultado del check-in (por pasajero y vuelo), sin volver a pedirla. */
export function applyCheckIn(session: KioskSession, result: CheckInResult): KioskSession {
  const statusOf = (passengerId: string, segmentId: string) =>
    result.passengers.find((p) => p.passengerId === passengerId)?.segments.find((s) => s.segmentId === segmentId);
  return {
    ...session,
    booking: {
      ...session.booking,
      flights: session.booking.flights.map((flight) => ({
        ...flight,
        passengers: flight.passengers.map((p) => {
          const done = statusOf(p.passengerId, flight.segmentId);
          return done ? { ...p, checkInStatus: done.status, seat: done.seat ?? p.seat } : p;
        }),
      })),
    },
  };
}
