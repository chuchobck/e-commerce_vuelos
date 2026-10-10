import { describe, expect, it } from 'vitest';
import type { Booking, BookingStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { bookingActions } from './bookingActions';

const t = es.aftersale.actions;
const NOW = new Date('2026-10-09T12:00:00Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function fare(brand: string, changeable = true) {
  return { cabin: 'ECONOMY' as const, brand, refundable: changeable, changeable, baggage: { personalItem: true, carryOn: 1, checked: 1 }, extraBagPrice: null };
}

function booking(overrides: { status?: BookingStatus; departsInHours?: number; changeable?: boolean; brand?: string; infantOnly?: boolean } = {}): Booking {
  const leg = {
    itinerary: {
      id: 'it1',
      durationMinutes: 60,
      stops: 0,
      segments: [
        {
          id: 's1',
          flightNumber: 'LA1400',
          carrier: 'LA',
          origin: 'UIO' as const,
          destination: 'GYE' as const,
          departureTime: hoursFromNow(overrides.departsInHours ?? 24 * 21),
          arrivalTime: hoursFromNow((overrides.departsInHours ?? 24 * 21) + 1),
          durationMinutes: 60,
          aircraft: null,
          layoverMinutes: null,
        },
      ],
    },
    fare: fare(overrides.brand ?? 'FLEX', overrides.changeable ?? true),
  };
  const person = { documentType: 'NATIONAL_ID' as const, documentNumber: '1710034065', nationality: 'EC', birthDate: '1990-04-18', gender: 'F' as const, email: 'a@b.ec', phone: '+593991234567' };
  return {
    id: 'b1',
    code: 'QG4P9X',
    status: overrides.status ?? 'CONFIRMED',
    createdAt: NOW.toISOString(),
    outbound: leg,
    passengers: [{ ...person, id: 'PAX1', type: overrides.infantOnly ? 'INFANT' : 'ADULT', firstName: 'Ana', lastName: 'Pérez', seats: [], extraBaggage: [] }],
    tickets: [],
    total: { cents: 10000, currency: 'USD' },
    changes: [],
  };
}

describe('acciones habilitadas por estado de la reserva', () => {
  it('confirmada y lejos de la salida: pases, equipaje, cambio y cancelación; el check-in aún no abre y dice cuándo', () => {
    const a = bookingActions(booking(), NOW);
    expect(a.passes).toEqual({ visible: true, enabled: true });
    expect(a.baggage).toEqual({ visible: true, enabled: true });
    expect(a.dateChange).toEqual({ visible: true, enabled: true });
    expect(a.cancel).toEqual({ visible: true, enabled: true });
    expect(a.checkIn.visible).toBe(true);
    expect(a.checkIn.enabled).toBe(false);
    expect(a.checkIn.reason).toBeTruthy();
  });

  it('dentro de la ventana (48 h a 60 min antes) el check-in se habilita', () => {
    expect(bookingActions(booking({ departsInHours: 47 }), NOW).checkIn.enabled).toBe(true);
    expect(bookingActions(booking({ departsInHours: 2 }), NOW).checkIn.enabled).toBe(true);
  });

  it('en el borde: 48 h exactas abre; a menos de 60 minutos ya cerró', () => {
    expect(bookingActions(booking({ departsInHours: 48 }), NOW).checkIn.enabled).toBe(true);
    expect(bookingActions(booking({ departsInHours: 48.01 }), NOW).checkIn.enabled).toBe(false);
    const closed = bookingActions(booking({ departsInHours: 0.5 }), NOW);
    expect(closed.checkIn).toEqual({ visible: true, enabled: false, reason: es.aftersale.checkin.closed });
  });

  it('con el vuelo ya salido solo quedan los pases: equipaje, cambio y cancelación se desactivan con su motivo', () => {
    const a = bookingActions(booking({ departsInHours: -3 }), NOW);
    expect(a.passes.enabled).toBe(true);
    expect(a.checkIn.enabled).toBe(false);
    for (const action of [a.baggage, a.dateChange, a.cancel]) expect(action).toEqual({ visible: true, enabled: false, reason: t.departed });
  });

  it('una tarifa que no se puede cambiar desactiva solo el cambio de fecha y nombra la familia', () => {
    const a = bookingActions(booking({ changeable: false, brand: 'BASIC' }), NOW);
    expect(a.dateChange.enabled).toBe(false);
    expect(a.dateChange.reason).toBe(fmt(t.notChangeable, { fare: 'Basic' }));
    expect(a.cancel.enabled).toBe(true);
    expect(a.baggage.enabled).toBe(true);
  });

  it('reserva cancelada o fallida: no se ofrece ningún trámite', () => {
    for (const status of ['CANCELLED', 'FAILED'] as const) {
      const a = bookingActions(booking({ status }), NOW);
      expect(Object.values(a).every((x) => !x.visible && !x.enabled)).toBe(true);
    }
  });

  it('pago pendiente o emisión en curso: todo desactivado con "disponible cuando esté confirmada"', () => {
    for (const status of ['PENDING', 'PENDING_PAYMENT', 'TICKET_ISSUING'] as const) {
      const a = bookingActions(booking({ status }), NOW);
      for (const action of Object.values(a)) expect(action).toEqual({ visible: true, enabled: false, reason: t.notConfirmed });
    }
  });

  it('cambio o cancelación en proceso: nada nuevo hasta que termine (no se empieza otro trámite)', () => {
    for (const status of ['CHANGE_PENDING', 'CANCELLATION_PENDING'] as const) {
      const a = bookingActions(booking({ status }), NOW);
      for (const action of Object.values(a)) expect(action).toEqual({ visible: true, enabled: false, reason: t.inProgress });
    }
  });

  it('una reserva solo con infantes no ofrece equipaje (el infante no ocupa asiento)', () => {
    const a = bookingActions(booking({ infantOnly: true }), NOW);
    expect(a.baggage).toEqual({ visible: true, enabled: false, reason: t.noActions });
  });
});
