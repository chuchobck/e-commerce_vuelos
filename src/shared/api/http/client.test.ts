import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { serverActivity } from './activity';
import { createHttpClient, MAX_RETRY_WAIT_S } from './client';
import { parseRetryAfter } from './problem';

const BASE = 'https://api.test/flights/v1';

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers },
  });
}

function client(responses: (Response | Error)[], extra: Partial<Parameters<typeof createHttpClient>[0]> = {}) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('sin respuesta preparada');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => undefined);
  const http = createHttpClient({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch, sleep, ...extra });
  return { http, fetchImpl, sleep };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('se esperaba un error');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('cliente HTTP', () => {
  it('arma la URL con query, envía JSON con Accept y devuelve el cuerpo', async () => {
    const { http, fetchImpl } = client([json(200, { ok: true })]);
    await expect(http.request('POST', '/search', { body: { a: 1 }, query: { x: 'y' } })).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`${BASE}/search?x=y`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ Accept: 'application/json', 'Content-Type': 'application/json' });
  });

  it('inyecta el token de acceso cuando existe (punto preparado para F3)', async () => {
    const { http, fetchImpl } = client([json(200, {})], { getAccessToken: () => 'tok123' });
    await http.request('GET', '/bookings');
    const init = (fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok123' });
  });

  it('convierte un ProblemDetails en ApiError con código, detalle y errores de campo', async () => {
    const problem = {
      type: 'https://api.booking-hub.com/errors/validation-failed',
      title: 'Bad Request',
      status: 400,
      detail: 'itineraries[0].departureDate: must not be in the past',
      code: 'VALIDATION_FAILED',
      invalidParams: [{ name: 'itineraries[0].departureDate', reason: 'must not be in the past' }],
    };
    const { http } = client([json(400, problem)]);
    const error = await failure(http.request('POST', '/search', { retry: true }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', title: 'Bad Request', detail: problem.detail });
    expect(error.fieldErrors).toEqual([{ field: 'itineraries[0].departureDate', message: 'must not be in the past' }]);
  });

  it('lee Retry-After de un 429 y no reintenta (no es un 503)', async () => {
    const { http, fetchImpl } = client([json(429, { status: 429, title: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' }, { 'Retry-After': '17' })]);
    const error = await failure(http.request('POST', '/search', { retry: true }));
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 17 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('tolera un error sin cuerpo o con cuerpo no JSON', async () => {
    const { http } = client([new Response('Bad gateway', { status: 502 })]);
    expect(await failure(http.request('GET', '/health'))).toMatchObject({ status: 502, code: undefined });
  });

  describe('reintentos', () => {
    it('una lectura se reintenta UNA vez ante 503, esperando Retry-After', async () => {
      const { http, fetchImpl, sleep } = client([json(503, { status: 503 }, { 'Retry-After': '3' }), json(200, { ok: 1 })]);
      await expect(http.request('GET', '/flights/LA1400/status', { retry: true })).resolves.toEqual({ ok: 1 });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(3000);
    });

    it('la espera tiene un tope de 10 s aunque Retry-After pida más', async () => {
      const { http, sleep } = client([json(503, { status: 503 }, { 'Retry-After': '120' }), json(200, {})]);
      await http.request('GET', '/x', { retry: true });
      expect(sleep).toHaveBeenCalledWith(MAX_RETRY_WAIT_S * 1000);
    });

    it('una lectura se reintenta una vez ante red caída, y si vuelve a fallar se rinde', async () => {
      const { http, fetchImpl } = client([new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
      expect(await failure(http.request('GET', '/x', { retry: true }))).toMatchObject({ status: 0, code: 'NETWORK' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('una escritura NUNCA se reintenta sola', async () => {
      const { http, fetchImpl } = client([json(503, { status: 503 }), json(200, {})]);
      expect(await failure(http.request('POST', '/offers/hold', { body: {} }))).toMatchObject({ status: 503 });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('no reintenta errores del cliente (400, 404)', async () => {
      const { http, fetchImpl } = client([json(404, { status: 404, code: 'VALIDATION_FAILED' })]);
      await failure(http.request('GET', '/x', { retry: true }));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe('tiempo agotado', () => {
    const neverAnswers = () =>
      vi.fn(
        (_url: URL, init: RequestInit) =>
          new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      );
    const sleep = async () => undefined;

    it('corta y lo distingue de la red caída', async () => {
      const http = createHttpClient({ baseUrl: BASE, fetchImpl: neverAnswers() as unknown as typeof fetch, timeoutMs: 20, sleep });
      expect(await failure(http.request('POST', '/offers/hold', { body: {} }))).toMatchObject({ status: 0, code: 'TIMEOUT' });
    });

    it('una lectura se reintenta una vez (el arranque en frío de Render supera los 45 s)', async () => {
      let calls = 0;
      const coldThenWarm = vi.fn((url: URL, init: RequestInit) => (++calls === 1 ? neverAnswers()(url, init) : Promise.resolve(json(200, { ok: 1 }))));
      const http = createHttpClient({ baseUrl: BASE, fetchImpl: coldThenWarm as unknown as typeof fetch, timeoutMs: 20, sleep });
      await expect(http.request('GET', '/x', { retry: true })).resolves.toEqual({ ok: 1 });
      expect(calls).toBe(2);
    });

    it('una escritura que agota el tiempo NO se reintenta', async () => {
      const fetchImpl = neverAnswers();
      const http = createHttpClient({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20, sleep });
      await failure(http.request('POST', '/bookings', { body: {} }));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  it('marca "servidor despertando" si la petición tarda más que el umbral, y lo quita al terminar', async () => {
    let answer!: (r: Response) => void;
    const slowFetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    const http = createHttpClient({ baseUrl: BASE, fetchImpl: slowFetch as unknown as typeof fetch, slowAfterMs: 10 });
    const pending = http.request('GET', '/x');
    expect(serverActivity.isWaking()).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(serverActivity.isWaking()).toBe(true);
    answer(json(200, {}));
    await pending;
    expect(serverActivity.isWaking()).toBe(false);
  });

  it('el ping silencioso no activa el aviso', async () => {
    let answer!: (r: Response) => void;
    const slowFetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    const http = createHttpClient({ baseUrl: BASE, fetchImpl: slowFetch as unknown as typeof fetch, slowAfterMs: 5 });
    const pending = http.request('GET', '/health', { silent: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(serverActivity.isWaking()).toBe(false);
    answer(json(200, {}));
    await pending;
  });
});

describe('parseRetryAfter', () => {
  it('acepta segundos y fechas HTTP', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter('Wed, 07 Oct 2026 12:00:45 GMT', now)).toBe(45);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('pronto')).toBeUndefined();
  });
});
