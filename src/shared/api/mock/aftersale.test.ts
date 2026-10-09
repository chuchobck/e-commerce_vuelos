import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, format } from 'date-fns';
import type { ApiError } from '../errors';
import type { MockFlightsApi } from './MockFlightsApi';
import { PENDING_ISSUE_MS } from './purchase';
import { demoBookingId } from './seed';

// Sin la latencia simulada de la red: estas pruebas son de reglas, no de tiempos.
vi.mock('./network', async (importOriginal) => ({ ...(await importOriginal<typeof import('./network')>()), simulate: async () => undefined }));

async function freshApi() {
  vi.stubEnv('VITE_MOCK_ERROR_RATE', '0');
  vi.resetModules();
  const { MockFlightsApi } = await import('./MockFlightsApi');
  const auth = { token: undefined as string | undefined };
  const api: MockFlightsApi = new MockFlightsApi(() => auth.token);
  auth.token = (await api.login({ email: 'demo@quinde.ec', password: 'quinde-demo-2026' })).accessToken;
  return { api, auth };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('se esperaba un error');
}

/** Adelanta el reloj y vuelve a ingresar (el token de acceso dura 15 minutos, como en la API). */
async function setClock(api: MockFlightsApi, auth: { token: string | undefined }, ms: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ms);
  auth.token = (await api.login({ email: 'demo@quinde.ec', password: 'quinde-demo-2026' })).accessToken;
}

const key = () => crypto.randomUUID();
const pay = (prefix: 'OK' | 'PEND' | 'REJ') => `PAY-${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
const id = (code: string) => demoBookingId(code);

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Mis viajes: lista paginada por cursor', () => {
  it('trae las reservas de demostración de la cuenta, con el resumen del contrato', async () => {
    const { api } = await freshApi();
    const page = await api.listBookings({ limit: 50 });
    const codes = page.items.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['QG4P9X', 'QR2V6W', 'QW8M3K', 'QB5T1N', 'QP1A5B', 'QC9S4Z']));
    const cancelled = page.items.find((b) => b.code === 'QC9S4Z')!;
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled).toMatchObject({ origin: 'CUE', destination: 'UIO' });
    expect(cancelled.departureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(page.nextCursor).toBeNull();
  });

  it('con límite devuelve el cursor de la página siguiente y no repite reservas', async () => {
    const { api } = await freshApi();
    const first = await api.listBookings({ limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await api.listBookings({ limit: 3, cursor: first.nextCursor! });
    expect(second.items.every((b) => !first.items.some((f) => f.id === b.id))).toBe(true);
    const all = await api.listBookings({ limit: 50 });
    expect([...first.items, ...second.items].map((b) => b.id)).toEqual(all.items.slice(0, 6).map((b) => b.id));
  });

  it('un límite o cursor inválido es 400', async () => {
    const { api } = await freshApi();
    expect((await failure(api.listBookings({ limit: 500 }))).status).toBe(400);
    expect((await failure(api.listBookings({ cursor: 'xyz' }))).status).toBe(400);
  });

  it('exige sesión (401) y no muestra reservas de otra cuenta', async () => {
    const { api, auth } = await freshApi();
    auth.token = undefined;
    expect((await failure(api.listBookings())).status).toBe(401);
    await api.register({ email: 'otra@correo.com', password: 'una frase larga de prueba' });
    auth.token = (await api.login({ email: 'otra@correo.com', password: 'una frase larga de prueba' })).accessToken;
    expect((await api.listBookings()).items).toEqual([]);
  });
}, 20_000);

describe('boletos', () => {
  it('lista y detalle de un boleto; uno que no existe o ajeno es 404', async () => {
    const { api } = await freshApi();
    const tickets = await api.getTickets(id('QR2V6W'));
    expect(tickets).toHaveLength(2); // adulto + infante
    expect(tickets[0]).toMatchObject({ status: 'ISSUED', passengerId: 'PAX1' });
    expect(tickets[0].number).toMatch(/^\d+$/);
    expect(await api.getTicket(id('QR2V6W'), tickets[0].id)).toEqual(tickets[0]);
    expect((await failure(api.getTicket(id('QR2V6W'), 'no-existe'))).status).toBe(404);
    expect((await failure(api.getTickets('00000000-0000-4000-8000-000000000000'))).status).toBe(404);
  });
});

describe('check-in y pases de abordar', () => {
  it('antes del check-in no hay pases (409 BOARDING_PASS_NOT_AVAILABLE)', async () => {
    const { api } = await freshApi();
    const error = await failure(api.getBoardingPasses(id('QG4P9X')));
    expect([error.status, error.code]).toEqual([409, 'BOARDING_PASS_NOT_AVAILABLE']);
  });

  it('en la ventana: check-in 200 con asiento por tramo, y luego pases con el código tal como lo da la API', async () => {
    const { api } = await freshApi();
    const result = await api.checkIn(id('QD7K2M'), key());
    expect(result.status).toBe('COMPLETED');
    expect(result.passengers[0]).toMatchObject({ passengerId: 'PAX1', status: 'CHECKED_IN' });
    const passes = await api.getBoardingPasses(id('QD7K2M'));
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ passengerId: 'PAX1', barcodeType: 'QR' });
    expect(passes[0].barcode).toContain('QD7K2M');
    expect(passes[0].seat).toBe(result.passengers[0].segments[0].seat);
    // Repetirlo (mismo intento) devuelve lo mismo.
    expect(await api.checkIn(id('QD7K2M'), key())).toEqual(result);
  });

  it('fuera de la ventana: 409 CHECK_IN_NOT_AVAILABLE; reserva cancelada: 409; infante sin asiento en el check-in', async () => {
    const { api } = await freshApi();
    expect((await failure(api.checkIn(id('QG4P9X'), key()))).code).toBe('CHECK_IN_NOT_AVAILABLE');
    expect((await failure(api.checkIn(id('QC9S4Z'), key()))).code).toBe('CHECK_IN_NOT_AVAILABLE');
  });

  it('el infante hace check-in sin tramos ni pase propio', async () => {
    const { api, auth } = await freshApi();
    // QR2V6W sale en 3 días: se adelanta el reloj a 20 h antes de la salida.
    const booking = await api.getBooking(id('QR2V6W'));
    const departure = new Date(booking.outbound.itinerary.segments[0].departureTime).getTime();
    await setClock(api, auth, departure - 20 * 3_600_000);
    const result = await api.checkIn(id('QR2V6W'), key());
    expect(result.passengers.find((p) => p.passengerId === 'PAX2')).toMatchObject({ status: 'CHECKED_IN', segments: [] });
    expect((await api.getBoardingPasses(id('QR2V6W'))).map((p) => p.passengerId)).toEqual(['PAX1']);
  });
}, 20_000);

describe('equipaje', () => {
  const baggage = (passengerId: string, itineraryId: string, paymentReference: string, quantity = 1) => ({ passengerId, itineraryId, quantity, paymentReference });

  it('opciones solo para quien ocupa asiento, con precio, máximo y lo ya comprado', async () => {
    const { api } = await freshApi();
    const options = await api.getBaggageOptions(id('QR2V6W'));
    expect(options.map((o) => o.passengerId)).toEqual(['PAX1']);
    expect(options[0]).toMatchObject({ maxAllowed: 3, alreadyPurchased: 0 });
    expect(options[0].price!.cents).toBeGreaterThan(0);
  });

  it('PAY-OK-: 200 con el total; el mismo intento (misma clave y cuerpo) no suma dos veces; otra clave con otro cuerpo, 422', async () => {
    const { api } = await freshApi();
    const [option] = await api.getBaggageOptions(id('QG4P9X'));
    const request = baggage(option.passengerId, option.itineraryId, pay('OK'));
    const k = key();
    expect(await api.addBaggage(id('QG4P9X'), request, k)).toEqual({ status: 'done', data: { passengerId: option.passengerId, itineraryId: option.itineraryId, totalBaggage: 1 } });
    expect(await api.addBaggage(id('QG4P9X'), request, k)).toMatchObject({ status: 'done', data: { totalBaggage: 1 } });
    expect((await api.getBaggageOptions(id('QG4P9X')))[0].alreadyPurchased).toBe(1);
    expect((await failure(api.addBaggage(id('QG4P9X'), { ...request, quantity: 2 }, k))).status).toBe(422);
    // La misma referencia de pago no se puede usar en otra operación.
    expect((await failure(api.addBaggage(id('QG4P9X'), request, key()))).code).toBe('PAYMENT_REFERENCE_INVALID');
  });

  it('PAY-REJ-: 422 PAYMENT_NOT_AUTHORIZED y no queda nada; reintentar con otro pago funciona', async () => {
    const { api } = await freshApi();
    const [option] = await api.getBaggageOptions(id('QG4P9X'));
    const rejected = await failure(api.addBaggage(id('QG4P9X'), baggage(option.passengerId, option.itineraryId, pay('REJ'), 2), key()));
    expect([rejected.status, rejected.code]).toEqual([422, 'PAYMENT_NOT_AUTHORIZED']);
    expect((await api.getBaggageOptions(id('QG4P9X')))[0].alreadyPurchased).toBe(0);
    expect((await api.addBaggage(id('QG4P9X'), baggage(option.passengerId, option.itineraryId, pay('OK'), 2), key())).status).toBe('done');
    expect((await api.getBaggageOptions(id('QG4P9X')))[0].alreadyPurchased).toBe(2);
  });

  it('PAY-PEND-: 202 en proceso; las maletas aparecen cuando el proceso termina (al refrescar)', async () => {
    const { api, auth } = await freshApi();
    const [option] = await api.getBaggageOptions(id('QG4P9X'));
    const k = key();
    const request = baggage(option.passengerId, option.itineraryId, pay('PEND'));
    expect(await api.addBaggage(id('QG4P9X'), request, k)).toEqual({ status: 'pending' });
    expect((await api.getBaggageOptions(id('QG4P9X')))[0].alreadyPurchased).toBe(0);
    await setClock(api, auth, Date.now() + PENDING_ISSUE_MS + 1000);
    expect((await api.getBaggageOptions(id('QG4P9X')))[0].alreadyPurchased).toBe(1);
    // Repetir la misma petición sigue siendo "en proceso" y no suma otra.
    expect(await api.addBaggage(id('QG4P9X'), request, k)).toEqual({ status: 'pending' });
    expect((await api.getBaggageOptions(id('QG4P9X')))[0].alreadyPurchased).toBe(1);
  });

  it('pasar el máximo es 409 BAGGAGE_LIMIT_EXCEEDED; un infante o un itinerario ajeno, 422; cantidad 0, 400', async () => {
    const { api } = await freshApi();
    const [option] = await api.getBaggageOptions(id('QG4P9X'));
    expect((await failure(api.addBaggage(id('QG4P9X'), baggage(option.passengerId, option.itineraryId, pay('OK'), 4), key()))).code).toBe('BAGGAGE_LIMIT_EXCEEDED');
    expect((await failure(api.addBaggage(id('QR2V6W'), baggage('PAX2', 'x', pay('OK')), key()))).status).toBe(422);
    expect((await failure(api.addBaggage(id('QG4P9X'), baggage(option.passengerId, 'no-es-mio', pay('OK')), key()))).status).toBe(422);
    expect((await failure(api.addBaggage(id('QG4P9X'), baggage(option.passengerId, option.itineraryId, pay('OK'), 0), key()))).status).toBe(400);
  });

  it('una reserva cancelada no admite equipaje (409 ALREADY_CANCELLED)', async () => {
    const { api } = await freshApi();
    expect((await failure(api.getBaggageOptions(id('QC9S4Z')))).code).toBe('ALREADY_CANCELLED');
  });
}, 30_000);

describe('cambio de fecha', () => {
  async function search(api: MockFlightsApi, code: string, days = 1) {
    const booking = await api.getBooking(id(code));
    const date = format(addDays(new Date(booking.outbound.itinerary.segments[0].departureTime), days), 'yyyy-MM-dd');
    return { booking, options: await api.searchDateChange(id(code), [{ itineraryId: booking.outbound.itinerary.id, newDepartureDate: date }]), date };
  }

  it('una tarifa que no permite cambios responde 409 FARE_NOT_CHANGEABLE', async () => {
    const { api } = await freshApi();
    const booking = await api.getBooking(id('QB5T1N'));
    const error = await failure(api.searchDateChange(id('QB5T1N'), [{ itineraryId: booking.outbound.itinerary.id, newDepartureDate: format(addDays(new Date(), 15), 'yyyy-MM-dd') }]));
    expect([error.status, error.code]).toEqual([409, 'FARE_NOT_CHANGEABLE']);
  });

  it('alternativas con la diferencia de tarifa, impuestos, cargo y total (fare + tax + fee = total)', async () => {
    const { api } = await freshApi();
    const { options, date } = await search(api, 'QR2V6W');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.segments[0].departureTime.slice(0, 10)).toBe(date);
      const { fare, taxes, fee, total } = option.price;
      expect(fare.cents + taxes.cents + fee.cents).toBe(total.cents);
      expect(fee.cents).toBe(2500); // CLASSIC: 25 USD por pasajero con asiento
      expect(new Date(option.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('confirmar con pago aprobado: 200 con la reserva en la nueva fecha y el historial; sin pago, 422', async () => {
    const { api } = await freshApi();
    const { options, date } = await search(api, 'QR2V6W');
    const chosen = options[0];
    expect((await failure(api.confirmDateChange(id('QR2V6W'), { changeOfferId: chosen.id }, key()))).status).toBe(422);
    const outcome = await api.confirmDateChange(id('QR2V6W'), { changeOfferId: chosen.id, paymentReference: pay('OK') }, key());
    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done' || !outcome.data) throw new Error('se esperaba la reserva');
    expect(outcome.data.status).toBe('CONFIRMED');
    expect(outcome.data.outbound.itinerary.segments[0].departureTime.slice(0, 10)).toBe(date);
    expect(outcome.data.changes.at(-1)?.description).toContain('Date changed');
    expect((await api.getBooking(id('QR2V6W'))).outbound.itinerary.segments[0].departureTime.slice(0, 10)).toBe(date);
  });

  it('pago rechazado (422) conserva la reserva y se puede reintentar con otro pago; la oferta vencida es 410', async () => {
    const { api, auth } = await freshApi();
    const { options } = await search(api, 'QR2V6W');
    const request = { changeOfferId: options[0].id };
    const before = (await api.getBooking(id('QR2V6W'))).outbound.itinerary.id;
    expect((await failure(api.confirmDateChange(id('QR2V6W'), { ...request, paymentReference: pay('REJ') }, key()))).code).toBe('PAYMENT_NOT_AUTHORIZED');
    expect((await api.getBooking(id('QR2V6W'))).outbound.itinerary.id).toBe(before);
    await setClock(api, auth, Date.now() + 16 * 60_000);
    const expired = await failure(api.confirmDateChange(id('QR2V6W'), { ...request, paymentReference: pay('OK') }, key()));
    expect([expired.status, expired.code]).toEqual([410, 'CHANGE_OFFER_EXPIRED']);
  });

  it('PAY-PEND-: 202, la reserva queda CHANGE_PENDING y luego CONFIRMED con la nueva fecha', async () => {
    const { api, auth } = await freshApi();
    const { options, date } = await search(api, 'QR2V6W');
    expect(await api.confirmDateChange(id('QR2V6W'), { changeOfferId: options[0].id, paymentReference: pay('PEND') }, key())).toEqual({ status: 'pending' });
    expect((await api.getBooking(id('QR2V6W'))).status).toBe('CHANGE_PENDING');
    await setClock(api, auth, Date.now() + PENDING_ISSUE_MS + 1000);
    const after = await api.getBooking(id('QR2V6W'));
    expect(after.status).toBe('CONFIRMED');
    expect(after.outbound.itinerary.segments[0].departureTime.slice(0, 10)).toBe(date);
  });
}, 30_000);

describe('cancelación', () => {
  it('cotización: con tarifa reembolsable devuelve el total menos la penalidad; sin ella, nada de reembolso', async () => {
    const { api } = await freshApi();
    const flex = await api.getCancellationQuote(id('QG4P9X'));
    const booking = await api.getBooking(id('QG4P9X'));
    expect(flex.refundable).toBe(true);
    expect(flex.refund.cents + flex.penalty.cents).toBe(booking.total.cents);
    expect(flex.penalty.cents).toBe(Math.round(booking.total.cents * 0.1));
    const basic = await api.getCancellationQuote(id('QB5T1N'));
    expect(basic).toMatchObject({ refundable: false, refund: { cents: 0 } });
  });

  it('cancelar con la cotización: 200, queda CANCELLED con historial; repetirlo con la misma clave es igual; otra vez, 409', async () => {
    const { api } = await freshApi();
    const quote = await api.getCancellationQuote(id('QG4P9X'));
    const k = key();
    expect(await api.cancelBooking(id('QG4P9X'), { quoteId: quote.quoteId, reason: 'Cambio de planes' }, k)).toEqual({ status: 'done', data: undefined });
    expect(await api.cancelBooking(id('QG4P9X'), { quoteId: quote.quoteId, reason: 'Cambio de planes' }, k)).toEqual({ status: 'done', data: undefined });
    const booking = await api.getBooking(id('QG4P9X'));
    expect(booking.status).toBe('CANCELLED');
    expect(booking.changes.at(-1)?.description).toContain('cancelled');
    expect((await failure(api.cancelBooking(id('QG4P9X'), { quoteId: quote.quoteId }, key()))).code).toBe('ALREADY_CANCELLED');
    expect((await failure(api.getCancellationQuote(id('QG4P9X')))).code).toBe('ALREADY_CANCELLED');
  });

  it('cotización ajena o inventada es 422 y una vencida, 409 QUOTE_EXPIRED', async () => {
    const { api, auth } = await freshApi();
    expect((await failure(api.cancelBooking(id('QG4P9X'), { quoteId: 'inventada' }, key()))).status).toBe(422);
    const quote = await api.getCancellationQuote(id('QG4P9X'));
    await setClock(api, auth, Date.now() + 11 * 60_000);
    expect((await failure(api.cancelBooking(id('QG4P9X'), { quoteId: quote.quoteId }, key()))).code).toBe('QUOTE_EXPIRED');
  });

  it('la reserva de demostración con cancelación lenta responde 202 y pasa a CANCELADA después', async () => {
    const { api, auth } = await freshApi();
    const quote = await api.getCancellationQuote(id('QW8M3K'));
    expect(await api.cancelBooking(id('QW8M3K'), { quoteId: quote.quoteId }, key())).toEqual({ status: 'pending' });
    expect((await api.getBooking(id('QW8M3K'))).status).toBe('CANCELLATION_PENDING');
    await setClock(api, auth, Date.now() + PENDING_ISSUE_MS + 1000);
    expect((await api.getBooking(id('QW8M3K'))).status).toBe('CANCELLED');
  });
}, 20_000);

describe('estado del vuelo de la demostración', () => {
  it('el vuelo de QR2V6W sale retrasado 45 minutos', async () => {
    const { api } = await freshApi();
    const booking = await api.getBooking(id('QR2V6W'));
    const segment = booking.outbound.itinerary.segments[0];
    const status = await api.getFlightStatus(segment.flightNumber, segment.departureTime.slice(0, 10));
    expect(status.status).toBe('DELAYED');
    expect((new Date(status.departure.estimated!).getTime() - new Date(status.departure.scheduled).getTime()) / 60_000).toBe(45);
  });
});
