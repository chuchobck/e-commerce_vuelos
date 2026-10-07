/**
 * Integración contra la API real (opcional): `npm run test:api`.
 * URL: API_TEST_URL o, si no está, VITE_API_URL del .env. Sin URL, se omite.
 * Valida las respuestas públicas (búsqueda, mapa de asientos, estado de vuelo y errores) contra los
 * esquemas del contrato (contracts/vuelos-openapi.yaml) con Ajv. No forma parte de `npm run test`.
 */
import fs from 'node:fs';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { loadEnv } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const env = loadEnv('development', process.cwd(), '');
const BASE = (process.env.API_TEST_URL || env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const FINGERPRINT = 'quinde-contract-test';
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const contract = parse(fs.readFileSync('contracts/vuelos-openapi.yaml', 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', components: contract.components });
const schema = (name: string): ValidateFunction => ajv.compile({ $ref: `contract#/components/schemas/${name}` });

function expectValid(name: string, body: unknown) {
  const validate = schema(name);
  const ok = validate(body);
  expect(ok, `${name} no cumple el contrato: ${ajv.errorsText(validate.errors, { separator: '\n' })}`).toBe(true);
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : undefined, ms: Date.now() - started };
}

const search = (itineraries: { origin: string; destination: string; departureDate: string }[], headers = { 'X-Device-Fingerprint': FINGERPRINT }) =>
  call('POST', '/search', { itineraries, passengers: { adults: 1, youths: 0, children: 0, infants: 0 } }, headers);

describe('validador del contrato (sin red)', () => {
  it('rechaza respuestas que no cumplen los esquemas: la validación no es vacía', () => {
    expect(schema('SearchResponse')({ totalOffers: 1, offers: [{ offerId: 'x' }] })).toBe(false);
    expect(schema('FlightStatus')({ flightNumber: 'LA1400', status: 'ON_TIME' })).toBe(false);
    expect(schema('ProblemDetails')({ type: 't', title: 'x', status: 404, code: 'NOT_FOUND' })).toBe(false);
  });
});

describe.skipIf(!BASE)(`API real: ${BASE || '(sin URL: omitida)'}`, () => {
  let coldStartMs = 0;

  beforeAll(async () => {
    // Despierta el servidor (Render puede tardar cerca de un minuto) y mide cuánto tardó.
    const health = await call('GET', '/health');
    coldStartMs = health.ms;
    expect(health.status).toBe(200);
    console.info(`[test:api] ${BASE} · /health respondió en ${coldStartMs} ms`);
  }, 130_000);

  it('POST /search (solo ida) cumple SearchResponse', async () => {
    const res = await search([{ origin: 'UIO', destination: 'GYE', departureDate: day(3) }]);
    expect(res.status).toBe(200);
    expectValid('SearchResponse', res.body);
    expect(res.body.offers.length).toBeGreaterThan(0);
    expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
  });

  it('POST /search (ida y vuelta, con escala) cumple SearchResponse y trae dos itinerarios por oferta', async () => {
    const res = await search([
      { origin: 'UIO', destination: 'GPS', departureDate: day(3) },
      { origin: 'GPS', destination: 'UIO', departureDate: day(6) },
    ]);
    expect(res.status).toBe(200);
    expectValid('SearchResponse', res.body);
    for (const offer of res.body.offers) expect(offer.itineraries).toHaveLength(2);
  });

  it('GET /offers/{offerId}/seatmap cumple SeatMapResponse', async () => {
    const found = await search([{ origin: 'UIO', destination: 'GYE', departureDate: day(4) }]);
    const offer = found.body.offers[0];
    const segment = offer.itineraries[0].segments[0];
    const res = await call('GET', `/offers/${offer.offerId}/seatmap?segmentId=${segment.segmentId}`);
    expect(res.status).toBe(200);
    expectValid('SeatMapResponse', res.body);
    expect(res.body.cabins.length).toBeGreaterThan(0);
  });

  it('GET /flights/{flightNumber}/status cumple FlightStatus', async () => {
    const res = await call('GET', `/flights/LA1400/status?date=${day(2)}`);
    expect(res.status).toBe(200);
    expectValid('FlightStatus', res.body);
  });

  it('un vuelo inexistente es 404 con ProblemDetails', async () => {
    const res = await call('GET', `/flights/LA9999/status?date=${day(2)}`);
    expect(res.status).toBe(404);
    expectValid('ProblemDetails', res.body);
  });

  it('una fecha pasada es 400 con ProblemDetails e invalidParams', async () => {
    const res = await search([{ origin: 'UIO', destination: 'GYE', departureDate: '2026-01-01' }]);
    expect(res.status).toBe(400);
    expectValid('ProblemDetails', res.body);
    expect(res.body.invalidParams[0].name).toBe('itineraries[0].departureDate');
  });

  it('sin X-Device-Fingerprint es 400 (el contrato la exige)', async () => {
    const res = await search([{ origin: 'UIO', destination: 'GYE', departureDate: day(3) }], {} as { 'X-Device-Fingerprint': string });
    expect(res.status).toBe(400);
    expectValid('ProblemDetails', res.body);
  });

  it('fuera de la ventana de la semilla responde 200 sin ofertas (no es un error)', async () => {
    const res = await search([{ origin: 'UIO', destination: 'GYE', departureDate: day(150) }]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalOffers: 0, offers: [] });
  });
});
