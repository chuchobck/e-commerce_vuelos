import { describe, expect, it, vi } from 'vitest';
import searchFixture from './__fixtures__/search-uio-gps-rt.json';
import statusFixture from './__fixtures__/status-la1400.json';
import type { FlightStatusDto, SearchResponseDto } from './contract';
import { ApiError, isApiError } from './errors';
import { GraphqlFlightsApi } from './GraphqlFlightsApi';
import { bffExecute, SEAT_MAP_REST, searchToBff, seatMapToBff, statusToBff } from './graphql/__testing__/bffSimulator';
import type { HttpClient } from './http/client';
import { FINGERPRINT_PATTERN } from './http/deviceFingerprint';
import { createGraphqlClient } from './http/graphqlClient';
import { toSearchRequest } from './mapping';
import { RealFlightsApi } from './RealFlightsApi';
import type { SearchParams } from './types';

const search = searchFixture as SearchResponseDto;
const status = statusFixture as FlightStatusDto;
const URL_BFF = 'http://localhost:4000/graphql';

const PARAMS: SearchParams = {
  origin: 'UIO',
  destination: 'GPS',
  departDate: '2026-10-09',
  returnDate: '2026-10-12',
  passengers: { adults: 2, children: 1, infants: 1 },
  cabin: 'ECONOMY',
};

/** El cliente REST de siempre, con un transporte falso que responde con los datos del core. */
function restSide(body: unknown) {
  const request = vi.fn(async () => body);
  return { api: new RealFlightsApi({ request } as unknown as HttpClient), request };
}

/**
 * El lado GraphQL: el cliente REAL de GraphQL con un `fetch` falso que responde como el BFF (solo
 * los campos que la consulta pide). `full` es la respuesta completa del BFF para el campo raíz.
 */
function graphqlSide(full: Record<string, unknown>) {
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body)) as { query: string; variables?: Record<string, unknown> };
    return new Response(JSON.stringify(bffExecute(query, variables, full)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const http = { request: vi.fn(async () => ({})) } as unknown as HttpClient;
  const api = new GraphqlFlightsApi(http, createGraphqlClient({ url: URL_BFF, fetchImpl: fetchImpl as unknown as typeof fetch, requestId: () => 'req-1' }));
  return { api, fetchImpl, http };
}

const sent = (fetchImpl: ReturnType<typeof graphqlSide>['fetchImpl'], i = 0) => {
  const [url, init] = fetchImpl.mock.calls[i];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as { query: string; variables: Record<string, unknown>; operationName: string } };
};

describe('paridad REST ↔ GraphQL: el resultado de dominio es idéntico', () => {
  it('búsqueda ida y vuelta con escala: mismas ofertas, tarifas, horas locales y centavos', async () => {
    const rest = await restSide(search).api.search(PARAMS);
    const gql = await graphqlSide(searchToBff(search)).api.search(PARAMS);
    expect(gql).toEqual(rest);
    // Por si ambos lados estuvieran vacíos a la vez: el resultado trae lo esperado de la fixture.
    expect(gql.offers[0].itineraries.map((it) => it.stops)).toEqual([1, 1]);
    expect(gql.offers[0].grandTotal).toEqual({ cents: 300986, currency: 'USD' });
    expect(gql.offers[0].itineraries[0].segments[1].layoverMinutes).toBe(65);
  });

  it('búsqueda sin ofertas: lista vacía en ambos', async () => {
    const empty: SearchResponseDto = { totalOffers: 0, offers: [] };
    const rest = await restSide(empty).api.search(PARAMS);
    const gql = await graphqlSide(searchToBff(empty)).api.search(PARAMS);
    expect(gql).toEqual(rest);
    expect(gql.offers).toEqual([]);
  });

  it('mapa de asientos: la misma forma, cabina por cabina', async () => {
    const rest = await restSide(SEAT_MAP_REST).api.getSeatMap('o', 's');
    const gql = await graphqlSide(seatMapToBff(SEAT_MAP_REST)).api.getSeatMap('o', 's');
    expect(gql).toEqual(rest);
    expect(gql.cabins?.[1].rows?.[0].seats?.[1].characteristics).toEqual([]);
  });

  it('estado de vuelo: mismo estado y horas locales de cada aeropuerto', async () => {
    const rest = await restSide(status).api.getFlightStatus('LA1400', '2026-10-09');
    const gql = await graphqlSide(statusToBff(status)).api.getFlightStatus('LA1400', '2026-10-09');
    expect(gql).toEqual(rest);
    expect(gql.departure.scheduled).toBe('2026-10-09T06:00:00-05:00');
  });

  it('estado de vuelo con retraso: estimated y actual convertidos igual', async () => {
    const delayed: FlightStatusDto = {
      ...status,
      status: 'DELAYED',
      departure: { ...status.departure, terminal: 'A', estimatedAt: '2026-10-09T11:40:00.000Z', actualAt: null },
    };
    const rest = await restSide(delayed).api.getFlightStatus('LA1400', '2026-10-09');
    const gql = await graphqlSide(statusToBff(delayed)).api.getFlightStatus('LA1400', '2026-10-09');
    expect(gql).toEqual(rest);
    expect(gql.departure).toMatchObject({ terminal: 'A', estimated: '2026-10-09T06:40:00-05:00', actual: null });
  });
});

describe('lo que viaja al BFF', () => {
  it('buscar es UN solo POST /graphql, con las variables del contrato y la huella en la cabecera', async () => {
    const { api, fetchImpl, http } = graphqlSide(searchToBff(search));
    await api.search(PARAMS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, headers, body } = sent(fetchImpl);
    expect(url).toBe(URL_BFF);
    expect(body.operationName).toBe('SearchFlights');
    expect(body.variables).toEqual({ input: toSearchRequest(PARAMS) });
    expect(Object.keys(headers).sort()).toEqual(['Content-Type', 'X-Device-Fingerprint', 'X-Request-Id']);
    expect(headers['X-Device-Fingerprint']).toMatch(FINGERPRINT_PATTERN);
    expect(body.query).not.toMatch(/seatMap/);
    expect((http.request as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('el mapa de asientos es otro POST aparte, sin huella, con ids como variables', async () => {
    const { api, fetchImpl } = graphqlSide(seatMapToBff(SEAT_MAP_REST));
    await api.getSeatMap('off/1', 'seg-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { headers, body } = sent(fetchImpl);
    expect(body.operationName).toBe('SeatMap');
    expect(body.variables).toEqual({ offerId: 'off/1', segmentId: 'seg-1' });
    expect(Object.keys(headers).sort()).toEqual(['Content-Type', 'X-Request-Id']);
  });

  it('el estado de vuelo es otro POST, sin huella, con la fecha como variable', async () => {
    const { api, fetchImpl } = graphqlSide(statusToBff(status));
    await api.getFlightStatus('LA1400', '2026-10-09');
    const { headers, body } = sent(fetchImpl);
    expect(body.operationName).toBe('FlightStatus');
    expect(body.variables).toEqual({ flightNumber: 'LA1400', date: '2026-10-09' });
    expect(Object.keys(headers).sort()).toEqual(['Content-Type', 'X-Request-Id']);
  });

  it('retry: false de la búsqueda (ofertas del inicio) se respeta: una sola vez', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'x', extensions: { code: 'SERVICE_UNAVAILABLE' } }] }), { status: 200 }));
    const api = new GraphqlFlightsApi({} as HttpClient, createGraphqlClient({ url: URL_BFF, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => undefined }));
    await expect(api.search(PARAMS, { retry: false })).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('la señal de cancelación llega al fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))));
    const api = new GraphqlFlightsApi({} as HttpClient, createGraphqlClient({ url: URL_BFF, fetchImpl: fetchImpl as unknown as typeof fetch }));
    const pending = api.search(PARAMS, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('errores del BFF llegan como los de REST', () => {
  it('NOT_FOUND del estado de vuelo = ApiError 404 (la interfaz muestra su mensaje de siempre)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: null, errors: [{ message: 'Flight ZZ9999 was not found', extensions: { code: 'NOT_FOUND', problemCode: 'FLIGHT_STATUS_NOT_AVAILABLE', status: 404 } }] }), { status: 200 }));
    const api = new GraphqlFlightsApi({} as HttpClient, createGraphqlClient({ url: URL_BFF, fetchImpl: fetchImpl as unknown as typeof fetch }));
    const error = await api.getFlightStatus('ZZ9999', '2026-10-09').catch((e: unknown) => e);
    expect(isApiError(error) && error instanceof ApiError).toBe(true);
    expect(error).toMatchObject({ status: 404 });
  });
});

describe('lo que NO cambia: cuenta, compra y postventa siguen por REST', () => {
  it('login, hold, reserva y postventa usan el cliente REST (con su Bearer e Idempotency-Key) y nunca GraphQL', async () => {
    const { api, fetchImpl, http } = graphqlSide({});
    const request = http.request as ReturnType<typeof vi.fn>;
    request.mockResolvedValue({ access_token: 'a', refresh_token: 'r', expires_in: 900, scope: '' });
    await api.login({ email: 'a@example.test', password: 'x' });
    expect(request).toHaveBeenCalledWith('POST', '/auth/login', expect.anything());
    request.mockResolvedValue({ holdId: 'h', status: 'HELD', expiresAt: 'x', ttlMinutes: 15, lockedPrice: { currency: 'USD', total: '1.00' } });
    await api.createHold({ offerId: 'o', itinerarySelections: [], passengers: { adults: 1, children: 0, infants: 0 } }, 'key-1');
    expect(request).toHaveBeenCalledWith('POST', '/offers/hold', expect.objectContaining({ auth: true, headers: { 'Idempotency-Key': 'key-1' } }));
    request.mockResolvedValue({ bookingId: 'b1', status: 'CHECKED_IN', checkedInPassengers: [] });
    await api.checkIn('b1', 'key-2');
    expect(request).toHaveBeenCalledWith('POST', '/bookings/b1/check-in', expect.objectContaining({ auth: true }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
