// @vitest-environment jsdom
import { addDays, format } from 'date-fns';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateChangeOption } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { paths, routes } from '@/app/routes';

const api = vi.hoisted(() => ({ getBooking: vi.fn(), searchDateChange: vi.fn(), confirmDateChange: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ authorized: <T,>(call: () => Promise<T>) => call() }) }));

import { BOOKING } from './__fixtures__/booking';
import { TripDateChangePage } from './TripDateChangePage';

const t = es.aftersale.dateChange;
const usd = (cents: number) => ({ cents, currency: 'USD' });

/** La reserva con el vuelo saliendo dentro de 10 días (las pruebas de fechas no dependen de qué día se corran). */
const departure = addDays(new Date(), 10);
const flightDay = format(departure, 'dd/MM/yyyy');
const booking = {
  ...BOOKING,
  outbound: {
    ...BOOKING.outbound,
    itinerary: {
      ...BOOKING.outbound.itinerary,
      segments: [{ ...BOOKING.outbound.itinerary.segments[0], departureTime: `${format(departure, 'yyyy-MM-dd')}T08:00:00-05:00`, arrivalTime: `${format(departure, 'yyyy-MM-dd')}T09:00:00-05:00` }],
    },
  },
};

function option(id: string, fareCents: number, feeCents = 2000): DateChangeOption {
  const total = Math.max(0, fareCents) + feeCents;
  return { id, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), segments: booking.outbound.itinerary.segments, price: { fare: usd(fareCents), taxes: usd(0), fee: usd(feeCents), total: usd(total) } };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[routes.tripDateChange('b1')]}>
      <Routes>
        <Route path={paths.tripDateChange} element={<TripDateChangePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const dateInput = async () => (await screen.findByLabelText(new RegExp(`^${t.newDate}`))) as HTMLInputElement;
const searchButton = () => screen.getByRole('button', { name: t.search }) as HTMLButtonElement;
const statusText = () => document.getElementById('date-change-status')?.textContent ?? '';

beforeEach(() => {
  api.getBooking.mockReset().mockResolvedValue(booking);
  api.searchDateChange.mockReset().mockResolvedValue([option('o1', 1500)]);
  api.confirmDateChange.mockReset();
});
afterEach(cleanup);

describe('pantalla de cambio de fecha: la nueva fecha se valida en vivo', () => {
  it('empieza con el día siguiente al vuelo (válido): se puede buscar y el estado lo dice', async () => {
    renderPage();
    const input = await dateInput();
    expect(input.value).toBe(format(addDays(departure, 1), 'dd/MM/yyyy'));
    await waitFor(() => expect(searchButton().disabled).toBe(false));
    expect(statusText()).toContain(t.ready);
  });

  it('sin fecha, el botón está desactivado y dice qué falta; no hay error a la vista', async () => {
    renderPage();
    fireEvent.change(await dateInput(), { target: { value: '' } });
    expect(searchButton().disabled).toBe(true);
    expect(statusText()).toContain('Falta completar: nueva fecha de salida');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('el mes no pasa de 12 y, mientras la fecha está incompleta, no se regaña hasta salir del campo', async () => {
    renderPage();
    const input = await dateInput();
    fireEvent.change(input, { target: { value: '1513' } });
    expect(input.value).toBe('15/1');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(searchButton().disabled).toBe(true);
    fireEvent.blur(input);
    expect(await screen.findByText(es.validation.dateInvalid)).toBeTruthy();
    expect(statusText()).toContain('Revisa: nueva fecha de salida');
  });

  it('el mismo día del vuelo actual se explica en cuanto la fecha está completa', async () => {
    renderPage();
    fireEvent.change(await dateInput(), { target: { value: flightDay.replace(/\//g, '') } });
    expect(await screen.findByText(t.same)).toBeTruthy();
    expect(searchButton().disabled).toBe(true);
  });

  it('una fecha pasada se explica y no se puede buscar', async () => {
    renderPage();
    const yesterday = format(addDays(new Date(), -1), 'ddMMyyyy');
    fireEvent.change(await dateInput(), { target: { value: yesterday } });
    expect(await screen.findByText(t.past)).toBeTruthy();
    expect(searchButton().disabled).toBe(true);
  });

  it('con una fecha válida busca y muestra las alternativas', async () => {
    renderPage();
    await dateInput();
    await waitFor(() => expect(searchButton().disabled).toBe(false));
    fireEvent.click(searchButton());
    await waitFor(() => expect(api.searchDateChange).toHaveBeenCalledTimes(1));
    expect(api.searchDateChange.mock.calls[0][1]).toEqual([{ itineraryId: 'it1', newDepartureDate: format(addDays(departure, 1), 'yyyy-MM-dd') }]);
    expect(await screen.findByRole('button', { name: new RegExp(t.pickOption) })).toBeTruthy();
  });

  it('si el nuevo vuelo cuesta menos, el total es solo el cargo y se avisa que la diferencia no se devuelve', async () => {
    api.searchDateChange.mockResolvedValue([option('o1', -3000, 2000)]);
    renderPage();
    await dateInput();
    await waitFor(() => expect(searchButton().disabled).toBe(false));
    fireEvent.click(searchButton());
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(t.pickOption) }));
    expect(await screen.findByText(t.noRefundNote)).toBeTruthy();
    expect(screen.getByRole('button', { name: fmt(t.confirmPay, { total: formatMoney(usd(2000)) }) })).toBeTruthy();
    expect(screen.queryByText(/Te devolvemos/)).toBeNull();
  });

  it('en la confirmación, una referencia mal escrita desactiva «Pagar» hasta corregirla', async () => {
    renderPage();
    await dateInput();
    await waitFor(() => expect(searchButton().disabled).toBe(false));
    fireEvent.click(searchButton());
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(t.pickOption) }));
    const reference = (await screen.findByLabelText(new RegExp(es.aftersale.payment.label))) as HTMLInputElement;
    const confirm = () => screen.getByRole('button', { name: fmt(t.confirmPay, { total: formatMoney(usd(3500)) }) }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(false);
    fireEvent.change(reference, { target: { value: 'tarjeta 4111' } });
    expect(confirm().disabled).toBe(true);
    fireEvent.blur(reference);
    expect(await screen.findByText(es.aftersale.payment.invalid)).toBeTruthy();
    fireEvent.click(confirm());
    expect(api.confirmDateChange).not.toHaveBeenCalled();
  });
});
