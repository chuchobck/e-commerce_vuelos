import type { BoardingPass, Booking, Segment } from '@/shared/api';
import { toAirportLocalIso } from '@/shared/api/mapping';
import { es, fmt } from '@/shared/i18n';
import { CHECKIN_CLOSES_MINUTES, CHECKIN_OPENS_HOURS, opensAtLocal, segmentCheckInStatus, type SegmentCheckInStatus } from './checkin';
import { formatLongDate, formatTime } from './format';

const c = es.aftersale.checkin;

/** El asiento de un pasajero en un vuelo. `seat` null: lo asigna la aerolínea (o es un infante, que viaja en brazos). */
export interface FlightSeat {
  passengerId: string;
  name: string;
  infant: boolean;
  seat: string | null;
}

/** El check-in de un vuelo (un tramo) de la reserva. */
export interface FlightCheckIn {
  /** Tramo de la ida o de la vuelta. */
  leg: 'outbound' | 'inbound';
  segment: Segment;
  status: SegmentCheckInStatus;
  /** Tiene pase de abordar (aunque el vuelo ya haya salido): cuenta en «hecho en N de M». */
  checkedIn: boolean;
  /** Un asiento por pasajero EN ESTE TRAMO (del pase si lo hay; si no, de la reserva). */
  seats: FlightSeat[];
  /** Apertura del check-in en hora local del aeropuerto de salida (se muestra en `no-abre-aun`). */
  opensAtLocal: string;
}

export interface BookingCheckIn {
  flights: FlightCheckIn[];
  /** Se sabe qué vuelos tienen pase (la consulta de pases respondió). Si no, no hay «hecho» ni conteo. */
  known: boolean;
  /** Vuelos con pase y total de vuelos de la reserva. */
  done: number;
  total: number;
  hasPasses: boolean;
  /** Se puede hacer el check-in ahora: reserva confirmada y algún vuelo `abierto` (sin pase). */
  available: boolean;
  /** Por qué no se puede (y cuándo abre), para escribirlo donde iría el botón. */
  reason?: string;
  /** "Abre el … y cierra el …" en hora local del aeropuerto de salida (del vuelo que importa ahora). */
  windowText: string;
}

/** Un asiento por pasajero en este tramo: el del pase si lo hay; si no, el asignado en la reserva. */
function seatsOf(booking: Booking, segment: Segment, passes: readonly BoardingPass[]): FlightSeat[] {
  return booking.passengers.map((p) => {
    const infant = p.type === 'INFANT';
    const pass = passes.find((x) => x.passengerId === p.id && x.segmentId === segment.id);
    const seat = infant ? null : pass?.seat || p.seats.find((s) => s.segmentId === segment.id)?.seatNumber || null;
    return { passengerId: p.id, name: `${p.firstName} ${p.lastName}`, infant, seat };
  });
}

function windowTextFor(segment: Segment, several: boolean): string {
  const departure = new Date(segment.departureTime).getTime();
  const at = (iso: string) => `${formatLongDate(iso)} a las ${formatTime(iso)}`;
  const opens = toAirportLocalIso(new Date(departure - CHECKIN_OPENS_HOURS * 3_600_000).toISOString(), segment.origin);
  const closes = toAirportLocalIso(new Date(departure - CHECKIN_CLOSES_MINUTES * 60_000).toISOString(), segment.origin);
  const times = { opens: at(opens), closes: at(closes) };
  return several ? fmt(c.windowFlight, { flight: segment.flightNumber, ...times }) : fmt(c.window, times);
}

/**
 * Estado del check-in de una reserva, vuelo por vuelo. La ventana es POR VUELO (leído en el backend): una reserva de ida y
 * vuelta puede hacer el check-in de la ida y, días después, el de la vuelta. Qué vuelos ya lo tienen sale de
 * GET /bookings/{id}/boarding-passes (solo trae pases de los vuelos con check-in hecho); nunca de POST /check-in, que escribe.
 * `passes` undefined = no se pudo saber (la consulta falló o no terminó): ningún vuelo figura como hecho y no hay conteo.
 */
export function bookingCheckIn(booking: Booking, passes: readonly BoardingPass[] | undefined, now: Date = new Date()): BookingCheckIn {
  const segments = (['outbound', 'inbound'] as const).flatMap((leg) => (booking[leg]?.itinerary.segments ?? []).map((segment) => ({ leg, segment })));
  const known = passes !== undefined;
  const list = passes ?? [];
  const flights: FlightCheckIn[] = segments.map(({ leg, segment }) => {
    const checkedIn = list.some((p) => p.segmentId === segment.id);
    return {
      leg,
      segment,
      status: segmentCheckInStatus(segment.departureTime, now, checkedIn),
      checkedIn,
      seats: seatsOf(booking, segment, list),
      opensAtLocal: opensAtLocal(segment.departureTime),
    };
  });

  const several = flights.length > 1;
  const focus = flights.find((f) => f.status === 'abierto') ?? flights.find((f) => f.status === 'no-abre-aun') ?? flights[flights.length - 1];
  const done = flights.filter((f) => f.checkedIn).length;
  const base = { flights, known, done, total: flights.length, hasPasses: done > 0, windowText: focus ? windowTextFor(focus.segment, several) : '' };

  if (booking.status === 'CANCELLED') return { ...base, available: false, reason: c.tripCancelled };
  if (booking.status !== 'CONFIRMED') return { ...base, available: false, reason: c.notConfirmed };
  if (flights.some((f) => f.status === 'abierto')) return { ...base, available: true };

  // El primer vuelo que aún no tiene check-in ni salió decide el motivo; si no queda ninguno, ya está todo hecho o salió.
  const next = flights.find((f) => f.status !== 'hecho' && f.status !== 'salio');
  let reason: string;
  if (next?.status === 'no-abre-aun') {
    const when = { date: formatLongDate(next.opensAtLocal), time: formatTime(next.opensAtLocal) };
    reason = several ? fmt(c.opensAtFlight, { flight: next.segment.flightNumber, ...when }) : fmt(c.opensAt, when);
  } else if (next) {
    reason = c.closed;
  } else {
    reason = flights.some((f) => f.status === 'hecho') ? c.allDone : c.departed;
  }
  return { ...base, available: false, reason };
}

export interface CheckInAvailability {
  available: boolean;
  reason?: string;
  windowText: string;
}

/** Envoltura temporal mientras las pantallas pasan a `bookingCheckIn`. */
export function checkInAvailability(booking: Booking, now: Date = new Date()): CheckInAvailability {
  const { available, reason, windowText } = bookingCheckIn(booking, undefined, now);
  return { available, reason, windowText };
}
