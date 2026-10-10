// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddBaggageRequest, BaggageAdded, BaggageOption, PostSaleOutcome } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { paths, routes } from '@/app/routes';

const api = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getBaggageOptions: vi.fn(),
  addBaggage: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ authorized: <T,>(call: () => Promise<T>) => call() }) }));

import { BOOKING } from './__fixtures__/booking';
import { TripBaggagePage } from './TripBaggagePage';

const t = es.aftersale.baggage;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const OPTION: BaggageOption = { passengerId: 'PAX1', itineraryId: 'it1', price: { cents: 3500, currency: 'USD' }, maxAllowed: 3, alreadyPurchased: 0 };

const added = (request: AddBaggageRequest): PostSaleOutcome<BaggageAdded> => ({
  status: 'done',
  data: { passengerId: request.passengerId, itineraryId: request.itineraryId, totalBaggage: request.quantity },
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[routes.tripBaggage('b1')]}>
      <Routes>
        <Route path={paths.tripBaggage} element={<TripBaggagePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Elige `bags` maletas, revisa y deja la pantalla lista para pagar. */
async function chooseAndReview(bags: number) {
  await screen.findByText(t.nothingSelected);
  for (let i = 0; i < bags; i++) fireEvent.click(screen.getByRole('button', { name: /^Aumentar Maletas extra de Ana Pérez/ }));
  fireEvent.click(screen.getByRole('button', { name: t.continue }));
  await screen.findByText(t.reviewTitle);
}

const payButton = (bags: number) => screen.getByRole('button', { name: fmt(t.pay, { total: formatMoney({ cents: 3500 * bags, currency: 'USD' }) }) });
const referenceInput = () => screen.getByLabelText(new RegExp(es.aftersale.payment.label)) as HTMLInputElement;

beforeEach(() => {
  api.getBooking.mockReset().mockResolvedValue(BOOKING);
  api.getBaggageOptions.mockReset().mockResolvedValue([OPTION]);
  api.addBaggage.mockReset();
});
afterEach(cleanup);

describe('pantalla de equipaje extra', () => {
  it('el total se actualiza en vivo y no deja pasar el máximo', async () => {
    renderPage();
    await screen.findByText(t.nothingSelected);
    const plus = () => screen.getByRole('button', { name: /^Aumentar Maletas extra de Ana Pérez/ });
    fireEvent.click(plus());
    fireEvent.click(plus());
    expect(screen.getByText(fmt(t.totalLive, { total: formatMoney({ cents: 7000, currency: 'USD' }) }))).toBeTruthy();
    fireEvent.click(plus());
    fireEvent.click(plus());
    expect(screen.getByText(fmt(t.totalLive, { total: formatMoney({ cents: 10500, currency: 'USD' }) }))).toBeTruthy();
    expect(plus().getAttribute('aria-disabled')).toBe('true');
  });

  it('la fila del infante (máximo 0) no se ofrece: no hay nada que elegir ahí', async () => {
    api.getBaggageOptions.mockResolvedValue([OPTION, { ...OPTION, passengerId: 'PAX2', maxAllowed: 0 }]);
    renderPage();
    await screen.findByText(t.nothingSelected);
    expect(screen.getByRole('heading', { name: fmt(t.passenger, { name: 'Ana Pérez' }) })).toBeTruthy();
    expect(screen.queryByText(/PAX2/)).toBeNull();
  });

  it('si solo hay filas con máximo 0, explica que no hay equipaje para agregar', async () => {
    api.getBaggageOptions.mockResolvedValue([{ ...OPTION, maxAllowed: 0 }]);
    renderPage();
    expect(await screen.findByText(t.noOptionsTitle)).toBeTruthy();
  });

  it('sin maletas elegidas no se puede continuar', async () => {
    renderPage();
    await screen.findByText(t.nothingSelected);
    expect((screen.getByRole('button', { name: t.continue }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('200: avisa que el equipaje quedó en la reserva; la petición lleva referencia PAY-OK- e Idempotency-Key (UUID)', async () => {
    api.addBaggage.mockImplementation(async (_id: string, request: AddBaggageRequest) => added(request));
    renderPage();
    await chooseAndReview(2);
    fireEvent.click(payButton(2));
    expect(await screen.findByText(t.successTitle)).toBeTruthy();
    expect(api.addBaggage).toHaveBeenCalledTimes(1);
    const [bookingId, request, key] = api.addBaggage.mock.calls[0] as [string, AddBaggageRequest, string];
    expect(bookingId).toBe('b1');
    expect(request).toMatchObject({ passengerId: 'PAX1', itineraryId: 'it1', quantity: 2 });
    expect(request.paymentReference).toMatch(/^PAY-OK-[A-Z0-9]+$/);
    expect(key).toMatch(UUID);
    expect(screen.getByText(fmt(t.successLine, { passenger: 'Ana Pérez', count: 2, leg: fmt(t.leg, { label: es.aftersale.legs.outbound, route: 'UIO → GYE' }) }))).toBeTruthy();
  });

  it('202: "pago en proceso" con botón para actualizar; al terminar, el equipaje aparece como agregado', async () => {
    api.addBaggage.mockResolvedValue({ status: 'pending' });
    renderPage();
    await chooseAndReview(1);
    fireEvent.click(payButton(1));
    expect(await screen.findByText(t.pendingTitle)).toBeTruthy();
    expect(screen.queryByText(t.successTitle)).toBeNull();

    // Todavía sin terminar: se dice sin inventar un éxito.
    fireEvent.click(screen.getByRole('button', { name: t.pendingRefresh }));
    expect(await screen.findByText(t.pendingStill)).toBeTruthy();

    // Ya terminó: la API muestra la maleta comprada.
    api.getBaggageOptions.mockResolvedValue([{ ...OPTION, alreadyPurchased: 1 }]);
    fireEvent.click(screen.getByRole('button', { name: t.pendingRefresh }));
    expect(await screen.findByText(t.pendingDone)).toBeTruthy();
  });

  it('422: avisa del rechazo, conserva lo elegido y deja reintentar con otro pago (otra clave)', async () => {
    api.addBaggage
      .mockRejectedValueOnce(new ApiError({ status: 422, code: 'PAYMENT_NOT_AUTHORIZED' }))
      .mockImplementation(async (_id: string, request: AddBaggageRequest) => added(request));
    renderPage();
    await chooseAndReview(2);
    fireEvent.change(referenceInput(), { target: { value: 'PAY-REJ-ABCD1234' } });
    fireEvent.click(payButton(2));

    expect(await screen.findByText(t.rejectedTitle)).toBeTruthy();
    // Sigue en la revisión con la misma selección y el mismo total: no hubo que volver a elegir.
    expect(screen.getByText(t.reviewTitle)).toBeTruthy();
    expect(screen.getByText(fmt(t.reviewLine, { qty: 2, passenger: 'Ana Pérez', leg: fmt(t.leg, { label: es.aftersale.legs.outbound, route: 'UIO → GYE' }) }))).toBeTruthy();
    // La referencia rechazada ya no sirve: queda una nueva.
    await waitFor(() => expect(referenceInput().value).not.toBe('PAY-REJ-ABCD1234'));

    fireEvent.click(payButton(2));
    expect(await screen.findByText(t.successTitle)).toBeTruthy();
    const [first, second] = api.addBaggage.mock.calls as [string, AddBaggageRequest, string][];
    expect(second[1].quantity).toBe(first[1].quantity);
    expect(second[1].paymentReference).not.toBe(first[1].paymentReference);
    expect(second[2]).not.toBe(first[2]);
  });

  it('un doble clic en pagar no manda dos cobros', async () => {
    let release: (value: PostSaleOutcome<BaggageAdded>) => void = () => undefined;
    api.addBaggage.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderPage();
    await chooseAndReview(1);
    const button = payButton(1);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(api.addBaggage).toHaveBeenCalled());
    expect(api.addBaggage).toHaveBeenCalledTimes(1);
    release(added({ passengerId: 'PAX1', itineraryId: 'it1', quantity: 1, paymentReference: 'PAY-OK-ABCD1234' }));
    expect(await screen.findByText(t.successTitle)).toBeTruthy();
  });

  it('una referencia que no tiene el formato se corrige antes de cobrar (nunca se envía)', async () => {
    renderPage();
    await chooseAndReview(1);
    fireEvent.change(referenceInput(), { target: { value: '4111111111111111' } });
    fireEvent.click(payButton(1));
    expect(await screen.findByText(es.aftersale.payment.invalid)).toBeTruthy();
    expect(api.addBaggage).not.toHaveBeenCalled();
  });

  it('un 403 sin permiso se explica con el mensaje de permisos, no con un rechazo de pago', async () => {
    api.addBaggage.mockRejectedValue(new ApiError({ status: 403 }));
    renderPage();
    await chooseAndReview(1);
    fireEvent.click(payButton(1));
    expect(await screen.findByText(es.states.errorTitle)).toBeTruthy();
    expect(screen.queryByText(t.rejectedTitle)).toBeNull();
    expect(screen.getByText(es.errors.forbidden403)).toBeTruthy();
  });
});
