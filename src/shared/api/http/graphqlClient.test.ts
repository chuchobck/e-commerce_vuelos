import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, isAbortError } from '../errors';
import { serverActivity } from './activity';
import { MAX_RETRY_WAIT_S } from './client';
import { createGraphqlClient, newRequestId } from './graphqlClient';

const URL_BFF = 'http://localhost:4000/graphql';
const QUERY = 'query Q($id: ID!) { seatMap(offerId: $id, segmentId: $id) { segmentId } }';
const FINGERPRINT = 'web-abcdefgh12345678';

function ok(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function fail(code: string, extensions: Record<string, unknown> = {}, status = 200, headers: Record<string, string> = {}) {
  const body = { errors: [{ message: 'detalle técnico en inglés', path: ['x'], extensions: { code, requestId: 'rid-1', ...extensions } }], data: null };
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function client(responses: (Response | Error)[], extra: Partial<Parameters<typeof createGraphqlClient>[0]> = {}) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('sin respuesta preparada');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => undefined);
  let n = 0;
  const gql = createGraphqlClient({
    url: URL_BFF,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep,
    requestId: () => `req-${++n}`,
    ...extra,
  });
  return { gql, fetchImpl, sleep };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('se esperaba un error');
}

const init = (fetchImpl: ReturnType<typeof client>['fetchImpl'], i = 0) => (fetchImpl.mock.calls[i] as unknown as [string, RequestInit])[1];

afterEach(() => {
  vi.useRealTimers();
});

describe('cliente GraphQL: la petición', () => {
  it('es un solo POST JSON al endpoint con query, variables tipadas y operationName', async () => {
    const { gql, fetchImpl } = client([ok({ a: 1 })]);
    await expect(gql.request({ query: QUERY, variables: { id: 'x' }, operationName: 'Q' })).resolves.toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(URL_BFF);
    expect(init(fetchImpl).method).toBe('POST');
    expect(JSON.parse(String(init(fetchImpl).body))).toEqual({ query: QUERY, variables: { id: 'x' }, operationName: 'Q' });
  });

  it('envía EXACTAMENTE Content-Type y X-Request-Id (sin huella ni Authorization)', async () => {
    const { gql, fetchImpl } = client([ok({})]);
    await gql.request({ query: QUERY });
    expect(init(fetchImpl).headers).toEqual({ 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' });
  });

  it('con huella (solo la búsqueda) envía exactamente esas tres cabeceras', async () => {
    const { gql, fetchImpl } = client([ok({})]);
    await gql.request({ query: QUERY, headers: { 'X-Device-Fingerprint': FINGERPRINT } });
    expect(init(fetchImpl).headers).toEqual({
      'Content-Type': 'application/json',
      'X-Request-Id': 'req-1',
      'X-Device-Fingerprint': FINGERPRINT,
    });
  });

  it('cada petición lleva un X-Request-Id nuevo (también el reintento)', async () => {
    const { gql, fetchImpl } = client([ok({}), fail('SERVICE_UNAVAILABLE', { retryAfter: 1 }), ok({})]);
    await gql.request({ query: QUERY, variables: { n: 1 } });
    await gql.request({ query: QUERY, variables: { n: 2 } });
    const ids = [0, 1, 2].map((i) => (init(fetchImpl, i).headers as Record<string, string>)['X-Request-Id']);
    expect(new Set(ids).size).toBe(3);
  });

  it('newRequestId da un uuid v4 (con o sin crypto.randomUUID)', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newRequestId()).toMatch(uuid);
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newRequestId()).toMatch(uuid);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('cliente GraphQL: errores', () => {
  it('HTTP 200 con errors es un error (aunque venga data)', async () => {
    const body = { data: { seatMap: null }, errors: [{ message: 'x', extensions: { code: 'NOT_FOUND', problemCode: 'VALIDATION_FAILED' } }] };
    const { gql } = client([new Response(JSON.stringify(body), { status: 200 })]);
    expect(await failure(gql.request({ query: QUERY }))).toMatchObject({ status: 404, code: 'VALIDATION_FAILED' });
  });

  it('HTTP 429 trae Retry-After (cabecera) y no se reintenta', async () => {
    const { gql, fetchImpl } = client([fail('TOO_MANY_REQUESTS', {}, 429, { 'Retry-After': '17' })]);
    expect(await failure(gql.request({ query: QUERY }))).toMatchObject({ status: 429, retryAfter: 17 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un 429 sin cuerpo GraphQL (un proxy) se decide por el estado y su Retry-After', async () => {
    const { gql } = client([new Response('slow down', { status: 429, headers: { 'Retry-After': '9' } })]);
    expect(await failure(gql.request({ query: QUERY }))).toMatchObject({ status: 429, retryAfter: 9 });
  });

  it('una respuesta sin data ni errors es un error de servidor', async () => {
    const { gql } = client([new Response('{}', { status: 200 })]);
    expect(await failure(gql.request({ query: QUERY }))).toMatchObject({ status: 500 });
  });

  it('un cuerpo que no es JSON no revienta: error por el estado HTTP', async () => {
    const { gql } = client([new Response('Bad gateway', { status: 502 })]);
    expect(await failure(gql.request({ query: QUERY }))).toMatchObject({ status: 502 });
  });

  it('red caída = NETWORK; tiempo agotado = TIMEOUT', async () => {
    const net = client([new TypeError('Failed to fetch')]);
    expect(await failure(net.gql.request({ query: QUERY, retry: false }))).toMatchObject({ status: 0, code: 'NETWORK' });

    vi.useFakeTimers();
    const hang = vi.fn((_u: string, o: RequestInit) => new Promise<Response>((_res, rej) => o.signal?.addEventListener('abort', () => rej(new DOMException('abortada', 'AbortError')))));
    const gql = createGraphqlClient({ url: URL_BFF, fetchImpl: hang as unknown as typeof fetch, timeoutMs: 45_000 });
    const pending = failure(gql.request({ query: QUERY, retry: false }));
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await pending).toMatchObject({ status: 0, code: 'TIMEOUT' });
  });

  it('el mensaje técnico nunca llega a lo que la interfaz muestra, y el requestId solo al registro', async () => {
    const log = vi.fn();
    const { gql } = client([fail('NOT_FOUND')], { log });
    const error = await failure(gql.request({ query: QUERY, operationName: 'SeatMap' }));
    expect(error.detail).toBe('detalle técnico en inglés');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('requestId rid-1'), expect.anything());
  });
});

describe('cliente GraphQL: reintento de lecturas', () => {
  it('SERVICE_UNAVAILABLE se reintenta UNA vez esperando retryAfter', async () => {
    const { gql, fetchImpl, sleep } = client([fail('SERVICE_UNAVAILABLE', { retryAfter: 3 }), ok({ ok: 1 })]);
    await expect(gql.request({ query: QUERY })).resolves.toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('la espera tiene un tope de 10 s', async () => {
    const { gql, sleep } = client([fail('SERVICE_UNAVAILABLE', { retryAfter: 120 }), ok({})]);
    await gql.request({ query: QUERY });
    expect(sleep).toHaveBeenCalledWith(MAX_RETRY_WAIT_S * 1000);
  });

  it('sin retryAfter espera 1 s', async () => {
    const { gql, sleep } = client([fail('SERVICE_UNAVAILABLE'), ok({})]);
    await gql.request({ query: QUERY });
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('red caída y GATEWAY_TIMEOUT (tiempo agotado) también se reintentan una vez', async () => {
    const a = client([new TypeError('Failed to fetch'), ok({ ok: 1 })]);
    await expect(a.gql.request({ query: QUERY })).resolves.toEqual({ ok: 1 });
    const b = client([fail('GATEWAY_TIMEOUT', {}, 200), ok({ ok: 2 })]);
    await expect(b.gql.request({ query: QUERY })).resolves.toEqual({ ok: 2 });
  });

  it('si el reintento también falla, se entrega ese error (nunca un tercer intento)', async () => {
    const { gql, fetchImpl } = client([fail('SERVICE_UNAVAILABLE'), fail('SERVICE_UNAVAILABLE'), ok({})]);
    expect(await failure(gql.request({ query: QUERY }))).toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('NOT_FOUND, BAD_USER_INPUT y 429 no se reintentan', async () => {
    for (const [code, status] of [['NOT_FOUND', 200], ['BAD_USER_INPUT', 200], ['TOO_MANY_REQUESTS', 429]] as const) {
      const { gql, fetchImpl } = client([fail(code, {}, status), ok({})]);
      await failure(gql.request({ query: QUERY }));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('retry: false la envía una sola vez', async () => {
    const { gql, fetchImpl } = client([fail('SERVICE_UNAVAILABLE'), ok({})]);
    expect(await failure(gql.request({ query: QUERY, retry: false }))).toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('cliente GraphQL: cancelación', () => {
  it('una señal ya cancelada lanza ABORTED sin reintentar', async () => {
    const controller = new AbortController();
    controller.abort();
    const hang = vi.fn((_u: string, o: RequestInit) => (o.signal?.aborted ? Promise.reject(new DOMException('x', 'AbortError')) : new Promise<Response>(() => undefined)));
    const gql = createGraphqlClient({ url: URL_BFF, fetchImpl: hang as unknown as typeof fetch });
    const error = await failure(gql.request({ query: QUERY, signal: controller.signal }));
    expect(isAbortError(error)).toBe(true);
    expect(hang).toHaveBeenCalledTimes(1);
  });

  it('cancelar a mitad de la petición aborta el fetch y no se reintenta', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_u: string, o: RequestInit) => new Promise<Response>((_res, rej) => o.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))));
    const gql = createGraphqlClient({ url: URL_BFF, fetchImpl: fetchImpl as unknown as typeof fetch });
    const pending = failure(gql.request({ query: QUERY, signal: controller.signal }));
    controller.abort();
    expect(isAbortError(await pending)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cancelar durante la espera del reintento no vuelve a pedir', async () => {
    const controller = new AbortController();
    const { gql, fetchImpl } = client([fail('SERVICE_UNAVAILABLE', { retryAfter: 2 }), ok({})], {
      sleep: async () => controller.abort(),
    });
    expect(isAbortError(await failure(gql.request({ query: QUERY, signal: controller.signal })))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('cliente GraphQL: deduplicación y aviso de lentitud', () => {
  it('dos lecturas idénticas simultáneas (sin señal) hacen una sola petición', async () => {
    const { gql, fetchImpl } = client([ok({ n: 1 })]);
    const [a, b] = await Promise.all([gql.request({ query: QUERY, variables: { id: '1' } }), gql.request({ query: QUERY, variables: { id: '1' } })]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it('variables distintas, con señal o con retry: false no se deduplican', async () => {
    const { gql, fetchImpl } = client([ok({}), ok({}), ok({}), ok({})]);
    const controller = new AbortController();
    await Promise.all([
      gql.request({ query: QUERY, variables: { id: '1' } }),
      gql.request({ query: QUERY, variables: { id: '2' } }),
      gql.request({ query: QUERY, variables: { id: '1' }, signal: controller.signal }),
      gql.request({ query: QUERY, variables: { id: '1' }, retry: false }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('pasados 3 s sin respuesta se marca el "servidor despertando" y se desmarca al terminar', async () => {
    vi.useFakeTimers();
    let release: (r: Response) => void = () => undefined;
    const fetchImpl = vi.fn(() => new Promise<Response>((res) => (release = res)));
    const gql = createGraphqlClient({ url: URL_BFF, fetchImpl: fetchImpl as unknown as typeof fetch });
    const pending = gql.request({ query: QUERY });
    await vi.advanceTimersByTimeAsync(3_100);
    expect(serverActivity.isWaking()).toBe(true);
    release(ok({}));
    await pending;
    expect(serverActivity.isWaking()).toBe(false);
  });
});
