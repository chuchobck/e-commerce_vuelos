// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardingPass, CheckInResult } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { paths, routes } from '@/app/routes';

const api = vi.hoisted(() => ({ getBooking: vi.fn(), checkIn: vi.fn(), getBoardingPasses: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ authorized: <T,>(call: () => Promise<T>) => call() }) }));

import { BOOKING } from './__fixtures__/booking';
import { TripCheckInPage } from './TripCheckInPage';

const c = es.aftersale.checkin;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** La reserva de la prueba con la ida saliendo dentro de `out` horas y, si se pide, una vuelta a `back` horas. */
function bookingWith(out: number, back?: number) {
  const segment = BOOKING.outbound.itinerary.segments[0];
  const at = (h: number, id: string, flightNumber: string) => ({ ...segment, id, flightNumber, departureTime: hoursFromNow(h), arrivalTime: hoursFromNow(h + 1) });
  return {
    ...BOOKING,
    outbound: { ...BOOKING.outbound, itinerary: { ...BOOKING.outbound.itinerary, segments: [at(out, 's1', 'LA1400')] } },
    ...(back === undefined ? {} : { inbound: { ...BOOKING.outbound, itinerary: { ...BOOKING.outbound.itinerary, id: 'it2', segments: [at(back, 's2', 'LA1401')] } } }),
    passengers: [{ ...BOOKING.passengers[0], seats: [{ segmentId: 's1', seatNumber: '14B' }, { segmentId: 's2', seatNumber: '10A' }] }],
  };
}

const pass = (segmentId: string, seat: string): BoardingPass => ({ passengerId: 'PAX1', segmentId, seat, boardingGroup: '2', boardingPosition: '010', barcode: `BP|${segmentId}`, barcodeType: 'QR' });
const flightItems = async () => within(await screen.findByRole('list', { name: c.flightsLabel })).getAllByRole('listitem').filter((li) => li.parentElement?.getAttribute('aria-label') === c.flightsLabel);

const segmentsOf = (...statuses: ('CHECKED_IN' | 'NOT_CHECKED_IN' | 'FAILED')[]) => statuses.map((status, i) => ({ segmentId: `s${i + 1}`, seat: status === 'CHECKED_IN' ? '14C' : null, status }));
const result = (status: CheckInResult['status'], passengerStatus: CheckInResult['passengers'][number]['status'], ...segments: ('CHECKED_IN' | 'NOT_CHECKED_IN' | 'FAILED')[]): CheckInResult => ({
  bookingId: 'b1',
  status,
  passengers: [{ passengerId: 'PAX1', status: passengerStatus, segments: segmentsOf(...segments) }],
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[routes.tripCheckIn('b1')]}>
      <Routes>
        <Route path={paths.tripCheckIn} element={<TripCheckInPage />} />
        <Route path={paths.tripPasses} element={<p>pantalla de pases</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const confirm = async () => fireEvent.click(await screen.findByRole('button', { name: c.confirm }));

beforeEach(() => {
  api.getBooking.mockReset();
  api.checkIn.mockReset();
  api.getBoardingPasses.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe('pantalla de check-in', () => {
  it('con el vuelo en ventana hace el check-in con una Idempotency-Key y pasa a los pases', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24));
    api.checkIn.mockResolvedValue(result('COMPLETED', 'CHECKED_IN', 'CHECKED_IN'));
    renderPage();
    await confirm();
    expect(await screen.findByText('pantalla de pases')).toBeTruthy();
    expect(api.checkIn).toHaveBeenCalledWith('b1', expect.stringMatching(UUID));
  });

  it('ida y vuelta, solo la ida abierta: la API deja al pasajero NOT_CHECKED_IN, pero la ida quedó lista: se explica, sin llevar a un error', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24, 24 * 7));
    api.checkIn.mockResolvedValue(result('IN_PROGRESS', 'NOT_CHECKED_IN', 'CHECKED_IN', 'NOT_CHECKED_IN'));
    renderPage();
    await confirm();
    expect(await screen.findByText(c.partialTitle)).toBeTruthy();
    expect(screen.getByRole('link', { name: c.seePasses }).getAttribute('href')).toBe(routes.tripPasses('b1'));
    expect(screen.queryByText('pantalla de pases')).toBeNull();
  });

  it('ningún vuelo quedó registrado: lo dice como aviso y deja reintentar', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24));
    api.checkIn.mockResolvedValue(result('IN_PROGRESS', 'FAILED', 'FAILED'));
    renderPage();
    await confirm();
    expect(await screen.findByText(c.noneTitle)).toBeTruthy();
    expect(screen.getByRole('button', { name: c.confirm })).toBeTruthy();
  });

  it('fuera de ventana no ofrece el botón y explica cuándo abre', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24 * 10));
    renderPage();
    expect(await screen.findByText(/^El check-in abre/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: c.confirm })).toBeNull();
  });

  it('cada vuelo muestra SU asiento: 14B a la ida y 10A a la vuelta (no uno solo para toda la reserva)', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24, 30));
    renderPage();
    const [outbound, inbound] = await flightItems();
    expect(outbound.textContent).toContain('LA1400');
    expect(outbound.textContent).toContain(fmt(c.seatLine, { seat: '14B' }));
    expect(inbound.textContent).toContain('LA1401');
    expect(inbound.textContent).toContain(fmt(c.seatLine, { seat: '10A' }));
  });

  it('al recargar, un vuelo con pase figura como hecho; sin otro vuelo abierto no hay botón de confirmar', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24));
    api.getBoardingPasses.mockResolvedValue([pass('s1', '14B')]);
    renderPage();
    expect(await screen.findByText('Check-in hecho · Asiento 14B')).toBeTruthy();
    expect(screen.getByText('Check-in hecho en 1 de 1 vuelo').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: c.confirm })).toBeNull();
    expect(screen.getByText(c.allDone)).toBeTruthy();
  });

  it('después de confirmar vuelve a pedir la reserva y los pases: las etiquetas se actualizan sin recargar', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24, 24 * 7));
    api.checkIn.mockResolvedValue(result('IN_PROGRESS', 'NOT_CHECKED_IN', 'CHECKED_IN', 'NOT_CHECKED_IN'));
    renderPage();
    await confirm();
    api.getBoardingPasses.mockResolvedValue([pass('s1', '14B')]);
    expect((await screen.findByText('Check-in hecho en 1 de 2 vuelos')).closest('[role="status"]')).toBeTruthy();
    expect(api.getBooking).toHaveBeenCalledTimes(2);
    expect(api.getBoardingPasses).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Check-in hecho · Asiento 14B')).toBeTruthy();
    expect(screen.queryByRole('button', { name: c.confirm })).toBeNull();
  });

  it('un 409 CHECK_IN_NOT_AVAILABLE de la API se muestra con su mensaje y la ventana', async () => {
    api.getBooking.mockResolvedValue(bookingWith(24));
    api.checkIn.mockRejectedValue(new ApiError({ status: 409, code: 'CHECK_IN_NOT_AVAILABLE' }));
    renderPage();
    await confirm();
    expect(await screen.findByText(c.serverWindowTitle)).toBeTruthy();
    expect(screen.getByText(es.errors.checkInNotAvailable)).toBeTruthy();
  });
});
