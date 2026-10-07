import { addDays, format } from 'date-fns';
import type { Booking, FlightOffer, PassengerCount } from '../types';
import { generateOffers } from './generators';
import { DB_VERSION, type MockDb } from './store';

/** Hash de "quinde2026" (cuenta de prueba documentada en la pantalla de ingreso). */
const DEMO_HASH = 'dc6515ef8bcbcf58716f4db57317cc72f1c5e0c95fdb6444455d887e648370f5';

const DEMO_USER_ID = 'usr_demo';

const ONE_ADULT: PassengerCount = { adults: 1, children: 0, infants: 0 };

/** Primer vuelo UIO→GYE que sale entre 2 y 24 horas desde ahora (para probar el check-in). */
function offerInCheckInWindow(): FlightOffer | null {
  const now = Date.now();
  for (let d = 0; d < 2; d++) {
    const date = format(addDays(new Date(), d), 'yyyy-MM-dd');
    const found = generateOffers('UIO', 'GYE', date, 'ECONOMY', ONE_ADULT).find((o) => {
      const dep = new Date(o.segments[0].departureTime).getTime();
      return dep - now > 2 * 3_600_000 && dep - now < 24 * 3_600_000;
    });
    if (found) return found;
  }
  return null;
}

function booking(code: string, offer: FlightOffer, fareIndex: number, seat: string | null): Booking {
  const fare = offer.fares[fareIndex];
  return {
    id: `bkg_${code.toLowerCase()}`,
    code,
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    outbound: { offer, fare },
    passengers: [
      {
        id: `pax_${code.toLowerCase()}_1`,
        type: 'ADT',
        firstName: 'María José',
        lastName: 'Andrade Pérez',
        birthDate: '1990-04-18',
        documentType: 'CEDULA',
        documentNumber: '1710034065',
        seat,
        seatAutoAssigned: seat === null,
      },
    ],
    contact: { email: 'demo@quinde.ec', phone: '991234567' },
    totalPaid: fare.totalPrice,
    currency: 'USD',
    userId: DEMO_USER_ID,
  };
}

const DEMO_CODES = ['QD7K2M', 'QG4P9X'];

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

function demoBookings(): Booking[] {
  const bookings: Booking[] = [];
  const soon = offerInCheckInWindow();
  if (soon) bookings.push(booking('QD7K2M', soon, 1, null));

  const later = generateOffers('UIO', 'GPS', format(addDays(new Date(), 21), 'yyyy-MM-dd'), 'ECONOMY', ONE_ADULT)[0];
  if (later) bookings.push(booking('QG4P9X', later, 2, '7A'));
  return bookings;
}

/** Regenera cada día las reservas de demostración para que el check-in siempre se pueda probar. */
export function refreshSeed(db: MockDb): MockDb {
  if (db.seededOn === todayKey()) return db;
  return {
    ...db,
    seededOn: todayKey(),
    bookings: [...db.bookings.filter((b) => !DEMO_CODES.includes(b.code)), ...demoBookings()],
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
        firstName: 'María José',
        lastName: 'Andrade Pérez',
        documentType: 'CEDULA',
        documentNumber: '1710034065',
        phone: '991234567',
        birthDate: '1990-04-18',
        passwordHash: DEMO_HASH,
      },
    ],
    sessions: [],
    holds: [],
    bookings: demoBookings(),
  };
}
