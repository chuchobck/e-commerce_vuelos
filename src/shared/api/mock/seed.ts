import { addDays, format } from 'date-fns';
import { CHECKIN_CLOSES_MINUTES, CHECKIN_OPENS_HOURS } from '@/shared/lib/checkin';
import { stableHash } from '@/shared/lib/stableHash';
import { parseMoney, toDecimalString } from '@/shared/lib/money';
import type { ItineraryDto, PassengerItemDto } from '../contract';
import { forceFlightDelay, mockSearch } from './generators';
import { CLIENT_SCOPES } from './auth';
import { DB_VERSION, type MockDb, type StoredBooking } from './store';

/**
 * Hash de "quinde-demo-2026" (cuenta de prueba documentada en la pantalla de ingreso, solo con el mock).
 * La API exige contraseñas de 12 a 128 caracteres: la de F0 ("quinde2026") ya no serviría.
 */
const DEMO_HASH = 'a1a285f035ec0aa1980c435d6d3b2219ee295acff8a6ecde8ec2fd4207b7b4d2';

const DEMO_USER_ID = 'usr_demo';

/** Itinerarios de ida de una ruta en una fecha, con la forma del contrato (1 adulto). */
function legsOn(origin: string, destination: string, date: string): ItineraryDto[] {
  const res = mockSearch({ itineraries: [{ origin, destination, departureDate: date }], passengers: { adults: 1 } });
  return res.offers.map((o) => o.itineraries[0]);
}

/** Primer vuelo UIO→GYE dentro de la ventana de check-in (con al menos 1 h de margen antes del cierre). */
function legInCheckInWindow(): ItineraryDto | null {
  const now = Date.now();
  for (let d = 0; d <= 2; d++) {
    const found = legsOn('UIO', 'GYE', format(addDays(new Date(), d), 'yyyy-MM-dd')).find((it) => {
      const dep = new Date(it.segments[0].departure.at).getTime();
      return dep - now > CHECKIN_CLOSES_MINUTES * 60_000 + 3_600_000 && dep - now < CHECKIN_OPENS_HOURS * 3_600_000;
    });
    if (found) return found;
  }
  return null;
}

/** Id (uuid, como en la API) de una reserva de demostración: estable para cada código. */
export function demoBookingId(code: string): string {
  return `00000000-0000-4000-8000-${stableHash(code).slice(-12)}`;
}

interface DemoOptions {
  status?: StoredBooking['dto']['status'];
  /** Días que se corren las horas del itinerario (negativo = ya pasó). */
  shiftDays?: number;
  /** Adulto + infante en brazos, para probar equipaje y asientos por pasajero. */
  withInfant?: boolean;
  slowCancel?: boolean;
  /** Minutos que se resta a la fecha de compra, para ordenar la lista. */
  agoMinutes?: number;
}

const DAY_MS = 86_400_000;

/** El mismo itinerario con todas las horas corridas (la reserva "pasada" de la demostración). */
function shifted(itinerary: ItineraryDto, days: number): ItineraryDto {
  if (days === 0) return itinerary;
  const move = (at: string) => new Date(new Date(at).getTime() + days * DAY_MS).toISOString();
  return {
    ...itinerary,
    segments: itinerary.segments.map((sg) => ({
      ...sg,
      departure: { ...sg.departure, at: move(sg.departure.at) },
      arrival: { ...sg.arrival, at: move(sg.arrival.at) },
    })),
  };
}

/** Reserva de la cuenta demo, como la devolvería GET /bookings/{id}. */
function booking(code: string, source: ItineraryDto, brand: string, seat: string | null, options: DemoOptions = {}): StoredBooking {
  const itinerary = shifted(source, options.shiftDays ?? 0);
  const fare = itinerary.pricingOptions.find((f) => f.fareBrand === brand) ?? itinerary.pricingOptions[0];
  const priceOf = (type: string) => fare.pricePerPassengerType.find((x) => x.passengerType === type)?.price ?? { currency: 'USD', total: '0.00' };
  const adult = priceOf('ADULT');
  const infant = priceOf('INFANT');
  const grandTotal = options.withInfant
    ? { currency: adult.currency, total: toDecimalString({ cents: parseMoney(adult.total, adult.currency).cents + parseMoney(infant.total, infant.currency).cents, currency: adult.currency }) }
    : adult;
  const bookingId = demoBookingId(code);
  const createdAt = new Date(Date.now() - (options.agoMinutes ?? 0) * 60_000).toISOString();
  const segments = itinerary.segments;
  const person = {
    nationality: 'EC',
    contact: { email: 'demo@quinde.ec', phone: '+593991234567' },
    documentType: 'NATIONAL_ID' as const,
  };
  const passengers: PassengerItemDto[] = [
    {
      ...person,
      passengerId: 'PAX1',
      passengerType: 'ADULT',
      firstName: 'María José',
      lastName: 'Andrade Pérez',
      documentNumber: '1710034065',
      birthDate: '1990-04-18',
      gender: 'F',
      assignedSeats: segments.map((sg, i) => ({ segmentId: sg.segmentId, seatNumber: seat ?? `${14 + i}C` })),
      extraBaggage: [],
    },
    ...(options.withInfant
      ? [
          {
            ...person,
            passengerId: 'PAX2',
            passengerType: 'INFANT' as const,
            associatedAdultId: 'PAX1',
            firstName: 'Mateo',
            lastName: 'Andrade Pérez',
            documentNumber: '1750000001',
            birthDate: format(addDays(new Date(), -400), 'yyyy-MM-dd'),
            gender: 'M' as const,
            assignedSeats: [],
            extraBaggage: [],
          },
        ]
      : []),
  ];
  return {
    ownerId: DEMO_USER_ID,
    checkedIn: false,
    ...(options.slowCancel ? { slowCancel: true } : {}),
    dto: {
      bookingId,
      pnr: code,
      status: options.status ?? 'CONFIRMED',
      grandTotal,
      createdAt,
      itineraries: [{ ...itinerary, pricingOptions: [{ ...fare, pricePerPassengerType: [] }] }],
      passengers,
      tickets: passengers.map((p, n) => ({
        ticketId: `${bookingId}-t${n + 1}`,
        bookingId,
        passengerId: p.passengerId,
        eTicketNumber: `0451${code.length}0000000${(code.charCodeAt(0) + n) % 10}`,
        status: 'ISSUED' as const,
        issuedAt: createdAt,
        segments: segments.map((sg, i) => ({ segmentId: sg.segmentId, status: 'ISSUED' as const, couponNumber: String(i + 1) })),
      })),
      changes: [{ changedAt: createdAt, description: options.status === 'CANCELLED' ? 'Booking cancelled' : 'Booking confirmed' }],
    },
  };
}

/**
 * Reservas de demostración (cuenta demo). Cada una sirve para probar un caso:
 *  - QD7K2M: dentro de la ventana de check-in (si hay vuelo), familia CLASSIC.
 *  - QG4P9X: a 21 días, FLEX (fuera de ventana: el check-in responde 409).
 *  - QR2V6W: a 3 días, CLASSIC con un infante y un vuelo RETRASADO 45 minutos.
 *  - QW8M3K: a 11 días, FLEX; su cancelación queda EN PROCESO (202).
 *  - QB5T1N: BASIC (sin cambios ni reembolso) a 14 días.
 *  - QP1A5B: ya viajó (Pasados).
 *  - QC9S4Z: cancelada (Cancelados).
 */
const DEMO_CODES = ['QD7K2M', 'QG4P9X', 'QR2V6W', 'QW8M3K', 'QB5T1N', 'QP1A5B', 'QC9S4Z'];

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

function demoBookings(): StoredBooking[] {
  const bookings: StoredBooking[] = [];
  const add = (code: string, origin: string, destination: string, day: number, brand: string, seat: string | null, options?: DemoOptions) => {
    const itinerary = legsOn(origin, destination, inDays(day))[0];
    if (itinerary) bookings.push(booking(code, itinerary, brand, seat, options));
    return itinerary;
  };

  const soon = legInCheckInWindow();
  if (soon) bookings.push(booking('QD7K2M', soon, 'CLASSIC', null, { agoMinutes: 10 }));
  add('QG4P9X', 'UIO', 'GPS', 21, 'FLEX', '12A', { agoMinutes: 20 });
  const delayed = add('QR2V6W', 'UIO', 'GYE', 3, 'CLASSIC', null, { withInfant: true, agoMinutes: 30 });
  if (delayed) forceFlightDelay(delayed.segments[0].flightNumber, inDays(3), 45);
  add('QW8M3K', 'UIO', 'GYE', 11, 'FLEX', null, { slowCancel: true, agoMinutes: 40 });
  add('QB5T1N', 'GYE', 'UIO', 14, 'BASIC', null, { agoMinutes: 50 });
  const past = legsOn('UIO', 'GYE', inDays(1))[0];
  if (past) bookings.push(booking('QP1A5B', past, 'CLASSIC', null, { shiftDays: -9, agoMinutes: 60 * 24 * 12 }));
  add('QC9S4Z', 'CUE', 'UIO', 5, 'CLASSIC', null, { status: 'CANCELLED', agoMinutes: 60 * 24 * 3 });
  return bookings;
}

/** Regenera cada día las reservas de demostración para que el check-in siempre se pueda probar. */
export function refreshSeed(db: MockDb): MockDb {
  if (db.seededOn === todayKey()) return db;
  return {
    ...db,
    seededOn: todayKey(),
    bookings: [...db.bookings.filter((b) => !DEMO_CODES.includes(b.dto.pnr)), ...demoBookings()],
  };
}

export function seedDb(): MockDb {
  return {
    version: DB_VERSION,
    seededOn: todayKey(),
    users: [
      {
        id: DEMO_USER_ID,
        email: 'demo@quinde.ec',
        roles: ['cliente'],
        scopes: [...CLIENT_SCOPES],
        createdAt: new Date().toISOString(),
        passwordHash: DEMO_HASH,
        active: true,
      },
    ],
    refreshTokens: [],
    holds: [],
    bookings: demoBookings(),
    idempotency: [],
    paymentReferences: [],
    changeOffers: [],
    quotes: [],
  };
}
