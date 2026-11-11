// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paths, routes } from '@/app/routes';
import type { BoardingPass } from '@/shared/api';
import { es } from '@/shared/i18n';

const api = vi.hoisted(() => ({ getBooking: vi.fn(), getBoardingPasses: vi.fn(), getFlightStatus: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ authorized: <T,>(call: () => Promise<T>) => call() }) }));

import { BOOKING } from './__fixtures__/booking';
import { TripPage } from './TripPage';

const a = es.aftersale.actions;
const c = es.aftersale.checkin;
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** Ida a `out` horas y vuelta a `back` horas, con asiento 14B a la ida y 10A a la vuelta (como RJPZPN). */
function roundTrip(out: number, back: number) {
  const segment = BOOKING.outbound.itinerary.segments[0];
  const at = (h: number, id: string, flightNumber: string) => ({ ...segment, id, flightNumber, departureTime: hoursFromNow(h), arrivalTime: hoursFromNow(h + 1) });
  return {
    ...BOOKING,
    code: 'RJPZPN',
    outbound: { ...BOOKING.outbound, itinerary: { ...BOOKING.outbound.itinerary, segments: [at(out, 's1', 'LA1400')] } },
    inbound: { ...BOOKING.outbound, itinerary: { ...BOOKING.outbound.itinerary, id: 'it2', segments: [at(back, 's2', 'LA1401')] } },
    passengers: [{ ...BOOKING.passengers[0], seats: [{ segmentId: 's1', seatNumber: '14B' }, { segmentId: 's2', seatNumber: '10A' }] }],
  };
}

const pass = (segmentId: string, seat: string): BoardingPass => ({ passengerId: 'PAX1', segmentId, seat, boardingGroup: '2', boardingPosition: '010', barcode: `BP|${segmentId}`, barcodeType: 'QR' });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[routes.trip('b1')]}>
      <Routes>
        <Route path={paths.trip} element={<TripPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** La lista de vuelos del resumen (solo sus elementos directos) y la tarjeta de trámites. */
const flights = async () => {
  const list = await screen.findByRole('list', { name: c.flightsLabel });
  return within(list).getAllByRole('listitem').filter((li) => li.parentElement === list);
};
const actionsCard = () => screen.getByRole('heading', { name: a.title }).parentElement as HTMLElement;
const countText = (text: string) => expect(screen.getByText(text).closest('[role="status"]')).toBeTruthy();

beforeEach(() => {
  api.getBooking.mockReset();
  api.getBoardingPasses.mockReset();
  api.getFlightStatus.mockReset().mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

describe('resumen de la reserva: estado del check-in', () => {
  it('nada hecho y todo abierto: 0 de 2, cada vuelo «abierto» y «Hacer check-in» es el botón principal', async () => {
    api.getBooking.mockResolvedValue(roundTrip(24, 30));
    api.getBoardingPasses.mockResolvedValue([]);
    renderPage();
    const [outbound, inbound] = await flights();
    countText('Check-in hecho en 0 de 2 vuelos');
    expect(outbound.textContent).toContain(c.status.abierto);
    expect(inbound.textContent).toContain(c.status.abierto);
    const links = within(actionsCard()).getAllByRole('link');
    expect(links[0].textContent).toBe(a.checkIn);
    expect(links[0].getAttribute('href')).toBe(routes.tripCheckIn('b1'));
  });

  it('RJPZPN: ida que ya salió y vuelta con check-in hecho → 1 de 2, «Ver pases» principal y sin botón de check-in', async () => {
    api.getBooking.mockResolvedValue(roundTrip(-30, 20));
    api.getBoardingPasses.mockResolvedValue([pass('s2', '10A')]);
    renderPage();
    const [outbound, inbound] = await flights();
    countText('Check-in hecho en 1 de 2 vuelos');
    expect(outbound.textContent).toContain(c.status.salio);
    expect(inbound.textContent).toContain('Check-in hecho · Asiento 10A');
    const card = actionsCard();
    expect(within(card).getAllByRole('link')[0].textContent).toBe(a.passes);
    expect(within(card).queryByRole('link', { name: a.checkIn })).toBeNull();
    expect(within(card).queryByRole('button', { name: a.checkIn })).toBeNull();
    expect(within(card).getByText(c.allDone)).toBeTruthy();
  });

  it('todo cerrado sin check-in: 0 de 2, cada vuelo «cerrado», sin botón de check-in y se explica por qué', async () => {
    api.getBooking.mockResolvedValue(roundTrip(0.5, 0.75));
    api.getBoardingPasses.mockResolvedValue([]);
    renderPage();
    const [outbound, inbound] = await flights();
    countText('Check-in hecho en 0 de 2 vuelos');
    expect(outbound.textContent).toContain(c.status.cerrado);
    expect(inbound.textContent).toContain(c.status.cerrado);
    const card = actionsCard();
    expect(within(card).queryByRole('link', { name: a.checkIn })).toBeNull();
    expect(within(card).queryByRole('button', { name: a.checkIn })).toBeNull();
    expect(within(card).getByText(c.closed)).toBeTruthy();
  });

  it('si los pases no se pueden consultar: sin conteo, se avisa y el check-in queda como antes (por la ventana)', async () => {
    api.getBooking.mockResolvedValue(roundTrip(24, 30));
    api.getBoardingPasses.mockRejectedValue(new Error('red'));
    renderPage();
    expect(await screen.findByText(c.unknown)).toBeTruthy();
    expect(screen.queryByText(/^Check-in hecho en/)).toBeNull();
    expect(within(actionsCard()).getByRole('link', { name: a.checkIn })).toBeTruthy();
  });
});
