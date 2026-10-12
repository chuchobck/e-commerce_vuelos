import { describe, expect, it, vi } from 'vitest';
import { ApiError, type AddBaggageRequest, type BaggageAdded, type PostSaleOutcome } from '@/shared/api';
import { createAttemptKeys } from '@/shared/lib/attemptKeys';
import { baggageScope, overallOf, purchaseBaggage, type BaggageDeps, type BaggageToBuy, type LineResult } from './purchaseBaggage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LINES: BaggageToBuy[] = [
  { passengerId: 'PAX1', itineraryId: 'it1', quantity: 2 },
  { passengerId: 'PAX1', itineraryId: 'it2', quantity: 1 },
];

type Call = { request: AddBaggageRequest; key: string };

function setup(respond: (call: Call, n: number) => Promise<PostSaleOutcome<BaggageAdded>>) {
  const calls: Call[] = [];
  const keys = createAttemptKeys(null);
  const add: BaggageDeps['add'] = vi.fn(async (_id, request, key) => {
    calls.push({ request, key });
    return respond({ request, key }, calls.length - 1);
  });
  return { calls, keys, deps: { add, keys } satisfies BaggageDeps };
}

const done = (call: Call): PostSaleOutcome<BaggageAdded> => ({
  status: 'done',
  data: { passengerId: call.request.passengerId, itineraryId: call.request.itineraryId, totalBaggage: call.request.quantity },
});
const rejected = () => Promise.reject(new ApiError({ status: 422, code: 'PAYMENT_NOT_AUTHORIZED' }));

describe('compra de equipaje: 200/201, 202 y 422', () => {
  it('200/201: cada línea se cobra con su referencia y su Idempotency-Key (UUID), y el total sale de la respuesta', async () => {
    const { deps, calls } = setup(async (call) => done(call));
    const results = await purchaseBaggage('b1', LINES, 'PAY-OK-ABC123', deps);
    expect(results.map((r) => [r.status, r.totalBaggage])).toEqual([['done', 2], ['done', 1]]);
    expect(calls.map((c) => c.request.paymentReference)).toEqual(['PAY-OK-ABC123', 'PAY-OK-ABC1232']);
    expect(calls.every((c) => UUID.test(c.key))).toBe(true);
    expect(calls[0].key).not.toBe(calls[1].key);
  });

  it('202: queda "en proceso" y la clave se conserva, así que reintentar es el mismo intento', async () => {
    const { deps, calls } = setup(async () => ({ status: 'pending' }));
    const first = await purchaseBaggage('b1', LINES, 'PAY-PEND-ABC123', deps);
    expect(first.map((r) => r.status)).toEqual(['pending', 'pending']);
    await purchaseBaggage('b1', LINES, 'PAY-PEND-ABC123', deps);
    expect([calls[2].key, calls[3].key]).toEqual([calls[0].key, calls[1].key]);
    expect(calls[2].request).toEqual(calls[0].request);
  });

  it('422 de pago rechazado: se detiene, no cobra el resto y no pierde la selección (queda sin intentar)', async () => {
    const { deps, calls } = setup(rejected);
    const results = await purchaseBaggage('b1', LINES, 'PAY-REJ-ABC123', deps);
    expect(calls).toHaveLength(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ passengerId: 'PAX1', itineraryId: 'it1', status: 'rejected' });
    expect(overallOf(results, LINES.length)).toBe('rejected');
  });

  it('tras el rechazo, reintentar con OTRO pago manda una clave nueva; con el mismo pago reenvía la misma', async () => {
    const outcomes: ('reject' | 'ok')[] = ['reject', 'reject', 'ok', 'ok'];
    const { deps, calls } = setup(async (call, n) => (outcomes[n] === 'reject' ? rejected() : done(call)));
    await purchaseBaggage('b1', LINES, 'PAY-REJ-ABC123', deps);
    await purchaseBaggage('b1', LINES, 'PAY-REJ-ABC123', deps);
    expect(calls[1].key).toBe(calls[0].key);
    await purchaseBaggage('b1', LINES, 'PAY-OK-XYZ789', deps);
    expect(calls[2].key).not.toBe(calls[0].key);
    expect(calls[2].request.paymentReference).toBe('PAY-OK-XYZ789');
  });

  it('al terminar bien se olvida la clave: comprar lo mismo otra vez es otro intento', async () => {
    const { deps, calls, keys } = setup(async (call) => done(call));
    await purchaseBaggage('b1', [LINES[0]], 'PAY-OK-ABC123', deps);
    await purchaseBaggage('b1', [LINES[0]], 'PAY-OK-ABC123', deps);
    expect(calls[1].key).not.toBe(calls[0].key);
    expect(keys.keyFor(baggageScope('b1', LINES[0]), { x: 1 })).toMatch(UUID);
  });

  it('un error que no es de pago (409 de límite, red) también detiene y queda como "failed" con su error', async () => {
    const limit = new ApiError({ status: 409, code: 'BAGGAGE_LIMIT_EXCEEDED' });
    const { deps } = setup(async (_call, n) => (n === 0 ? done({ request: { ...LINES[0], paymentReference: 'x' }, key: 'k' }) : Promise.reject(limit)));
    const results = await purchaseBaggage('b1', LINES, 'PAY-OK-ABC123', deps);
    expect(results.map((r) => r.status)).toEqual(['done', 'failed']);
    expect(results[1].error).toBe(limit);
    expect(overallOf(results, LINES.length)).toBe('partial');
  });

  it('un 403 (sin permiso) no se interpreta como rechazo de pago', async () => {
    const { deps } = setup(() => Promise.reject(new ApiError({ status: 403 })));
    const results = await purchaseBaggage('b1', LINES, 'PAY-OK-ABC123', deps);
    expect(results[0].status).toBe('failed');
  });
});

describe('resumen de una compra de varias líneas', () => {
  const r = (status: LineResult['status']): LineResult => ({ passengerId: 'P', itineraryId: 'i', status });
  it.each([
    [[r('done'), r('done')], 2, 'done'],
    [[r('done'), r('pending')], 2, 'pending'],
    [[r('pending')], 1, 'pending'],
    [[r('rejected')], 2, 'rejected'],
    [[r('failed')], 1, 'failed'],
    [[r('done'), r('rejected')], 2, 'partial'],
    [[r('done')], 2, 'partial'],
  ] as const)('%j de %i intentadas → %s', (results, attempted, expected) => {
    expect(overallOf(results, attempted)).toBe(expected);
  });
});
