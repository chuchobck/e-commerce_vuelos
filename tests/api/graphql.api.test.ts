/**
 * Integración de las tres lecturas públicas por GraphQL (`npm run test:api`): búsqueda, mapa de asientos y estado de
 * vuelo contra el BFF, normalmente por el gateway (http://localhost:8080/graphql). Solo lee: no crea nada.
 * URL: API_TEST_GRAPHQL_URL o VITE_GRAPHQL_URL; sin ella, se omite. Compara con el REST del core (API_TEST_URL): el
 * resultado de dominio de la búsqueda debe ser el mismo por los dos caminos. Límite: 20 búsquedas por minuto por IP.
 */
import { loadEnv } from 'vite';
import { describe, expect, it } from 'vitest';
import { ApiError, isApiError } from '../../src/shared/api/errors';
import { GraphqlFlightsApi } from '../../src/shared/api/GraphqlFlightsApi';
import { createHttpClient } from '../../src/shared/api/http/client';
import { createGraphqlClient } from '../../src/shared/api/http/graphqlClient';
import { RealFlightsApi } from '../../src/shared/api/RealFlightsApi';
import type { SearchParams } from '../../src/shared/api/types';

const env = loadEnv('development', process.cwd(), '');
const BASE = (process.env.API_TEST_URL || env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const GRAPHQL = (process.env.API_TEST_GRAPHQL_URL || env.VITE_GRAPHQL_URL || '').trim();
const ENABLED = !!BASE && !!GRAPHQL && !/onrender\.com/i.test(BASE);

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const params = (): SearchParams => ({ origin: 'UIO', destination: 'GYE', departDate: day(5), passengers: { adults: 1, children: 0, infants: 0 }, cabin: 'ECONOMY' });

describe.skipIf(!ENABLED)(`lecturas por GraphQL: ${ENABLED ? GRAPHQL : '(omitida: sin VITE_GRAPHQL_URL o API_TEST_GRAPHQL_URL)'}`, () => {
  const http = createHttpClient({ baseUrl: BASE });
  const graphql = new GraphqlFlightsApi(http, createGraphqlClient({ url: GRAPHQL }));
  const rest = new RealFlightsApi(http);

  it('la búsqueda por GraphQL da el mismo resultado de dominio que por REST (salvo los ids de oferta, que cambian en cada búsqueda)', async () => {
    const byGraphql = await graphql.search(params());
    const byRest = await rest.search(params());
    expect(byGraphql.offers.length).toBeGreaterThan(0);
    const shape = (r: typeof byGraphql) =>
      r.offers.map((o) => ({
        airline: o.airline,
        grandTotal: o.grandTotal,
        itineraries: o.itineraries.map((it) => ({
          stops: it.stops,
          durationMinutes: it.durationMinutes,
          segments: it.segments.map((s) => [s.flightNumber, s.origin, s.destination, s.departureTime, s.arrivalTime]),
          fares: it.fares.map((f) => [f.cabin, f.brand, f.total.cents]),
        })),
      }));
    expect(shape(byGraphql)).toEqual(shape(byRest));
  });

  it('el mapa de asientos de una oferta real (otra consulta, a pedido) y el estado del mismo vuelo', async () => {
    const result = await graphql.search(params());
    const offer = result.offers[0];
    const segment = offer.itineraries[0].segments[0];
    const seats = await graphql.getSeatMap(offer.id, segment.id);
    expect(seats.segmentId).toBe(segment.id);
    expect(seats.cabins?.length).toBeGreaterThan(0);
    const status = await graphql.getFlightStatus(segment.flightNumber, params().departDate);
    expect(status).toMatchObject({ flightNumber: segment.flightNumber, date: params().departDate });
  });

  it('un vuelo inexistente llega como ApiError 404 (NOT_FOUND del BFF), igual que por REST', async () => {
    const error = await graphql.getFlightStatus('ZZ9999', params().departDate).catch((e: unknown) => e);
    expect(isApiError(error) && error instanceof ApiError).toBe(true);
    expect(error).toMatchObject({ status: 404 });
    expect(await rest.getFlightStatus('ZZ9999', params().departDate).catch((e: unknown) => e)).toMatchObject({ status: 404 });
  });
});
