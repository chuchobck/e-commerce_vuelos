/**
 * Integración de la compra (hold, reserva y pago simulado) contra el backend LOCAL
 * (`npm run test:api`). Escribe datos (usuario nuevo @example.test, holds y reservas), así que
 * NUNCA corre contra Render. No usa la cuenta de administrador sembrada.
 *
 * Límites del backend por IP: 30 holds y 10 reservas por minuto (más 100 peticiones en total).
 * Esta prueba usa 1 búsqueda, 3 holds y 5 POST /bookings.
 */
import { loadEnv } from 'vite';
import { describe, expect, it } from 'vitest';
import { isFinalBooking, pollBooking } from '../../src/features/checkout/polling';
import { ApiError } from '../../src/shared/api/errors';
import { createHttpClient } from '../../src/shared/api/http/client';
import { toBookingRequest } from '../../src/shared/api/mapping';
import { RealFlightsApi } from '../../src/shared/api/RealFlightsApi';
import type { BookingPassenger, CreateHoldRequest } from '../../src/shared/api/types';

const env = loadEnv('development', process.cwd(), '');
const BASE = (process.env.API_TEST_URL || env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const IS_LOCAL = !!BASE && !/onrender\.com/i.test(BASE);

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('se esperaba un error');
}

const key = () => crypto.randomUUID();
const reference = (prefix: 'OK' | 'PEND' | 'REJ') => `PAY-${prefix}-TESTAPI${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!IS_LOCAL)(`compra contra el backend local: ${IS_LOCAL ? BASE : '(omitida: sin URL local)'}`, () => {
  const stamp = Date.now();
  const email = `quinde-compra-${stamp}@example.test`;
  const password = `una frase larga de compra ${stamp}`;
  let token: string | undefined;
  const http = createHttpClient({ baseUrl: BASE, getAccessToken: () => token });
  const api = new RealFlightsApi(http);
  let request: CreateHoldRequest;

  const passengers: BookingPassenger[] = [
    {
      id: 'PAX1',
      type: 'ADULT',
      firstName: 'Ana',
      lastName: 'Pérez',
      documentType: 'NATIONAL_ID',
      documentNumber: '1710034065',
      nationality: 'EC',
      birthDate: '1990-04-15',
      gender: 'F',
      email: 'ana.perez@example.test',
      phone: '+593991234567',
    },
  ];

  it('cuenta nueva e ingreso, y una búsqueda real para apartar', async () => {
    await api.register({ email, password });
    token = (await api.login({ email, password })).accessToken;
    const day = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);
    const result = await api.search({ origin: 'UIO', destination: 'GYE', departDate: day, passengers: { adults: 1, children: 0, infants: 0 }, cabin: 'ECONOMY' });
    const offer = result.offers[0];
    expect(offer).toBeDefined();
    const fare = offer.itineraries[0].fares.find((f) => f.cabin === 'ECONOMY')!;
    request = { offerId: offer.id, itinerarySelections: [{ itineraryId: offer.itineraries[0].id, cabinClass: 'ECONOMY', fareBrand: fare.brand }], passengers: { adults: 1, children: 0, infants: 0 } };
  });

  it('hold + GET hold: 15 minutos según el servidor', async () => {
    const hold = await api.createHold(request, key());
    expect(hold).toMatchObject({ status: 'HELD', remainingSeconds: 900 });
    const again = await api.getHold(hold.id);
    expect(again.status).toBe('HELD');
    expect(again.remainingSeconds).toBeGreaterThan(890);
    // Tiempo restante del servidor frente al reloj de este equipo (informativo).
    const skew = Math.round((new Date(again.expiresAt!).getTime() - again.remainingSeconds * 1000 - again.receivedAt) / 1000);
    console.info(`[test:api] hold: remainingSeconds=${again.remainingSeconds}; desfase reloj servidor − equipo ≈ ${skew} s`);
    await api.cancelHold(hold.id);
    expect((await api.getHold(hold.id)).status).toBe('RELEASED');
  });

  it('PAY-OK: 201 con boletos emitidos; el mismo envío dos veces con la misma clave = UNA reserva', async () => {
    const hold = await api.createHold(request, key());
    const order = { holdId: hold.id, passengers, paymentReference: reference('OK') };
    const k = key();
    const booking = await api.createBooking(order, k);
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.tickets).toEqual([expect.objectContaining({ status: 'ISSUED', number: expect.stringMatching(/^\d{13}$/) })]);
    // Repetición: misma clave y mismo cuerpo → la misma reserva, marcada como repetida.
    const res = await fetch(`${BASE}/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': k },
      body: JSON.stringify(toBookingRequest(order)),
    });
    const replay = (await res.json()) as { bookingId: string };
    expect(res.status).toBe(201);
    expect(replay.bookingId).toBe(booking.id);
    expect(res.headers.get('idempotent-replayed')).toBe('true');
    expect((await api.createBooking(order, k)).id).toBe(booking.id);
    // Una sola reserva en la cuenta.
    const list = await fetch(`${BASE}/bookings`, { headers: { authorization: `Bearer ${token}` } });
    const items = ((await list.json()) as { items: { bookingId: string }[] }).items;
    expect(items.filter((b) => b.bookingId === booking.id)).toHaveLength(1);
    expect(items).toHaveLength(1);
    expect((await api.getHold(hold.id)).status).toBe('CONSUMED');
    console.info(`[test:api] PAY-OK: 201 ${booking.status}, PNR ${booking.code}; repetición 201 con Idempotent-Replayed: true; reservas en la cuenta: ${items.length}`);
  });

  it('PAY-REJ: 422 PAYMENT_NOT_AUTHORIZED y el hold sigue HELD (se puede pagar otra vez)', async () => {
    const hold = await api.createHold(request, key());
    const error = await failure(api.createBooking({ holdId: hold.id, passengers, paymentReference: reference('REJ') }, key()));
    expect(error).toMatchObject({ status: 422, code: 'PAYMENT_NOT_AUTHORIZED' });
    const after = await api.getHold(hold.id);
    expect(after.status).toBe('HELD');
    console.info(`[test:api] PAY-REJ: ${error.status} ${error.code}; hold después del rechazo: ${after.status} (${after.remainingSeconds} s)`);
    await api.cancelHold(hold.id);
  });

  it('PAY-PEND: 202 PENDING_PAYMENT y el seguimiento con espera creciente llega al estado final', async () => {
    const hold = await api.createHold(request, key());
    const booking = await api.createBooking({ holdId: hold.id, passengers, paymentReference: reference('PEND') }, key());
    expect(booking.status).toBe('PENDING_PAYMENT');
    const started = Date.now();
    const final = await pollBooking({ get: () => api.getBooking(booking.id), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now });
    expect(final && isFinalBooking(final)).toBe(true);
    expect(final?.status).toBe('CONFIRMED');
    expect(final?.tickets.every((t) => t.status === 'ISSUED')).toBe(true);
    console.info(`[test:api] PAY-PEND: 202 ${booking.status} → ${final?.status} en ${Math.round((Date.now() - started) / 1000)} s`);
  }, 150_000);
});
