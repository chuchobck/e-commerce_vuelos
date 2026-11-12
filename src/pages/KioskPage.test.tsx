// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { es, fmt } from '@/shared/i18n';

// Recorrido completo con el mock real del kiosko (no con un doble): lookup → check-in → pases con el componente del e-commerce.
const mock = vi.hoisted(() => ({ api: undefined as unknown }));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  const { MockFlightsApi } = await import('@/shared/api/mock/MockFlightsApi');
  mock.api = new MockFlightsApi();
  return { ...original, flightsApi: mock.api };
});

import { MOCK_KIOSK_LAST_NAME, MOCK_KIOSK_PNRS, resetMockKiosk } from '@/shared/api/mock/kiosk';
import { KioskPage } from './KioskPage';

const t = es.kiosk;
afterEach(() => {
  cleanup();
  resetMockKiosk();
});

describe('KioskPage con el mock', () => {
  it('check-in completo: los pases se dibujan con el componente de pases del e-commerce, con su QR', async () => {
    window.scrollTo = vi.fn();
    render(<KioskPage />);
    fireEvent.change(screen.getByLabelText(new RegExp(t.identify.pnr)), { target: { value: MOCK_KIOSK_PNRS.OPEN.toLowerCase() } });
    fireEvent.change(screen.getByLabelText(new RegExp(t.identify.lastName)), { target: { value: MOCK_KIOSK_LAST_NAME } });
    fireEvent.click(screen.getByRole('button', { name: t.identify.submit }));
    fireEvent.click(await screen.findByRole('button', { name: t.booking.checkIn }, { timeout: 4000 }));
    expect(await screen.findByRole('heading', { level: 1, name: t.passes.heading }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: fmt(es.aftersale.passes.passFor, { name: 'Ana Demo' }) })).toBeTruthy();
    expect(await screen.findByRole('img', { name: fmt(es.aftersale.passes.codeLabel, { name: 'Ana Demo', flight: 'LA1400' }), busy: false })).toBeTruthy();
    expect(screen.getAllByText('B').length).toBeGreaterThan(0);
  }, 15_000);
});
