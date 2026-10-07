// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../errors';
import type { BookingPassenger, CreateHoldRequest } from '../types';
import type { MockFlightsApi } from './MockFlightsApi';

/** Mock sin errores aleatorios, base nueva y sesión de la cuenta demo. */
async function signedIn(passengers: CreateHoldRequest["passengers"] = { adults: 1, children: 0, infants: 0 }) {
  vi.stubEnv('VITE_MOCK_ERROR_RATE', '0');
  vi.resetModules();
  localStorage.clear();
  const { MockFlightsApi } = await import('./MockFlightsApi');
  const auth = { token: undefined as string | undefined };
  const api: MockFlightsApi = new MockFlightsApi(() => auth.token);
  auth.token = (await api.login({ email: 'demo@quinde.ec', password: 'quinde-demo-2026' })).accessToken;
  const day = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);
  const result = await api.search({ origin: 'UIO', destination: 'GYE', departDate: day, passengers, cabin: 'ECONOMY' });
  const offer = result.offers[0];
  const request: CreateHoldRequest = {
    offerId: offer.id,
    itinerarySelections: [{ itineraryId: offer.itineraries[0].id, cabinClass: 'ECONOMY', fareBrand: offer.itineraries[0].fares.find((f) => f.cabin === 'ECONOMY')!.brand }],
    passengers,
  };
  return { api, request, offerId: offer.id, segmentId: offer.itineraries[0].segments[0].id };
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

  describe('asientos (mismos códigos y ocupación que la API local)', () => {
    const seatOf = (segmentId: string, seat: string) => [{ segmentId, seatNumber: seat }];
    const order = (holdId: string, passengers: BookingPassenger[]) => ({ holdId, passengers, paymentReference: ref('OK') });

    it('el mapa nace con todo libre; una reserva ocupa los asientos elegidos y el automático toma el primero libre de la cabina', async () => {
      const { api, request, offerId, segmentId } = await signedIn();
      const taken = (map: Awaited<ReturnType<typeof api.getSeatMap>>) => map.cabins!.flatMap((c) => c.rows!).flatMap((r) => r.seats!).filter((s) => !s.isAvailable).map((s) => s.seatNumber);
      expect(taken(await api.getSeatMap(offerId, segmentId))).toEqual([]);
      const hold = await api.createHold(request, key());
      const booking = await api.createBooking(order(hold.id, [{ ...PAX[0], seats: seatOf(segmentId, '16C') }]), key());
      expect(booking.passengers[0].seats).toEqual(seatOf(segmentId, '16C'));
      expect(taken(await api.getSeatMap(offerId, segmentId))).toEqual(['16C']);
      // Sin elegir nada: el primer asiento libre de la economía (como la API real, que dio 10A).
      const second = await api.createHold(request, key());
      const auto = await api.createBooking(order(second.id, [PAX[0]]), key());
      expect(auto.passengers[0].seats).toEqual(seatOf(segmentId, '10A'));
    });

    it('asiento ocupado: 409 SEAT_TAKEN sin decir cuál; el hold sigue vivo y se puede reintentar con otro', async () => {
      const { api, request, segmentId } = await signedIn();
      const first = await api.createHold(request, key());
      await api.createBooking(order(first.id, [{ ...PAX[0], seats: seatOf(segmentId, '11A') }]), key());
      const hold = await api.createHold(request, key());
      const error = await failure(api.createBooking(order(hold.id, [{ ...PAX[0], seats: seatOf(segmentId, '11A') }]), key()));
      expect(error).toMatchObject({ status: 409, code: 'SEAT_TAKEN', fieldErrors: [] });
      expect((await api.getHold(hold.id)).status).toBe('HELD');
      const again = await api.createBooking(order(hold.id, [{ ...PAX[0], seats: seatOf(segmentId, '11B') }]), key());
      expect(again.status).toBe('CONFIRMED');
    });

    it('otra cabina 422 SEAT_CABIN_MISMATCH; inexistente 422; tramo ajeno 422; formato 400', async () => {
      const { api, request, segmentId } = await signedIn();
      const hold = await api.createHold(request, key());
      const book = (seats: { segmentId: string; seatNumber: string }[]) => failure(api.createBooking(order(hold.id, [{ ...PAX[0], seats }]), key()));
      expect(await book(seatOf(segmentId, '1A'))).toMatchObject({ status: 422, code: 'SEAT_CABIN_MISMATCH', fieldErrors: [{ field: 'passengers[0].assignedSeats' }] });
      expect(await book(seatOf(segmentId, '99Z'))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
      expect(await book(seatOf(crypto.randomUUID(), '16A'))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
      expect(await book(seatOf(segmentId, '12'))).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    });

    it('el mismo asiento para dos pasajeros 400; un infante con asiento 422 INFANT_SEAT_NOT_ALLOWED', async () => {
      const { api, request, segmentId } = await signedIn({ adults: 2, children: 0, infants: 0 });
      const two = await api.createHold(request, key());
      const second: BookingPassenger = { ...PAX[0], id: 'PAX2', documentNumber: '0926687856' };
      expect(await failure(api.createBooking(order(two.id, [{ ...PAX[0], seats: seatOf(segmentId, '17A') }, { ...second, seats: seatOf(segmentId, '17A') }]), key()))).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      const { api: api2, request: request2, segmentId: segment2 } = await signedIn({ adults: 1, children: 0, infants: 1 });
      const withInfant = await api2.createHold(request2, key());
      const infant: BookingPassenger = { ...second, type: 'INFANT', associatedAdultId: 'PAX1', birthDate: new Date(Date.now() - 200 * 86400e3).toISOString().slice(0, 10), seats: seatOf(segment2, '17B') };
      expect(await failure(api2.createBooking(order(withInfant.id, [PAX[0], infant]), key()))).toMatchObject({ status: 422, code: 'INFANT_SEAT_NOT_ALLOWED' });
    });
  });
}, 90_000);
