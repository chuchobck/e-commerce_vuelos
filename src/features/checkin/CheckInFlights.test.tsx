// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardingPass, Booking, Segment } from '@/shared/api';
import { es } from '@/shared/i18n';
import { bookingCheckIn } from '@/shared/lib/checkinStatus';
import { CheckInFlights } from './CheckInFlights';

const c = es.aftersale.checkin;
const NOW = new Date('2026-10-10T12:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const segment = (id: string, flightNumber: string, h: number): Segment => ({ id, flightNumber, carrier: 'LA', origin: 'UIO', destination: 'GYE', departureTime: hours(h), arrivalTime: hours(h + 1), durationMinutes: 60, aircraft: null, layoverMinutes: null });
const leg = (s: Segment) => ({
  itinerary: { id: `it-${s.id}`, durationMinutes: 60, stops: 0, segments: [s] },
  fare: { cabin: 'ECONOMY' as const, brand: 'FLEX', refundable: true, changeable: true, baggage: { personalItem: true, carryOn: 1, checked: 1 }, extraBagPrice: null },
});

function booking(out: number, back: number): Booking {
  return {
    id: 'b1',
    code: 'RJPZPN',
    status: 'CONFIRMED',
    createdAt: NOW.toISOString(),
    outbound: leg(segment('s1', 'LA1400', out)),
    inbound: leg(segment('s2', 'LA1401', back)),
    passengers: [
      { id: 'PAX1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', birthDate: '1990-04-18', gender: 'F', email: 'a@b.ec', phone: '+593991234567', seats: [{ segmentId: 's1', seatNumber: '14B' }, { segmentId: 's2', seatNumber: '10A' }], extraBaggage: [] },
    ],
    tickets: [],
    total: { cents: 10000, currency: 'USD' },
    changes: [],
  };
}
const pass: BoardingPass = { passengerId: 'PAX1', segmentId: 's2', seat: '10A', boardingGroup: '2', boardingPosition: '010', barcode: 'BP', barcodeType: 'QR' };

afterEach(cleanup);

describe('estado del check-in por vuelo', () => {
  it('cada vuelo tiene su etiqueta en texto; «hecho» dice SU asiento y el conteo es role="status"', () => {
    render(<CheckInFlights checkIn={bookingCheckIn(booking(-30, 20), [pass], NOW)} title={c.overviewTitle} />);
    expect(screen.getByRole('status').textContent).toBe('Check-in hecho en 1 de 2 vuelos');
    const items = within(screen.getByRole('list', { name: c.flightsLabel })).getAllByRole('listitem');
    expect(items[0].textContent).toContain(c.status.salio);
    expect(items[1].textContent).toContain('Check-in hecho · Asiento 10A');
  });

  it('«no abre aún» dice cuándo abre, en hora del aeropuerto', () => {
    render(<CheckInFlights checkIn={bookingCheckIn(booking(24 * 5, 24 * 7), [], NOW)} title={c.overviewTitle} />);
    expect(screen.getAllByText(/^Check-in abre el \d+ de .+ a las \d{2}:\d{2}$/)).toHaveLength(2);
  });

  it('en la pantalla de check-in muestra el asiento de cada pasajero en cada vuelo (14B a la ida, 10A a la vuelta)', () => {
    render(<CheckInFlights checkIn={bookingCheckIn(booking(24, 30), [], NOW)} title={c.flightsTitle} showPassengers />);
    const items = within(screen.getByRole('list', { name: c.flightsLabel })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining('Asiento 14B'), expect.anything(), expect.stringContaining('Asiento 10A'), expect.anything()]);
  });

  it('si no se sabe qué vuelos tienen pase, no hay conteo y se explica', () => {
    render(<CheckInFlights checkIn={bookingCheckIn(booking(24, 30), undefined, NOW)} title={c.overviewTitle} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(c.unknown)).toBeTruthy();
  });
});
