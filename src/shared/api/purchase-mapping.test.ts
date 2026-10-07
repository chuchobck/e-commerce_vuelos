import { describe, expect, it } from 'vitest';
import bookingConfirmed from './__fixtures__/booking-confirmed.json';
import bookingPending from './__fixtures__/booking-pending.json';
import holdCreated from './__fixtures__/hold-created.json';
import holdStatus from './__fixtures__/hold-status.json';
import type { BookingDetailDto, HoldResponseDto, HoldStatusDto } from './contract';
import { mapBooking, mapHoldCreated, mapHoldStatus, toBookingRequest, toHoldRequest } from './mapping';

/** Respuestas reales del backend local (2026-10-07): ida y vuelta UIO–GYE, un adulto y un infante. */
describe('mapeo de hold y reserva (respuestas reales)', () => {
  it('hold recién creado: le quedan ttlMinutes contados desde que llegó', () => {
    const hold = mapHoldCreated(holdCreated as HoldResponseDto, 1_000);
    expect(hold).toMatchObject({ id: holdCreated.holdId, status: 'HELD', remainingSeconds: 900, receivedAt: 1_000 });
    expect(hold.lockedPrice).toEqual({ cents: 16262, currency: 'USD' });
  });

  it('estado del hold: remainingSeconds del servidor (la respuesta no repite el id)', () => {
    const hold = mapHoldStatus(holdStatus as HoldStatusDto, 'h-1', 5_000);
    expect(hold).toMatchObject({ id: 'h-1', status: 'HELD', remainingSeconds: 899, receivedAt: 5_000 });
  });

  it('reserva confirmada: PNR, tramos con la familia vendida, pasajeros con asientos y boletos emitidos', () => {
    const b = mapBooking(bookingConfirmed as BookingDetailDto);
    expect(b).toMatchObject({ code: bookingConfirmed.pnr, status: 'CONFIRMED', total: { cents: 16262, currency: 'USD' } });
    expect(b.outbound.fare).toMatchObject({ cabin: 'ECONOMY', brand: 'BASIC' });
    expect(b.inbound?.itinerary.segments[0].origin).toBe('GYE');
    // Horas en la hora local del aeropuerto (UTC−5 en el continente).
    expect(b.outbound.itinerary.segments[0].departureTime).toMatch(/-05:00$/);
    const [adult, infant] = b.passengers;
    expect(adult).toMatchObject({ id: 'PAX1', type: 'ADULT', email: 'ana.perez@example.test' });
    expect(adult.seats).toHaveLength(2);
    expect(infant).toMatchObject({ id: 'PAX2', type: 'INFANT', associatedAdultId: 'PAX1', seats: [], documentExpiryDate: '2031-01-01' });
    expect(b.tickets.map((t) => [t.passengerId, t.status])).toEqual([
      ['PAX1', 'ISSUED'],
      ['PAX2', 'ISSUED'],
    ]);
    expect(b.tickets[0].number).toMatch(/^\d{13}$/);
  });

  it('reserva en proceso: PENDING_PAYMENT con boletos pendientes sin número', () => {
    const b = mapBooking(bookingPending as BookingDetailDto);
    expect(b.status).toBe('PENDING_PAYMENT');
    expect(b.tickets.every((t) => t.status === 'PENDING' && t.number === null)).toBe(true);
  });

  it('pedidos: el hold con passengersBreakdown; la reserva sin campos vacíos y con el pago como referencia', () => {
    expect(toHoldRequest({ offerId: 'o', itinerarySelections: [{ itineraryId: 'i', cabinClass: 'ECONOMY', fareBrand: 'BASIC' }], passengers: { adults: 1, children: 0, infants: 1 } })).toEqual({
      offerId: 'o',
      itinerarySelections: [{ itineraryId: 'i', cabinClass: 'ECONOMY', fareBrand: 'BASIC' }],
      passengersBreakdown: { adults: 1, youths: 0, children: 0, infants: 1 },
    });
    const body = toBookingRequest({
      holdId: 'h',
      paymentReference: 'PAY-OK-ABCD1234',
      passengers: [
        { id: 'PAX1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', birthDate: '1990-04-15', gender: 'F', email: 'a@example.test', phone: '+593991234567' },
      ],
    });
    expect(body.payment).toEqual({ paymentReference: 'PAY-OK-ABCD1234' });
    expect(body.passengers[0]).toEqual({
      passengerId: 'PAX1',
      passengerType: 'ADULT',
      firstName: 'Ana',
      lastName: 'Pérez',
      documentType: 'NATIONAL_ID',
      documentNumber: '1710034065',
      nationality: 'EC',
      birthDate: '1990-04-15',
      gender: 'F',
      contact: { email: 'a@example.test', phone: '+593991234567' },
    });
  });
});
