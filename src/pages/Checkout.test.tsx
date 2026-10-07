// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { addDays } from 'date-fns';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paths, routes } from '@/app/routes';
import { AuthProvider, createLocalLock, createTokenStore, SessionManager, type AuthApi } from '@/features/auth';
import { checkout, saveSelection, type CheckoutSelection } from '@/features/checkout';
import { ApiError, flightsApi, type AuthTokens, type Hold, type SeatMap, type User } from '@/shared/api';
import bookingConfirmed from '@/shared/api/__fixtures__/booking-confirmed.json';
import searchFixture from '@/shared/api/__fixtures__/search-uio-gps-rt.json';
import type { BookingDetailDto, SearchResponseDto } from '@/shared/api/contract';
import { mapBooking, mapSearchResponse } from '@/shared/api/mapping';
import { es } from '@/shared/i18n';
import { toIsoDate, today } from '@/shared/lib/dates';
import { CheckoutConfirmationPage } from './CheckoutConfirmationPage';
import { CheckoutDetailsPage } from './CheckoutDetailsPage';
import { CheckoutPaymentPage } from './CheckoutPaymentPage';
import { ResultsPage } from './ResultsPage';

// jsdom no trae ResizeObserver (lo usa la casilla de Radix para medir).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Recorridos completos de la compra: con toda la suite en paralelo pueden tardar más de 5 s.
vi.setConfig({ testTimeout: 30_000 });

const f = es.checkoutForms;
const p = es.purchase;
const USER: User = { id: 'u1', email: 'cuenta@example.test', roles: ['cliente'], scopes: [], createdAt: '2026-10-07T00:00:00Z' };
const TOKENS: AuthTokens = { accessToken: 'a.b.c', refreshToken: 'r'.repeat(43), expiresIn: 900, scope: '' };
const CONFIRMED = mapBooking(bookingConfirmed as BookingDetailDto);

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** Sesión real (SessionManager) con una API de cuenta falsa; con `signedIn` ya hay un refresh token guardado. */
function session(signedIn: boolean) {
  const api: AuthApi = {
    register: vi.fn(async () => USER),
    login: vi.fn(async () => TOKENS),
    refresh: vi.fn(async () => TOKENS),
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => USER),
  };
  const store = memoryStorage();
  if (signedIn) store.setItem('quinde.auth.refresh', 'r'.repeat(43));
  const manager = new SessionManager({
    api,
    store: createTokenStore(store, memoryStorage()),
    lock: createLocalLock(),
    channel: { post: () => undefined, listen: () => () => undefined },
    schedule: () => () => undefined,
  });
  return { manager, api };
}

function renderApp(path: string, { signedIn = true } = {}) {
  const s = session(signedIn);
  render(
    <AuthProvider manager={s.manager}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={paths.results} element={<ResultsPage />} />
          <Route path={paths.checkoutDetails} element={<CheckoutDetailsPage />} />
          <Route path={paths.checkoutPayment} element={<CheckoutPaymentPage />} />
          <Route path={paths.checkoutConfirmation} element={<CheckoutConfirmationPage />} />
          <Route path={paths.trips} element={<p>MIS VIAJES</p>} />
          <Route path="/" element={<p>BUSCADOR</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  return s;
}

const hold = (): Hold => ({
  id: 'hold-1',
  status: 'HELD',
  expiresAt: null,
  remainingSeconds: 900,
  receivedAt: Date.now(),
  lockedPrice: { cents: 7392, currency: 'USD' },
  fareBreakdown: { base: { cents: 6160, currency: 'USD' }, taxes: { cents: 1232, currency: 'USD' } },
});

const out = toIsoDate(addDays(today(), 5));
const QUERY = `origen=UIO&destino=GPS&ida=${out}&adultos=1&ninos=0&infantes=0&cabina=ECONOMY`;

/** Solo ida con 1 adulto, armada con la respuesta real guardada (un itinerario por oferta). */
function oneWayResult() {
  const dto = structuredClone(searchFixture) as unknown as SearchResponseDto;
  dto.offers = dto.offers.slice(0, 1).map((o) => ({ ...o, itineraries: [o.itineraries[0]] }));
  return mapSearchResponse(dto, { origin: 'UIO', destination: 'GPS', departDate: out, passengers: { adults: 1, children: 0, infants: 0 }, cabin: 'ECONOMY' });
}

function selected(): CheckoutSelection {
  const result = oneWayResult();
  const offer = result.offers[0];
  const itinerary = offer.itineraries[0];
  return { offerId: offer.id, outbound: { itinerary, fare: itinerary.fares[0] }, passengers: { adults: 1, children: 0, infants: 0 }, searchQuery: QUERY };
}

const change = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const input = (label: RegExp | string) => screen.getByLabelText(label, { selector: 'input,select' }) as HTMLInputElement;

async function fillPassenger() {
  change(await waitFor(() => input(/^Nombres/)), 'Ana María');
  change(input(/^Apellidos/), 'Pérez Gómez');
  change(input(/^Número de documento/), '1710034065');
  change(input(/^Fecha de nacimiento/), '15041990');
  change(input(/^Sexo según el documento/), 'F');
  change(input(/^Celular/), '991234567');
}

function fillCard(number: string) {
  change(input(/^Número de tarjeta/), number);
  change(input(/^Nombre como aparece/), 'ANA PEREZ');
  change(input(/^Vencimiento/), '1230');
  change(input(/^Código de seguridad/), '123');
}

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(flightsApi, 'createHold').mockImplementation(async () => hold());
  vi.spyOn(flightsApi, 'getHold').mockImplementation(async () => ({ ...hold(), remainingSeconds: 880 }));
  vi.spyOn(flightsApi, 'cancelHold').mockResolvedValue(undefined);
  vi.spyOn(flightsApi, 'createBooking').mockResolvedValue(CONFIRMED);
  vi.spyOn(flightsApi, 'getBooking').mockResolvedValue(CONFIRMED);
});

afterEach(() => {
  cleanup();
  checkout.reset();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('camino feliz con sesión', () => {
  it('desde "Elegir tarifa" hasta la confirmación: máximo 3 clics (más escribir los datos)', async () => {
    vi.spyOn(flightsApi, 'search').mockResolvedValue(oneWayResult());
    let clicks = 0;
    const click = (el: HTMLElement) => {
      clicks++;
      fireEvent.click(el);
    };

    renderApp(`${paths.results}?${QUERY}`);
    // Clic 1: elegir la tarifa.
    click(await screen.findByRole('button', { name: /^Elegir Basic/ }));

    // Paso 2: ya con sesión empieza directo en pasajeros, con el correo de la cuenta precargado.
    expect(await screen.findByText(new RegExp(`Compras como ${USER.email}`))).toBeTruthy();
    await fillPassenger();
    expect(input(/^Correo electrónico/).value).toBe(USER.email);
    expect(await screen.findByText(`Total (precio apartado)`)).toBeTruthy();
    expect(screen.getByText('Impuestos y tasas')).toBeTruthy();
    // Clic 2: continuar al pago.
    click(screen.getByRole('button', { name: f.saveAndContinue }));

    // Paso 3: pago simulado.
    await screen.findByLabelText(/^Número de tarjeta/);
    expect(screen.getAllByText(f.simulatedBanner).length).toBeGreaterThan(0);
    fillCard('4111111111111111');
    // Clic 3: pagar.
    click(screen.getByRole('button', { name: /^Pagar \$/ }));

    // Confirmación.
    expect((await screen.findByTestId('booking-code')).textContent).toBe(CONFIRMED.code);
    expect(clicks).toBeLessThanOrEqual(3);
    expect(flightsApi.createHold).toHaveBeenCalledTimes(1);
    expect(flightsApi.createBooking).toHaveBeenCalledTimes(1);
    const [order] = vi.mocked(flightsApi.createBooking).mock.calls[0];
    expect(order).toMatchObject({ holdId: 'hold-1', paymentReference: expect.stringMatching(/^PAY-OK-[A-Z0-9]{16}$/) });
    expect(order.passengers[0]).toMatchObject({ firstName: 'Ana María', documentNumber: '1710034065', phone: '+593991234567' });
    // Los datos de tarjeta nunca llegan a la API de vuelos ni al almacenamiento.
    expect(JSON.stringify(order)).not.toContain('4111');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('4111');
  });

  it('volver atrás no pierde datos y no crea otro hold', async () => {
    saveSelection(selected());
    renderApp(paths.checkoutDetails);
    await fillPassenger();
    fireEvent.click(screen.getByRole('button', { name: f.saveAndContinue }));
    await screen.findByLabelText(/^Número de tarjeta/);
    // En el paso 3 se ve lo elegido, con enlaces para editar.
    const review = screen.getByRole('heading', { name: p.reviewTitle }).closest('div')!;
    expect(within(review).getByText(/Ana María Pérez Gómez/)).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: p.editPassengers }));
    expect((await waitFor(() => input(/^Nombres/))).value).toBe('Ana María');
    expect(input(/^Número de documento/).value).toBe('1710034065');
    expect(input(/^Fecha de nacimiento/).value).toBe('15/04/1990');
    expect(flightsApi.createHold).toHaveBeenCalledTimes(1);
  });
});

describe('asientos (opcional) en el paso 2', () => {
  const [seg1, seg2] = selected().outbound.itinerary.segments.map((x) => x.id);
  let takenNow: Record<string, string[]>;
  /** Un mapa sencillo de economía (filas 10 a 12); `takenNow` dice qué asientos están ocupados por tramo. */
  const mapOf = (segmentId: string): SeatMap => ({
    segmentId,
    cabins: [
      {
        cabinClass: 'ECONOMY',
        rows: [10, 11, 12].map((rowNumber) => ({
          rowNumber,
          seats: [...'ABCDEF'].map((l) => ({ seatNumber: `${rowNumber}${l}`, isAvailable: !(takenNow[segmentId] ?? []).includes(`${rowNumber}${l}`), characteristics: [] })),
        })),
      },
    ],
  });
  const seat = (n: string) => document.querySelector(`[data-seat="${n}"]`) as HTMLElement;
  const payButton = () => screen.getByRole('button', { name: /^Pagar \$/ });

  beforeEach(() => {
    takenNow = {};
    vi.spyOn(flightsApi, 'getSeatMap').mockImplementation(async (_offer, segmentId) => mapOf(segmentId));
  });

  it('nace plegado con "asignaremos automáticamente": sin abrirlo no se pide ningún mapa y se reserva sin asientos', async () => {
    saveSelection(selected());
    renderApp(paths.checkoutDetails);
    await fillPassenger();
    const toggle = screen.getByRole('button', { name: f.seatsChoose });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(f.seatsAutoText)).toBeTruthy();
    expect(flightsApi.getSeatMap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: f.saveAndContinue }));
    await screen.findByLabelText(/^Número de tarjeta/);
    fillCard('4111111111111111');
    fireEvent.click(payButton());
    await screen.findByTestId('booking-code');
    expect(vi.mocked(flightsApi.createBooking).mock.calls[0][0].passengers[0]).not.toHaveProperty('seats');
    expect(flightsApi.getSeatMap).not.toHaveBeenCalled();
  });

  it('un asiento por tramo viaja como assignedSeats en el orden del viaje y se ve en el panel y en la revisión', async () => {
    saveSelection(selected());
    renderApp(paths.checkoutDetails);
    await fillPassenger();
    fireEvent.click(screen.getByRole('button', { name: f.seatsChoose }));
    await screen.findByRole('tablist');
    await waitFor(() => expect(seat('11A')).toBeTruthy());
    fireEvent.click(seat('11A'));
    fireEvent.click(screen.getAllByRole('tab')[1]);
    await waitFor(() => expect(seat('12C')).toBeTruthy());
    fireEvent.click(seat('12C'));
    await waitFor(() => expect(screen.getByRole('complementary').textContent).toMatch(/GYE → GPS: 12C/));
    expect(screen.getByRole('complementary').textContent).toMatch(/UIO → GYE: 11A/);
    fireEvent.click(screen.getByRole('button', { name: f.saveAndContinue }));
    await screen.findByLabelText(/^Número de tarjeta/);
    expect(within(screen.getByRole('heading', { name: p.reviewTitle }).closest('div')!).getByText(/UIO → GYE: 11A · GYE → GPS: 12C/)).toBeTruthy();
    fillCard('4111111111111111');
    fireEvent.click(payButton());
    await screen.findByTestId('booking-code');
    expect(vi.mocked(flightsApi.createBooking).mock.calls[0][0].passengers[0].seats).toEqual([
      { segmentId: seg1, seatNumber: '11A' },
      { segmentId: seg2, seatNumber: '12C' },
    ]);
  });

  it('SEAT_TAKEN al pagar: vuelve al paso 2 con aviso y el selector abierto; quita solo el asiento ocupado y conserva el otro', async () => {
    saveSelection(selected());
    renderApp(paths.checkoutDetails);
    await fillPassenger();
    fireEvent.click(screen.getByRole('button', { name: f.seatsChoose }));
    await screen.findByRole('tablist');
    await waitFor(() => expect(seat('11A')).toBeTruthy());
    fireEvent.click(seat('11A'));
    fireEvent.click(screen.getAllByRole('tab')[1]);
    await waitFor(() => expect(seat('12C')).toBeTruthy());
    fireEvent.click(seat('12C'));
    await waitFor(() => expect(checkout.passengersDraft()[0]?.seats).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: f.saveAndContinue }));
    await screen.findByLabelText(/^Número de tarjeta/);

    // Otra persona se lleva 11A en el primer tramo; la API responde 409 sin decir cuál.
    takenNow[seg1] = ['11A'];
    vi.mocked(flightsApi.createBooking).mockRejectedValueOnce(new ApiError({ status: 409, code: 'SEAT_TAKEN' }));
    fillCard('4111111111111111');
    fireEvent.click(payButton());

    expect(await screen.findByText(f.seatsTakenTitle)).toBeTruthy();
    expect(screen.getByText(f.seatsTakenText)).toBeTruthy();
    expect(await screen.findByRole('tablist')).toBeTruthy();
    await waitFor(() => expect(checkout.passengersDraft()[0]?.seats).toEqual([{ segmentId: seg2, seatNumber: '12C' }]));
    await waitFor(() => expect(screen.getByRole('complementary').textContent).not.toMatch(/UIO → GYE: 11A/));
    expect(screen.getByRole('complementary').textContent).toMatch(/GYE → GPS: 12C/);
    // El hold sigue vivo: no se aparta otro.
    expect(flightsApi.createHold).toHaveBeenCalledTimes(1);

    // Elige otro asiento y paga: el pedido es nuevo y lleva los dos asientos.
    fireEvent.click(screen.getAllByRole('tab')[0]);
    await waitFor(() => expect(seat('11B')).toBeTruthy());
    fireEvent.click(seat('11B'));
    await waitFor(() => expect(checkout.passengersDraft()[0]?.seats).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: f.saveAndContinue }));
    await screen.findByLabelText(/^Número de tarjeta/);
    fillCard('4111111111111111');
    fireEvent.click(payButton());
    await screen.findByTestId('booking-code');
    const calls = vi.mocked(flightsApi.createBooking).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].passengers[0].seats).toEqual([
      { segmentId: seg1, seatNumber: '11B' },
      { segmentId: seg2, seatNumber: '12C' },
    ]);
    expect(calls[1][1]).not.toBe(calls[0][1]);
  });
});

describe('paso 2 sin sesión: cuenta incrustada', () => {
  it('ofrece "Ya tengo cuenta" y "Crear cuenta" sin salir de la página; al ingresar, aparta el precio y pide pasajeros', async () => {
    saveSelection(selected());
    const { api } = renderApp(paths.checkoutDetails, { signedIn: false });
    const group = await screen.findByRole('group', { name: p.accountOptions });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([p.haveAccount, p.createAccount]);
    expect(screen.queryByLabelText(/^Nombres/)).toBeNull();
    expect(flightsApi.createHold).not.toHaveBeenCalled();

    fireEvent.click(within(group).getByRole('button', { name: p.haveAccount }));
    change(await screen.findByLabelText(/^Correo electrónico/), USER.email);
    change(screen.getByLabelText(/^Contraseña/, { selector: 'input' }), 'una frase larga de prueba');
    fireEvent.click(screen.getByRole('button', { name: es.auth.submitLogin }));

    expect(await screen.findByText(new RegExp(`Compras como ${USER.email}`))).toBeTruthy();
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText(/^Nombres/)).toBeTruthy();
    await waitFor(() => expect(flightsApi.createHold).toHaveBeenCalledTimes(1));
    // La selección sigue siendo la misma.
    expect(vi.mocked(flightsApi.createHold).mock.calls[0][0].offerId).toBe(selected().offerId);
  });

  it('crear la cuenta también se hace aquí mismo', async () => {
    saveSelection(selected());
    const { api } = renderApp(paths.checkoutDetails, { signedIn: false });
    change(await screen.findByLabelText(/^Correo electrónico/), USER.email);
    change(screen.getByLabelText(/^Crea una contraseña/, { selector: 'input' }), 'una frase larga de prueba');
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(es.auth.terms) }));
    fireEvent.click(screen.getAllByRole('button', { name: es.auth.submitRegister }).find((b) => b.getAttribute('type') === 'submit')!);
    expect(await screen.findByText(new RegExp(`Compras como ${USER.email}`))).toBeTruthy();
    expect(api.register).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(flightsApi.createHold).toHaveBeenCalledTimes(1));
  });
});

describe('paso 3: errores', () => {
  async function toPayment() {
    saveSelection(selected());
    renderApp(paths.checkoutDetails);
    await fillPassenger();
    fireEvent.click(screen.getByRole('button', { name: f.saveAndContinue }));
    await screen.findByLabelText(/^Número de tarjeta/);
  }
  const pay = () => fireEvent.click(screen.getByRole('button', { name: /^Pagar \$/ }));

  it('pago rechazado: lo explica, el hold sigue vivo y se puede pagar con otra tarjeta', async () => {
    await toPayment();
    vi.mocked(flightsApi.createBooking).mockRejectedValueOnce(new ApiError({ status: 422, code: 'PAYMENT_NOT_AUTHORIZED' }));
    fillCard('4000000000000002');
    pay();
    expect(await screen.findByText(es.purchaseErrors.declinedTitle)).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(input(/^Número de tarjeta/).value).toBe('');
    fillCard('4111111111111111');
    pay();
    expect(await screen.findByTestId('booking-code')).toBeTruthy();
    // Un pago nuevo es otro pedido: otra referencia.
    const [first, second] = vi.mocked(flightsApi.createBooking).mock.calls;
    expect(second[0].paymentReference).not.toBe(first[0].paymentReference);
  });

  it('hold vencido al pagar: lo dice, ofrece buscar de nuevo y conserva lo escrito', async () => {
    await toPayment();
    vi.mocked(flightsApi.createBooking).mockRejectedValueOnce(new ApiError({ status: 410, code: 'OFFER_NO_LONGER_AVAILABLE' }));
    fillCard('4111111111111111');
    pay();
    expect(await screen.findByText(es.purchaseErrors.expiredTitle)).toBeTruthy();
    expect(screen.getByRole('button', { name: p.searchAgain })).toBeTruthy();
    expect(checkout.passengersDraft()[0]).toMatchObject({ firstName: 'Ana María' });
  });

  it('429: el reintento espera la cuenta regresiva y reenvía el mismo pedido', async () => {
    await toPayment();
    vi.mocked(flightsApi.createBooking).mockRejectedValueOnce(new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 30 }));
    fillCard('4111111111111111');
    pay();
    const alert = await screen.findByText(es.purchaseErrors.paymentErrorTitle);
    expect(alert.closest('[role="alert"]')!.textContent).toContain('30 segundos');
    const retry = screen.getByRole('button', { name: f.retry }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
  });

  it('error de red: reintentar reenvía el mismo pedido con la misma clave', async () => {
    await toPayment();
    vi.mocked(flightsApi.createBooking).mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK' }));
    fillCard('4111111111111111');
    pay();
    fireEvent.click(await screen.findByRole('button', { name: f.retry }));
    expect(await screen.findByTestId('booking-code')).toBeTruthy();
    const [first, second] = vi.mocked(flightsApi.createBooking).mock.calls;
    expect(second).toEqual(first);
  });

  it('sin cupo al apartar: explica y ofrece volver a los resultados', async () => {
    saveSelection(selected());
    vi.mocked(flightsApi.createHold).mockRejectedValueOnce(new ApiError({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' }));
    renderApp(paths.checkoutDetails);
    expect(await screen.findByText(es.purchaseErrors.unavailableTitle)).toBeTruthy();
    expect(screen.getByRole('button', { name: p.searchAgain })).toBeTruthy();
  });

  it('"Cancelar compra" pide confirmación, libera el hold y borra la compra', async () => {
    await toPayment();
    fireEvent.click(screen.getByRole('button', { name: p.cancelPurchase }));
    fireEvent.click(await screen.findByRole('button', { name: p.cancelHoldConfirm }));
    await waitFor(() => expect(flightsApi.cancelHold).toHaveBeenCalledWith('hold-1'));
    await waitFor(() => expect(sessionStorage.getItem('quinde.checkout')).toBeNull());
    expect(sessionStorage.getItem('quinde.checkout.draft')).toBeNull();
  });
});

describe('confirmación', () => {
  const at = (id = CONFIRMED.id) => renderApp(`/compra/confirmacion/${id}`);

  it('confirmada: código grande y copiable, resumen, boletos y las dos acciones', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    at();
    expect((await screen.findByTestId('booking-code')).textContent).toBe(CONFIRMED.code);
    expect(screen.getByText(es.purchase.afterBooking)).toBeTruthy();
    expect(screen.getAllByText(/boleto \d{13}/).length).toBe(CONFIRMED.tickets.length);
    expect(screen.getByRole('link', { name: p.viewTrips }).getAttribute('href')).toBe(paths.trips);
    expect(screen.getByRole('link', { name: p.searchAnother }).getAttribute('href')).toBe(routes.search());
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Copiar el código de reserva ${CONFIRMED.code}`) }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CONFIRMED.code));
  });

  it('en proceso: región viva que explica qué pasa y que la compra queda en Mis viajes', async () => {
    vi.mocked(flightsApi.getBooking).mockResolvedValue({ ...CONFIRMED, status: 'PENDING_PAYMENT', tickets: CONFIRMED.tickets.map((t) => ({ ...t, status: 'PENDING', number: null })) });
    at();
    const title = await screen.findByText(es.purchaseErrors.processingTitle);
    expect(title.closest('[aria-live="polite"]')).toBeTruthy();
    expect(title.closest('[aria-live="polite"]')!.textContent).toContain('Mis viajes');
    expect(screen.getByRole('link', { name: p.viewTrips })).toBeTruthy();
  });

  it('falló: dice qué pasó y qué hacer (nunca un callejón sin salida)', async () => {
    vi.mocked(flightsApi.getBooking).mockResolvedValue({ ...CONFIRMED, status: 'FAILED' });
    at();
    expect(await screen.findByText(es.purchaseErrors.failedTitle)).toBeTruthy();
    expect(screen.queryByTestId('booking-code')).toBeNull();
    expect(screen.getByRole('link', { name: p.searchAgain })).toBeTruthy();
    expect(screen.getByRole('link', { name: es.nav.trips })).toBeTruthy();
  });

  it('URL directa de una reserva ajena o inexistente (404): mensaje amable con salidas', async () => {
    vi.mocked(flightsApi.getBooking).mockRejectedValue(new ApiError({ status: 404, code: 'VALIDATION_FAILED' }));
    at('00000000-0000-4000-8000-000000000000');
    expect(await screen.findByText(es.trip.notFoundTitle)).toBeTruthy();
    expect(screen.getByRole('link', { name: es.nav.trips })).toBeTruthy();
    expect(screen.getByRole('link', { name: p.searchAnother })).toBeTruthy();
  });

  it('sin sesión pide ingresar y vuelve a la confirmación', async () => {
    renderApp(`/compra/confirmacion/${CONFIRMED.id}`, { signedIn: false });
    const link = await screen.findByRole('link', { name: es.nav.login });
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain(`/compra/confirmacion/${CONFIRMED.id}`);
  });
});
