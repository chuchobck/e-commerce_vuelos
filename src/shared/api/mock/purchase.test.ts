// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../errors';
import type { BookingPassenger, CreateHoldRequest } from '../types';
import type { MockFlightsApi } from './MockFlightsApi';

/** Mock sin errores aleatorios, base nueva y sesión de la cuenta demo. */
async function signedIn() {
  vi.stubEnv('VITE_MOCK_ERROR_RATE', '0');
  vi.resetModules();
  localStorage.clear();
  const { MockFlightsApi } = await import('./MockFlightsApi');
  const auth = { token: undefined as string | undefined };
  const api: MockFlightsApi = new MockFlightsApi(() => auth.token);
  auth.token = (await api.login({ email: 'demo@quinde.ec', password: 'quinde-demo-2026' })).accessToken;
  const day = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);
  const result = await api.search({ origin: 'UIO', destination: 'GYE', departDate: day, passengers: { adults: 1, children: 0, infants: 0 }, cabin: 'ECONOMY' });
  const offer = result.offers[0];
  const request: CreateHoldRequest = {
    offerId: offer.id,
    itinerarySelections: [{ itineraryId: offer.itineraries[0].id, cabinClass: 'ECONOMY', fareBrand: offer.itineraries[0].fares.find((f) => f.cabin === 'ECONOMY')!.brand }],
    passengers: { adults: 1, children: 0, infants: 0 },
  };
  return { api, request };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('se esperaba un error');
}

const PAX: BookingPassenger[] = [
  { id: 'PAX1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', birthDate: '1990-04-15', gender: 'F', email: 'ana@example.test', phone: '+593991234567' },
];
const key = () => crypto.randomUUID();
const ref = (prefix: 'OK' | 'PEND' | 'REJ') => `PAY-${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

describe('compra del mock (mismas reglas y errores que la API local)', () => {
  beforeEach(() => vi.unstubAllEnvs());

  it('hold: misma clave y cuerpo = mismo hold; otro cuerpo = 422; sin clave = 400', async () => {
    const { api, request } = await signedIn();
    const k = key();
    const hold = await api.createHold(request, k);
    expect(hold).toMatchObject({ status: 'HELD', remainingSeconds: 900 });
    expect((await api.createHold(request, k)).id).toBe(hold.id);
    expect((await failure(api.createHold({ ...request, passengers: { adults: 2, children: 0, infants: 0 } }, k))).status).toBe(422);
    expect((await failure(api.createHold(request, ''))).status).toBe(400);
    expect(await failure(api.createHold({ ...request, offerId: 'no-existe' }, key()))).toMatchObject({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' });
  });

  it('reserva aprobada (201): boletos emitidos; repetir con la misma clave devuelve la misma reserva', async () => {
    const { api, request } = await signedIn();
    const hold = await api.createHold(request, key());
    const order = { holdId: hold.id, passengers: PAX, paymentReference: ref('OK') };
    const k = key();
    const booking = await api.createBooking(order, k);
    expect(booking).toMatchObject({ status: 'CONFIRMED', tickets: [{ status: 'ISSUED' }] });
    expect((await api.createBooking(order, k)).id).toBe(booking.id);
    expect((await api.getHold(hold.id)).status).toBe('CONSUMED');
    // El hold ya es de la reserva: otra clave da 409 y liberarlo también.
    expect(await failure(api.createBooking({ ...order, paymentReference: ref('OK') }, key()))).toMatchObject({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' });
    expect((await failure(api.cancelHold(hold.id))).status).toBe(409);
  });

  it('pago rechazado (422): no hay reserva y el hold sigue vivo; referencia ya usada 409; inválida 422', async () => {
    const { api, request } = await signedIn();
    const hold = await api.createHold(request, key());
    expect(await failure(api.createBooking({ holdId: hold.id, passengers: PAX, paymentReference: ref('REJ') }, key()))).toMatchObject({ status: 422, code: 'PAYMENT_NOT_AUTHORIZED' });
    expect((await api.getHold(hold.id)).status).toBe('HELD');
    expect(await failure(api.createBooking({ holdId: hold.id, passengers: PAX, paymentReference: 'TARJETA-1234' }, key()))).toMatchObject({ status: 422, code: 'PAYMENT_REFERENCE_INVALID' });
    const used = ref('OK');
    const other = await api.createHold(request, key());
    await api.createBooking({ holdId: other.id, passengers: PAX, paymentReference: used }, key());
    expect(await failure(api.createBooking({ holdId: hold.id, passengers: PAX, paymentReference: used }, key()))).toMatchObject({ status: 409, code: 'PAYMENT_REFERENCE_INVALID' });
  });

  it('pago pendiente (202): PENDING_PAYMENT y luego CONFIRMED en la consulta', async () => {
    const { api, request } = await signedIn();
    const hold = await api.createHold(request, key());
    const now = Date.now();
    const booking = await api.createBooking({ holdId: hold.id, passengers: PAX, paymentReference: ref('PEND') }, key());
    expect(booking.status).toBe('PENDING_PAYMENT');
    vi.spyOn(Date, 'now').mockReturnValue(now + 21_000);
    expect((await api.getBooking(booking.id)).status).toBe('CONFIRMED');
    vi.restoreAllMocks();
  });

  it('hold liberado o vencido: 410; liberar dos veces es 204; uno ajeno o inexistente, 422 al reservar', async () => {
    const { api, request } = await signedIn();
    const hold = await api.createHold(request, key());
    await api.cancelHold(hold.id);
    await api.cancelHold(hold.id);
    expect((await api.getHold(hold.id)).status).toBe('RELEASED');
    expect(await failure(api.createBooking({ holdId: hold.id, passengers: PAX, paymentReference: ref('OK') }, key()))).toMatchObject({ status: 410 });
    expect((await failure(api.createBooking({ holdId: crypto.randomUUID(), passengers: PAX, paymentReference: ref('OK') }, key()))).status).toBe(422);
    expect((await failure(api.getHold(crypto.randomUUID()))).status).toBe(404);
  });

  it('pasajeros: cantidad distinta al hold 422; cédula inválida 400; edad que no corresponde 422', async () => {
    const { api, request } = await signedIn();
    const hold = await api.createHold(request, key());
    const order = (passengers: BookingPassenger[]) => api.createBooking({ holdId: hold.id, passengers, paymentReference: ref('OK') }, key());
    expect((await failure(order([...PAX, { ...PAX[0], id: 'PAX2' }]))).status).toBe(422);
    expect((await failure(order([{ ...PAX[0], documentNumber: '1710034066' }]))).status).toBe(400);
    expect((await failure(order([{ ...PAX[0], birthDate: '2020-01-01' }]))).status).toBe(422);
  });
}, 90_000);
