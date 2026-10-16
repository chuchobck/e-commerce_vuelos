import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessTokenProvider } from './authBridge';
import { GraphqlFlightsApi } from './GraphqlFlightsApi';
import { MockFlightsApi } from './mock/MockFlightsApi';
import { RealFlightsApi } from './RealFlightsApi';
import { createFlightsApi } from './select';
import type { FlightsApi } from './FlightsApi';

const GATEWAY = 'https://gw.test';
const CORE = `${GATEWAY}/flights/v1`;
const IDENTITY = `${GATEWAY}/identity/v1`;
const BFF = `${GATEWAY}/graphql`;

const USER = { id: 'u1', email: 'ana@example.test', roles: ['cliente'], scopes: ['flights:read'], createdAt: '2026-10-16T00:00:00.000Z' };
const TOKENS = { access_token: 'acc.tok.en', token_type: 'Bearer', expires_in: 900, refresh_token: 'ref-tok-en', scope: 'flights:read' };
const HOLD = { holdId: 'h1', status: 'HELD', expiresAt: '2026-10-16T01:00:00.000Z', ttlMinutes: 15, lockedPrice: { currency: 'USD', total: '10.00' } };

/** Responde según la ruta; guarda cada llamada (método, URL y cabeceras). */
function stubFetch() {
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  const fetchStub = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ method: init?.method ?? 'GET', url, headers: (init?.headers ?? {}) as Record<string, string> });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/auth/register')) return json(USER, 201);
    if (url.endsWith('/auth/login') || url.endsWith('/auth/refresh')) return json(TOKENS);
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/me')) return json(USER);
    if (url.endsWith('/offers/hold')) return json(HOLD, 201);
    if (url.includes('/seatmap')) return json({ segmentId: 's1', cabins: [] });
    if (url.endsWith('/baggage-options')) return json([]);
    if (url.endsWith('/health')) return json({ status: 'UP' });
    if (url === BFF) return json({ data: { seatMap: { segmentId: 's1', cabins: [] } } });
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', fetchStub);
  return calls;
}

const accountCalls = async (api: FlightsApi) => {
  await api.register({ email: USER.email, password: 'una frase larga de prueba' });
  await api.login({ email: USER.email, password: 'una frase larga de prueba' });
  await api.refresh('ref-tok-en');
  await api.logout('ref-tok-en');
  await api.me();
};

const otherCalls = async (api: FlightsApi) => {
  await api.createHold({ offerId: 'o1', itinerarySelections: [], passengers: { adults: 1, children: 0, infants: 0 } }, 'key-1');
  await api.cancelHold('h1');
  await api.getBaggageOptions('b1');
  await api.cancelBooking('b1', { quoteId: 'q1' }, 'key-2');
};

beforeEach(() => setAccessTokenProvider(() => 'acc.tok.en'));
afterEach(() => {
  setAccessTokenProvider(() => undefined);
  vi.unstubAllGlobals();
});

describe('qué ruta va a qué servicio (modo real: REST)', () => {
  it('la cuenta usa la base de identity DERIVADA de la API: /flights/v1 → /identity/v1', async () => {
    const calls = stubFetch();
    await accountCalls(createFlightsApi(CORE));
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${IDENTITY}/auth/register`,
      `POST ${IDENTITY}/auth/login`,
      `POST ${IDENTITY}/auth/refresh`,
      `POST ${IDENTITY}/auth/logout`,
      `GET ${IDENTITY}/auth/me`,
    ]);
  });

  it('con VITE_IDENTITY_URL explícita, la cuenta usa esa; compra y postventa siguen en la API', async () => {
    const calls = stubFetch();
    const api = createFlightsApi('http://localhost:3000/flights/v1', { identityUrl: 'http://localhost:3001/identity/v1/' });
    await accountCalls(api);
    await otherCalls(api);
    const urls = calls.map((c) => c.url);
    expect(urls.slice(0, 5).every((u) => u.startsWith('http://localhost:3001/identity/v1/auth/'))).toBe(true);
    expect(urls.slice(5).every((u) => u.startsWith('http://localhost:3000/flights/v1/'))).toBe(true);
  });

  it('compra y postventa van a la base de la API, nunca a identity ni a /auth', async () => {
    const calls = stubFetch();
    await otherCalls(createFlightsApi(CORE));
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${CORE}/offers/hold`,
      `DELETE ${CORE}/offers/hold/h1`,
      `GET ${CORE}/bookings/b1/baggage-options`,
      `POST ${CORE}/bookings/b1/cancel`,
    ]);
  });

  it('Bearer solo donde la API lo pide: logout y me llevan token; register, login y refresh, no', async () => {
    const calls = stubFetch();
    await accountCalls(createFlightsApi(CORE));
    expect(calls.map((c) => c.headers.Authorization)).toEqual([undefined, undefined, undefined, 'Bearer acc.tok.en', 'Bearer acc.tok.en']);
  });

  it('las escrituras de compra mantienen su Idempotency-Key y el Bearer en el core', async () => {
    const calls = stubFetch();
    await otherCalls(createFlightsApi(CORE));
    expect(calls[0].headers).toMatchObject({ 'Idempotency-Key': 'key-1', Authorization: 'Bearer acc.tok.en' });
    expect(calls[3].headers).toMatchObject({ 'Idempotency-Key': 'key-2', Authorization: 'Bearer acc.tok.en' });
  });

  it('las lecturas de respaldo (mapa de asientos por REST) van a la API', async () => {
    const calls = stubFetch();
    await createFlightsApi(CORE).getSeatMap('o1', 's1');
    expect(calls[0].url).toBe(`${CORE}/offers/o1/seatmap?segmentId=s1`);
  });

  it('API sin el sufijo /flights/v1 y sin identity explícita: la cuenta queda en la API (login propio del core)', async () => {
    const calls = stubFetch();
    await createFlightsApi('https://core.test/v2').login({ email: USER.email, password: 'una frase larga de prueba' });
    expect(calls[0].url).toBe('https://core.test/v2/auth/login');
  });

  it('el calentamiento despierta la API y también identity (dos /health), o uno solo si comparten base', async () => {
    const calls = stubFetch();
    await (createFlightsApi(CORE) as RealFlightsApi).warmUp();
    expect(calls.map((c) => c.url).sort()).toEqual([`${CORE}/health`, `${IDENTITY}/health`]);
    calls.length = 0;
    await (createFlightsApi('https://core.test/v2') as RealFlightsApi).warmUp();
    expect(calls.map((c) => c.url)).toEqual(['https://core.test/v2/health']);
  });
});

describe('modo GraphQL: las lecturas por el BFF y la cuenta por identity', () => {
  it('el mapa de asientos va a /graphql; la cuenta y la compra no cambian de base', async () => {
    const calls = stubFetch();
    const api = createFlightsApi(CORE, { graphqlUrl: BFF });
    expect(api).toBeInstanceOf(GraphqlFlightsApi);
    await api.getSeatMap('o1', 's1');
    await accountCalls(api);
    await otherCalls(api);
    const urls = calls.map((c) => c.url);
    expect(urls[0]).toBe(BFF);
    expect(urls.slice(1, 6).every((u) => u.startsWith(`${IDENTITY}/auth/`))).toBe(true);
    expect(urls.slice(6).every((u) => u.startsWith(`${CORE}/`))).toBe(true);
  });
});

describe('modo mock: la cuenta también es del mock', () => {
  it('con la API vacía no hay red aunque haya URL de identity ni de GraphQL', async () => {
    const calls = stubFetch();
    const api = createFlightsApi('', { graphqlUrl: BFF, identityUrl: IDENTITY });
    expect(api).toBeInstanceOf(MockFlightsApi);
    await api.register({ email: `nuevo-${Date.now()}@example.test`, password: 'una frase larga de prueba' });
    expect(calls).toEqual([]);
  });
});
