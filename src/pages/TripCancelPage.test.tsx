// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancelRequest, CancellationQuote } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { paths, routes } from '@/app/routes';

const api = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getCancellationQuote: vi.fn(),
  cancelBooking: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ authorized: <T,>(call: () => Promise<T>) => call() }) }));

import { BOOKING } from './__fixtures__/booking';
import { TripCancelPage } from './TripCancelPage';

const t = es.aftersale.cancel;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFUND = { cents: 8000, currency: 'USD' };

const quote = (overrides: Partial<CancellationQuote> = {}): CancellationQuote => ({
  quoteId: 'quote-1',
  refundable: true,
  refund: REFUND,
  penalty: { cents: 2000, currency: 'USD' },
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[routes.tripCancel('b1')]}>
      <Routes>
        <Route path={paths.tripCancel} element={<TripCancelPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openDialog() {
  const start = await screen.findByRole('button', { name: t.start });
  start.focus();
  fireEvent.click(start);
  return screen.findByRole('alertdialog');
}

const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: t.confirm }) as HTMLButtonElement;
const acknowledge = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('checkbox', { name: t.understand }));

beforeEach(() => {
  api.getBooking.mockReset().mockResolvedValue(BOOKING);
  api.getCancellationQuote.mockReset().mockResolvedValue(quote());
  api.cancelBooking.mockReset();
});
afterEach(cleanup);

describe('pantalla de cancelación', () => {
  it('muestra la cotización en palabras simples: total, penalidad y cuánto se devuelve', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: t.quoteTitle })).toBeTruthy();
    expect(screen.getByText(formatMoney(REFUND))).toBeTruthy();
    expect(screen.getByText(`−${formatMoney({ cents: 2000, currency: 'USD' })}`)).toBeTruthy();
    expect(screen.getByText(t.refundable)).toBeTruthy();
  });

  it('una tarifa sin reembolso lo dice claro y el reembolso es cero', async () => {
    api.getCancellationQuote.mockResolvedValue(quote({ refundable: false, refund: { cents: 0, currency: 'USD' }, penalty: { cents: 10000, currency: 'USD' } }));
    renderPage();
    expect(await screen.findByText(t.notRefundable)).toBeTruthy();
  });

  it('pide confirmación explícita: no se puede confirmar hasta marcar «Entiendo que esta acción no se puede deshacer»', async () => {
    renderPage();
    const dialog = await openDialog();
    expect(confirmButton(dialog).disabled).toBe(true);
    fireEvent.click(confirmButton(dialog));
    expect(api.cancelBooking).not.toHaveBeenCalled();
    acknowledge(dialog);
    expect(confirmButton(dialog).disabled).toBe(false);
  });

  it('«No, volver» cierra el diálogo sin cancelar nada', async () => {
    renderPage();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: t.keepDialog }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.cancelBooking).not.toHaveBeenCalled();
    // El foco vuelve al botón que abrió el diálogo, no se pierde en la página.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: t.start })));
  });

  it('200: la reserva queda cancelada, se avisa el reembolso y la petición lleva quoteId e Idempotency-Key (UUID)', async () => {
    api.cancelBooking.mockResolvedValue({ status: 'done', data: undefined });
    renderPage();
    const dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    expect(await screen.findByText(t.successTitle)).toBeTruthy();
    expect(screen.getByText(fmt(t.successRefund, { refund: formatMoney(REFUND) }))).toBeTruthy();
    const [bookingId, request, key] = api.cancelBooking.mock.calls[0] as [string, CancelRequest, string];
    expect(bookingId).toBe('b1');
    expect(request).toEqual({ quoteId: 'quote-1' });
    expect(key).toMatch(UUID);
  });

  it('el motivo admite hasta 500 caracteres y no deja escribir etiquetas HTML ni saltos de línea (la API los rechaza)', async () => {
    renderPage();
    const reason = (await screen.findByLabelText(t.reasonLabel, { exact: false })) as HTMLInputElement;
    expect(reason.maxLength).toBe(500);
    fireEvent.change(reason, { target: { value: 'hola <b>mundo</b>\n' } });
    expect(reason.value).toBe('hola bmundo/b');
  });

  it('el motivo escrito viaja en la petición, sin espacios sobrantes', async () => {
    api.cancelBooking.mockResolvedValue({ status: 'done', data: undefined });
    renderPage();
    fireEvent.change(await screen.findByLabelText(t.reasonLabel, { exact: false }), { target: { value: '  Cambio de planes ' } });
    const dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    await screen.findByText(t.successTitle);
    expect((api.cancelBooking.mock.calls[0] as [string, CancelRequest, string])[1]).toEqual({ quoteId: 'quote-1', reason: 'Cambio de planes' });
  });

  it('202: "cancelación en proceso"; al actualizar y estar CANCELLED se confirma, sin inventar el final antes', async () => {
    api.cancelBooking.mockResolvedValue({ status: 'pending' });
    renderPage();
    const dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    expect(await screen.findByText(t.pendingTitle)).toBeTruthy();
    expect(screen.queryByText(t.successTitle)).toBeNull();

    api.getBooking.mockResolvedValue({ ...BOOKING, status: 'CANCELLATION_PENDING' });
    fireEvent.click(screen.getByRole('button', { name: t.pendingRefresh }));
    expect(await screen.findByText(t.pendingStill)).toBeTruthy();

    api.getBooking.mockResolvedValue({ ...BOOKING, status: 'CANCELLED' });
    fireEvent.click(screen.getByRole('button', { name: t.pendingRefresh }));
    expect(await screen.findByText(t.pendingDone)).toBeTruthy();
  });

  it('un error al cancelar no pierde la cotización; reintentar reenvía la MISMA clave y el mismo cuerpo', async () => {
    api.cancelBooking.mockRejectedValueOnce(new ApiError({ status: 500 })).mockResolvedValue({ status: 'done', data: undefined });
    renderPage();
    let dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    expect(await screen.findByText(es.states.errorTitle)).toBeTruthy();
    expect(api.getCancellationQuote).toHaveBeenCalledTimes(1);

    dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    expect(await screen.findByText(t.successTitle)).toBeTruthy();
    const [first, second] = api.cancelBooking.mock.calls as [string, CancelRequest, string][];
    expect(second[2]).toBe(first[2]);
    expect(second[1]).toEqual(first[1]);
  });

  it('403: explica que la cuenta no tiene permiso para esta acción', async () => {
    api.cancelBooking.mockRejectedValue(new ApiError({ status: 403 }));
    renderPage();
    const dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    expect(await screen.findByText(es.errors.forbidden403)).toBeTruthy();
  });

  it('409 QUOTE_EXPIRED: se pide una cotización nueva sola, con otro quoteId', async () => {
    api.getCancellationQuote.mockResolvedValueOnce(quote()).mockResolvedValue(quote({ quoteId: 'quote-2' }));
    api.cancelBooking.mockRejectedValueOnce(new ApiError({ status: 409, code: 'QUOTE_EXPIRED' })).mockResolvedValue({ status: 'done', data: undefined });
    renderPage();
    let dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(api.getCancellationQuote).toHaveBeenCalledTimes(2));

    dialog = await openDialog();
    acknowledge(dialog);
    fireEvent.click(confirmButton(dialog));
    await screen.findByText(t.successTitle);
    const [first, second] = api.cancelBooking.mock.calls as [string, CancelRequest, string][];
    expect([first[1].quoteId, second[1].quoteId]).toEqual(['quote-1', 'quote-2']);
    expect(second[2]).not.toBe(first[2]);
  });

  it('una reserva ya cancelada no ofrece cancelar de nuevo', async () => {
    api.getBooking.mockResolvedValue({ ...BOOKING, status: 'CANCELLED' });
    renderPage();
    expect(await screen.findByText(t.already)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.start })).toBeNull();
  });

  it('una reserva ajena o inexistente (404) no filtra datos: muestra "no encontramos"', async () => {
    api.getBooking.mockRejectedValue(new ApiError({ status: 404 }));
    renderPage();
    expect(await screen.findByText(es.trip.notFoundTitle)).toBeTruthy();
  });
});
