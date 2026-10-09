// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '@/app/routes';
import type { Booking } from '@/shared/api';
import { es } from '@/shared/i18n';
import { TripActions } from './TripActions';

const t = es.aftersale.actions;
const NOW = new Date('2026-10-09T12:00:00Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function booking(status: Booking['status'], departsInHours: number): Booking {
  const segment = { id: 's1', flightNumber: 'LA1400', carrier: 'LA', origin: 'UIO' as const, destination: 'GYE' as const, departureTime: hoursFromNow(departsInHours), arrivalTime: hoursFromNow(departsInHours + 1), durationMinutes: 60, aircraft: null, layoverMinutes: null };
  return {
    id: 'b1',
    code: 'QG4P9X',
    status,
    createdAt: NOW.toISOString(),
    outbound: {
      itinerary: { id: 'it1', durationMinutes: 60, stops: 0, segments: [segment] },
      fare: { cabin: 'ECONOMY', brand: 'FLEX', refundable: true, changeable: true, baggage: { personalItem: true, carryOn: 1, checked: 1 }, extraBagPrice: null },
    },
    passengers: [{ id: 'PAX1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', birthDate: '1990-04-18', gender: 'F', email: 'a@b.ec', phone: '+593991234567', seats: [], extraBaggage: [] }],
    tickets: [],
    total: { cents: 10000, currency: 'USD' },
    changes: [],
  };
}

function renderActions(b: Booking) {
  return render(
    <MemoryRouter>
      <TripActions booking={b} now={NOW} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('acciones del detalle de un viaje', () => {
  it('las que se pueden usar son enlaces reales a su pantalla (nada de divs clicables)', () => {
    renderActions(booking('CONFIRMED', 24));
    expect(screen.getByRole('link', { name: t.passes }).getAttribute('href')).toBe(routes.tripPasses('b1'));
    expect(screen.getByRole('link', { name: t.baggage }).getAttribute('href')).toBe(routes.tripBaggage('b1'));
    expect(screen.getByRole('link', { name: t.dateChange }).getAttribute('href')).toBe(routes.tripDateChange('b1'));
    expect(screen.getByRole('link', { name: t.cancel }).getAttribute('href')).toBe(routes.tripCancel('b1'));
    expect(screen.getByRole('link', { name: t.checkIn }).getAttribute('href')).toBe(routes.tripCheckIn('b1'));
  });

  it('el check-in cerrado queda desactivado y su motivo está enlazado con aria-describedby', () => {
    renderActions(booking('CONFIRMED', 24 * 20));
    const button = screen.getByRole('button', { name: t.checkIn }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const reason = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBeTruthy();
    expect(screen.queryByRole('link', { name: t.checkIn })).toBeNull();
  });

  it('con el vuelo ya salido solo los pases siguen siendo un enlace', () => {
    renderActions(booking('CONFIRMED', -2));
    expect(screen.getByRole('link', { name: t.passes })).toBeTruthy();
    for (const label of [t.baggage, t.dateChange, t.cancel]) {
      expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getAllByText(t.departed).length).toBeGreaterThan(0);
  });

  it('un cambio en proceso desactiva todo y explica que hay un trámite en curso', () => {
    renderActions(booking('CHANGE_PENDING', 24 * 10));
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getAllByText(t.inProgress)).toHaveLength(5);
  });

  it('una reserva cancelada no muestra ningún trámite, solo el aviso', () => {
    renderActions(booking('CANCELLED', 24 * 10));
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(t.noActions)).toBeTruthy();
  });
});
