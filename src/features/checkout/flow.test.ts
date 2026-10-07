import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Booking, type BookingPassenger, type CreateBookingRequest, type Hold } from '@/shared/api';
import { stableHash } from '@/shared/lib/stableHash';
import { createAttemptStore, createDraftStore } from './draft';
import { CheckoutFlow, type CheckoutApi } from './flow';
import { holdSecondsLeft } from './holdClock';
import { createIntentKeys, type StorageLike } from './idempotency';
import { classifyPaymentError, reduce } from './machine';
import type { CheckoutSelection } from './selection';

const T0 = 1_800_000_000_000;
const usd = (cents: number) => ({ cents, currency: 'USD' });

function memoryStorage(): StorageLike & { dump(): string } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    dump: () => [...data.entries()].map(([k, v]) => `${k}=${v}`).join('\n'),
  };
}

const SELECTION: CheckoutSelection = {
  id: 'sel-1',
  offerId: 'offer-1',
  outbound: {
    itinerary: { id: 'it-1', segments: [], durationMinutes: 55, stops: 0, fares: [] },
    fare: {
      cabin: 'ECONOMY',
      brand: 'BASIC',
      seatsLeft: 9,
      refundable: false,
      changeable: false,
      baggage: { personalItem: true, carryOn: 0, checked: 0 },
      extraBagPrice: null,
      pricePerAdult: usd(7392),
      total: usd(7392),
    },
  },
  passengers: { adults: 1, children: 0, infants: 0 },
  searchQuery: 'origen=UIO&destino=GYE',
};

const PAX: BookingPassenger[] = [
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
    email: 'ana@example.test',
    phone: '+593991234567',
  },
];

function booking(status: Booking['status'], id = 'bk-1'): Booking {
  return {
    id,
    code: 'ABC123',
    status,
    createdAt: new Date(T0).toISOString(),
    outbound: { itinerary: SELECTION.outbound.itinerary, fare: SELECTION.outbound.fare },
    passengers: [],
    tickets: [],
    total: usd(7392),
    changes: [],
  };
}

/**
 * API falsa con las reglas observadas en la API local: misma clave y mismo cuerpo = misma respuesta;
 * misma clave con otro cuerpo = 422; el hold vence a los 15 min de SU reloj (`server.now`).
 */
function fakeApi(clientNow: () => number = () => T0) {
  const server = { now: T0 };
  const holds = new Map<string, { status: Hold['status']; expiresAt: number }>();
  const keys = new Map<string, { hash: string; result: unknown }>();
  let n = 0;
  const calls = { createHold: [] as string[], getHold: 0, cancelHold: [] as string[], createBooking: [] as { key: string; request: CreateBookingRequest }[] };
  let bookingOutcome: (request: CreateBookingRequest) => Booking | Error = () => booking('CONFIRMED');
  const holdOf = (id: string): Hold => {
    const h = holds.get(id)!;
    if (h.status === 'HELD' && h.expiresAt <= server.now) h.status = 'EXPIRED';
    return { id, status: h.status, expiresAt: null, remainingSeconds: h.status === 'HELD' ? Math.floor((h.expiresAt - server.now) / 1000) : 0, receivedAt: clientNow(), lockedPrice: usd(7392) };
  };
  const replay = (key: string, body: unknown) => {
    const found = keys.get(key);
    if (!found) return undefined;
    if (found.hash !== stableHash(body)) throw new ApiError({ status: 422, code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'Idempotency-Key', message: 'already used' }] });
    return found.result;
  };
  const api: CheckoutApi = {
    createHold: vi.fn(async (request, key) => {
      calls.createHold.push(key);
      const again = replay(`h:${key}`, request) as string | undefined;
      const id = again ?? `hold-${++n}`;
      if (!again) {
        holds.set(id, { status: 'HELD', expiresAt: server.now + 900_000 });
        keys.set(`h:${key}`, { hash: stableHash(request), result: id });
      }
      return { ...holdOf(id), remainingSeconds: 900 };
    }),
    getHold: vi.fn(async (id) => {
      calls.getHold++;
      if (!holds.has(id)) throw new ApiError({ status: 404, code: 'VALIDATION_FAILED' });
      return holdOf(id);
    }),
    cancelHold: vi.fn(async (id) => {
      calls.cancelHold.push(id);
      const h = holds.get(id);
      if (h?.status === 'CONSUMED') throw new ApiError({ status: 409, code: 'VALIDATION_FAILED' });
      if (h?.status === 'HELD') h.status = 'RELEASED';
    }),
    createBooking: vi.fn(async (request, key) => {
      calls.createBooking.push({ key, request });
      const again = replay(`b:${key}`, request) as Booking | undefined;
      if (again) return again;
      const hold = holdOf(request.holdId);
      if (hold.status === 'CONSUMED') throw new ApiError({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' });
      if (hold.status !== 'HELD') throw new ApiError({ status: 410, code: 'OFFER_NO_LONGER_AVAILABLE' });
      const result = bookingOutcome(request);
      if (result instanceof Error) throw result;
      holds.get(request.holdId)!.status = 'CONSUMED';
      keys.set(`b:${key}`, { hash: stableHash(request), result });
      return result;
    }),
    getBooking: vi.fn(async () => booking('CONFIRMED')),
  };
  return { api, calls, server, holds, setOutcome: (fn: typeof bookingOutcome) => (bookingOutcome = fn) };
}

function setup({ storage = memoryStorage(), selection = SELECTION as CheckoutSelection | null, now = { t: T0 } } = {}) {
  const api = fakeApi(() => now.t);
  let saved: CheckoutSelection | null = selection ? { ...selection } : null;
  const intervals: { fn: () => void; ms: number }[] = [];
  const visible: (() => void)[] = [];
  const selectionStore = {
    load: () => saved,
    setHold: (holdId: string | undefined) => {
      if (saved) saved = { ...saved, holdId };
    },
    clear: () => {
      saved = null;
    },
  };
  const make = () =>
    new CheckoutFlow({
      api: api.api,
      selection: selectionStore,
      keys: createIntentKeys(storage),
      draft: createDraftStore(storage),
      attempt: createAttemptStore(storage),
      now: () => now.t,
      every: (fn, ms) => {
        intervals.push({ fn, ms });
        return () => intervals.splice(intervals.findIndex((i) => i.fn === fn), 1);
      },
      onVisible: (fn) => {
        visible.push(fn);
        return () => visible.splice(visible.indexOf(fn), 1);
      },
      sleep: async (ms) => {
        now.t += ms;
      },
    });
  return { flow: make(), reload: make, api, storage, now, intervals, visible, selection: () => saved, setSelection: (s: CheckoutSelection | null) => (saved = s) };
}

const signedIn = { authenticated: true };

describe('máquina de la compra: hold', () => {
  it('sin selección: "empty"; sin sesión: "selected" y no aparta nada', async () => {
    const empty = setup({ selection: null });
    await empty.flow.start(signedIn);
    expect(empty.flow.getState().step).toBe('empty');

    const anon = setup();
    await anon.flow.start({ authenticated: false });
    expect(anon.flow.getState().step).toBe('selected');
    expect(anon.api.calls.createHold).toHaveLength(0);
  });

  it('con sesión aparta UNA vez aunque se monte dos veces, y guarda el hold en la selección', async () => {
    const s = setup();
    await Promise.all([s.flow.start(signedIn), s.flow.start(signedIn)]);
    await s.flow.start(signedIn); // pasar de /compra/datos a /compra/pago
    expect(s.api.calls.createHold).toHaveLength(1);
    expect(s.flow.getState()).toMatchObject({ step: 'held', hold: { id: 'hold-1', status: 'HELD' } });
    expect(s.selection()?.holdId).toBe('hold-1');
  });

  it('refrescar NO crea otro hold: verifica el guardado con GET', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    s.api.server.now += 5 * 60_000;
    const reloaded = s.reload();
    await reloaded.start(signedIn);
    expect(s.api.calls.createHold).toHaveLength(1);
    expect(s.api.calls.getHold).toBe(1);
    const state = reloaded.getState();
    expect(state.step === 'held' && state.hold.remainingSeconds).toBe(600);
  });

  it('si el hold guardado ya venció lo informa, y la misma selección luego tendrá una clave NUEVA', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    const firstKey = s.api.calls.createHold[0];
    s.api.server.now += 16 * 60_000;
    const reloaded = s.reload();
    await reloaded.start(signedIn);
    expect(reloaded.getState()).toEqual({ step: 'expired', reason: 'expired' });
    expect(s.selection()?.holdId).toBeUndefined();
    // Elegir el mismo vuelo otra vez: otra elección, hold nuevo con clave nueva (la vieja repetiría el hold vencido).
    s.setSelection({ ...SELECTION, id: 'sel-2' });
    await reloaded.start(signedIn);
    expect(s.api.calls.createHold).toHaveLength(2);
    expect(s.api.calls.createHold[1]).not.toBe(firstKey);
    expect(reloaded.getState().step).toBe('held');
  });

  it('409/422 al apartar: "unavailable" (sin cupo o la oferta venció)', async () => {
    const s = setup();
    vi.mocked(s.api.api.createHold).mockRejectedValueOnce(new ApiError({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' }));
    await s.flow.start(signedIn);
    expect(s.flow.getState()).toMatchObject({ step: 'unavailable', error: { status: 409 } });
  });

  it('un error de red al apartar se reintenta con la MISMA clave', async () => {
    const s = setup();
    vi.mocked(s.api.api.createHold).mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK' }));
    await s.flow.start(signedIn);
    expect(s.flow.getState()).toMatchObject({ step: 'error', during: 'hold' });
    await s.flow.start(signedIn);
    const keys = vi.mocked(s.api.api.createHold).mock.calls.map(([, key]) => key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(s.flow.getState().step).toBe('held');
  });
});

describe('máquina de la compra: tiempo del servidor', () => {
  it('el tiempo restante sale de remainingSeconds y del momento de llegada, no de la hora del equipo', () => {
    // El equipo va 5 minutos adelantado: expiresAt "ya pasó" en su reloj, pero el servidor dice 10 min.
    const hold: Hold = { id: 'h', status: 'HELD', expiresAt: new Date(T0 - 60_000).toISOString(), remainingSeconds: 600, receivedAt: T0 + 300_000, lockedPrice: usd(1) };
    expect(holdSecondsLeft(hold, T0 + 300_000)).toBe(600);
    expect(holdSecondsLeft(hold, T0 + 300_000 + 599_500)).toBe(1);
    expect(holdSecondsLeft(hold, T0 + 300_000 + 600_000)).toBe(0);
  });

  it('resincroniza cada minuto y al volver a la pestaña; deja de hacerlo al terminar', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    expect(s.intervals).toEqual([expect.objectContaining({ ms: 60_000 })]);
    s.visible[0]();
    s.intervals[0].fn();
    await vi.waitFor(() => expect(s.api.calls.getHold).toBe(2));
    await s.flow.cancel();
    expect(s.intervals).toHaveLength(0);
    expect(s.visible).toHaveLength(0);
  });

  it('el temporizador local llega a cero pero el servidor dice que queda tiempo: sigue vivo', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    s.now.t += 15 * 60_000; // el reloj local corrió más que el del servidor
    s.api.server.now += 10 * 60_000;
    await s.flow.timeUp();
    expect(s.flow.getState().step).toBe('held');
    s.api.server.now += 6 * 60_000;
    await s.flow.timeUp();
    expect(s.flow.getState()).toEqual({ step: 'expired', reason: 'expired' });
  });

  it('al vencer conserva lo escrito y devuelve la búsqueda para buscar de nuevo', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    s.flow.setPassengers(PAX, true);
    s.api.server.now += 16 * 60_000;
    s.now.t += 16 * 60_000;
    await s.flow.timeUp();
    expect(s.flow.getState().step).toBe('expired');
    expect(s.flow.passengersDraft()).toEqual(PAX);
    expect(s.flow.searchAgain()).toBe(SELECTION.searchQuery);
  });
});

describe('máquina de la compra: pago y resultado', () => {
  async function ready() {
    const s = setup();
    await s.flow.start(signedIn);
    s.flow.setPassengers(PAX, true);
    return s;
  }

  it('sin pasajeros completos no se puede pagar', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    s.flow.setPassengers(PAX, false);
    await s.flow.pay('PAY-OK-AAAA1111');
    expect(s.api.calls.createBooking).toHaveLength(0);
  });

  it('201: confirmada; la compra se borra (selección, claves, borrador e intento)', async () => {
    const s = await ready();
    await s.flow.pay('PAY-OK-AAAA1111');
    expect(s.flow.getState()).toMatchObject({ step: 'confirmed', booking: { status: 'CONFIRMED' } });
    expect(s.selection()).toBeNull();
    expect(s.storage.dump()).toBe('');
  });

  it('doble clic: una sola reserva', async () => {
    const s = await ready();
    await Promise.all([s.flow.pay('PAY-OK-AAAA1111'), s.flow.pay('PAY-OK-BBBB2222')]);
    expect(s.api.calls.createBooking).toHaveLength(1);
  });

  it('error de red al pagar: reintentar reenvía el MISMO pedido con la MISMA clave', async () => {
    const s = await ready();
    vi.mocked(s.api.api.createBooking).mockRejectedValueOnce(new ApiError({ status: 0, code: 'TIMEOUT' }));
    await s.flow.pay('PAY-OK-AAAA1111');
    expect(s.flow.getState()).toMatchObject({ step: 'error', during: 'payment' });
    await s.flow.retryPayment();
    const [first, second] = vi.mocked(s.api.api.createBooking).mock.calls;
    expect(second[1]).toBe(first[1]);
    expect(second[0]).toEqual(first[0]);
    expect(s.flow.getState().step).toBe('confirmed');
  });

  it('pago rechazado (422): vuelve a pago con el hold vivo (verificado con GET); el nuevo pago lleva otra clave', async () => {
    const s = await ready();
    s.api.setOutcome(() => new ApiError({ status: 422, code: 'PAYMENT_NOT_AUTHORIZED' }));
    const gets = s.api.calls.getHold;
    await s.flow.pay('PAY-REJ-AAAA1111');
    expect(s.flow.getState()).toMatchObject({ step: 'rejected', problem: 'declined', hold: { status: 'HELD' } });
    expect(s.api.calls.getHold).toBe(gets + 1);
    s.api.setOutcome(() => booking('CONFIRMED'));
    await s.flow.pay('PAY-OK-BBBB2222');
    expect(s.api.calls.createBooking[1].key).not.toBe(s.api.calls.createBooking[0].key);
    expect(s.flow.getState().step).toBe('confirmed');
  });

  it('SEAT_TAKEN al pagar: vuelve a los datos con el hold vivo; con los asientos corregidos el pedido y la clave son nuevos', async () => {
    const s = await ready();
    s.api.setOutcome(() => new ApiError({ status: 409, code: 'SEAT_TAKEN' }));
    const withSeat = [{ ...PAX[0], seats: [{ segmentId: 's1', seatNumber: '12A' }] }];
    s.flow.setPassengers(withSeat, true);
    await s.flow.pay('PAY-OK-AAAA1111');
    expect(s.flow.getState()).toMatchObject({ step: 'held', passengersReady: false, bookingError: { code: 'SEAT_TAKEN' }, hold: { id: 'hold-1' } });
    s.api.setOutcome(() => booking('CONFIRMED'));
    // El usuario elige otro asiento y continúa: el error de asientos queda atendido.
    s.flow.setPassengers([{ ...PAX[0], seats: [{ segmentId: 's1', seatNumber: '14C' }] }], true);
    expect((s.flow.getState() as { bookingError?: unknown }).bookingError).toBeUndefined();
    await s.flow.pay('PAY-OK-BBBB2222');
    const [first, second] = vi.mocked(s.api.api.createBooking).mock.calls;
    expect(second[1]).not.toBe(first[1]);
    expect(second[0].passengers[0].seats).toEqual([{ segmentId: 's1', seatNumber: '14C' }]);
    expect(s.flow.getState().step).toBe('confirmed');
  });

  it('202: en proceso; se consulta con esperas crecientes hasta el estado final', async () => {
    const s = await ready();
    s.api.setOutcome(() => booking('PENDING_PAYMENT'));
    vi.mocked(s.api.api.getBooking).mockResolvedValueOnce(booking('PENDING_PAYMENT')).mockResolvedValueOnce(booking('CONFIRMED'));
    const seen: string[] = [];
    s.flow.subscribe((st) => seen.push(st.step));
    await s.flow.pay('PAY-PEND-AAAA1111');
    await vi.waitFor(() => expect(s.flow.getState()).toMatchObject({ step: 'confirmed' }));
    expect(seen).toContain('processing');
    expect(s.api.api.getBooking).toHaveBeenCalledTimes(2);
    expect(s.api.calls.createBooking).toHaveLength(1);
  });

  it('202 que no termina en 2 minutos: "seguimos procesando", sin reintentar la compra', async () => {
    const s = await ready();
    s.api.setOutcome(() => booking('PENDING_PAYMENT'));
    vi.mocked(s.api.api.getBooking).mockResolvedValue(booking('PENDING_PAYMENT'));
    await s.flow.pay('PAY-PEND-AAAA1111');
    await vi.waitFor(() => expect(s.flow.getState()).toMatchObject({ step: 'processing', gaveUp: true }));
    expect(s.api.calls.createBooking).toHaveLength(1);
  });

  it('volver a entrar al paso tras reservar no borra el resultado', async () => {
    const s = await ready();
    await s.flow.pay('PAY-OK-AAAA1111');
    await s.flow.start(signedIn);
    expect(s.flow.getState().step).toBe('confirmed');
  });

  it('410 (hold vencido al pagar): "expired" sin perder los pasajeros', async () => {
    const s = await ready();
    s.api.server.now += 16 * 60_000;
    await s.flow.pay('PAY-OK-AAAA1111');
    expect(s.flow.getState()).toEqual({ step: 'expired', reason: 'expired' });
    expect(s.flow.passengersDraft()).toEqual(PAX);
  });

  it('recargar con el pago en curso: el hold aparece CONSUMED y se recupera la reserva repitiendo el pedido', async () => {
    const s = await ready();
    // El POST llegó y creó la reserva, pero la página se recargó antes de recibir la respuesta.
    let resolve!: () => void;
    const created = new Promise<void>((r) => (resolve = r));
    const original = vi.mocked(s.api.api.createBooking).getMockImplementation()!;
    vi.mocked(s.api.api.createBooking).mockImplementationOnce(async (req, key) => {
      const result = await original(req, key);
      resolve();
      return new Promise<Booking>(() => void result); // la respuesta nunca llega
    });
    void s.flow.pay('PAY-OK-AAAA1111');
    await created;
    const reloaded = s.reload();
    await reloaded.start(signedIn);
    expect(reloaded.getState()).toMatchObject({ step: 'confirmed', booking: { id: 'bk-1' } });
    const [first, again] = s.api.calls.createBooking;
    expect(again.key).toBe(first.key);
  });

  it('un 400 por datos de pasajeros vuelve al formulario con los campos marcados', () => {
    const hold: Hold = { id: 'h', status: 'HELD', expiresAt: null, remainingSeconds: 600, receivedAt: T0, lockedPrice: usd(1) };
    const error = new ApiError({ status: 400, code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'passengers[0].documentNumber', message: 'x' }] });
    expect(classifyPaymentError(error, hold)).toMatchObject({ step: 'held', passengersReady: false, passengerErrors: [{ field: 'passengers[0].documentNumber' }] });
    expect(classifyPaymentError(new ApiError({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' }), hold)).toEqual({ step: 'expired', reason: 'consumed' });
    expect(classifyPaymentError(new ApiError({ status: 422, code: 'PAYMENT_REFERENCE_INVALID' }), hold)).toMatchObject({ step: 'rejected', problem: 'invalid-reference' });
    expect(classifyPaymentError(new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE' }), hold)).toMatchObject({ step: 'error', during: 'payment' });
  });

  it('las transiciones ignoran eventos que no corresponden al estado', () => {
    expect(reduce({ step: 'empty' }, { type: 'PAY_START' })).toEqual({ step: 'empty' });
    expect(reduce({ step: 'empty' }, { type: 'TIME_UP' })).toEqual({ step: 'empty' });
    expect(reduce({ step: 'holding' }, { type: 'PASSENGERS', ready: true })).toEqual({ step: 'holding' });
  });
});

describe('máquina de la compra: cancelar y salir', () => {
  it('"Cancelar compra" libera el hold, borra todo y devuelve la búsqueda', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    s.flow.setPassengers(PAX, true);
    expect(await s.flow.cancel()).toBe(SELECTION.searchQuery);
    expect(s.api.calls.cancelHold).toEqual(['hold-1']);
    expect(s.api.holds.get('hold-1')?.status).toBe('RELEASED');
    expect(s.selection()).toBeNull();
    expect(s.storage.dump()).toBe('');
  });

  it('liberar un hold ya usado (409) no es un error para el usuario', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    s.api.holds.get('hold-1')!.status = 'CONSUMED';
    await expect(s.flow.cancel()).resolves.toBe(SELECTION.searchQuery);
  });

  it('salir del flujo libera el hold pero conserva selección y pasajeros; al volver aparta otra vez', async () => {
    const s = setup();
    await s.flow.start(signedIn);
    s.flow.setPassengers(PAX, true);
    await s.flow.leave();
    expect(s.api.calls.cancelHold).toEqual(['hold-1']);
    expect(s.selection()?.holdId).toBeUndefined();
    expect(s.flow.passengersDraft()).toEqual(PAX);
    await s.flow.start(signedIn);
    expect(s.api.calls.createHold).toHaveLength(2);
    expect(s.api.calls.createHold[1]).not.toBe(s.api.calls.createHold[0]);
  });
});
