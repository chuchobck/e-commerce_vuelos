// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardingPass } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { paths, routes } from '@/app/routes';

const api = vi.hoisted(() => ({ getBooking: vi.fn(), getBoardingPasses: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ authorized: <T,>(call: () => Promise<T>) => call() }) }));

import { BOOKING } from './__fixtures__/booking';
import { TripPassesPage } from './TripPassesPage';

const t = es.aftersale.passes;
const PASS: BoardingPass = { passengerId: 'PAX1', segmentId: 's1', seat: '14C', boardingGroup: 'B', boardingPosition: '22', barcode: 'M1PEREZ/ANA QG4P9X UIOGYE LA1400 14C', barcodeType: 'QR' };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[routes.tripPasses('b1')]}>
      <Routes>
        <Route path={paths.tripPasses} element={<TripPassesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getBooking.mockReset().mockResolvedValue(BOOKING);
  api.getBoardingPasses.mockReset();
});
afterEach(cleanup);

describe('pases de abordar', () => {
  it('muestra el pase con el asiento, grupo y posición que da la API y su QR con nombre accesible', async () => {
    api.getBoardingPasses.mockResolvedValue([PASS]);
    renderPage();
    expect(await screen.findByRole('heading', { name: fmt(t.passFor, { name: 'Ana Pérez' }) })).toBeTruthy();
    expect(screen.getByText('14C')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('22')).toBeTruthy();
    expect(screen.getByText(PASS.barcode)).toBeTruthy();
    expect(await screen.findByRole('img', { name: fmt(t.codeLabel, { name: 'Ana Pérez', flight: 'LA1400' }), busy: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.print })).toBeTruthy();
  });

  it('un dato que la API no da se escribe como "Sin dato" en vez de inventarlo', async () => {
    api.getBoardingPasses.mockResolvedValue([{ ...PASS, boardingGroup: null, boardingPosition: null }]);
    renderPage();
    await screen.findByRole('heading', { name: fmt(t.passFor, { name: 'Ana Pérez' }) });
    expect(screen.getAllByText(t.notGiven)).toHaveLength(2);
  });

  it('antes del check-in (409) lo explica y lleva al check-in', async () => {
    api.getBoardingPasses.mockRejectedValue(new ApiError({ status: 409, code: 'BOARDING_PASS_NOT_AVAILABLE' }));
    renderPage();
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.goCheckIn }).getAttribute('href')).toBe(routes.tripCheckIn('b1'));
  });

  it('una reserva cancelada no tiene pases', async () => {
    api.getBoardingPasses.mockRejectedValue(new ApiError({ status: 409 }));
    api.getBooking.mockResolvedValue({ ...BOOKING, status: 'CANCELLED' });
    renderPage();
    expect(await screen.findByText(t.cancelled)).toBeTruthy();
  });

  it('una reserva ajena (404) se trata como inexistente', async () => {
    api.getBooking.mockRejectedValue(new ApiError({ status: 404 }));
    api.getBoardingPasses.mockRejectedValue(new ApiError({ status: 404 }));
    renderPage();
    expect(await screen.findByText(es.trip.notFoundTitle)).toBeTruthy();
  });
});
