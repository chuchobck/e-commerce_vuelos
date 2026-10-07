import { addDays, format } from 'date-fns';
import { CHECKIN_CLOSES_MINUTES, CHECKIN_OPENS_HOURS } from '@/shared/lib/checkin';
import { stableHash } from '@/shared/lib/stableHash';
import type { ItineraryDto } from '../contract';
import { mockSearch } from './generators';
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

/** Reserva confirmada de la cuenta demo, como la devolvería GET /bookings/{id}. */
function booking(code: string, itinerary: ItineraryDto, brand: string, seat: string | null): StoredBooking {
  const fare = itinerary.pricingOptions.find((f) => f.fareBrand === brand) ?? itinerary.pricingOptions[0];
  const price = fare.pricePerPassengerType.find((x) => x.passengerType === 'ADULT')?.price ?? { currency: 'USD', total: '0.00' };
  const bookingId = demoBookingId(code);
  const createdAt = new Date().toISOString();
  const segments = itinerary.segments;
  return {
    ownerId: DEMO_USER_ID,
    checkedIn: false,
    dto: {
      bookingId,
      pnr: code,
      status: 'CONFIRMED',
      grandTotal: price,
      createdAt,
      itineraries: [{ ...itinerary, pricingOptions: [{ ...fare, pricePerPassengerType: [] }] }],
      passengers: [
        {
          passengerId: 'PAX1',
          passengerType: 'ADULT',
          firstName: 'María José',
          lastName: 'Andrade Pérez',
          documentType: 'NATIONAL_ID',
          documentNumber: '1710034065',
          nationality: 'EC',
          birthDate: '1990-04-18',
          gender: 'F',
          contact: { email: 'demo@quinde.ec', phone: '+593991234567' },
          assignedSeats: segments.map((sg, i) => ({ segmentId: sg.segmentId, seatNumber: seat ?? `${14 + i}C` })),
          extraBaggage: [],
        },
      ],
      tickets: [
        {
          ticketId: `${bookingId}-t1`,
          bookingId,
          passengerId: 'PAX1',
          eTicketNumber: `0451${code.length}0000000${code.charCodeAt(0) % 10}`,
          status: 'ISSUED',
          issuedAt: createdAt,
          segments: segments.map((sg, i) => ({ segmentId: sg.segmentId, status: 'ISSUED', couponNumber: String(i + 1) })),
        },
      ],
      changes: [{ changedAt: createdAt, description: 'Booking confirmed' }],
    },
  };
}

const DEMO_CODES = ['QD7K2M', 'QG4P9X'];

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

function demoBookings(): StoredBooking[] {
  const bookings: StoredBooking[] = [];
  const soon = legInCheckInWindow();
  if (soon) bookings.push(booking('QD7K2M', soon, 'CLASSIC', null));

  const later = legsOn('UIO', 'GPS', format(addDays(new Date(), 21), 'yyyy-MM-dd'))[0];
  if (later) bookings.push(booking('QG4P9X', later, 'FLEX', '12A'));
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
  };
}
