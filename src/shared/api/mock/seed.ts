import { addDays, format } from 'date-fns';
import { CHECKIN_CLOSES_MINUTES, CHECKIN_OPENS_HOURS } from '@/shared/lib/checkin';
import { mapOffer } from '../mapping';
import type { Booking, PassengerCount, SelectedLeg } from '../types';
import { mockSearch } from './generators';
import { DB_VERSION, type MockDb } from './store';

/** Hash de "quinde2026" (cuenta de prueba documentada en la pantalla de ingreso). */
const DEMO_HASH = 'dc6515ef8bcbcf58716f4db57317cc72f1c5e0c95fdb6444455d887e648370f5';

const DEMO_USER_ID = 'usr_demo';

const ONE_ADULT: PassengerCount = { adults: 1, children: 0, infants: 0 };

/** Itinerarios de ida (con sus familias) de una ruta en una fecha, con la forma de la interfaz. */
function legsOn(origin: string, destination: string, date: string): SelectedLeg['itinerary'][] {
  const res = mockSearch({ itineraries: [{ origin, destination, departureDate: date }], passengers: { adults: 1 } });
  return res.offers.map((o) => mapOffer(o, ONE_ADULT).itineraries[0]);
}

/** Primer vuelo UIO→GYE dentro de la ventana de check-in (con al menos 1 h de margen antes del cierre). */
function legInCheckInWindow(): SelectedLeg['itinerary'] | null {
  const now = Date.now();
  for (let d = 0; d <= 2; d++) {
    const found = legsOn('UIO', 'GYE', format(addDays(new Date(), d), 'yyyy-MM-dd')).find((it) => {
      const dep = new Date(it.segments[0].departureTime).getTime();
      return dep - now > CHECKIN_CLOSES_MINUTES * 60_000 + 3_600_000 && dep - now < CHECKIN_OPENS_HOURS * 3_600_000;
    });
    if (found) return found;
  }
  return null;
}

function booking(code: string, itinerary: SelectedLeg['itinerary'], brand: string, seat: string | null): Booking {
  const fare = itinerary.fares.find((f) => f.brand === brand) ?? itinerary.fares[0];
  return {
    id: `bkg_${code.toLowerCase()}`,
    code,
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    outbound: { itinerary, fare },
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
    totalPaid: fare.total,
    userId: DEMO_USER_ID,
  };
}

const DEMO_CODES = ['QD7K2M', 'QG4P9X'];

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

function demoBookings(): Booking[] {
  const bookings: Booking[] = [];
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
