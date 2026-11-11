import { describe, expect, it } from 'vitest';
import type { BoardingPass, Booking, Segment } from '@/shared/api';
import { es } from '@/shared/i18n';
import { bookingCheckIn } from './checkinStatus';

const c = es.aftersale.checkin;
const NOW = new Date('2026-10-10T12:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const segment = (id: string, flightNumber: string, departsInHours: number): Segment => ({
  id,
  flightNumber,
  carrier: 'LA',
  origin: 'UIO',
  destination: 'GYE',
  departureTime: hours(departsInHours),
  arrivalTime: hours(departsInHours + 1),
  durationMinutes: 60,
  aircraft: null,
  layoverMinutes: null,
});

const leg = (...segments: Segment[]) => ({
  itinerary: { id: `it-${segments[0].id}`, durationMinutes: 60, stops: 0, segments },
  fare: { cabin: 'ECONOMY' as const, brand: 'FLEX', refundable: true, changeable: true, baggage: { personalItem: true, carryOn: 1, checked: 1 }, extraBagPrice: null },
});

const adult = { id: 'PAX1', type: 'ADULT' as const, firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID' as const, documentNumber: '1710034065', nationality: 'EC', birthDate: '1990-04-18', gender: 'F' as const, email: 'a@b.ec', phone: '+593991234567', extraBaggage: [] };

function booking(outboundIn: number, inboundIn?: number, status: Booking['status'] = 'CONFIRMED'): Booking {
  return {
    id: 'b1',
    code: 'QG4P9X',
    status,
    createdAt: NOW.toISOString(),
    outbound: leg(segment('s1', 'LA1400', outboundIn)),
    ...(inboundIn === undefined ? {} : { inbound: leg(segment('s2', 'LA1401', inboundIn)) }),
    passengers: [{ ...adult, seats: [{ segmentId: 's1', seatNumber: '14B' }, { segmentId: 's2', seatNumber: '10A' }] }],
    tickets: [],
    total: { cents: 10000, currency: 'USD' },
    changes: [],
  };
}

const pass = (segmentId: string, seat: string): BoardingPass => ({ passengerId: 'PAX1', segmentId, seat, boardingGroup: '2', boardingPosition: '010', barcode: `BP|${segmentId}`, barcodeType: 'QR' });

describe('check-in de una reserva, vuelo por vuelo', () => {
  it('un solo vuelo: dentro de la ventana se puede; antes, dice cuándo abre; después, que cerró o salió', () => {
    expect(bookingCheckIn(booking(24), [], NOW).available).toBe(true);
    const early = bookingCheckIn(booking(24 * 10), [], NOW);
    expect([early.available, early.reason?.startsWith('El check-in abre'), early.flights[0].status]).toEqual([false, true, 'no-abre-aun']);
    expect(early.flights[0].opensAtLocal.slice(11)).toBe(early.flights[0].segment.departureTime.slice(11));
    expect(bookingCheckIn(booking(0.5), [], NOW)).toMatchObject({ available: false, reason: c.closed });
    expect(bookingCheckIn(booking(-2), [], NOW)).toMatchObject({ available: false, reason: c.departed });
  });

  it('nada hecho y todo abierto: 0 de 2, se puede, sin pases', () => {
    const r = bookingCheckIn(booking(24, 30), [], NOW);
    expect(r).toMatchObject({ known: true, done: 0, total: 2, hasPasses: false, available: true });
    expect(r.flights.map((f) => f.status)).toEqual(['abierto', 'abierto']);
  });

  it('RJPZPN: ida ya salió y vuelta con check-in hecho → 1 de 2, sin check-in pendiente, cada vuelo con SU asiento', () => {
    const r = bookingCheckIn(booking(-30, 20), [pass('s2', '10A')], NOW);
    expect(r.flights.map((f) => f.status)).toEqual(['salio', 'hecho']);
    expect(r).toMatchObject({ done: 1, total: 2, hasPasses: true, available: false, reason: c.allDone });
    expect(r.flights[0].seats[0].seat).toBe('14B');
    expect(r.flights[1].seats[0].seat).toBe('10A');
  });

  it('el asiento de un vuelo con pase es el del pase (lo que la API registró)', () => {
    expect(bookingCheckIn(booking(24), [pass('s1', '22F')], NOW).flights[0].seats[0].seat).toBe('22F');
  });

  it('un vuelo con pase que ya salió sigue contando como hecho, aunque su etiqueta diga «salió»', () => {
    const r = bookingCheckIn(booking(-5, 20), [pass('s1', '14B'), pass('s2', '10A')], NOW);
    expect([r.flights[0].status, r.done]).toEqual(['salio', 2]);
  });

  it('ida hecha y vuelta abierta sin hacer: se puede, y hay pases', () => {
    const r = bookingCheckIn(booking(10, 30), [pass('s1', '14B')], NOW);
    expect(r).toMatchObject({ done: 1, hasPasses: true, available: true });
    expect(r.flights.map((f) => f.status)).toEqual(['hecho', 'abierto']);
  });

  it('ida hecha y vuelta sin abrir: no se puede, y dice cuándo abre la vuelta nombrando el vuelo', () => {
    const r = bookingCheckIn(booking(10, 24 * 7), [pass('s1', '14B')], NOW);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/^El check-in del vuelo LA1401 abre/);
    expect(r.windowText).toContain('LA1401');
  });

  it('ida ya cerrada sin hacer y vuelta sin abrir: el motivo es el del primer vuelo pendiente (cerró)', () => {
    expect(bookingCheckIn(booking(0.5, 24 * 7), [], NOW).reason).toBe(c.closed);
  });

  it('todo cerrado o salido sin check-in: «cerró»; todos salidos: «ya salió»', () => {
    expect(bookingCheckIn(booking(-5, 0.5), [], NOW)).toMatchObject({ available: false, reason: c.closed, done: 0 });
    expect(bookingCheckIn(booking(-50, -10), [], NOW).reason).toBe(c.departed);
  });

  it('sin saber qué pases hay (la consulta falló), ningún vuelo figura como hecho y se comporta como solo con la ventana', () => {
    const r = bookingCheckIn(booking(24), undefined, NOW);
    expect(r).toMatchObject({ known: false, done: 0, available: true });
    expect(r.flights[0].status).toBe('abierto');
  });

  it('los infantes viajan en brazos: sin asiento', () => {
    const b = booking(24);
    b.passengers.push({ ...adult, id: 'PAX2', type: 'INFANT', firstName: 'Leo', seats: [] });
    expect(bookingCheckIn(b, [], NOW).flights[0].seats[1]).toEqual({ passengerId: 'PAX2', name: 'Leo Pérez', infant: true, seat: null });
  });

  it('con dos vuelos la ventana nombra el vuelo; con uno, no', () => {
    expect(bookingCheckIn(booking(24, 24 * 7), [], NOW).windowText).toContain('Vuelo LA1400');
    expect(bookingCheckIn(booking(24), [], NOW).windowText).not.toContain('Vuelo');
  });

  it('una reserva cancelada o sin confirmar no admite check-in, aunque haya un vuelo en ventana', () => {
    expect(bookingCheckIn(booking(24, undefined, 'CANCELLED'), [], NOW)).toMatchObject({ available: false, reason: c.tripCancelled });
    expect(bookingCheckIn(booking(24, undefined, 'PENDING_PAYMENT'), [], NOW)).toMatchObject({ available: false, reason: c.notConfirmed });
  });
});
