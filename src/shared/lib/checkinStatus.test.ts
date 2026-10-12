import { describe, expect, it } from 'vitest';
import type { Booking, Segment } from '@/shared/api';
import { es } from '@/shared/i18n';
import { checkInAvailability } from './checkinStatus';

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

function booking(outboundIn: number, inboundIn?: number, status: Booking['status'] = 'CONFIRMED'): Booking {
  return {
    id: 'b1',
    code: 'QG4P9X',
    status,
    createdAt: NOW.toISOString(),
    outbound: leg(segment('s1', 'LA1400', outboundIn)),
    ...(inboundIn === undefined ? {} : { inbound: leg(segment('s2', 'LA1401', inboundIn)) }),
    passengers: [],
    tickets: [],
    total: { cents: 10000, currency: 'USD' },
    changes: [],
  };
}

describe('check-in: la ventana es por vuelo (48 h a 60 min antes de cada salida)', () => {
  it('un solo vuelo: dentro de la ventana se puede; antes, dice cuándo abre; después, que cerró', () => {
    expect(checkInAvailability(booking(24), NOW).available).toBe(true);
    const early = checkInAvailability(booking(24 * 10), NOW);
    expect([early.available, early.reason?.startsWith('El check-in abre')]).toEqual([false, true]);
    expect(checkInAvailability(booking(0.5), NOW)).toMatchObject({ available: false, reason: c.closed });
    expect(checkInAvailability(booking(-2), NOW)).toMatchObject({ available: false, reason: c.departed });
  });

  it('ida y vuelta con la ida abierta: se puede (la API registra solo los vuelos en ventana)', () => {
    expect(checkInAvailability(booking(24, 24 * 7), NOW).available).toBe(true);
  });

  it('ida y vuelta con la ida ya cerrada y la vuelta abierta: también se puede', () => {
    expect(checkInAvailability(booking(-5, 24), NOW).available).toBe(true);
  });

  it('ida ya salida y vuelta sin abrir: no se puede, y dice cuándo abre el check-in de la vuelta', () => {
    const result = checkInAvailability(booking(-5, 24 * 7), NOW);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/^El check-in abre/);
    expect(result.windowText).toContain('LA1401');
  });

  it('con dos vuelos la ventana nombra el vuelo; con uno, no', () => {
    expect(checkInAvailability(booking(24, 24 * 7), NOW).windowText).toContain('Vuelo LA1400');
    expect(checkInAvailability(booking(24), NOW).windowText).not.toContain('Vuelo');
  });

  it('todos los vuelos ya salieron: «este vuelo ya salió»', () => {
    expect(checkInAvailability(booking(-50, -10), NOW).reason).toBe(c.departed);
  });

  it('una reserva cancelada o sin confirmar no admite check-in, aunque haya un vuelo en ventana', () => {
    expect(checkInAvailability(booking(24, undefined, 'CANCELLED'), NOW)).toMatchObject({ available: false, reason: c.tripCancelled });
    expect(checkInAvailability(booking(24, undefined, 'PENDING_PAYMENT'), NOW)).toMatchObject({ available: false, reason: c.notConfirmed });
  });
});
