// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingStatus, BookingSummary } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';

const api = vi.hoisted(() => ({ listBookings: vi.fn(), getBooking: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ authorized: <T,>(call: () => Promise<T>) => call() }) }));

import { BOOKING } from './__fixtures__/booking';
import { TripsPage } from './TripsPage';

const l = es.aftersale.list;
const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

function trip(code: string, status: BookingStatus, days: number): BookingSummary {
  return { id: `id-${code}`, code, status, origin: 'UIO', destination: 'GYE', departureDate: inDays(days), total: { cents: 7392, currency: 'USD' } };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TripsPage />
    </MemoryRouter>,
  );
}

const codesShown = () => within(screen.getByRole('list', { name: es.trips.listLabel })).getAllByRole('heading', { level: 2 }).map((h) => /\b([A-Z0-9]{6})\s*$/.exec(h.textContent ?? '')?.[1]);
const tab = (label: string) => screen.getByRole('button', { name: new RegExp(`^(✓ )?${label}`) });

beforeEach(() => {
  api.listBookings.mockReset();
  api.getBooking.mockReset().mockResolvedValue(BOOKING);
});
afterEach(cleanup);

describe('Mis viajes: la lista', () => {
  const PAGE = [trip('LATER1', 'CONFIRMED', 30), trip('SOON01', 'CONFIRMED', 3), trip('OLD001', 'CONFIRMED', -9), trip('CANC01', 'CANCELLED', 12)];

  it('muestra primero los próximos, el más cercano arriba, y cuántos hay en cada pestaña', async () => {
    api.listBookings.mockResolvedValue({ items: PAGE, nextCursor: null });
    renderPage();
    await screen.findByRole('list', { name: es.trips.listLabel });
    expect(codesShown()).toEqual(['SOON01', 'LATER1']);
    expect(tab(l.filterUpcoming).textContent).toContain('(2)');
    expect(tab(l.filterPast).textContent).toContain('(1)');
    expect(tab(l.filterCancelled).textContent).toContain('(1)');
    expect(tab(l.filterUpcoming).getAttribute('aria-pressed')).toBe('true');
    expect(api.listBookings).toHaveBeenCalledWith({ limit: 10 });
  });

  it('cambiar de pestaña muestra los pasados y los cancelados, y marca la activa sin depender del color', async () => {
    api.listBookings.mockResolvedValue({ items: PAGE, nextCursor: null });
    renderPage();
    await screen.findByRole('list', { name: es.trips.listLabel });
    fireEvent.click(tab(l.filterPast));
    expect(codesShown()).toEqual(['OLD001']);
    expect(tab(l.filterPast).getAttribute('aria-pressed')).toBe('true');
    expect(tab(l.filterPast).textContent).toContain('✓');
    fireEvent.click(tab(l.filterCancelled));
    expect(codesShown()).toEqual(['CANC01']);
    expect(screen.getByRole('status').textContent).toBe(fmt(l.shown, { count: 1, total: 4 }));
  });

  it('cada viaje enlaza a su detalle y aun sin el detalle (número de vuelo) la tarjeta se muestra', async () => {
    api.getBooking.mockRejectedValue(new ApiError({ status: 500 }));
    api.listBookings.mockResolvedValue({ items: [trip('SOON01', 'CONFIRMED', 3)], nextCursor: null });
    renderPage();
    const link = await screen.findByRole('link', { name: fmt(es.trips.view, { code: 'SOON01' }) });
    expect(link.getAttribute('href')).toBe('/viajes/id-SOON01');
  });

  it('«Cargar más» pide la página siguiente con el cursor y agrega sin repetir lo ya cargado', async () => {
    api.listBookings
      .mockResolvedValueOnce({ items: [trip('SOON01', 'CONFIRMED', 3)], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [trip('SOON01', 'CONFIRMED', 3), trip('LATER1', 'CONFIRMED', 30)], nextCursor: null });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: l.loadMore }));
    await waitFor(() => expect(codesShown()).toEqual(['SOON01', 'LATER1']));
    expect(api.listBookings).toHaveBeenLastCalledWith({ limit: 10, cursor: 'cursor-2' });
    expect(screen.queryByRole('button', { name: l.loadMore })).toBeNull();
  });

  it('si falla «Cargar más», lo ya cargado sigue a la vista y se avisa del error', async () => {
    api.listBookings.mockResolvedValueOnce({ items: [trip('SOON01', 'CONFIRMED', 3)], nextCursor: 'cursor-2' }).mockRejectedValueOnce(new ApiError({ status: 500 }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: l.loadMore }));
    expect(await screen.findByText(es.states.errorTitle)).toBeTruthy();
    expect(codesShown()).toEqual(['SOON01']);
    expect(screen.getByRole('button', { name: l.loadMore })).toBeTruthy();
  });

  it('una pestaña vacía explica por qué y, si hay más páginas, invita a cargarlas', async () => {
    api.listBookings.mockResolvedValue({ items: [trip('SOON01', 'CONFIRMED', 3)], nextCursor: 'c2' });
    renderPage();
    await screen.findByRole('list', { name: es.trips.listLabel });
    fireEvent.click(tab(l.filterCancelled));
    expect(screen.getByText(l.emptyCancelledTitle)).toBeTruthy();
    expect(screen.getByText(l.emptyFilteredMore)).toBeTruthy();
  });

  it('sin ninguna reserva ofrece buscar vuelos (no hay callejón sin salida)', async () => {
    api.listBookings.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText(es.trips.emptyTitle)).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(es.common.searchFlights) })).toBeTruthy();
  });

  it('un error al cargar permite reintentar', async () => {
    api.listBookings.mockRejectedValueOnce(new ApiError({ status: 503 })).mockResolvedValue({ items: [trip('SOON01', 'CONFIRMED', 3)], nextCursor: null });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: es.common.retry }));
    expect(await screen.findByRole('list', { name: es.trips.listLabel })).toBeTruthy();
  });
});
