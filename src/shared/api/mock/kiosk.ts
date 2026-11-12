import { ApiError } from '../errors';
import { findAirport } from '../airports';
import type { CheckInResponseDto, BoardingPassListDto } from '../contract';
import type { DeparturesResponseDto, KioskLookupResponseDto } from '../kioskContract';
import { toAirportLocalIso } from '../mapping';
import { mockFlightStatus } from './generators';
import { AIRLINE_NAMES, ROUTES } from './data/routes';

/**
 * Kiosko y tablero de salidas del mock. Sin datos aleatorios: las tres reservas de demostración (README, sección 5f) cubren las
 * tres ventanas de check-in y viven solo en memoria. Todo está tipado contra las formas de `kioskContract.ts` y del contrato.
 */

const problem = (status: number, code: string | undefined, detail: string) => new ApiError({ status, code: code as never, detail });

const localIso = (utcMs: number, airport: string) => toAirportLocalIso(new Date(utcMs).toISOString(), airport);

/* ------------------------------------ salidas ------------------------------------ */

export const MOCK_DEPARTURES_PAGE_SIZE = 12;

export function mockDepartures(code: string, date: string, cursor?: string, now = Date.now()): DeparturesResponseDto {
  const airport = findAirport(code.toUpperCase());
  if (!airport) throw problem(404, 'VALIDATION_FAILED', `Airport ${code} was not found`);
  const all = ROUTES.filter((r) => r.origin === airport.code)
    .map((route) => {
      const flightNumber = `${route.airline}${route.number}`;
      try {
        return { route, flightNumber, status: mockFlightStatus(flightNumber, date, now) };
      } catch {
        return null; // no vuela ese día de la semana
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.status.departure.scheduledAt.localeCompare(b.status.departure.scheduledAt));
  const from = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const page = all.slice(from, from + MOCK_DEPARTURES_PAGE_SIZE);
  const next = from + MOCK_DEPARTURES_PAGE_SIZE;
  return {
    airport: { iataCode: airport.code, name: airport.name, city: airport.city, timeZone: airport.timeZone },
    date,
    departures: page.map(({ route, flightNumber, status }) => {
      const dest = findAirport(route.destination);
      const est = status.departure.estimatedAt;
      return {
        flightNumber,
        airline: AIRLINE_NAMES[route.airline],
        destination: { iataCode: route.destination, city: dest?.city ?? route.destination },
        scheduledTime: localIso(Date.parse(status.departure.scheduledAt), airport.code),
        estimatedTime: est ? localIso(Date.parse(est), airport.code) : null,
        status: status.status,
        terminal: null,
        gate: status.status === 'BOARDING' ? 'A3' : null,
      };
    }),
    ...(next < all.length ? { nextCursor: String(next) } : {}),
  };
}

/* ------------------------------------ kiosko ------------------------------------ */

/** Reservas de demostración: PNR → qué ventana tiene. Todas con el apellido «Demo». */
export const MOCK_KIOSK_LAST_NAME = 'Demo';
export const MOCK_KIOSK_PNRS = { OPEN: 'ABC123', NOT_YET_OPEN: 'FUT456', CLOSED: 'CER789' } as const;

const HOUR = 3_600_000;
const DEPARTS_IN_HOURS = { OPEN: 24, NOT_YET_OPEN: 72, CLOSED: 0.5 } as const;

interface MockKioskBooking {
  id: string;
  window: keyof typeof DEPARTS_IN_HOURS;
  departureMs: number;
  checkedIn: boolean;
}

const bookings = new Map<string, MockKioskBooking>();
const sessions = new Map<string, { bookingId: string; expiresMs: number }>();

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

function bookingFor(pnr: string, lastName: string, now: number): MockKioskBooking {
  const window = (Object.keys(MOCK_KIOSK_PNRS) as (keyof typeof MOCK_KIOSK_PNRS)[]).find((w) => MOCK_KIOSK_PNRS[w] === pnr.toUpperCase());
  if (!window || norm(lastName) !== norm(MOCK_KIOSK_LAST_NAME)) throw problem(404, 'VALIDATION_FAILED', 'Booking not found');
  const existing = bookings.get(window);
  if (existing) return existing;
  const created = { id: `kiosk-${window.toLowerCase()}`, window, departureMs: now + DEPARTS_IN_HOURS[window] * HOUR, checkedIn: false };
  bookings.set(window, created);
  return created;
}

function viewOf(b: MockKioskBooking): KioskLookupResponseDto['booking'] {
  const dep = b.departureMs;
  return {
    bookingId: b.id,
    status: 'CONFIRMED',
    passengers: [
      { passengerId: 'kp1', passengerType: 'ADULT', firstName: 'Ana', lastName: 'Demo' },
      { passengerId: 'kp2', passengerType: 'ADULT', firstName: 'Luis', lastName: 'Demo' },
    ],
    flights: [
      {
        segmentId: 'ks1',
        flightNumber: 'LA1400',
        origin: 'UIO',
        destination: 'GYE',
        departureAt: localIso(dep, 'UIO'),
        arrivalAt: localIso(dep + 55 * 60_000, 'GYE'),
        departureTerminal: null,
        status: 'SCHEDULED',
        checkIn: {
          window: b.window,
          opensAt: localIso(dep - 48 * HOUR, 'UIO'),
          closesAt: localIso(dep - HOUR, 'UIO'),
        },
        passengers: [
          { passengerId: 'kp1', seat: '14A', checkInStatus: b.checkedIn ? 'CHECKED_IN' : 'NOT_CHECKED_IN' },
          { passengerId: 'kp2', seat: '14B', checkInStatus: b.checkedIn ? 'CHECKED_IN' : 'NOT_CHECKED_IN' },
        ],
      },
    ],
  };
}

export function mockKioskLookup(pnr: string, lastName: string, now = Date.now()): KioskLookupResponseDto {
  const booking = bookingFor(pnr, lastName, now);
  const kioskToken = `mock-kiosk-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const expiresMs = now + 10 * 60_000;
  sessions.set(kioskToken, { bookingId: booking.id, expiresMs });
  return { kioskToken, expiresAt: new Date(expiresMs).toISOString(), booking: viewOf(booking) };
}

function owned(bookingId: string, token: string, now: number): MockKioskBooking {
  const s = sessions.get(token);
  if (!s || s.expiresMs <= now || s.bookingId !== bookingId) throw problem(401, 'KIOSK_SESSION_INVALID', 'Kiosk session is invalid or expired');
  const booking = [...bookings.values()].find((b) => b.id === bookingId);
  if (!booking) throw problem(404, 'VALIDATION_FAILED', 'Booking not found');
  return booking;
}

export function mockKioskCheckIn(bookingId: string, token: string, now = Date.now()): CheckInResponseDto {
  const b = owned(bookingId, token, now);
  if (b.window !== 'OPEN') throw problem(409, 'CHECK_IN_NOT_AVAILABLE', 'Check-in is not available');
  b.checkedIn = true;
  return {
    bookingId: b.id,
    status: 'COMPLETED',
    checkedInPassengers: [
      { passengerId: 'kp1', status: 'CHECKED_IN', segments: [{ segmentId: 'ks1', seat: '14A', status: 'CHECKED_IN' }] },
      { passengerId: 'kp2', status: 'CHECKED_IN', segments: [{ segmentId: 'ks1', seat: '14B', status: 'CHECKED_IN' }] },
    ],
  };
}

export function mockKioskBoardingPasses(bookingId: string, token: string, now = Date.now()): BoardingPassListDto {
  const b = owned(bookingId, token, now);
  if (!b.checkedIn) return { bookingId: b.id, boardingPasses: [] };
  const pass = (passengerId: string, seat: string, position: string): BoardingPassListDto['boardingPasses'][number] => ({
    passengerId,
    segmentId: 'ks1',
    seat,
    boardingGroup: 'B',
    boardingPosition: position,
    barcode: `M1DEMO/${passengerId.toUpperCase()} ${b.id.toUpperCase()} UIOGYE LA1400 ${seat}`,
    barcodeType: 'QR',
  });
  return { bookingId: b.id, boardingPasses: [pass('kp1', '14A', '21'), pass('kp2', '14B', '22')] };
}

/** Solo para pruebas: deja el estado en memoria como al abrir la página. */
export function resetMockKiosk(): void {
  bookings.clear();
  sessions.clear();
}
